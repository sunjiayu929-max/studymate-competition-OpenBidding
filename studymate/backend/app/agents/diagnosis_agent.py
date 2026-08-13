"""岗位学情诊断 Agent：把画像证据转换为训练合同。"""
from __future__ import annotations

from app.agents.base import AgentBase, AgentMeta, EventEmitter


class DiagnosisAgent(AgentBase):
    meta = AgentMeta(
        id="diagnosis",
        name="学情诊断 Agent",
        icon="🧭",
        color="sky",
        description="定位岗位能力盲区并确定资源目标难度",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        profile = context.get("profile") or {}
        knowledge = profile.get("knowledge_base") or {}
        weak_points = profile.get("weak_points") or {}
        goals = profile.get("goals") or {}
        competencies = list(context.get("core_competencies") or [])

        scores = [
            int(value)
            for value in knowledge.values()
            if isinstance(value, (int, float)) and not isinstance(value, bool)
        ]
        average = round(sum(scores) / len(scores), 2) if scores else None
        if average is None:
            current_level = "待诊断"
            target_difficulty = 1
            evidence_confidence = 0.35
        elif average < 2:
            current_level = "入门"
            target_difficulty = 1
            evidence_confidence = 0.72
        elif average < 3.5:
            current_level = "基础"
            target_difficulty = 2
            evidence_confidence = 0.8
        elif average < 4.5:
            current_level = "应用"
            target_difficulty = 3
            evidence_confidence = 0.86
        else:
            current_level = "进阶"
            target_difficulty = 4
            evidence_confidence = 0.9

        explicit_gaps = [str(item) for item in weak_points.get("topics", []) if str(item).strip()]
        inferred_gaps = [item for item in competencies if item not in explicit_gaps][:3]
        knowledge_gaps = (explicit_gaps + inferred_gaps)[:4]
        target_role = context.get("target_role", "领域应用工程师")
        topic = context.get("topic", "岗位核心任务")
        primary_goal = str(goals.get("primary") or "").strip()
        previous_feedback = context.get("previous_feedback") or {}
        difficulty_delta = int((previous_feedback.get("profile_update") or {}).get("suggested_difficulty_delta") or 0)
        if difficulty_delta:
            target_difficulty = max(1, min(4, target_difficulty + difficulty_delta))
            evidence_confidence = min(0.98, evidence_confidence + float((previous_feedback.get("profile_update") or {}).get("confidence_delta") or 0))

        output = {
            "type": "diagnosis",
            "title": f"{target_role}学情诊断",
            "current_level": current_level,
            "target_difficulty": target_difficulty,
            "knowledge_score": average,
            "evidence_confidence": evidence_confidence,
            "training_cycle": int(context.get("training_cycle") or 1),
            "adaptation_reason": previous_feedback.get("message") or "首轮依据画像建立能力基线",
            "knowledge_gaps": knowledge_gaps,
            "training_goal": primary_goal or f"围绕“{topic}”形成可验证的岗位任务能力",
            "training_contract": {
                "topic": topic,
                "target_role": target_role,
                "required_resources": ["定制讲义", "实操指南", "分阶测试"],
                "core_competencies": competencies,
                "target_difficulty": target_difficulty,
                "release_gate": "三项审核通过并由总裁决 Agent 批准",
            },
        }
        await emit("diagnosis", output)
        return output
