import { useSyncExternalStore } from "react"

export type TutorModelProvider = "qwen" | "deepseek" | "mimo"

// v2 resets the former server-default DeepSeek value once, so the new Qwen
// default is visible immediately. Choices made after this migration persist.
const STORAGE_KEY = "sm:tutor-model-provider-v2"
const VALID = new Set<TutorModelProvider>(["qwen", "deepseek", "mimo"])

function readStored(): TutorModelProvider | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as TutorModelProvider | null
    return value && VALID.has(value) ? value : null
  } catch {
    return null
  }
}

class TutorModelStore {
  private value: TutorModelProvider = readStored() || "qwen"
  private listeners = new Set<() => void>()

  get = () => this.value
  hasStored = () => readStored() !== null

  set(value: TutorModelProvider) {
    if (!VALID.has(value) || value === this.value) return
    this.value = value
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* optional */
    }
    this.listeners.forEach((listener) => listener())
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const tutorModelStore = new TutorModelStore()

export function useTutorModelProvider() {
  return useSyncExternalStore(tutorModelStore.subscribe, tutorModelStore.get, tutorModelStore.get)
}

export function getTutorModelProvider() {
  return tutorModelStore.get()
}

export function setTutorModelProvider(provider: TutorModelProvider) {
  tutorModelStore.set(provider)
}
