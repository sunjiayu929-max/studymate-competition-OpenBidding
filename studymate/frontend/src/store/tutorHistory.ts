/**
 * StudyMate 助教会话：按用户和课程隔离。
 * localStorage 负责即时响应与离线兜底，后端 tutor_sessions 负责跨页面、跨设备持久化。
 */
import { useEffect, useSyncExternalStore } from "react"
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"

export interface TutorAttachment {
  name: string
  media_type: string
  kind: "document" | "code"
  content: string
  size?: number
}

export interface TutorMsg {
  role: "user" | "assistant"
  content: string
  images?: string[]
  attachments?: TutorAttachment[]
  delivery?: "complete" | "stopped" | "error"
  error_detail?: string
}

export interface TutorConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages: TutorMsg[]
}

interface TutorConversationState {
  active: TutorConversation
  items: TutorConversation[]
}

const KEY_PREFIX = "sm:tutor-history"

function storageKey(uid: number, courseId: number | null): string {
  return `${KEY_PREFIX}:u${uid}:c${courseId ?? 0}`
}

function archiveKey(uid: number, courseId: number | null): string {
  return `${storageKey(uid, courseId)}:archives`
}

function conversationTitle(messages: TutorMsg[]): string {
  const firstUser = messages.find((message) => message.role === "user")
  if (!firstUser) return "新的学习对话"
  const contentTitle = firstUser.content.replace(/\s+/g, " ").trim()
  if (contentTitle) return contentTitle.slice(0, 36)
  const attachmentName = firstUser.attachments?.[0]?.name?.trim()
  if (attachmentName) return `附件：${attachmentName}`.slice(0, 36)
  if (firstUser.images?.length) return firstUser.images.length > 1 ? `${firstUser.images.length} 张图片问题` : "图片问题"
  return "新的学习对话"
}

function serverId(id: string): number | null {
  if (!/^s\d+$/.test(id)) return null
  const value = Number(id.slice(1))
  return Number.isFinite(value) ? value : null
}

function conversationsPath(courseId: number | null): string {
  return courseId === null
    ? "/tutor/conversations"
    : `/tutor/conversations?course_id=${encodeURIComponent(courseId)}`
}

class TutorHistoryStore {
  private cache = new Map<string, TutorMsg[]>()
  private archives = new Map<string, TutorConversation[]>()
  private listeners = new Map<string, Set<() => void>>()
  private hydrated = new Set<string>()
  private hydration = new Map<string, Promise<void>>()
  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private syncVersions = new Map<string, number>()

  private load(key: string): TutorMsg[] {
    if (this.cache.has(key)) return this.cache.get(key)!
    try {
      const raw = localStorage.getItem(key)
      const arr = raw ? (JSON.parse(raw) as TutorMsg[]) : []
      this.cache.set(key, arr)
      return arr
    } catch {
      this.cache.set(key, [])
      return []
    }
  }

  private loadArchives(key: string): TutorConversation[] {
    if (this.archives.has(key)) return this.archives.get(key)!
    try {
      const raw = localStorage.getItem(key)
      const items = raw ? (JSON.parse(raw) as TutorConversation[]) : []
      this.archives.set(key, items)
      return items
    } catch {
      this.archives.set(key, [])
      return []
    }
  }

