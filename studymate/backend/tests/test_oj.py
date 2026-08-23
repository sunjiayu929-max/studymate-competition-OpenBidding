from __future__ import annotations

import hashlib
import hmac
import json
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.oj import _signature_payload, _token_hash, redeem_oj_ticket
from app.core.config import settings
from app.db.models import OJLaunchTicket, User
from app.db.session import Base


def _signed_request(body: bytes, *, timestamp: str | None = None) -> Request:
    timestamp = timestamp or str(int(time.time()))
    signature = hmac.new(
        b"oj-test-secret",
        _signature_payload(timestamp, "POST", "/api/internal/oj/tickets/redeem", body),
        hashlib.sha256,
    ).hexdigest()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/internal/oj/tickets/redeem",
            "headers": [
                (b"x-studymate-timestamp", timestamp.encode()),
                (b"x-studymate-signature", signature.encode()),
            ],
        },
        receive,
    )


class OJTicketTests(unittest.IsolatedAsyncioTestCase):
    async def test_ticket_is_consumed_once(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'oj.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            raw_ticket = "t" * 48
            async with maker() as db:
                db.add_all([
                    User(id=7, name="测试学习者", email="oj@example.test", is_active=True),
                    OJLaunchTicket(
                        user_id=7,
                        token_hash=_token_hash(raw_ticket),
                        expires_at=datetime.utcnow() + timedelta(minutes=2),
                    ),
                ])
                await db.commit()
                body = json.dumps({"ticket": raw_ticket}, separators=(",", ":")).encode()
                with patch.object(settings, "OJ_SERVICE_SECRET", "oj-test-secret"):
                    first = await redeem_oj_ticket(_signed_request(body), db)
                    self.assertEqual(first["user"]["subject"], "7")
                    with self.assertRaises(HTTPException) as raised:
                        await redeem_oj_ticket(_signed_request(body), db)
                self.assertEqual(raised.exception.status_code, 410)

            await engine.dispose()

    async def test_expired_ticket_is_rejected(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'oj.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            raw_ticket = "e" * 48
            async with maker() as db:
                db.add_all([
                    User(id=8, name="已过期用户", is_active=True),
                    OJLaunchTicket(
                        user_id=8,
                        token_hash=_token_hash(raw_ticket),
                        expires_at=datetime.utcnow() - timedelta(seconds=1),
                    ),
                ])
                await db.commit()
                body = json.dumps({"ticket": raw_ticket}, separators=(",", ":")).encode()
                with patch.object(settings, "OJ_SERVICE_SECRET", "oj-test-secret"):
                    with self.assertRaises(HTTPException) as raised:
                        await redeem_oj_ticket(_signed_request(body), db)
                self.assertEqual(raised.exception.status_code, 410)
            await engine.dispose()
