/**
 * 概念动画 · 随机森林 Random Forest（机器学习 · 集成学习/Bagging）
 * ------------------------------------------------------------------
 * 真实算法：
 *   - 每棵树用一份「有放回随机抽样(bootstrap)」的数据，长一棵深度受限的 CART(基尼划分)
 *   - 单棵树的决策边界横平竖直、生硬、易过拟合
 *   - 多棵有差异的树「投票」：每个位置看多数树判成哪类 → 边界被平均、变平滑稳健
 * 录制「逐棵加入森林」的投票场帧回放，演示 bagging 如何降方差。
 *   ▶播放 / ⏸暂停 / ⏭单步(加一棵树) / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const T = 12 // 树的数量
const G = 44 // 决策场网格分辨率
const MAX_DEPTH = 4
const NPT = 52

interface Pt {
  x: number
  y: number
  c: number
}
type Node = { leaf: true; cls: number } | { leaf: false; f: number; thr: number; l: Node; r: Node }

function genData(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < NPT; i++) {
    const x = Math.random() * 10
    const y = Math.random() * 10
    // 非线性正弦分界 + 少量翻转噪声 → 单棵树会很生硬
    let c = y > 5 + 2 * Math.sin(x * 0.8) ? 1 : 0
    if (Math.random() < 0.08) c = 1 - c
    pts.push({ x, y, c })
  }
  return pts
}

function gini(idx: number[], pts: Pt[]): number {
  if (idx.length === 0) return 0
  let n1 = 0
  for (const i of idx) n1 += pts[i].c
  const p = n1 / idx.length
  return 1 - p * p - (1 - p) * (1 - p)
}

function majority(idx: number[], pts: Pt[]): number {
  let n1 = 0
  for (const i of idx) n1 += pts[i].c
  return n1 * 2 >= idx.length ? 1 : 0
}

function buildTree(idx: number[], pts: Pt[], depth: number): Node {
  if (depth >= MAX_DEPTH || idx.length <= 2 || gini(idx, pts) < 1e-6) return { leaf: true, cls: majority(idx, pts) }
  let best: { f: number; thr: number; score: number; l: number[]; r: number[] } | null = null
  for (let f = 0; f < 2; f++) {
    const vals = [...new Set(idx.map((i) => (f === 0 ? pts[i].x : pts[i].y)))].sort((a, b) => a - b)
    for (let k = 0; k + 1 < vals.length; k++) {
      const thr = (vals[k] + vals[k + 1]) / 2
      const l: number[] = []
      const r: number[] = []
      for (const i of idx) ((f === 0 ? pts[i].x : pts[i].y) < thr ? l : r).push(i)
      if (l.length === 0 || r.length === 0) continue
      const score = (l.length * gini(l, pts) + r.length * gini(r, pts)) / idx.length
      if (!best || score < best.score) best = { f, thr, score, l, r }
    }
  }
  if (!best) return { leaf: true, cls: majority(idx, pts) }
  return { leaf: false, f: best.f, thr: best.thr, l: buildTree(best.l, pts, depth + 1), r: buildTree(best.r, pts, depth + 1) }
}

function predictNode(node: Node, x: number, y: number): number {
  let n = node
  while (!n.leaf) n = (n.f === 0 ? x : y) < n.thr ? n.l : n.r
  return n.cls
}

interface Model {
  pts: Pt[]
  cum: Float32Array[] // cum[k] = 前 k+1 棵树在网格上的类1投票比例（k=0..T-1）
}

function buildModel(): Model {
  const pts = genData()
  const n = pts.length
  // 每棵树的网格预测
  const treeGrid: Uint8Array[] = []
  for (let t = 0; t < T; t++) {
    const boot = Array.from({ length: n }, () => Math.floor(Math.random() * n))
    const tree = buildTree(boot, pts, 0)
    const g = new Uint8Array(G * G)
    for (let gy = 0; gy < G; gy++)
      for (let gx = 0; gx < G; gx++) {
        const x = ((gx + 0.5) / G) * 10
        const y = ((gy + 0.5) / G) * 10
        g[gy * G + gx] = predictNode(tree, x, y)
      }
    treeGrid.push(g)
  }
  // 累计投票比例
  const cum: Float32Array[] = []
  const acc = new Float32Array(G * G)
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < G * G; i++) acc[i] += treeGrid[t][i]
    const frac = new Float32Array(G * G)
    for (let i = 0; i < G * G; i++) frac[i] = acc[i] / (t + 1)
    cum.push(frac)
  }
  return { pts, cum }
}

export function RandomForestAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0) // 0=只有点；k=已加入 k 棵树
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

  const atEnd = idx >= T

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
    const k = idxRef.current

    // 决策场（已加入 ≥1 棵树时）
    if (k >= 1) {
      const frac = m.cum[Math.min(k, T) - 1]
      const cw = (10 / G) * sc
      for (let gy = 0; gy < G; gy++)
        for (let gx = 0; gx < G; gx++) {
          const v = frac[gy * G + gx] // 类1比例：sky(0) ↔ rose(1) 线性插值
          const rr = Math.round(56 + (225 - 56) * v)
          const gg = Math.round(189 - (189 - 29) * v)
          const bb = Math.round(248 - (248 - 72) * v)
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${isDark ? 0.32 : 0.28})`
          const x0 = sx((gx / G) * 10)
          const y0 = sy(((gy + 1) / G) * 10)
          ctx.fillRect(x0, y0, cw + 1, cw + 1)
        }
      // 决策边界等值线（0.5）：简单按相邻差异描边
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)"
      ctx.lineWidth = 1
      for (let gy = 0; gy < G; gy++)
        for (let gx = 0; gx + 1 < G; gx++) {
          const a = frac[gy * G + gx]
          const b = frac[gy * G + gx + 1]
          if ((a - 0.5) * (b - 0.5) < 0) {
            const x = sx(((gx + 1) / G) * 10)
            ctx.beginPath()
            ctx.moveTo(x, sy((gy / G) * 10))
            ctx.lineTo(x, sy(((gy + 1) / G) * 10))
            ctx.stroke()
          }
        }
    }

    // 数据点
    for (const p of m.pts) {
      ctx.fillStyle = p.c === 1 ? (isDark ? "#fb7185" : "#e11d48") : isDark ? "#38bdf8" : "#0284c7"
      ctx.strokeStyle = isDark ? "#18181b" : "#fff"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [applyViewport])

  // 帧播放器
  useEffect(() => {
    const STEP_MS = 520
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (idxRef.current >= T) {
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
    setIdx((i) => Math.min(T, i + 1))
  }, [])
  const togglePlay = useCallback(() => {
    if (idxRef.current >= T) {
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

  // 帧式 chunkedBeats（节奏由底座按旁白自适应）；T+1 帧：0=点，k=前 k 棵树投票场
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
        T + 1,
        [
          "随机森林，就是让很多棵决策树一起投票。先看红蓝两类点，它们的真实分界是条曲线。",
          "加进第一棵树——注意它的边界横平竖直、一格一格的，还死贴着个别点，这是单棵决策树的通病：生硬、容易过拟合。关键在于，每棵树只用一份「有放回随机抽样」的数据来训练，所以每棵都长得不太一样、各有各的偏见。",
          "现在让树一棵棵加进来、一起投票：每个位置看多数树把它判成哪类。你盯着边界看——随着树越来越多，那些生硬的方块被一票票平均掉，边界慢慢变得平滑、贴合那条真实曲线。",
          `${T} 棵树投完，分界既平滑又稳健。这就是集成学习里的 bagging：单棵树方差大、不稳定，但很多棵有差异的树一平均，方差就压下来了，整体更准也更稳——三个臭皮匠，顶个诸葛亮。`,
        ],
        (i) => setIdx(i)
      ),
  })

  const caption = atEnd
    ? `${T} 棵树投票完成：边界平滑稳健。Bagging 用「多棵差异树平均」来降低单棵树的方差。`
    : idx === 0
      ? "红蓝两类点，真实分界是条曲线。点「播放」逐棵加入决策树，看森林投票如何平滑边界。"
      : `已加入 ${idx} 棵树：每棵用一份 bootstrap 抽样训练，按多数投票着色。树越多边界越平滑。`

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
          {idx} / {T} 棵树
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
            <SkipForward className="size-4" /> 加一棵树
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新撒点
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            蓝/红 = 两类 · 底色 = 森林投票倾向
          </span>
        </div>
      )}
    </div>
  )
}
