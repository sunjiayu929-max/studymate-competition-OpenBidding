/** KMP 字符串匹配：真实构造 LPS（next）表，并用它完成一次匹配。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const TEXT = "ABABDABACDABABCABAB"
const PATTERN = "ABABCABAB"
const STEP_MS = 620

type Phase = "prefix" | "search" | "done"
type Tone = "plain" | "match" | "mismatch" | "fallback" | "found"

interface KmpFrame {
  phase: Phase
  lps: number[]
  prefixI: number
  prefixLen: number
  textI: number
  patternJ: number
  align: number
  tone: Tone
  foundAt: number | null
  caption: string
}

function generateFrames(): KmpFrame[] {
  const frames: KmpFrame[] = []
  const lps = Array(PATTERN.length).fill(0) as number[]
  const push = (frame: Omit<KmpFrame, "lps">) => frames.push({ ...frame, lps: [...lps] })

  push({
    phase: "prefix",
    prefixI: -1,
    prefixLen: -1,
    textI: -1,
    patternJ: -1,
    align: 0,
    tone: "plain",
    foundAt: null,
    caption: "先构造模式串的 LPS（也叫 next）表：LPS[i] 是前缀与后缀的最长公共长度。",
  })

  let i = 1
  let len = 0
  while (i < PATTERN.length) {
    if (PATTERN[i] === PATTERN[len]) {
      len++
      lps[i] = len
      push({
        phase: "prefix",
        prefixI: i,
        prefixLen: len - 1,
        textI: -1,
        patternJ: -1,
        align: 0,
        tone: "match",
        foundAt: null,
        caption: `P[${i}]=${PATTERN[i]} 与 P[${len - 1}]=${PATTERN[len - 1]} 相同，LPS[${i}]=${len}。`,
      })
      i++
    } else if (len > 0) {
      const old = len
      len = lps[len - 1]
      push({
        phase: "prefix",
        prefixI: i,
        prefixLen: old,
        textI: -1,
        patternJ: -1,
        align: 0,
        tone: "fallback",
        foundAt: null,
        caption: `前缀构造失配：长度 ${old} 回退到 LPS[${old - 1}]=${len}，i 不移动。`,
      })
    } else {
      lps[i] = 0
      push({
        phase: "prefix",
        prefixI: i,
        prefixLen: 0,
        textI: -1,
        patternJ: -1,
        align: 0,
        tone: "mismatch",
        foundAt: null,
        caption: `P[${i}]=${PATTERN[i]} 与 P[0]=${PATTERN[0]} 不同，且已无法回退，LPS[${i}]=0。`,
      })
      i++
    }
  }

  push({
    phase: "search",
    prefixI: -1,
    prefixLen: -1,
    textI: 0,
    patternJ: 0,
    align: 0,
    tone: "plain",
    foundAt: null,
    caption: `LPS 构造完成：[${lps.join(", ")}]。开始在文本中匹配。`,
  })

  i = 0
  let j = 0
  while (i < TEXT.length) {
    const align = i - j
    if (TEXT[i] === PATTERN[j]) {
      push({
        phase: "search",
        prefixI: -1,
        prefixLen: -1,
        textI: i,
        patternJ: j,
        align,
        tone: "match",
        foundAt: null,
        caption: `T[${i}]=${TEXT[i]} 与 P[${j}]=${PATTERN[j]} 相同，两个指针一起前进。`,
      })
      i++
      j++
      if (j === PATTERN.length) {
        const foundAt = i - j
        push({
          phase: "done",
          prefixI: -1,
          prefixLen: -1,
          textI: i - 1,
          patternJ: j - 1,
          align: foundAt,
          tone: "found",
          foundAt,
          caption: `完整匹配成功：模式串首次出现在下标 ${foundAt}，过程中没有让文本指针回退。`,
        })
        break
      }
    } else if (j > 0) {
      const oldJ = j
      j = lps[j - 1]
      push({
        phase: "search",
        prefixI: -1,
        prefixLen: -1,
        textI: i,
        patternJ: oldJ,
        align,
        tone: "fallback",
        foundAt: null,
        caption: `失配：文本指针 i=${i} 不回退，模式指针从 ${oldJ} 跳到 LPS[${oldJ - 1}]=${j}。`,
      })
    } else {
      push({
        phase: "search",
        prefixI: -1,
        prefixLen: -1,
        textI: i,
        patternJ: 0,
        align: i,
        tone: "mismatch",
        foundAt: null,
        caption: `首字符就失配，模式串没有可复用前缀，文本指针从 ${i} 移到 ${i + 1}。`,
      })
      i++
    }
  }
  return frames
}

export function KmpAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const { apply: applyViewport } = vp
  const frames = useMemo(() => generateFrames(), [])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frame = frames[Math.min(idx, frames.length - 1)]
  const atEnd = idx >= frames.length - 1
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    applyViewport(ctx)
    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const grid = dark ? "#3f3f46" : "#d4d4d8"
    const base = dark ? "#27272a" : "#fafafa"
    const left = 34
    const cell = Math.min(31, (width - left * 2) / TEXT.length)

    const drawCell = (x: number, y: number, value: string, fill = base, stroke = grid) => {
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1
      ctx.fillRect(x, y, cell, 30)
      ctx.strokeRect(x, y, cell, 30)
      ctx.fillStyle = fill === "#f59e0b" || fill === "#10b981" || fill === "#ef4444" ? "#fff" : fg
      ctx.font = "600 13px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(value, x + cell / 2, y + 15)
    }

    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("模式串 P", left, 27)
    const patternW = PATTERN.length * cell
    const patternX = left + Math.max(0, (width - left * 2 - patternW) / 2)
    for (let p = 0; p < PATTERN.length; p++) {
      let fill = base
      if (frame.phase === "prefix" && (p === frame.prefixI || p === frame.prefixLen)) {
        fill = frame.tone === "match" ? "#10b981" : frame.tone === "fallback" ? "#f59e0b" : "#ef4444"
      }
      drawCell(patternX + p * cell, 38, PATTERN[p], fill)
    }
    ctx.fillStyle = muted
    ctx.font = "11px ui-monospace, monospace"
    ctx.fillText("LPS / next", left, 87)
    for (let p = 0; p < PATTERN.length; p++) {
      const hot = frame.phase === "prefix" && p === frame.prefixI
      drawCell(patternX + p * cell, 76, String(frame.lps[p]), hot ? "#6366f1" : base)
    }

    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(frame.phase === "prefix" ? "构造前缀表" : "KMP 搜索（文本指针永不回退）", left, 139)

    const textY = 151
    for (let t = 0; t < TEXT.length; t++) {
      const hot = frame.phase !== "prefix" && t === frame.textI
      const fill = hot ? (frame.tone === "match" || frame.tone === "found" ? "#10b981" : "#ef4444") : base
      drawCell(left + t * cell, textY, TEXT[t], fill)
    }
    ctx.fillStyle = muted
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    for (let t = 0; t < TEXT.length; t++) ctx.fillText(String(t), left + t * cell + cell / 2, textY - 7)

    if (frame.phase !== "prefix") {
      const patternY = 211
      for (let p = 0; p < PATTERN.length; p++) {
        const x = left + (frame.align + p) * cell
        if (x < left - cell || x > width - left) continue
        const hot = p === frame.patternJ
        const fill = hot ? (frame.tone === "match" || frame.tone === "found" ? "#10b981" : frame.tone === "fallback" ? "#f59e0b" : "#ef4444") : dark ? "#312e81" : "#e0e7ff"
        drawCell(x, patternY, PATTERN[p], fill)
      }
      ctx.fillStyle = muted
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText(`对齐起点 = ${frame.align}`, left, 262)
      if (frame.tone === "fallback") {
        ctx.fillStyle = "#f59e0b"
        ctx.fillText("↖ 复用已匹配的前后缀，只移动模式串", left + 108, 262)
      }
    } else {
      ctx.fillStyle = muted
      ctx.font = "12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("相等就扩展前缀；失配时沿已算出的 LPS 链继续回退", width / 2, 220)
    }
  }, [applyViewport, frame])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
    },
    buildBeats: () =>
      chunkedBeats(
        frames.length,
        [
          "KMP 的准备工作，是为模式串构造 LPS 表。每个位置记录：截至这里，最长的相同真前缀和真后缀有多长。相等时长度加一。",
          "构造 LPS 时如果失配，不必从零重来，而是沿着已经算出的 LPS 值回退，直到重新匹配或长度归零。",
          "搜索文本时，字符相等就让两个指针一起前进。遇到失配，文本指针保持不动，模式指针跳到上一个可复用前缀的位置。",
          "不断复用前后缀信息，最终找到完整模式串。KMP 的关键收益就是文本指针从不后退，构表和搜索合计都是线性时间。",
        ],
        setIdx
      ),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current >= STEP_MS) {
        lastRef.current = now
        setIdx((value) => {
          if (value >= frames.length - 1) {
            playingRef.current = false
            setPlaying(false)
            return value
          }
          return value + 1
        })
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, frames.length])

  const reset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
  }, [])
  const step = useCallback(() => setIdx((value) => Math.min(value + 1, frames.length - 1)), [frames.length])
  const toggle = useCallback(() => {
    if (atEnd) {
      setIdx(0)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((value) => !value)
  }, [atEnd])

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 290, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {frame.phase === "prefix" ? "LPS 构造" : "KMP 搜索"} · {idx + 1}/{frames.length}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{frame.caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{atEnd ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || atEnd}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=匹配 · 红=失配 · 橙=按 LPS 回退</span>
        </div>
      )}
    </div>
  )
}
