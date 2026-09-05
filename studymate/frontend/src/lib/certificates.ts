import { apiGet } from "@/lib/api"
import { careerDomains, type CareerRole } from "@/lib/domainCareerCatalog"

const CERTIFICATE_PREFIX = "sm:role-certificate:"

export const CERTIFICATE_ACCURACY_THRESHOLD = 85

export interface RoleCertificateRecord {
  userId: number
  learnerName: string
  roleId: string
  roleName: string
  completedRounds: number
  issuedAt: string
  serial: string
}

export interface RoleTrainingRound {
  run_id: string
  target_role: string
  accuracy: number | null
  completed_at: string
}

export interface RoleCertificateEvaluation {
  rounds: RoleTrainingRound[]
  completedRoundCount: number
  requiredRoundCount: number
  latestAccuracy: number | null
  eligible: boolean
}

export interface CertificateIdentity {
  userId: number
  learnerName: string
  roleId: string
  roleName: string
  completedRounds: number
  /** 预置/演示证书的颁发时间；正常颁发不传，取当前时间。 */
  issuedAt?: string
}

function certificateStorageKey(userId: number, roleId: string) {
  return `${CERTIFICATE_PREFIX}${userId}:${roleId}`
}

function roleById(roleId: string) {
  for (const domain of careerDomains) {
    const role = domain.roles.find((item) => item.id === roleId)
    if (role) return role
  }
  return null
}

function buildSerial(userId: number, roleId: string, issuedAt: string) {
  const dateToken = issuedAt.slice(0, 10).replaceAll("-", "")
  const roleToken = roleId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "ROLE"
  return `SM-${roleToken}-${dateToken}-${String(userId).padStart(6, "0")}`
}

function normalizeCertificate(
  value: Partial<RoleCertificateRecord>,
  identity: CertificateIdentity,
): RoleCertificateRecord {
  const issuedAt = value.issuedAt || identity.issuedAt || new Date().toISOString()
  return {
    userId: identity.userId,
    learnerName: value.learnerName || identity.learnerName,
    roleId: identity.roleId,
    roleName: value.roleName || identity.roleName,
    completedRounds: Math.max(value.completedRounds || 0, identity.completedRounds),
    issuedAt,
    serial: value.serial || buildSerial(identity.userId, identity.roleId, issuedAt),
  }
}

export function getOrCreateCertificateRecord(identity: CertificateIdentity): RoleCertificateRecord {
  const key = certificateStorageKey(identity.userId, identity.roleId)
  let saved: Partial<RoleCertificateRecord> = {}
  try {
    const raw = localStorage.getItem(key)
    if (raw) saved = JSON.parse(raw) as Partial<RoleCertificateRecord>
  } catch {
    // Local persistence is optional.
  }

  const record = normalizeCertificate(saved, identity)
  try {
    localStorage.setItem(key, JSON.stringify(record))
  } catch {
    // Ignore browsers that disable localStorage.
  }
  return record
}

export function hasCertificateRecord(userId: number, roleId: string) {
  try {
    return localStorage.getItem(certificateStorageKey(userId, roleId)) !== null
  } catch {
    return false
  }
}

export function evaluateRoleCertificateRounds(
  rounds: readonly RoleTrainingRound[],
  role: Pick<CareerRole, "name" | "sampleTasks">,
): RoleCertificateEvaluation {
  const seen = new Set<string>()
  const completed: RoleTrainingRound[] = []
  for (const round of rounds) {
    if (round.target_role !== role.name || seen.has(round.run_id)) continue
    seen.add(round.run_id)
    completed.push(round)
  }
  const requiredRoundCount = Math.max(1, role.sampleTasks.length)
  const latestAccuracy = completed[0]?.accuracy ?? null
  const eligible = completed.length >= requiredRoundCount
    && latestAccuracy !== null
    && latestAccuracy >= CERTIFICATE_ACCURACY_THRESHOLD
  return { rounds: completed, completedRoundCount: completed.length, requiredRoundCount, latestAccuracy, eligible }
}

// 荣誉墙打开时补发：学完岗位全部训练且最近一轮达标，却从未手动领取过的证书在这里自动入账。
export async function syncEarnedCertificates(userId: number, learnerName: string): Promise<RoleCertificateRecord[]> {
  const persisted = await apiGet<{ items: RoleCertificateRecord[] }>("/certificates")
  for (const item of persisted.items) {
    getOrCreateCertificateRecord({
      userId,
      learnerName,
      roleId: item.roleId,
      roleName: item.roleName,
      completedRounds: item.completedRounds,
      issuedAt: item.issuedAt,
    })
  }

  // 画像接口仅用于补签新完成的训练；它失败时，数据库中已持久化的证书仍应正常展示。
  try {
    const profile = await apiGet<{ dims?: { training_rounds?: RoleTrainingRound[] } }>(`/profile/${userId}`)
    const rounds = profile.dims?.training_rounds ?? []
    for (const domain of careerDomains) {
      for (const role of domain.roles) {
        const evaluation = evaluateRoleCertificateRounds(rounds, role)
        if (!evaluation.eligible) continue
        getOrCreateCertificateRecord({
          userId,
          learnerName,
          roleId: role.id,
          roleName: role.name,
          completedRounds: evaluation.completedRoundCount,
        })
      }
    }
  } catch {
    // 数据库证书已同步完成，不因可选的训练补签检查阻断荣誉墙。
  }
  return listUserCertificates(userId, learnerName)
}

export function ensureDemoCertificates(userId: number, learnerName: string): void {
  void userId
  void learnerName
}

export function listUserCertificates(userId: number, learnerName: string): RoleCertificateRecord[] {
  const records: RoleCertificateRecord[] = []
  const prefix = `${CERTIFICATE_PREFIX}${userId}:`
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      const roleId = key.slice(prefix.length)
      const role = roleById(roleId)
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<RoleCertificateRecord>
      const record = normalizeCertificate(parsed, {
        userId,
        learnerName,
        roleId,
        roleName: parsed.roleName || role?.name || roleId,
        completedRounds: parsed.completedRounds || Math.max(1, role?.sampleTasks.length ?? 1),
      })
      records.push(record)
      localStorage.setItem(key, JSON.stringify(record))
    }
  } catch {
    return records
  }
  return records.sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt))
}

export function formatCertificateDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

export function certificateFilename(learnerName: string, roleName: string) {
  const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-")
  return `${safe(learnerName)}-${safe(roleName)}-岗位学习荣誉证书.png`
}
