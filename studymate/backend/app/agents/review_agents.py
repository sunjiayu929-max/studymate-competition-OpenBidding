"""三个相互独立的内容审核与纠偏 Agent。

审核采用可复现的结构规则与证据检查；七类岗位资源都必须通过本轮审核，模型生成内容不参与修改审核阈值。
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


def _review_output(
    reviewer: str,
    score: int,
    findings: list[dict],
    metrics: dict,
    target_agent: str,
) -> dict:
    has_blocker = any(item["severity"] == "blocker" for item in findings)
    status = "fail" if has_blocker or score < 70 else "warn" if findings or score < 85 else "pass"
    return {
        "type": "review",
        "reviewer": reviewer,
        "status": status,
        "score": max(0, min(100, score)),
        "findings": findings,
        "metrics": metrics,
        "target_agent": target_agent,
        "decision": "rework" if status != "pass" or findings else "accept",
    }


class EvidenceReviewAgent(AgentBase):
    meta = AgentMeta(
        id="evidence_review",
        name="事实与来源校验 Agent",
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

        outputs = context.get("outputs") or {}
        guide = outputs.get("guide") or {}
        guide_content = str(guide.get("content") or "")
        guide_citations = guide.get("citations") or []
        guide_cited_indexes = {int(value) for value in re.findall(r"\[(\d+)\]", guide_content)}
        guide_valid_indexes = {int(item.get("index", 0)) for item in guide_citations}
        guide_invalid_indexes = sorted(guide_cited_indexes - guide_valid_indexes)
        if not guide_citations or not guide_cited_indexes:
            findings.append(_finding(
                "guide_claims_unsupported",
                "blocker",
                "实操指南的专业步骤没有形成正文引用与真实来源的绑定",
                "为关键步骤补充 [n] 引用，并绑定到本轮知识库证据",
                "guide",
            ))
        if guide_invalid_indexes:
            findings.append(_finding(
                "guide_invalid_citation_index",
                "blocker",
                f"实操指南引用了不存在的编号：{guide_invalid_indexes}",
                "删除无效编号或绑定到真实检索片段",
                "guide",
            ))

        quiz = outputs.get("quiz") or {}
        quiz_items = quiz.get("items") or []
        quiz_citations = quiz.get("citations") or []
        quiz_valid_indexes = {int(item.get("index", 0)) for item in quiz_citations}
        unsupported_quiz_items = [
            str(item.get("id") or index + 1)
            for index, item in enumerate(quiz_items)
            if int(item.get("source_index") or 0) not in quiz_valid_indexes
        ]
        if unsupported_quiz_items:
            findings.append(_finding(
                "quiz_claims_unsupported",
                "blocker",
                f"测试题缺少有效知识来源：{unsupported_quiz_items}",
                "为每道题绑定有效 source_index，并保证答案与解析来自对应证据",
                "quiz",
            ))

        mindmap = outputs.get("mindmap") or {}
        mindmap_content = str(mindmap.get("content") or "").strip()
        if not mindmap_content or not re.search(r"(?m)^#{1,3}\s+", mindmap_content):
            findings.append(_finding(
                "mindmap_structure_missing",
                "blocker",
                "思维导图没有形成可渲染的层级结构",
                "补充主题、维度和关键节点，并保持 Markmap Markdown 层级",
                "mindmap",
            ))

        reading = outputs.get("reading") or {}
        reading_items = reading.get("items") or []
        invalid_reading_items = [
            str(index + 1)
            for index, item in enumerate(reading_items)
            if not str(item.get("title") or "").strip()
            or not str(item.get("source") or item.get("url") or "").strip()
        ]
        if len(reading_items) < 3 or invalid_reading_items:
            findings.append(_finding(
                "reading_evidence_missing",
                "blocker",
                "拓展阅读缺少足够的带出处推荐材料",
                "至少保留 3 条推荐，并为每条材料补充出处或官方链接",
                "reading",
            ))

        code = outputs.get("code") or {}
        code_content = str(code.get("code") or "").strip()
        if not code_content or not str(code.get("language") or "").strip():
            findings.append(_finding(
                "code_case_missing",
                "blocker",
                "代码案例没有返回完整代码与语言信息",
                "补充可用于岗位训练的完整代码、语言和文件名",
                "code",
            ))

        video = outputs.get("video") or {}
        video_script = video.get("script") or {}
        if not str(video_script.get("prompt") or "").strip() or not str(video_script.get("voiceover") or "").strip():
            findings.append(_finding(
                "video_script_missing",
                "blocker",
                "可视讲解没有返回可审核的岗位脚本与旁白",
                "补充岗位任务、分镜、旁白和安全边界后再调用视频模型",
                "video",
            ))

        doc_supported = bool(citations and cited_indexes and not invalid_indexes)
        guide_supported = bool(guide_citations and guide_cited_indexes and not guide_invalid_indexes)
        supported_quiz_count = len(quiz_items) - len(unsupported_quiz_items)
        video_ready = bool(str(video_script.get("prompt") or "").strip() and str(video_script.get("voiceover") or "").strip())
        enhanced_ready = (
            int(bool(mindmap_content))
            + int(len(reading_items) >= 3 and not invalid_reading_items)
            + int(bool(code_content))
            + int(video_ready)
        )
        professional_unit_count = 6 + len(quiz_items)
        unsupported_unit_count = (
            int(not doc_supported)
            + int(not guide_supported)
            + len(unsupported_quiz_items)
            + (4 - enhanced_ready)
        )
        hallucination_rate = round(unsupported_unit_count / professional_unit_count * 100, 2) if professional_unit_count else 100.0

        citation_coverage = 0 if not citations else min(100, 70 + min(len(cited_indexes), 6) * 5)
        score = round(100 - hallucination_rate)
        score -= 10 if len(content.replace(" ", "")) < 260 else 0
        result = _review_output(
            "事实与来源校验 Agent",
            score,
            findings,
            {
                "citation_count": len(citations),
                "used_citation_count": len(cited_indexes & valid_indexes),
                "citation_coverage": citation_coverage,
                "guide_citation_count": len(guide_citations),
                "quiz_source_coverage": round(supported_quiz_count / len(quiz_items) * 100) if quiz_items else 0,
                "enhanced_resource_count": 4,
                "enhanced_resource_ready": enhanced_ready,
                "enhanced_resource_coverage": round(enhanced_ready / 4 * 100),
                "professional_unit_count": professional_unit_count,
                "unsupported_unit_count": unsupported_unit_count,
                "hallucination_rate": hallucination_rate,
                "hallucination_rate_method": "未绑定有效知识来源的资源/题目单元占比",
            },
            "doc",
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result


class PracticeReviewAgent(AgentBase):
    meta = AgentMeta(
        id="practice_review",
        name="实操规范校验 Agent",
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

        code = (context.get("outputs") or {}).get("code") or {}
        code_ready = bool(str(code.get("code") or "").strip() and str(code.get("language") or "").strip())
        if not code_ready:
            findings.append(_finding(
                "code_case_not_actionable",
                "blocker",
                "代码案例缺少可供学习者阅读或运行的完整内容",
                "补充完整源码、语言标识和预期结果",
                "code",
            ))

        video = (context.get("outputs") or {}).get("video") or {}
        video_script = video.get("script") or {}
        video_ready = bool(str(video_script.get("prompt") or "").strip() and str(video_script.get("voiceover") or "").strip())
        if not video_ready:
            findings.append(_finding(
                "video_not_actionable",
                "blocker",
                "可视讲解缺少可执行的分镜与旁白内容",
                "补充与岗位任务一致的画面动作、中文旁白和验证结果",
                "video",
            ))

        completeness = round((len(self.REQUIRED_SECTIONS) - len(missing)) / len(self.REQUIRED_SECTIONS) * 100)
        score = round((completeness + int(code_ready) * 100 + int(video_ready) * 100) / 3)
        score -= 30 if not citations else 0
        score -= 15 if numbered_steps < 3 else 0
        result = _review_output(
            "实操规范校验 Agent",
            score,
            findings,
            {
                "section_completeness": completeness,
                "numbered_steps": numbered_steps,
                "citation_count": len(citations),
                "safety_boundary_present": "安全边界" in content,
                "code_case_ready": code_ready,
                "video_script_ready": video_ready,
            },
            "guide",
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result


class DifficultyReviewAgent(AgentBase):
    meta = AgentMeta(
        id="difficulty_review",
        name="难度与覆盖校验 Agent",
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
        training_plan = context.get("training_plan") or {}
        competencies = [
            str(item)
            for item in (training_plan.get("priority_competencies") or context.get("core_competencies") or [])
        ]
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
        if competencies and coverage < 90:
            findings.append(_finding(
                "core_coverage_low",
                "high",
                f"当前资源只显式覆盖 {len(covered)} / {len(competencies)} 个岗位核心能力",
                "在讲义、实操或题目中补充本轮主题直接相关的核心能力",
                "doc",
            ))

        enhanced_checks = {
            "mindmap": bool(str((outputs.get("mindmap") or {}).get("content") or "").strip()),
            "reading": len((outputs.get("reading") or {}).get("items") or []) >= 3,
            "code": bool(str((outputs.get("code") or {}).get("code") or "").strip()),
            "video": bool((outputs.get("video") or {}).get("script")),
        }
        missing_enhanced = [resource_id for resource_id, ready in enhanced_checks.items() if not ready]
        if missing_enhanced:
            findings.append(_finding(
                "enhanced_resource_incomplete",
                "blocker",
                f"增强资源未完整生成：{', '.join(missing_enhanced)}",
                "重新生成缺失的增强资源后再进入发布门禁",
                missing_enhanced[0],
            ))

        difficulty_fit = 100 if not difficulties else max(0, round(100 - abs(average - target) * 25))
        if difficulty_fit < 85:
            findings.append(_finding(
                "profile_difficulty_fit_low",
                "high",
                f"学习者画像与资源难度适配准确率仅 {difficulty_fit}%",
                "按照学情诊断目标重新校准题目难度层级",
                "quiz",
            ))
        enhanced_coverage = round(sum(enhanced_checks.values()) / len(enhanced_checks) * 100)
        score = round(difficulty_fit * 0.6 + max(60, coverage) * 0.25 + enhanced_coverage * 0.15)
        score -= 30 if len(items) < 3 else 0
        score -= 15 if difficulties and len(set(difficulties)) < 2 else 0
        result = _review_output(
            "难度与覆盖校验 Agent",
            score,
            findings,
            {
                "target_difficulty": target,
                "average_difficulty": average,
                "difficulty_fit": difficulty_fit,
                "core_coverage": coverage,
                "covered_competencies": covered,
                "total_competencies": len(competencies),
                "enhanced_resource_coverage": enhanced_coverage,
                "enhanced_resource_checks": enhanced_checks,
            },
            "quiz",
        )
        await emit("review", {"agent": self.meta.id, **result})
        return result
