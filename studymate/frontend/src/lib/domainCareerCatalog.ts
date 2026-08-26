export type DomainId = "industrial" | "software" | "ai" | "smart-manufacturing"

export interface LearningResource {
  title: string
  type: "定制讲义" | "实操指南" | "分阶测试题"
  description: string
  sourceLabel: string
  sourceUrl: string
}

export interface CareerRole {
  id: string
  name: string
  courseName: string
  summary: string
  skills: string[]
  sampleTasks: string[]
  baseCourses: string[]
  knowledgeBaseState: "ready" | "planned"
  knowledgeBase?: {
    chunkCount?: number
    lastImportedAt?: string
    overview: string
    responsibilities: string[]
    workflow: string[]
    resources: LearningResource[]
  }
}

export interface CareerDomain {
  id: DomainId
  name: string
  description: string
  roles: CareerRole[]
}

const importedAt = "2026-08-14"

function role(id: string, name: string, summary: string, skills: string[], tasks: string[], sources: LearningResource[], baseCourses = ["机器学习", "数据结构与算法"]): CareerRole {
  return {
    id,
    name,
    courseName: `${name} 岗位知识库`,
    summary,
    skills,
    sampleTasks: tasks,
    baseCourses,
    knowledgeBaseState: "ready",
    knowledgeBase: {
      lastImportedAt: importedAt,
      overview: `${name} 的岗位资料已按“概述、职责流程、技术栈案例、能力模型、行业资料”切片导入；每条切片均保留正文明确标注的外部来源，检索结果可进入来源页核验。`,
      responsibilities: tasks.slice(0, 3),
      workflow: ["需求与边界确认", "资料检索与方案设计", "实施与验证", "复盘与迭代"],
      resources: sources,
    },
  }
}

const fdeSources: LearningResource[] = [
  { type: "定制讲义", title: "FDE 岗位任务与交付方法", description: "岗位边界、客户问题拆解、技术选型和交付证据链。", sourceLabel: "FDE Guidance Book", sourceUrl: "https://github.com/xdash/FDE-the-Guidance-Book-of-Forward-Deployed-Engineer" },
  { type: "实操指南", title: "客户现场最小交付闭环", description: "需求澄清、接口联调与演示验收。", sourceLabel: "美团招聘：FDE 解决方案工程师", sourceUrl: "https://www.zhaopin.com/jobdetail/CC383625320J40880566009.htm" },
  { type: "分阶测试题", title: "FDE 场景诊断题组", description: "检查需求分析、排障和验收决策能力。", sourceLabel: "Palantir：Forward Deployed Software Engineer", sourceUrl: "https://www.palantir.com/careers/" },
]

const softwareSources: LearningResource[] = [
  { type: "定制讲义", title: "岗位知识要点", description: "概述、边界和关键术语的可追溯摘要。", sourceLabel: "智联招聘：RAG 架构师", sourceUrl: "https://www.zhaopin.com/jobdetail/CCL1525557200J40887968305.htm" },
  { type: "实操指南", title: "岗位实施闭环", description: "输入、流程、异常处理、验收与回滚。", sourceLabel: "智联招聘：MLOps 工程师", sourceUrl: "https://www.zhaopin.com/jobdetail/CC537323020J40868750011.htm" },
  { type: "分阶测试题", title: "岗位能力训练", description: "基础、实践和综合决策题。", sourceLabel: "智联招聘：AI 前端开发工程师", sourceUrl: "https://www.zhaopin.com/jobdetail/CC854626770J41012205702.htm" },
]

const aiSources: LearningResource[] = [
  { type: "定制讲义", title: "AI 岗位核心知识", description: "按岗位职责组织的基础概念和工程资料。", sourceLabel: "LangChain 开源仓库", sourceUrl: "https://github.com/langchain-ai/langchain" },
  { type: "实操指南", title: "AI 岗位实操流程", description: "任务拆解、实施、验证和复盘。", sourceLabel: "vLLM 开源推理引擎", sourceUrl: "https://github.com/vllm-project/vllm" },
  { type: "分阶测试题", title: "AI 岗位能力题", description: "按知识、工具和工程决策分层练习。", sourceLabel: "OWASP Top 10 for LLM Applications", sourceUrl: "https://genai.owasp.org/llm-top-10/" },
]

