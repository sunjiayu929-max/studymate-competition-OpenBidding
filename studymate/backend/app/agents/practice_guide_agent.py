"""岗位实操指南生成 Agent。"""
from __future__ import annotations

import asyncio
import json

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


class PracticeGuideAgent(AgentBase):
    meta = AgentMeta(
        id="guide",
        name="实操指南生成 Agent",
        icon="🧰",
        color="amber",
        description="生成含验收、异常处理与安全边界的岗位实操指南",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "岗位任务")
        domain = context.get("domain", "垂直领域")
        target_role = context.get("target_role", "领域应用工程师")
        diagnosis = context.get("diagnosis") or {}
        training_plan = context.get("training_plan") or {}
        chunks = context.get("chunks") or []
        revision_feedback = (context.get("revision_feedback") or {}).get("guide", [])
        version = int(context.get("generation_round", 1))
        citations = [
            {
                "index": index + 1,
                "chunk_id": chunk["chunk_id"],
                "source": chunk["source"],
                "page": chunk.get("page"),
                "url": chunk.get("url"),
                "snippet": chunk["content"][:200],
            }
            for index, chunk in enumerate(chunks)
        ]

        if has_llm_key():
            try:
                content = await self._stream_real(
                    topic=topic,
                    domain=domain,
                    target_role=target_role,
                    diagnosis=diagnosis,
                    training_plan=training_plan,
                    chunks=chunks,
                    revision_feedback=revision_feedback,
                    emit=emit,
                )
                if not content.strip():
                    raise RuntimeError("empty practice guide")
            except Exception:
                content = await self._stream_mock(topic, target_role, diagnosis, citations, revision_feedback, emit)
        else:
            content = await self._stream_mock(topic, target_role, diagnosis, citations, revision_feedback, emit)

        return {
            "type": "guide",
            "title": f"《{topic}》岗位实操指南",
            "content": content,
            "citations": citations,
            "version": version,
            "target_difficulty": diagnosis.get("target_difficulty", 2),
            "target_role": target_role,
            "revision_response": [
                str(item.get("suggestion", item)) if isinstance(item, dict) else str(item)
                for item in revision_feedback
            ],
        }

    async def _stream_mock(
        self,
        topic: str,
        target_role: str,
        diagnosis: dict,
        citations: list[dict],
        revision_feedback: list[str],
        emit: EventEmitter,
    ) -> str:
        ref1 = "[1]" if citations else ""
        ref2 = "[2]" if len(citations) > 1 else ref1
        revision = "\n".join(
            f"- {item.get('suggestion', item) if isinstance(item, dict) else item}"
            for item in revision_feedback
        )
        content = f"""# {topic} · 岗位实操指南

> 目标岗位：{target_role}  
> 建议难度：{diagnosis.get('target_difficulty', 2)} / 4  
> 当前水平：{diagnosis.get('current_level', '待诊断')}

## 1. 任务目标与验收标准

完成一轮“准备输入—执行核心步骤—验证输出—记录异常”的受控实践，并能说明每一步的岗位价值{ref1}。

## 2. 环境与前置条件

- 使用隔离的练习数据与本地环境，不连接真实生产设备。
- 已理解本轮主题的基本术语；若诊断中的薄弱点仍未掌握，先完成对应讲义。
- 保存输入版本、参数和运行日志，确保结果可复现{ref2}。

## 3. 操作步骤

1. **确认输入**：检查数据、配置和任务目标是否一致，记录版本与校验结果。
2. **建立基线**：使用最小可运行方案得到基线输出，不直接进行复杂优化。
3. **执行任务**：按讲义中的核心方法完成实现，并记录关键参数和中间结果。
4. **验证结果**：根据验收指标检查正确性、覆盖范围与边界情况。
5. **形成记录**：保存结论、失败样本和下一轮改进项。

## 4. 预期结果

- 能获得一份可复现的运行结果和验证记录。
- 能指出至少一个成功证据和一个仍需改进的边界问题。
- 输出与本轮目标岗位和训练主题一致。

## 5. 异常处理

- 输入检查失败：停止执行，修正数据或配置后重新建立基线。
- 结果明显异常：回退最近一次有效版本，对比参数、日志和失败样本。
- 缺少专业依据：标记“证据不足”，不得自行补造行业阈值或规范。

## 6. 安全边界

- 本指南默认用于教学仿真，不代表真实生产环境操作授权。
- 不执行未经过审核的高风险命令，不上传含个人或企业敏感信息的数据。
- 领域知识库没有覆盖的结论必须标记证据不足，并触发自动补证返工。

## 7. 验收清单

- [ ] 环境、数据和版本已记录
- [ ] 核心步骤均有预期结果
- [ ] 至少验证一个正常场景和一个异常场景
- [ ] 专业结论可以追溯到知识来源
- [ ] 失败时有停止、回退或自动纠偏路径
"""
        if revision:
            content += f"\n## 8. 本轮审核修订\n\n{revision}\n"
        for start in range(0, len(content), 16):
            await self.emit_delta(emit, content[start:start + 16], kind="markdown")
            await asyncio.sleep(0.004)
        return content

    async def _stream_real(
        self,
        *,
        topic: str,
        domain: str,
        target_role: str,
        diagnosis: dict,
        training_plan: dict,
        chunks: list[dict],
        revision_feedback: list[str],
        emit: EventEmitter,
    ) -> str:
        references = "\n".join(
            f"[{index + 1}] {item['source']} p.{item.get('page') or '-'}: {item['content'][:120]}"
            for index, item in enumerate(chunks)
        )
        quality_contract = training_plan.get("quality_contract") or {}
        required_points = training_plan.get("required_knowledge_points") or []
        required_text = "、".join(
            str(item.get("point", item.get("knowledge_point", item))) if isinstance(item, dict) else str(item)
            for item in required_points
        ) or "训练计划中的核心知识点"
        system = f"""你是{domain}领域的{target_role}实训专家。请严格依据知识库生成《{topic}》岗位实操指南。

学情诊断：{json.dumps(diagnosis, ensure_ascii=False)}
多 Agent 仲裁训练计划：{json.dumps(training_plan, ensure_ascii=False)}
知识库依据：
{references}
审核返工要求：{json.dumps(revision_feedback, ensure_ascii=False)}
质量合同：{json.dumps(quality_contract, ensure_ascii=False)}
本主题必须覆盖的黄金知识点：{required_text}

必须使用 Markdown，并完整包含以下标题：
任务目标与验收标准、环境与前置条件、操作步骤、预期结果、异常处理、安全边界、验收清单。
每个专业结论使用 [n] 引用；没有依据时明确写“证据不足，触发自动补证返工”，不得编造。
操作步骤必须包含输入、操作、预期结果和失败处理，默认使用教学仿真环境；验收清单必须呼应训练计划的成果证据与验收标准。
对每个黄金知识点给出实际操作、检查项或验收证据；资料没有支持的具体阈值、版本或设备条件不得自行编造。
"""
        buffer = ""
        async for token in get_llm_client().chat_stream(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": f"生成 {topic} 的实操指南"}],
            temperature=0.35,
        ):
            buffer += token
            await self.emit_delta(emit, token, kind="markdown")
        return buffer
