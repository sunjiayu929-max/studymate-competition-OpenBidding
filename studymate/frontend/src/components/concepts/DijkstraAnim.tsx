/**
 * 概念动画 · Dijkstra 最短路（数据结构与算法）
 * ------------------------------------------------------------------
 * 真实 Dijkstra 从 A 出发，"录制成帧"逐帧回放：
 *   - 每轮选未访问中 dist 最小的点 → 确定（绿）→ 松弛它的邻边
 *   - dist 标在节点下方，松弛中的边高亮、被更新的点闪烁
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const NODES: Record<string, { x: number; y: number }> = {
  A: { x: 0.1, y: 0.5 },
  B: { x: 0.34, y: 0.18 },
  C: { x: 0.4, y: 0.8 },
  D: { x: 0.62, y: 0.45 },
  E: { x: 0.82, y: 0.18 },
  F: { x: 0.9, y: 0.75 },
}
const EDGES: { u: string; v: string; w: number }[] = [
  { u: "A", v: "B", w: 4 },
  { u: "A", v: "C", w: 2 },
  { u: "B", v: "C", w: 1 },
  { u: "B", v: "D", w: 5 },
  { u: "C", v: "D", w: 8 },
  { u: "C", v: "E", w: 10 },
  { u: "D", v: "E", w: 2 },
  { u: "D", v: "F", w: 6 },
  { u: "E", v: "F", w: 3 },
]
const NAMES = Object.keys(NODES)
const INF = Infinity

function adj(n: string): { to: string; w: number }[] {
  const r: { to: string; w: number }[] = []
  for (const e of EDGES) {
    if (e.u === n) r.push({ to: e.v, w: e.w })
    if (e.v === n) r.push({ to: e.u, w: e.w })
  }
  return r
}

interface DFrame {
  dist: Record<string, number>
  visited: string[]
  current: string | null
  relax: [string, string] | null
  updated: string | null
  caption: string
}

function genFrames(): DFrame[] {
  const dist: Record<string, number> = {}
  for (const n of NAMES) dist[n] = INF
  dist["A"] = 0
  const visited = new Set<string>()
  const frames: DFrame[] = []
  const snap = (c: Partial<DFrame>, caption: string) =>
    frames.push({
      dist: { ...dist },
      visited: [...visited],
      current: c.current ?? null,
      relax: c.relax ?? null,
      updated: c.updated ?? null,
      caption,
    })

  snap({}, "起点 A 距离=0，其余=∞。每轮选未访问中距离最小的点。")
  while (visited.size < NAMES.length) {
    let u: string | null = null
    let best = INF
    for (const n of NAMES) {
      if (!visited.has(n) && dist[n] < best) {
        best = dist[n]
        u = n
      }
    }
    if (u === null) break
    visited.add(u)
    snap({ current: u }, `选 ${u}（dist=${dist[u]}）→ 它的最短距离已确定 ✓`)
    for (const { to, w } of adj(u)) {
      if (visited.has(to)) continue
      const nd = dist[u] + w
      const old = dist[to] === INF ? "∞" : dist[to]
      if (nd < dist[to]) {
        dist[to] = nd
        snap(
          { current: u, relax: [u, to], updated: to },
          `松弛边 ${u}-${to}(${w})：${dist[u]}+${w}=${nd} < ${old} → 更新 ${to}=${nd}`
        )
      } else {
        snap(
          { current: u, relax: [u, to] },
          `松弛边 ${u}-${to}(${w})：${dist[u]}+${w}=${nd} ≥ ${old} → 不更新`
        )
      }
    }
  }
  snap({}, "全部点已确定，A 到各点最短距离求出 ✓")
  return frames
}

export function DijkstraAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const frames = useMemo(() => genFrames(), [])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frame = frames[Math.min(idx, frames.length - 1)]
  const atEnd = idx >= frames.length - 1

  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

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
    applyViewport(ctx) // 叠加缩放/平移 → 思维导图式真·视口（拖拽露出视区外点线、缩放清晰）
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const isDark = document.documentElement.classList.contains("dark")
    const pad = 34
    const sx = (x: number) => pad + x * (cssW - pad * 2)
    const sy = (y: number) => pad + y * (cssH - pad * 2)

    // 边
    for (const e of EDGES) {
      const a = NODES[e.u]
      const b = NODES[e.v]
      const hot =
        frame.relax && ((frame.relax[0] === e.u && frame.relax[1] === e.v) || (frame.relax[0] === e.v && frame.relax[1] === e.u))
      ctx.strokeStyle = hot ? "#f59e0b" : isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)"
      ctx.lineWidth = hot ? 3.5 : 2
      ctx.beginPath()
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
      ctx.stroke()
      // 权重
      const mx = (sx(a.x) + sx(b.x)) / 2
      const my = (sy(a.y) + sy(b.y)) / 2
      ctx.fillStyle = isDark ? "#18181b" : "#fff"
      ctx.fillRect(mx - 9, my - 9, 18, 18)
      ctx.fillStyle = hot ? "#f59e0b" : isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(e.w), mx, my)
    }

    // 节点
    for (const n of NAMES) {
      const p = NODES[n]
      const x = sx(p.x)
      const y = sy(p.y)
      const isVisited = frame.visited.includes(n)
      const isCurrent = frame.current === n
      const isUpdated = frame.updated === n
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.22)"
      ctx.shadowBlur = 7
      ctx.shadowOffsetY = 2
      ctx.fillStyle = isVisited ? (isDark ? "#059669" : "#10b981") : isUpdated ? "#f59e0b" : isDark ? "#6366f1" : "#818cf8"
      ctx.beginPath()
      ctx.arc(x, y, 17, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      if (isCurrent) {
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, 21, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = "#fff"
      ctx.font = "bold 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(n, x, y)
      // dist 标签
      const d = frame.dist[n]
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)"
      ctx.font = "bold 11px ui-sans-serif, system-ui"
      ctx.fillText(d === INF ? "∞" : String(d), x, y + 28)
    }
    ctx.textBaseline = "alphabetic"
  }, [frame, applyViewport])

  // 讲课模式：逐帧讲解，念完一步才推进下一步（高同步，复用每帧字幕）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => setPlaying(false),
    buildBeats: () =>
      chunkedBeats(
        frames.length,
        [
          "Dijkstra 求的是从一个起点到所有点的最短路。一开始，起点 A 到自己是零，其它点都先记作无穷大。核心规则只有一句话：每一轮，从还没确定的点里，挑出当前距离最小的那个。",
          "选中它、标绿，这个点的最短距离就此敲定。再去松弛它连出的每条边——如果经过它能让某个邻居更近，就更新那个邻居的距离。你看，离起点近的点正一个个被确定下来。",
          "就这样一轮一轮重复。留意有的边松弛之后，发现绕过去反而更远，那就保持原样不更新。每一步都贪心地选当前最近的点，这正是 Dijkstra 又对又快的原因。",
          "当所有点都变成绿色，算法就结束了——这时候，起点到每一个点的最短距离全都求出来了。",
        ],
        (i) => setIdx(i)
      ),
  })

  useEffect(() => {
    const STEP_MS = lecture ? 3800 : 900
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setIdx((i) => {
          if (i >= frames.length - 1) {
            playingRef.current = false
            setPlaying(false)
            return i
          }
          return i + 1
        })
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, frames.length, lecture])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setIdx((i) => Math.min(i + 1, frames.length - 1))
  }, [atEnd, frames.length])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIdx(0)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 320, display: "block", ...vp.canvasProps.style }}
        />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1} / {frames.length}
        </div>
        {/* 真·视口缩放控件：拖拽平移、滚轮/双指缩放、按钮兜底 */}
        <ViewportControls vp={vp} />
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{frame.caption}</div>}
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
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: "#10b981" }} />已确定
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />当前/更新
          </span>
        </div>
      </div>
      )}
    </div>
  )
}
