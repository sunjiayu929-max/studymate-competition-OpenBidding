import { useEffect, useState } from "react"
import { Bot, ChevronDown } from "lucide-react"

import { apiGet } from "@/lib/api"
import {
  setTutorModelProvider,
  tutorModelStore,
  useTutorModelProvider,
  type TutorModelProvider,
} from "@/store/tutorModel"

interface ModelInfo {
  id: TutorModelProvider
  label: string
  description: string
  configured: boolean
  recommended: boolean
}

interface ModelsResponse {
  default: TutorModelProvider
  items: ModelInfo[]
}

const FALLBACK: ModelInfo[] = [
  { id: "qwen", label: "Qwen", description: "课程问答与多模态", configured: false, recommended: true },
  { id: "deepseek", label: "DeepSeek", description: "推理与代码讲解", configured: false, recommended: false },
  { id: "spark", label: "讯飞星火 4.0 Ultra", description: "通用问答与学习辅导", configured: false, recommended: false },
  { id: "mimo", label: "MiMo", description: "自然对话与总结", configured: false, recommended: false },
]

export function ModelSelector({ compact = false }: { compact?: boolean }) {
  const value = useTutorModelProvider()
  const [items, setItems] = useState<ModelInfo[]>(FALLBACK)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let active = true
    apiGet<ModelsResponse>("/tutor/models")
      .then((response) => {
        if (!active) return
        setItems(response.items)
        setStatus("ready")
        if (!tutorModelStore.hasStored()) setTutorModelProvider(response.default)
      })
      .catch(() => {
        if (active) setStatus("error")
      })
    return () => {
      active = false
    }
  }, [])

  const current = items.find((item) => item.id === value) || items[0]

  return (
    <label
      className={`relative inline-flex items-center rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] text-[#244C66] transition-colors hover:bg-[#F7F2E7] ${compact ? "h-9 gap-1.5 px-2" : "h-10 gap-2 px-3"}`}
      title={status === "ready" ? `${current.label} · ${current.description}` : `${current.label} · 配置状态${status === "loading" ? "读取中" : "未知"}`}
    >
      <Bot className="size-3.5 shrink-0 text-[#B1842C]" />
      <span className="text-[10px] font-bold">{current.label}</span>
      {current.recommended && !compact && <span className="rounded-full bg-[#F4ECD8] px-1.5 py-0.5 text-[8px] font-bold text-[#8E6925]">推荐</span>}
      {status === "ready" && !current.configured && <span className="rounded-full bg-[#F4E8E2] px-1.5 py-0.5 text-[8px] font-bold text-[#9A4E35]">未配置</span>}
      {status !== "ready" && !compact && <span className="rounded-full bg-[#F1EDE4] px-1.5 py-0.5 text-[8px] font-bold text-[#7A817F]">{status === "loading" ? "读取中" : "状态未知"}</span>}
      <ChevronDown className="size-3 shrink-0 text-[#8A8172]" />
      <select
        value={value}
        onChange={(event) => setTutorModelProvider(event.target.value as TutorModelProvider)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="选择回答模型"
      >
        {items.map((item) => (
          <option key={item.id} value={item.id} disabled={status === "ready" && !item.configured}>
            {item.label}{item.recommended ? "（推荐）" : ""}{status === "ready" && !item.configured ? "（未配置）" : status !== "ready" ? "（状态未知）" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}
