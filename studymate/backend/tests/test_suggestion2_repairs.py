from __future__ import annotations

import importlib.util
import sys
import types
import unittest

if importlib.util.find_spec("openai") is None:
    openai_stub = types.ModuleType("openai")

    class AsyncOpenAI:  # pragma: no cover - 仅让纯逻辑测试在精简 Python 环境中可导入
        pass

    openai_stub.AsyncOpenAI = AsyncOpenAI
    sys.modules["openai"] = openai_stub

if importlib.util.find_spec("pydantic_settings") is None:
    llm_stub = types.ModuleType("app.llm")
    llm_stub.has_llm_key = lambda *_args, **_kwargs: False

    def _missing_client(*_args, **_kwargs):
        raise RuntimeError("精简测试环境未加载 LLM 客户端")

    llm_stub.get_llm_client = _missing_client
    sys.modules["app.llm"] = llm_stub

from app.agents.eval_agent import apply_profile_delta, sanitize_profile_delta
from app.agents.profile_agent import (
    build_profile_completion_guidance,
    build_profile_evidence_text,
    extract_profile_patch,
    merge_patch,
    sanitize_profile_patch,
)
from app.api.bili import _core_terms, _rank_videos, _resolve_query
from app.integrations.rencaiya import _course_match_level, _topic_terms
from app.schemas.profile import ProfileDims


class ProfilePatchTests(unittest.TestCase):
    def test_extracts_json_from_code_fence_and_trailing_text(self):
        patch, warning = extract_profile_patch(
            '```json\n{"employment_skills":{"programming":3}}\n```\n以上是更新'
        )
        self.assertEqual(patch["employment_skills"]["programming"], 3)
        self.assertIsNotNone(warning)

    def test_keeps_valid_fields_and_supplements_explicit_project_evidence(self):
        current = ProfileDims()
        patch, warning = sanitize_profile_patch(
            {
                "knowledge_base": {"math": 4, "programming": "bad", "unknown": 3},
                "employment_skills": {"algorithms": 9},
                "reasoning": "用户提供了项目经历",
            },
            current,
            "我在项目中使用过 Python 和 FastAPI，完成了接口测试并部署上线。",
        )
        self.assertEqual(patch["knowledge_base"], {"math": 4})
        self.assertEqual(patch["employment_skills"]["algorithms"], 5)
        self.assertEqual(patch["employment_skills"]["programming"], 3)
        self.assertEqual(patch["employment_skills"]["engineering"], 3)
        self.assertIsNotNone(warning)

        merged = merge_patch(current, patch)
        self.assertEqual(merged.knowledge_base.math, 4)
        self.assertEqual(merged.employment_skills.programming, 3)

    def test_future_intent_does_not_become_employment_evidence(self):
        patch, warning = sanitize_profile_patch(
            {"goals": {"primary": "后端开发"}},
            ProfileDims(),
            "我想做后端开发项目，也对 AI 很感兴趣。",
        )
        self.assertEqual(patch["goals"]["primary"], "后端开发")
        self.assertNotIn("employment_skills", patch)
        self.assertIsNone(warning)

    def test_prior_user_message_can_supply_employment_evidence_on_completion_turn(self):
        evidence_text = build_profile_evidence_text(
            [
                {"role": "user", "content": "我在项目中使用过 Python 和 FastAPI，完成了接口测试并部署上线。"},
                {"role": "assistant", "content": "还需要补充你的每周学习时间。"},
            ],
            "每周学习 8 小时，没有其他信息了。",
        )
        patch, warning = sanitize_profile_patch({}, ProfileDims(), evidence_text)
        self.assertEqual(patch["employment_skills"]["programming"], 3)
        self.assertEqual(patch["employment_skills"]["engineering"], 3)
        self.assertIsNone(warning)

    def test_explicitly_having_no_experience_keeps_employment_unassessed(self):
        patch, warning = sanitize_profile_patch(
            {},
            ProfileDims(),
            "我目前没有做过项目，也没有实习经历。",
        )
        self.assertNotIn("employment_skills", patch)
        self.assertIsNone(warning)

    def test_mixed_negative_and_positive_experience_keeps_real_project_evidence(self):
        patch, warning = sanitize_profile_patch(
            {},
            ProfileDims(),
            "我没有实习经历，但在课程项目中使用过 Python，并完成了接口部署。",
        )
        self.assertEqual(patch["employment_skills"]["programming"], 3)
        self.assertEqual(patch["employment_skills"]["engineering"], 3)
        self.assertIsNone(warning)

    def test_completion_guidance_distinguishes_unassessed_employment(self):
        missing = build_profile_completion_guidance(ProfileDims())
        self.assertIn("尚无可信实践证据", missing)
        self.assertIn("只追问一个", missing)

        with_evidence = ProfileDims()
        with_evidence.employment_skills.programming = 2
        ready = build_profile_completion_guidance(with_evidence)
        self.assertIn("至少一项可信实践证据", ready)


class EvalDeltaTests(unittest.TestCase):
    def test_legacy_floats_convert_to_integer_steps(self):
        delta = sanitize_profile_delta(
            {
                "knowledge_base": {"math": 0.49, "programming": 0.5, "subject_prior": -0.5},
                "employment_skills": {"engineering": 0.6, "professional": 1, "systems": True},
            }
        )
        self.assertEqual(delta["knowledge_base"], {"programming": 1, "subject_prior": -1})
        self.assertEqual(delta["employment_skills"], {"engineering": 1})

    def test_projection_and_application_use_the_same_bounded_math(self):
        current = ProfileDims().model_dump()
        current["knowledge_base"]["math"] = 3
        current["employment_skills"]["programming"] = 0
        next_dims = apply_profile_delta(
            current,
            {
                "knowledge_base": {"math": -0.5},
                "employment_skills": {"programming": 0.5, "engineering": -1},
            },
        )
        self.assertEqual(next_dims["knowledge_base"]["math"], 2)
        self.assertEqual(next_dims["employment_skills"]["programming"], 1)
        self.assertEqual(next_dims["employment_skills"]["engineering"], 0)


class ExternalResourceRelevanceTests(unittest.TestCase):
    def test_bili_cpu_query_keeps_instruction_cycle_and_hides_game_collision(self):
        resolved = _resolve_query("CPU 取指执行周期", None)
        terms = _core_terms("CPU 取指执行周期", None, resolved)
        candidates = [
            {
                "bvid": "good",
                "title": "计算机组成原理：CPU 取指、译码与执行",
                "play": 100,
                "_search_text": "计算机组成原理 CPU 取指 译码 执行 指令周期 408",
            },
            {
                "bvid": "game",
                "title": "脑叶公司全指令攻略",
                "play": 99999,
                "_search_text": "脑叶公司 游戏攻略 指令 执行",
            },
        ]
        ranked = _rank_videos(candidates, terms, "计算机组成原理", 6)
        self.assertEqual([video["bvid"] for video in ranked], ["good"])
        self.assertNotIn("_search_text", ranked[0])

    def test_rencaiya_course_level_hardware_is_not_a_topic_match(self):
        query = "CPU 取指执行周期"
        terms = _topic_terms(query, query)
        broad = {
            "title": "计算机硬件基础",
            "summary": "认识计算机硬件组成与基础工作原理。",
        }
        precise = {
            "title": "CPU 指令周期",
            "summary": "学习取指、译码和执行过程。",
        }
        self.assertEqual(
            _course_match_level(broad, terms, query, "计算机组成原理"),
            "course",
        )
        self.assertEqual(
            _course_match_level(precise, terms, query, "计算机组成原理"),
            "exact",
        )


if __name__ == "__main__":
    unittest.main()
