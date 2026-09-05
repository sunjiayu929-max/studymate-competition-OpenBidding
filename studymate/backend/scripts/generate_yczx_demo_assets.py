#!/usr/bin/env python3
"""Generate the durable PDF/Markdown assets used by the YCZX demo accounts."""
from __future__ import annotations

import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


TOPICS = (
    {
        "slug": "fde-industry-observation",
        "title": "FDE模式行业观察与实践",
        "summary": "从行业项目形态、驻场协作方式和交付证据三个角度，整理前线部署工程师的真实工作方法。",
        "sections": (
            ("行业观察", "企业采用 AI 产品时，采购对象正在从单一模型能力转向可落地的业务闭环。FDE 需要同时理解客户流程、数据边界、系统接口和验收口径，并把现场发现及时反馈给产品团队。"),
            ("典型工作周", "周一完成需求访谈和现场盘点；周二到周三完成数据样本核验、接口联调和最小闭环；周四组织业务走查并补齐异常处理；周五形成验收记录、问题清单和下一阶段计划。"),
            ("交付检查", "上线前确认环境版本、网络路径、账号权限、配置差异、日志位置、监控指标和回滚负责人。验收时同时保留业务结果、运行日志、异常样本和客户确认记录。"),
            ("实践案例", "某工单分流项目最初只关注模型准确率，试运行后发现真正瓶颈是字段口径不统一。团队先完成字段字典和缺失值规则，再用小流量验证，最终把首次响应时长稳定降低。"),
            ("个人复盘", "本次实践暴露出需求追问不够深入、异常路径覆盖不足的问题。后续每次联调前使用固定清单，并在日报中记录假设、证据、结论和待确认责任人。"),
        ),
    },
    {
        "slug": "business-pain-value",
        "title": "业务痛点溯源与价值研判",
        "summary": "把模糊诉求拆成可验证的问题，避免将技术演示误当成业务价值。",
        "sections": (
            ("痛点溯源", "先询问谁在什么环节遇到什么阻碍，再区分表面现象和根因。通过流程访谈、样本抽查、系统日志和岗位观察形成证据链，而不是只依赖单次会议结论。"),
            ("价值假设", "价值假设应包含目标用户、具体场景、干预手段、量化指标、测量窗口和责任人。例如：对一线运营人员，通过知识检索辅助将首次响应时间降低 20%，并以两周真实工单作为验收样本。"),
            ("优先级矩阵", "从业务影响、实施成本、数据可得性和风险四个维度评分。优先选择价值清楚、数据可用、能够在两周内形成最小闭环的场景。"),
            ("访谈记录", "客户提出希望全面提升客服效率。进一步访谈发现，高频问题并非回答生成，而是新员工找不到最新制度。项目因此先建设可追溯知识检索，再逐步增加生成能力。"),
            ("验收建议", "基线和目标必须使用同一统计口径；抽样需覆盖高频与异常场景；除效果指标外，还要记录人工接管率、失败原因和单位调用成本。"),
        ),
    },
    {
        "slug": "requirement-model-boundary",
        "title": "需求逻辑建模与边界定义",
        "summary": "用流程、实体、规则和异常路径把口头需求转成工程团队可以实现和验证的边界。",
        "sections": (
            ("需求模型", "用参与者、输入、处理规则、输出和状态变化描述主流程；用数据字典定义字段来源、类型、是否必填和敏感等级；用决策表表达复杂业务规则。"),
            ("系统边界", "明确本系统负责什么、不负责什么。模型输出是建议还是自动决策、失败后由谁接管、哪些数据不能离开客户环境，都应写入边界说明。"),
            ("接口契约", "接口文档至少包括鉴权方式、请求示例、字段约束、幂等键、超时、重试、错误码和日志追踪标识。联调前先完成模拟请求和异常返回测试。"),
            ("变更控制", "新增诉求先判断是否影响验收范围、数据权限和排期。重要变更记录提出人、影响分析、决策结果和生效版本，避免现场口头承诺直接进入开发。"),
            ("建模样例", "工单助手的输入包括工单正文、客户等级和产品线；输出包括推荐分类、依据和置信度。低置信度或敏感客户必须转人工，且所有建议保留来源引用。"),
        ),
    },
    {
        "slug": "requirement-quality-review",
        "title": "需求质量校验与实证复盘",
        "summary": "通过可测试性检查、现场证据和复盘机制持续提高需求质量。",
        "sections": (
            ("质量门槛", "需求应具备明确对象、可观察行为、约束条件和验收标准。出现“智能化、快速、准确、体验更好”等词时，必须继续追问可测量定义。"),
            ("验证设计", "在开发前准备正常、边界、异常和权限四类样本。每项验收标准对应测试方法、数据来源、负责人和通过阈值。"),
            ("现场证据", "保留请求标识、关键日志、版本号、配置快照、测试数据说明和结果截图。涉及业务指标时同时记录统计口径和时间范围。"),
            ("问题复盘", "复盘不是追责，而是解释问题如何穿过现有防线。记录时间线、影响、直接原因、系统原因、修复动作、预防措施和验证结果。"),
            ("改进记录", "一次联调中因客户测试环境字段缺失导致错误。团队补充接口预检、字段完整性提示和降级流程，并将同类检查加入所有新项目模板。"),
        ),
    },
    {
        "slug": "requirement-engineering-frontier",
        "title": "需求工程前沿与模式实践",
        "summary": "总结 AI 原生项目中的评测驱动开发、人机协同和可观测交付模式。",
        "sections": (
            ("评测驱动开发", "先建立代表真实任务的评测集，再迭代提示词、检索、工具调用和模型。每次变更同时比较正确性、稳定性、延迟和成本。"),
            ("人机协同", "对高风险、低置信度和规则冲突场景设置人工确认。界面应解释建议依据、允许修正，并把修正结果沉淀为后续评测样本。"),
            ("可观测交付", "观测链路覆盖请求、检索片段、模型版本、工具调用、响应时间、人工接管和用户反馈。日志遵循最小必要原则，敏感字段脱敏。"),
            ("渐进式上线", "先离线回放，再影子运行，随后小流量试点，最后逐步扩大范围。每个阶段设置继续、暂停和回滚条件。"),
            ("模式实践", "将现场经验固化为需求访谈模板、数据预检脚本、接口联调清单、评测集和验收报告。可复用资产比单次项目中的临时修补更有长期价值。"),
        ),
    },
)


