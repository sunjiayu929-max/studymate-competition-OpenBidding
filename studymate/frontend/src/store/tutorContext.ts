/**
 * 当前页面上下文（给 AI 助教浮动小精灵用）。
 *
 * 每个业务页 mount 时通过 useTutorContext(...) 写入；unmount 时自动清空。
 * 助教 SSE 请求时拼到 system prompt：
 *   "用户当前在浏览：工作台资源详情 · 标题：K-Means 讲解 · 主题：K-Means"
 */
import { useSyncExternalStore } from "react"

export type PageKey =
  | "home"
  | "workspace"
  | "workspace_detail"
  | "notes"
  | "report"
  | "tests"
  | "quiz"
  | "profile"
  | "rag"
  | "courses"
  | "guide"

export interface TutorPageContext {
  page: PageKey
  title?: string
  topic?: string
  snippet?: string
  /** 题库页的明确状态，后端据此执行“未作答不泄题”规则。 */
  quiz_state?: "unanswered" | "attempted" | "answered"
  question_type?: "mcq" | "fill" | "code"
  quick_actions?: string[]
}

class TutorContextStore {
  private current: TutorPageContext | null = null
  private listeners = new Set<() => void>()

  get = (): TutorPageContext | null => this.current

  set(ctx: TutorPageContext | null) {
    this.current = ctx
    this.listeners.forEach((fn) => fn())
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const tutorContextStore = new TutorContextStore()

export function useTutorPageContext(): TutorPageContext | null {
  return useSyncExternalStore(
    tutorContextStore.subscribe,
    tutorContextStore.get,
    tutorContextStore.get
  )
}

export function getTutorPageContext(): TutorPageContext | null {
  return tutorContextStore.get()
}

export function setTutorPageContext(ctx: TutorPageContext | null) {
  tutorContextStore.set(ctx)
}
