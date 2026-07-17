/**
 * AI 助教全局流式运行时。
 *
 * SSE 由模块级单例持有，不随 /tutor 页面或右侧抽屉卸载而终止。
 * 运行状态按 user × course 隔离，最终回答恰好一次写入 tutorHistory。
 */
import { useSyncExternalStore } from "react"
import { fetchEventSource } from "@microsoft/fetch-event-source"

import { sseHeaders } from "@/lib/api"
import type { TutorLearningMethod } from "@/store/tutorLearningMethod"
import type { TutorPageContext } from "@/store/tutorContext"
import { tutorHistory, type TutorMsg } from "@/store/tutorHistory"
import { USER_SESSION_RESET_EVENT } from "@/store/user"

export type TutorGenerationOrigin = "text" | "voice"

export interface TutorGenerationState {
  status: "idle" | "open"
  partial: string
  runId: string | null
  origin: TutorGenerationOrigin | null
  startedAt: number
  mock: boolean | null
}
interface StartTutorGeneration {
  userId: number
  courseId: number | null
  messages: TutorMsg[]
  pageContext?: TutorPageContext | null
  learningMethod: TutorLearningMethod
  origin?: TutorGenerationOrigin
}

const DRAFT_PREFIX = "sm:tutor-draft"

function generationKey(userId: number, courseId: number | null) {
  return `u${userId}:c${courseId ?? 0}`
}

function draftKey(userId: number, courseId: number | null) {
  return `${DRAFT_PREFIX}:${generationKey(userId, courseId)}`
}

function idleState(): TutorGenerationState {
  return { status: "idle", partial: "", runId: null, origin: null, startedAt: 0, mock: null }
}

function readableStreamError(value: unknown) {
  let raw = ""
  if (typeof value === "string" && value.trim() && value !== "[object Object]") raw = value.trim()
  if (value && typeof value === "object") {
    const detail = (value as { detail?: unknown; message?: unknown }).detail
      ?? (value as { message?: unknown }).message
    if (typeof detail === "string" && detail.trim()) raw = detail.trim()
  }
  if (/401|unauthorized|未登录|会话失效/iu.test(raw)) return "登录状态已失效，请重新登录后再试"
  if (/403|forbidden|无权限/iu.test(raw)) return "当前账号暂无权限完成这次请求"
  if (/429|rate.?limit|too many/iu.test(raw)) return "请求较多，稍等片刻后即可重试"
  if (/timeout|timed out|超时/iu.test(raw)) return "模型响应超时，问题已保留，可以直接重试"
  if (/network|failed to fetch|连接|connection/iu.test(raw)) return "连接暂时不可用，请检查网络或服务状态后重试"
  return /[\u3400-\u9fff]/u.test(raw) ? raw.slice(0, 180) : "模型服务暂时没有完成回答，请稍后重试"
}

class TutorGenerationStore {
  private states = new Map<string, TutorGenerationState>()
  private listeners = new Map<string, Set<() => void>>()
  private controllers = new Map<string, AbortController>()
  private terminalRuns = new Set<string>()
  private draftCache = new Map<string, string>()
  private draftListeners = new Map<string, Set<() => void>>()

  get(userId: number, courseId: number | null): TutorGenerationState {
    const key = generationKey(userId, courseId)
    if (!this.states.has(key)) this.states.set(key, idleState())
    return this.states.get(key)!
  }

  subscribe(userId: number, courseId: number | null, listener: () => void): () => void {
    const key = generationKey(userId, courseId)
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(listener)
    return () => this.listeners.get(key)?.delete(listener)
  }

  private update(userId: number, courseId: number | null, state: TutorGenerationState) {
    const key = generationKey(userId, courseId)
    this.states.set(key, state)
    this.listeners.get(key)?.forEach((listener) => listener())
  }

  private isCurrent(userId: number, courseId: number | null, runId: string) {
    return this.get(userId, courseId).runId === runId && !this.terminalRuns.has(runId)
  }

  private finish(
    userId: number,
    courseId: number | null,
    runId: string,
    delivery: "complete" | "stopped" | "error",
    errorDetail?: string,
  ) {
    if (!this.isCurrent(userId, courseId, runId)) return
    this.terminalRuns.add(runId)
    const state = this.get(userId, courseId)
    const content = state.partial.trim()
    if (delivery === "complete" && content) {
      tutorHistory.append(userId, courseId, { role: "assistant", content, delivery: "complete" })
    } else if (delivery !== "complete" || !content) {
      tutorHistory.append(userId, courseId, {
        role: "assistant",
        content,
        delivery: delivery === "complete" ? "error" : delivery,
        error_detail: delivery === "complete" ? "模型没有返回有效内容，可以直接重试。" : errorDetail,
      })
    }
    this.controllers.delete(generationKey(userId, courseId))
    this.update(userId, courseId, idleState())
  }