def _markdown(topic: dict) -> str:
    lines = [f"# {topic['title']}", "", topic["summary"], ""]
    for heading, body in topic["sections"]:
        lines.extend((f"## {heading}", "", body, ""))
    lines.extend(("## 使用记录", "", "该资料用于 FDE 岗位训练、知识检索、需求评审和现场复盘。内容为演示账号的长期学习资料，不包含真实客户机密。", ""))
    return "\n".join(lines)


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("STSong-Light", 8)
    canvas.setFillColor(colors.HexColor("#607080"))
    canvas.drawString(22 * mm, 14 * mm, "因材智训 FDE 实践资料")
    canvas.drawRightString(188 * mm, 14 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def _write_pdf(path: Path, topic: dict) -> None:
    registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    title = ParagraphStyle("CnTitle", parent=styles["Title"], fontName="STSong-Light", fontSize=22, leading=30, alignment=TA_CENTER, textColor=colors.HexColor("#183B56"), spaceAfter=10 * mm)
    lead = ParagraphStyle("CnLead", parent=styles["BodyText"], fontName="STSong-Light", fontSize=11, leading=19, textColor=colors.HexColor("#3F5364"), spaceAfter=8 * mm)
    heading = ParagraphStyle("CnHeading", parent=styles["Heading2"], fontName="STSong-Light", fontSize=15, leading=22, textColor=colors.HexColor("#153E5C"), spaceBefore=5 * mm, spaceAfter=3 * mm)
    body = ParagraphStyle("CnBody", parent=styles["BodyText"], fontName="STSong-Light", fontSize=10.5, leading=18, textColor=colors.HexColor("#233746"), spaceAfter=4 * mm)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=22 * mm, bottomMargin=22 * mm, title=topic["title"], author="因材智训")
    story = [Paragraph(topic["title"], title), Paragraph(topic["summary"], lead)]
    overview = [["资料类型", "FDE 岗位实践"], ["适用场景", "需求澄清 现场交付 复盘验收"], ["版本", "演示基线 2026.09"]]
    table = Table(overview, colWidths=(36 * mm, 112 * mm))
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"), ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#153E5C")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF2F7")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCD8E0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend((table, Spacer(1, 5 * mm)))
    for index, (section_title, section_body) in enumerate(topic["sections"]):
        if index == 3:
            story.append(PageBreak())
        story.extend((Paragraph(section_title, heading), Paragraph(section_body, body)))
    story.extend((Paragraph("使用记录", heading), Paragraph("该资料用于 FDE 岗位训练、知识检索、需求评审和现场复盘。内容为演示账号的长期学习资料，不包含真实客户机密。", body)))
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "resources" / "demo_private_knowledge" / "yczx")
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for topic in TOPICS:
        (output / f"{topic['slug']}.md").write_text(_markdown(topic), encoding="utf-8")
        _write_pdf(output / f"{topic['slug']}.pdf", topic)
        print(topic["title"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
