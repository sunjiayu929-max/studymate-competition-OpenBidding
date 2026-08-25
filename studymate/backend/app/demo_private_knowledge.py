"""Provision the review-ready FDE private-library example for each user."""
from __future__ import annotations

import hashlib
from datetime import datetime
from io import BytesIO
from pathlib import Path

from sqlalchemy import delete, select

from app.core.config import settings
from app.db.models import User, UserKnowledgeBase, UserKnowledgeChunk, UserKnowledgeDocument
from app.db.session import async_session_maker


DEMO_LIBRARY_NAME = "FDE 行业观察与实践"
_PREVIOUS_DEMO_LIBRARY_NAME = "FDE 行业观察与实践（示例）"
DEMO_FILENAME = "FDE模式行业观察与实践.pdf"
LEGACY_LIBRARY_NAME = "岗位转岗公开资料库"
_SOURCE_PDF = Path(__file__).resolve().parents[1] / "resources" / "demo_private_knowledge" / "fde-industry-observation-practice.pdf"


def _storage_root() -> Path:
    root = Path(settings.PRIVATE_KNOWLEDGE_DIR).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _extract_chunks(raw: bytes) -> tuple[int, list[tuple[int, str]]]:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(raw))
    chunks: list[tuple[int, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        for start in range(0, len(text), 1100):
            chunk = text[start : start + 1100].strip()
            if chunk:
                chunks.append((index, chunk))
    if not chunks:
        raise RuntimeError("FDE 示例 PDF 未提取到可检索文本")
    return len(reader.pages), chunks


async def ensure_demo_private_library(user_id: int) -> None:
    """Idempotently give one user a searchable FDE example without sharing data."""
    if not _SOURCE_PDF.is_file():
        raise RuntimeError(f"缺少内置 FDE 示例资料：{_SOURCE_PDF}")

    raw = _SOURCE_PDF.read_bytes()
    checksum = hashlib.sha256(raw).hexdigest()
    page_count, chunks = _extract_chunks(raw)
    destination = _storage_root() / str(user_id) / "demo-fde-industry-observation-practice.pdf"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.is_file() or hashlib.sha256(destination.read_bytes()).hexdigest() != checksum:
        destination.write_bytes(raw)

    async with async_session_maker() as db:
        legacy = await db.scalar(
            select(UserKnowledgeBase).where(
                UserKnowledgeBase.user_id == user_id,
                UserKnowledgeBase.name == LEGACY_LIBRARY_NAME,
            )
        )
        if legacy is not None:
            legacy_documents = list(await db.scalars(
                select(UserKnowledgeDocument).where(UserKnowledgeDocument.knowledge_base_id == legacy.id)
            ))
            if not legacy_documents:
                await db.delete(legacy)

        library = await db.scalar(
            select(UserKnowledgeBase).where(
                UserKnowledgeBase.user_id == user_id,
                UserKnowledgeBase.name == DEMO_LIBRARY_NAME,
            )
        )
        if library is None:
            library = await db.scalar(
                select(UserKnowledgeBase).where(
                    UserKnowledgeBase.user_id == user_id,
                    UserKnowledgeBase.name == _PREVIOUS_DEMO_LIBRARY_NAME,
                )
            )
            if library is not None:
                library.name = DEMO_LIBRARY_NAME
        if library is None:
            library = UserKnowledgeBase(
                user_id=user_id,
                name=DEMO_LIBRARY_NAME,
                description="内置 FDE 样例：行业观察、客户现场交付与实践方法。",
            )
            db.add(library)
            await db.flush()

        document = await db.scalar(
            select(UserKnowledgeDocument).where(
                UserKnowledgeDocument.user_id == user_id,
                UserKnowledgeDocument.knowledge_base_id == library.id,
                UserKnowledgeDocument.filename == DEMO_FILENAME,
            )
        )
        if document is not None and document.checksum_sha256 == checksum:
            chunk_exists = await db.scalar(
                select(UserKnowledgeChunk.id).where(UserKnowledgeChunk.document_id == document.id).limit(1)
            )
            if chunk_exists is not None:
                document.status = "ready_keyword"
                document.parse_progress = 100
                document.vector_progress = 100
                document.error_detail = "内置评审资料已完成关键词索引，可直接检索"
                await db.commit()
                return

        if document is None:
            document = UserKnowledgeDocument(
                user_id=user_id,
                knowledge_base_id=library.id,
                filename=DEMO_FILENAME,
                media_type="application/pdf",
                size=len(raw),
            )
            db.add(document)
            await db.flush()
        else:
            await db.execute(delete(UserKnowledgeChunk).where(UserKnowledgeChunk.document_id == document.id))

        now = datetime.utcnow()
        document.source_path = str(destination)
        document.checksum_sha256 = checksum
        document.status = "ready_keyword"
        document.parse_progress = 100
        document.vector_progress = 100
        document.page_count = page_count
        document.ocr_status = "not_needed"
        document.error_detail = "内置评审样例已就绪，可直接进行关键词检索"
        document.started_at = now
        document.finished_at = now
        for page, content in chunks:
            db.add(UserKnowledgeChunk(
                user_id=user_id,
                knowledge_base_id=library.id,
                document_id=document.id,
                content=content,
                page=page,
                embedding=None,
            ))
        await db.commit()


async def ensure_demo_private_libraries() -> None:
    async with async_session_maker() as db:
        user_ids = list((await db.scalars(select(User.id))).all())
    for user_id in user_ids:
        await ensure_demo_private_library(user_id)