  private persist(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 图片或附件超过浏览器空间时仍保留内存会话，并继续尝试写入后端。
    }
  }

  private notify(key: string) {
    this.listeners.get(key)?.forEach((fn) => fn())
  }

  private applyState(
    uid: number,
    courseId: number | null,
    state: TutorConversationState,
    legacyItems: TutorConversation[] = [],
  ) {
    const key = storageKey(uid, courseId)
    const archivedKey = archiveKey(uid, courseId)
    const serverIds = new Set(state.items.map((item) => item.id))
    const merged = [
      ...state.items,
      ...legacyItems.filter((item) => !item.id.startsWith("s") && !serverIds.has(item.id)),
    ].slice(0, 50)
    this.cache.set(key, state.active?.messages || [])
    this.archives.set(archivedKey, merged)
    this.persist(key, state.active?.messages || [])
    this.persist(archivedKey, merged)
    this.notify(key)
  }

  private cancelSync(key: string) {
    const timer = this.syncTimers.get(key)
    if (timer) clearTimeout(timer)
    this.syncTimers.delete(key)
    this.syncVersions.set(key, (this.syncVersions.get(key) || 0) + 1)
  }

  private scheduleSync(uid: number, courseId: number | null, messages: TutorMsg[]) {
    if (!uid) return
    const key = storageKey(uid, courseId)
    const currentTimer = this.syncTimers.get(key)
    if (currentTimer) clearTimeout(currentTimer)
    const version = (this.syncVersions.get(key) || 0) + 1
    this.syncVersions.set(key, version)
    const snapshot = messages.map((message) => ({ ...message }))
    this.syncTimers.set(key, setTimeout(async () => {
      this.syncTimers.delete(key)
      try {
        const state = await apiPut<TutorConversationState>("/tutor/conversations/active", {
          course_id: courseId,
          title: conversationTitle(snapshot),
          messages: snapshot,
        })
        if (this.syncVersions.get(key) === version) this.applyState(uid, courseId, state)
        this.hydrated.add(key)
      } catch {
        // 本地副本已经保存；网络恢复后下一次编辑或刷新会再次同步。
      }
    }, 420))
  }

  get(uid: number, courseId: number | null): TutorMsg[] {
    return this.load(storageKey(uid, courseId))
  }

  getArchives(uid: number, courseId: number | null): TutorConversation[] {
    return this.loadArchives(archiveKey(uid, courseId))
  }

  set(uid: number, courseId: number | null, messages: TutorMsg[]) {
    const key = storageKey(uid, courseId)
    this.cache.set(key, messages)
    this.persist(key, messages)
    this.notify(key)
    this.scheduleSync(uid, courseId, messages)
  }

  private setArchives(uid: number, courseId: number | null, items: TutorConversation[]) {
    const key = archiveKey(uid, courseId)
    this.archives.set(key, items)
    this.persist(key, items)
    this.notify(storageKey(uid, courseId))
  }

  append(uid: number, courseId: number | null, message: TutorMsg) {
    this.set(uid, courseId, [...this.get(uid, courseId), message])
  }

  clear(uid: number, courseId: number | null) {
    this.set(uid, courseId, [])
  }

  async hydrate(uid: number, courseId: number | null, force = false): Promise<void> {
    if (!uid) return
    const key = storageKey(uid, courseId)
    if (!force && this.hydrated.has(key)) return
    const running = this.hydration.get(key)
    if (running) return running
    const task = (async () => {
      const localMessages = [...this.get(uid, courseId)]
      const localArchives = [...this.getArchives(uid, courseId)]
      try {
        let state = await apiGet<TutorConversationState>(conversationsPath(courseId))
        if (!state.active.messages.length && localMessages.length) {
          state = await apiPut<TutorConversationState>("/tutor/conversations/active", {
            course_id: courseId,
            title: conversationTitle(localMessages),
            messages: localMessages,
          })
        }
        this.applyState(uid, courseId, state, localArchives)
        this.hydrated.add(key)
      } catch {
        // 后端不可用时继续使用 localStorage，不阻塞用户提问。
      } finally {
        this.hydration.delete(key)
      }
    })()
    this.hydration.set(key, task)
    return task
  }

  /** 当前会话自动归档，并立即开启一个空白会话。 */
  startNew(uid: number, courseId: number | null) {
    const key = storageKey(uid, courseId)
    this.cancelSync(key)
    const current = [...this.get(uid, courseId)]
    if (current.length > 0) {
      const now = new Date().toISOString()
      this.setArchives(uid, courseId, [{
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: conversationTitle(current),
        created_at: now,
        updated_at: now,
        messages: current,
      }, ...this.getArchives(uid, courseId)].slice(0, 50))
    }
    this.cache.set(key, [])
    this.persist(key, [])
    this.notify(key)

    void (async () => {
      try {
        if (current.length) {
          await apiPut<TutorConversationState>("/tutor/conversations/active", {
            course_id: courseId,
            title: conversationTitle(current),
            messages: current,
          })
        }
        const state = await apiPost<TutorConversationState>("/tutor/conversations/new", { course_id: courseId })
        this.applyState(uid, courseId, state)
        this.hydrated.add(key)
      } catch {
        // 已完成本地切换；后续写入会重新建立服务端活跃会话。
      }
    })()
  }

  /** 恢复历史会话；当前会话会先自动归档。 */
  restore(uid: number, courseId: number | null, id: string) {
    const target = this.getArchives(uid, courseId).find((item) => item.id === id)
    if (!target) return
    const key = storageKey(uid, courseId)
    this.cancelSync(key)
    const current = [...this.get(uid, courseId)]
    const remaining = this.getArchives(uid, courseId).filter((item) => item.id !== id)
    if (current.length > 0) {
      const now = new Date().toISOString()
      remaining.unshift({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: conversationTitle(current),
        created_at: now,
        updated_at: now,
        messages: current,
      })
    }
    this.setArchives(uid, courseId, remaining.slice(0, 50))
    this.cache.set(key, target.messages)
    this.persist(key, target.messages)
    this.notify(key)

    void (async () => {
      try {
        if (current.length) {
          await apiPut<TutorConversationState>("/tutor/conversations/active", {
            course_id: courseId,
            title: conversationTitle(current),
            messages: current,
          })
        }
        const numericId = serverId(id)
        let state: TutorConversationState
        if (numericId !== null) {
          state = await apiPost<TutorConversationState>(`/tutor/conversations/${numericId}/activate`)
        } else {
          await apiPost<TutorConversationState>("/tutor/conversations/new", { course_id: courseId })
          state = await apiPut<TutorConversationState>("/tutor/conversations/active", {
            course_id: courseId,
            title: target.title,
            messages: target.messages,
          })
        }
        this.applyState(uid, courseId, state)
      } catch {
        // 本地恢复已经完成。
      }
    })()
  }

  deleteArchive(uid: number, courseId: number | null, id: string) {
    this.setArchives(uid, courseId, this.getArchives(uid, courseId).filter((item) => item.id !== id))
    const numericId = serverId(id)
    if (numericId !== null) {
      void apiDelete<TutorConversationState>(`/tutor/conversations/${numericId}`)
        .then((state) => this.applyState(uid, courseId, state))
        .catch(() => {})
    }
  }

  renameArchive(uid: number, courseId: number | null, id: string, title: string) {
    const normalized = title.trim().slice(0, 256)
    if (!normalized) return
    this.setArchives(uid, courseId, this.getArchives(uid, courseId).map((item) => (
      item.id === id ? { ...item, title: normalized, updated_at: new Date().toISOString() } : item
    )))
    const numericId = serverId(id)
    if (numericId !== null) {
      void apiPut<TutorConversationState>(`/tutor/conversations/${numericId}`, { title: normalized })
        .then((state) => this.applyState(uid, courseId, state))
        .catch(() => {})
    }
  }

  subscribe(uid: number, courseId: number | null, fn: () => void): () => void {
    const key = storageKey(uid, courseId)
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(fn)
    return () => {
      this.listeners.get(key)?.delete(fn)
    }
  }
}

export const tutorHistory = new TutorHistoryStore()

export function useTutorHistory(uid: number, courseId: number | null): TutorMsg[] {
  useEffect(() => { void tutorHistory.hydrate(uid, courseId) }, [uid, courseId])
  return useSyncExternalStore(
    (fn) => tutorHistory.subscribe(uid, courseId, fn),
    () => tutorHistory.get(uid, courseId),
    () => tutorHistory.get(uid, courseId),
  )
}

export function useTutorConversations(uid: number, courseId: number | null): TutorConversation[] {
  useEffect(() => { void tutorHistory.hydrate(uid, courseId) }, [uid, courseId])
  return useSyncExternalStore(
    (fn) => tutorHistory.subscribe(uid, courseId, fn),
    () => tutorHistory.getArchives(uid, courseId),
    () => tutorHistory.getArchives(uid, courseId),
  )
}
