from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import safe_offline_enabled, settings
from app.db import get_db
from app.db.models import Course, KnowledgeChunk, UserKnowledgeBase, UserKnowledgeChunk, UserKnowledgeDocument
from app.deps import require_admin
from app.llm import has_llm_key, get_llm_client

router = APIRouter(tags=["health"])


@router.get("/ping")
async def ping():
    client = get_llm_client() if has_llm_key() else None
    return {
        "status": "ok",
        "service": "studymate-backend",
        "llm_provider": settings.LLM_PROVIDER,
        "llm_configured": has_llm_key(),
        "llm_model": client.model if client else None,
        "safe_offline": safe_offline_enabled(),
    }


@router.get("/admin/data-health")
async def data_health(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    courses = await db.scalar(select(func.count()).select_from(Course)) or 0
    chunks = await db.scalar(select(func.count()).select_from(KnowledgeChunk)) or 0
    vectors = await db.scalar(
        select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.embedding.is_not(None))
    ) or 0
    private_libraries = await db.scalar(select(func.count()).select_from(UserKnowledgeBase)) or 0
    private_chunks = await db.scalar(select(func.count()).select_from(UserKnowledgeChunk)) or 0
    task_rows = (
        await db.execute(
            select(UserKnowledgeDocument.status, func.count(UserKnowledgeDocument.id))
            .group_by(UserKnowledgeDocument.status)
        )
    ).all()
    migrations = (
        await db.execute(
            text(
                "SELECT version, description, applied_at "
                "FROM system_migrations ORDER BY applied_at DESC, version DESC LIMIT 12"
            )
        )
    ).mappings().all()
    return {
        "courses": courses,
        "knowledge_chunks": chunks,
        "knowledge_vectors": vectors,
        "private_libraries": private_libraries,
        "private_chunks": private_chunks,
        "private_tasks": {str(row[0]): row[1] for row in task_rows},
        "ocr": {
            "mode": "unconfigured" if safe_offline_enabled() else settings.PRIVATE_KNOWLEDGE_OCR_MODE,
            "available": (
                not safe_offline_enabled()
                and settings.PRIVATE_KNOWLEDGE_OCR_MODE != "unconfigured"
            ),
            "note": "扫描 PDF OCR 为可插拔路径；未配置时任务明确失败并允许保留原文件重试。",
        },
        "external_queue": {
            "available": False,
            "mode": "in_process",
            "note": "私有知识任务当前使用进程内 BackgroundTasks，未接入外部队列。",
        },
        "safe_offline": safe_offline_enabled(),
        "migrations": [dict(row) for row in migrations],
    }