  start({
    userId,
    courseId,
    messages,
    pageContext,
    learningMethod,
    origin = "text",
  }: StartTutorGeneration): string | null {
    if (!userId || this.get(userId, courseId).status === "open") return null
    const key = generationKey(userId, courseId)
    this.controllers.get(key)?.abort()
    const controller = new AbortController()
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    this.controllers.set(key, controller)
    this.update(userId, courseId, {
      status: "open",
      partial: "",
      runId,
      origin,
      startedAt: Date.now(),
      mock: null,
    })

    let terminal = false
    void fetchEventSource("/api/tutor/chat", {
      method: "POST",
      headers: sseHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        user_id: userId,
        course_id: courseId,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          images: message.images,
          attachments: message.attachments,
        })),
        page_context: pageContext ?? undefined,
        learning_method: learningMethod,
      }),
      signal: controller.signal,
      openWhenHidden: true,
      onmessage: (message) => {
        if (!this.isCurrent(userId, courseId, runId)) return
        if (message.event === "meta") {
          try {
            const meta = JSON.parse(message.data) as { mock?: boolean }
            const state = this.get(userId, courseId)
            this.update(userId, courseId, { ...state, mock: Boolean(meta.mock) })
          } catch { /* keep current meta */ }
          return
        }
        if (message.event === "delta") {
          const state = this.get(userId, courseId)
          this.update(userId, courseId, { ...state, partial: state.partial + (message.data || "") })
          return
        }
        if (message.event === "done") {
          terminal = true
          this.finish(userId, courseId, runId, "complete")
          return
        }
        if (message.event === "error") {
          terminal = true
          this.finish(userId, courseId, runId, "error", readableStreamError(message.data))
        }
      },
      onerror: (error) => {
        if (controller.signal.aborted) throw error
        terminal = true
        this.finish(userId, courseId, runId, "error", readableStreamError(error))
        throw error
      },
    }).then(() => {
      if (!terminal && !controller.signal.aborted) {
        this.finish(userId, courseId, runId, "error", "连接提前结束，当前内容已保留。")
      }
    }).catch(() => {
      if (!terminal && !controller.signal.aborted) {
        this.finish(userId, courseId, runId, "error", "请求失败，当前内容已保留。")
      }
    })
    return runId
  }

  stop(userId: number, courseId: number | null) {
    const state = this.get(userId, courseId)
    if (state.status !== "open" || !state.runId) return
    this.controllers.get(generationKey(userId, courseId))?.abort()
    this.finish(userId, courseId, state.runId, "stopped")
  }

  resetAll() {
    this.controllers.forEach((controller) => controller.abort())
    this.controllers.clear()
    this.states.clear()
    this.terminalRuns.clear()
    this.listeners.forEach((listeners) => listeners.forEach((listener) => listener()))
    if (typeof window !== "undefined") {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index)
        if (key?.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key)
      }
    }
    this.draftCache.clear()
    this.draftListeners.forEach((listeners) => listeners.forEach((listener) => listener()))
  }

  getDraft(userId: number, courseId: number | null): string {
    const key = draftKey(userId, courseId)
    if (this.draftCache.has(key)) return this.draftCache.get(key)!
    let value = ""
    try { value = sessionStorage.getItem(key) || "" } catch { /* ignore */ }
    this.draftCache.set(key, value)
    return value
  }

  setDraft(userId: number, courseId: number | null, value: string) {
    const key = draftKey(userId, courseId)
    if (this.getDraft(userId, courseId) === value) return
    this.draftCache.set(key, value)
    try {
      if (value) sessionStorage.setItem(key, value)
      else sessionStorage.removeItem(key)
    } catch { /* ignore */ }
    this.draftListeners.get(key)?.forEach((listener) => listener())
  }

  subscribeDraft(userId: number, courseId: number | null, listener: () => void): () => void {
    const key = draftKey(userId, courseId)
    if (!this.draftListeners.has(key)) this.draftListeners.set(key, new Set())
    this.draftListeners.get(key)!.add(listener)
    return () => this.draftListeners.get(key)?.delete(listener)
  }
}

export const tutorGenerationStore = new TutorGenerationStore()

if (typeof window !== "undefined") {
  window.addEventListener(USER_SESSION_RESET_EVENT, () => tutorGenerationStore.resetAll())
}

export function useTutorGeneration(userId: number, courseId: number | null): TutorGenerationState {
  return useSyncExternalStore(
    (listener) => tutorGenerationStore.subscribe(userId, courseId, listener),
    () => tutorGenerationStore.get(userId, courseId),
    () => tutorGenerationStore.get(userId, courseId),
  )
}

export function useTutorDraft(userId: number, courseId: number | null): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (listener) => tutorGenerationStore.subscribeDraft(userId, courseId, listener),
    () => tutorGenerationStore.getDraft(userId, courseId),
    () => "",
  )
  return [value, (next) => tutorGenerationStore.setDraft(userId, courseId, next)]
}
