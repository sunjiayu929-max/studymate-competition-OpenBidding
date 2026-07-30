from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import knowledge
from app.api.knowledge import (
    KnowledgeBaseCreate,
    create_library,
    process_document_task,
    retry_document,
)
from app.api.ppt import OutlineRequest, generate_outline
from app.api.health import data_health
from app.core.config import settings
from app.db import models  # noqa: F401
from app.db.models import User, UserKnowledgeChunk, UserKnowledgeDocument
from app.db.session import Base
from app.main import _ensure_columns


class Phase2HardeningTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="studymate-phase2-")
        db_path = Path(self.temp_dir.name) / "phase2.db"
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await _ensure_columns(connection)
        self.old_storage_dir = settings.PRIVATE_KNOWLEDGE_DIR
        settings.PRIVATE_KNOWLEDGE_DIR = str(Path(self.temp_dir.name) / "private")
        self.old_session_maker = knowledge.async_session_maker
        knowledge.async_session_maker = self.sessions

    async def asyncTearDown(self):
        knowledge.async_session_maker = self.old_session_maker
        settings.PRIVATE_KNOWLEDGE_DIR = self.old_storage_dir
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def _user_and_library(self):
        async with self.sessions() as db:
            user = User(name="phase2", email="phase2@example.test")
            db.add(user)
            await db.commit()
            await db.refresh(user)
            library = await create_library(KnowledgeBaseCreate(name="后台任务库"), user, db)
            return user, library

    async def test_background_document_persists_progress_and_source_page(self):
        user, library = await self._user_and_library()
        raw = "# 梯度下降\n\n沿损失函数负梯度方向更新参数。".encode("utf-8")
        source = knowledge._source_path(user_id=user.id, document_id=1, filename="lesson.md")
        source.write_bytes(raw)
        async with self.sessions() as db:
            document = UserKnowledgeDocument(
                id=1,
                user_id=user.id,
                knowledge_base_id=library["id"],
                filename="lesson.md",
                media_type="text/markdown",
                size=len(raw),
                status="queued",
                source_path=str(source),
                checksum_sha256=hashlib.sha256(raw).hexdigest(),
            )
            db.add(document)
            await db.commit()

        with patch.object(knowledge, "has_embedding_key", return_value=False):
            await process_document_task(1, user.id)

        async with self.sessions() as db:
            document = await db.get(UserKnowledgeDocument, 1)
            chunks = (
                await db.scalars(select(UserKnowledgeChunk).where(UserKnowledgeChunk.document_id == 1))
            ).all()
            self.assertEqual(document.status, "ready_keyword")
            self.assertEqual(document.parse_progress, 100)
            self.assertEqual(document.ocr_status, "not_needed")
            self.assertIsNotNone(document.finished_at)
            self.assertEqual(len(chunks), 1)
            self.assertIn("负梯度方向", chunks[0].content)

    async def test_retry_is_owned_and_keeps_original_file(self):
        user, library = await self._user_and_library()
        source = knowledge._source_path(user_id=user.id, document_id=1, filename="broken.txt")
        source.write_text("可安全重试", encoding="utf-8")
        async with self.sessions() as db:
            document = UserKnowledgeDocument(
                id=1,
                user_id=user.id,
                knowledge_base_id=library["id"],
                filename="broken.txt",
                media_type="text/plain",
                size=12,
                status="error",
                source_path=str(source),
                checksum_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            )
            db.add(document)
            await db.commit()
            tasks = BackgroundTasks()
            payload = await retry_document(1, tasks, user, db)
            self.assertEqual(payload["status"], "queued")
            self.assertEqual(payload["retry_count"], 1)
            self.assertTrue(source.exists())

            other = User(name="other", email="other-phase2@example.test")
            db.add(other)
            await db.commit()
            await db.refresh(other)
            with self.assertRaises(HTTPException) as raised:
                await retry_document(1, BackgroundTasks(), other, db)
            self.assertEqual(raised.exception.status_code, 404)

    async def test_ppt_requires_explicit_fallback_and_builds_visual_story(self):
        user, _library = await self._user_and_library()
        async with self.sessions() as db:
            request = OutlineRequest(
                topic="梯度下降",
                provider="qwen",
                page_count=9,
                allow_local_fallback=False,
            )
            with patch("app.api.ppt.has_llm_key", return_value=False):
                with self.assertRaises(HTTPException) as raised:
                    await generate_outline(request, user, db)
                self.assertEqual(raised.exception.status_code, 503)

                response = await generate_outline(
                    request.model_copy(update={"allow_local_fallback": True}),
                    user,
                    db,
                )
            self.assertEqual(response["mode"], "local_fallback")
            self.assertEqual(len(response["slides"]), 9)
            self.assertEqual(response["slides"][0]["layout"], "cover")
            self.assertEqual(response["slides"][-1]["layout"], "summary")
            self.assertGreaterEqual(len({slide["layout"] for slide in response["slides"]}), 5)
            self.assertTrue(any(slide["layout"] == "process" and slide["blocks"] for slide in response["slides"]))
            self.assertFalse(any(slide["chart_data"] for slide in response["slides"]))
            self.assertIn("明确选择", response["message"])

    async def test_ppt_sends_an_explicit_user_turn_to_selected_model(self):
        user, _library = await self._user_and_library()
        slides = [
            {
                "title": f"第 {index + 1} 页",
                "layout": "cover" if index == 0 else "summary" if index == 6 else "content",
            }
            for index in range(7)
        ]
        client = MagicMock()
        client.chat_structured = AsyncMock(return_value=json.dumps({"slides": slides}, ensure_ascii=False))
        request = OutlineRequest(
            topic="梯度下降",
            provider="mimo",
            page_count=7,
        )
        async with self.sessions() as db:
            with (
                patch("app.api.ppt._collect_context", new=AsyncMock(return_value=[])),
                patch("app.api.ppt.has_llm_key", return_value=True),
                patch("app.api.ppt.get_llm_client", return_value=client) as get_client,
            ):
                response = await generate_outline(request, user, db)

        get_client.assert_called_once_with("mimo")
        messages = client.chat_structured.await_args.args[0]
        self.assertEqual([message["role"] for message in messages], ["system", "user"])
        self.assertIn("梯度下降", messages[1]["content"])
        self.assertIn("slides.length === 7", messages[1]["content"])
        self.assertEqual(response["provider"], "mimo")
        self.assertEqual(len(response["slides"]), 7)

    async def test_ppt_uses_selected_model_to_fill_missing_pages(self):
        user, _library = await self._user_and_library()
        initial = [
            {
                "title": f"已有第 {index + 1} 页",
                "layout": "cover" if index == 0 else "summary" if index == 7 else "content",
            }
            for index in range(8)
        ]
        additions = [
            {"title": "补充推导", "layout": "process"},
            {"title": "补充案例", "layout": "case"},
        ]
        client = MagicMock()
        client.chat_structured = AsyncMock(side_effect=[
            json.dumps({"slides": initial}, ensure_ascii=False),
            json.dumps({"slides": additions}, ensure_ascii=False),
        ])
        request = OutlineRequest(
            topic="梯度下降",
            provider="qwen",
            page_count=10,
        )
        async with self.sessions() as db:
            with (
                patch("app.api.ppt._collect_context", new=AsyncMock(return_value=[])),
                patch("app.api.ppt.has_llm_key", return_value=True),
                patch("app.api.ppt.get_llm_client", return_value=client) as get_client,
            ):
                response = await generate_outline(request, user, db)

        get_client.assert_called_once_with("qwen")
        self.assertEqual(client.chat_structured.await_count, 2)
        supplement_messages = client.chat_structured.await_args_list[1].args[0]
        self.assertIn("恰好 2 个中间页面", supplement_messages[1]["content"])
        self.assertEqual(len(response["slides"]), 10)
        self.assertEqual(response["slides"][0]["layout"], "cover")
        self.assertEqual(response["slides"][-1]["layout"], "summary")
        self.assertIn("补充推导", [slide["title"] for slide in response["slides"]])

    async def test_admin_data_health_is_read_only_and_lists_migrations(self):
        user, _library = await self._user_and_library()
        async with self.sessions() as db:
            payload = await data_health(user, db)
        self.assertEqual(payload["courses"], 0)
        self.assertEqual(payload["private_libraries"], 1)
        self.assertFalse(payload["ocr"]["available"])
        versions = {item["version"] for item in payload["migrations"]}
        self.assertIn("2026.07.29-private-knowledge-jobs", versions)


if __name__ == "__main__":
    unittest.main()
