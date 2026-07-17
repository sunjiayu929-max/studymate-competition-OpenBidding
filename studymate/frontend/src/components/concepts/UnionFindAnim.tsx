/** 并查集：按秩合并，并显式演示 find 的路径压缩。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const SIZE = 8
const STEP_MS = 720

type Action = "start" | "inspect" | "union" | "find" | "compress" | "done"

interface UfFrame {
  parent: number[]
  rank: number[]
  active: number[]
  path: number[]
  compressed: number[]
  action: Action
  caption: string
}

function generateFrames(): UfFrame[] {
  const parent = Array.from({ length: SIZE }, (_, i) => i)
  const rank = Array(SIZE).fill(0) as number[]
  const frames: UfFrame[] = []
  const push = (action: Action, caption: string, active: number[] = [], path: number[] = [], compressed: number[] = []) =>
    frames.push({ parent: [...parent], rank: [...rank], active, path, compressed, action, caption })
  const root = (x: number) => {
    let current = x
    while (parent[current] !== current) current = parent[current]
    return current
  }

  push("start", "开始时每个元素自成一个集合：parent[x]=x，秩 rank 全为 0。")
  const operations: [number, number][] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [4, 6],
    [0, 4],
  ]
  for (const [a, b] of operations) {
    const ra = root(a)
    const rb = root(b)
    push("inspect", `union(${a}, ${b})：先找到根 ${ra} 和 ${rb}，比较两棵树的秩。`, [a, b, ra, rb])
    if (ra === rb) {
      push("union", `${a} 与 ${b} 已在同一集合，无需合并。`, [ra])
      continue
    }
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb
      push("union", `rank[${ra}]=${rank[ra]} 更小，把根 ${ra} 接到根 ${rb} 下。`, [ra, rb])
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra
      push("union", `rank[${rb}]=${rank[rb]} 更小，把根 ${rb} 接到根 ${ra} 下。`, [ra, rb])
    } else {
      parent[rb] = ra
      rank[ra]++
      push("union", `两根同秩：把 ${rb} 接到 ${ra} 下，并把 rank[${ra}] 增为 ${rank[ra]}。`, [ra, rb])
    }
  }

  const target = 7
  const path: number[] = [target]
  let current = target
  push("find", `执行 find(${target})：沿父指针向上寻找代表元。`, [target], [...path])
  while (parent[current] !== current) {
    current = parent[current]
    path.push(current)
    push("find", `沿 parent 到 ${current}，当前路径为 ${path.join(" → ")}。`, [current], [...path])
  }
  const representative = current
  for (const node of path.slice(0, -1)) {
    if (parent[node] === representative) continue
    parent[node] = representative
    push(
      "compress",
      `路径压缩：把 ${node} 直接指向根 ${representative}，以后 find 会更快。`,
      [node, representative],
      [...path],
      [node]
    )
  }
  push("done", `find(${target})=${representative}。按秩合并控制树高，路径压缩把访问过的链拉平。`, [representative], [], path.slice(0, -1))
  return frames
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const radius = 17
  const sx = x1 + Math.cos(angle) * radius
  const sy = y1 + Math.sin(angle) * radius
  const ex = x2 - Math.cos(angle) * radius
  const ey = y2 - Math.sin(angle) * radius
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - Math.cos(angle - Math.PI / 6) * 8, ey - Math.sin(angle - Math.PI / 6) * 8)
  ctx.lineTo(ex - Math.cos(angle + Math.PI / 6) * 8, ey - Math.sin(angle + Math.PI / 6) * 8)
  ctx.closePath()
  ctx.fill()
}

export function UnionFindAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const { apply: applyViewport } = vp
  const frames = useMemo(() => generateFrames(), [])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
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
    const border = dark ? "#3f3f46" : "#d4d4d8"
    const box = Math.min(43, (width - 84) / SIZE)
    const tableLeft = (width - box * SIZE) / 2

    ctx.fillStyle = fg
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillText("元素", tableLeft - 8, 30)
    ctx.fillText("parent", tableLeft - 8, 60)
    ctx.fillText("rank", tableLeft - 8, 90)
    for (let i = 0; i < SIZE; i++) {
      const x = tableLeft + i * box
      const hot = frame.active.includes(i)
      const compressed = frame.compressed.includes(i)
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = hot ? (compressed ? "#10b981" : "#f59e0b") : dark ? "#27272a" : "#fafafa"
        ctx.strokeStyle = border
        ctx.lineWidth = 1
        ctx.fillRect(x, 15 + row * 30, box, 30)
        ctx.strokeRect(x, 15 + row * 30, box, 30)
      }
      ctx.fillStyle = hot ? "#fff" : fg
      ctx.font = "600 12px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.fillText(String(i), x + box / 2, 30)
      ctx.fillText(String(frame.parent[i]), x + box / 2, 60)
      ctx.fillText(String(frame.rank[i]), x + box / 2, 90)
    }

    const depthOf = (node: number) => {
      let depth = 0
      let current = node
      const seen = new Set<number>()
      while (frame.parent[current] !== current && !seen.has(current)) {
        seen.add(current)
        current = frame.parent[current]
        depth++
      }
      return depth
    }
    const xOf = (node: number) => 40 + (node * (width - 80)) / (SIZE - 1)
    const yOf = (node: number) => 165 + depthOf(node) * 48
    ctx.fillStyle = muted
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("父指针森林（箭头指向根）", 30, 122)

    for (let node = 0; node < SIZE; node++) {
      const parent = frame.parent[node]
      if (parent === node) continue
      const onPath = frame.path.includes(node) && frame.path.includes(parent)
      arrow(ctx, xOf(node), yOf(node), xOf(parent), yOf(parent), onPath ? "#f59e0b" : border)
    }
    for (let node = 0; node < SIZE; node++) {
      const root = frame.parent[node] === node
      const hot = frame.active.includes(node)
      const compressed = frame.compressed.includes(node)
      const onPath = frame.path.includes(node)
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.2)"
      ctx.shadowBlur = 5
      ctx.fillStyle = compressed ? "#10b981" : hot ? "#f59e0b" : root ? "#6366f1" : onPath ? "#fbbf24" : dark ? "#52525b" : "#a1a1aa"
      ctx.beginPath()
      ctx.arc(xOf(node), yOf(node), 17, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = "#fff"
      ctx.font = "700 12px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(node), xOf(node), yOf(node))
      if (root) {
        ctx.fillStyle = "#10b981"
        ctx.font = "10px ui-sans-serif, system-ui"
        ctx.fillText("root", xOf(node), yOf(node) - 25)
      }
    }
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
    },
    buildBeats: () =>
      chunkedBeats(
        frames.length,
        [
          "并查集维护一组互不相交的集合。开始时每个元素都是自己的父节点，也就是八棵只有一个节点的小树。",
          "union 会先找到两边的根，再按秩合并。矮树接到高树下面；两棵树同秩时任选一棵作根，并把它的秩加一。",
          "连续合并后，所有元素进入同一集合。按秩合并避免树退化成很长的链。",
          "现在对元素七执行 find。沿父指针找到根之后，把访问路径上的节点直接连到根，这一步叫路径压缩。",
          "按秩合并和路径压缩一起使用，让并查集的均摊操作时间几乎可以看成常数，常用于连通性与最小生成树。",
        ],
        setIdx
      ),
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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">{idx + 1}/{frames.length}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{frame.caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{atEnd ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || atEnd}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">紫=根 · 橙=查找路径 · 绿=已压缩</span>
        </div>
      )}
    </div>
  )
}
