/**
 * 通用动画模板播放器 · 「搜了但库里没有」的兜底引擎
 * ------------------------------------------------------------------
 * 设计：库里只有 10 个手写动画，覆盖不了用户想搜的一切。没命中时，后端 LLM
 *   现编排一份「分步脚本」（concept/summary/steps[title,desc,nodes]/pitfall），
 *   这里用**确定性渲染**把脚本逐步演示出来 —— LLM 只出文字，渲染永不翻车。
 *
 * 两种连播：
 *   - 静默自动连播：每步停留固定时长（无语音，进页面默认）。
 *   - 🎓 讲课模式：讯飞 TTS 逐句念旁白，**念完一步自动走下一步** —— 像老师讲课，
 *     但底层还是可交互动画，随时暂停、拖动、单步。TTS 不可用时自动退回定时连播。
 */
import { useCallback, useEffect, useState } from "react"
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, Lightbulb, Sparkles, GraduationCap } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { SpeakerButton } from "@/components/SpeakerButton"
import { speak } from "@/lib/speak"
import type { ConceptScript, ScriptNode } from "@/lib/concept"

const STEP_MS = 4200 // 静默连播 / TTS 失败兜底时每步停留时长

const NODE_STYLE: Record<NonNullable<ScriptNode["state"]>, string> = {
  active:
    "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200 ring-2 ring-amber-400/40 shadow-sm",
  done: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  idle: "border-[var(--border)] text-[var(--muted-foreground)] bg-[var(--card)]",
}

export function GenericConceptAnim({ script }: { script: ConceptScript }) {
  const steps = script.steps
  const last = steps.length - 1
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [lecture, setLecture] = useState(false) // 讲课模式：语音驱动连播

  const cur = steps[idx] ?? steps[0]

  // 单一连播引擎：lecture 时语音驱动（念完推进），否则定时推进
  useEffect(() => {
    if (!playing) return
    if (idx >= last) {
      setPlaying(false)
      return
    }

    let cancelled = false
    const advance = () => {
      if (!cancelled) setIdx((i) => Math.min(last, i + 1))
    }

    if (lecture) {
      // 语音驱动：念完这一步（或出错退回定时）再推进
      const h = speak(`${cur.title}。${cur.desc}`)
      let fallback: number | undefined
      h.done
        .then(() => {
          if (!cancelled) setTimeout(advance, 450) // 留半秒喘息
        })
        .catch(() => {
          if (!cancelled) fallback = window.setTimeout(advance, STEP_MS)
        })
      return () => {
        cancelled = true
        h.stop()
        if (fallback) window.clearTimeout(fallback)
      }
    }

    // 静默定时连播
    const t = window.setTimeout(advance, STEP_MS)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [playing, idx, lecture, last, cur.title, cur.desc])

  const go = useCallback(
    (n: number) => {
      setPlaying(false)
      setIdx(Math.max(0, Math.min(last, n)))
    },
    [last]
  )

  const toggle = useCallback(() => {
    if (idx >= last) {
      setIdx(0)
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [idx, last])

  const toggleLecture = useCallback(() => {
    setLecture((on) => {
      const next = !on
      if (next) {
        // 开讲课：从当前步开始播（到末步则从头），用户点击=手势，可放音频
        setPlaying(true)
        if (idx >= last) setIdx(0)
      }
      return next
    })
  }, [idx, last])

  const atEnd = idx >= last

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* 舞台 */}
      <div className="px-4 py-5 bg-[var(--background)] min-h-[200px] flex flex-col">
        {/* 步骤进度条 */}
        <div className="flex items-center gap-1.5 mb-5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`第 ${i + 1} 步`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-amber-500" : i < idx ? "w-3 bg-amber-300" : "w-3 bg-[var(--border)] hover:bg-amber-200"
              }`}
            />
          ))}
        </div>

        {/* 当前步骤（切换时淡入滑动） */}
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28 }}
            className="flex-1 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="shrink-0 size-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <h4 className="text-base font-semibold text-[var(--foreground)]">{cur.title}</h4>
              {/* 讲课模式下语音由引擎统一驱动，避免双重播放，只在非讲课时给手动朗读按钮 */}
              {lecture ? (
                playing && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <GraduationCap className="size-3.5" /> 讲解中…
                  </span>
                )
              ) : (
                <SpeakerButton text={`${cur.title}。${cur.desc}`} />
              )}
            </div>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed pl-8">{cur.desc}</p>

            {/* 节点状态色块（有才显示） */}
            {cur.nodes && cur.nodes.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-8 mt-4">
                {cur.nodes.map((n, i) => (
                  <motion.span
                    key={`${idx}-${i}-${n.label}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.05 }}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${NODE_STYLE[n.state ?? "idle"]}`}
                  >
                    {n.label}
                  </motion.span>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 控制条 */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={toggle}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}>
          <SkipBack className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => go(idx + 1)} disabled={atEnd}>
          <SkipForward className="size-4" />
        </Button>

        {/* 讲课模式开关 */}
        <Button
          size="sm"
          variant={lecture ? "default" : "outline"}
          onClick={toggleLecture}
          className={lecture ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
          title="语音逐句讲解，念完自动下一步"
        >
          <GraduationCap className="size-4" /> 讲课模式
        </Button>

        <span className="text-xs text-[var(--muted-foreground)] ml-1 font-mono">
          {idx + 1} / {steps.length}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
          <Sparkles className="size-3" /> AI 实时编排
        </span>
      </div>

      {/* 总结 + 易错点 */}
      {(script.summary || script.pitfall) && (
        <div className="px-4 py-3 border-t border-[var(--border)] space-y-2 text-sm">
          {script.summary && (
            <p className="flex items-start gap-1.5 text-[var(--foreground)]">
              <Lightbulb className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{script.summary}</span>
            </p>
          )}
          {script.pitfall && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>易错：{script.pitfall}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
