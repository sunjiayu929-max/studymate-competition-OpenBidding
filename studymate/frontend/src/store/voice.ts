/**
 * TTS 发音人偏好：localStorage 单例 store。
 *
 * 发音人列表**从后端 /voice/voices 动态拉取** —— 后端按引擎返回对应发音人
 * （CosyVoice 龙小淳… / 讯飞超拟人 聆小璇… / 讯飞在线 晓燕…），默认值也由后端给。
 * 这样切 TTS 引擎后，界面显示的名字和可选项自动对上，无需改前端。
 * 拉取前先用 fallback 占位，拉取失败保留 fallback，保证选择器不空。
 */
import { useSyncExternalStore } from "react"
import { apiGet } from "@/lib/api"

export interface VoiceOption {
  id: string
  label: string
  tone: string
  gender: "female" | "male"
}

// 拉取前/失败时的占位（讯飞在线默认音）
const FALLBACK_OPTIONS: VoiceOption[] = [
  { id: "xiaoyan", label: "晓燕", tone: "亲和女声", gender: "female" },
  { id: "aisjiuxu", label: "九旭", tone: "沉稳男声", gender: "male" },
]
const FALLBACK_DEFAULT = "xiaoyan"

const STORAGE_KEY = "sm:tts-voice"

interface VoicesResp {
  voices: VoiceOption[]
  default: string
  mode?: string
}

class VoiceStore {
  private currentId: string
  private options: VoiceOption[] = FALLBACK_OPTIONS
  private defaultId = FALLBACK_DEFAULT
  private listeners = new Set<() => void>()

  constructor() {
    this.currentId = this.loadFromStorage()
    void this.loadVoices()
  }

  private loadFromStorage(): string {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v) return v
    } catch {
      /* ignore */
    }
    return this.defaultId
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, this.currentId)
    } catch {
      /* ignore */
    }
  }

  /** 从后端拉当前引擎的发音人清单 + 默认值 */
  private async loadVoices() {
    try {
      const r = await apiGet<VoicesResp>("/voice/voices")
      if (r?.voices?.length) {
        this.options = r.voices
        this.defaultId = r.default || r.voices[0].id
        // 持久化的选择不在新清单里（如换了引擎）→ 回落到后端默认
        if (!this.options.some((o) => o.id === this.currentId)) {
          this.currentId = this.defaultId
          this.persist()
        }
        this.emit()
      }
    } catch {
      /* 保留 fallback */
    }
  }

  getOptions = (): VoiceOption[] => this.options
  get = (): string => this.currentId

  set(id: string) {
    if (!this.options.some((o) => o.id === id)) return
    this.currentId = id
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

export const voiceStore = new VoiceStore()

export function useCurrentVoice(): string {
  return useSyncExternalStore(voiceStore.subscribe, voiceStore.get, voiceStore.get)
}

/** 当前引擎的发音人清单（响应式，后端拉到后自动更新） */
export function useVoiceOptions(): VoiceOption[] {
  return useSyncExternalStore(voiceStore.subscribe, voiceStore.getOptions, voiceStore.getOptions)
}

export function setCurrentVoice(id: string) {
  voiceStore.set(id)
}

export function getCurrentVoice(): string {
  return voiceStore.get()
}

export function getVoiceOption(id: string): VoiceOption | undefined {
  return voiceStore.getOptions().find((o) => o.id === id)
}
