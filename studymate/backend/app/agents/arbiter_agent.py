"""总裁决 Agent：只依据结构化审核证据决定发布或自动返工。"""
from __future__ import annotations

from app.agents.base import AgentBase, AgentMeta, EventEmitter


class ArbiterAgent(AgentBase):
    meta = AgentMeta(
        id="arbiter",
        name="总裁决 Agent",
        icon="⚖️",
        color="amber",
        description="汇总六类资源的审核证据并决定发布或定向返工",
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
            if review.get("decision") == "rework"
            or review.get("status") != "pass"
            or int(review.get("score", 0)) < 85
        ]
        targets = list(dict.fromkeys(
            str(item.get("target_agent"))
            for item in findings
            if item.get("target_agent") in {"doc", "guide", "quiz", "mindmap", "reading", "code"}
        ))
        evidence_metrics = (reviews.get("evidence_review") or {}).get("metrics") or {}
        difficulty_metrics = (reviews.get("difficulty_review") or {}).get("metrics") or {}
        evidence_score = float((reviews.get("evidence_review") or {}).get("score", 0))
        difficulty_score = float((reviews.get("difficulty_review") or {}).get("score", 0))
        hallucination_rate = round(float(evidence_metrics.get("hallucination_rate", 100 - evidence_score)), 2)
        difficulty_accuracy = round(float(difficulty_metrics.get("difficulty_fit", difficulty_score)), 2)
        knowledge_coverage = round(float(difficulty_metrics.get("core_coverage", difficulty_score)), 2)
        outputs = context.get("outputs") or {}
        resource_ids = ("doc", "guide", "quiz", "mindmap", "reading", "code")
        missing_resources = [resource_id for resource_id in resource_ids if not outputs.get(resource_id)]
        enhanced_checks = {
            "mindmap": bool(str((outputs.get("mindmap") or {}).get("content") or "").strip()),
            "reading": len((outputs.get("reading") or {}).get("items") or []) >= 3,
            "code": bool(str((outputs.get("code") or {}).get("code") or "").strip()),
        }
        enhanced_coverage = round(sum(enhanced_checks.values()) / len(enhanced_checks) * 100)
        quality_metrics = {
            "hallucination_rate": {
                "label": "专业知识谬误率（幻觉率）",
                "value": hallucination_rate,
                "operator": "<",
                "threshold": 5,
                "passed": hallucination_rate < 5,
            },
            "profile_difficulty_accuracy": {
                "label": "学习者画像-资源难度适配准确率",
                "value": difficulty_accuracy,
                "operator": ">=",
                "threshold": 85,
                "passed": difficulty_accuracy >= 85,
            },
            "core_knowledge_coverage": {
                "label": "核心知识点覆盖率",
                "value": knowledge_coverage,
                "operator": ">=",
                "threshold": 90,
                "passed": knowledge_coverage >= 90,
            },
            "resource_completeness": {
                "label": "六类资源完整生成率",
                "value": round((len(resource_ids) - len(missing_resources)) / len(resource_ids) * 100),
                "operator": ">=",
                "threshold": 100,
                "passed": not missing_resources,
            },
            "enhanced_resource_coverage": {
                "label": "增强资源审核覆盖率",
                "value": enhanced_coverage,
                "operator": ">=",
                "threshold": 100,
                "passed": enhanced_coverage == 100,
            },
        }
        failed_metrics = [item for item in quality_metrics.values() if not item["passed"]]
        quality_score = round(((100 - hallucination_rate) + difficulty_accuracy + knowledge_coverage + enhanced_coverage) / 4)
        all_reviews_present = len(reviews) == 3
        all_resources_present = not missing_resources

        if not all_reviews_present or not all_resources_present:
            decision = "rework"
            if not all_resources_present:
                targets.extend(missing_resources)
            if not all_reviews_present:
                targets.extend(resource_ids)
            targets = list(dict.fromkeys(targets))
            summary = f"审核证据或资源不完整（审核 {len(reviews)} / 3，资源 {len(resource_ids) - len(missing_resources)} / {len(resource_ids)}），禁止发布并重新审核"
        elif findings or nonpassing_reviews or failed_metrics:
            decision = "rework"
            if not quality_metrics["hallucination_rate"]["passed"] and not targets:
                targets.extend(resource_ids)
            if not quality_metrics["profile_difficulty_accuracy"]["passed"]:
                targets.append("quiz")
            if not quality_metrics["core_knowledge_coverage"]["passed"]:
                targets.extend(resource_ids)
            targets = list(dict.fromkeys(targets))
            if not targets:
                targets = list(resource_ids)
            summary = f"发现 {len(findings) + len(failed_metrics)} 项质量问题，退回 {len(targets)} 个生成角色继续定向修订"
        else:
            decision = "publish"
            summary = "六类资源均已通过三组交叉审核与发布门禁，资源包已批准发布"

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
            "quality_metrics": quality_metrics,
            "hallucination_rate": hallucination_rate,
            "profile_difficulty_accuracy": difficulty_accuracy,
            "core_knowledge_coverage": knowledge_coverage,
            "release_gate": {
                "review_count": len(reviews),
                "blocker_count": len(blockers),
                "all_reviews_present": all_reviews_present,
                "resource_count": len(resource_ids) - len(missing_resources),
                "all_resources_present": all_resources_present,
                "enhanced_resource_coverage": enhanced_coverage,
                "all_metrics_passed": not failed_metrics,
                "thresholds": {
                    "hallucination_rate": "<5%",
                    "profile_difficulty_accuracy": ">=85%",
                    "core_knowledge_coverage": ">=90%",
                },
            },
        }
        await emit("decision", result)
        return result
