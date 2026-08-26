from __future__ import annotations

import hashlib
import hmac
import json
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.oj import (
    _normalize_next_path,
    _signature_payload,
    _token_hash,
    enter_oj,
    oj_identity_status,
    redeem_oj_ticket,
)
from app.core.config import settings
from app.db.models import OJLaunchTicket, User
from app.db.session import Base


def _signed_request(
    body: bytes,
    *,
    timestamp: str | None = None,
    path: str = "/api/internal/oj/tickets/redeem",
) -> Request:
    timestamp = timestamp or str(int(time.time()))
    signature = hmac.new(
        b"oj-test-secret",
        _signature_payload(timestamp, "POST", path, body),
        hashlib.sha256,
    ).hexdigest()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
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
                        next_path="/oj/p/100",
                        expires_at=datetime.utcnow() + timedelta(minutes=2),
                    ),
                ])
                await db.commit()
                body = json.dumps({"ticket": raw_ticket}, separators=(",", ":")).encode()
                with patch.object(settings, "OJ_SERVICE_SECRET", "oj-test-secret"):
                    first = await redeem_oj_ticket(_signed_request(body), db)
                    self.assertEqual(first["user"]["subject"], "7")
                    self.assertEqual(first["redirect_path"], "/oj/p/100")
                    with self.assertRaises(HTTPException) as raised:
                        await redeem_oj_ticket(_signed_request(body), db)
                self.assertEqual(raised.exception.status_code, 410)

            await engine.dispose()

    async def test_guest_entry_redirects_to_studymate_login(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'oj.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with maker() as db:
                response = await enter_oj("/oj/p/100?tab=submit", None, db)
                self.assertEqual(response.status_code, 303)
                self.assertIn("/login?return_to=", response.headers["location"])
                return_to = parse_qs(urlsplit(response.headers["location"]).query)["return_to"][0]
                self.assertEqual(return_to, "/api/oj/entry?next=%2Foj%2Fp%2F100%3Ftab%3Dsubmit")
            await engine.dispose()

    def test_next_path_rejects_external_redirects(self):
        self.assertEqual(_normalize_next_path(None), "/oj/")
        self.assertEqual(_normalize_next_path("/oj/p/100"), "/oj/p/100")
        with self.assertRaises(HTTPException):
            _normalize_next_path("https://evil.example/steal")
        with self.assertRaises(HTTPException):
            _normalize_next_path("//evil.example/steal")
        with self.assertRaises(HTTPException):
            _normalize_next_path("/oj/p/100\r\nLocation: https://evil.example")

    async def test_identity_status_is_signed_and_reports_inactive_user(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'oj.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with maker() as db:
                db.add(User(id=9, name="停用用户", email="inactive@example.test", is_active=False))
                await db.commit()
                body = json.dumps({"subject": "9"}, separators=(",", ":")).encode()
                with patch.object(settings, "OJ_SERVICE_SECRET", "oj-test-secret"):
                    result = await oj_identity_status(
                        _signed_request(body, path="/api/internal/oj/identity/status"),
                        db,
                    )
                self.assertEqual(result["identity"]["subject"], "9")
                self.assertFalse(result["identity"]["active"])
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