const industrialSources: LearningResource[] = [
  { type: "定制讲义", title: "工业互联网岗位知识", description: "工业场景、角色职责和安全边界。", sourceLabel: "工业互联网产业联盟", sourceUrl: "https://www.iii.org.cn/" },
  { type: "实操指南", title: "工业现场实施指南", description: "采集、联调、部署、验收和异常处理。", sourceLabel: "EdgeX Foundry 开源项目", sourceUrl: "https://github.com/edgexfoundry/edgex-go" },
  { type: "分阶测试题", title: "工业岗位能力题", description: "按现场问题分析、工程实施和综合决策分层。", sourceLabel: "中国工业互联网研究院", sourceUrl: "https://www.china-aii.com/" },
]

const smartManufacturingSources: LearningResource[] = [
  { type: "定制讲义", title: "智能制造岗位知识要点", description: "围绕制造业务、工业数据和软件工程组织岗位知识。", sourceLabel: "NIST Smart Manufacturing", sourceUrl: "https://www.nist.gov/programs-projects/smart-manufacturing-systems-design-and-analysis" },
  { type: "实操指南", title: "设备接入与系统集成闭环", description: "从协议接入、数据联调到现场验收的工程步骤。", sourceLabel: "OPC Foundation：OPC UA", sourceUrl: "https://opcfoundation.org/about/opc-technologies/opc-ua/" },
  { type: "分阶测试题", title: "智能制造岗位能力题", description: "按岗位基础、工程实施和综合决策分层练习。", sourceLabel: "MESA International：MES Explained", sourceUrl: "https://www.mesa.org/en/modelstrategicinitiatives/MESExplained.asp" },
]

