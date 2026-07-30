/**
 * 当前登录用户 store。认证凭据保存在 HttpOnly Cookie，本 store 只缓存展示资料。
 *
 * 持久化在 localStorage，应用启动时会通过 /auth/me 校验 Cookie 会话。
 * 路由守卫从这里读 user 是否存在 + role 是否为 admin。
 *
 */
import { useSyncExternalStore } from "react"

export type UserRole = "student" | "judge" | "admin"

export interface CurrentUser {
  user_id: number
  name: string
  email?: string | null
  role: UserRole
}

const STORAGE_KEY = "sm:current-user"
export const USER_SESSION_RESET_EVENT = "studymate:user-session-reset"

function loadFromStorage(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CurrentUser
    if (typeof parsed.user_id !== "number" || !parsed.name) return null
    const role: UserRole = parsed.role === "admin" || parsed.role === "judge" ? parsed.role : "student"
    return { ...parsed, role }
  } catch {
    return null
  }
}

class UserStore {
  private current: CurrentUser | null
  private listeners = new Set<() => void>()

  constructor() {
    this.current = loadFromStorage()
  }

  get = (): CurrentUser | null => this.current

  set(u: CurrentUser | null) {
    const previousUserId = this.current?.user_id ?? null
    this.current = u
    if (u && typeof window !== "undefined") {
      window.dispatchEvent(new Event("studymate:event-tracking-resume"))
    }
    try {
      if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    this.listeners.forEach((fn) => fn())
    if (previousUserId !== null && previousUserId !== u?.user_id && typeof window !== "undefined") {
      window.dispatchEvent(new Event(USER_SESSION_RESET_EVENT))
    }
  }

  logout() {
    this.set(null)
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const userStore = new UserStore()

export function useCurrentUser(): CurrentUser | null {
  return useSyncExternalStore(userStore.subscribe, userStore.get, userStore.get)
}

export function setCurrentUser(u: CurrentUser | null) {
  userStore.set(u)
}

export function logoutUser() {
  userStore.logout()
}

/** 同步读取（给 api.ts / SSE wrapper 注入 header 用，不走 React hook）。 */
export function getCurrentUserId(): number | null {
  return userStore.get()?.user_id ?? null
}

export function isAdmin(): boolean {
  return isPrivilegedRole(userStore.get()?.role)
}

export function isPrivilegedRole(role?: UserRole): boolean {
  return role === "admin" || role === "judge"
}
