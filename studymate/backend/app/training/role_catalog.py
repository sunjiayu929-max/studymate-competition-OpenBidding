"""Server-owned target-role catalogue used by cross-service integrations.

The browser keeps a matching presentation catalogue, but external services must
never trust a role name or competency list supplied by a browser request.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class TargetRole:
    id: str
    name: str
    domain: str
    summary: str
    competencies: tuple[str, ...]
    course_name: str

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["competencies"] = list(self.competencies)
        return data


_ROLES = (
    TargetRole("ai-agent", "AI Agent 开发工程师", "人工智能", "设计可观测、可评测且受控的 Agent 工作流。", ("Agent 设计", "工具调用", "工作流编排", "评测"), "AI Agent 开发工程师 岗位知识库"),
    TargetRole("ai-infra", "AI Infra 工程师", "人工智能", "建设训练和推理的可靠基础设施。", ("算力调度", "容器平台", "推理服务", "监控"), "AI Infra 工程师 岗位知识库"),
    TargetRole("embodied-ai", "具身智能算法工程师", "人工智能", "完成感知、规划、控制与仿真到实机验证。", ("感知", "规划", "控制", "仿真"), "具身智能算法工程师 岗位知识库"),
    TargetRole("llm-security", "大模型安全工程师", "人工智能", "评测并治理提示注入、数据泄露与越权等风险。", ("红队评测", "提示注入", "权限", "审计"), "大模型安全工程师 岗位知识库"),
    TargetRole("llm-application", "大模型应用开发工程师", "人工智能", "构建可追溯、可评测的大模型业务应用。", ("RAG", "Agent", "应用开发", "评测"), "大模型应用开发工程师 岗位知识库"),
    TargetRole("fde", "前线部署工程师（FDE）", "特定软件开发", "深入客户现场，把产品能力、数据和业务流程组合成可验证、可交付的方案。", ("需求澄清", "Python 与 SQL", "系统集成", "交付验证"), "FDE 岗位知识库"),
    TargetRole("devsecops", "软件供应链安全工程师（DevSecOps）", "特定软件开发", "保障代码到制品的完整性、可追溯性与安全门禁。", ("SSDF", "SBOM", "签名", "漏洞响应"), "软件供应链安全工程师（DevSecOps） 岗位知识库"),
    TargetRole("rag-implementation", "企业 RAG 应用实施工程师", "特定软件开发", "将企业资料转化为有权限、可引用和可评测的检索应用。", ("资料解析", "检索", "引用", "权限", "评测"), "企业 RAG 应用实施工程师 岗位知识库"),
    TargetRole("mlops", "MLOps 工程师", "特定软件开发", "实现模型训练、部署、监控和回滚的工程闭环。", ("实验追踪", "流水线", "注册", "监控"), "MLOps 工程师 岗位知识库"),
    TargetRole("ai-native-frontend", "AI-native 应用前端开发工程师", "特定软件开发", "实现流式、可解释、安全且可访问的 AI Web 交互。", ("流式 UI", "Agent 状态", "RAG 引用", "测试"), "AI-native 应用前端开发工程师 岗位知识库"),
    TargetRole("industrial-architect", "工业互联网架构师", "工业互联网", "设计工业平台与云边端协同架构。", ("架构设计", "系统集成", "云边协同", "安全"), "工业互联网架构师 岗位知识库"),
    TargetRole("industrial-data", "工业数据工程师", "工业互联网", "建设设备数据采集、治理、时序处理与分析链路。", ("数据采集", "ETL", "时序数据", "治理"), "工业数据工程师 岗位知识库"),
    TargetRole("edge-ai", "边缘计算 AI 工程师", "工业互联网", "完成边缘设备 AI 部署、性能优化和运维。", ("边缘部署", "模型优化", "性能", "运维"), "边缘计算 AI 工程师 岗位知识库"),
    TargetRole("industrial-vision", "工业 AI 视觉工程师", "工业互联网", "完成缺陷数据、视觉模型、边缘部署与现场验收。", ("机器视觉", "模型训练", "边缘部署", "验收"), "工业 AI 视觉工程师 岗位知识库"),
    TargetRole("industrial-network", "工业互联网网络集成工程师", "工业互联网", "完成工业网络、协议接入、现场联调和安全运维。", ("网络规划", "工业协议", "设备接入", "联调"), "工业互联网网络集成工程师 岗位知识库"),
    TargetRole("mes-engineer", "MES工程师", "智能制造", "建设、实施、运维并持续优化制造执行系统。", ("MES配置", "系统集成", "工业协议", "生产追溯"), "MES工程师 岗位知识库"),
    TargetRole("multimodal-llm", "多模态大模型算法工程师", "智能制造", "构建面向工业场景的多模态理解、训练与评测能力。", ("多模态数据", "模型训练", "视觉语言", "评测部署"), "多模态大模型算法工程师 岗位知识库"),
    TargetRole("industrial-ai-agent", "工业 AI Agent应用工程师", "智能制造", "把工业知识、工具和工作流编排为可评测的 Agent 应用。", ("Agent工作流", "工业知识库", "工具调用", "安全评测"), "工业 AI Agent应用工程师 岗位知识库"),
    TargetRole("smart-manufacturing-software", "智能制造工程师（软件）", "智能制造", "交付可集成、可验证的智能制造软件方案。", ("工业软件", "云边协同", "数据集成", "交付验证"), "智能制造工程师（软件） 岗位知识库"),
    TargetRole("iot-specialist", "物联网专项开发", "智能制造", "完成工业设备接入、边缘开发与现场联调运维。", ("物联网协议", "设备接入", "边缘开发", "联调运维"), "物联网专项开发 岗位知识库"),
)

TARGET_ROLES: dict[str, TargetRole] = {role.id: role for role in _ROLES}


def get_target_role(role_id: str) -> TargetRole | None:
    return TARGET_ROLES.get((role_id or "").strip())