export const careerDomains: CareerDomain[] = [
  {
    id: "ai",
    name: "人工智能",
    description: "模型、Agent、基础设施、具身智能和安全的岗位训练。",
    roles: [
      role("ai-agent", "AI Agent 开发工程师", "设计可观测、可评测且受控的 Agent 工作流。", ["Agent 设计", "工具调用", "工作流编排", "评测"], ["设计多步骤 Agent 工作流", "实现工具参数校验", "分析失败轨迹并迭代"], aiSources),
      role("ai-infra", "AI Infra 工程师", "建设训练和推理的可靠基础设施。", ["算力调度", "容器平台", "推理服务", "监控"], ["规划训练资源", "部署推理服务", "排查资源与稳定性问题"], aiSources),
      role("embodied-ai", "具身智能算法工程师", "完成感知、规划、控制与仿真到实机验证。", ["感知", "规划", "控制", "仿真"], ["验证感知数据", "制定仿真到实机方案", "处理实机异常"], aiSources),
      role("llm-security", "大模型安全工程师", "评测并治理提示注入、数据泄露与越权等风险。", ["红队评测", "提示注入", "权限", "审计"], ["构造攻击样本", "设计安全门禁", "处理高风险输出"], aiSources),
      role("llm-application", "大模型应用开发工程师", "构建可追溯、可评测的大模型业务应用。", ["RAG", "Agent", "应用开发", "评测"], ["实现知识问答链路", "设计效果评测", "分析质量与成本"], aiSources),
    ],
  },
  {
    id: "software",
    name: "特定软件开发",
    description: "面向企业场景的软件交付、安全、模型工程和 AI 交互。",
    roles: [
      { ...role("fde", "前线部署工程师（FDE）", "深入客户现场，把产品能力、数据和业务流程组合成可验证、可交付的方案。", ["需求澄清", "Python 与 SQL", "系统集成", "交付验证"], ["需求澄清如何形成可验证价值假设", "现场数据接入与接口联调依赖清单", "部署验收如何保留业务结果与运行证据"], fdeSources, ["机器学习", "数据结构与算法", "计算机网络"]), courseName: "FDE 岗位知识库", knowledgeBase: { ...role("fde-tmp", "前线部署工程师（FDE）", "", [], [], fdeSources).knowledgeBase!, chunkCount: 34, overview: "FDE 既要完成工程实现，也要围绕客户业务流程形成可验证、可交付的现场方案；原有知识保留，并已追加可核验的岗位资料。" } },
      role("devsecops", "软件供应链安全工程师（DevSecOps）", "保障代码到制品的完整性、可追溯性与安全门禁。", ["SSDF", "SBOM", "签名", "漏洞响应"], ["生成并分析 SBOM", "配置 CI 安全门禁", "演练漏洞响应与回滚"], softwareSources),
      role("rag-implementation", "企业 RAG 应用实施工程师", "将企业资料转化为有权限、可引用和可评测的检索应用。", ["资料解析", "检索", "引用", "权限", "评测"], ["制定切分与索引规则", "设计混合检索", "处理无证据与越权问题"], softwareSources),
      role("mlops", "MLOps 工程师", "实现模型训练、部署、监控和回滚的工程闭环。", ["实验追踪", "流水线", "注册", "监控"], ["构建训练 Pipeline", "设计灰度发布", "诊断模型漂移"], softwareSources),
      role("ai-native-frontend", "AI-native 应用前端开发工程师", "实现流式、可解释、安全且可访问的 AI Web 交互。", ["流式 UI", "Agent 状态", "RAG 引用", "测试"], ["实现 SSE 重连", "制作 Agent 画布", "测试引用与安全渲染"], softwareSources),
    ],
  },
  {
    id: "industrial",
    name: "工业互联网",
    description: "工业平台、数据、边缘 AI、视觉和网络集成的岗位训练。",
    roles: [
      role("industrial-architect", "工业互联网架构师", "设计工业平台与云边端协同架构。", ["架构设计", "系统集成", "云边协同", "安全"], ["划分云边端职责", "设计平台集成边界", "评审数据与安全方案"], industrialSources),
      role("industrial-data", "工业数据工程师", "建设设备数据采集、治理、时序处理与分析链路。", ["数据采集", "ETL", "时序数据", "治理"], ["设计设备采集链路", "制定清洗规则", "定位指标波动"], industrialSources),
      role("edge-ai", "边缘计算 AI 工程师", "完成边缘设备 AI 部署、性能优化和运维。", ["边缘部署", "模型优化", "性能", "运维"], ["优化模型体积", "部署边缘服务", "排查现场性能异常"], industrialSources),
      role("industrial-vision", "工业 AI 视觉工程师", "完成缺陷数据、视觉模型、边缘部署与现场验收。", ["机器视觉", "模型训练", "边缘部署", "验收"], ["制定标注规范", "分析误检漏检", "完成部署验收"], industrialSources),
      role("industrial-network", "工业互联网网络集成工程师", "完成工业网络、协议接入、现场联调和安全运维。", ["网络规划", "工业协议", "设备接入", "联调"], ["梳理协议适配", "制定联调方案", "定位网络故障"], industrialSources),
    ],
  },
  {
    id: "smart-manufacturing",
    name: "智能制造",
    description: "面向制造执行、工业 AI、工业软件与物联网的岗位训练。",
    roles: [
      role("mes-engineer", "MES工程师", "建设、实施、运维并持续优化制造执行系统。", ["MES配置", "系统集成", "工业协议", "生产追溯"], ["配置工单与生产追溯规则", "排查 ERP 与 MES 接口异常", "验证设备数据采集与 OEE 指标"], smartManufacturingSources, ["数据结构与算法", "计算机网络"]),
      role("multimodal-llm", "多模态大模型算法工程师", "构建面向工业场景的多模态理解、训练与评测能力。", ["多模态数据", "模型训练", "视觉语言", "评测部署"], ["构建图文与传感器训练样本", "设计工业视觉语言评测集", "分析模型部署后的误判案例"], smartManufacturingSources),
      role("industrial-ai-agent", "工业 AI Agent应用工程师", "把工业知识、工具和工作流编排为可评测的 Agent 应用。", ["Agent工作流", "工业知识库", "工具调用", "安全评测"], ["设计工艺知识问答工作流", "实现受控设备数据工具调用", "评测无依据回答与异常处理"], smartManufacturingSources),
      role("smart-manufacturing-software", "智能制造工程师（软件）", "交付可集成、可验证的智能制造软件方案。", ["工业软件", "云边协同", "数据集成", "交付验证"], ["划分智能制造系统云边端职责", "制定跨系统数据集成方案", "完成现场交付验收与问题复盘"], smartManufacturingSources, ["数据结构与算法", "计算机网络"]),
      role("iot-specialist", "物联网专项开发", "完成工业设备接入、边缘开发与现场联调运维。", ["物联网协议", "设备接入", "边缘开发", "联调运维"], ["实现 OPC UA 与 MQTT 设备接入", "开发边缘采集与上报服务", "定位现场联调与网络异常"], smartManufacturingSources, ["计算机网络", "数据结构与算法"]),
    ],
  },
]
