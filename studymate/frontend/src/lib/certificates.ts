import { careerDomains } from "@/lib/domainCareerCatalog"

const CERTIFICATE_PREFIX = "sm:role-certificate:"

export interface RoleCertificateRecord {
  userId: number
  learnerName: string
  roleId: string
  roleName: string
  completedRounds: number
  issuedAt: string
  serial: string
}

export interface CertificateIdentity {
  userId: number
  learnerName: string
  roleId: string
  roleName: string
  completedRounds: number
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
  const issuedAt = value.issuedAt || new Date().toISOString()
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
