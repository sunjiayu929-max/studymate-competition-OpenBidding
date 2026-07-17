/**
 * 概念动画 · 梯度提升树 GBDT（机器学习 · 集成学习 boosting）
 * ------------------------------------------------------------------
 * 真实梯度提升（一维回归）：预测 = 多棵回归树串行相加，每棵只拟合上一轮的「残差」：
 *   F₀(x) = ȳ（先用均值兜底）
 *   每轮：残差 r = y − F(x) → 拟合一棵回归树桩去逼近 r → F += η·树
 *   - 与 AdaBoost(调样本权重)、随机森林(并行投票)对照：GBDT 是串行「拟合残差」
 *   - 每加一棵树，预测曲线就更贴合数据、RMSE 下降
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 950
const N = 20
const ROUNDS = 8
const SHRINK = 0.5
const GRID = 80

interface Stump {
  s: number // 分裂阈值
  left: number
  right: number
}
interface Model {
  xs: number[]
  ys: number[]
  base: number
  stumps: Stump[]
  gridX: number[]
  predByRound: number[][] // [round 0..ROUNDS][grid]
  rmseByRound: number[]
  yMin: number
  yMax: number
}

function fitStump(xs: number[], res: number[]): Stump {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  let best: Stump = { s: 0.5, left: 0, right: 0 }
  let bestSSE = Infinity
  for (let k = 0; k < order.length - 1; k++) {
    const s = (xs[order[k]] + xs[order[k + 1]]) / 2
    let ls = 0
    let ln = 0
    let rs = 0
    let rn = 0
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < s) {
        ls += res[i]
        ln++
      } else {
        rs += res[i]
        rn++
      }
    }
    if (ln === 0 || rn === 0) continue
    const lm = ls / ln
    const rm = rs / rn
    let sse = 0
    for (let i = 0; i < xs.length; i++) sse += (res[i] - (xs[i] < s ? lm : rm)) ** 2
    if (sse < bestSSE) {
      bestSSE = sse
      best = { s, left: lm, right: rm }
    }
  }
  return best
}

function genModel(): Model {
  const xs = Array.from({ length: N }, (_, i) => +((i + 0.5) / N + (Math.random() - 0.5) * 0.03).toFixed(3))
  const ys = xs.map((x) => 0.5 + 0.34 * Math.sin(2 * Math.PI * x) + (Math.random() - 0.5) * 0.12)
  const base = ys.reduce((a, b) => a + b, 0) / N
  const gridX = Array.from({ length: GRID }, (_, i) => i / (GRID - 1))
  const stumps: Stump[] = []
  const predByRound: number[][] = []
  const rmseByRound: number[] = []
  // F(x) 当前在各点 / 各网格的值
  const fPts = new Array(N).fill(base)
  const fGrid = new Array(GRID).fill(base)
  predByRound.push([...fGrid])
  rmseByRound.push(Math.sqrt(fPts.reduce((a, f, i) => a + (ys[i] - f) ** 2, 0) / N))
  for (let r = 0; r < ROUNDS; r++) {
    const res = ys.map((y, i) => y - fPts[i])
    const st = fitStump(xs, res)
    stumps.push(st)
    for (let i = 0; i < N; i++) fPts[i] += SHRINK * (xs[i] < st.s ? st.left : st.right)
    for (let g = 0; g < GRID; g++) fGrid[g] += SHRINK * (gridX[g] < st.s ? st.left : st.right)
    predByRound.push([...fGrid])
    rmseByRound.push(Math.sqrt(fPts.reduce((a, f, i) => a + (ys[i] - f) ** 2, 0) / N))
  }
  const yMin = Math.min(...ys, ...predByRound[ROUNDS]) - 0.08
  const yMax = Math.max(...ys, ...predByRound[ROUNDS]) + 0.08
  return { xs, ys, base, stumps, gridX, predByRound, rmseByRound, yMin, yMax }
}

export function GbdtAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 当前轮 0..ROUNDS
  const mRef = useRef<Model>(genModel())
  const posRef = useRef(0)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    mRef.current = genModel()
    setPos(0)
  }, [seed])

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
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const m = mRef.current
    const r = Math.min(posRef.current, ROUNDS)

    const padL = 40
    const padR = 20
    const padT = 30
    const padB = 36
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const X = (x: number) => padL + x * plotW
    const Y = (y: number) => padT + plotH - ((y - m.yMin) / (m.yMax - m.yMin)) * plotH

    // 坐标框
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    ctx.strokeRect(padL, padT, plotW, plotH)

    // 残差竖线（当前预测 → 真实点）
    const pred = m.predByRound[r]
    const predAt = (x: number) => {
      const g = Math.max(0, Math.min(GRID - 1, Math.round(x * (GRID - 1))))
      return pred[g]
    }
    ctx.strokeStyle = isDark ? "rgba(244,63,94,0.45)" : "rgba(244,63,94,0.5)"
    ctx.lineWidth = 1.5
    for (let i = 0; i < N; i++) {
      ctx.beginPath()
      ctx.moveTo(X(m.xs[i]), Y(m.ys[i]))
      ctx.lineTo(X(m.xs[i]), Y(predAt(m.xs[i])))
      ctx.stroke()
    }

    // 预测阶梯曲线
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let g = 0; g < GRID; g++) {
      const px = X(m.gridX[g])
      const py = Y(pred[g])
      if (g === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // 数据点
    for (let i = 0; i < N; i++) {
      ctx.beginPath()
      ctx.arc(X(m.xs[i]), Y(m.ys[i]), 3.6, 0, Math.PI * 2)
      ctx.fillStyle = "#10b981"
      ctx.fill()
    }

    // 标题 / HUD
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("绿=数据 · 蓝=当前预测(多棵树相加) · 红=残差", 118, padT - 12)
    ctx.fillStyle = "#6366f1"
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    const label = r === 0 ? "第 0 轮：仅用均值" : `已加 ${r} 棵树`
    ctx.fillText(`${label} · RMSE=${m.rmseByRound[r].toFixed(3)}`, cssW - 92, padT - 12)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < ROUNDS) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= ROUNDS
  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < ROUNDS) setPos((p) => p + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

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
    buildBeats: () => {
      const m = mRef.current
      return chunkedBeats(
        ROUNDS + 1,
        [
          `梯度提升树 GBDT 的预测，是好多棵回归树串起来相加。一开始它很「笨」，干脆用所有点的平均值当预测——你看这条平的蓝线，离数据老远，RMSE 高达 ${m.rmseByRound[0].toFixed(3)}，红线就是每个点的误差，也就是残差。`,
          "关键的一步来了：下一棵树不去拟合原始的 y，而是专门去拟合这些「残差」——也就是上一轮还差多少。它学会的就是「该往哪儿补、补多少」，然后我们把它打个折(学习率)加到预测上。",
          `加了几棵树之后，蓝线开始扭动着去贴合数据的起伏，红色残差肉眼可见地变短，RMSE 一路降到 ${m.rmseByRound[Math.min(4, ROUNDS)].toFixed(3)} 附近。每棵新树，都只负责修正前面所有树合起来还没搞定的那点误差。`,
          `串到第 ${ROUNDS} 棵，预测曲线已经紧紧抱住数据、RMSE 降到 ${m.rmseByRound[ROUNDS].toFixed(3)}。这就是 GBDT：串行地、一棵接一棵地拟合残差。和随机森林「并行投票」、AdaBoost「调样本权重」不同，它走的是「沿着误差方向一点点逼近」——XGBoost、LightGBM 都是它的高效实现。`,
        ],
        (i) => setPos(i)
      )
    },
  })

  const m = mRef.current
  const r = Math.min(pos, ROUNDS)
  const caption = done
    ? `串行加到 ${ROUNDS} 棵树：预测曲线紧贴数据，RMSE=${m.rmseByRound[ROUNDS].toFixed(3)}。GBDT = 一棵接一棵拟合残差（区别于随机森林并行投票）。`
    : pos === 0
      ? `GBDT 起步：先用均值当预测（平线），红色残差很大（RMSE=${m.rmseByRound[0].toFixed(3)}）。每轮加一棵树去拟合残差。点播放。`
      : `已加 ${r} 棵树：每棵新树拟合上一轮的残差，预测曲线更贴合，RMSE=${m.rmseByRound[r].toFixed(3)}。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {r} / {ROUNDS} 棵
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-indigo-600 dark:text-indigo-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步（加一棵树）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 换数据
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">串行拟合残差 · 区别于 AdaBoost/随机森林</span>
        </div>
      )}
    </div>
  )
}
