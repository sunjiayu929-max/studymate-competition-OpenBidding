from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.agents.eval_agent import _compute_basic_scores, _engagement_metrics
from app.agents.reading_agent import ReadingAgent
from app.api.quiz_sessions import _item_to_dict
from app.quiz import adaptive_error_tags, effective_error_tags
from app.rag.engine import Chunk, SearchHit
from app.rag.service import RAGService, relative_relevance_percent


class UnansweredTagTests(unittest.TestCase):
    def test_blank_answers_have_only_one_non_skill_tag(self):
        for item_type in ("mcq", "fill", "code"):
            tags = adaptive_error_tags(
                question="请计算梯度并处理边界条件",
                item_type=item_type,
                user_answer=None,
            )
            self.assertEqual(tags, ["未作答"])

    def test_legacy_mixed_tags_are_normalized_without_mutating_storage(self):
        stored = ["未作答", "公式计算"]
        self.assertEqual(
            effective_error_tags(
                question="计算梯度",
                item_type="fill",
                user_answer=None,
                stored_tags=stored,
            ),
            ["未作答"],
        )
        self.assertEqual(stored, ["未作答", "公式计算"])

        row = SimpleNamespace(
            id=1,
            idx=0,
            type="fill",
            question="计算梯度",
            options=[],
            starter="",
            answer_key={"value": "beta"},
            explanation="解析",
            difficulty=2,
            user_answer={"value": None},
            is_correct=False,
            score=0.0,
            judge_reason="",
            error_tags=stored,
        )
        self.assertEqual(_item_to_dict(row)["error_tags"], ["未作答"])


class EvaluationEvidenceTests(unittest.TestCase):
    def test_topic_difficulty_completion_and_coverage_are_explainable(self):
        scores = _compute_basic_scores([
            {"topic": "梯度下降", "difficulty": 1, "user_answer": "负梯度", "is_correct": True},
            {"topic": "梯度下降", "difficulty": 2, "user_answer": "未作答", "is_correct": False},
            {"topic": "正则化", "difficulty": 2, "user_answer": "L2", "is_correct": False},
        ])
        self.assertEqual(scores["answer_completion"], {"answered": 2, "total": 3, "rate": 0.67})
        self.assertEqual(scores["by_topic_difficulty"]["梯度下降"]["1"], {"correct": 1, "total": 1, "rate": 1.0})
        self.assertEqual(scores["by_topic_difficulty"]["梯度下降"]["2"], {"correct": 0, "total": 1, "rate": 0.0})

        score, breakdown, coverage = _engagement_metrics({
            "time_spent_min": 20,
            "resources_consumed": ["doc", "quiz", "doc"],
            "resources_available": ["doc", "quiz", "reading", "concept"],
        })
        self.assertEqual(score, 56)
        self.assertEqual(breakdown["time_score"], 40)
        self.assertEqual(breakdown["resource_variety_score"], 16)
        self.assertEqual(coverage, {"consumed": 2, "available": 4, "rate": 0.5})


class RagScoreTests(unittest.TestCase):
    def test_rrf_order_is_preserved_and_display_scores_are_distinct(self):
        first = Chunk(chunk_id="1", content="a", source="s")
        second = Chunk(chunk_id="2", content="b", source="s")
        lexical = [SearchHit(first, 10.0), SearchHit(second, 9.0)]
        semantic = [SearchHit(first, 0.9), SearchHit(second, 0.8)]
        fused = RAGService._rrf_fuse([lexical, semantic], k=2)
        self.assertEqual([hit.chunk.chunk_id for hit in fused], ["1", "2"])
        percents = [relative_relevance_percent(hit.score, 2) for hit in fused]
        self.assertEqual(percents[0], 100)
        self.assertGreater(percents[0], percents[1])
        self.assertTrue(all(0 <= value <= 100 for value in percents))


class ReadingLinkInputTests(unittest.TestCase):
    def test_only_https_document_candidates_survive_agent_normalization(self):
        blog = ReadingAgent._normalize({
            "title": "梯度下降博客",
            "type": "blog",
            "url": "https://blog.csdn.net/fabricated/article/details/1",
        })
        self.assertEqual(blog["url"], "")
        official = ReadingAgent._normalize({
            "title": "scikit-learn 文档",
            "type": "doc",
            "url": "https://scikit-learn.org/stable/modules/sgd.html",
        })
        self.assertEqual(official["url"], "https://scikit-learn.org/stable/modules/sgd.html")
        insecure = ReadingAgent._normalize({
            "title": "不安全文档",
            "type": "doc",
            "url": "http://example.com/doc",
        })
        self.assertEqual(insecure["url"], "")

    def test_matching_xfyun_official_docs_are_preferred_and_deduplicated(self):
        items = ReadingAgent._prefer_verified_sources(
            "语音识别与 ASR",
            [
                {
                    "title": "重复的讯飞文档",
                    "type": "doc",
                    "url": "https://www.xfyun.cn/doc/asr/voicedictation/API.html",
                    "source": "其它来源",
                },
                {"title": "普通教材", "type": "book", "url": "", "source": "教材"},
            ],
        )
        self.assertEqual(items[0]["source"], "讯飞开放平台")
        self.assertEqual(items[0]["url"], "https://www.xfyun.cn/doc/asr/voicedictation/API.html")
        self.assertEqual(sum(1 for item in items if item.get("url") == items[0]["url"]), 1)
        self.assertEqual(ReadingAgent._verified_xfyun_items("梯度下降"), [])


if __name__ == "__main__":
    unittest.main()
