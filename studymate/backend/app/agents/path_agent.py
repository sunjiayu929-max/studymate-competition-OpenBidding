"""
PathAgent —— 学习路径规划。
- LLM 生成 5-8 个节点 + 依赖关系
- 服务端按 deps 拓扑排序算 depth → 算 React Flow 友好的 position（同层水平等分）
- mock 模式有兜底
- 输出可直接交给 @xyflow/react 渲染
"""
from __future__ import annotations
import asyncio
import json

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


# React Flow 画布尺寸约定（前端 PathView 一致）
NODE_W = 220
NODE_H = 80
H_GAP = 80
V_GAP = 110


class PathAgent(AgentBase):
    meta = AgentMeta(
        id="path",
        name="路径 Agent",
        icon="🗺️",
        color="amber",
        description="规划个性化学习路径节点图",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "机器学习")
        profile = context.get("profile", {})
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        persona = course_cfg.persona if course_cfg else f"{course_name}课程助教"

        if not has_llm_key():
            raw_nodes = self._mock_nodes(topic, course_name)
        else:
            raw_nodes = await self._gen_real(topic, profile, persona, course_name, emit)

        layout = self._layout(raw_nodes)

        # 模拟"思考过程"流式输出（让前端 timeline 有进度感）
        msg = f"规划 {len(layout['nodes'])} 个学习节点 → {len(layout['edges'])} 条依赖边\n"
        for ch in msg:
            await self.emit_delta(emit, ch, kind="text")
            await asyncio.sleep(0.01)

        return {
            "type": "path",
            "title": f"《{topic}》学习路径",
            "nodes": layout["nodes"],
            "edges": layout["edges"],
            "count": len(layout["nodes"]),
        }

    async def _gen_real(self, topic: str, profile: dict, persona: str, course_name: str, emit) -> list[dict]:
        llm = get_llm_client()
        sys = f"""你是一位{persona}，同时是{course_name}课程设计专家。为《{course_name}》课程下的「{topic}」规划 5-7 个**渐进式**学习节点的路径。

输出**严格 JSON**（不要 Markdown 包裹），结构：
{{
  "nodes": [
    {{
      "id": "n1",
      "title": "节点标题（≤10字）",
      "desc": "一句话说明（≤30字）",
      "deps": []
    }},
    {{
      "id": "n2",
      "title": "...",
      "desc": "...",
      "deps": ["n1"]
    }}
  ]
}}

要求：
1. id 从 n1 开始递增
2. **学习路径是严格线性的**：n1.deps=[], n2.deps=["n1"], n3.deps=["n2"], ..., nk.deps=["n(k-1)"]
3. 每个节点只依赖**前一个**，不要出现多入度（避免出现"两个阶段并列"）
4. 第一个节点是"入门/前置"，最后一个节点是"综合应用/进阶"
5. 难度从画像 knowledge_base 推断：基础弱 → 节点更细更慢，基础强 → 节点更粗更进阶

**语言要求（必须严格遵守）**：
- 节点 title 和 desc 必须使用**简体中文**
- 专有术语 / 算法名（如 K-Means、Gradient Descent）可以保留英文
- 即使输入主题是英文，节点标题和说明也必须用简体中文，禁止整段英文

学生画像参考：{json.dumps(profile, ensure_ascii=False)}
"""
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": f"主题：{topic}"}]
        raw = await llm.chat_structured(messages=msgs, temperature=0.4)
        try:
            data = json.loads(raw)
            nodes = data.get("nodes", [])
            if not nodes:
                raise ValueError("empty nodes")
            return nodes
        except Exception:
            return self._mock_nodes(topic, course_name)

    def _mock_nodes(self, topic: str, course_name: str = "机器学习") -> list[dict]:
        return [
            {"id": "n1", "title": f"{course_name}前置", "desc": "基础概念 / 必要工具", "deps": []},
            {"id": "n2", "title": f"{topic} 概念", "desc": "定义、动机、应用场景", "deps": ["n1"]},
            {"id": "n3", "title": "核心原理", "desc": "公式推导 + 直觉理解", "deps": ["n2"]},
            {"id": "n4", "title": "动手实现", "desc": "从零写一次最小可运行版", "deps": ["n3"]},
            {"id": "n5", "title": "进阶与优化", "desc": "性能 / 边界 / 调优", "deps": ["n4"]},
            {"id": "n6", "title": "综合实战", "desc": "真实场景端到端", "deps": ["n4", "n5"]},
        ]

    def _layout(self, nodes: list[dict]) -> dict:
        """Kahn 拓扑排序得到唯一线性序号，每个节点 depth=序号，前端"阶段 N"全局唯一。

        x 坐标随序号水平排开；超过 PER_ROW 折行，避免画布过宽。
        """
        from collections import deque

        id2node = {n["id"]: n for n in nodes}
        in_deg: dict[str, int] = {nid: 0 for nid in id2node}
        children: dict[str, list[str]] = {nid: [] for nid in id2node}
        for n in nodes:
            for dep in (n.get("deps") or []):
                if dep in id2node:
                    in_deg[n["id"]] += 1
                    children[dep].append(n["id"])

        # 入度 0 的节点按 id 字典序入队，保证稳定输出
        queue: deque[str] = deque(sorted([nid for nid, d in in_deg.items() if d == 0]))
        order: list[str] = []
        while queue:
            nid = queue.popleft()
            order.append(nid)
            for c in sorted(children[nid]):
                in_deg[c] -= 1
                if in_deg[c] == 0:
                    queue.append(c)

        # 残留（有环时）按 id 兜底追加
        for nid in id2node:
            if nid not in order:
                order.append(nid)

        # 每个节点拿到唯一序号 = depth；横向排开，6 个一行折行
        PER_ROW = 6
        rf_nodes: list[dict] = []
        for i, nid in enumerate(order):
            n = id2node[nid]
            row = i // PER_ROW
            col = i % PER_ROW
            x = col * (NODE_W + H_GAP)
            y = row * (NODE_H + V_GAP)
            rf_nodes.append({
                "id": nid,
                "position": {"x": x, "y": y},
                "data": {
                    "title": n.get("title", nid),
                    "desc": n.get("desc", ""),
                    "depth": i,
                },
                "type": "default",
            })

        rf_edges: list[dict] = []
        for n in nodes:
            for dep in (n.get("deps") or []):
                if dep in id2node:
                    rf_edges.append({
                        "id": f"e-{dep}-{n['id']}",
                        "source": dep,
                        "target": n["id"],
                        "animated": True,
                    })

        return {"nodes": rf_nodes, "edges": rf_edges}
