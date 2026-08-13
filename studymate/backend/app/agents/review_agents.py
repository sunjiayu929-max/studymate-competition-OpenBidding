"""三个相互独立的内容审核与纠偏 Agent。

审核采用可复现的结构规则与证据检查；模型生成内容不参与修改审核阈值。
"""
from __future__ import annotations

import re

from app.agents.base import AgentBase, AgentMeta, EventEmitter


def _finding(code: str, severity: str, message: str, suggestion: str, target_agent: str) -> dict:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "suggestion": suggestion,
        "target_agent": target_agent,
    }


def _review_output(reviewer: str, score: int, findings: list[dict], metrics: dict) -> dict:
    has_blocker = any(item["severity"] == "blocker" for item in findings)
    status = "fail" if has_blocker or score < 70 else "warn" if findings or score < 85 else "pass"
    return {
        "type": "review",
        "reviewer": reviewer,
        "status": status,
        "score": max(0, min(100, score)),
        "findings": findings,
        "metrics": metrics,
    }


class EvidenceReviewAgent(AgentBase):
    meta = AgentMeta(
        id="evidence_review",
        name="事实与来源审核 Agent",
        icon="🔍",
        color="indigo",
        description="核对专业主张、引用编号与知识来源",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        doc = (context.get("outputs") or {}).get("doc") or {}
        content = str(doc.get("content") or "")
        citations = doc.get("citations") or []
        cited_indexes = {int(value) for value in re.findall(r"\[(\d+)\]", content)}
        valid_indexes = {int(item.get("index", 0)) for item in citations}
        invalid_indexes = sorted(cited_indexes - valid_indexes)
        findings: list[dict] = []
        if not citations:
            findings.append(_finding(
                "missing_evidence",
                "blocker",
                "定制讲义没有返回可追溯的领域知识来源",
                "重新检索岗位知识库，并为关键专业结论补充 [n] 引用",
                "doc",
            ))
        if citations and not cited_indexes:
            findings.append(_finding(
                "citations_not_used",
                "high",
                "讲义返回了来源列表，但正文没有绑定引用编号",
                "把引用放在对应专业主张之后，避免来源与结论脱节",
                "doc",
            ))
        if invalid_indexes:
            findings.append(_finding(
                "invalid_citation_index",
                "blocker",
                f"正文引用了不存在的编号：{invalid_indexes}",
                "删除无效编号或绑定到真实检索片段",
                "doc",
            ))
        if len(content.replace(" ", "")) < 260:
            findings.append(_finding(
                "insufficient_explanation",
                "medium",
                "讲义过短，难以覆盖岗位任务的定义、步骤和边界",
                "补充岗位情境、常见误区和下一步任务",
                "doc",
            ))

        citation_coverage = 0 if not citations else min(100, 70 + min(len(cited_indexes), 6) * 5)
        score = 100
        score -= 45 if not citations else 0
        score -= 25 if citations and not cited_indexes else 0
        score -= len(invalid_indexes) * 20
        score -= 10 if len(content.replace(" ", "")) < 260 else 0
        result = _review_output(
            "事实与来源审核",
            score,
            findings,
            {
                "citation_count": len(citations),
                "used_citation_count": len(cited_indexes & valid_indexes),
                "citation_coverage": citation_coverage,
            },
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result


class PracticeReviewAgent(AgentBase):
    meta = AgentMeta(
        id="practice_review",
        name="实操规范审核 Agent",
        icon="🛡️",
        color="rose",
        description="检查实操前置、步骤、验收、异常与安全边界",
    )

    REQUIRED_SECTIONS = {
        "环境与前置条件": "补充环境、工具、输入数据和必要前置",
        "操作步骤": "给出编号步骤，并写明每步操作与输入",
        "预期结果": "为实操过程补充可观察的预期结果",
        "异常处理": "补充失败停止、排查和回退策略",
        "安全边界": "明确教学仿真、数据合规和自动纠偏边界",
        "验收清单": "提供可勾选的完成与质量检查项",
    }

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        guide = (context.get("outputs") or {}).get("guide") or {}
        content = str(guide.get("content") or "")
        citations = guide.get("citations") or []
        findings: list[dict] = []
        missing = []
        for section, suggestion in self.REQUIRED_SECTIONS.items():
            if section not in content:
                missing.append(section)
                findings.append(_finding(
                    f"missing_{section}",
                    "blocker" if section in {"操作步骤", "异常处理", "安全边界"} else "high",
                    f"实操指南缺少“{section}”",
                    suggestion,
                    "guide",
                ))
        if not citations:
            findings.append(_finding(
                "guide_missing_evidence",
                "blocker",
                "实操指南缺少领域来源，无法验证岗位步骤的专业依据",
                "为关键步骤绑定岗位知识库来源；无依据内容触发自动补证返工",
                "guide",
            ))
        numbered_steps = len(re.findall(r"(?m)^\s*\d+[.、]", content))
        if numbered_steps < 3:
            findings.append(_finding(
                "steps_not_actionable",
                "high",
                "可执行的编号步骤不足 3 项",
                "将任务拆成准备、执行、验证和记录等可执行步骤",
                "guide",
            ))

        completeness = round((len(self.REQUIRED_SECTIONS) - len(missing)) / len(self.REQUIRED_SECTIONS) * 100)
        score = completeness
        score -= 30 if not citations else 0
        score -= 15 if numbered_steps < 3 else 0
        result = _review_output(
            "实操规范审核",
            score,
            findings,
            {
                "section_completeness": completeness,
                "numbered_steps": numbered_steps,
                "citation_count": len(citations),
                "safety_boundary_present": "安全边界" in content,
            },
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result


class DifficultyReviewAgent(AgentBase):
    meta = AgentMeta(
        id="difficulty_review",
        name="难度与覆盖审核 Agent",
        icon="📐",
        color="emerald",
        description="校准资源难度并核查岗位核心能力覆盖",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        outputs = context.get("outputs") or {}
        quiz = outputs.get("quiz") or {}
        items = quiz.get("items") or []
        diagnosis = context.get("diagnosis") or {}
        target = int(diagnosis.get("target_difficulty", 2) or 2)
        difficulties = [
            max(1, min(4, int(item.get("difficulty", target) or target)))
            for item in items
        ]
        competencies = [str(item) for item in context.get("core_competencies") or []]
        corpus = " ".join(
            [str((outputs.get("doc") or {}).get("content") or ""), str((outputs.get("guide") or {}).get("content") or "")]
            + [str(item.get("question") or "") for item in items]
        )
        covered = [item for item in competencies if item in corpus]
        findings: list[dict] = []
        if len(items) < 3:
            findings.append(_finding(
                "insufficient_tiered_items",
                "blocker",
                "分阶测试少于 3 题，无法形成基础、应用和挑战层级",
                "至少生成 3 题并覆盖两个以上难度层级",
                "quiz",
            ))
        if difficulties and len(set(difficulties)) < 2:
            findings.append(_finding(
                "single_difficulty",
                "high",
                "测试题集中在单一难度，不能验证升降阶决策",
                "围绕目标难度生成基础题、应用题和进阶题",
                "quiz",
            ))
        average = round(sum(difficulties) / len(difficulties), 2) if difficulties else 0
        if difficulties and abs(average - target) > 1:
            findings.append(_finding(
                "difficulty_mismatch",
                "high",
                f"题目平均难度 {average} 与诊断目标难度 {target} 偏差过大",
                "围绕学情目标重新定标题目难度",
                "quiz",
            ))
        coverage = round(len(covered) / len(competencies) * 100) if competencies else 100
        if competencies and coverage < 40:
            findings.append(_finding(
                "core_coverage_low",
                "medium",
                f"当前资源只显式覆盖 {len(covered)} / {len(competencies)} 个岗位核心能力",
                "在讲义、实操或题目中补充本轮主题直接相关的核心能力",
                "doc",
            ))

        difficulty_fit = 100 if not difficulties else max(0, round(100 - abs(average - target) * 25))
        score = round(difficulty_fit * 0.7 + max(60, coverage) * 0.3)
        score -= 30 if len(items) < 3 else 0
        score -= 15 if difficulties and len(set(difficulties)) < 2 else 0
        result = _review_output(
            "难度与覆盖审核",
            score,
            findings,
            {
                "target_difficulty": target,
                "average_difficulty": average,
                "difficulty_fit": difficulty_fit,
                "core_coverage": coverage,
                "covered_competencies": covered,
                "total_competencies": len(competencies),
            },
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result
