/**
 * 概念动画 · 决策树 Decision Tree（机器学习）
 * ------------------------------------------------------------------
 * 真实贪心划分：每次在一个区域里挑一条「轴对齐」的划分线（按基尼不纯度最优），
 * 把区域切成两块、让每块更"纯"，递归到深度 2 → 平面被切成 4 个近乎纯色的盒子。
 * 数据是 XOR 分布（一刀切不开，必须切两层）——正好讲清决策树"逐层提问"的思想。
 *   - ▶播放 / ⏸暂停 / ⏭单步（揭示下一次划分）/ ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const COLORS = ["#f43f5e", "#0ea5e9"] // rose / sky 两类
const MAX_DEPTH = 2

interface P {
  x: number
  y: number
  c: number
}
interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
}
interface Node {
  region: Region
  leaf: boolean
  cls: number
  axis?: "x" | "y"
  thr?: number
}

const clampW = (v: number) => Math.max(0.4, Math.min(9.6, v))

function genPoints(): P[] {
  const pts: P[] = []
  for (let i = 0; i < 44; i++) {
    const x = clampW(0.6 + Math.random() * 8.8)
    const y = clampW(0.6 + Math.random() * 8.8)
    let c = (x > 5) !== (y > 5) ? 1 : 0 // XOR
    if (Math.random() < 0.08) c = 1 - c // 少量标签噪声
    pts.push({ x, y, c })
  }
  return pts
}

const gini = (pts: P[]): number => {
  if (!pts.length) return 0
  let n0 = 0
  for (const p of pts) if (p.c === 0) n0++
  const p0 = n0 / pts.length
  const p1 = 1 - p0
  return 1 - p0 * p0 - p1 * p1
}
const majority = (pts: P[]): number => {
  let n0 = 0
  for (const p of pts) if (p.c === 0) n0++
  return n0 >= pts.length - n0 ? 0 : 1
}

function bestSplit(pts: P[], region: Region): { axis: "x" | "y"; thr: number } | null {
  const parent = gini(pts)
  let best: { axis: "x" | "y"; thr: number; w: number } | null = null
  for (const axis of ["x", "y"] as const) {
    const lo = axis === "x" ? region.x0 : region.y0
    const hi = axis === "x" ? region.x1 : region.y1
    for (let thr = Math.ceil((lo + 0.5) * 2) / 2; thr < hi - 0.4; thr += 0.5) {
      const L = pts.filter((p) => (axis === "x" ? p.x : p.y) < thr)
      const R = pts.filter((p) => (axis === "x" ? p.x : p.y) >= thr)
      if (L.length < 2 || R.length < 2) continue
      const w = (L.length / pts.length) * gini(L) + (R.length / pts.length) * gini(R)
      if (!best || w < best.w) best = { axis, thr, w }
    }
  }
  if (!best || parent - best.w < 0.02) return null
  return { axis: best.axis, thr: best.thr }
}

/** 递归建树并按 BFS 顺序拍平成揭示帧（内部节点=划分，叶子=着色） */
function buildFrames(pts: P[]): Node[] {
  const out: Node[] = []
  const queue: { pts: P[]; region: Region; depth: number }[] = [
    { pts, region: { x0: 0, x1: 10, y0: 0, y1: 10 }, depth: 0 },
  ]
  while (queue.length) {
    const { pts: sub, region, depth } = queue.shift()!
    const cls = majority(sub)
    const split = depth < MAX_DEPTH && sub.length >= 4 && gini(sub) > 0.05 ? bestSplit(sub, region) : null
    if (!split) {
      out.push({ region, leaf: true, cls })
      continue
    }
    out.push({ region, leaf: false, cls, axis: split.axis, thr: split.thr })
    const { axis, thr } = split
    const L = sub.filter((p) => (axis === "x" ? p.x : p.y) < thr)
    const R = sub.filter((p) => (axis === "x" ? p.x : p.y) >= thr)
    const lr: Region = axis === "x" ? { ...region, x1: thr } : { ...region, y1: thr }
    const rr: Region = axis === "x" ? { ...region, x0: thr } : { ...region, y0: thr }
    queue.push({ pts: L, region: lr, depth: depth + 1 })
    queue.push({ pts: R, region: rr, depth: depth + 1 })
  }
  return out
}

