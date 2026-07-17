/**
 * 概念动画 · AdaBoost 自适应提升（机器学习 · 集成学习/Boosting）
 * ------------------------------------------------------------------
 * 真实算法：
 *   - 弱分类器 = 决策树桩（只在一个特征上砍一刀，h∈{+1,-1}）
 *   - 每轮选加权误差 ε 最小的树桩，权重 α=½ln((1-ε)/ε)
 *   - 被分错的点权重调大(点变大) → 下一个树桩重点照顾难点
 *   - 强分类器 H(x)=sign(Σ αₜhₜ(x))：一串弱树桩叠成强分界
 * 录制每轮帧回放，演示 boosting「串行纠错、弱者叠强」，与随机森林的 bagging 对照。
 *   ▶播放 / ⏸暂停 / ⏭单步(加一个树桩) / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const R = 9 // 提升轮数
const G = 44
const NPT = 40

interface Pt {
  x: number
  y: number
  s: number // 标签 ±1
}
interface Stump {
  f: number // 特征 0=x 1=y
  thr: number
  pol: number // 极性 ±1：feat<thr 判 pol
  alpha: number
}
interface Frame {
  weights: number[]
  stump: Stump | null // 本轮选的树桩（帧0为 null）
  field: Float32Array // 强分类器到此轮的 (tanh+1)/2 倾向场
  err: number
}
interface Model {
  pts: Pt[]
  frames: Frame[]
}

function genData(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < NPT; i++) {
    const x = Math.random() * 10
    const y = Math.random() * 10
    let s = x + y > 10 ? 1 : -1 // 斜分界 → 单根轴向树桩分不好，需多轮叠加
    if (Math.random() < 0.07) s = -s
    pts.push({ x, y, s })
  }
  return pts
}

const stumpPred = (st: Stump, x: number, y: number) => ((st.f === 0 ? x : y) < st.thr ? st.pol : -st.pol)

function bestStump(pts: Pt[], w: number[]): { f: number; thr: number; pol: number; err: number } {
  let best: { f: number; thr: number; pol: number; err: number } | null = null
  for (let f = 0; f < 2; f++) {
    const vals = [...new Set(pts.map((p) => (f === 0 ? p.x : p.y)))].sort((a, b) => a - b)
    for (let k = 0; k + 1 < vals.length; k++) {
      const thr = (vals[k] + vals[k + 1]) / 2
      for (const pol of [1, -1]) {
        let err = 0
        for (let i = 0; i < pts.length; i++) {
          const pred = (f === 0 ? pts[i].x : pts[i].y) < thr ? pol : -pol
          if (pred !== pts[i].s) err += w[i]
        }
        if (!best || err < best.err) best = { f, thr, pol, err }
      }
    }
  }
  return best as { f: number; thr: number; pol: number; err: number }
}

function buildModel(): Model {
  const pts = genData()
  const n = pts.length
  let w = new Array(n).fill(1 / n)
  const frames: Frame[] = [{ weights: [...w], stump: null, field: new Float32Array(G * G).fill(0.5), err: 0 }]
  const Hgrid = new Float32Array(G * G) // Σ α h 在网格上
  for (let t = 0; t < R; t++) {
    const bs = bestStump(pts, w)
    const eps = Math.max(1e-6, Math.min(1 - 1e-6, bs.err))
    const alpha = 0.5 * Math.log((1 - eps) / eps)
    const stump: Stump = { f: bs.f, thr: bs.thr, pol: bs.pol, alpha }
    // 更新权重
    for (let i = 0; i < n; i++) {
      const h = stumpPred(stump, pts[i].x, pts[i].y)
      w[i] *= Math.exp(-alpha * pts[i].s * h)
    }
    const z = w.reduce((a, b) => a + b, 0)
    w = w.map((v) => v / z)
    // 累加到强分类器场
    for (let gy = 0; gy < G; gy++)
      for (let gx = 0; gx < G; gx++) {
        const x = ((gx + 0.5) / G) * 10
        const y = ((gy + 0.5) / G) * 10
        Hgrid[gy * G + gx] += alpha * stumpPred(stump, x, y)
      }
    const field = new Float32Array(G * G)
    for (let i = 0; i < G * G; i++) field[i] = (Math.tanh(0.6 * Hgrid[i]) + 1) / 2
    frames.push({ weights: [...w], stump, field, err: eps })
  }
  return { pts, frames }
}

export function AdaBoostAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const modelRef = useRef<Model>(buildModel())
  const idxRef = useRef(0)
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

  const init = useCallback(() => {
    modelRef.current = buildModel()
    setIdx(0)
    idxRef.current = 0
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const atEnd = idx >= R

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
    const pad = 16
    const sc = Math.min(cssW - pad * 2, cssH - pad * 2) / 10
    const ox = (cssW - sc * 10) / 2
    const oy = (cssH - sc * 10) / 2
    const sx = (x: number) => ox + x * sc
    const sy = (y: number) => cssH - oy - y * sc
    const isDark = document.documentElement.classList.contains("dark")
    const m = modelRef.current
    const f = m.frames[Math.min(idxRef.current, m.frames.length - 1)]

    // 强分类器倾向场
    if (idxRef.current >= 1) {
      const cw = (10 / G) * sc
      for (let gy = 0; gy < G; gy++)
        for (let gx = 0; gx < G; gx++) {
          const v = f.field[gy * G + gx]
          const rr = Math.round(56 + (225 - 56) * v)
          const gg = Math.round(189 - (189 - 29) * v)
          const bb = Math.round(248 - (248 - 72) * v)
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${isDark ? 0.3 : 0.26})`
          ctx.fillRect(sx((gx / G) * 10), sy(((gy + 1) / G) * 10), cw + 1, cw + 1)
        }
    }

    // 当前轮树桩（一刀线）
    if (f.stump) {
      ctx.strokeStyle = isDark ? "#fbbf24" : "#d97706"
      ctx.lineWidth = 2.5
      ctx.setLineDash([7, 5])
      ctx.beginPath()
      if (f.stump.f === 0) {
        ctx.moveTo(sx(f.stump.thr), sy(0))
        ctx.lineTo(sx(f.stump.thr), sy(10))
      } else {
        ctx.moveTo(sx(0), sy(f.stump.thr))
        ctx.lineTo(sx(10), sy(f.stump.thr))
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 数据点：半径随权重放大（被分错的点权重大 → 更显眼）
    const wmax = Math.max(...f.weights)
    m.pts.forEach((p, i) => {
      const rad = 3.5 + 9 * Math.min(1, f.weights[i] / (wmax || 1)) * (idxRef.current > 0 ? 1 : 0.35)
      ctx.fillStyle = p.s === 1 ? (isDark ? "#fb7185" : "#e11d48") : isDark ? "#38bdf8" : "#0284c7"
      ctx.strokeStyle = isDark ? "#18181b" : "#fff"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), rad, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }, [applyViewport])

  useEffect(() => {
    const STEP_MS = 620
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (idxRef.current >= R) {
          playingRef.current = false
          setPlaying(false)
        } else {
          idxRef.current += 1
          setIdx(idxRef.current)
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (playingRef.current) return
    setIdx((i) => Math.min(R, i + 1))
  }, [])
  const togglePlay = useCallback(() => {
    if (idxRef.current >= R) {
      setIdx(0)
      idxRef.current = 0
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [])

  // 帧式 chunkedBeats（节奏由底座按旁白自适应）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
    },
    onLectureEnd,
    buildBeats: () =>
      chunkedBeats(
        R + 1,
        [
          "AdaBoost 是另一种集成思路——boosting。它串行地训练一串很弱的分类器，这里每个弱分类器就是一根横平竖直的「树桩」，只能砍一刀。一开始所有点权重一样大。",
          "训练第一根树桩，砍一刀、尽量把两类分对。然后看哪些点被分错了——把它们的权重调大，点就变大了，意思是「下一根树桩你得重点照顾这些难点」。",
          "于是下一根树桩专门盯着上一轮变大的错点来砍。一轮一轮，每根树桩都在补前面的短板，被照顾的难点不断转移，底色那条强分界也越来越准。",
          "最后把所有树桩按各自的话语权 α 加权投票，叠成一个强分类器。你看——几根只会砍直线的弱树桩，竟拼出了这条斜的、相当准的分界。这就是 boosting：串行纠错、弱者叠成强者。它和随机森林的并行 bagging，是集成学习的两大流派。",
        ],
        (i) => setIdx(i)
      ),
  })

  const f = modelRef.current.frames[Math.min(idx, modelRef.current.frames.length - 1)]
  const caption = atEnd
    ? `${R} 轮提升完成：弱树桩按 α 加权投票，叠出强分界。Boosting = 串行纠错，与随机森林的并行 bagging 互为两大流派。`
    : idx === 0
      ? "红蓝两类，斜分界。单根轴向「树桩」分不好。点「播放」看 AdaBoost 逐轮纠错叠强。"
      : `第 ${idx} 轮：选加权误差最小的树桩(虚线，ε=${f.err.toFixed(2)})，分错的点权重调大(变大)，下一轮重点照顾。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 320, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx} / {R} 轮
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
          {caption}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || atEnd}>
            <SkipForward className="size-4" /> 加一个树桩
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新撒点
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            点越大=权重越高(越难分) · 虚线=本轮树桩 · 底色=强分界
          </span>
        </div>
      )}
    </div>
  )
}
