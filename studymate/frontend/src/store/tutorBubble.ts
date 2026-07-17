/**
 * AI 助教浮动小精灵：抽屉开关 + 宽度持久化。
 *
 * 仿 store/voice.ts 的 useSyncExternalStore + persist 模式。
 * - 多视图共享：FAB / 抽屉 / 全屏页 / 语音页 都订阅 isOpen
 * - 宽度可持久化（用户拖拉调宽抽屉，下次进来记得）
 */
import { useSyncExternalStore } from "react"

interface BubbleState {
  isOpen: boolean
  width: number
}

const STORAGE_KEY = "sm:tutor-bubble"
const MIN_WIDTH = 320
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 420

class TutorBubbleStore {
  private state: BubbleState
  private listeners = new Set<() => void>()

  constructor() {
    this.state = this.loadFromStorage()
  }

  private loadFromStorage(): BubbleState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const width =
          typeof parsed?.width === "number"
            ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width))
            : DEFAULT_WIDTH
        // isOpen 不复用上次值：避免一进首页就弹抽屉
        return { isOpen: false, width }
      }
    } catch {
      /* ignore */
    }
    return { isOpen: false, width: DEFAULT_WIDTH }
  }

  private persist() {
    try {
      // 只持久化宽度，开关状态不存
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: this.state.width }))
    } catch {
      /* ignore */
    }
  }

  get = (): BubbleState => this.state

  open() {
    if (this.state.isOpen) return
    this.state = { ...this.state, isOpen: true }
    this.emit()
  }

  close() {
    if (!this.state.isOpen) return
    this.state = { ...this.state, isOpen: false }
    this.emit()
  }

  toggle() {
    this.state = { ...this.state, isOpen: !this.state.isOpen }
    this.emit()
  }

  setWidth(w: number) {
    const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w))
    if (this.state.width === next) return
    this.state = { ...this.state, width: next }
    this.persist()
    this.emit()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }
}

export const tutorBubbleStore = new TutorBubbleStore()

if (typeof window !== "undefined") {
  window.addEventListener("studymate:user-session-reset", () => tutorBubbleStore.close())
}

export function useTutorBubble(): BubbleState {
  return useSyncExternalStore(tutorBubbleStore.subscribe, tutorBubbleStore.get, tutorBubbleStore.get)
}

export const openTutorBubble = () => tutorBubbleStore.open()
export const closeTutorBubble = () => tutorBubbleStore.close()
export const toggleTutorBubble = () => tutorBubbleStore.toggle()
export const setTutorBubbleWidth = (w: number) => tutorBubbleStore.setWidth(w)
export const BUBBLE_MIN_WIDTH = MIN_WIDTH
export const BUBBLE_MAX_WIDTH = MAX_WIDTH
