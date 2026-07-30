/**
 * 真人数字讲师的独立会话记录。
 *
 * 与文字助教 tutorHistory 使用不同的 localStorage 命名空间，避免两个角色
 * 的消息和清空操作互相影响；课程 ID 仍保留给模型请求使用。
 */
import { useSyncExternalStore } from "react"

import type { TutorMsg } from "@/store/tutorHistory"

const KEY_PREFIX = "sm:voice-tutor-history"

function storageKey(uid: number, courseId: number | null) {
  return `${KEY_PREFIX}:u${uid}:c${courseId ?? 0}`
}

class VoiceTutorHistoryStore {
  private cache = new Map<string, TutorMsg[]>()
  private listeners = new Map<string, Set<() => void>>()

  private load(key: string): TutorMsg[] {
    if (this.cache.has(key)) return this.cache.get(key)!
    try {
      const raw = localStorage.getItem(key)
      const messages = raw ? JSON.parse(raw) as TutorMsg[] : []
      this.cache.set(key, messages)
      return messages
    } catch {
      this.cache.set(key, [])
      return []
    }
  }

  get(uid: number, courseId: number | null): TutorMsg[] {
    return this.load(storageKey(uid, courseId))
  }

  set(uid: number, courseId: number | null, messages: TutorMsg[]) {
    const key = storageKey(uid, courseId)
    this.cache.set(key, messages)
    try {
      localStorage.setItem(key, JSON.stringify(messages))
    } catch {
      // 浏览器空间不足时仍保留本次页面内的会话。
    }
    this.listeners.get(key)?.forEach((listener) => listener())
  }

  append(uid: number, courseId: number | null, message: TutorMsg) {
    this.set(uid, courseId, [...this.get(uid, courseId), message])
  }

  clear(uid: number, courseId: number | null) {
    this.set(uid, courseId, [])
  }

  subscribe(uid: number, courseId: number | null, listener: () => void): () => void {
    const key = storageKey(uid, courseId)
    if (!this.listeners.has(key)) this.listeners.set(key, new Set())
    this.listeners.get(key)!.add(listener)
    return () => this.listeners.get(key)?.delete(listener)
  }
}

export const voiceTutorHistory = new VoiceTutorHistoryStore()

export function useVoiceTutorHistory(uid: number, courseId: number | null): TutorMsg[] {
  return useSyncExternalStore(
    (listener) => voiceTutorHistory.subscribe(uid, courseId, listener),
    () => voiceTutorHistory.get(uid, courseId),
    () => voiceTutorHistory.get(uid, courseId),
  )
}
