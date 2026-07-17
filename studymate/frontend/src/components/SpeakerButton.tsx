/**
 * 朗读按钮：点击 → POST /api/voice/tts → 播放 mp3。
 *
 * 用 voice store 当前选中发音人。
 * 全局锁：同一时刻只能播一个（点新按钮自动停掉旧的）。
 * 状态：idle → loading → playing → idle。
 *
 * 用 stopRef.current 做"当前请求"身份，因为 React 每次 render 函数引用都变，
 * 不能用函数本身做身份比较（会出现 isMine 永远 false 卡死 loading 的 bug）。
 */
import { useEffect, useRef, useState } from "react"
import { Volume2, Loader2, Square } from "lucide-react"
import { motion } from "framer-motion"
import { getCurrentVoice } from "@/store/voice"
import { sseHeaders } from "@/lib/api"

type Status = "idle" | "loading" | "playing"

const globalState: { stopCurrent: (() => void) | null } = { stopCurrent: null }

interface Props {
  text: string
  size?: "sm" | "md"
  className?: string
  onError?: (err: Error) => void
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "（此处省略代码块）")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, "（数学公式）")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function SpeakerButton({ text, size = "sm", onError, className = "" }: Props) {
  const [status, setStatus] = useState<Status>("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)
  // 稳定的 stop 引用（每次 render 仅更新内部实现，外部 .current 不变）
  const stopRef = useRef<() => void>(() => {})

  stopRef.current = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (audioRef.current) {
      try { audioRef.current.pause() } catch { /* ignore */ }
      audioRef.current.src = ""
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    if (!unmountedRef.current) setStatus("idle")
  }

  useEffect(() => {
    // StrictMode 双跑 cleanup 会把 ref 置 true，remount 后 useRef 不会重置 → 必须在此显式归位
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      stopRef.current()
      if (globalState.stopCurrent === stopRef.current) {
        globalState.stopCurrent = null
      }
    }
  }, [])

  const handleClick = async () => {
    // 已经在播 / 在合成 → 自己停掉
    if (status !== "idle") {
      stopRef.current()
      if (globalState.stopCurrent === stopRef.current) {
        globalState.stopCurrent = null
      }
      return
    }

    const cleaned = stripMarkdown(text || "")
    if (!cleaned) return

    // 打断别处的播放
    if (globalState.stopCurrent && globalState.stopCurrent !== stopRef.current) {
      globalState.stopCurrent()
    }
    globalState.stopCurrent = stopRef.current

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus("loading")

    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: sseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: cleaned, voice: getCurrentVoice() }),
        signal: ctrl.signal,
      })
      if (!r.ok) {
        const detail = await r.text().catch(() => "")
        throw new Error(`TTS ${r.status}: ${detail.slice(0, 200)}`)
      }
      const blob = await r.blob()
      if (unmountedRef.current) return

      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => stopRef.current()
      audio.onerror = () => {
        console.error("[SpeakerButton] audio playback error")
        stopRef.current()
      }

      setStatus("playing")
      await audio.play()
    } catch (e) {
      const err = e as Error
      if (err.name === "AbortError") return
      console.error("[SpeakerButton] TTS 失败：", err)
      if (!unmountedRef.current) setStatus("idle")
      if (globalState.stopCurrent === stopRef.current) {
        globalState.stopCurrent = null
      }
      onError?.(err)
    } finally {
      abortRef.current = null
    }
  }

  const sz = size === "md" ? "w-8 h-8" : "w-7 h-7"
  const iconSz = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"
  const title =
    status === "playing" ? "停止朗读" : status === "loading" ? "合成中…（再点取消）" : "朗读"

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      title={title}
      whileTap={{ scale: 0.9 }}
      className={`${sz} inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors ${
        status !== "idle" ? "text-[var(--primary)] border-[var(--primary)]" : "text-[var(--muted-foreground)]"
      } ${className}`}
    >
      {status === "loading" ? (
        <Loader2 className={`${iconSz} animate-spin`} />
      ) : status === "playing" ? (
        <Square className={iconSz} fill="currentColor" />
      ) : (
        <Volume2 className={iconSz} />
      )}
    </motion.button>
  )
}
