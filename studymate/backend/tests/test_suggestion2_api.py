from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.eval import (
    ApplyDeltaRequest,
    Engagement,
    EvalRequest,
    QuizResult,
    eval_run,
    profile_apply_delta,
)
from app.db import models  # noqa: F401 - 注册全部表
from app.db.models import ProfileSnapshot
from app.db.session import Base


class EvalApiSmokeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._temp_dir = tempfile.TemporaryDirectory(prefix="studymate-api-test-")
        db_path = Path(self._temp_dir.name) / "test.db"
        self._engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        self._sessions = async_sessionmaker(self._engine, expire_on_commit=False)
        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self):
        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await self._engine.dispose()
        self._temp_dir.cleanup()

    async def test_preview_apply_conflict_and_noop_are_consistent(self):
        async with self._sessions() as db:
            report = await eval_run(
                EvalRequest(
                    user_id=91001,
                    quiz_results=[
                        QuizResult(
                            question="梯度下降如何更新参数？",
                            user_answer="沿负梯度方向",
                            correct_answer="沿负梯度方向",
                            is_correct=True,
                            topic="梯度下降",
                        )
                    ],
                    engagement=Engagement(
                        topics_studied=["梯度下降"],
                        time_spent_min=20,
                        resources_consumed=["doc", "quiz", "code"],
                        resources_available=["doc", "quiz", "code", "reading"],
                    ),
                    persist=False,
                ),
                db,
            )

            self.assertIn("projected_dims", report)
            self.assertEqual(report["scores"]["answer_completion"]["rate"], 1.0)
            self.assertEqual(report["scores"]["resource_coverage"]["rate"], 0.75)
            self.assertEqual(report["scores"]["engagement_breakdown"]["time_score"], 40)
            applied = await profile_apply_delta(
                ApplyDeltaRequest(
                    user_id=91001,
                    profile_delta=report["profile_delta"],
                    source_version=report["profile_version"],
                ),
                db,
            )
            self.assertTrue(applied["changed"])
            self.assertEqual(applied["dims"], report["projected_dims"])

            snapshot_count = await db.scalar(select(func.count(ProfileSnapshot.id)))
            self.assertEqual(snapshot_count, 1)

            with self.assertRaises(HTTPException) as raised:
                await profile_apply_delta(
                    ApplyDeltaRequest(
                        user_id=91001,
                        profile_delta=report["profile_delta"],
                        source_version=report["profile_version"],
                    ),
                    db,
                )
            self.assertEqual(raised.exception.status_code, 409)

            no_change = await profile_apply_delta(
                ApplyDeltaRequest(
                    user_id=91001,
                    profile_delta={"employment_skills": {"professional": 1}},
                    source_version=applied["version"],
                ),
                db,
            )
            self.assertFalse(no_change["changed"])
            self.assertEqual(no_change["version"], applied["version"])
            snapshot_count = await db.scalar(select(func.count(ProfileSnapshot.id)))
            self.assertEqual(snapshot_count, 1)


if __name__ == "__main__":
    unittest.main()
