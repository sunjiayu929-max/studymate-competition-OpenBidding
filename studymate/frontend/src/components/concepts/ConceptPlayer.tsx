/**
 * 概念动画播放器外壳（统一美化 + 讲课模式）
 * ------------------------------------------------------------------
 * 给任意动画组件套一个精致外框：渐变标题栏 + 课程徽章 + 概念名 +（可选）
 * AI 开场白 + 朗读按钮 +「🎓 讲课模式」开关。
 *
 * 讲课模式：通过 cloneElement 给子动画注入 { lecture, onCaption }。子动画在 lecture
 * 时放慢自动步进、自动播放，并把每步字幕通过 onCaption 回传，外壳用 speak() 朗读 ——
 * 「语音老师对着图画逐步讲题」。子动画若没实现这两个 prop，开关只是不起作用（不报错）。
 */
import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react"
import { Film, GraduationCap, Maximize2, X, RotateCcw, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { motion } from "framer-motion"
import { SpeakerButton } from "@/components/SpeakerButton"
import { PanZoom } from "@/components/concepts/PanZoom"
import {
  getBlobDuration,
  pauseSpeak,
  playBlob,
  resumeSpeak,
  setSpeakPlaybackRate,
  setSpeakVolume,
  speak,
  synthesize,
  type SpeakHandle,
} from "@/lib/speak"
import type { ConceptAnimProps } from "@/components/concepts/registry"
import {
  estNarrationMs,
  LectureTimelineContext,
  type LectureBeat,
  type NarrationOptions,
} from "@/components/concepts/useLecture"

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function ConceptPlayer({
  title,
  course,
  badgeClass,
  intro,
  lectureReady = false,
  disablePanZoom = false,
  children,
}: {
  title: string
  course: string
  badgeClass: string
  /** AI 开场白；传了就显示讲解条 + 朗读按钮 */
  intro?: string
  /** 子动画是否支持讲课模式；为 false 则不显示开关（避免死按钮） */
  lectureReady?: boolean
  /** 动画自带「真·视口」缩放（draw() 内置）时设 true，避免外层 CSS PanZoom 双重缩放 */
  disablePanZoom?: boolean
  children: ReactNode
}) {
  const [lecture, setLecture] = useState(false)
  const [theater, setTheater] = useState(false)
  const [subtitle, setSubtitle] = useState("")
  const [preparing, setPreparing] = useState(false)
  const [lectureDone, setLectureDone] = useState(false)
  const [replayNonce, setReplayNonce] = useState(0)
  const [paused, setPaused] = useState(false)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1)
  const [timelineBeats, setTimelineBeats] = useState<Array<{ text: string; durationMs: number }>>([])
  const [activeBeat, setActiveBeat] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null)
  const [seekRevision, setSeekRevision] = useState(0)
  const lectureRef = useRef(false)
  const pausedRef = useRef(false)
  const playbackRateRef = useRef(1)
  const seekMsRef = useRef(0)
  const beatDurationsRef = useRef<Map<string, number>>(new Map())
  const timelineBeatsRef = useRef<Array<{ text: string; durationMs: number }>>([])
  const handleRef = useRef<SpeakHandle | null>(null)
  const lastTextRef = useRef("")
  const clipsRef = useRef<Map<string, Blob>>(new Map())
  const pendingClipsRef = useRef<Map<string, Promise<Blob | undefined>>>(new Map())
  const rootRef = useRef<HTMLDivElement>(null)

  const updateBeatDuration = useCallback((text: string, durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    beatDurationsRef.current.set(text, durationMs)
    setTimelineBeats((current) => {
      const next = current.map((beat) => beat.text === text ? { ...beat, durationMs } : beat)
      timelineBeatsRef.current = next
      return next
    })
  }, [])

  const prefetchClip = useCallback((text: string) => {
    const cached = clipsRef.current.get(text)
    if (cached) return Promise.resolve(cached)
    const existing = pendingClipsRef.current.get(text)
    if (existing) return existing
    const request = synthesize(text)
      .then((blob) => {
        clipsRef.current.set(text, blob)
        return blob
      })
      .catch(() => undefined)
      .finally(() => pendingClipsRef.current.delete(text))
    pendingClipsRef.current.set(text, request)
    return request
  }, [])

  // 只等待首句即可开播；播放首句期间按顺序预取后续两句。
  const prepareNarration = useCallback(async (texts: string[]) => {
    const uniq = [...new Set(texts.map((t) => (t || "").trim()).filter(Boolean))]
    if (uniq.length === 0) return
    const prepareOne = async (text: string) => {
      const blob = await prefetchClip(text)
      if (blob) {
        const duration = await getBlobDuration(blob)
        if (duration > 0) updateBeatDuration(text, Math.round(duration * 1000))
      }
      return blob
    }
    setPreparing(true)
    try {
      await prepareOne(uniq[0])
    } finally {
      setPreparing(false)
    }
    // 不阻塞开播：保持两条前瞻，避免把全部旁白合成完才开始。
    void (async () => {
      for (let index = 1; index < uniq.length; index += 2) {
        await Promise.all(uniq.slice(index, index + 2).map(prepareOne))
      }
    })()
  }, [prefetchClip, updateBeatDuration])

  // 旧协议：动画连续自播，回传字幕 → 仅朗读（不显示大字幕，避免与动画自带字幕条重复）。
  const speakCaption = useCallback((text: string) => {
    if (!lectureRef.current) return
    const t = (text || "").trim()
    if (!t || t === lastTextRef.current) return
    lastTextRef.current = t
    handleRef.current = speak(t)
  }, [])

  // 新协议：分步讲课。显示大字幕 + 放预合成好的语音，**放完(+250ms 换气)立刻推进**（不干等长计时器）。
  const narrate = useCallback(async (text: string, options: NarrationOptions = {}) => {
    const t = (text || "").trim()
    setSubtitle(t)
    if (!t || !lectureRef.current) return
    let blob = clipsRef.current.get(t)
    // 若预取尚未完成，复用同一个 Promise，避免重复请求。
    if (!blob) {
      blob = await prefetchClip(t)
      if (!lectureRef.current) return
    }
    if (blob) {
      const h = playBlob(blob, {
        playbackRate: playbackRateRef.current,
        startAtSeconds: (options.startAtMs || 0) / 1000,
        startPaused: pausedRef.current,
        onProgress: (elapsed, duration) => options.onProgress?.(elapsed * 1000, duration * 1000),
        onDuration: (duration) => {
          updateBeatDuration(t, Math.round(duration * 1000))
          options.onDuration?.(duration * 1000)
        },
      })
      handleRef.current = h
      await h.done.catch(() => {})
      if (!lectureRef.current) return
      await new Promise<void>((r) => setTimeout(r, 250)) // 一口换气
      return
    }
    // 连当场合成都失败：字幕停留可读时长（短，避免长时间静默）
    let elapsed = options.startAtMs || 0
    while (elapsed < estNarrationMs(t) && lectureRef.current) {
      await new Promise<void>((resolve) => setTimeout(resolve, 80))
      if (!pausedRef.current) {
        elapsed += 80 * playbackRateRef.current
        options.onProgress?.(elapsed, estNarrationMs(t))
      }
    }
  }, [prefetchClip, updateBeatDuration])

  // 全屏模式：进入时请求浏览器真·全屏（隐藏地址栏/标签栏，沉浸）；不支持/被拒则退回铺满视口的覆盖层
  const enterTheater = useCallback(() => {
    setTheater(true)
    const el = rootRef.current
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => { /* 退回覆盖层 */ })
  }, [])
  const exitTheater = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setTheater(false)
  }, [])
  // 用户按 Esc / 系统退出全屏 → 同步关掉全屏模式
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setTheater(false)
    }
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])
  // 全屏模式：锁定页面滚动 + Esc 退出（覆盖层兜底；真全屏下 Esc 由浏览器处理、经 fullscreenchange 同步）
  useEffect(() => {
    if (!theater) return
    const root = document.documentElement
    const prevRootOverflow = root.style.overflow
    const prevBodyOverflow = document.body.style.overflow
    const prevRootOverscroll = root.style.overscrollBehavior
    root.style.overflow = "hidden"
    root.style.overscrollBehavior = "none"
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitTheater()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      root.style.overflow = prevRootOverflow
      root.style.overscrollBehavior = prevRootOverscroll
      document.body.style.overflow = prevBodyOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [theater, exitTheater])

  const toggleLecture = useCallback(() => {
    setLectureDone(false)
    setPaused(false)
    pausedRef.current = false
    seekMsRef.current = 0
    setCurrentMs(0)
    setActiveBeat(0)
    setLecture((on) => {
      const next = !on
      lectureRef.current = next
      if (!next) {
        handleRef.current?.stop()
        lastTextRef.current = ""
        setSubtitle("")
      }
      return next
    })
  }, [])

  // 「再讲一遍」：从头重讲（语音已缓存 → 秒开，不再合成）
  const replayLecture = useCallback(() => {
    handleRef.current?.stop()
    setLectureDone(false)
    setPaused(false)
    pausedRef.current = false
    seekMsRef.current = 0
    setCurrentMs(0)
    setActiveBeat(0)
    setReplayNonce((n) => n + 1)
  }, [])

  // 暂停 / 继续讲课（暂停当前朗读 → narrate 的 await 挂起到继续）
  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      pausedRef.current = next
      if (next) pauseSpeak()
      else resumeSpeak()
      return next
    })
  }, [])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    setSpeakVolume(v)
  }, [])

  const changePlaybackRate = useCallback((rate: (typeof PLAYBACK_RATES)[number]) => {
    playbackRateRef.current = rate
    setPlaybackRate(rate)
    setSpeakPlaybackRate(rate)
  }, [])

  const timelineTotalMs = useMemo(
    () => timelineBeats.reduce((total, beat) => total + beat.durationMs, 0),
    [timelineBeats],
  )

  const beatStartMs = useCallback((index: number) => (
    timelineBeats.slice(0, index).reduce((total, beat) => total + beat.durationMs, 0)
  ), [timelineBeats])

  const commitSeek = useCallback((nextMs: number) => {
    if (!timelineTotalMs) return
    const bounded = Math.max(0, Math.min(nextMs, Math.max(0, timelineTotalMs - 1)))
    handleRef.current?.stop()
    seekMsRef.current = bounded
    setCurrentMs(bounded)
    setSeekPreviewMs(null)
    setLectureDone(false)
    let cursor = 0
    const index = timelineBeats.findIndex((beat) => {
      cursor += beat.durationMs
      return bounded < cursor
    })
    setActiveBeat(index >= 0 ? index : Math.max(0, timelineBeats.length - 1))
    setSeekRevision((revision) => revision + 1)
  }, [timelineBeats, timelineTotalMs])

  const timelineController = useMemo(() => ({
    seekRevision,
    seekMs: seekMsRef.current,
    paused,
    registerBeats: (beats: LectureBeat[]) => {
      setTimelineBeats((current) => {
        const next = beats.map((beat) => ({
          text: beat.text,
          durationMs: beatDurationsRef.current.get(beat.text) || estNarrationMs(beat.text),
        }))
        timelineBeatsRef.current = next
        if (
          current.length === next.length
          && current.every((beat, index) => beat.text === next[index].text && beat.durationMs === next[index].durationMs)
        ) return current
        return next
      })
    },
    durationFor: (_index: number, text: string) => beatDurationsRef.current.get(text) || estNarrationMs(text),
    reportBeat: (index: number, elapsedMs = 0, durationMs?: number) => {
      const beats = timelineBeatsRef.current
      const text = beats[index]?.text
      if (text && durationMs) updateBeatDuration(text, durationMs)
      const base = beats.slice(0, index).reduce((total, beat) => total + beat.durationMs, 0)
      setActiveBeat(index)
      setCurrentMs(Math.min(base + elapsedMs, base + (durationMs || beats[index]?.durationMs || 0)))
    },
    reportDone: () => setCurrentMs(timelineBeatsRef.current.reduce((total, beat) => total + beat.durationMs, 0)),
    isPaused: () => pausedRef.current,
    playbackRate: () => playbackRateRef.current,
  }), [paused, seekRevision, updateBeatDuration])

  useEffect(() => {
    return () => {
      handleRef.current?.stop()
    }
  }, [])

  // 给子动画注入讲课 props（子动画自行决定是否使用）
  // These callbacks only run from child interactions/effects; cloneElement does not invoke them during render.
  const injected = Children.map(children, (child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<ConceptAnimProps>, {
          lecture,
          onCaption: speakCaption,
          narrate,
          prepareNarration,
          replayNonce,
          onLectureEnd: () => setLectureDone(true),
        })
      : child
  )
  const interactive = Children.map(children, (child) =>
    isValidElement(child)
      ? cloneElement(child as ReactElement<ConceptAnimProps>, {
          lecture: false,
          onCaption: undefined,
          narrate: undefined,
          prepareNarration: undefined,
          replayNonce: 0,
          onLectureEnd: undefined,
        })
      : child
  )

  return (
    <div className={theater ? "" : "space-y-5"}>
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={
        theater
          ? "fixed inset-0 z-[100] flex h-dvh min-h-0 w-screen max-w-none flex-col overflow-hidden bg-[#101820]"
          : "rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-sm"
      }
    >
      {/* 标题栏 */}
      <div
        className={
          theater
            ? "flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#16212A] px-4 py-3"
            : "flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-b border-[var(--border)]"
        }
      >
        <Film className="size-4 text-amber-500 shrink-0" />
        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>{course}</span>
        <h3 className={`font-semibold truncate flex-1 min-w-0 ${theater ? "text-white" : "text-[var(--foreground)]"}`}>{title}</h3>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {lectureReady && (
            <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${theater ? "border-white/15 bg-white/5 text-white/70" : "border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"}`}>
              <GraduationCap className="size-3.5" />AI 视频讲解
            </span>
          )}
          {/* 影院模式开关 */}
          {theater ? (
            <button
              type="button"
              onClick={exitTheater}
              title="退出全屏 (Esc)"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-semibold text-white/80 transition-colors hover:border-white/50 hover:text-white"
            >
              <X className="size-3.5" /> 退出全屏
            </button>
          ) : (
            <button
              type="button"
              onClick={enterTheater}
              title="全屏模式（沉浸放大）"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:border-[#C49A45] hover:bg-[#F7F2E7] hover:text-[#7E5E22]"
            >
              <Maximize2 className="size-3.5" /> 全屏
            </button>
          )}
        </div>
      </div>

      {/* AI 开场白（影院模式下隐藏，保持沉浸） */}
      {intro && !theater && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50/40 dark:bg-amber-950/10 border-b border-[var(--border)]">
          <p className="text-sm text-[var(--foreground)] leading-relaxed flex-1">{intro}</p>
          <SpeakerButton text={intro} />
        </div>
      )}

      {/* 动画本体（{injected} 始终在同一层级，仅外层 className 随 theater 变 → 不重挂载、状态保留） */}
      <div className={theater ? "relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:overflow-hidden" : `relative ${lectureReady ? "concept-player-inline overflow-hidden bg-[#101820] p-3" : "p-3"}`}>
        <div
          className={
            theater
              ? "concept-theater flex min-h-full w-full min-w-0 flex-none flex-col bg-[#101820] sm:min-h-0 sm:flex-1"
              : lectureReady ? "concept-player-canvas mx-auto w-full" : ""
          }
        >
          <LectureTimelineContext.Provider value={timelineController}>
            {disablePanZoom ? injected : <PanZoom className={theater ? "min-h-full flex-none sm:min-h-0 sm:flex-1" : ""}>{injected}</PanZoom>}
          </LectureTimelineContext.Provider>

          {lectureReady && !lecture && !theater && (
            <button
              type="button"
              onClick={toggleLecture}
              className="absolute inset-0 z-20 grid place-items-center bg-[#101820]/58 text-white backdrop-blur-[1px] transition-colors hover:bg-[#101820]/48"
              aria-label={`播放《${title}》AI 视频讲解`}
            >
              <span className="flex flex-col items-center">
                <motion.span
                  whileHover={{ scale: 1.07 }}
                  className="grid size-20 place-items-center rounded-full border border-white/45 bg-white text-[#18232D] shadow-[0_18px_50px_rgba(0,0,0,.35)]"
                >
                  <Play className="ml-1 size-7 fill-current" />
                </motion.span>
                <span className="mt-4 text-sm font-bold tracking-wide">播放 AI 视频讲解</span>
                <span className="mt-1 text-[10px] text-white/68">旁白、字幕与动画同步播放</span>
              </span>
            </button>
          )}

          {/* 影院讲课：字幕条 + 控制条，与画面同一张卡片、无缝衔接（不再是浮空拼块） */}
          {theater && lecture && (
            <>
              <div className="max-h-36 min-h-[4.75rem] overflow-y-auto bg-[#16181d] px-6 py-3 text-center text-white">
                {preparing ? (
                  <span className="inline-flex items-center gap-2 text-base text-white/70">
                    <GraduationCap className="size-4" /> 讲课模式深度思考中
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                      <span className="size-1.5 rounded-full bg-current animate-bounce" />
                    </span>
                  </span>
                ) : timelineBeats.length ? (
                  <div className="mx-auto max-w-4xl space-y-1.5" aria-label="逐句讲解字幕">
                    {timelineBeats.map((beat, index) => (
                      <button
                        key={`${beat.text}-${index}`}
                        type="button"
                        onClick={() => commitSeek(beatStartMs(index))}
                        className={`block w-full rounded-lg px-3 py-1 text-sm leading-6 transition-colors ${index === activeBeat ? "bg-white/12 font-semibold text-white" : "text-white/45 hover:bg-white/5 hover:text-white/75"}`}
                        aria-current={index === activeBeat ? "true" : undefined}
                      >
                        {beat.text}
                      </button>
                    ))}
                  </div>
                ) : subtitle}
              </div>
              <div className="flex items-center gap-3 px-5 py-3 bg-[#0a0b0e] border-t border-white/5 text-white">
                <button
                  type="button"
                  onClick={togglePause}
                  title={paused ? "继续" : "暂停"}
                  className="inline-flex size-10 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
                >
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={replayLecture}
                  title="重新播放"
                  className="inline-flex size-10 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
                >
                  <RotateCcw className="size-4" />
                </button>
                <div className="min-w-28 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, timelineTotalMs)}
                    step={100}
                    value={Math.min(seekPreviewMs ?? currentMs, Math.max(1, timelineTotalMs))}
                    onChange={(event) => setSeekPreviewMs(Number(event.target.value))}
                    onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
                    onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
                    onBlur={(event) => seekPreviewMs !== null && commitSeek(Number(event.currentTarget.value))}
                    className="block w-full accent-amber-500"
                    aria-label="讲解时间轴"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-white/55">
                    <span>{formatTime(seekPreviewMs ?? currentMs)}</span>
                    <span>{formatTime(timelineTotalMs)}</span>
                  </div>
                </div>
                <select
                  value={playbackRate}
                  onChange={(event) => changePlaybackRate(Number(event.target.value) as (typeof PLAYBACK_RATES)[number])}
                  className="h-9 rounded-lg border border-white/15 bg-white/10 px-2 text-xs font-semibold text-white"
                  aria-label="讲解播放速度"
                >
                  {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate} className="text-black">{rate}×</option>)}
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => changeVolume(volume > 0 ? 0 : 1)} title={volume > 0 ? "静音" : "取消静音"} aria-label={volume > 0 ? "静音" : "取消静音"} className="inline-flex size-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                    {volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    className="w-28 accent-amber-500"
                    title="音量"
                    aria-label="讲解音量"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* 非影院讲课：行内字幕 + 再讲一遍 */}
        {!theater && lecture && (
          <>
            {preparing && (
              <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm bg-[var(--muted)] text-[var(--muted-foreground)]">
                <GraduationCap className="size-4" /> 讲课模式深度思考中
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 rounded-full bg-current animate-bounce" />
                </span>
              </div>
            )}
            {(subtitle || timelineBeats.length > 0) && !preparing && (
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--foreground)] p-2 text-center text-sm leading-relaxed text-[var(--background)]" aria-label="逐句讲解字幕">
                {timelineBeats.length ? timelineBeats.map((beat, index) => (
                  <button
                    key={`${beat.text}-${index}`}
                    type="button"
                    onClick={() => commitSeek(beatStartMs(index))}
                    className={`block w-full rounded-md px-3 py-1.5 transition-colors ${index === activeBeat ? "bg-white/15 font-semibold opacity-100" : "opacity-45 hover:bg-white/10 hover:opacity-80"}`}
                    aria-current={index === activeBeat ? "true" : undefined}
                  >
                    {beat.text}
                  </button>
                )) : subtitle}
              </div>
            )}
            {/* 行内控制条：播放中可暂停/继续，讲完出再讲一遍，右侧音量（与影院模式一致） */}
            {!preparing && (
              <div className="mt-3 flex items-center gap-2.5">
                {!lectureDone && (
                  <>
                    <button
                      type="button"
                      onClick={togglePause}
                      title={paused ? "继续" : "暂停"}
                      className="inline-flex size-10 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
                    >
                      {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={replayLecture}
                      title="重新播放"
                      className="inline-flex size-10 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  </>
                )}
                {lectureDone && (
                  <button
                    type="button"
                    onClick={replayLecture}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#B1842C] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#936B20]"
                  >
                    <RotateCcw className="size-4" /> 再讲一遍
                  </button>
                )}
                <div className="mx-2 min-w-28 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, timelineTotalMs)}
                    step={100}
                    value={Math.min(seekPreviewMs ?? currentMs, Math.max(1, timelineTotalMs))}
                    onChange={(event) => setSeekPreviewMs(Number(event.target.value))}
                    onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
                    onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
                    onBlur={(event) => seekPreviewMs !== null && commitSeek(Number(event.currentTarget.value))}
                    className="block w-full accent-amber-500"
                    aria-label="讲解时间轴"
                  />
                  <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-[var(--muted-foreground)]">
                    <span>{formatTime(seekPreviewMs ?? currentMs)}</span>
                    <span>{formatTime(timelineTotalMs)}</span>
                  </div>
                </div>
                <select
                  value={playbackRate}
                  onChange={(event) => changePlaybackRate(Number(event.target.value) as (typeof PLAYBACK_RATES)[number])}
                  className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-[10px] font-semibold text-[var(--foreground)]"
                  aria-label="讲解播放速度"
                >
                  {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeVolume(volume > 0 ? 0 : 1)}
                    title={volume > 0 ? "静音" : "取消静音"}
                    aria-label={volume > 0 ? "静音" : "取消静音"}
                    className="inline-flex size-10 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    className="w-24 accent-amber-500"
                    title="音量"
                    aria-label="讲解音量"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
    {lectureReady && !theater && (
      <section className="overflow-hidden rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3">
          <div>
            <span className="text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]">INTERACTIVE CANVAS</span>
            <h4 className="mt-0.5 text-sm font-bold text-[#18232D]">交互画板 · 自己动手探索</h4>
          </div>
          <span className="hidden text-[10px] text-[#7A817F] sm:inline">播放、单步与重置均保留在画板中</span>
        </header>
        <div className="p-3">
          {disablePanZoom ? interactive : <PanZoom>{interactive}</PanZoom>}
        </div>
      </section>
    )}
    </div>
  )
}
