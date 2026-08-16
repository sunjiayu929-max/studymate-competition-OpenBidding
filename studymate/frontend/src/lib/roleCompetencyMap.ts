import type { CareerRole } from "./domainCareerCatalog"

export type CompetencyLevel = 0 | 1 | 2 | 3

export interface RoleCompetencyNode {
  id: string
  name: string
  description: string
  task: string
  deliverable: string
  prerequisites: string[]
  targetLevel: 3
  required: true
}

export interface RoleCompetencyMap {
  roleId: string
  roleName: string
  nodes: RoleCompetencyNode[]
  finalAssessment: {
    id: string
    name: string
    description: string
    prerequisites: string[]
  }
  completionCriteria: string[]
}

const DESCRIPTION_BY_SKILL: Record<string, string> = {
  "需求澄清": "把模糊业务诉求转化为边界清晰、可验证的交付目标。",
  "Python 与 SQL": "完成数据检查、处理、分析与问题定位，为方案实现提供可靠依据。",
  "系统集成": "把模型、数据、接口与业务流程接入可运行的解决方案。",
  "客户沟通": "用业务方能够理解的方式说明方案、风险、进度与取舍。",
  "交付验证": "以验收标准、测试证据和复盘记录证明方案达到目标。",
}

function prerequisitesFor(index: number, count: number, nodeIds: string[]) {
  if (count >= 5) {
    const dependencyIndexes = [[], [], [0, 1], [0], [2, 3]]
    return (dependencyIndexes[index] ?? [index - 1])
      .filter((item) => item >= 0)
      .map((item) => nodeIds[item])
  }

  const dependencyIndexes = [[], [], [0, 1], [2]]
  return (dependencyIndexes[index] ?? [index - 1])
    .filter((item) => item >= 0)
    .map((item) => nodeIds[item])
}

export function buildRoleCompetencyMap(role: CareerRole): RoleCompetencyMap {
  const nodeIds = role.skills.map((_, index) => `${role.id}-capability-${index + 1}`)
  const nodes = role.skills.map((skill, index): RoleCompetencyNode => {
    const task = role.sampleTasks[index] ?? `完成${skill}岗位任务`
    return {
      id: nodeIds[index],
      name: skill,
      description: DESCRIPTION_BY_SKILL[skill] ?? `围绕“${task}”形成可复用的方法、实操能力与验收证据。`,
      task,
      deliverable: `${task}：过程记录、成果物与验收说明`,
      prerequisites: prerequisitesFor(index, role.skills.length, nodeIds),
      targetLevel: 3,
      required: true,
    }
  })

  const leafIds = nodes
    .filter((node) => !nodes.some((candidate) => candidate.prerequisites.includes(node.id)))
    .map((node) => node.id)

  return {
    roleId: role.id,
    roleName: role.name,
    nodes,
    finalAssessment: {
      id: `${role.id}-final-assessment`,
      name: "岗位综合情境验收",
      description: `在一个完整的${role.name}业务情境中，综合运用全部必修能力完成交付并接受验收。`,
      prerequisites: leafIds.length > 0 ? leafIds : nodeIds,
    },
    completionCriteria: [
      `全部 ${nodes.length} 项必修能力达到 L3（可独立完成）`,
      "分阶测试成绩达到 85 分及以上",
      "岗位综合情境任务通过审核裁判验收",
      "关键结论具备知识来源或过程证据",
    ],
  }
}
