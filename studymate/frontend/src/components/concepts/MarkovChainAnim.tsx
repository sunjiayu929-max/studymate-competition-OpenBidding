/**
 * 概念动画 · 马尔可夫链（机器学习 · 概率 / 随机过程基础）
 * ------------------------------------------------------------------
 * 「无记忆」：下一步状态只取决于当前状态，与更早历史无关。
 * 三种天气 + 转移矩阵 P，初始分布 π₀=[晴1,阴0,雨0]，反复 πₜ₊₁=πₜP（真实矩阵乘）：
 *   分布逐步演化，最终收敛到平稳分布（πP=π），且与初始状态无关。
 * PageRank、MCMC 采样都建立在它之上。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const NAMES = ["晴", "阴", "雨"]
const COLORS = ["#f59e0b", "#94a3b8", "#3b82f6"]
// P[i][j] = 从状态 i 转到状态 j 的概率（每行和为 1）
const P = [
  [0.7, 0.2, 0.1],
  [0.3, 0.4, 0.3],
  [0.2, 0.4, 0.4],
]
const STEPS = 14
const HIST: number[][] = [[1, 0, 0]]
for (let t = 0; t < STEPS; t++) {
  const p = HIST[t]
  const n = [0, 0, 0]
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) n[j] += p[i] * P[i][j]
  HIST.push(n)
}
const STEP_MS = 620
// 三角形节点位置（相对画布比例）
const POS: [number, number][] = [
  [0.5, 0.26],
  [0.3, 0.66],
  [0.7, 0.66],
]

export function MarkovChainAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    applyViewport(ctx)
    const isDark = document.documentElement.classList.contains("dark")
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const dist = HIST[Math.min(stepRef.current, STEPS)]
    const graphW = cssW - 150
    const NP = POS.map(([fx, fy]) => [40 + fx * graphW, 56 + fy * (cssH - 110)] as [number, number])

    // 边（转移概率）
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        if (i === j) continue
        const [x1, y1] = NP[i]
        const [x2, y2] = NP[j]
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.hypot(dx, dy)
        const ux = dx / len
        const uy = dy / len
        // 垂直偏移让双向边分开
        const nx = -uy * 9
        const ny = ux * 9
        const sx = x1 + ux * 26 + nx
        const sy = y1 + uy * 26 + ny
        const ex = x2 - ux * 26 + nx
        const ey = y2 - uy * 26 + ny
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.3)"
        ctx.lineWidth = 1 + P[i][j] * 3
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        // 箭头
        const ang = Math.atan2(ey - sy, ex - sx)
        ctx.fillStyle = isDark ? "rgba(148,163,184,0.55)" : "rgba(100,116,139,0.5)"
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - 7 * Math.cos(ang - 0.4), ey - 7 * Math.sin(ang - 0.4))
        ctx.lineTo(ex - 7 * Math.cos(ang + 0.4), ey - 7 * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fill()
        // 概率标签
        ctx.fillStyle = MUT
        ctx.font = "9px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(P[i][j].toFixed(1), (sx + ex) / 2 + nx, (sy + ey) / 2 + ny)
      }

    // 节点（半径/不透明度反映当前概率）
    for (let i = 0; i < 3; i++) {
      const [x, y] = NP[i]
      const r = 20 + dist[i] * 26
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[i]
      ctx.globalAlpha = 0.35 + dist[i] * 0.6
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 2
      ctx.strokeStyle = COLORS[i]
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "600 15px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(NAMES[i], x, y - 5)
      ctx.font = "600 11px ui-monospace, monospace"
      ctx.fillText(`${(dist[i] * 100).toFixed(0)}%`, x, y + 10)
      // 自环概率
      ctx.fillStyle = MUT
      ctx.font = "9px ui-monospace, monospace"
      ctx.fillText(`↻${P[i][i].toFixed(1)}`, x, y - r - 8)
    }

    // 右侧分布条
    const bx = cssW - 96
    const bTop = 70
    ctx.fillStyle = FG
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`第 ${Math.min(stepRef.current, STEPS)} 天分布`, bx, bTop - 8)
    for (let i = 0; i < 3; i++) {
      const y = bTop + i * 28
      ctx.fillStyle = isDark ? "#3f3f46" : "#e4e4e7"
      ctx.fillRect(bx, y, 64, 16)
      ctx.fillStyle = COLORS[i]
      ctx.fillRect(bx, y, 64 * dist[i], 16)
      ctx.fillStyle = FG
      ctx.font = "9px ui-monospace, monospace"
      ctx.fillText(`${NAMES[i]} ${(dist[i] * 100).toFixed(0)}%`, bx, y + 26)
    }
    if (stepRef.current >= STEPS - 1) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.fillText("→ 平稳分布", bx, bTop + 3 * 28 + 14)
      ctx.fillText("(不再变化)", bx, bTop + 3 * 28 + 28)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("马尔可夫链：下一步只看现在 · 分布反复乘转移矩阵 → 平稳分布", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (stepRef.current < STEPS) setStep((s) => s + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = step >= STEPS
  const handleReset = useCallback(() => {
    setPlaying(false)
    setStep(0)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setStep(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done])

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
        STEPS + 1,
        [
          "马尔可夫链的核心是「无记忆」:下一步会是什么状态,只取决于现在这个状态,跟更早的历史完全无关。这里有三种天气,箭头上的数字,是从一种天气转到另一种天气的概率。今天我们假设百分之百是晴天。",
          "怎么算明天?把今天的天气分布,乘上这张转移概率表。晴天有 0.7 的概率继续晴、0.2 转阴、0.1 转雨,把所有来路加起来,就得到明天每种天气的概率。",
          "一天一天往后推,这个分布不断更新,晴、阴、雨的比例慢慢变化,节点的大小也跟着涨落。",
          "推到后面你会发现,分布稳定下来、不再变了——这就叫平稳分布。最神奇的是:不管最开始是晴是雨,只要一直按这个矩阵走,最终都会收敛到同一个比例。网页排名 PageRank、还有 MCMC 采样,背后都是这套数学。",
        ],
        (i) => setStep(i)
      ),
  })

  const dist = HIST[Math.min(step, STEPS)]
  const caption = done
    ? `收敛到平稳分布 晴${(dist[0] * 100).toFixed(0)}% 阴${(dist[1] * 100).toFixed(0)}% 雨${(dist[2] * 100).toFixed(0)}%——与初始天气无关。PageRank/MCMC 都靠它。`
    : `第 ${step} 天：分布 [晴${(dist[0] * 100).toFixed(0)}%, 阴${(dist[1] * 100).toFixed(0)}%, 雨${(dist[2] * 100).toFixed(0)}%]。πₜ₊₁ = πₜ·P，逐步逼近平稳分布。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          第 {Math.min(step, STEPS)} 天
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "逐天推进"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStep((s) => Math.min(STEPS, s + 1))} disabled={playing || done}>
            下一天
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">节点大小=当前概率 · 收敛即平稳</span>
        </div>
      )}
    </div>
  )
}
