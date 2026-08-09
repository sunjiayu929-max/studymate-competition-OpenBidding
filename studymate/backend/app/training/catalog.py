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
    {
        "course_name": "机器学习",
        "domain": "人工智能与工业视觉",
        "target_role": "工业视觉质检算法工程师",
        "role_summary": "完成缺陷数据处理、模型训练评估与受控部署排查",
        "core_competencies": [
            "缺陷数据采集与标注",
            "训练集与验证集划分",
            "分类与检测模型训练",
            "误检与漏检指标分析",
            "模型部署与异常排查",
        ],
    },
    {
        "course_name": "数据结构与算法",
        "domain": "软件开发与算法工程",
        "target_role": "算法应用工程师",
        "role_summary": "根据业务约束选择数据结构、实现算法并验证复杂度",
        "core_competencies": ["问题建模", "数据结构选择", "算法实现", "复杂度分析", "边界与测试"],
    },
    {
        "course_name": "操作系统",
        "domain": "系统软件与平台工程",
        "target_role": "系统软件工程师",
        "role_summary": "分析进程、内存、文件与并发问题并完成系统级排障",
        "core_competencies": ["进程线程", "并发同步", "内存管理", "文件系统", "性能排障"],
    },
    {
        "course_name": "计算机网络",
        "domain": "工业互联网与网络运维",
        "target_role": "工业网络运维工程师",
        "role_summary": "规划网络、定位协议故障并保障连接与服务可靠性",
        "core_competencies": ["网络分层", "地址与路由", "传输协议", "网络诊断", "安全与可靠性"],
    },
    {
        "course_name": "计算机组成原理",
        "domain": "智能硬件与嵌入式系统",
        "target_role": "嵌入式系统工程师",
        "role_summary": "理解硬件执行链路并完成性能、存储和接口问题分析",
        "core_competencies": ["指令执行", "存储层次", "总线与接口", "I/O 系统", "性能分析"],
    },
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
