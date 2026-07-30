from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import bili, knowledge, ocr, run, voice
from app.api.bili import VideosRequest
from app.api.run import RunRequest
from app.api.voice import TtsRequest
from app.core.config import ExternalAccessDisabledError, settings
from app.core.mailer import send_verification_code
from app.db import models  # noqa: F401
from app.db.models import User, UserKnowledgeBase, UserKnowledgeChunk, UserKnowledgeDocument
from app.db.session import Base
from app.integrations import reading_resolver, rencaiya
from app.llm.client import get_llm_client, has_llm_key
from app.llm.embeddings import embed_texts, has_embedding_key
from scripts import smoke_llm, smoke_ocr


class SafeOfflineSettingsTests(unittest.TestCase):
    def test_process_environment_flag_skips_dotenv_and_clears_all_providers(self):
        backend_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix="studymate-safe-config-") as temp:
            temp_path = Path(temp)
            # 只写固定假值；不得引用开发机真实 .env。
            (temp_path / ".env").write_text(
                "\n".join(
                    (
                        "DEEPSEEK_API_KEY=fixture-deepseek",
                        "SPARK_API_KEY=fixture-spark",
                        "MIMO_API_KEY=fixture-mimo",
                        "QWEN_API_KEY=fixture-qwen",
                        "XFYUN_APP_ID=fixture-app",
                        "XFYUN_API_KEY=fixture-xfyun",
                        "XFYUN_API_SECRET=fixture-secret",
                        "COSYVOICE_API_KEYS=fixture-cosy",
                        "SMTP_USERNAME=fixture-user",
                        "SMTP_PASSWORD=fixture-password",
                        "PISTON_URL=http://fixture.invalid",
                        "PRIVATE_KNOWLEDGE_OCR_MODE=fixture-ocr",
                        "CORS_ORIGINS=https://dotenv.invalid",
                    )
                ),
                encoding="utf-8",
            )
            code = """
import json
import socket
from app.core.config import settings
from app.llm.client import has_llm_key
from app.llm.embeddings import has_embedding_key
from app.api.voice import _tts_configured, _xfyun_configured
blocked = False
try:
    socket.getaddrinfo("example.invalid", 443)
except OSError:
    blocked = True
print(json.dumps({
    "safe": settings.STUDYMATE_SAFE_OFFLINE,
    "dotenv_skipped": settings.CORS_ORIGINS != "https://dotenv.invalid",
    "providers": [has_llm_key(name) for name in ("qwen", "deepseek", "mimo", "spark")],
    "embedding": has_embedding_key(),
    "asr": _xfyun_configured(),
    "tts": _tts_configured(),
    "ocr": settings.PRIVATE_KNOWLEDGE_OCR_MODE,
    "piston": bool(settings.PISTON_URL),
    "smtp": bool(settings.SMTP_USERNAME or settings.SMTP_PASSWORD),
    "network_blocked": blocked,
}))
"""
            env = os.environ.copy()
            env.update(
                {
                    "PYTHONPATH": str(backend_root),
                    "PYTHONDONTWRITEBYTECODE": "1",
                    "STUDYMATE_SAFE_OFFLINE": "1",
                    # 同时模拟父进程仍带有凭据，验证后置清空不是只依赖跳过 .env。
                    "DEEPSEEK_API_KEY": "fixture-process-key",
                    "QWEN_API_KEY": "fixture-process-key",
                    "XFYUN_API_KEY": "fixture-process-key",
                    "SMTP_PASSWORD": "fixture-process-password",
                    "PISTON_URL": "http://127.0.0.1:2000",
                }
            )
            completed = subprocess.run(
                [sys.executable, "-c", code],
                cwd=temp_path,
                env=env,
                capture_output=True,
                text=True,
                check=True,
                timeout=30,
            )
            payload = json.loads(completed.stdout)

        self.assertTrue(payload["safe"])
        self.assertTrue(payload["dotenv_skipped"])
        self.assertEqual(payload["providers"], [False, False, False, False])
        self.assertFalse(payload["embedding"])
        self.assertFalse(payload["asr"])
        self.assertFalse(payload["tts"])
        self.assertEqual(payload["ocr"], "unconfigured")
        self.assertFalse(payload["piston"])
        self.assertFalse(payload["smtp"])
        self.assertTrue(payload["network_blocked"])


class SafeOfflineServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_external_entrypoints_make_zero_network_calls(self):
        with (
            patch.object(settings, "STUDYMATE_SAFE_OFFLINE", True),
            patch.object(settings, "QWEN_API_KEY", "fixture-qwen"),
            patch.object(settings, "DEEPSEEK_API_KEY", "fixture-deepseek"),
            patch.object(settings, "MIMO_API_KEY", "fixture-mimo"),
            patch.object(settings, "SPARK_API_KEY", "fixture-spark"),
            patch.object(settings, "XFYUN_APP_ID", "fixture-app"),
            patch.object(settings, "XFYUN_API_KEY", "fixture-xfyun"),
            patch.object(settings, "XFYUN_API_SECRET", "fixture-secret"),
            patch.object(settings, "SMTP_USERNAME", "fixture-user"),
            patch.object(settings, "SMTP_PASSWORD", "fixture-password"),
            patch("app.llm.client.AsyncOpenAI") as llm_client,
            patch("app.llm.embeddings.AsyncOpenAI") as embedding_client,
            patch("app.api.voice.websockets.connect") as websocket_connect,
            patch("app.api.run.httpx.AsyncClient") as piston_client,
            patch("app.api.bili.httpx.AsyncClient") as bili_client,
            patch("app.integrations.rencaiya.httpx.AsyncClient") as rencaiya_client,
            patch("app.integrations.reading_resolver.httpx.AsyncClient") as reading_client,
            patch("app.core.mailer.aiosmtplib.send", new_callable=AsyncMock) as smtp_send,
            patch("scripts.smoke_ocr.httpx.Client") as smoke_ocr_client,
        ):
            self.assertFalse(any(has_llm_key(name) for name in ("qwen", "deepseek", "mimo", "spark")))
            self.assertFalse(has_embedding_key())
            with self.assertRaises(ExternalAccessDisabledError):
                get_llm_client("qwen")
            with self.assertRaises(ExternalAccessDisabledError):
                await embed_texts(["离线文本"])

            status = await voice.voice_status()
            self.assertFalse(status["asr_configured"])
            self.assertFalse(status["tts_configured"])
            with self.assertRaises(HTTPException) as tts_error:
                await voice.tts(TtsRequest(text="离线语音"))
            self.assertEqual(tts_error.exception.status_code, 503)
            with self.assertRaises(HTTPException) as asr_error:
                await voice.asr_url()
            self.assertEqual(asr_error.exception.status_code, 503)
            with self.assertRaises(HTTPException) as ocr_error:
                await ocr._vl_recognize(
                    "data:image/png;base64,AA==",
                    "fixture prompt",
                    0.1,
                )
            self.assertEqual(ocr_error.exception.status_code, 503)

            run_result = await run.run(RunRequest(language="python", source="print('offline')"))
            self.assertTrue(run_result.mock)
            self.assertIn("安全离线", run_result.stderr)

            videos = await bili.videos(VideosRequest(keyword="梯度下降", limit=2))
            self.assertEqual(videos["source_state"], "safe_offline")
            course_state, _, _, _ = await rencaiya.get_courses("机器学习", 2)
            job_state, jobs = await rencaiya.get_jobs()
            resolved = await reading_resolver.resolve_reading_items(
                [{"index": 0, "title": "fixture", "type": "paper", "source": "", "lang": "en"}]
            )
            self.assertEqual(course_state, "safe_offline")
            self.assertEqual(job_state, "safe_offline")
            self.assertTrue(jobs)
            self.assertEqual(resolved, [])
            with self.assertRaises(ExternalAccessDisabledError):
                await send_verification_code("offline@example.test", "000000")
            with self.assertRaises(SystemExit):
                smoke_ocr.main()
            with self.assertRaises(SystemExit):
                await smoke_llm.main()

        for mock in (
            llm_client,
            embedding_client,
            websocket_connect,
            piston_client,
            bili_client,
            rencaiya_client,
            reading_client,
            smtp_send,
            smoke_ocr_client,
        ):
            mock.assert_not_called()


class SafeOfflinePrivateKnowledgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="studymate-safe-private-")
        root = Path(self.temp_dir.name)
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{(root / 'offline.db').as_posix()}")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.old_session_maker = knowledge.async_session_maker
        self.old_storage = settings.PRIVATE_KNOWLEDGE_DIR
        knowledge.async_session_maker = self.sessions
        settings.PRIVATE_KNOWLEDGE_DIR = str(root / "private")

    async def asyncTearDown(self):
        knowledge.async_session_maker = self.old_session_maker
        settings.PRIVATE_KNOWLEDGE_DIR = self.old_storage
        await self.engine.dispose()
        self.temp_dir.cleanup()

    async def test_txt_finishes_keyword_only_and_embedding_is_never_called(self):
        raw = "梯度下降沿损失函数负梯度方向更新参数。".encode("utf-8")
        async with self.sessions() as db:
            user = User(name="offline", email="offline-private@example.test")
            db.add(user)
            await db.flush()
            library = UserKnowledgeBase(user_id=user.id, name="离线库")
            db.add(library)
            await db.flush()
            source = knowledge._source_path(
                user_id=user.id,
                document_id=1,
                filename="offline.txt",
            )
            source.write_bytes(raw)
            document = UserKnowledgeDocument(
                id=1,
                user_id=user.id,
                knowledge_base_id=library.id,
                filename="offline.txt",
                media_type="text/plain",
                size=len(raw),
                status="queued",
                source_path=str(source),
                checksum_sha256=hashlib.sha256(raw).hexdigest(),
            )
            db.add(document)
            await db.commit()
            user_id = user.id

        embedding_call = AsyncMock()
        with (
            patch.object(settings, "STUDYMATE_SAFE_OFFLINE", True),
            patch.object(settings, "QWEN_API_KEY", "fixture-qwen"),
            patch.object(knowledge, "embed_texts", embedding_call),
        ):
            await knowledge.process_document_task(1, user_id)

        embedding_call.assert_not_awaited()
        async with self.sessions() as db:
            document = await db.get(UserKnowledgeDocument, 1)
            chunks = (
                await db.scalars(
                    select(UserKnowledgeChunk).where(UserKnowledgeChunk.document_id == 1)
                )
            ).all()
        self.assertEqual(document.status, "ready_keyword")
        self.assertEqual(document.vector_progress, 0)
        self.assertIn("关键词检索", document.error_detail)
        self.assertEqual(len(chunks), 1)
        self.assertIsNone(chunks[0].embedding)


if __name__ == "__main__":
    unittest.main()
