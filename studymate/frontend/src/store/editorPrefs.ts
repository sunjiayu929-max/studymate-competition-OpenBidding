/**
 * 代码编辑器偏好：localStorage 单例 store（与 voice.ts 同款写法）。
 *
 * 两个全局偏好，所有代码题（QuizCard / QuizFocusModal）共享、切一次处处生效、刷新记得：
 * 1. autocomplete 代码补全：
 *    - 开（默认，与 LeetCode 一致）：输入即弹建议，Tab/Enter 接受。
 *    - 关（纯手敲）：不弹任何建议，Tab 只缩进 —— 把选择权交给用户。
 * 2. theme 编辑器配色：
 *    - light（默认，白色/浅色，与整体浅色界面一致）
 *    - dark（深色）
 */
import { useSyncExternalStore } from "react"

export type EditorTheme = "light" | "dark"

const KEY_AC = "sm:editor-autocomplete"
const KEY_THEME = "sm:editor-theme"

class EditorPrefsStore {
  private autocomplete: boolean
  private theme: EditorTheme
  private listeners = new Set<() => void>()

  constructor() {
    this.autocomplete = this.loadAc()
    this.theme = this.loadTheme()
  }

  private loadAc(): boolean {
    try {
      const v = localStorage.getItem(KEY_AC)
      if (v === "0") return false
      if (v === "1") return true
    } catch {
      /* ignore */
    }
    return true // 默认开
  }

  private loadTheme(): EditorTheme {
    try {
      const v = localStorage.getItem(KEY_THEME)
      if (v === "light" || v === "dark") return v
    } catch {
      /* ignore */
    }
    return "light" // 默认浅色
  }

  getAutocomplete = (): boolean => this.autocomplete
  getTheme = (): EditorTheme => this.theme

  setAutocomplete(on: boolean) {
    if (this.autocomplete === on) return
    this.autocomplete = on
    try {
      localStorage.setItem(KEY_AC, on ? "1" : "0")
    } catch {
      /* ignore */
    }
    this.emit()
  }

  setTheme(t: EditorTheme) {
    if (this.theme === t) return
    this.theme = t
    try {
      localStorage.setItem(KEY_THEME, t)
    } catch {
      /* ignore */
    }
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

export const editorPrefsStore = new EditorPrefsStore()

export function useAutocomplete(): boolean {
  return useSyncExternalStore(editorPrefsStore.subscribe, editorPrefsStore.getAutocomplete, editorPrefsStore.getAutocomplete)
}

export function setAutocomplete(on: boolean) {
  editorPrefsStore.setAutocomplete(on)
}

export function useEditorTheme(): EditorTheme {
  return useSyncExternalStore(editorPrefsStore.subscribe, editorPrefsStore.getTheme, editorPrefsStore.getTheme)
}

export function setEditorTheme(t: EditorTheme) {
  editorPrefsStore.setTheme(t)
}
