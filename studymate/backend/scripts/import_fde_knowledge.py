"""将 FDE 岗位知识切片增量导入 StudyMate 的 RAG 库。

运行示例（安全离线演示库）：
    $env:STUDYMATE_SAFE_OFFLINE = "1"
    $env:DATABASE_URL = "sqlite:///./.runtime/studymate-safe.db"
    python -m scripts.import_fde_knowledge

脚本按 JSON 中稳定的 ``id`` 去重，因此可重复运行，不会清空既有课程或知识库。
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select

from app.db import async_session_maker
from app.db.models import Course, KnowledgeChunk
from app.rag import get_rag_service
from app.rag.source import clean_source_name


DATA_PATH = Path(__file__).resolve().parents[1] / "resources" / "domain_knowledge" / "fde" / "fde_v1.json"


def load_catalog(path: Path = DATA_PATH) -> dict:
    with path.open("r", encoding="utf-8") as file:
        catalog = json.load(file)
    if not catalog.get("course_name") or not isinstance(catalog.get("items"), list):
        raise ValueError(f"FDE 知识文件结构不完整：{path}")
    return catalog


async def import_catalog(path: Path = DATA_PATH) -> dict[str, int]:
    catalog = load_catalog(path)
    async with async_session_maker() as db:
        course = (await db.execute(select(Course).where(Course.name == catalog["course_name"]))).scalar_one_or_none()
        if course is None:
            course = Course(name=catalog["course_name"], description=catalog["course_description"])
            db.add(course)
            await db.flush()

        existing = set((await db.execute(
            select(KnowledgeChunk.chroma_id).where(KnowledgeChunk.course_id == course.id)
        )).scalars().all())
        inserted = 0
        for item in catalog["items"]:
            stable_id = f"fde-v1:{item['id']}"
            if stable_id in existing:
                continue
            db.add(KnowledgeChunk(
                course_id=course.id,
                content=item["content"],
                source=clean_source_name(item["source"]),
                url=item["url"],
                meta={**item.get("meta", {}), "catalog_version": catalog["catalog_version"], "source_notice": catalog["source_notice"]},
                chroma_id=stable_id,
            ))
            inserted += 1
        await db.commit()

    # 该脚本在独立进程运行时，重建本进程索引只用于其后的验证；运行中的 API 服务需重启一次。
    service = get_rag_service()
    service._loaded = False
    await service.ensure_loaded()
    return {"course_id": course.id, "inserted": inserted, "total": len(catalog["items"])}


async def main() -> None:
    result = await import_catalog()
    print(f"FDE 知识库导入完成：课程 ID {result['course_id']}，本次新增 {result['inserted']} 条，目录共 {result['total']} 条。")
    hits = await get_rag_service().search("FDE 如何进行验收和部署", k=3, course_id=result["course_id"])
    for index, hit in enumerate(hits, start=1):
        print(f"[{index}] {hit['source']} | {hit['content'][:54]}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    asyncio.run(main())
