/**
 * TTS 朗读声音选择器。
 * 使用单一入口 + 说明面板，避免把陌生的发音人名称直接平铺在页面上。
 */
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Mic2 } from "lucide-react"

import { useVoiceOptions, useCurrentVoice, setCurrentVoice } from "@/store/voice"

interface Props {
  compact?: boolean
  className?: string
}

export function VoiceSelector({ compact = false, className = "" }: Props) {
  const current = useCurrentVoice()
  const options = useVoiceOptions()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.id === current) || options[0]

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] text-[11px] font-semibold text-[#59636B] transition-colors hover:border-[#AFA796] hover:bg-[#F8F6F0] hover:text-[#244C66] ${compact ? "px-2 sm:px-3" : "gap-2 px-3"}`}
        title={selected ? `${selected.label}：${selected.tone}` : "选择朗读声音"}
      >
        <Mic2 className="size-3.5 text-[#315E83]" />
        <span className={compact ? "hidden xl:inline" : ""}>朗读声音</span>
        {selected && <strong className="font-bold text-[#244C66]">{compact ? selected.label : `· ${selected.label}`}</strong>}
        <ChevronDown className={`size-3.5 text-[#8A8172] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-72 rounded-2xl border border-[#CFC8B9] bg-[#FFFEFA] p-2.5 shadow-[0_18px_44px_rgba(24,35,45,.16)] sm:left-auto sm:right-0">
          <div className="px-2 pb-2 pt-1">
            <div className="text-xs font-bold text-[#18232D]">选择朗读声音</div>
            <p className="mt-1 text-[10px] leading-4 text-[#7A817F]">用于朗读 AI 助教和画像对话中的回复内容。</p>
          </div>
          <div className="space-y-1" role="listbox" aria-label="朗读声音">
            {options.map((option) => {
              const active = option.id === current
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setCurrentVoice(option.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-[#E7EDF3]" : "hover:bg-[#F8F6F0]"}`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${active ? "bg-[#244C66] text-[#FFFEFA]" : "bg-[#ECE8DE] text-[#7A817F]"}`}><Mic2 className="size-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-xs text-[#18232D]">{option.label}</strong>
                    <span className="mt-0.5 block text-[10px] text-[#7A817F]">{option.tone}</span>
                  </span>
                  {active && <Check className="size-4 shrink-0 text-[#315E83]" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
