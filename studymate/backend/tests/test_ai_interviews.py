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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.interviews import (
    CreateInterviewAttemptRequest,
    InterviewReport,
    _signature_payload,
    _token_hash,
    _validate_report_scores,
    create_interview_attempt,
    receive_interview_started,
    redeem_launch_ticket,
)
from app.core.config import settings
from app.db.models import Course, InterviewAttempt, InterviewLaunchTicket, User
from app.db.session import Base


def _signed_request(
    body: bytes,
    *,
    path: str = "/api/internal/interviews/tickets/redeem",
    method: str = "POST",
    timestamp: str | None = None,
) -> Request:
    timestamp = timestamp or str(int(time.time()))
    signature = hmac.new(
        b"interview-test-secret",
        _signature_payload(timestamp, method, path, body),
        hashlib.sha256,
    ).hexdigest()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [
                (b"x-studymate-timestamp", timestamp.encode()),
                (b"x-studymate-signature", signature.encode()),
            ],
        },
        receive,
    )


class InterviewScoreTests(unittest.TestCase):
    def _report(self, *, overall: float = 76.0, role: float = 80.0, general: float = 70.0):
        return InterviewReport.model_validate({
            "attempt_id": "attempt-1",
            "overall_score": overall,
            "role_match_score": role,
            "general_score": general,
            "generic_scores": {
                "professional_ability": 70,
                "learning_ability": 70,
                "team_collaboration": 70,
                "problem_solving": 70,
                "communication_expression": 70,
            },
            "competency_scores": [
                {"competency": "系统集成", "score": 80, "evidence": "回答", "improvement": "建议"},
            ],
            "question_count": 10,
            "started_at": "2026-08-20T10:00:00",
            "completed_at": "2026-08-20T10:20:00",
        })

    def test_score_formula_is_server_owned(self):
        attempt = InterviewAttempt(
            id="attempt-1",
            user_id=1,
            role_id="fde",
            role_name="FDE",
            role_context={"competencies": ["系统集成"]},
        )
        _validate_report_scores(attempt, self._report(overall=76, role=80, general=70))

        with self.assertRaises(HTTPException) as raised:
            _validate_report_scores(attempt, self._report(overall=99, role=80, general=70))
        self.assertEqual(raised.exception.status_code, 422)


class InterviewTicketTests(unittest.IsolatedAsyncioTestCase):
    async def test_launch_ticket_is_consumed_once(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'interview.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            raw_ticket = "t" * 48
            attempt = InterviewAttempt(
                id="attempt-ticket",
                user_id=51,
                role_id="fde",
                role_name="FDE",
                role_context={"id": "fde", "name": "FDE", "competencies": ["系统集成"]},
                profile_snapshot={"display_name": "测试学习者"},
                status="launch_ready",
            )
            ticket = InterviewLaunchTicket(
                attempt_id=attempt.id,
                token_hash=_token_hash(raw_ticket),
                expires_at=datetime.utcnow() + timedelta(minutes=2),
            )
            async with maker() as db:
                db.add_all([User(id=51, name="测试学习者", is_active=True), attempt, ticket])
                await db.commit()
                body = json.dumps({"ticket": raw_ticket}, separators=(",", ":")).encode()
                with patch.object(settings, "AI_INTERVIEW_SERVICE_SECRET", "interview-test-secret"):
                    first = await redeem_launch_ticket(_signed_request(body), db)
                    self.assertEqual(first["attempt_id"], attempt.id)
                    with self.assertRaises(HTTPException) as raised:
                        await redeem_launch_ticket(_signed_request(body), db)
                saved = await db.get(InterviewLaunchTicket, ticket.id)

            await engine.dispose()
            self.assertEqual(raised.exception.status_code, 410)
            self.assertIsNotNone(saved.consumed_at)

    async def test_started_callback_binds_external_interview_once(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'started.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            attempt = InterviewAttempt(
                id="attempt-started",
                user_id=52,
                role_id="fde",
                role_name="FDE",
                role_context={"id": "fde", "name": "FDE", "competencies": ["系统集成"]},
                profile_snapshot={"display_name": "测试学习者"},
                status="launched",
            )
            body = json.dumps({
                "attempt_id": attempt.id,
                "external_interview_id": "practice-interview-1",
            }, separators=(",", ":")).encode()
            path = f"/api/internal/interviews/attempts/{attempt.id}/started"
            async with maker() as db:
                db.add_all([User(id=52, name="测试学习者", is_active=True), attempt])
                await db.commit()
                with patch.object(settings, "AI_INTERVIEW_SERVICE_SECRET", "interview-test-secret"):
                    first = await receive_interview_started(
                        attempt.id, _signed_request(body, path=path), db
                    )
                    second = await receive_interview_started(
                        attempt.id, _signed_request(body, path=path), db
                    )
                saved = await db.get(InterviewAttempt, attempt.id)

            await engine.dispose()
            self.assertFalse(first["idempotent"])
            self.assertTrue(second["idempotent"])
            self.assertEqual(saved.status, "in_progress")
            self.assertEqual(saved.external_interview_id, "practice-interview-1")
            self.assertIsNotNone(saved.started_at)

    async def test_course_must_match_the_server_owned_target_role(self):
        with TemporaryDirectory() as tmp:
            engine = create_async_engine(f"sqlite+aiosqlite:///{Path(tmp, 'course-role.db')}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            user = User(id=53, name="测试学习者", is_active=True)
            course = Course(id=71, name="机器学习", description="不属于 FDE 的课程")
            async with maker() as db:
                db.add_all([user, course])
                await db.commit()
                with (
                    patch.object(settings, "AI_INTERVIEW_PUBLIC_URL", "http://interview.test"),
                    patch.object(settings, "AI_INTERVIEW_SERVICE_SECRET", "interview-test-secret"),
                    self.assertRaises(HTTPException) as raised,
                ):
                    await create_interview_attempt(
                        CreateInterviewAttemptRequest(role_id="fde", course_id=course.id),
                        user=user,
                        db=db,
                    )

            await engine.dispose()
            self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
