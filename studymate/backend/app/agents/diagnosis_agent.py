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
        theory_assessments = profile.get("theory_assessments") or {}
        interview_assessments = profile.get("interview_assessments") or {}
        competencies = list(context.get("core_competencies") or [])
        target_role = context.get("target_role", "领域应用工程师")
        course_id = context.get("course_id")
        theory_result = next((
            item for item in theory_assessments.values()
            if isinstance(item, dict) and (
                item.get("role_name") == target_role
                or (course_id is not None and item.get("course_id") == course_id)
            )
        ), None)
        interview_result = next((
            item for item in interview_assessments.values()
            if isinstance(item, dict) and (
                item.get("role_name") == target_role
                or (course_id is not None and item.get("course_id") == course_id)
            )
        ), None)

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
        topic = context.get("topic", "岗位核心任务")
        primary_goal = str(goals.get("primary") or "").strip()
        previous_feedback = context.get("previous_feedback") or {}
        difficulty_delta = int((previous_feedback.get("profile_update") or {}).get("suggested_difficulty_delta") or 0)
        if difficulty_delta:
            target_difficulty = max(1, min(4, target_difficulty + difficulty_delta))
            evidence_confidence = min(0.98, evidence_confidence + float((previous_feedback.get("profile_update") or {}).get("confidence_delta") or 0))

        if theory_result:
            theory_score = float(theory_result.get("score") or 0)
            theory_level = str(theory_result.get("knowledge_level") or current_level)
            current_level = theory_level
            target_difficulty = 1 if theory_score < 40 else 2 if theory_score < 60 else 3 if theory_score < 80 else 4
            evidence_confidence = min(0.98, max(evidence_confidence, 0.9))
            theory_gaps = [str(item) for item in theory_result.get("weak_topics") or [] if str(item).strip()]
            knowledge_gaps = (theory_gaps + [item for item in knowledge_gaps if item not in theory_gaps])[:4]

        if interview_result:
            interview_score = float(interview_result.get("role_match_score") or 0)
            interview_gaps = [
                str(item) for item in interview_result.get("weak_competencies") or [] if str(item).strip()
            ]
            knowledge_gaps = (interview_gaps + [item for item in knowledge_gaps if item not in interview_gaps])[:4]
            target_difficulty = min(target_difficulty, 1 if interview_score < 40 else 2 if interview_score < 60 else 3 if interview_score < 80 else 4)
            evidence_confidence = min(0.98, max(evidence_confidence, 0.88))

        output = {
            "type": "diagnosis",
            "title": f"{target_role}学情诊断",
            "current_level": current_level,
            "target_difficulty": target_difficulty,
            "knowledge_score": average,
            "evidence_confidence": evidence_confidence,
            "training_cycle": int(context.get("training_cycle") or 1),
            "adaptation_reason": previous_feedback.get("message") or (
                f"已融合 {target_role} 模拟面试岗位匹配分 {float(interview_result.get('role_match_score') or 0):g} 分"
                if interview_result else (
                    f"已融合先验画像、{target_role}理论测评 {float(theory_result.get('score') or 0):g} 分与岗位知识库证据"
                    if theory_result else "首轮依据学历背景等先验画像建立能力基线"
                )
            ),
            "theory_assessment": theory_result,
            "interview_assessment": interview_result,
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
