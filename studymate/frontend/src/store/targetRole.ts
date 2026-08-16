import { useSyncExternalStore } from "react"

import { careerDomains, type CareerRole, type DomainId } from "@/lib/domainCareerCatalog"

const STORAGE_KEY = "sm:target-role"

export interface TargetRoleSelection {
  domainId: DomainId
  roleId: string
}

function readSelection(): TargetRoleSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as TargetRoleSelection : null
  } catch {
    return null
  }
}

function resolveRole(selection: TargetRoleSelection | null): CareerRole | null {
  if (!selection) return null
  return careerDomains.find((domain) => domain.id === selection.domainId)?.roles.find((role) => role.id === selection.roleId) ?? null
}

class TargetRoleStore {
  private selection = readSelection()
  private listeners = new Set<() => void>()

  get = (): TargetRoleSelection | null => this.selection

  set(selection: TargetRoleSelection | null) {
    this.selection = selection
    try {
      if (selection) localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* local persistence is optional */
    }
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

const targetRoleStore = new TargetRoleStore()

if (typeof window !== "undefined") {
  window.addEventListener("studymate:user-session-reset", () => targetRoleStore.set(null))
}

export function useTargetRole(): CareerRole | null {
  const selection = useSyncExternalStore(targetRoleStore.subscribe, targetRoleStore.get, targetRoleStore.get)
  return resolveRole(selection)
}

export function setTargetRole(selection: TargetRoleSelection | null) {
  targetRoleStore.set(selection)
}

export function getTargetRoleSelection(): TargetRoleSelection | null {
  const selection = targetRoleStore.get()
  return selection ? { ...selection } : null
}
