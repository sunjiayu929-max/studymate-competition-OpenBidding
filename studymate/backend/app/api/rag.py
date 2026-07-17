"""RAG API：
- GET  /api/rag/stats           当前索引大小
- POST /api/rag/ingest          导入 chunks
- GET  /api/rag/search?q=&k=    检索 + 返回带 source/page/url
- DELETE /api/rag/all           清空（debug）
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import Course, KnowledgeChunk
from app.rag import get_rag_service
from app.rag.source import clean_source_name

router = APIRouter(prefix="/rag", tags=["rag"])


class IngestItem(BaseModel):
    content: str = Field(..., min_length=1)
    source: str = "unknown"
    page: int | None = None
    url: str | None = None
    meta: dict = Field(default_factory=dict)


class IngestRequest(BaseModel):
    course: str = "机器学习"
    items: list[IngestItem]


@router.get("/stats")
async def stats(course_id: int | None = Query(None)):
    svc = get_rag_service()
    return await svc.stats(course_id=course_id)


@router.post("/ingest")
async def ingest(req: IngestRequest):
    if not req.items:
        raise HTTPException(400, "items 为空")
    svc = get_rag_service()
    return await svc.ingest(req.course, [i.model_dump() for i in req.items])


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1),
    k: int = Query(5, ge=1, le=20),
    course_id: int | None = Query(None),
):
    svc = get_rag_service()
    bundle = await svc.search_with_meta(q, k, course_id=course_id)
    results = bundle["results"]
    return {
        "query": q,
        "k": k,
        "course_id": course_id,
        "count": len(results),
        "results": results,
        "score_meta": {
            "method": "rrf",
            "mode": bundle["mode"],
            "active_branches": bundle["active_branches"],
            "label": "相对匹配度",
            "note": "由 BM25 词法排序与向量语义排序融合后归一化，仅用于本次结果比较，不代表答案正确概率。",
        },
    }


def _external_source_url(url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith(("https://", "http://")):
        return url
    if url.startswith("doi://"):
        return f"https://doi.org/{url.removeprefix('doi://')}"
    return None


def _source_context_item(row: KnowledgeChunk, current_id: int) -> dict:
    return {
        "chunk_id": str(row.id),
        "content": row.content,
        "page": row.page,
        "meta": row.meta or {},
        "is_current": row.id == current_id,
    }


@router.get("/chunks/{chunk_id}")
async def get_source_chunk(chunk_id: int, db: AsyncSession = Depends(get_db)):
    """返回命中片段及同一课程资料的相邻上下文，供“查看原文”页定位。"""
    row = await db.get(KnowledgeChunk, chunk_id)
    if row is None:
        raise HTTPException(status_code=404, detail="原文片段不存在")

    course = await db.get(Course, row.course_id)
    before = (
        await db.scalars(
            select(KnowledgeChunk)
            .where(
                KnowledgeChunk.course_id == row.course_id,
                KnowledgeChunk.source == row.source,
                KnowledgeChunk.id < row.id,
            )
            .order_by(KnowledgeChunk.id.desc())
            .limit(2)
        )
    ).all()
    after = (
        await db.scalars(
            select(KnowledgeChunk)
            .where(
                KnowledgeChunk.course_id == row.course_id,
                KnowledgeChunk.source == row.source,
                KnowledgeChunk.id > row.id,
            )
            .order_by(KnowledgeChunk.id.asc())
            .limit(2)
        )
    ).all()
    context_rows = [*reversed(before), row, *after]
    return {
        "chunk_id": str(row.id),
        "course_id": row.course_id,
        "course_name": course.name if course else "课程资料",
        "source": clean_source_name(row.source),
        "page": row.page,
        "url": row.url,
        "external_url": _external_source_url(row.url),
        "meta": row.meta or {},
        "context": [_source_context_item(item, row.id) for item in context_rows],
    }


@router.delete("/all")
async def clear_all():
    svc = get_rag_service()
    return await svc.clear_all()
