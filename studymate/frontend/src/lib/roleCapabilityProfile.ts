import type { ReportCapability } from "@/components/LearnerMatchReport"
import { buildRoleCompetencyMap, type CompetencyLevel } from "@/lib/roleCompetencyMap"
import type { CareerRole } from "@/lib/domainCareerCatalog"
import type { PersonalizedTrainingPlan } from "@/store/workspace"

const capabilityStorageKey = (userId: number, roleId: string) =>
  `sm:role-capability-evidence:${userId}:${roleId}`

function readEvidence(userId: number | undefined, roleId: string) {
  if (!userId || typeof window === "undefined") {
    return {} as Record<string, { level?: number }>
  }
  try {
    const raw = window.localStorage.getItem(capabilityStorageKey(userId, roleId))
    return raw ? JSON.parse(raw) as Record<string, { level?: number }> : {}
  } catch {
    return {} as Record<string, { level?: number }>
  }
}

export function buildRoleCapabilityProfile(
  role: CareerRole | null,
  userId: number | undefined,
  plan?: PersonalizedTrainingPlan,
  feedbackAccuracy?: number | null,
): ReportCapability[] {
  if (!role) return []
  const capabilityMap = buildRoleCompetencyMap(role)
  const stored = readEvidence(userId, capabilityMap.roleId)
  const priorityNames = new Set(plan?.priority_competencies ?? [])
  const feedbackLevel = feedbackAccuracy == null
    ? 0
    : feedbackAccuracy >= 85
      ? 3
      : feedbackAccuracy >= 60
        ? 2
        : 1
  const levels = new Map(capabilityMap.nodes.map((node) => [
    node.id,
    Math.min(3, Math.max(0, stored[node.id]?.level ?? (priorityNames.has(node.name) ? feedbackLevel || 1 : 0))) as CompetencyLevel,
  ]))

  return capabilityMap.nodes.map((node) => {
    const level = levels.get(node.id) ?? 0
    let state: ReportCapability["state"]
    if (level >= node.targetLevel) state = "mastered"
    else if (priorityNames.has(node.name)) state = "current"
    else if (level > 0) state = "developing"
    else if (node.prerequisites.every((id) => (levels.get(id) ?? 0) >= 2)) state = "ready"
    else state = "locked"
    return {
      id: node.id,
      name: node.name,
      level,
      state,
      task: node.task,
      prerequisites: node.prerequisites,
    }
  })
}
