"""从现有课程知识库映射到赛题 B 的领域/目标岗位语义。

课程仍作为 RAG 数据边界保留；用户界面与训练闭环以领域、岗位和能力点组织。
"""
from __future__ import annotations

from copy import deepcopy


TRAINING_ROLES: list[dict] = [
    {
        "course_name": "FDE 岗位知识库",
        "domain": "特定软件开发",
        "target_role": "前线部署工程师（FDE）",
        "role_summary": "深入客户现场，把产品能力、数据和业务流程组合成可验证、可交付的解决方案",
        "core_competencies": ["需求澄清", "Python 与 SQL", "系统集成", "客户沟通", "交付验证"],
    },
    {"course_name": "AI Agent 开发工程师 岗位知识库", "domain": "人工智能", "target_role": "AI Agent 开发工程师", "role_summary": "设计可观测、可评测且受控的 Agent 工作流", "core_competencies": ["Agent 设计", "工具调用", "工作流编排", "评测", "安全"]},
    {"course_name": "AI Infra 工程师 岗位知识库", "domain": "人工智能", "target_role": "AI Infra 工程师", "role_summary": "建设训练和推理的可靠基础设施", "core_competencies": ["算力调度", "容器平台", "推理服务", "可观测性", "可靠性"]},
    {"course_name": "具身智能算法工程师 岗位知识库", "domain": "人工智能", "target_role": "具身智能算法工程师", "role_summary": "完成感知、规划、控制与实机验证", "core_competencies": ["视觉感知", "运动规划", "控制", "仿真", "安全验证"]},
    {"course_name": "大模型安全工程师 岗位知识库", "domain": "人工智能", "target_role": "大模型安全工程师", "role_summary": "评测和治理大模型应用安全风险", "core_competencies": ["提示注入", "数据安全", "权限", "红队评测", "审计响应"]},
    {"course_name": "大模型应用开发工程师 岗位知识库", "domain": "人工智能", "target_role": "大模型应用开发工程师", "role_summary": "构建可追溯、可评测的大模型业务应用", "core_competencies": ["RAG", "工具调用", "应用开发", "评测", "成本治理"]},
    {"course_name": "软件供应链安全工程师（DevSecOps） 岗位知识库", "domain": "特定软件开发", "target_role": "软件供应链安全工程师（DevSecOps）", "role_summary": "保障代码到制品的完整性、可追溯性与安全门禁", "core_competencies": ["SSDF", "SBOM", "安全门禁", "签名", "漏洞响应"]},
    {"course_name": "企业 RAG 应用实施工程师 岗位知识库", "domain": "特定软件开发", "target_role": "企业 RAG 应用实施工程师", "role_summary": "将企业资料转为有权限、可引用和可评测的检索应用", "core_competencies": ["文档解析", "检索", "引用", "权限", "评测"]},
    {"course_name": "MLOps 工程师 岗位知识库", "domain": "特定软件开发", "target_role": "MLOps 工程师", "role_summary": "实现模型训练、部署、监控和回滚的工程闭环", "core_competencies": ["实验追踪", "流水线", "模型注册", "部署", "漂移监控"]},
    {"course_name": "AI-native 应用前端开发工程师 岗位知识库", "domain": "特定软件开发", "target_role": "AI-native 应用前端开发工程师", "role_summary": "实现流式、可解释且安全的 AI Web 交互", "core_competencies": ["流式交互", "Agent 状态", "RAG 引用", "测试", "可访问性"]},
    {"course_name": "工业互联网架构师 岗位知识库", "domain": "工业互联网", "target_role": "工业互联网架构师", "role_summary": "设计工业平台与云边端协同架构", "core_competencies": ["架构设计", "系统集成", "云边协同", "数据治理", "安全"]},
    {"course_name": "工业数据工程师 岗位知识库", "domain": "工业互联网", "target_role": "工业数据工程师", "role_summary": "建设工业数据采集、治理和分析链路", "core_competencies": ["数据采集", "ETL", "时序数据", "数据治理", "质量"]},
    {"course_name": "边缘计算 AI 工程师 岗位知识库", "domain": "工业互联网", "target_role": "边缘计算 AI 工程师", "role_summary": "完成边缘设备 AI 部署、优化和运维", "core_competencies": ["边缘部署", "模型优化", "性能", "设备运维", "可靠性"]},
    {"course_name": "工业 AI 视觉工程师 岗位知识库", "domain": "工业互联网", "target_role": "工业 AI 视觉工程师", "role_summary": "完成缺陷数据、视觉模型和现场验收闭环", "core_competencies": ["机器视觉", "数据标注", "模型训练", "边缘部署", "验收"]},
    {"course_name": "工业互联网网络集成工程师 岗位知识库", "domain": "工业互联网", "target_role": "工业互联网网络集成工程师", "role_summary": "完成工业网络、协议接入和现场联调", "core_competencies": ["网络规划", "工业协议", "设备接入", "联调", "安全运维"]},
]


def resolve_training_role(course_name: str | None) -> dict:
    normalized = (course_name or "").strip()
    for item in TRAINING_ROLES:
        if item["course_name"] == normalized:
            return deepcopy(item)
    return {
        "course_name": normalized or "专业知识库",
        "domain": "特定软件开发",
        "target_role": f"{normalized or '领域'}应用工程师",
        "role_summary": "把领域知识转化为可验证的岗位任务能力",
        "core_competencies": ["领域基础", "工具使用", "任务实施", "质量验证", "故障排查"],
    }
