/**
 * 语音助教页讲师形象：预渲染讲解视频。
 * - talking=true（TTS 真正在播）：静音循环视频
 * - talking=false：停在首帧
 * 注意：voiceState=speaking 可能早于 TTS 返回几秒，视频必须跟 talking，不能跟 speaking。
 */
import { useEffect, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import type { VoiceOrbState } from "@/components/VoiceOrb"

const VIDEO_SRC = "/avatars/lecturer_talk.mp4"
const POSTER_SRC = "/avatars/lecturer_talk_poster.jpg"

const STATE_LABEL: Record<VoiceOrbState, string> = {
  idle: "正在连接麦克风…",
  listening: "聆听中…说话即可",
  thinking: "助教思考中…",
  speaking: "助教回答中（说话可打断）",
  paused: "已暂停",
}

interface Props {
  voiceState: VoiceOrbState
  /** 仅当 TTS 音频已开始播放时为 true */
  talking?: boolean
  height?: number
  className?: string
}

export function LecturerAvatar({
  voiceState,
  talking = false,
  height = 280,
  className = "",
}: Props) {
  const reduceMotion = useReducedMotion()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const width = Math.round(height * (16 / 9))
  const shouldPlay = talking && !reduceMotion

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (shouldPlay) {
      if (v.ended || v.currentTime > 0.05) {
        // 每次新一轮说话从开头播，和 TTS 起势对齐
        try {
          v.currentTime = 0
        } catch {
          /* ignore */
        }
      }
      const p = v.play()
      if (p && typeof p.catch === "function") p.catch(() => {})
    } else {
      v.pause()
      try {
        v.currentTime = 0
      } catch {
        /* ignore seek before metadata */
      }
    }
  }, [shouldPlay])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.load()
  }, [])

  // 文案：合成中但还没出声时，显示「准备朗读」避免和视频/声音脱节
  const label =
    voiceState === "speaking" && !talking
      ? "正在生成语音…"
      : STATE_LABEL[voiceState]

  return (
    <div className={`relative flex flex-col items-center gap-4 ${className}`}>
      <div
        className="relative overflow-hidden rounded-[28px] border border-[#D7D1C4] bg-[#F4F1E8] shadow-[0_18px_48px_rgba(24,35,45,.14)] ring-1 ring-white/70"
        style={{ width, height }}
        aria-hidden
      >
        {!reduceMotion && voiceState === "listening" && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 rounded-[28px] ring-2 ring-[#4A8884]/35"
            animate={{ opacity: [0.25, 0.7, 0.25] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {!reduceMotion && (voiceState === "thinking" || (voiceState === "speaking" && !talking)) && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#C49A45]/15 to-transparent"
            animate={{ opacity: [0.35, 0.7, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-center"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          playsInline
          loop
          preload="auto"
          controls={false}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-[#18232D]/2 to-transparent" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="text-sm font-medium text-[var(--muted-foreground)]"
        >
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
