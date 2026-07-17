/**
 * 概念动画 · 时间复杂度 Big-O
 * 用真实增长函数逐点计算操作量，并用对数纵轴同时展示常数、对数、线性、
 * 线性对数、平方与指数增长。对数轴只改变画法，不改变右侧显示的实际操作量。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const STEP_MS = 720
const MAX_N = 16

type Growth = {
  key: string
  label: string
  color: string
  value: (n: number) => number
}

const GROWTHS: Growth[] = [
  { key: "constant", label: "O(1)", color: "#71717a", value: () => 1 },
  { key: "log", label: "O(log n)", color: "#10b981", value: (n) => Math.log2(n) },
  { key: "linear", label: "O(n)", color: "#3b82f6", value: (n) => n },
  { key: "nlogn", label: "O(n log n)", color: "#8b5cf6", value: (n) => n * Math.log2(n) },
  { key: "square", label: "O(n²)", color: "#f59e0b", value: (n) => n * n },
  { key: "exp", label: "O(2ⁿ)", color: "#ef4444", value: (n) => 2 ** n },
]

type Frame = { n: number; values: number[] }

function buildFrames(): Frame[] {
  return Array.from({ length: MAX_N }, (_, i) => {
    const n = i + 1
    return { n, values: GROWTHS.map((growth) => growth.value(n)) }
  })
}

const FRAMES = buildFrames()

function formatValue(value: number): string {
  if (value >= 100_000) return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })
  if (Number.isInteger(value)) return value.toLocaleString("zh-CN")
  return value.toFixed(2)
}

export function BigOAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const total = FRAMES.length

  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    vp.apply(ctx)

    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const grid = dark ? "rgba(161,161,170,.18)" : "rgba(113,113,122,.18)"
    const frame = FRAMES[Math.min(posRef.current, total - 1)]
    const left = 58
    const top = 42
    const legendW = cssW < 620 ? 118 : 155
    const right = Math.max(left + 160, cssW - legendW - 18)
    const bottom = cssH - 43
    const chartW = right - left
    const chartH = bottom - top
    const maxLog = Math.log10(2 ** MAX_N + 1)
    const xOf = (n: number) => left + ((n - 1) / (MAX_N - 1)) * chartW
    const yOf = (value: number) => bottom - (Math.log10(value + 1) / maxLog) * chartH

    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textBaseline = "middle"
    ctx.lineWidth = 1
    for (let power = 0; power <= Math.floor(maxLog); power++) {
      const value = 10 ** power
      const y = yOf(value)
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      ctx.fillStyle = muted
      ctx.textAlign = "right"
      ctx.fillText(power === 0 ? "1" : `10^${power}`, left - 8, y)
    }
    for (const n of [1, 4, 8, 12, 16]) {
      const x = xOf(n)
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.fillStyle = muted
      ctx.textAlign = "center"
      ctx.fillText(String(n), x, bottom + 17)
    }
    ctx.fillStyle = muted
    ctx.textAlign = "center"
    ctx.fillText("输入规模 n", (left + right) / 2, cssH - 9)
    ctx.save()
    ctx.translate(14, (top + bottom) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("操作量（log₁₀ 刻度）", 0, 0)
    ctx.restore()

    GROWTHS.forEach((growth, growthIndex) => {
      ctx.strokeStyle = growth.color
      ctx.fillStyle = growth.color
      ctx.lineWidth = growth.key === "exp" ? 2.7 : 2
      ctx.beginPath()
      for (let n = 1; n <= frame.n; n++) {
        const x = xOf(n)
        const y = yOf(growth.value(n))
        if (n === 1) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      const cx = xOf(frame.n)
      const cy = yOf(frame.values[growthIndex])
      ctx.beginPath()
      ctx.arc(cx, cy, 3.7, 0, Math.PI * 2)
      ctx.fill()
    })

    const legendX = right + 14
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.fillText(`n = ${frame.n}`, legendX, top + 5)
    GROWTHS.forEach((growth, i) => {
      const y = top + 30 + i * 35
      ctx.fillStyle = growth.color
      ctx.fillRect(legendX, y - 8, 12, 3)
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.fillText(growth.label, legendX + 18, y - 3)
      ctx.fillStyle = fg
      ctx.font = "11px ui-monospace, monospace"
      ctx.fillText(formatValue(frame.values[i]), legendX + 18, y + 12)
    })
  }, [total, vp])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current >= STEP_MS) {
        lastRef.current = now
        if (posRef.current < total - 1) setPos((value) => value + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total - 1
  const reset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const step = useCallback(() => {
    if (posRef.current < total - 1) setPos((value) => value + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (posRef.current >= total - 1) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
    } else setPlaying((value) => !value)
  }, [total])

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
        total,
        [
          "Big-O 不负责预测精确秒数，它描述输入规模增大时，算法工作量增长得有多快。现在让 n 从一开始增加，每条曲线的点都由对应函数真实计算。",
          "常数和对数增长最平缓。二分查找每次砍掉一半范围，所以输入翻倍，通常只多一次比较。线性增长则意味着数据翻倍，工作量也大致翻倍。",
          "优秀的通用排序常见 n log n；双重循环常见 n 的平方。规模还小时它们差距不夸张，但 n 继续增大后，曲线会迅速分开。",
          "指数级二的 n 次方最危险：n 每增加一，工作量就翻倍。图使用对数纵轴才放得下这些曲线，右侧仍显示真实操作量。分析算法时，要同时关注增长阶和实际输入规模。",
        ],
        (index) => setPos(Math.min(index, total - 1))
      ),
  })

  const frame = FRAMES[pos]
  const caption = done
    ? `n=${frame.n} 时，O(n²)=${formatValue(frame.values[4])}，O(2ⁿ)=${formatValue(frame.values[5])}。增长阶决定规模变大后的差距。`
    : `把 n 增加到 ${frame.n}：所有点均由增长函数真实计算；纵轴使用 log₁₀ 刻度以容纳指数曲线。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 330, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          n = {frame.n} / {MAX_N}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{done ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || done}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">对数轴仅用于显示 · 数值是真实操作量</span>
        </div>
      )}
    </div>
  )
}
