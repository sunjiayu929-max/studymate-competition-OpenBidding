"""训练计划协商 Agent。

领域专家与教学策略角色先独立提案，再由计划仲裁角色解决覆盖度、时间预算和
训练难度之间的冲突。输出是资源生成 Agent 共同遵守的结构化训练合同。
"""
from __future__ import annotations

from app.agents.base import AgentBase, AgentMeta, EventEmitter


def _best_preference(profile: dict) -> str:
    preferences = profile.get("preference") or {}
    labels = {
        "document": "结构化讲义",
        "mindmap": "图谱梳理",
        "quiz": "即时测试",
        "code": "代码实操",
        "video": "视听讲解",
        "reading": "延伸阅读",
    }
    scored = [(int(value), labels.get(key, key)) for key, value in preferences.items() if isinstance(value, (int, float))]
    return max(scored, default=(0, "讲练结合"))[1]


class DomainExpertAgent(AgentBase):
    meta = AgentMeta(
        id="domain_expert",
        name="领域专家 Agent",
        icon="🧠",
        color="indigo",
        description="依据岗位标准与知识库提出专业覆盖和验收要求",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        diagnosis = context.get("diagnosis") or {}
        competencies = [str(item) for item in context.get("core_competencies") or []]
        gaps = [str(item) for item in diagnosis.get("knowledge_gaps") or []]
        priority = [item for item in gaps if item in competencies]
        priority.extend(item for item in competencies if item not in priority)
        priority = priority[:3]
        chunks = context.get("chunks") or []
        topic = str(context.get("topic") or "岗位核心任务")
        proposal = {
            "type": "expert_proposal",
            "role": "领域专家",
            "position": f"本轮必须围绕“{topic}”覆盖 {len(priority)} 项岗位能力，并形成可复核成果",
            "priority_competencies": priority,
            "required_evidence": ["岗位知识库引用", "可复现的操作记录", "正常与异常场景验证"],
            "acceptance_criteria": [
                "目标、输入、约束与验收口径完整",
                "关键专业结论能够追溯到知识来源",
                "实操过程包含结果验证、异常处理与安全边界",
            ],
            "source_count": len(chunks),
            "source_policy": "证据不足时明确标注并触发自动补证返工，不补造行业事实",
            "risk": "过度压缩训练范围会造成岗位核心能力覆盖不足",
            "debate_round": int(context.get("planning_round", 1)),
            "response_to_feedback": list((context.get("planning_revision_feedback") or {}).get(self.meta.id, [])),
        }
        await emit("proposal", {"agent": self.meta.id, **proposal})
        return proposal


class LearningStrategyAgent(AgentBase):
    meta = AgentMeta(
        id="learning_strategy",
        name="教学策略 Agent",
        icon="🪜",
        color="sky",
        description="依据画像、时间预算与认知负荷提出学习节奏",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        profile = context.get("profile") or {}
        pace = profile.get("pace") or {}
        hours = int(pace.get("hours_per_week") or 5)
        diagnosis = context.get("diagnosis") or {}
        difficulty = int(diagnosis.get("target_difficulty") or 1)
        capacity = 1 if hours <= 3 else 2 if hours <= 7 else 3
        proposal = {
            "type": "strategy_proposal",
            "role": "教学策略",
            "position": f"每周 {hours} 小时预算下，本轮聚焦 {capacity} 项核心能力，按理解—实操—验证推进",
            "weekly_hours": hours,
            "capacity": capacity,
            "preferred_mode": _best_preference(profile),
            "target_difficulty": difficulty,
            "sequence": ["用定制讲义建立任务模型", "按实操指南完成交付物", "用分阶测试验证迁移能力"],
            "risk": "一次覆盖过多能力会增加认知负荷并削弱成果质量",
            "debate_round": int(context.get("planning_round", 1)),
            "response_to_feedback": list((context.get("planning_revision_feedback") or {}).get(self.meta.id, [])),
        }
        await emit("proposal", {"agent": self.meta.id, **proposal})
        return proposal


class PlanArbiterAgent(AgentBase):
    meta = AgentMeta(
        id="plan_arbiter",
        name="训练计划仲裁 Agent",
        icon="🧩",
        color="violet",
        description="解决专业覆盖与时间预算冲突，形成资源生成合同",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        proposals = context.get("planning_proposals") or {}
        expert = proposals.get("domain_expert") or {}
        strategy = proposals.get("learning_strategy") or {}
        expert_priority = list(expert.get("priority_competencies") or [])
        capacity = max(1, int(strategy.get("capacity") or 1))
        selected = expert_priority[:capacity]
        deferred = expert_priority[capacity:]
        diagnosis = context.get("diagnosis") or {}
        topic = str(context.get("topic") or "岗位核心任务")
        target_role = str(context.get("target_role") or "目标岗位")
        acceptance = list(expert.get("acceptance_criteria") or [])
        required_fixes: list[str] = []
        rework_targets: list[str] = []
        if not expert:
            required_fixes.append("领域专家需补充专业覆盖、证据要求与验收标准")
            rework_targets.append("domain_expert")
        elif not expert_priority:
            required_fixes.append("领域专家需明确本轮至少一项优先岗位能力")
            rework_targets.append("domain_expert")
        elif not acceptance:
            required_fixes.append("领域专家需补充可执行的资源验收标准")
            rework_targets.append("domain_expert")
        if not strategy:
            required_fixes.append("教学策略需补充时间预算、训练容量与学习节奏")
            rework_targets.append("learning_strategy")
        elif int(strategy.get("weekly_hours") or 0) < 1 or capacity < 1:
            required_fixes.append("教学策略需给出有效的每周时间预算与训练容量")
            rework_targets.append("learning_strategy")
        if not selected:
            required_fixes.append("双方需重新协商，确保本轮训练计划至少保留一项可执行能力")
            rework_targets.extend(["domain_expert", "learning_strategy"])
        rework_targets = list(dict.fromkeys(rework_targets))
        decision = "rework" if required_fixes else "accept"
        result = {
            "type": "training_plan",
            "title": f"{target_role} · {topic}个性化训练计划",
            "cycle": int(context.get("training_cycle") or 1),
            "rationale": f"依据画像证据与岗位标准，本轮优先训练{'、'.join(selected) or topic}；完成成果验收后再决定升阶或补强。",
            "priority_competencies": selected,
            "deferred_competencies": deferred,
            "weekly_hours": int(strategy.get("weekly_hours") or 5),
            "target_difficulty": int(diagnosis.get("target_difficulty") or 1),
            "preferred_mode": strategy.get("preferred_mode") or "讲练结合",
            "stages": [
                {
                    "id": "understand",
                    "resource": "定制讲义",
                    "goal": f"建立“{topic}”的岗位任务模型与专业边界",
                    "evidence": "带来源标注的关键概念与决策依据",
                },
                {
                    "id": "practice",
                    "resource": "实操指南",
                    "goal": f"完成一轮可复现的“{topic}”岗位实践",
                    "evidence": "实施记录、结果验证、异常处理与复盘",
                },
                {
                    "id": "validate",
                    "resource": "分阶测试",
                    "goal": "验证知识理解、场景判断和迁移能力",
                    "evidence": "分能力点成绩、错因与下一轮难度建议",
                },
            ],
            "acceptance_criteria": acceptance,
            "decision": decision,
            "planning_round": int(context.get("planning_round", 1)),
            "rework_targets": rework_targets,
            "required_fixes": required_fixes,
            "debate": {
                "expert_position": expert.get("position", "优先保证岗位标准覆盖"),
                "strategy_position": strategy.get("position", "优先控制学习负荷"),
                "conflict": f"领域专家建议覆盖 {len(expert_priority)} 项能力，教学策略按时间预算建议聚焦 {capacity} 项",
                "resolution": f"本轮保留 {'、'.join(selected) or '当前核心任务'}；{'、'.join(deferred) if deferred else '其余能力'}进入后续轮次，并以测试结果决定升阶或补强",
                "decision": decision,
            },
            "release_gate": "六类资源必须通过事实来源、实操规范、难度覆盖审核后方可发布",
            "next_round_rule": "低于 60 分先修复前置能力，60–84 分进行错因专项训练，85 分及以上进入更复杂岗位场景",
        }
        await emit("plan", result)
        return result
