from __future__ import annotations

import unittest
from collections import Counter
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agents.quiz_agent import _grounded_mock_fill
from app.api.theory_assessments import (
    _answer_is_correct,
    _assessment_is_current,
    _assessment_missing_fields,
    _knowledge_level,
    _prepare_assessment,
    _profile_score,
    _public_assessment,
    _strip_source_leadin,
    SubmitTheoryAssessmentRequest,
    TheoryAnswer,
    submit_assessment,
    create_assessment,
    CreateTheoryAssessmentRequest,
)
from app.db.models import Profile, TheoryAssessment, User
from app.db.session import Base
from app.schemas.profile import ProfileDims


class TheoryAssessmentUnitTests(unittest.TestCase):
    def test_grounded_offline_exam_keeps_sources_and_competencies(self):
        items = _grounded_mock_fill(
            4,
            0,
            0,
            reference_materials=[
                {"source": "FDE 知识库·产品化", "content": "FDE 交付需要同时验证功能、性能与可观测性。"},
                {"source": "FDE 知识库·部署", "content": "上线前应建立回滚策略并核验依赖版本。"},
            ],
            competencies=["AI 应用工程化", "部署与可观测性"],
            difficulty=2,
        )

        self.assertEqual(len(items), 4)
        self.assertEqual({item["type"] for item in items}, {"mcq"})
        self.assertEqual(
            {item["competency"] for item in items},
            {"AI 应用工程化", "部署与可观测性"},
        )
        self.assertTrue(all(item["source"].startswith("FDE 知识库") for item in items))
        self.assertTrue(all(item["options"][item["answer"]] for item in items))

    def test_profile_gate_matches_training_center_threshold(self):
        dims = ProfileDims()
        self.assertEqual(_profile_score(dims, 1), 20)
        dims.goals.primary = "成为 FDE"
        dims.goals.target_topics = ["智能体编排"]
        dims.pace.hours_per_week = 8
        self.assertEqual(_profile_score(dims, 2), 80)

    def test_assessment_gate_only_requires_diagnostic_profile_dimensions(self):
        dims = ProfileDims()
        dims.learner_background.education = "计算机专业本科"
        dims.pace.hours_per_week = 8
        dims.profile_coverage.knowledge_base = True

        self.assertEqual(_assessment_missing_fields(dims, "前线部署工程师（FDE）"), [])

    def test_submitted_assessment_must_still_exist_in_current_profile_evidence(self):
        assessment = TheoryAssessment(id=7, role_id="fde", status="submitted")
        dims = ProfileDims()
        self.assertFalse(_assessment_is_current(assessment, dims))

        dims = ProfileDims.model_validate({"theory_assessments": {"fde": {
            "assessment_id": 7,
            "role_id": "fde",
            "role_name": "前线部署工程师（FDE）",
            "score": 80,
            "knowledge_level": "进阶",
            "completed_at": "2026-08-26T09:00:00",
        }}})
        self.assertTrue(_assessment_is_current(assessment, dims))

    def test_answers_and_level_boundaries(self):
        self.assertTrue(_answer_is_correct("2", 2))
        self.assertFalse(_answer_is_correct(None, 0))
        self.assertTrue(_answer_is_correct(" 交付验证 ", "交付验证/验收验证", "fill"))
        self.assertFalse(_answer_is_correct("系统集成", "交付验证/验收验证", "fill"))
        self.assertEqual([_knowledge_level(value) for value in (39, 40, 59, 60, 79, 80)], [
            "入门", "基础", "基础", "应用", "应用", "进阶",
        ])

    def test_source_leadin_is_removed_without_erasing_normal_scenario_conditions(self):
        self.assertEqual(
            _strip_source_leadin("根据范冰《前线部署工程师》v1.0.14，第 2 章：解决正确的问题，FDE 应先确认什么？"),
            "FDE 应先确认什么？",
        )
        self.assertEqual(
            _strip_source_leadin("根据《前线部署工程师》第 2 章，FDE 应先确认什么？"),
            "FDE 应先确认什么？",
        )
        self.assertEqual(
            _strip_source_leadin("根据客户提供的日志，哪项判断最合理？"),
            "根据客户提供的日志，哪项判断最合理？",
        )

    def test_answer_key_is_hidden_until_submission(self):
        assessment = TheoryAssessment(
            id=7,
            user_id=1,
            role_id="fde",
            role_name="FDE",
            course_id=1,
            status="ready",
            items=[{
                "id": "theory_1",
                "index": 1,
                "type": "mcq",
                "question": "测试题",
                "options": ["A", "B", "C", "D"],
                "answer": 2,
                "competency": "工程化",
                "source": "岗位知识库",
            }],
            created_at=datetime.utcnow(),
        )
        public = _public_assessment(assessment)
        self.assertNotIn("correct_answer", public["items"][0])

        assessment.status = "submitted"
        assessment.score = 100
        assessment.result = {"items": [{"id": "theory_1", "user_answer": 2, "is_correct": True}]}
        public = _public_assessment(assessment)
        self.assertEqual(public["items"][0]["correct_answer"], 2)
        self.assertTrue(public["items"][0]["is_correct"])


class TheoryAssessmentPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_submit_writes_role_scoped_evidence_back_to_profile(self):
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp, "theory.db").as_posix()
            engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            async with maker() as db:
                user = User(id=31, name="测试用户")
                dims = ProfileDims()
                dims.goals.primary = "成为 FDE"
                dims.goals.target_topics = ["交付验证"]
                dims.pace.hours_per_week = 8
                profile = Profile(user_id=31, dims=dims.model_dump(), version=2)
                assessment = TheoryAssessment(
                    user_id=31,
                    role_id="fde",
                    role_name="前线部署工程师（FDE）",
                    course_id=None,
                    status="ready",
                    items=[{
                        "id": "theory_1",
                        "index": 1,
                        "type": "mcq",
                        "question": "上线前首先核验什么？",
                        "options": ["回滚策略", "页面颜色", "字体", "头像"],
                        "answer": 0,
                        "competency": "交付验证",
                        "source": "FDE 岗位知识库",
                    }],
                )
                db.add_all([user, profile, assessment])
                await db.commit()
                await db.refresh(assessment)

                response = await submit_assessment(
                    assessment.id,
                    SubmitTheoryAssessmentRequest(
                        answers=[TheoryAnswer(item_id="theory_1", answer=0)],
                        duration_ms=1200,
                    ),
                    db,
                    user,
                )
                saved = await db.scalar(select(Profile).where(Profile.user_id == user.id))

            await engine.dispose()
            self.assertEqual(response["score"], 100)
            self.assertEqual(saved.dims["knowledge_base"]["subject_prior"], 5)
            self.assertEqual(saved.dims["theory_assessments"]["fde"]["score"], 100)
            self.assertEqual(saved.version, 3)

    async def test_create_falls_back_to_retrieved_material_when_model_times_out(self):
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp, "timeout.db").as_posix()
            engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            async with maker() as db:
                user = User(id=32, name="超时测试用户")
                dims = ProfileDims()
                dims.goals.primary = "成为 FDE"
                dims.goals.target_topics = ["交付验证"]
                dims.pace.hours_per_week = 8
                dims.learner_background.education = "计算机专业本科"
                dims.profile_coverage.knowledge_base = True
                db.add_all([user, Profile(user_id=32, dims=dims.model_dump(), version=2)])
                await db.commit()
                materials = [{"content": "上线前必须核验回滚策略和验收口径。", "source": "FDE 岗位知识库"}]
                with (
                    patch("app.api.theory_assessments.get_course_by_id", new=AsyncMock(return_value=type("CourseCfg", (), {"name": "FDE 岗位知识库", "persona": "FDE 教练"})())),
                    patch("app.api.theory_assessments.get_rag_service") as rag_factory,
                    patch("app.api.theory_assessments.generate_quiz_batch", new=AsyncMock(side_effect=TimeoutError)),
                ):
                    rag_factory.return_value.search = AsyncMock(return_value=materials)
                    response = await create_assessment(
                        CreateTheoryAssessmentRequest(
                            role_id="fde",
                            role_name="前线部署工程师（FDE）",
                            course_id=6,
                            competencies=["交付验证"],
                        ),
                        db,
                        user,
                    )

            await engine.dispose()
            self.assertEqual(response["status"], "ready")
            self.assertEqual(len(response["items"]), 8)
            self.assertEqual(Counter(item["type"] for item in response["items"]), {
                "mcq": 6,
                "fill": 2,
            })
            self.assertGreaterEqual(len({item["difficulty"] for item in response["items"]}), 2)
            self.assertTrue(all(item["source"] == "FDE 岗位知识库" for item in response["items"]))

    async def test_background_preparation_is_persisted_and_idempotent(self):
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp, "prepare.db").as_posix()
            engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

            async with maker() as db:
                db.add(User(id=33, name="后台组卷测试用户"))
                await db.commit()

            req = CreateTheoryAssessmentRequest(
                role_id="fde",
                role_name="前线部署工程师（FDE）",
                course_id=6,
                competencies=["交付验证"],
            )
            items = [{
                "id": f"theory_{index}",
                "index": index,
                "type": "mcq",
                "question": f"岗位理论题 {index}",
                "options": ["A", "B", "C", "D"],
                "answer": 0,
                "explanation": "解析",
                "difficulty": 2,
                "competency": "交付验证",
                "source": "FDE 岗位知识库",
            } for index in range(1, 9)]

            with (
                patch("app.api.theory_assessments.async_session_maker", maker),
                patch("app.api.theory_assessments._build_assessment_items", new=AsyncMock(return_value=items)) as builder,
            ):
                await _prepare_assessment(33, req)
                await _prepare_assessment(33, req)

            async with maker() as db:
                assessments = list((await db.scalars(
                    select(TheoryAssessment).where(
                        TheoryAssessment.user_id == 33,
                        TheoryAssessment.role_id == "fde",
                    )
                )).all())

            await engine.dispose()
            self.assertEqual(len(assessments), 1)
            self.assertEqual(assessments[0].status, "ready")
            self.assertEqual(len(assessments[0].items), 8)
            builder.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
