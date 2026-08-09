"""
MindMapAgent —— 思维导图生成。
输出 Markmap 兼容的 Markdown（前端用 markmap-view 直接渲染成可交互思维导图）。
"""
from __future__ import annotations
import asyncio

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


MOCK_TEMPLATES: dict[str, str] = {
    "梯度下降": """# 梯度下降

## 核心思想
- 沿损失函数负梯度方向更新参数
- 学习率控制步长

## 变体
- 批量 GD：全样本
- 随机 SGD：单样本
- 小批量：折中（DL 标配）

## 改进
- Momentum 动量
- Adagrad 自适应
- **Adam**：动量 + 自适应

## 调参经验
- 学习率：先 1e-3，按 10 倍调
- Warmup：前期线性升高
- 调度：CosineAnnealing
""",
    "PCA": """# PCA 主成分分析

## 目的
- 降维 / 可视化 / 去相关

## 数学
- 协方差矩阵特征分解
- 等价 SVD 分解

## 步骤
- 中心化数据
- 计算协方差矩阵 C
- 特征分解 → 取最大 k 个特征向量
- 投影到主成分空间

## 应用
- 数据可视化（→ 2D / 3D）
- 特征压缩
- 噪声去除

## 局限
- 仅线性，非线性用 Kernel PCA / t-SNE
""",
}


def _default_mindmap(topic: str) -> str:
    return f"""# {topic}

## 是什么
- 核心定义
- 应用场景

## 怎么做
- 输入与输出
- 关键步骤
- 数学原理

## 注意点
- 常见陷阱
- 调参经验

## 拓展
- 进阶变体
- 相关概念
"""


class MindMapAgent(AgentBase):
    meta = AgentMeta(
        id="mindmap",
        name="思维导图 Agent",
        icon="🧭",
        color="rose",
        description="生成 Markmap 兼容的知识脑图",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "岗位任务")
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        persona = course_cfg.persona if course_cfg else f"{course_name}岗位训练助理"

        if not has_llm_key():
            md = await self._stream_template(topic, emit)
        else:
            try:
                md = await self._stream_real(topic, persona, course_name, emit)
                if not md.strip():
                    raise RuntimeError("empty LLM output")
            except Exception as e:
                await self.emit_delta(emit, f"\n[LLM 失败，降级到模板：{type(e).__name__}]\n", kind="markdown")
                md = await self._stream_template(topic, emit)

        return {
            "type": "mindmap",
            "title": f"《{topic}》思维导图",
            "content": md,   # Markmap 直接消费
        }

    def _pick_template(self, topic: str) -> str:
        for k, v in MOCK_TEMPLATES.items():
            if k in topic:
                return v
        return _default_mindmap(topic)

    async def _stream_template(self, topic: str, emit) -> str:
        md = self._pick_template(topic)
        for i in range(0, len(md), 4):
            await self.emit_delta(emit, md[i:i + 4], kind="markdown")
            await asyncio.sleep(0.015)
        return md

    async def _stream_real(self, topic: str, persona: str, course_name: str, emit) -> str:
        llm = get_llm_client()
        sys = f"""你是一位{persona}，同时也是岗位能力结构梳理专家。请依据“{course_name}”岗位知识库，为任务或能力点「{topic}」生成一个 Markmap 兼容的思维导图（Markdown 格式）。
要求：
- 1 个一级标题（# 主题）
- 4-6 个二级标题（## 维度）
- 每个二级下 3-5 个三级要点（- 短语）
- 全部用短语，不要写整句
- 不要写额外解释，只输出 Markdown
"""
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": f"主题：{topic}"}]
        buf = ""
        async for tok in llm.chat_stream(messages=msgs, temperature=0.5):
            buf += tok
            await self.emit_delta(emit, tok, kind="markdown")
        return buf
