from __future__ import annotations

import unittest

from app.agents.path_agent import PathAgent
from app.api.tutor import _system_prompt


class TutorFormattingPromptTests(unittest.TestCase):
    def test_plain_explanations_are_not_requested_as_code_blocks(self):
        prompt = _system_prompt(None, "课程助教", "机器学习")
        self.assertIn("普通解释、公式推导和自然语言段落不得放进代码块", prompt)
        self.assertIn("只有实际代码、命令或配置片段才使用三反引号", prompt)


class SerpentinePathTests(unittest.TestCase):
    def setUp(self):
        self.agent = PathAgent()

    def test_mock_path_is_strictly_linear(self):
        nodes = self.agent._mock_nodes("梯度下降")
        self.assertEqual(nodes[0]["deps"], [])
        for index, node in enumerate(nodes[1:], start=1):
            self.assertEqual(node["deps"], [nodes[index - 1]["id"]])

    def test_layout_turns_back_after_four_nodes(self):
        raw_nodes = [
            {
                "id": f"n{index + 1}",
                "title": f"阶段{index + 1}",
                "desc": "测试",
                "deps": [] if index == 0 else [f"n{index}"],
            }
            for index in range(7)
        ]
        layout = self.agent._layout(raw_nodes)
        positions = [node["position"] for node in layout["nodes"]]

        self.assertEqual([item["y"] for item in positions[:4]], [0, 0, 0, 0])
        self.assertEqual([item["x"] for item in positions[:4]], sorted(item["x"] for item in positions[:4]))
        self.assertEqual([item["y"] for item in positions[4:]], [170, 170, 170])
        self.assertEqual([item["x"] for item in positions[4:]], sorted((item["x"] for item in positions[4:]), reverse=True))
        self.assertEqual(positions[3]["x"], positions[4]["x"])
        self.assertEqual(len(layout["edges"]), 6)


if __name__ == "__main__":
    unittest.main()
