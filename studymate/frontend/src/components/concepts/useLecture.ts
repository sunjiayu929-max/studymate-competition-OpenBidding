/**
 * 讲课模式底座（高同步协议，支持「一句话对应多张图」）
 * ------------------------------------------------------------------
 * 开场一次性预合成全部语音 → 逐「拍」讲解。每一拍是「一句话 + 这句话期间动画要走过的画面」：
 *   - 静态拍：apply() 把动画设到某状态，念完这句进下一拍（如过拟合：一句话配一个 d）。
 *   - 动态拍：frames + seek，念这句话时动画连续走过这段帧（语音在说、画面在动），
 *     画面跟着语音走、念完即停在末帧 → 一句话覆盖很多张图，不再一帧一句的流水账。
 *
 * 音画同步策略：动态拍里按固定节拍步进帧；若语音先念完，剩余帧快速收尾(不拖堂)；
 * 若帧先走完，停在末帧等语音念完 → 两者大致同步。
 *
 * buildBeats 用 ref 捕获，闭包里能拿最新 state setter；effect 仅依赖 lecture/replayNonce。
 */
import { createContext, useContext, useEffect, useRef } from "react"
import { estimateNarrationMs, resolveLectureSeek } from "@/lib/lectureTimeline"

export interface LectureBeat {
  /** 这一拍朗读 + 显示的讲解文字。 */
  text: string
  /** 静态拍：把动画设到该状态（与 frames 二选一）。 */
  apply?: () => void
  /** 动态拍：念这句话期间依次走过的帧号。 */
  frames?: number[]
  /** 动态拍：把动画定位到第 i 帧。 */
  seek?: (i: number) => void
}

export interface NarrationOptions {
  startAtMs?: number
  onProgress?: (elapsedMs: number, durationMs: number) => void
  onDuration?: (durationMs: number) => void
}

export interface LectureTimelineController {
  seekRevision: number
  seekMs: number
  paused: boolean
  registerBeats: (beats: LectureBeat[]) => void
  durationFor: (index: number, text: string) => number
  reportBeat: (index: number, elapsedMs?: number, durationMs?: number) => void
  reportDone: () => void
  isPaused: () => boolean
  playbackRate: () => number
}

export const LectureTimelineContext = createContext<LectureTimelineController | null>(null)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 估算一句中文旁白的朗读时长（CosyVoice 实测约 175ms/字），用来把动态拍的帧均摊到整句上，
 * 让画面在念这句话的全程持续推进，而不是几帧飞快走完、剩下大半句对着定格画面干讲。
 */
export const estNarrationMs = estimateNarrationMs

async function timelineSleep(ms: number, timeline: LectureTimelineController | null) {
  let remaining = Math.max(0, ms)
  while (remaining > 0) {
    const slice = Math.min(remaining, 80)
    await sleep(slice)
    if (!timeline?.isPaused()) remaining -= slice
  }
}

/**
 * 把 0..total-1 帧均分成 sentences.length 段，每段一句讲解 → 「一句话对应很多张图」。
 * 帧式动画(排序/树/图)讲课首选：只需按进程顺序写几句话，动画自动分段连续播放。
 */
export function chunkedBeats(total: number, sentences: string[], seek: (i: number) => void): LectureBeat[] {
  const n = Math.max(1, sentences.length)
  return sentences.map((text, k) => {
    const a = Math.floor((k * total) / n)
    const b = Math.floor(((k + 1) * total) / n)
    const frames = Array.from({ length: Math.max(1, b - a) }, (_, i) => a + i)
    return { text, frames, seek }
  })
}

