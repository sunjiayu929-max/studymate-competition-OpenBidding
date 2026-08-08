export type DomainId = "industrial" | "software" | "ai"

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
  summary: string
  skills: string[]
  knowledgeBaseState: "ready" | "planned"
  knowledgeBase?: {
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

export const careerDomains: CareerDomain[] = [
  {
    id: "industrial",
    name: "工业互联网",
    description: "连接工业现场数据、模型部署与生产场景的技能训练。",
    roles: [
      {
        id: "industrial-vision",
        name: "工业视觉质检模型开发与部署工程师",
        summary: "围绕缺陷数据、视觉模型、边缘部署和现场验收完成质量检测闭环。",
        skills: ["机器视觉", "模型训练", "边缘部署", "工业现场调试"],
        knowledgeBaseState: "planned",
      },
      {
        id: "industrial-data",
        name: "工业数据工程师",
        summary: "建设设备数据采集、清洗、治理与分析链路。",
        skills: ["数据采集", "时序数据", "ETL", "数据治理"],
        knowledgeBaseState: "planned",
      },
      {
        id: "industrial-delivery",
        name: "工业互联网实施工程师",
        summary: "将平台能力落到工厂网络、设备接入与业务流程中。",
        skills: ["设备接入", "网络基础", "方案实施", "现场交付"],
        knowledgeBaseState: "planned",
      },
    ],
  },
  {
    id: "software",
    name: "特定软件开发",
    description: "面向企业业务场景的软件交付、集成和质量保障。",
    roles: [
      {
        id: "fde",
        name: "前线部署工程师（FDE）",
        summary: "深入客户现场，把产品能力、数据和业务流程组合成可验证、可交付的解决方案。",
        skills: ["需求澄清", "Python 与 SQL", "系统集成", "客户沟通", "交付验证"],
        knowledgeBaseState: "ready",
        knowledgeBase: {
          overview: "FDE（Forward Deployed Engineer）兼具工程实现与业务交付能力。学习重点不是孤立写代码，而是完成“理解业务问题 -> 对接数据和系统 -> 构建方案 -> 验收迭代”的岗位任务。",
          responsibilities: [
            "与客户和项目团队澄清业务目标、约束、验收口径",
            "完成数据、接口、权限与部署环境的联调排障",
            "将原型或产品能力配置为可演示、可验证的现场方案",
            "沉淀实施记录、风险项和可复用交付文档",
          ],
          workflow: ["场景调研", "方案拆解", "数据与接口联调", "现场部署", "验收复盘"],
          resources: [
            {
              type: "定制讲义",
              title: "FDE 岗位任务与交付方法",
              description: "理解 FDE 的岗位边界、客户问题拆解、技术选型和交付证据链。",
              sourceLabel: "FDE Guidance Book（岗位参考）",
              sourceUrl: "https://github.com/xdash/FDE-the-Guidance-Book-of-Forward-Deployed-Engineer",
            },
            {
              type: "实操指南",
              title: "客户现场最小交付闭环",
              description: "以“需求澄清 -> 接口联调 -> 演示验收”为主线，完成一份可复盘的实施记录。",
              sourceLabel: "StudyMate FDE 岗位切片 v1",
              sourceUrl: "https://github.com/studymate-team/studymate-SoftwareCopyright",
            },
            {
              type: "分阶测试题",
              title: "FDE 场景诊断题组",
              description: "按基础、联调、交付三个阶段检查需求分析、排障和验收决策能力。",
              sourceLabel: "StudyMate FDE 岗位切片 v1",
              sourceUrl: "https://github.com/studymate-team/studymate-SoftwareCopyright",
            },
          ],
        },
      },
      {
        id: "rag-delivery",
        name: "企业 RAG 应用实施工程师",
        summary: "将企业资料、检索系统与业务问答流程整合为可使用的内部应用。",
        skills: ["RAG", "知识库构建", "接口集成", "评测与纠偏"],
        knowledgeBaseState: "planned",
      },
      {
        id: "software-quality",
        name: "软件质量工程师",
        summary: "通过测试设计、自动化验证与缺陷分析保障软件交付质量。",
        skills: ["测试设计", "自动化测试", "缺陷分析", "质量度量"],
        knowledgeBaseState: "planned",
      },
    ],
  },
  {
    id: "ai",
    name: "人工智能",
    description: "聚焦模型能力、数据工程与真实业务应用的落地。",
    roles: [
      {
        id: "ai-app",
        name: "AI 应用工程师",
        summary: "将大模型、知识库和工具调用组合成稳定可用的业务应用。",
        skills: ["提示工程", "RAG", "后端开发", "应用评测"],
        knowledgeBaseState: "planned",
      },
      {
        id: "algorithm",
        name: "算法工程师",
        summary: "负责数据建模、模型训练、评估和服务化部署。",
        skills: ["Python", "机器学习", "模型评估", "MLOps"],
        knowledgeBaseState: "planned",
      },
      {
        id: "llm",
        name: "大模型应用开发工程师",
        summary: "为具体业务设计大模型工作流、工具调用和内容安全机制。",
        skills: ["LLM", "Agent", "工具调用", "安全与评测"],
        knowledgeBaseState: "planned",
      },
    ],
  },
]
