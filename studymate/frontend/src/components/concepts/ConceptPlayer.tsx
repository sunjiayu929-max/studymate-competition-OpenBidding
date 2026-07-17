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
import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { Film, GraduationCap, Maximize2, X, RotateCcw, Play, Pause, Volume2, VolumeX } from "lucide-react"
import { motion } from "framer-motion"
import { SpeakerButton } from "@/components/SpeakerButton"
import { PanZoom } from "@/components/concepts/PanZoom"
import { speak, synthesize, playBlob, setSpeakVolume, pauseSpeak, resumeSpeak, type SpeakHandle } from "@/lib/speak"
import type { ConceptAnimProps } from "@/components/concepts/registry"

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
  const lectureRef = useRef(false)
  const handleRef = useRef<SpeakHandle | null>(null)
  const lastTextRef = useRef("")
  const clipsRef = useRef<Map<string, Blob>>(new Map())
  const rootRef = useRef<HTMLDivElement>(null)

  // 讲课开场：一次性把全部节拍语音合成完再开播（避免边播边合成的忽快忽慢违和感）。
  // 先并行（快），失败的再串行重试（避开 CosyVoice 并发限流）→ 尽量 4/4 命中，杜绝静默卡顿。
  const prepareNarration = useCallback(async (texts: string[]) => {
    const uniq = [...new Set(texts.map((t) => (t || "").trim()).filter(Boolean))]
    const pending = uniq.filter((t) => !clipsRef.current.has(t))
    if (pending.length === 0) return
    setPreparing(true)
    try {
      // 限并发到 2：CosyVoice(DashScope) 是按账号 QPS 限流的，一次性全并发会撞「rate limit」。
      // 后端已对限流退避重试，这里再从源头削并发 → 双保险，讲课开场稳不报 502。
      const POOL = 2
      const pairs: (readonly [string, Blob | null])[] = []
      let idx = 0
      const worker = async () => {
        while (idx < pending.length) {
          const t = pending[idx++]
          try {
            pairs.push([t, await synthesize(t)] as const)
          } catch {
            pairs.push([t, null] as const)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(POOL, pending.length) }, worker))
      for (const [t, blob] of pairs) if (blob) clipsRef.current.set(t, blob)
      // 失败的串行重试（不并发 → 避免再次限流）
      for (const [t, blob] of pairs) {
        if (blob) continue
        for (let i = 0; i < 2 && !clipsRef.current.has(t); i++) {
          try {
            clipsRef.current.set(t, await synthesize(t))
          } catch {
            await new Promise((r) => setTimeout(r, 400))
          }
        }
      }
    } finally {
      setPreparing(false)
    }
  }, [])

  // 旧协议：动画连续自播，回传字幕 → 仅朗读（不显示大字幕，避免与动画自带字幕条重复）。
  const speakCaption = useCallback((text: string) => {
    if (!lectureRef.current) return
    const t = (text || "").trim()
    if (!t || t === lastTextRef.current) return
    lastTextRef.current = t
    handleRef.current = speak(t)
  }, [])

  // 新协议：分步讲课。显示大字幕 + 放预合成好的语音，**放完(+250ms 换气)立刻推进**（不干等长计时器）。
  const narrate = useCallback(async (text: string) => {
    const t = (text || "").trim()
    setSubtitle(t)
    if (!t || !lectureRef.current) return
    let blob = clipsRef.current.get(t)
    // 极少数没预生成到 → 当场合成（有声音胜过静默；prepare 的重试已让这条很少触发）
    if (!blob) {
      try {
        blob = await synthesize(t)
        clipsRef.current.set(t, blob)
      } catch {
        blob = undefined
      }
      if (!lectureRef.current) return
    }
    if (blob) {
      const h = playBlob(blob)
      handleRef.current = h
      await h.done.catch(() => {})
      if (!lectureRef.current) return
      await new Promise<void>((r) => setTimeout(r, 250)) // 一口换气
      return
    }
    // 连当场合成都失败：字幕停留可读时长（短，避免长时间静默）
    const readMs = Math.min(3600, 900 + t.length * 45)
    await new Promise<void>((r) => setTimeout(r, readMs))
  }, [])

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
    setLectureDone(false)
    setPaused(false)
    setReplayNonce((n) => n + 1)
  }, [])

  // 暂停 / 继续讲课（暂停当前朗读 → narrate 的 await 挂起到继续）
  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      if (next) pauseSpeak()
      else resumeSpeak()
      return next
    })
  }, [])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    setSpeakVolume(v)
  }, [])

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

  return (
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
          {/* 讲课模式开关（仅支持的动画显示） */}
          {lectureReady && (
            <button
              type="button"
              onClick={toggleLecture}
              title="语音老师对着图画逐步讲题"
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                lecture
                  ? "border-amber-400 bg-amber-500 text-white"
                  : theater
                    ? "border-white/20 text-white/80 hover:text-white hover:border-amber-300"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-amber-300"
              }`}
            >
              <GraduationCap className="size-3.5" /> 讲课模式
            </button>
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
      <div className={theater ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:overflow-hidden" : "p-3"}>
        <div
          className={
            theater
              ? "concept-theater flex min-h-full w-full min-w-0 flex-none flex-col bg-[#101820] sm:min-h-0 sm:flex-1"
              : ""
          }
        >
          {disablePanZoom ? injected : <PanZoom className={theater ? "min-h-full flex-none sm:min-h-0 sm:flex-1" : ""}>{injected}</PanZoom>}

          {/* 影院讲课：字幕条 + 控制条，与画面同一张卡片、无缝衔接（不再是浮空拼块） */}
          {theater && lecture && (
            <>
              <div className="px-8 py-4 min-h-[4.75rem] flex items-center justify-center text-center text-white text-xl font-medium leading-relaxed tracking-wide bg-[#16181d]">
                {preparing ? (
                  <span className="inline-flex items-center gap-2 text-base text-white/70">
                    <GraduationCap className="size-4" /> 讲课模式深度思考中
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                      <span className="size-1.5 rounded-full bg-current animate-bounce" />
                    </span>
                  </span>
                ) : (
                  subtitle
                )}
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
            {subtitle && !preparing && (
              <div className="mt-3 px-4 py-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-center text-sm leading-relaxed">
                {subtitle}
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
  )
}
