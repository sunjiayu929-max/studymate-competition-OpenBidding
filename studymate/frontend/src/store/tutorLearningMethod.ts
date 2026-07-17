import { useSyncExternalStore } from "react"

export type TutorLearningMethod = "feynman" | "socratic"

const PREFIX = "sm:tutor-learning-method"
export const DEFAULT_TUTOR_LEARNING_METHOD: TutorLearningMethod = "socratic"

export function learningMethodLabel(method: TutorLearningMethod): string {
  return method === "feynman" ? "费曼学习法" : "苏格拉底式学习法"
}

function storageKey(userId: number, courseId: number | null): string {
  return `${PREFIX}:u${userId}:c${courseId ?? 0}`
}

function normalize(value: unknown): TutorLearningMethod {
  return value === "feynman" || value === "socratic"
    ? value
    : DEFAULT_TUTOR_LEARNING_METHOD
}

class TutorLearningMethodStore {
  private cache = new Map<string, TutorLearningMethod>()
  private listeners = new Set<() => void>()

  get(userId: number, courseId: number | null): TutorLearningMethod {
    const key = storageKey(userId, courseId)
    const cached = this.cache.get(key)
    if (cached) return cached
    let value = DEFAULT_TUTOR_LEARNING_METHOD
    try {
      if (typeof window !== "undefined") value = normalize(window.localStorage.getItem(key))
    } catch {
      // 无痕模式或存储受限时继续使用稳定默认值。
    }
    this.cache.set(key, value)
    return value
  }

  set(userId: number, courseId: number | null, method: TutorLearningMethod) {
    const key = storageKey(userId, courseId)
    const next = normalize(method)
    if (this.get(userId, courseId) === next) return
    this.cache.set(key, next)
    try {
      window.localStorage.setItem(key, next)
    } catch {
      // 内存状态仍然生效。
    }
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const tutorLearningMethodStore = new TutorLearningMethodStore()

export function useTutorLearningMethod(userId: number, courseId: number | null): TutorLearningMethod {
  return useSyncExternalStore(
    tutorLearningMethodStore.subscribe,
    () => tutorLearningMethodStore.get(userId, courseId),
    () => DEFAULT_TUTOR_LEARNING_METHOD,
  )
}

export function setTutorLearningMethod(
  userId: number,
  courseId: number | null,
  method: TutorLearningMethod,
) {
  tutorLearningMethodStore.set(userId, courseId, method)
}

export function getTutorLearningMethod(userId: number, courseId: number | null): TutorLearningMethod {
  return tutorLearningMethodStore.get(userId, courseId)
}
