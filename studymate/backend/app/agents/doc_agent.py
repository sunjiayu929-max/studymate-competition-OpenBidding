"""
DocAgent —— 个性化讲解文档生成。
亮点：
  1. 流式输出 Markdown，前端实时渲染
  2. **自动在适当位置插入 [n] 引用编号，n 对应检索命中的 chunk index**
  3. mock 模式有完整模板，未配 LLM Key 也能演示
"""
from __future__ import annotations
import asyncio
import json

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


class DocAgent(AgentBase):
    meta = AgentMeta(
        id="doc",
        name="定制讲义生成 Agent",
        icon="📄",
        color="indigo",
        description="生成面向目标岗位、带来源标注的定制讲义",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "机器学习")
        profile = context.get("profile", {})
        chunks = context.get("chunks", [])
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        domain = context.get("domain", course_name)
        target_role = context.get("target_role", f"{course_name}应用工程师")
        core_competencies = [str(item) for item in context.get("core_competencies") or []]
        revision_feedback = (context.get("revision_feedback") or {}).get("doc", [])
        training_plan = context.get("training_plan") or {}
        persona = course_cfg.persona if course_cfg else f"{course_name}岗位训练助理"

        # 构造引用块的简短表示传给 LLM（每条 ≤ 80 字）
        ref_block = "\n".join(
            f"[{i+1}] {c['source']} p.{c.get('page','-')}: {c['content'][:90]}"
            for i, c in enumerate(chunks)
        )
        citations = [
            {
                "index": i + 1,
                "chunk_id": c["chunk_id"],
                "source": c["source"],
                "page": c.get("page"),
                "url": c.get("url"),
                "snippet": c["content"][:200],
            }
            for i, c in enumerate(chunks)
        ]

        if not has_llm_key():
            # mock 模式：输出固定但好看的 markdown，演示视频里看起来跟真的一样
            content = await self._stream_mock(topic, course_name, target_role, core_competencies, citations, revision_feedback, emit)
        else:
            try:
                content = await self._stream_real(
                    topic,
                    profile,
                    ref_block,
                    persona,
                    course_name,
                    emit,
                    domain=domain,
                    target_role=target_role,
                    training_plan=training_plan,
                    revision_feedback=revision_feedback,
                )
                if not content.strip():
                    raise RuntimeError("empty LLM output")
            except Exception as e:
                await self.emit_delta(emit, f"\n\n> ⚠️ LLM 调用失败（{type(e).__name__}），降级到本地模板\n\n", kind="markdown")
                content = await self._stream_mock(topic, course_name, target_role, core_competencies, citations, revision_feedback, emit)

        return {
            "type": "doc",
            "title": f"《{topic}》岗位定制讲义",
            "content": content,
            "citations": citations,
            "version": int(context.get("generation_round", 1)),
            "target_role": target_role,
            "revision_response": [
                str(item.get("suggestion", item)) if isinstance(item, dict) else str(item)
                for item in revision_feedback
            ],
        }

    async def _stream_mock(
        self,
        topic: str,
        course_name: str,
        target_role: str,
        core_competencies: list[str],
        citations: list,
        revision_feedback: list[dict],
        emit,
    ) -> str:
        # 用首两条引用，模拟"基于 RAG 生成"的效果
        c1 = "[1]" if citations else ""
        c2 = "[2]" if len(citations) >= 2 else c1
        tmpl = f"""# {topic} · 个性化讲解

## 1. 一句话定义

{topic} 是{course_name}中的核心概念之一{c1}。理解它能帮你后续掌握更高级的内容。

## 2. 岗位任务与能力覆盖

本轮面向 **{target_role}**，围绕“{topic}”训练以下岗位能力：{'、'.join(core_competencies) or '任务分析、工程实现与交付验证'}{c1}。这些能力需要在讲义理解、实操交付和分阶测试中形成相互印证的证据。

## 3. 直觉理解

想象你在浓雾中下山：每一步都看脚下的坡度，朝最陡的下坡方向走一小步。这正是 {topic} 的核心思想{c2}。

## 4. 形式化

设损失函数 $L(\\theta)$，参数更新规则：

$$\\theta_{{t+1}} = \\theta_t - \\eta \\nabla L(\\theta_t)$$

其中 $\\eta$ 是学习率。

## 5. 一份最小可运行代码

```python
import numpy as np

def gradient_descent(x, y, lr=0.01, n_iter=1000):
    w, b = 0.0, 0.0
    for _ in range(n_iter):
        y_hat = w * x + b
        dw = -2 * np.mean(x * (y - y_hat))
        db = -2 * np.mean(y - y_hat)
        w -= lr * dw
        b -= lr * db
    return w, b
```

## 6. 常见误区

- **学习率过大** → 发散；**学习率过小** → 收敛慢
- 在非凸函数上可能陷入局部最优
- 大数据集用 mini-batch 随机梯度下降而非全批量{c1}

## 7. 下一步

完成右侧练习题，回到学习路径上继续推进。
"""
        if revision_feedback:
            fixes = "\n".join(f"- {item.get('suggestion', item)}" for item in revision_feedback)
            tmpl += f"\n## 8. 自动返工修订\n\n{fixes}\n"
        # 模拟流式：按字符 yield，但每 20 字符一次以加快演示
        chunk_size = 5
        for i in range(0, len(tmpl), chunk_size):
            await self.emit_delta(emit, tmpl[i:i + chunk_size], kind="markdown")
            await asyncio.sleep(0.02)
        return tmpl

    async def _stream_real(
        self,
        topic: str,
        profile: dict,
        ref_block: str,
        persona: str,
        course_name: str,
        emit,
        *,
        domain: str = "垂直领域",
        target_role: str = "领域应用工程师",
        training_plan: dict | None = None,
        revision_feedback: list[str] | None = None,
    ) -> str:
        llm = get_llm_client()
        sys_prompt = f"""你是一位{persona}，正在为学习者生成{domain}领域、目标岗位“{target_role}”下「{topic}」的个性化岗位讲义。

【学生画像】
{json.dumps(profile, ensure_ascii=False)}

【多 Agent 仲裁后的训练计划】
{json.dumps(training_plan or {}, ensure_ascii=False)}

【可用的知识库引用】（必须用 [n] 形式引用）
{ref_block}

【审核返工要求】
{json.dumps(revision_feedback or [], ensure_ascii=False)}

【输出要求】
1. Markdown 格式，包含：岗位任务 / 核心概念 / 实施方法 / 示例 / 风险与误区 / 下一步 等小节
2. 关键论断后必须用 [n] 引用对应知识源，n 从 1 开始
3. 数学公式用 $$...$$ 或 $...$（KaTeX 兼容）
4. 代码块用 ```python ... ```
5. 篇幅 600-900 字
6. 根据画像调整难度和示例，且必须服务于训练计划中的优先能力、任务成果与验收标准

【语言要求（必须严格遵守）】
- 全文必须使用**简体中文**，包括小节标题、正文、解释、误区说明
- 专有术语 / 算法名 / API 名（如 K-Means、Gradient Descent、numpy）可以保留英文
- 即使主题输入是英文（如 "K-Means"），讲解正文也必须用简体中文，禁止整段英文输出
- 代码注释用简体中文，代码本身的标识符保留英文
"""
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"请为我讲解：{topic}"},
        ]
        buf = ""
        async for tok in llm.chat_stream(messages=messages, temperature=0.6):
            buf += tok
            await self.emit_delta(emit, tok, kind="markdown")
        return buf
