/** 拓扑排序：Kahn 入度队列，并提供 DAG / 有环图两种真实运行结果。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const NODES = ["A", "B", "C", "D", "E", "F"] as const
type NodeName = (typeof NODES)[number]
type Mode = "dag" | "cycle"

interface Edge {
  from: NodeName
  to: NodeName
}

const DAG_EDGES: Edge[] = [
  { from: "A", to: "C" },
  { from: "A", to: "D" },
  { from: "B", to: "D" },
  { from: "B", to: "E" },
  { from: "C", to: "F" },
  { from: "D", to: "F" },
  { from: "E", to: "F" },
]
const POS: Record<NodeName, [number, number]> = {
  A: [0.13, 0.27],
  B: [0.13, 0.72],
  C: [0.43, 0.18],
  D: [0.43, 0.5],
  E: [0.43, 0.82],
  F: [0.82, 0.5],
}
const STEP_MS = 760

interface TopoFrame {
  indegree: Record<NodeName, number>
  queue: NodeName[]
  output: NodeName[]
  current: NodeName | null
  edge: Edge | null
  enqueued: NodeName | null
  result: Mode | null
  caption: string
}

function edgesFor(mode: Mode): Edge[] {
  return mode === "dag" ? DAG_EDGES : [...DAG_EDGES, { from: "F", to: "B" }]
}

function generateFrames(mode: Mode): TopoFrame[] {
  const edges = edgesFor(mode)
  const indegree = Object.fromEntries(NODES.map((node) => [node, 0])) as Record<NodeName, number>
  for (const edge of edges) indegree[edge.to]++
  const queue = NODES.filter((node) => indegree[node] === 0)
  const output: NodeName[] = []
  const frames: TopoFrame[] = []
  const push = (caption: string, current: NodeName | null = null, edge: Edge | null = null, enqueued: NodeName | null = null, result: Mode | null = null) =>
    frames.push({ indegree: { ...indegree }, queue: [...queue], output: [...output], current, edge, enqueued, result, caption })

  push(`统计所有入度，把入度为 0 的节点放入队列：[${queue.join(", ") || "空"}]。`)
  while (queue.length > 0) {
    const current = queue.shift()!
    output.push(current)
    push(`${current} 出队并加入拓扑序列：${output.join(" → ")}。`, current)
    for (const edge of edges.filter((item) => item.from === current)) {
      indegree[edge.to]--
      let enqueued: NodeName | null = null
      if (indegree[edge.to] === 0) {
        queue.push(edge.to)
        enqueued = edge.to
      }
      push(
        `删除边 ${edge.from}→${edge.to}，${edge.to} 的入度减为 ${indegree[edge.to]}${enqueued ? `，因此 ${enqueued} 入队` : ""}。`,
        current,
        edge,
        enqueued
      )
    }
  }
  if (output.length === NODES.length) {
    push(`输出了全部 ${NODES.length} 个节点，图是 DAG；一个合法拓扑序为 ${output.join(" → ")}。`, null, null, null, "dag")
  } else {
    const blocked = NODES.filter((node) => !output.includes(node))
    push(`队列提前变空，只输出 ${output.length}/${NODES.length} 个节点；${blocked.join("、")} 仍有入度，检测到环。`, null, null, null, "cycle")
  }
  return frames
}

function drawArrow(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], color: string, width: number) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  const radius = 18
  const x1 = from[0] + Math.cos(angle) * radius
  const y1 = from[1] + Math.sin(angle) * radius
  const x2 = to[0] - Math.cos(angle) * radius
  const y2 = to[1] - Math.sin(angle) * radius
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - Math.cos(angle - Math.PI / 6) * 8, y2 - Math.sin(angle - Math.PI / 6) * 8)
  ctx.lineTo(x2 - Math.cos(angle + Math.PI / 6) * 8, y2 - Math.sin(angle + Math.PI / 6) * 8)
  ctx.closePath()
  ctx.fill()
}

export function TopologicalSortAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const { apply: applyViewport } = vp
  const allFrames = useMemo(() => ({ dag: generateFrames("dag"), cycle: generateFrames("cycle") }), [])
  const [mode, setMode] = useState<Mode>("dag")
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frames = allFrames[mode]
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
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const normalEdge = dark ? "#52525b" : "#d4d4d8"
    const graphTop = 28
    const graphHeight = 210
    const point = (node: NodeName): [number, number] => [30 + POS[node][0] * (width - 60), graphTop + POS[node][1] * graphHeight]
    const edges = edgesFor(mode)

    for (const edge of edges) {
      const hot = frame.edge?.from === edge.from && frame.edge.to === edge.to
      drawArrow(ctx, point(edge.from), point(edge.to), hot ? "#f59e0b" : normalEdge, hot ? 3 : 1.7)
    }

    for (const node of NODES) {
      const [x, y] = point(node)
      const processed = frame.output.includes(node)
      const queued = frame.queue.includes(node)
      const current = frame.current === node
      const blocked = frame.result === "cycle" && !processed
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.2)"
      ctx.shadowBlur = 6
      ctx.fillStyle = current ? "#f59e0b" : blocked ? "#ef4444" : processed ? "#10b981" : queued ? "#6366f1" : dark ? "#52525b" : "#a1a1aa"
      ctx.beginPath()
      ctx.arc(x, y, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      if (frame.enqueued === node) {
        ctx.strokeStyle = "#818cf8"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y, 23, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = "#fff"
      ctx.font = "700 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(node, x, y)
      ctx.fillStyle = blocked ? "#ef4444" : muted
      ctx.font = "10px ui-monospace, monospace"
      ctx.fillText(`入度 ${frame.indegree[node]}`, x, y + 29)
    }

    const drawStrip = (label: string, values: readonly NodeName[], y: number, color: string) => {
      ctx.fillStyle = muted
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(label, 30, y + 14)
      let x = 96
      if (values.length === 0) {
        ctx.fillText("空", x, y + 14)
        return
      }
      for (const node of values) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, 30, 28)
        ctx.fillStyle = "#fff"
        ctx.font = "700 12px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.fillText(node, x + 15, y + 14)
        x += 36
      }
    }
    drawStrip("零入度队列", frame.queue, 251, "#6366f1")
    drawStrip("拓扑输出", frame.output, 289, "#10b981")
    ctx.fillStyle = fg
  }, [applyViewport, frame, mode])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      setMode("dag")
      setIdx(0)
    },
    buildBeats: () => [
      ...chunkedBeats(
        allFrames.dag.length,
        [
          "拓扑排序只适用于有向无环图。Kahn 算法先统计每个节点的入度，把所有入度为零的节点加入队列。",
          "每次取出一个零入度节点，把它追加到结果中，再删除它的所有出边；邻居入度降到零时立即入队。",
          "当队列处理完而且输出了全部节点，就得到一个合法拓扑序，说明这张图确实是 DAG。",
        ],
        (value) => {
          setMode("dag")
          setIdx(value)
        }
      ),
      ...chunkedBeats(
        allFrames.cycle.length,
        [
          "再给图加一条从 F 回到 B 的边，形成依赖环。此时仍然运行完全相同的入度队列算法。",
          "队列会在输出全部节点之前提前变空，剩下的节点入度始终无法降到零。这正是 Kahn 算法检测有向环的方法。",
        ],
        (value) => {
          setMode("cycle")
          setIdx(value)
        }
      ),
    ],
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

  const switchMode = useCallback((next: Mode) => {
    setMode(next)
    setIdx(0)
    setPlaying(false)
    playingRef.current = false
  }, [])
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
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 330, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">{mode === "dag" ? "DAG" : "含环"} · {idx + 1}/{frames.length}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd && frame.result === "dag" ? "text-emerald-600 dark:text-emerald-400 font-medium" : atEnd ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>{frame.caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{atEnd ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || atEnd}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant={mode === "dag" ? "default" : "outline"} onClick={() => switchMode("dag")}>DAG</Button>
          <Button size="sm" variant={mode === "cycle" ? "default" : "outline"} onClick={() => switchMode("cycle")}>有环图</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=队列 · 绿=已输出 · 红=被环阻塞</span>
        </div>
      )}
    </div>
  )
}
