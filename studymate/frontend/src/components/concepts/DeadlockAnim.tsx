/**
 * 概念动画 · 死锁（操作系统旗舰）
 * ------------------------------------------------------------------
 * 资源分配图：进程 P（圆）、资源 R（方），边逐条出现。
 *   - 分配边 R→P（绿，资源被进程持有）/ 请求边 P→R（橙，进程在等待）
 *   - 4 进程 4 资源排成环，最后一条请求边闭合 → 红色环路脉冲 = 死锁
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

type NodeType = "P" | "R"
const RING: { id: string; type: NodeType }[] = [
  { id: "P1", type: "P" },
  { id: "R2", type: "R" },
  { id: "P2", type: "P" },
  { id: "R3", type: "R" },
  { id: "P3", type: "P" },
  { id: "R4", type: "R" },
  { id: "P4", type: "P" },
  { id: "R1", type: "R" },
]
const POS: Record<string, number> = Object.fromEntries(RING.map((n, i) => [n.id, i]))

interface Edge {
  from: string
  to: string
  kind: "alloc" | "request"
  caption: string
}
const EDGES: Edge[] = [
  { from: "R1", to: "P1", kind: "alloc", caption: "R1 已分配给 P1（P1 持有 R1）" },
  { from: "R2", to: "P2", kind: "alloc", caption: "R2 已分配给 P2" },
  { from: "R3", to: "P3", kind: "alloc", caption: "R3 已分配给 P3" },
  { from: "R4", to: "P4", kind: "alloc", caption: "R4 已分配给 P4" },
  { from: "P1", to: "R2", kind: "request", caption: "P1 请求 R2，但 R2 被 P2 占用 → P1 阻塞等待" },
  { from: "P2", to: "R3", kind: "request", caption: "P2 请求 R3（被 P3 占用）→ P2 等待" },
  { from: "P3", to: "R4", kind: "request", caption: "P3 请求 R4（被 P4 占用）→ P3 等待" },
  { from: "P4", to: "R1", kind: "request", caption: "P4 请求 R1（被 P1 占用）→ 环形等待闭合，死锁！" },
]

export function DeadlockAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1) // -1 初始；0..7 已出现的边索引
  const atEnd = step >= EDGES.length - 1
  const deadlocked = atEnd

  const playingRef = useRef(playing)
  const stepRef = useRef(step)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const draw = useCallback((now: number) => {
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

    const isDark = document.documentElement.classList.contains("dark")
    const cx = cssW / 2
    const cy = cssH / 2 + 4
    const R = Math.min(cssW, cssH) / 2 - 46
    const nodePos = (id: string) => {
      const k = POS[id]
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / RING.length
      return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) }
    }
    const NR = 20 // 节点半径/半边长

    // 边
    const drawEdge = (e: Edge, highlight: boolean) => {
      const a = nodePos(e.from)
      const b = nodePos(e.to)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const sx = a.x + ux * (NR + 4)
      const sy = a.y + uy * (NR + 4)
      const ex = b.x - ux * (NR + 8)
      const ey = b.y - uy * (NR + 8)
      ctx.strokeStyle = highlight ? "#ef4444" : e.kind === "alloc" ? "#10b981" : "#f59e0b"
      ctx.lineWidth = highlight ? 3.5 : 2.5
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      // 箭头
      const ah = 9
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - ah * ux - (ah / 2) * uy, ey - ah * uy + (ah / 2) * ux)
      ctx.lineTo(ex - ah * ux + (ah / 2) * uy, ey - ah * uy - (ah / 2) * ux)
      ctx.closePath()
      ctx.fill()
    }

    const cyclePulse = deadlocked ? 0.5 + 0.5 * Math.sin(now / 220) : 0
    for (let i = 0; i <= stepRef.current; i++) {
      drawEdge(EDGES[i], false)
    }
    if (deadlocked) {
      ctx.globalAlpha = cyclePulse
      for (const e of EDGES) drawEdge(e, true)
      ctx.globalAlpha = 1
    }

    // 节点
    for (const n of RING) {
      const { x, y } = nodePos(n.id)
      ctx.fillStyle =
        n.type === "P" ? (isDark ? "#6366f1" : "#818cf8") : isDark ? "#d97706" : "#f59e0b"
      if (n.type === "P") {
        ctx.beginPath()
        ctx.arc(x, y, NR, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(x - NR, y - NR, NR * 2, NR * 2)
      }
      ctx.fillStyle = "#fff"
      ctx.font = "bold 12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(n.id, x, y)
    }
    ctx.textBaseline = "alphabetic"

    if (deadlocked) {
      ctx.fillStyle = "#ef4444"
      ctx.font = "bold 14px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("⚠ 检测到环路 → 死锁", cx, cssH - 8)
    }
  }, [deadlocked, applyViewport])

  useEffect(() => {
    const STEP_MS = 850
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setStep((s) => {
          if (s >= EDGES.length - 1) {
            playingRef.current = false
            setPlaying(false)
            return s
          }
          return s + 1
        })
      }
      draw(now)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setStep(-1)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setStep((s) => Math.min(s + 1, EDGES.length - 1))
  }, [atEnd])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setStep(-1)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  // 讲课模式：分配 → 请求阻塞 → 环闭合三拍，边随讲解逐条出现（音画同步）
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
    buildBeats: () => [
      {
        frames: [0, 1, 2, 3],
        seek: (i) => setStep(i),
        text: "先看这四个进程，每个都已经拿到了一个资源。绿色箭头表示「这个资源被这个进程持有」。到这儿都还正常，大家各拿各的、互不干扰。",
      },
      {
        frames: [4, 5, 6],
        seek: (i) => setStep(i),
        text: "问题来了。每个进程攥着手里的资源不放，又伸手去要下一个——可那个资源正被别的进程占着。橙色箭头就是「我在等这个资源」，于是它们一个个全卡住、阻塞在那儿。",
      },
      {
        frames: [7],
        seek: (i) => setStep(i),
        text: "最后这一条请求一接上，你看，等待关系绕成了一个圈：P1 等 P2、P2 等 P3、P3 等 P4、P4 又回头等 P1。谁都不肯放手、谁也等不到——这个环，就是死锁。",
      },
    ],
  })

  const caption =
    step >= 0
      ? EDGES[step].caption
      : "4 个进程各持有 1 个资源，又互相请求对方的资源。点「播放」看死锁如何形成。"

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
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${deadlocked ? "text-rose-600 dark:text-rose-400 font-medium" : ""}`}>
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
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "#10b981" }} />分配 R→P
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: "#f59e0b" }} />请求 P→R
          </span>
        </div>
      </div>
      )}
    </div>
  )
}
