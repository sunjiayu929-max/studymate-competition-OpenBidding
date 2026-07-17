/**
 * 概念动画 · K-Means 聚类（机器学习）
 * ------------------------------------------------------------------
 * 真实 K-Means 迭代，两阶段交替：
 *   - 分配(assign)：每个点归到最近的质心（点变色）
 *   - 更新(update)：质心滑到所属点的均值位置（rAF 平滑移动）
 *   - 质心几乎不动 → 收敛。▶播放 / ⏸暂停 / ⏭单步 / ↻重置(重新撒点)
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const K = 3
const COLORS = ["#6366f1", "#10b981", "#f59e0b"] // indigo / emerald / amber
const W_MIN = 0.4
const W_MAX = 9.6
const CONVERGE_EPS = 0.06

interface Pt {
  x: number
  y: number
  c: number // 所属簇 -1=未分配
}

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clampW = (v: number) => Math.max(W_MIN, Math.min(W_MAX, v))

function genPoints(): Pt[] {
  const centers = [
    [3, 3.2],
    [7, 3.2],
    [5, 7],
  ]
  const pts: Pt[] = []
  for (const [cx, cy] of centers) {
    for (let i = 0; i < 12; i++) {
      pts.push({ x: clampW(cx + gauss() * 0.9), y: clampW(cy + gauss() * 0.9), c: -1 })
    }
  }
  return pts
}

function genCentroids(pts: Pt[]): { x: number; y: number }[] {
  // 随机挑 K 个不同点作初始质心（简化版 k-means++ 思想）
  const idxs = new Set<number>()
  while (idxs.size < K) idxs.add(Math.floor(Math.random() * pts.length))
  return [...idxs].map((i) => ({ x: pts[i].x, y: pts[i].y }))
}

export function KMeansAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ iter: number; phase: string; done: boolean }>({
    iter: 0,
    phase: "ready",
    done: false,
  })

  const ptsRef = useRef<Pt[]>([])
  const centsRef = useRef<{ x: number; y: number }[]>([]) // 显示位置
  const targetsRef = useRef<{ x: number; y: number }[]>([]) // 移动目标
  const animatingRef = useRef(false)
  const modeRef = useRef<"idle" | "moving">("idle") // idle=已分配等待更新
  const iterRef = useRef(0)
  const settledRef = useRef(0)
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // 初始化 / 重置
  const init = useCallback(() => {
    const pts = genPoints()
    const cents = genCentroids(pts)
    // 先做一次分配，点立即有色
    for (const p of pts) p.c = nearest(p, cents)
    ptsRef.current = pts
    centsRef.current = cents
    targetsRef.current = cents.map((c) => ({ ...c }))
    animatingRef.current = false
    modeRef.current = "idle"
    iterRef.current = 0
    settledRef.current = 0
    setInfo({ iter: 0, phase: "assign", done: false })
  }, [])

  useEffect(() => {
    init()
  }, [init, seed])

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

    const pad = 18
    const sx = (x: number) => pad + (x / 10) * (cssW - pad * 2)
    const sy = (y: number) => cssH - pad - (y / 10) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")

    // 点
    for (const p of ptsRef.current) {
      ctx.fillStyle = p.c >= 0 ? COLORS[p.c] : isDark ? "#52525b" : "#a1a1aa"
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // 质心
    centsRef.current.forEach((c, i) => {
      const x = sx(c.x)
      const y = sy(c.y)
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.25)"
      ctx.shadowBlur = 7
      ctx.shadowOffsetY = 2
      ctx.strokeStyle = COLORS[i]
      ctx.fillStyle = isDark ? "#18181b" : "#fff"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      // 十字
      ctx.strokeStyle = COLORS[i]
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 5, y)
      ctx.lineTo(x + 5, y)
      ctx.moveTo(x, y - 5)
      ctx.lineTo(x, y + 5)
      ctx.stroke()
    })
  }, [applyViewport])

  // 计算新质心位置并开始移动
  const startUpdate = useCallback(() => {
    const pts = ptsRef.current
    const sums = Array.from({ length: K }, () => ({ x: 0, y: 0, n: 0 }))
    for (const p of pts) {
      if (p.c < 0) continue
      sums[p.c].x += p.x
      sums[p.c].y += p.y
      sums[p.c].n += 1
    }
    targetsRef.current = centsRef.current.map((c, i) =>
      sums[i].n > 0 ? { x: sums[i].x / sums[i].n, y: sums[i].y / sums[i].n } : { ...c }
    )
    animatingRef.current = true
    modeRef.current = "moving"
    setInfo((p) => ({ ...p, phase: "update" }))
  }, [])

  // 主循环
  useEffect(() => {
    const MOVE_MS = 600
    const PAUSE_MS = 520
    let moveStart = 0
    let from: { x: number; y: number }[] = []

    const tick = (now: number) => {
      if (animatingRef.current) {
        if (moveStart === 0) {
          moveStart = now
          from = centsRef.current.map((c) => ({ ...c }))
        }
        const t = Math.min(1, (now - moveStart) / MOVE_MS)
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        centsRef.current = targetsRef.current.map((tg, i) => ({
          x: from[i].x + (tg.x - from[i].x) * ease,
          y: from[i].y + (tg.y - from[i].y) * ease,
        }))
        if (t >= 1) {
          animatingRef.current = false
          moveStart = 0
          // 移动完成 → 重新分配
          const pts = ptsRef.current
          for (const p of pts) p.c = nearest(p, centsRef.current)
          // 收敛判断：本次质心移动量
          const moved = totalMove(from, targetsRef.current)
          iterRef.current += 1
          settledRef.current = now
          if (moved < CONVERGE_EPS) {
            playingRef.current = false
            setPlaying(false)
            modeRef.current = "idle"
            setInfo({ iter: iterRef.current, phase: "done", done: true })
          } else {
            modeRef.current = "idle"
            setInfo({ iter: iterRef.current, phase: "assign", done: false })
          }
        }
      } else if (
        playingRef.current &&
        modeRef.current === "idle" &&
        now - settledRef.current > PAUSE_MS
      ) {
        startUpdate()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, startUpdate])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])

  const handleStep = useCallback(() => {
    if (info.done || animatingRef.current) return
    startUpdate()
  }, [info.done, startUpdate])

  const togglePlay = useCallback(() => {
    if (info.done) {
      handleReset()
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [info.done, handleReset])

  // 讲课模式：3 拍（初始质心+着色 → 分配/更新交替滑动 → 收敛）；beat1 开自动迭代(smooth)，beat2 同步收尾
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      init()
    },
    buildBeats: () => {
      const finishKMeans = () => {
        const pts = ptsRef.current
        for (let guard = 0; guard < 60; guard++) {
          const sums = Array.from({ length: K }, () => ({ x: 0, y: 0, n: 0 }))
          for (const p of pts) {
            if (p.c < 0) continue
            sums[p.c].x += p.x
            sums[p.c].y += p.y
            sums[p.c].n += 1
          }
          const newC = centsRef.current.map((c, i) => (sums[i].n > 0 ? { x: sums[i].x / sums[i].n, y: sums[i].y / sums[i].n } : { ...c }))
          const moved = totalMove(centsRef.current, newC)
          centsRef.current = newC
          targetsRef.current = newC.map((c) => ({ ...c }))
          for (const p of pts) p.c = nearest(p, newC)
          iterRef.current += 1
          if (moved < CONVERGE_EPS) break
        }
        animatingRef.current = false
        modeRef.current = "idle"
        setInfo({ iter: iterRef.current, phase: "done", done: true })
      }
      return [
        {
          apply: () => {},
          text: "K-Means 要把这一堆点自动分成几群。这里 K 等于 3，先随机放下三个质心，每个点就近归到离它最近的质心、染上对应的颜色。",
        },
        {
          apply: () => {
            setPlaying(true)
            playingRef.current = true
          },
          text: "然后两步交替地来：第一步分配，每个点重新归到最近的质心；第二步更新，每个质心滑到「属于自己那群点」的平均位置。你看质心正一步步往各自点群的中心挪。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            finishKMeans()
          },
          text: "就这么分配、更新、再分配、再更新，直到质心几乎不再移动，聚类就收敛了——三群点被干净地分开，每个点稳稳归属一个簇。这就是 K-Means。",
        },
      ]
    },
  })

  const caption = info.done
    ? `已收敛（共 ${info.iter} 轮）✓ 质心不再移动，每个点稳定归属一个簇。`
    : info.phase === "update"
      ? "更新：每个质心滑到「它所属那些点」的平均位置。"
      : info.phase === "assign"
        ? "分配：每个点归到最近的质心（按颜色）。点「播放」继续迭代。"
        : "K=3 个质心随机初始化，点已按最近质心着色。点「播放」看聚类如何收敛。"

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
          iter = {info.iter}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {info.done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || info.done}>
          <SkipForward className="size-4" /> 单步（更新一轮）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          ✕ = 质心 · 同色点 = 同一簇
        </span>
      </div>
      )}
    </div>
  )
}

function nearest(p: Pt, cents: { x: number; y: number }[]): number {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < cents.length; i++) {
    const d = (p.x - cents[i].x) ** 2 + (p.y - cents[i].y) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

function totalMove(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  return s
}
