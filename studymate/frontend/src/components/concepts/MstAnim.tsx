/** 最小生成树：在同一张图上真实运行 Prim 与 Kruskal，并比较总权。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const NODES = ["A", "B", "C", "D", "E", "F"] as const
type NodeName = (typeof NODES)[number]
type Mode = "prim" | "kruskal"
type EdgeState = "accepted" | "rejected" | null

interface WeightedEdge {
  u: NodeName
  v: NodeName
  w: number
}

const EDGES: WeightedEdge[] = [
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
const POS: Record<NodeName, [number, number]> = {
  A: [0.09, 0.47],
  B: [0.3, 0.17],
  C: [0.32, 0.78],
  D: [0.58, 0.45],
  E: [0.78, 0.17],
  F: [0.88, 0.76],
}
const STEP_MS = 800

interface MstFrame {
  chosen: string[]
  visited: NodeName[]
  current: WeightedEdge | null
  currentState: EdgeState
  total: number
  done: boolean
  caption: string
}

const edgeKey = (edge: WeightedEdge) => `${edge.u}-${edge.v}`

function generatePrim(): MstFrame[] {
  const visited = new Set<NodeName>(["A"])
  const chosen: string[] = []
  const frames: MstFrame[] = []
  let total = 0
  const push = (caption: string, current: WeightedEdge | null = null, currentState: EdgeState = null, done = false) =>
    frames.push({ chosen: [...chosen], visited: [...visited], current, currentState, total, done, caption })

  push("Prim 从 A 开始：生成树暂时只有 A，每轮选择连接树内与树外的最小权边。")
  while (visited.size < NODES.length) {
    const candidates = EDGES.filter((edge) => visited.has(edge.u) !== visited.has(edge.v)).sort(
      (a, b) => a.w - b.w || edgeKey(a).localeCompare(edgeKey(b))
    )
    const best = candidates[0]
    push(`检查所有跨越割的边，最小的是 ${best.u}-${best.v}，权重 ${best.w}。`, best)
    const next = visited.has(best.u) ? best.v : best.u
    chosen.push(edgeKey(best))
    visited.add(next)
    total += best.w
    push(`接纳 ${best.u}-${best.v}，把 ${next} 加入生成树；累计权重 ${total}。`, best, "accepted")
  }
  push(`Prim 完成：选出 ${chosen.length} 条边，MST 总权重为 ${total}。`, null, null, true)
  return frames
}

function generateKruskal(): MstFrame[] {
  const index = Object.fromEntries(NODES.map((node, i) => [node, i])) as Record<NodeName, number>
  const parent = NODES.map((_, i) => i)
  const rank = NODES.map(() => 0)
  const root = (x: number) => {
    if (parent[x] !== x) parent[x] = root(parent[x])
    return parent[x]
  }
  const unite = (a: number, b: number) => {
    let ra = root(a)
    let rb = root(b)
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra]
    parent[rb] = ra
    if (rank[ra] === rank[rb]) rank[ra]++
  }
  const sorted = [...EDGES].sort((a, b) => a.w - b.w || edgeKey(a).localeCompare(edgeKey(b)))
  const chosen: string[] = []
  const visited = new Set<NodeName>()
  const frames: MstFrame[] = []
  let total = 0
  const push = (caption: string, current: WeightedEdge | null = null, currentState: EdgeState = null, done = false) =>
    frames.push({ chosen: [...chosen], visited: [...visited], current, currentState, total, done, caption })

  push(`Kruskal 先把边按权重排序：${sorted.map((edge) => `${edgeKey(edge)}(${edge.w})`).join("、")}。`)
  for (const edge of sorted) {
    if (chosen.length === NODES.length - 1) break
    const ru = root(index[edge.u])
    const rv = root(index[edge.v])
    if (ru !== rv) {
      unite(ru, rv)
      chosen.push(edgeKey(edge))
      visited.add(edge.u)
      visited.add(edge.v)
      total += edge.w
      push(`${edgeKey(edge)}(${edge.w}) 连接两个不同分量，接纳；累计权重 ${total}。`, edge, "accepted")
    } else {
      push(`${edgeKey(edge)}(${edge.w}) 的两端已经连通，加入会成环，因此跳过。`, edge, "rejected")
    }
  }
  push(`Kruskal 完成：选出 ${chosen.length} 条边，MST 总权重为 ${total}。`, null, null, true)
  return frames
}

export function MstAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const { apply: applyViewport } = vp
  const allFrames = useMemo(() => ({ prim: generatePrim(), kruskal: generateKruskal() }), [])
  const primTotal = allFrames.prim[allFrames.prim.length - 1].total
  const kruskalTotal = allFrames.kruskal[allFrames.kruskal.length - 1].total
  const [mode, setMode] = useState<Mode>("prim")
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
    const normal = dark ? "#3f3f46" : "#d4d4d8"
    const pad = 32
    const graphBottom = height - 48
    const point = (node: NodeName): [number, number] => [pad + POS[node][0] * (width - pad * 2), 24 + POS[node][1] * (graphBottom - 24)]

    for (const edge of EDGES) {
      const [x1, y1] = point(edge.u)
      const [x2, y2] = point(edge.v)
      const key = edgeKey(edge)
      const selected = frame.chosen.includes(key)
      const current = frame.current && edgeKey(frame.current) === key
      const rejected = current && frame.currentState === "rejected"
      ctx.strokeStyle = rejected ? "#ef4444" : current ? "#f59e0b" : selected ? "#10b981" : normal
      ctx.lineWidth = current || selected ? 3.5 : 1.7
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      ctx.fillStyle = dark ? "#18181b" : "#fff"
      ctx.fillRect(mx - 10, my - 9, 20, 18)
      ctx.fillStyle = rejected ? "#ef4444" : current ? "#f59e0b" : selected ? "#10b981" : muted
      ctx.font = "700 11px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(edge.w), mx, my)
    }

    for (const node of NODES) {
      const [x, y] = point(node)
      const inTree = frame.visited.includes(node)
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.22)"
      ctx.shadowBlur = 6
      ctx.fillStyle = inTree ? "#10b981" : dark ? "#6366f1" : "#818cf8"
      ctx.beginPath()
      ctx.arc(x, y, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = "#fff"
      ctx.font = "700 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(node, x, y)
    }

    ctx.fillStyle = fg
    ctx.font = "700 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(`已选 ${frame.chosen.length}/${NODES.length - 1} 条边`, 28, height - 20)
    ctx.fillStyle = frame.done ? "#10b981" : "#f59e0b"
    ctx.textAlign = "right"
    ctx.fillText(`当前总权 = ${frame.total}`, width - 28, height - 20)
  }, [applyViewport, frame])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      setMode("prim")
      setIdx(0)
    },
    buildBeats: () => [
      ...chunkedBeats(
        allFrames.prim.length,
        [
          "最小生成树要用节点数减一条边连通所有节点，同时让总权最小。Prim 从一个起点出发，维护不断扩大的树。",
          "每一轮只看一端在树内、一端在树外的跨割边，选其中最轻的一条，把新节点拉进来，而且不会形成环。",
          `重复选择直到覆盖全部节点，Prim 得到的最小生成树总权是 ${primTotal}。`,
        ],
        (value) => {
          setMode("prim")
          setIdx(value)
        }
      ),
      ...chunkedBeats(
        allFrames.kruskal.length,
        [
          "Kruskal 换一个视角：先把全部边按权重从小到大排序，再逐条扫描。",
          "一条边连接不同连通分量就接纳；两端已经连通则会成环，必须跳过。这里通常用并查集快速判断。",
          `最终 Kruskal 的总权同样是 ${kruskalTotal}。两种贪心策略过程不同，却在同一张图上得到相同的最优总权。`,
        ],
        (value) => {
          setMode("kruskal")
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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">{mode === "prim" ? "Prim" : "Kruskal"} · {idx + 1}/{frames.length}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{frame.caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{atEnd ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || atEnd}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant={mode === "prim" ? "default" : "outline"} onClick={() => switchMode("prim")}>Prim</Button>
          <Button size="sm" variant={mode === "kruskal" ? "default" : "outline"} onClick={() => switchMode("kruskal")}>Kruskal</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">Prim={primTotal} · Kruskal={kruskalTotal} · 绿=已选 · 红=成环跳过</span>
        </div>
      )}
    </div>
  )
}
