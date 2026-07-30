/**
 * Voice tutor lecturer surface backed by one continuous muted video.
 *
 * `talking` is intentionally separate from the voice state: the UI may stay in
 * thinking / "preparing speech" while TTS is being synthesized, and only marks
 * the lecturer as speaking once audio playback really begins.
 */
import { AnimatePresence, motion } from "framer-motion"

import { DigitalHumanVideo } from "@/components/DigitalHumanVideo"
import type { VoiceOrbState } from "@/components/VoiceOrb"

const STATE_LABEL: Record<VoiceOrbState, string> = {
  idle: "准备就绪",
  listening: "聆听中…说话即可",
  thinking: "助教思考中…",
  speaking: "助教回答中（说话可打断）",
  paused: "已暂停",
}

interface Props {
  voiceState: VoiceOrbState
  /** Only true while TTS audio is actually playing. */
  talking?: boolean
  preparingSpeech?: boolean
  className?: string
  mediaClassName?: string
  showLabel?: boolean
  active?: boolean
}

export function LecturerAvatar({
  voiceState,
  talking = false,
  preparingSpeech = false,
  className = "",
  mediaClassName = "",
  showLabel = true,
  active = true,
}: Props) {
  const visualState: VoiceOrbState = voiceState === "speaking" && !talking ? "thinking" : voiceState
  const label = preparingSpeech || (voiceState === "speaking" && !talking)
    ? "准备朗读…"
    : STATE_LABEL[visualState]

  return (
    <div className={`relative flex flex-col items-center gap-3 ${className}`}>
      <DigitalHumanVideo
        state={visualState}
        priority
        stageBlend
        active={active}
        showFallbackStatus
        className={`aspect-video w-full ${mediaClassName}`}
      />
      {showLabel && (
        <AnimatePresence mode="wait">
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
            className="text-sm font-medium text-[var(--muted-foreground)]"
          >
            {label}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