export function useLecture(opts: {
  lecture: boolean
  replayNonce?: number
  narrate?: (text: string, options?: NarrationOptions) => Promise<void>
  prepareNarration?: (texts: string[]) => Promise<void>
  onLectureEnd?: () => void
  buildBeats: () => LectureBeat[]
  /** 进入讲课时调用（停掉自动播放、复位等）。 */
  onEnter?: () => void
}) {
  const { lecture, replayNonce = 0 } = opts
  const timeline = useContext(LectureTimelineContext)
  const ref = useRef(opts)
  const timelineRef = useRef(timeline)
  ref.current = opts
  timelineRef.current = timeline
  const seekRevision = timeline?.seekRevision

  useEffect(() => {
    if (!lecture) {
      ref.current.onEnter?.() // 退出也停掉自动播放（onEnter 通常就是 setPlaying(false)）
      return
    }
    let cancelled = false
    const settle = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const setStart = (b: LectureBeat) => {
      if (b.frames?.length && b.seek) b.seek(b.frames[0])
      else b.apply?.()
    }

    const run = async () => {
      const activeTimeline = timelineRef.current
      ref.current.onEnter?.()
      const beats = ref.current.buildBeats()
      activeTimeline?.registerBeats(beats)
      if (beats.length === 0) {
        ref.current.onLectureEnd?.()
        return
      }
      let startIndex = 0
      let startOffsetMs = 0
      if (activeTimeline && activeTimeline.seekMs > 0) {
        const point = resolveLectureSeek(
          beats.map((beat, index) => activeTimeline.durationFor(index, beat.text)),
          activeTimeline.seekMs,
        )
        startIndex = point.beatIndex
        startOffsetMs = point.offsetMs
      }
      const firstBeat = beats[startIndex]
      if (firstBeat.frames?.length && firstBeat.seek && startOffsetMs > 0) {
        const duration = activeTimeline?.durationFor(startIndex, firstBeat.text) || estNarrationMs(firstBeat.text)
        const frameIndex = Math.min(
          firstBeat.frames.length - 1,
          Math.floor((startOffsetMs / Math.max(1, duration)) * firstBeat.frames.length),
        )
        firstBeat.seek(firstBeat.frames[frameIndex])
      } else {
        setStart(firstBeat)
      }
      await settle()
      if (cancelled) return
      await (ref.current.prepareNarration?.(beats.map((b) => b.text)) ?? Promise.resolve())
      if (cancelled) return

      for (let beatIndex = startIndex; beatIndex < beats.length; beatIndex++) {
        const b = beats[beatIndex]
        if (cancelled) return
        const offsetMs = beatIndex === startIndex ? startOffsetMs : 0
        if (offsetMs <= 0) setStart(b)
        await settle()
        if (cancelled) return
        activeTimeline?.reportBeat(beatIndex, offsetMs)
        const narration = ref.current.narrate?.(b.text, {
          startAtMs: offsetMs,
          onProgress: (elapsedMs, durationMs) => activeTimeline?.reportBeat(beatIndex, elapsedMs, durationMs),
          onDuration: (durationMs) => activeTimeline?.reportBeat(beatIndex, offsetMs, durationMs),
        }) ?? Promise.resolve()

        // 动态拍：念这句话时连续走过这段帧。节奏自适应——把帧均摊到整句旁白时长上，
        // 画面在念这句话全程持续推进（不再是几帧飞快走完、剩下大半句对着定格画面干讲）。
        if (b.frames && b.frames.length > 1 && b.seek) {
          let voiceDone = false
          narration.then(() => (voiceDone = true), () => (voiceDone = true))
          const duration = activeTimeline?.durationFor(beatIndex, b.text) || estNarrationMs(b.text)
          const startFrameIndex = offsetMs > 0
            ? Math.min(b.frames.length - 1, Math.floor((offsetMs / Math.max(1, duration)) * b.frames.length))
            : 0
          const gaps = Math.max(1, b.frames.length - 1 - startFrameIndex)
          // 每帧停留 = 整句估算时长 / 帧数；上下限防止稠密动画爬太慢、稀疏拍单帧停太久
          const remainingMs = Math.max(300, duration - offsetMs)
          const perFrame = Math.min(3200, Math.max(120, Math.round(remainingMs / gaps)))
          for (let k = startFrameIndex + 1; k < b.frames.length; k++) {
            if (cancelled) return
            await timelineSleep(perFrame / (activeTimeline?.playbackRate() || 1), activeTimeline)
            if (cancelled) return
            b.seek(b.frames[k])
            await settle()
            if (voiceDone) {
              // 语音先念完、帧还没走完 → 快速收尾，别拖在语音后面
              for (let j = k + 1; j < b.frames.length; j++) {
                if (cancelled) return
                b.seek(b.frames[j])
                await timelineSleep(120 / (activeTimeline?.playbackRate() || 1), activeTimeline)
              }
              break
            }
          }
        }
        await narration // 帧先走完则停在末帧等语音念完
      }
      if (!cancelled) {
        activeTimeline?.reportDone()
        ref.current.onLectureEnd?.()
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [lecture, replayNonce, seekRevision])
}