export function DecisionTreeAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(0)

  const ptsRef = useRef<P[]>([])
  const framesRef = useRef<Node[]>([])
  const revealedRef = useRef(0)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    revealedRef.current = revealed
  }, [revealed])

  const init = useCallback(() => {
    const pts = genPoints()
    ptsRef.current = pts
    framesRef.current = buildFrames(pts)
    setRevealed(0)
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const total = framesRef.current.length
  const done = revealed >= total && total > 0

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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const pad = 20
    const sx = (x: number) => pad + (x / 10) * (cssW - pad * 2)
    const sy = (y: number) => cssH - pad - (y / 10) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")
    const frames = framesRef.current
    const nRev = revealedRef.current

    // 已揭示的叶子区域着色
    for (let i = 0; i < nRev; i++) {
      const f = frames[i]
      if (!f.leaf) continue
      ctx.fillStyle = COLORS[f.cls]
      ctx.globalAlpha = 0.14
      const x = sx(f.region.x0)
      const y = sy(f.region.y1)
      ctx.fillRect(x, y, sx(f.region.x1) - x, sy(f.region.y0) - y)
      ctx.globalAlpha = 1
    }

    // 已揭示的划分线
    ctx.strokeStyle = isDark ? "#e4e4e7" : "#3f3f46"
    ctx.lineWidth = 2.5
    for (let i = 0; i < nRev; i++) {
      const f = frames[i]
      if (f.leaf || f.axis === undefined || f.thr === undefined) continue
      ctx.beginPath()
      if (f.axis === "x") {
        ctx.moveTo(sx(f.thr), sy(f.region.y0))
        ctx.lineTo(sx(f.thr), sy(f.region.y1))
      } else {
        ctx.moveTo(sx(f.region.x0), sy(f.thr))
        ctx.lineTo(sx(f.region.x1), sy(f.thr))
      }
      ctx.stroke()
    }

    // 数据点
    for (const p of ptsRef.current) {
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4.5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)"
      ctx.stroke()
    }
  }, [applyViewport])

  useEffect(() => {
    const STEP_MS = 760
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (revealedRef.current < framesRef.current.length) {
          setRevealed((r) => r + 1)
        } else {
          setPlaying(false)
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
    setSeed((s) => s + 1)
  }, [])

  const handleStep = useCallback(() => {
    if (revealedRef.current < framesRef.current.length) setRevealed((r) => r + 1)
  }, [])

  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

  // 讲课模式：3 拍讲清「XOR 一刀切不开 → 第一刀 → 再切一层成 4 个纯盒子」，划分随讲解逐步揭示（音画同步）
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
        framesRef.current.length,
        [
          "这两类点是 XOR 分布：左下和右上是一类、左上和右下是另一类——你拿把尺子，一条直线怎么都分不开。决策树的办法是「逐层提问」，一刀一刀来。",
          "第一刀，它在最能区分的地方切一条横平竖直的线，把平面分成两半，让每半尽量纯一点。可一刀还不够，每一半里两类还是混着。",
          "于是在每一半里再切第二刀。两层下来，平面被切成四个近乎纯色的盒子，每个盒子就是一条「从根到叶」的判定规则——这就是决策树：用一连串简单的提问，拼出复杂的分类边界。",
        ],
        (i) => setRevealed(i)
      ),
  })

  // 当前这一步的说明
  const last = revealed > 0 ? framesRef.current[revealed - 1] : null
  const splitCount = framesRef.current.slice(0, revealed).filter((f) => !f.leaf).length
  const caption = done
    ? "平面被切成几个近乎纯色的盒子，每个盒子就是一条「从根到叶」的判定规则——这就是决策树。"
    : revealed === 0
      ? "两类点呈 XOR 分布：一条直线绝对分不开。决策树靠「逐层提问」一步步把它们隔开。点播放。"
      : last && !last.leaf
        ? `第 ${splitCount} 次划分：问「${last.axis} < ${last.thr?.toFixed(1)} ?」，把当前区域切成两块，让每块更纯。`
        : "这块已经足够纯 → 标记为叶子，按多数类着色。继续划分其它区域。"

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
          划分 {splitCount} 次
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
          <SkipForward className="size-4" /> 单步（下一次划分）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">黑线 = 判定边界 · 底色 = 该区域预测类</span>
      </div>
      )}
    </div>
  )
}
