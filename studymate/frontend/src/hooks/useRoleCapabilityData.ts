import { useEffect, useMemo, useState } from "react"

import type { ReportCapability } from "@/components/LearnerMatchReport"
import { apiGet } from "@/lib/api"
import { buildRoleCompetencyMap, type CompetencyLevel } from "@/lib/roleCompetencyMap"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { useWorkspaceStore } from "@/store/workspace"

export interface RoleCapabilityProfileData {
  user_id: number
  version: number
  dims: {
    weak_points?: { topics?: string[]; error_types?: string[] }
    theory_assessments?: Record<string, {
      score?: number
      knowledge_level?: string
      weak_topics?: string[]
    }>
  }
}

const capabilityStorageKey = (userId: number, roleId: string) =>
  `sm:role-capability-evidence:${userId}:${roleId}`

function readCapabilityEvidence(userId: number | undefined, roleId: string) {
  if (!userId || typeof window === "undefined") {
    return {} as Record<string, { level?: number; score?: number }>
  }
  try {
    const raw = window.localStorage.getItem(capabilityStorageKey(userId, roleId))
    return raw ? JSON.parse(raw) as Record<string, { level?: number; score?: number }> : {}
  } catch {
    return {} as Record<string, { level?: number; score?: number }>
  }
}

export function useRoleCapabilityData() {
  const role = useTargetRole()
  const course = useCurrentCourse()
  const user = useCurrentUser()
  const workspace = useWorkspaceStore()
  const [profile, setProfile] = useState<RoleCapabilityProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.user_id) {
      setProfile(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void apiGet<RoleCapabilityProfileData>(`/profile/${user.user_id}`)
      .then((value) => {
        if (active) setProfile(value)
      })
      .catch(() => {
        if (active) setProfile(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user?.user_id])

  const capabilityMap = useMemo(() => role ? buildRoleCompetencyMap(role) : null, [role])
  const theoryEvidence = role ? profile?.dims.theory_assessments?.[role.id] : undefined
  const capabilities = useMemo<ReportCapability[]>(() => {
    if (!role || !capabilityMap) return []
    const stored = readCapabilityEvidence(user?.user_id, capabilityMap.roleId)
    const priorityNames = new Set(workspace.outputs.training_plan?.priority_competencies ?? [])
    const feedbackLevel = workspace.feedback?.accuracy == null
      ? 0
      : workspace.feedback.accuracy >= 85
        ? 3
        : workspace.feedback.accuracy >= 60
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
  }, [capabilityMap, role, user?.user_id, workspace.feedback?.accuracy, workspace.outputs.training_plan])

  return {
    role,
    targetRoleName: role?.name || course?.name || user?.target_role || "目标岗位",
    capabilityMap,
    capabilities,
    profile,
    theoryEvidence,
    profileWeakTopics: profile?.dims.weak_points?.topics ?? [],
    loading,
  }
}
