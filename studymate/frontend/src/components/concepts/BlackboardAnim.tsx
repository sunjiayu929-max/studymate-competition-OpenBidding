/**
 * 黑板老师讲解 · 视频化讲课（无模型概念的通用兜底）
 * ------------------------------------------------------------------
 * 做成「像视频」的体验：16:9 影院式黑板，一个播放键起播 → 老师逐段讲、板面随讲
 * 填充、讲完自动下一段，配讯飞 TTS 语音 —— 像看一节录播微课。
 *   - 不逐字打字（那像 AI 生成文字）；每个要点整块淡入 + 粉笔下划线划出。
 *   - 视频播放器式控制条：播放/暂停 + 章节进度条(可点跳) + 第几讲 + 重播 + 静音 + 全屏。
 *   - 纯文字驱动 → 任意概念都能讲，确定性渲染、当场必出；无 TTS 自动退回静音定时连播。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  GraduationCap,
  Volume2,
  VolumeX,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { speak } from "@/lib/speak"
import type { ConceptScript } from "@/lib/concept"

const CHALK_FONT = '"楷体", "KaiTi", "STKaiti", "Kalam", "Segoe Script", cursive'
const SILENT_MS = 3600 // 静音模式每段停留

export function BlackboardAnim({ script }: { script: ConceptScript }) {
  const steps = script.steps
  const last = steps.length - 1
  const [idx, setIdx] = useState(0)
  const [started, setStarted] = useState(false) // 是否点过播放（首帧显示封面）
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const cur = steps[idx] ?? steps[0]
  const atEnd = idx >= last

  // 连播引擎：有声→语音念完推进；静音→定时推进
  useEffect(() => {
    if (!started || !playing) return
    if (atEnd) return
    let cancelled = false
    const advance = () => {
      if (cancelled) return
      const next = Math.min(last, idx + 1)
      setIdx(next)
      if (next >= last) setPlaying(false)
    }

    if (!muted) {
      const h = speak(`${cur.title}。${cur.desc}`)
      let fb: number | undefined
      h.done
        .then(() => {
          if (!cancelled) setTimeout(advance, 500)
        })
        .catch(() => {
          if (!cancelled) fb = window.setTimeout(advance, SILENT_MS)
        })
      return () => {
        cancelled = true
        h.stop()
        if (fb) window.clearTimeout(fb)
      }
    }

    const t = window.setTimeout(advance, SILENT_MS)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [started, playing, idx, muted, atEnd, last, cur.title, cur.desc])

  // 板面随讲滚到底
  useEffect(() => {
    const el = boardRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [idx, started])

  const start = useCallback(() => {
    setStarted(true)
    setIdx(0)
    setPlaying(last > 0)
  }, [last])

  const togglePlay = useCallback(() => {
    if (!started) {
      start()
      return
    }
    if (atEnd) {
      setIdx(0)
      setPlaying(last > 0)
      return
    }
    setPlaying((p) => !p)
  }, [started, atEnd, last, start])

  const replay = useCallback(() => {
    setIdx(0)
    setStarted(true)
    setPlaying(true)
  }, [])

  const seek = useCallback(
    (n: number) => {
      setStarted(true)
      setIdx(Math.max(0, Math.min(last, n)))
    },
    [last]
  )

  const stage = (
    <div className={`rounded-xl overflow-hidden border-[3px] border-amber-900/70 dark:border-amber-950 shadow-xl bg-black ${fullscreen ? "w-full max-w-5xl" : ""}`}>
      {/* 16:9 黑板舞台 */}
      <div
        className="relative w-full aspect-video text-[#eef7f0] overflow-hidden"
        style={{
          fontFamily: CHALK_FONT,
          background: "radial-gradient(120% 90% at 28% 0%, #1b4a3a 0%, #123329 55%, #0c241d 100%)",
        }}
      >
        {/* 暗角 */}
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 120px 30px rgba(0,0,0,0.45)" }} />

        {/* 课题 */}
        <div className="absolute top-4 left-6 right-6">
          <div className="text-[13px] text-[#ffe08a]/80">课题</div>
          <h4 className="text-xl sm:text-2xl font-semibold tracking-wide" style={{ textShadow: "0 0 1.5px rgba(255,255,255,0.45)" }}>
            {script.concept}
          </h4>
          <div className="mt-1 h-[3px] w-28 rounded-full bg-[#f2efe6]/70" style={{ filter: "blur(0.3px)" }} />
        </div>

        {/* 板书内容（整块淡入，非逐字） */}
        <div ref={boardRef} className="absolute inset-x-6 top-[92px] bottom-4 overflow-y-auto pr-2">
          <ol className="space-y-3">
            {(started ? steps.slice(0, idx + 1) : []).map((s, i) => {
              const isCur = i === idx
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isCur ? 1 : 0.55, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="leading-relaxed"
                >
                  <div className="flex items-center gap-2 text-[16px] sm:text-[17px] font-medium" style={{ textShadow: "0 0 1px rgba(255,255,255,0.4)" }}>
                    <span className="text-[#ffe08a]">{i + 1}.</span>
                    <span>{s.title}</span>
                  </div>
                  {isCur && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "3.5rem" }}
                      transition={{ duration: 0.5, delay: 0.15 }}
                      className="ml-5 mt-0.5 h-[2px] rounded-full bg-[#f2efe6]/60"
                    />
                  )}
                  <p className="pl-5 mt-1 text-[14px] sm:text-[15px] text-[#d8ece1]" style={{ textShadow: "0 0 1px rgba(255,255,255,0.3)" }}>
                    {s.desc}
                  </p>
                </motion.li>
              )
            })}
          </ol>
        </div>

        {/* 起播封面 */}
        <AnimatePresence>
          {!started && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={start}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/35 backdrop-blur-[1px] group"
            >
              <span className="flex items-center justify-center size-16 rounded-full bg-white/90 text-emerald-900 shadow-lg group-hover:scale-105 transition-transform">
                <Play className="size-7 ml-1" fill="currentColor" />
              </span>
              <span className="text-[15px] text-white/90">▶ 播放讲解 · 共 {steps.length} 讲</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 播放中标识 */}
        {started && playing && (
          <div className="absolute top-4 right-5 inline-flex items-center gap-1 text-[11px] text-[#ffe08a]/90">
            <GraduationCap className="size-3.5" /> {muted ? "演示中" : "讲解中…"}
          </div>
        )}
        {/* 全屏开关 */}
        <button
          type="button"
          onClick={() => setFullscreen((f) => !f)}
          className="absolute bottom-3 right-4 grid size-9 place-items-center rounded-xl bg-black/25 text-white/75 transition-colors hover:bg-black/40 hover:text-white"
          title={fullscreen ? "退出全屏" : "全屏"}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {/* 控制条（视频播放器风格） */}
      <div className="bg-[#0c241d] px-3 py-2.5 flex items-center gap-2">
        <button type="button" onClick={togglePlay} className="grid size-9 shrink-0 place-items-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white" title={playing ? "暂停" : "播放"}>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" fill="currentColor" />}
        </button>

        {/* 章节进度条（可点跳转） */}
        <div className="flex-1 flex items-center gap-1">
          {steps.map((_, i) => (
            <button
              type="button"
              key={i}
              onClick={() => seek(i)}
              title={`第 ${i + 1} 讲`}
              className="group relative flex-1 h-2.5 flex items-center"
            >
              <span
                className={`w-full h-1.5 rounded-full transition-colors ${
                  started && i < idx
                    ? "bg-amber-400/80"
                    : started && i === idx
                      ? "bg-amber-400"
                      : "bg-white/20 group-hover:bg-white/35"
                }`}
              />
            </button>
          ))}
        </div>

        <span className="text-[11px] text-white/70 font-mono shrink-0 tabular-nums">
          {started ? idx + 1 : 0} / {steps.length} 讲
        </span>
        <button type="button" onClick={() => setMuted((m) => !m)} className="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" title={muted ? "取消静音" : "静音演示"}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <button type="button" onClick={replay} className="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" title="重新播放">
          <RotateCcw className="size-4" />
        </button>
        <span className="ml-0.5 inline-flex shrink-0 items-center gap-1 text-[10px] text-[#E6C98E]">
          <GraduationCap className="size-3" /> AI 板书课
        </span>
      </div>
    </div>
  )

  return (
    <>
      {/* 全屏剧场 */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101820]/96 p-4" onClick={(e) => e.target === e.currentTarget && setFullscreen(false)}>
          {stage}
        </div>
      )}
      {/* 常规内嵌（全屏时此处留个占位避免塌陷） */}
      {!fullscreen ? stage : <div className="rounded-xl border border-dashed border-[var(--border)] aspect-video flex items-center justify-center text-sm text-[var(--muted-foreground)]">全屏播放中…</div>}

      {/* 总结 + 易错点 */}
      {(script.summary || script.pitfall) && !fullscreen && (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 space-y-2 text-sm">
          {script.summary && (
            <p className="flex items-start gap-1.5 text-[var(--foreground)]">
              <GraduationCap className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{script.summary}</span>
            </p>
          )}
          {script.pitfall && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
              <span className="shrink-0">⚠️</span>
              <span>易错：{script.pitfall}</span>
            </p>
          )}
        </div>
      )}
    </>
  )
}
