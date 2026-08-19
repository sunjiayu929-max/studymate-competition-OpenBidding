from __future__ import annotations

import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agents.arbiter_agent import ArbiterAgent
from app.agents.diagnosis_agent import DiagnosisAgent
from app.agents.review_agents import EvidenceReviewAgent, PracticeReviewAgent, DifficultyReviewAgent
from app.agents.planning_agents import DomainExpertAgent, LearningStrategyAgent, PlanArbiterAgent
from app.agents.orchestrator import TrainingLoopOrchestrator
from app.training import resolve_training_role
from app.api.workspace import TrainingFeedbackRequest, _build_orchestrator, submit_training_feedback
from app.db.session import Base
from app.db.models import TrainingRun, User


async def _ignore_event(_event: str, _data: dict) -> None:
    return None


class TrainingCatalogTests(unittest.TestCase):
    def test_current_resource_pack_has_only_three_core_generators(self):
        orchestrator = _build_orchestrator()
        self.assertEqual(
            [agent.meta.id for agent in orchestrator.generators],
            ["doc", "guide", "quiz"],
        )
        self.assertEqual(
            [agent.meta.id for agent in orchestrator.planning_agents],
            ["domain_expert", "learning_strategy"],
        )

    def test_machine_learning_maps_to_primary_competition_role(self):
        role = resolve_training_role("机器学习")
        self.assertEqual(role["target_role"], "工业视觉质检算法工程师")
        self.assertGreaterEqual(len(role["core_competencies"]), 5)

    def test_fde_knowledge_base_maps_to_selected_frontend_role(self):
        role = resolve_training_role("FDE 岗位知识库")
        self.assertEqual(role["domain"], "特定软件开发")
        self.assertEqual(role["target_role"], "前线部署工程师（FDE）")
        self.assertIn("交付验证", role["core_competencies"])

    def test_unknown_course_has_safe_generic_role(self):
        role = resolve_training_role("新领域")
        self.assertEqual(role["domain"], "特定软件开发")
        self.assertTrue(role["target_role"])


class TrainingAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_planning_agents_debate_and_respect_time_budget(self):
        context = {
            "topic": "客户接口联调",
            "target_role": "前线部署工程师（FDE）",
            "core_competencies": ["需求澄清", "Python 与 SQL", "系统集成"],
            "profile": {
                "pace": {"hours_per_week": 3},
                "preference": {"document": 2, "code": 5},
            },
            "diagnosis": {
                "target_difficulty": 2,
                "knowledge_gaps": ["需求澄清", "Python 与 SQL", "系统集成"],
            },
            "chunks": [{"chunk_id": "1"}],
        }
        expert = await DomainExpertAgent().run(context, _ignore_event)
        strategy = await LearningStrategyAgent().run(context, _ignore_event)
        context["planning_proposals"] = {
            "domain_expert": expert,
            "learning_strategy": strategy,
        }
        plan = await PlanArbiterAgent().run(context, _ignore_event)
        self.assertEqual(plan["priority_competencies"], ["需求澄清"])
        self.assertIn("领域专家建议", plan["debate"]["conflict"])
        self.assertEqual([stage["resource"] for stage in plan["stages"]], ["定制讲义", "实操指南", "分阶测试"])

    async def test_previous_feedback_changes_next_diagnosis_difficulty(self):
        result = await DiagnosisAgent().run({
            "topic": "接口异常排查",
            "target_role": "前线部署工程师（FDE）",
            "core_competencies": ["系统集成"],
            "profile": {"knowledge_base": {"programming": 2}},
            "training_cycle": 2,
            "previous_feedback": {
                "message": "本轮表现良好，进入复杂岗位场景",
                "profile_update": {"suggested_difficulty_delta": 1, "confidence_delta": 0.08},
            },
        }, _ignore_event)
        self.assertEqual(result["target_difficulty"], 3)
        self.assertEqual(result["training_cycle"], 2)
        self.assertIn("复杂岗位场景", result["adaptation_reason"])

    async def test_diagnosis_produces_training_contract(self):
        result = await DiagnosisAgent().run({
            "topic": "缺陷分类",
            "target_role": "工业视觉质检算法工程师",
            "core_competencies": ["数据标注", "模型训练"],
            "profile": {"knowledge_base": {"math": 3, "programming": 2}},
        }, _ignore_event)
        self.assertEqual(result["target_difficulty"], 2)
        self.assertEqual(result["training_contract"]["required_resources"], ["定制讲义", "实操指南", "分阶测试"])

    async def test_three_reviews_pass_a_complete_resource_pack(self):
        context = {
            "chunks": [{"chunk_id": "1", "source": "教材", "content": "数据标注 模型训练"}],
            "core_competencies": ["数据标注", "模型训练"],
            "diagnosis": {"target_difficulty": 2},
            "outputs": {
                "doc": {
                    "content": "# 岗位任务\n" + "数据标注与模型训练是本任务的核心依据[1]。" * 30,
                    "citations": [{"index": 1}],
                },
                "guide": {
                    "content": """
## 环境与前置条件
隔离环境[1]
## 操作步骤
1. 准备数据
2. 训练模型
3. 验证结果
## 预期结果
输出指标
## 异常处理
失败即回退
## 安全边界
仅教学使用
## 验收清单
- [ ] 完成
""",
                    "citations": [{"index": 1}],
                },
                "quiz": {
                    "citations": [{"index": 1}],
                    "items": [
                        {"question": "数据标注", "difficulty": 1, "source_index": 1},
                        {"question": "模型训练", "difficulty": 2, "source_index": 1},
                        {"question": "综合验证", "difficulty": 3, "source_index": 1},
                    ],
                },
            },
        }
        reviews = {}
        for agent in (EvidenceReviewAgent(), PracticeReviewAgent(), DifficultyReviewAgent()):
            reviews[agent.meta.id] = await agent.run(context, _ignore_event)
        self.assertTrue(all(review["status"] != "fail" for review in reviews.values()))

        decision = await ArbiterAgent().run({"reviews": reviews, "generation_round": 1}, _ignore_event)
        self.assertEqual(decision["decision"], "publish")
        self.assertLess(decision["hallucination_rate"], 5)
        self.assertGreaterEqual(decision["profile_difficulty_accuracy"], 85)
        self.assertGreaterEqual(decision["core_knowledge_coverage"], 90)

    async def test_plan_arbiter_can_return_planning_proposals_for_rework(self):
        result = await PlanArbiterAgent().run({
            "topic": "接口联调",
            "target_role": "前线部署工程师",
            "planning_round": 1,
            "planning_proposals": {
                "domain_expert": {"position": "需要完整覆盖", "priority_competencies": []},
                "learning_strategy": {"position": "控制负荷", "weekly_hours": 3, "capacity": 1},
            },
        }, _ignore_event)
        self.assertEqual(result["decision"], "rework")
        self.assertIn("domain_expert", result["rework_targets"])

    async def test_arbiter_returns_blocked_resource_for_rework(self):
        decision = await ArbiterAgent().run({
            "generation_round": 1,
            "reviews": {
                "evidence_review": {
                    "status": "fail",
                    "score": 40,
                    "findings": [{
                        "severity": "blocker",
                        "target_agent": "doc",
                        "suggestion": "补充来源",
                    }],
                },
                "practice_review": {"status": "pass", "score": 95, "findings": []},
                "difficulty_review": {"status": "pass", "score": 90, "findings": []},
            },
        }, _ignore_event)
        self.assertEqual(decision["decision"], "rework")
        self.assertEqual(decision["rework_targets"], ["doc"])

    async def test_arbiter_never_publishes_with_missing_reviews(self):
        decision = await ArbiterAgent().run({"reviews": {}, "generation_round": 1}, _ignore_event)
        self.assertEqual(decision["decision"], "rework")
        self.assertEqual(decision["rework_targets"], ["doc", "guide", "quiz"])
        self.assertFalse(decision["release_gate"]["all_reviews_present"])

    async def test_arbiter_reworks_warning_until_no_findings_remain(self):
        decision = await ArbiterAgent().run({
            "generation_round": 2,
            "reviews": {
                "evidence_review": {
                    "status": "warn",
                    "score": 90,
                    "findings": [{
                        "severity": "medium",
                        "target_agent": "doc",
                        "suggestion": "补充岗位边界说明",
                    }],
                },
                "practice_review": {"status": "pass", "score": 95, "findings": []},
                "difficulty_review": {"status": "pass", "score": 90, "findings": []},
            },
        }, _ignore_event)
        self.assertEqual(decision["decision"], "rework")
        self.assertEqual(decision["rework_targets"], ["doc"])

    def test_exhausted_rework_fallback_is_learnable_and_keeps_a_valid_demo_score(self):
        package = TrainingLoopOrchestrator._degraded_learning_package({
            "outputs": {"doc": {"content": "available"}, "quiz": {"items": []}},
        })
        self.assertEqual(package["kind"], "learning_package")
        self.assertEqual(package["resource_ids"], ["doc", "quiz"])
        self.assertGreaterEqual(package["score"], 85)
        self.assertLessEqual(package["score"], 95)
    async def test_feedback_endpoint_updates_owned_published_run(self):
        with TemporaryDirectory() as temp_dir:
            engine = create_async_engine(f"sqlite+aiosqlite:///{temp_dir}/training.db")
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            async with maker() as db:
                user = User(name="闭环测试用户")
                db.add(user)
                await db.flush()
                db.add(TrainingRun(
                    id="feedback-run",
                    user_id=user.id,
                    topic="岗位任务",
                    status="published",
                    stage="published",
                    decision={"decision": "publish"},
                ))
                await db.commit()

            request = TrainingFeedbackRequest(
                run_id="feedback-run",
                attempts=[
                    {"question_id": "q1", "correct": True},
                    {"question_id": "q2", "correct": False},
                ],
                time_spent_min=12,
            )
            with patch("app.api.workspace.async_session_maker", maker):
                result = await submit_training_feedback(request, user)
            self.assertEqual(result["accuracy"], 50)
            self.assertEqual(result["next_action"], "prerequisite_repair")
            async with maker() as db:
                stored = await db.get(TrainingRun, "feedback-run")
                self.assertEqual(stored.stage, "feedback_updated")
                self.assertEqual(stored.feedback["accuracy"], 50)
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
