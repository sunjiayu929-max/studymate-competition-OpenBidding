"""总裁决 Agent：只依据结构化审核证据决定发布或自动返工。"""
from __future__ import annotations

from app.agents.base import AgentBase, AgentMeta, EventEmitter


class ArbiterAgent(AgentBase):
    meta = AgentMeta(
        id="arbiter",
        name="总裁决 Agent",
        icon="⚖️",
        color="amber",
        description="汇总三项审核并决定发布或定向返工",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        reviews = context.get("reviews") or {}
        generation_round = int(context.get("generation_round", 1))
        findings = [
            finding
            for review in reviews.values()
            for finding in review.get("findings", [])
        ]
        blockers = [item for item in findings if item.get("severity") == "blocker"]
        nonpassing_reviews = [
            review for review in reviews.values()
            if review.get("status") != "pass" or int(review.get("score", 0)) < 85
        ]
        targets = list(dict.fromkeys(
            str(item.get("target_agent"))
            for item in findings
            if item.get("target_agent") in {"doc", "guide", "quiz"}
        ))
        scores = [int(review.get("score", 0)) for review in reviews.values()]
        quality_score = round(sum(scores) / len(scores)) if scores else 0
        all_reviews_present = len(reviews) == 3

        if not all_reviews_present:
            decision = "rework"
            targets = ["doc", "guide", "quiz"]
            summary = f"审核证据不完整（{len(reviews)} / 3），禁止发布并重新生成、审核全部资源"
        elif findings or nonpassing_reviews:
            decision = "rework"
            if not targets:
                targets = ["doc", "guide", "quiz"]
            summary = f"发现 {len(findings) or len(nonpassing_reviews)} 项质量问题，退回 {len(targets)} 个生成角色继续定向修订"
        else:
            decision = "publish"
            summary = "三项审核达到发布门槛，资源包已批准发布"

        result = {
            "type": "decision",
            "decision": decision,
            "summary": summary,
            "quality_score": quality_score,
            "generation_round": generation_round,
            "rework_targets": targets if decision == "rework" else [],
            "required_fixes": [item.get("suggestion") for item in findings if item.get("suggestion")][:6],
            "review_scores": {
                key: int(value.get("score", 0)) for key, value in reviews.items()
            },
            "release_gate": {
                "review_count": len(reviews),
                "blocker_count": len(blockers),
                "all_reviews_present": all_reviews_present,
            },
        }
        await emit("decision", result)
        return result
