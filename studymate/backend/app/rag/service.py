"""
RAG 服务：把检索引擎和 SQLite 持久化粘起来。
- ingest 时同时写 KnowledgeChunk 表（持久化）+ 入内存索引（BM25 词法 + 向量语义）
- 启动时从 SQLite 拉所有 chunk 重建索引
- search 走**混合检索**：BM25（词法）+ 向量余弦（语义），RRF 排名融合。
  没配 embedding key / 向量缺失 / embedding 调用失败时，自动退化为纯 BM25（demo 永不崩）。
"""
from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_maker
from app.db.models import KnowledgeChunk, Course
from app.llm import embed_query, embed_texts, has_embedding_key
from app.rag.engine import BM25Engine, VectorIndex, Chunk, SearchHit
from app.rag.source import clean_source_name

# RRF 融合常数（标准取 60）；候选池大小（每路各取多少条进融合）
_RRF_C = 60
_POOL = 20


def relative_relevance_percent(score: float, active_branches: int) -> int:
    """Normalize an RRF score against the theoretical rank-1 maximum."""
    theoretical_max = active_branches / (_RRF_C + 1) if active_branches > 0 else 0.0
    if theoretical_max <= 0:
        return 0
    return round(max(0.0, min(100.0, (score / theoretical_max) * 100)))


class RAGService:
    def __init__(self):
        self.engine = BM25Engine()
        self.vindex = VectorIndex()
        self._loaded = False

    async def ensure_loaded(self):
        if self._loaded:
            return
        async with async_session_maker() as db:
            q = await db.execute(select(KnowledgeChunk))
            rows = q.scalars().all()
            chunks = [self._row_to_chunk(r) for r in rows]
        self.engine.clear()
        self.vindex.clear()
        if chunks:
            self.engine.add(chunks)
            self.vindex.add(chunks)  # 只收录带 embedding 的
        self._loaded = True

    async def ingest(self, course_name: str, items: list[dict]) -> dict:
        """
        items: [{content, source, page?, url?, meta?}, ...]
        入库同时尽力向量化（embedding 失败不阻塞入库，留 NULL 由 embed_chunks 脚本补）。
        返回 {ingested: N, course_id: X, total, vectorized}
        """
        # 尽力向量化（best-effort）
        vectors: list[list[float] | None] = [None] * len(items)
        if has_embedding_key() and items:
            try:
                vectors = await embed_texts([it["content"] for it in items])
            except Exception as e:
                print(f"  [warn] embed on ingest failed: {e}; chunks 留空向量，可后续跑 embed_chunks 补")
                vectors = [None] * len(items)

        async with async_session_maker() as db:
            # 找/建 course
            q = await db.execute(select(Course).where(Course.name == course_name))
            course = q.scalar_one_or_none()
            if not course:
                course = Course(name=course_name, description=f"自动建立的课程：{course_name}")
                db.add(course)
                await db.commit()
                await db.refresh(course)

            rows = []
            for it, vec in zip(items, vectors):
                row = KnowledgeChunk(
                    course_id=course.id,
                    content=it["content"],
                    source=clean_source_name(it.get("source", "unknown")),
                    page=it.get("page"),
                    url=it.get("url"),
                    meta=it.get("meta", {}) or {},
                    embedding=vec,
                )
                db.add(row)
                rows.append(row)
            await db.commit()
            for r in rows:
                await db.refresh(r)

            chunks = [self._row_to_chunk(r) for r in rows]

        self.engine.add(chunks)
        self.vindex.add(chunks)
        self._loaded = True
        vectorized = sum(1 for v in vectors if v)
        return {
            "ingested": len(chunks),
            "course_id": course.id,
            "total": self.engine.count(),
            "vectorized": vectorized,
        }

    async def search_with_meta(self, query: str, k: int = 5, course_id: int | None = None) -> dict:
        await self.ensure_loaded()

        # 词法分支
        bm_hits = self.engine.search(query, k=_POOL, course_id=course_id)

        # 语义分支（尽力；失败/无 key/无向量 → 跳过，退化为纯 BM25）
        vec_hits: list[SearchHit] = []
        if self.vindex.count() and has_embedding_key():
            try:
                qvec = await embed_query(query)
                if qvec:
                    vec_hits = self.vindex.search(qvec, k=_POOL, course_id=course_id)
            except Exception as e:
                print(f"  [warn] semantic branch failed: {e}; 退化为纯 BM25")

        active_lists = [hits for hits in (bm_hits, vec_hits) if hits]
        fused = self._rrf_fuse(active_lists, k=k)
        active_branches = len(active_lists)
        mode = "hybrid" if bm_hits and vec_hits else "semantic" if vec_hits else "lexical"
        results = [
            {
                "chunk_id": h.chunk.chunk_id,
                "content": h.chunk.content,
                "source": h.chunk.source,
                "page": h.chunk.page,
                "url": h.chunk.url,
                "meta": h.chunk.meta,
                "course_id": h.chunk.course_id,
                "score": round(h.score, 6),
                "rank": rank,
                "relevance_percent": relative_relevance_percent(h.score, active_branches),
                "retrieval_mode": mode,
            }
            for rank, h in enumerate(fused, 1)
        ]
        return {
            "results": results,
            "mode": mode,
            "active_branches": active_branches,
        }

    async def search(self, query: str, k: int = 5, course_id: int | None = None) -> list[dict]:
        bundle = await self.search_with_meta(query, k, course_id=course_id)
        return bundle["results"]

    @staticmethod
    def _rrf_fuse(rank_lists: list[list[SearchHit]], k: int) -> list[SearchHit]:
        """Reciprocal Rank Fusion：score(d) = Σ_list 1/(C + rank_list(d))。
        免去 BM25 分数与余弦相似度量纲对齐；某一路为空时等价于另一路原排名。
        """
        scores: dict[str, float] = {}
        chunk_of: dict[str, Chunk] = {}
        for lst in rank_lists:
            for rank, h in enumerate(lst, 1):
                cid = h.chunk.chunk_id
                scores[cid] = scores.get(cid, 0.0) + 1.0 / (_RRF_C + rank)
                chunk_of[cid] = h.chunk
        ranked = sorted(scores.keys(), key=lambda c: scores[c], reverse=True)[:k]
        return [SearchHit(chunk=chunk_of[c], score=scores[c]) for c in ranked]

    async def stats(self, course_id: int | None = None) -> dict:
        """全库或单课统计。"""
        await self.ensure_loaded()
        if course_id is not None:
            n = sum(1 for c in self.engine._chunks if c.course_id == course_id)
            return {"count": n, "course_id": course_id, "engine": "BM25+Vector"}
        from collections import Counter
        per = Counter(c.course_id for c in self.engine._chunks)
        return {
            "count": self.engine.count(),
            "vectorized": self.vindex.count(),
            "engine": "BM25+Vector (RRF hybrid)",
            "per_course": {str(k or "null"): v for k, v in per.items()},
        }

    async def clear_all(self) -> dict:
        async with async_session_maker() as db:
            await db.execute(KnowledgeChunk.__table__.delete())
            await db.commit()
        self.engine.clear()
        self.vindex.clear()
        return {"ok": True}

    @staticmethod
    def _row_to_chunk(row: KnowledgeChunk) -> Chunk:
        return Chunk(
            chunk_id=str(row.id),
            content=row.content,
            source=clean_source_name(row.source),
            page=row.page,
            url=row.url,
            meta=row.meta or {},
            course_id=row.course_id,
            embedding=row.embedding or None,
        )


_service: RAGService | None = None


def get_rag_service() -> RAGService:
    global _service
    if _service is None:
        _service = RAGService()
    return _service
