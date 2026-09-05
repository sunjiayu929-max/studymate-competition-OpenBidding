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
import { prepareSpeechText } from "@/lib/speechText"
import { StreamingTtsPipeline } from "@/lib/ttsPipeline"

export type SpeakerStatus = "idle" | "loading" | "playing"

const globalState: { stopCurrent: (() => void) | null } = { stopCurrent: null }

interface Props {
  text: string
  size?: "sm" | "md"
  className?: string
  onError?: (err: Error) => void
  onStatusChange?: (status: SpeakerStatus) => void
}

export function SpeakerButton({ text, size = "sm", onError, onStatusChange, className = "" }: Props) {
  const [status, setStatus] = useState<SpeakerStatus>("idle")
  const pipelineRef = useRef<StreamingTtsPipeline | null>(null)
  const unmountedRef = useRef(false)
  // 稳定的 stop 引用（每次 render 仅更新内部实现，外部 .current 不变）
  const stopRef = useRef<() => void>(() => {})

  stopRef.current = () => {
    pipelineRef.current?.cancel()
    pipelineRef.current = null
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

  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  const handleClick = () => {
    // 已经在播 / 在合成 → 自己停掉
    if (status !== "idle") {
      stopRef.current()
      if (globalState.stopCurrent === stopRef.current) {
        globalState.stopCurrent = null
      }
      return
    }

    const cleaned = prepareSpeechText(text || "")
    if (!cleaned) return

    // 打断别处的播放
    if (globalState.stopCurrent && globalState.stopCurrent !== stopRef.current) {
      globalState.stopCurrent()
    }
    globalState.stopCurrent = stopRef.current

    setStatus("loading")
    const pipeline = new StreamingTtsPipeline({
      prefetch: 1,
      onPlaybackStart: () => {
        if (!unmountedRef.current) setStatus("playing")
      },
      onDrain: () => {
        if (pipelineRef.current === pipeline) pipelineRef.current = null
        if (globalState.stopCurrent === stopRef.current) globalState.stopCurrent = null
        if (!unmountedRef.current) setStatus("idle")
      },
      onError: (err) => {
        console.error("[SpeakerButton] TTS 失败：", err)
        onError?.(err)
      },
    })
    pipelineRef.current = pipeline
    pipeline.append(cleaned)
    pipeline.finish()
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
