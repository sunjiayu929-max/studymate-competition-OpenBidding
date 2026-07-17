"""给知识库 chunks 批量补语义向量（混合检索的语义分支）。

默认只处理 embedding 为空的 chunk（幂等，可反复跑）；--all 重嵌全部。

用法（必须清代理 env，绕过 Clash 的 SOCKS 注入）：
    cd backend
    env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
        .venv/Scripts/python.exe -m scripts.embed_chunks
    （Windows PowerShell：先 $env:ALL_PROXY=$null; $env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null）
"""
from __future__ import annotations
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, func, text
from app.db import async_session_maker
from app.db.session import engine
from app.db.models import KnowledgeChunk
from app.llm import embed_texts, has_embedding_key


async def _ensure_embedding_column():
    """老库没有 embedding 列时补上（与 main.py lifespan 的迁移幂等等价）。"""
    async with engine.begin() as conn:
        rows = await conn.execute(text("PRAGMA table_info(knowledge_chunks)"))
        cols = {r[1] for r in rows.fetchall()}
        if cols and "embedding" not in cols:
            await conn.execute(text("ALTER TABLE knowledge_chunks ADD COLUMN embedding JSON"))
            print("[migrate] added knowledge_chunks.embedding")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="重嵌全部（默认只补 embedding 为空的）")
    parser.add_argument("--batch", type=int, default=10, help="每次 embedding 请求条数（DashScope v3 上限 10）")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if not has_embedding_key():
        print("[x] 没有配置 embedding key（EMBEDDING_PROVIDER/QWEN_API_KEY），中止。")
        return

    await _ensure_embedding_column()

    async with async_session_maker() as db:
        stmt = select(KnowledgeChunk).order_by(KnowledgeChunk.id)
        if not args.all:
            stmt = stmt.where(KnowledgeChunk.embedding.is_(None))
        rows = (await db.execute(stmt)).scalars().all()
        total = (await db.execute(select(func.count(KnowledgeChunk.id)))).scalar_one()

    if not rows:
        print(f"[OK] 没有待嵌入的 chunk（库内共 {total} 条，均已向量化）。")
        return

    print(f"[*] 待嵌入 {len(rows)} / 全库 {total} 条；batch={args.batch}")
    done = 0
    failed = 0
    for i in range(0, len(rows), args.batch):
        batch = rows[i:i + args.batch]
        try:
            vecs = await embed_texts([r.content for r in batch], batch_size=args.batch)
        except Exception as e:
            failed += len(batch)
            print(f"  [warn] batch @{i} 失败：{str(e)[:100]}")
            continue
        # 回写
        async with async_session_maker() as db:
            for r, v in zip(batch, vecs):
                obj = await db.get(KnowledgeChunk, r.id)
                if obj is not None:
                    obj.embedding = v
            await db.commit()
        done += len(batch)
        print(f"  [.] {done}/{len(rows)} 嵌入并回写（dim={len(vecs[0]) if vecs else '?'}）")

    # 覆盖率
    async with async_session_maker() as db:
        n_vec = (await db.execute(
            select(func.count(KnowledgeChunk.id)).where(KnowledgeChunk.embedding.is_not(None))
        )).scalar_one()
        n_all = (await db.execute(select(func.count(KnowledgeChunk.id)))).scalar_one()
    print(f"\n[OK] 完成：本次成功 {done}，失败 {failed}。全库向量覆盖 {n_vec}/{n_all}。")


if __name__ == "__main__":
    asyncio.run(main())
