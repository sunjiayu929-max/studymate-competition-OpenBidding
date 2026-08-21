from __future__ import annotations

import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agents.arbiter_agent import ArbiterAgent
from app.agents.diagnosis_agent import DiagnosisAgent
from app.agents.review_agents import EvidenceReviewAgent, PracticeReviewAgent, DifficultyReviewAgent
from app.agents.planning_agents import DomainExpertAgent, LearningStrategyAgent, PlanArbiterAgent
from app.training import resolve_training_role
from app.agents.video_agent import VideoAgent, _build_script, preview_video_plan
from app.api.concept import _video_job_initial
from app.api.workspace import TrainingFeedbackRequest, _build_orchestrator, submit_training_feedback
from app.db.session import Base
from app.db.models import TrainingRun, User


async def _ignore_event(_event: str, _data: dict) -> None:
    return None


class TrainingCatalogTests(unittest.TestCase):
    def test_current_resource_pack_has_seven_generators_without_learning_path(self):
        orchestrator = _build_orchestrator()
        self.assertEqual(
            [agent.meta.id for agent in orchestrator.generators],
            ["doc", "guide", "quiz", "mindmap", "reading", "code", "video"],
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

    def test_interview_enabled_roles_share_one_competency_catalogue(self):
        for role_id, target in TARGET_ROLES.items():
            with self.subTest(role_id=role_id):
                mapped = resolve_training_role(target.course_name)
                self.assertEqual(mapped["target_role"], target.name)
                self.assertEqual(mapped["domain"], target.domain)
                self.assertEqual(mapped["core_competencies"], list(target.competencies))

    def test_unknown_course_has_safe_generic_role(self):
        role = resolve_training_role("新领域")
        self.assertEqual(role["domain"], "特定软件开发")
        self.assertTrue(role["target_role"])


class TrainingAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_video_agent_keeps_a_reviewable_script_without_api_key(self):
        with patch("app.video.minimax_h3.settings.MINIMAX_API_KEY", ""):
            result = await VideoAgent().run({
                "topic": "接口异常排查",
                "target_role": "前线部署工程师（FDE）",
                "core_competencies": ["日志分析", "系统集成"],
                "chunks": [{"chunk_id": "chunk-1", "source": "岗位手册", "content": "日志分析"}],
            }, _ignore_event)
        self.assertEqual(result["status"], "unconfigured")
        self.assertTrue(result["script"]["prompt"])
        self.assertTrue(result["script"]["voiceover"])
        self.assertEqual(len(result["script"]["shots"]), 3)
        self.assertGreaterEqual(result["total_duration"], 4)
        self.assertEqual(result["segment_count"], len(result["segments"]))
        self.assertTrue(all(4 <= segment["duration"] <= 12 for segment in result["segments"]))

    def test_video_duration_adapts_to_topic_complexity_without_exceeding_budget(self):
        focused = _build_script({"topic": "验收", "target_role": "FDE"})
        complex_topic = _build_script({
            "topic": "从头到尾详解企业 RAG 系统架构与安全边界",
            "target_role": "FDE",
            "core_competencies": ["需求澄清", "检索", "系统集成", "交付验证"],
            "diagnosis": {"target_difficulty": 4},
        })
        self.assertLess(focused["duration"], complex_topic["duration"])
        self.assertEqual(complex_topic["complexity"], "complex")
        self.assertLessEqual(max(segment["duration"] for segment in complex_topic["segments"]), 12)
        self.assertGreater(complex_topic["total_duration"], complex_topic["duration"])
        self.assertIn("完整讲解交给动画或黑板", complex_topic["duration_reason"])

    def test_video_preview_only_returns_plan(self):
        plan = preview_video_plan({"topic": "接口联调", "target_role": "FDE"})
        self.assertGreaterEqual(plan["total_duration"], plan["duration"])
        self.assertEqual(plan["segment_count"], len(plan["segments"]))
        self.assertEqual(plan["resolution"], "768P")
        self.assertEqual(plan["estimated_cost_rmb"], plan["total_duration"] * 0.5)

    def test_short_video_questions_use_one_affordable_segment(self):
        for topic in ("什么是幂等性？", "FDE这个岗位是干什么的", "接口联调"):
            plan = preview_video_plan({"topic": topic, "target_role": "FDE"})
            self.assertEqual(plan["complexity"], "focused")
            self.assertEqual(plan["segment_count"], 1)
            self.assertLessEqual(plan["total_duration"], 6)
            self.assertLessEqual(plan["estimated_cost_rmb"], 3)

    def test_concept_video_job_initial_uses_video_script_builder(self):
        initial = _video_job_initial(
            {"topic": "接口联调", "target_role": "FDE"},
            "job-1",
        )
        self.assertEqual(initial["status"], "queued")
        self.assertEqual(initial["segment_count"], 1)
        self.assertTrue(initial["script"]["prompt"])

    def test_explicit_workflow_question_keeps_multiple_segments(self):
        plan = preview_video_plan({"topic": "现场数据接入与接口联调的完整流程", "target_role": "FDE"})
        self.assertEqual(plan["complexity"], "workflow")
        self.assertEqual(plan["segment_count"], 4)
        self.assertGreater(plan["total_duration"], 20)

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
        self.assertEqual(
            result["training_contract"]["required_resources"],
            ["定制讲义", "实操指南", "分阶测试", "思维导图", "拓展阅读", "代码案例", "可视讲解"],
        )

    async def test_three_reviews_pass_a_complete_seven_resource_pack(self):
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
                "mindmap": {"content": "# 数据标注\n## 模型训练\n- 质量检查"},
                "reading": {
                    "items": [
                        {"title": "资料一", "source": "教材"},
                        {"title": "资料二", "source": "论文"},
                        {"title": "资料三", "source": "文档"},
                    ],
                },
                "code": {"language": "python", "code": "print('ok')"},
                "video": {
                    "status": "unconfigured",
                    "script": {
                        "prompt": "展示数据标注到模型验证的岗位任务流程",
                        "voiceover": "先确认输入和约束，再按步骤执行并验证结果。",
                    },
                },
            },
        }
        reviews = {}
        for agent in (EvidenceReviewAgent(), PracticeReviewAgent(), DifficultyReviewAgent()):
            reviews[agent.meta.id] = await agent.run(context, _ignore_event)
        self.assertTrue(all(review["status"] != "fail" for review in reviews.values()))

        decision = await ArbiterAgent().run({"reviews": reviews, "outputs": context["outputs"], "generation_round": 1}, _ignore_event)
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
        self.assertEqual(decision["rework_targets"], ["doc", "guide", "quiz", "mindmap", "reading", "code", "video"])

    async def test_arbiter_never_publishes_with_missing_reviews(self):
        decision = await ArbiterAgent().run({"reviews": {}, "generation_round": 1}, _ignore_event)
        self.assertEqual(decision["decision"], "rework")
        self.assertEqual(decision["rework_targets"], ["doc", "guide", "quiz", "mindmap", "reading", "code", "video"])
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
        self.assertEqual(decision["rework_targets"], ["doc", "guide", "quiz", "mindmap", "reading", "code", "video"])

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
