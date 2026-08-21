from __future__ import annotations

import json
import unittest
from collections import Counter
from unittest.mock import AsyncMock, patch

from app.agents.quiz_agent import (
    _compact_fact,
    _difficulty_plan,
    _grounded_mock_fill,
    generate_quiz_batch,
    judge_code_with_llm,
)
from app.api.quiz_sessions import _role_quiz_context


MATERIALS = [
    {
        "content": "调研时需要问清当前流程、痛点、可获得的数据、约束条件、责任人和验收证据。",
        "source": "FDE 岗位知识库·场景调研",
        "meta": {"topic": "需求澄清"},
    },
    {
        "content": "现场集成应列出数据、接口、身份权限、网络和配置依赖，并为每项设置负责人和验证方法。",
        "source": "FDE 岗位知识库·系统集成",
        "meta": {"topic": "系统集成"},
    },
    {
        "content": "验收应围绕事先约定的业务结果和运行证据，且结果与遗留问题都应可追溯。",
        "source": "FDE 岗位知识库·交付验收",
        "meta": {"topic": "交付验证"},
    },
    {
        "content": "现场发现应区分客户特例和可复用能力，并通过复盘反馈给产品团队。",
        "source": "FDE 岗位知识库·产品反馈",
        "meta": {"topic": "产品反馈"},
    },
]


class GroundedQuizFallbackTests(unittest.TestCase):
    def test_compact_fact_keeps_a_complete_clause(self):
        fact = _compact_fact(
            "部署不是把系统装好就结束。FDE 还要观察真实用户使用过程，并持续调整。",
            max_chars=36,
        )
        self.assertEqual(fact, "部署不是把系统装好就结束。")

    def test_compact_fact_does_not_jump_to_anaphoric_second_sentence(self):
        fact = _compact_fact(
            "在开始集成前，FDE 应把业务需求整理成可验证的价值假设：为谁解决什么问题、通过哪条流程产生改变、使用哪些数据或系统、预期用哪些业务指标判断是否有效。这样可以避免把能做误当成值得做。",
            max_chars=72,
        )
        self.assertIn("价值假设", fact)
        self.assertFalse(fact.startswith(("这样", "这类", "这种")))

    def test_compact_fact_removes_long_parenthetical_without_losing_conclusion(self):
        fact = _compact_fact(
            "FDE（Forward Deployed Engineer，前线部署工程师）的核心任务，是把产品已有能力与客户真实需要之间的差距转化为可运行、可验证的解决方案。岗位成果不是演示文稿。",
            max_chars=72,
        )
        self.assertIn("可验证的解决方案", fact)
        self.assertNotIn("Forward Deployed Engineer", fact)

    def test_single_item_keeps_requested_difficulty(self):
        self.assertEqual(_difficulty_plan(1, 3), [3])

    def test_fallback_is_role_grounded_diverse_and_non_repeating(self):
        items = _grounded_mock_fill(
            8,
            4,
            3,
            reference_materials=MATERIALS,
            competencies=["需求澄清", "系统集成", "交付验证", "产品反馈"],
            difficulty=2,
        )

        self.assertEqual(Counter(item["type"] for item in items), {
            "mcq": 8,
            "fill": 4,
            "code": 3,
        })
        self.assertEqual(len({item["question"] for item in items}), 15)
        self.assertGreaterEqual(len({item["difficulty"] for item in items}), 2)
        self.assertTrue(all(item["source"].startswith("FDE 岗位知识库") for item in items))
        self.assertTrue(all("哪项表述最准确" not in item["question"] for item in items))
        self.assertTrue(all("哪项材料" not in item["question"] for item in items))
        self.assertTrue(all("梯度下降" not in item["question"] for item in items))
        self.assertTrue(all("Adam" not in item["question"] for item in items))
        mcq_items = [item for item in items if item["type"] == "mcq"]
        self.assertTrue(all(max(map(len, item["options"])) <= 80 for item in mcq_items))
        self.assertTrue(all(max(map(len, item["options"])) - min(map(len, item["options"])) <= 55 for item in mcq_items))
        self.assertTrue(all("“" not in item["question"] for item in items if item["type"] == "fill"))

    def test_maximum_size_fallback_still_has_unique_questions(self):
        items = _grounded_mock_fill(
            16,
            8,
            6,
            reference_materials=MATERIALS[:1],
            competencies=["需求澄清"],
            difficulty=3,
        )

        self.assertEqual(len(items), 30)
        self.assertEqual(len({item["question"] for item in items}), 30)


class GeneratedQuizQualityGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_model_items_are_replaced_with_grounded_variants(self):
        duplicate = {
            "type": "mcq",
            "question": "关于“需求澄清”的哪项表述最准确？",
            "options": ["A", "B", "C", "D"],
            "answer": 0,
            "explanation": "解析",
            "difficulty": 2,
            "competency": "需求澄清",
            "source": MATERIALS[0]["source"],
        }
        fake_llm = AsyncMock()
        fake_llm.chat_structured.return_value = json.dumps(
            {"items": [duplicate, dict(duplicate)]},
            ensure_ascii=False,
        )

        with (
            patch("app.agents.quiz_agent.has_llm_key", return_value=True),
            patch("app.agents.quiz_agent.get_llm_client", return_value=fake_llm),
        ):
            items = await generate_quiz_batch(
                topic="综合复习",
                course_name="FDE 岗位知识库",
                persona="FDE 岗位训练助理",
                difficulty=2,
                mcq_count=4,
                fill_count=2,
                code_count=1,
                target_role="前线部署工程师（FDE）",
                competencies=["需求澄清", "系统集成", "交付验证"],
                reference_materials=MATERIALS,
            )

        self.assertEqual(len(items), 7)
        self.assertEqual(len({item["question"] for item in items}), 7)
        self.assertEqual(Counter(item["type"] for item in items), {
            "mcq": 4,
            "fill": 2,
            "code": 1,
        })
        self.assertLessEqual(
            sum("哪项表述最准确" in item["question"] for item in items),
            1,
        )
        self.assertGreaterEqual(len({item["difficulty"] for item in items}), 2)

    async def test_code_grading_connection_failure_has_user_facing_message(self):
        fake_llm = AsyncMock()
        fake_llm.chat_structured.side_effect = ConnectionError("temporary")
        with (
            patch("app.agents.quiz_agent.has_llm_key", return_value=True),
            patch("app.agents.quiz_agent.get_llm_client", return_value=fake_llm),
        ):
            score, reason = await judge_code_with_llm(
                question="实现检查函数",
                reference="return True",
                user_code="return False",
            )

        self.assertEqual(score, 0)
        self.assertIn("暂时不可用", reason)
        self.assertNotIn("APIConnectionError", reason)


class QuizRoleContextTests(unittest.TestCase):
    def test_theory_evidence_and_material_topics_define_role_context(self):
        role, competencies = _role_quiz_context(
            profile_dims={
                "theory_assessments": {
                    "fde": {
                        "course_id": 6,
                        "role_name": "前线部署工程师（FDE）",
                        "competency_scores": {"需求澄清": 50, "交付验证": 50},
                    },
                },
                "weak_points": {"topics": ["系统集成"]},
                "goals": {"target_topics": ["Python 与 SQL"]},
            },
            course_id=6,
            course_name="FDE 岗位知识库",
            materials=MATERIALS,
        )

        self.assertEqual(role, "前线部署工程师（FDE）")
        self.assertTrue({"需求澄清", "系统集成", "交付验证", "产品反馈"}.issubset(competencies))


if __name__ == "__main__":
    unittest.main()
