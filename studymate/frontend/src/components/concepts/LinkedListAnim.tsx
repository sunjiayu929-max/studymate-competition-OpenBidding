/**
 * 概念动画 · 单链表
 * 三种可切换的真实指针操作：在指定结点后插入、删除结点、原地反转。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const STEP_MS = 950
type Mode = "insert" | "delete" | "reverse"
type NodeId = "A" | "B" | "X" | "C" | "D"
type NodeState = { id: NodeId; value: number; next: NodeId | null }
type Frame = {
  nodes: NodeState[]
  layout: NodeId[]
  head: NodeId | null
  message: string
  active?: NodeId
  prev?: NodeId | null
  current?: NodeId | null
  detached?: NodeId[]
}

const cloneNodes = (nodes: NodeState[]) => nodes.map((node) => ({ ...node }))

function buildInsertFrames(): Frame[] {
  const nodes: NodeState[] = [
    { id: "A", value: 12, next: "B" },
    { id: "B", value: 27, next: "C" },
    { id: "C", value: 44, next: null },
  ]
  const layout: NodeId[] = ["A", "B", "X", "C"]
  const frames: Frame[] = [
    { nodes: cloneNodes(nodes), layout, head: "A", message: "初始链表：12 → 27 → 44" },
    { nodes: cloneNodes(nodes), layout, head: "A", active: "B", current: "B", message: "沿 next 找到插入位置 p：值为 27 的结点" },
  ]
  nodes.push({ id: "X", value: 35, next: "C" })
  frames.push({
    nodes: cloneNodes(nodes),
    layout,
    head: "A",
    active: "X",
    current: "B",
    detached: ["X"],
    message: "先令 new.next = p.next，让新结点 35 指向原后继 44",
  })
  nodes.find((node) => node.id === "B")!.next = "X"
  frames.push({ nodes: cloneNodes(nodes), layout, head: "A", active: "X", message: "再令 p.next = new：插入完成，链条没有断" })
  return frames
}

function buildDeleteFrames(): Frame[] {
  const nodes: NodeState[] = [
    { id: "A", value: 12, next: "B" },
    { id: "B", value: 27, next: "X" },
    { id: "X", value: 35, next: "C" },
    { id: "C", value: 44, next: null },
  ]
  const layout: NodeId[] = ["A", "B", "X", "C"]
  const frames: Frame[] = [
    { nodes: cloneNodes(nodes), layout, head: "A", message: "初始链表：准备删除值为 35 的结点" },
    { nodes: cloneNodes(nodes), layout, head: "A", active: "X", prev: "B", current: "X", message: "找到目标 curr=35，同时保留前驱 prev=27" },
  ]
  nodes.find((node) => node.id === "B")!.next = "C"
  frames.push({
    nodes: cloneNodes(nodes),
    layout,
    head: "A",
    active: "B",
    prev: "B",
    current: "X",
    detached: ["X"],
    message: "令 prev.next = curr.next：27 直接指向 44，目标脱链",
  })
  frames.push({
    nodes: cloneNodes(nodes).filter((node) => node.id !== "X"),
    layout,
    head: "A",
    message: "释放目标结点：删除完成，剩余链表仍连续",
  })
  return frames
}

function buildReverseFrames(): Frame[] {
  const nodes: NodeState[] = [
    { id: "A", value: 12, next: "B" },
    { id: "B", value: 27, next: "C" },
    { id: "C", value: 44, next: "D" },
    { id: "D", value: 58, next: null },
  ]
  const layout: NodeId[] = ["A", "B", "C", "D"]
  const frames: Frame[] = [
    { nodes: cloneNodes(nodes), layout, head: "A", prev: null, current: "A", message: "初始化 prev=null，curr=head；每轮只改一条 next" },
  ]
  let prev: NodeId | null = null
  let current: NodeId | null = "A"
  while (current) {
    const node = nodes.find((item) => item.id === current)!
    const next: NodeId | null = node.next
    node.next = prev
    prev = current
    current = next
    frames.push({
      nodes: cloneNodes(nodes),
      layout,
      head: "A",
      active: prev,
      prev,
      current,
      message: current
        ? `保存后继并反转一条边：prev=${nodes.find((item) => item.id === prev)!.value}，curr=${nodes.find((item) => item.id === current)!.value}`
        : "最后一条边已反转，curr=null",
    })
  }
  frames.push({ nodes: cloneNodes(nodes), layout, head: prev, prev, current: null, message: "令 head=prev：原尾结点成为新头，反转完成" })
  return frames
}

const FRAME_SETS: Record<Mode, Frame[]> = {
  insert: buildInsertFrames(),
  delete: buildDeleteFrames(),
  reverse: buildReverseFrames(),
}

const MODE_LABELS: Record<Mode, string> = { insert: "插入", delete: "删除", reverse: "反转" }

export function LinkedListAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [mode, setMode] = useState<Mode>("insert")
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const modeRef = useRef<Mode>(mode)
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const frames = FRAME_SETS[mode]
  const total = frames.length

  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    vp.apply(ctx)

    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const frame = FRAME_SETS[modeRef.current][Math.min(posRef.current, FRAME_SETS[modeRef.current].length - 1)]
    const nodeW = Math.min(82, Math.max(58, (cssW - 92) / frame.layout.length - 18))
    const nodeH = 48
    const gap = Math.min(62, Math.max(25, (cssW - 56 - nodeW * frame.layout.length) / Math.max(1, frame.layout.length - 1)))
    const totalW = nodeW * frame.layout.length + gap * (frame.layout.length - 1)
    const x0 = (cssW - totalW) / 2
    const baseY = 132
    const detached = new Set(frame.detached ?? [])
    const point = (id: NodeId) => {
      const index = frame.layout.indexOf(id)
      return { x: x0 + index * (nodeW + gap) + nodeW / 2, y: baseY + (detached.has(id) ? 88 : 0) + nodeH / 2 }
    }
    const drawArrow = (from: NodeId, to: NodeId) => {
      const a = point(from)
      const b = point(to)
      const direction = b.x >= a.x ? 1 : -1
      const startX = a.x + direction * nodeW / 2
      const endX = b.x - direction * nodeW / 2
      const angle = Math.atan2(b.y - a.y, endX - startX)
      ctx.strokeStyle = "#6366f1"
      ctx.fillStyle = "#6366f1"
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(startX, a.y)
      ctx.lineTo(endX, b.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(endX, b.y)
      ctx.lineTo(endX - 9 * Math.cos(angle - 0.48), b.y - 9 * Math.sin(angle - 0.48))
      ctx.lineTo(endX - 9 * Math.cos(angle + 0.48), b.y - 9 * Math.sin(angle + 0.48))
      ctx.closePath()
      ctx.fill()
    }

    frame.nodes.forEach((node) => {
      if (node.next && frame.nodes.some((candidate) => candidate.id === node.next)) drawArrow(node.id, node.next)
    })

    frame.nodes.forEach((node) => {
      const p = point(node.id)
      const active = node.id === frame.active
      const isDetached = detached.has(node.id)
      ctx.fillStyle = active ? "#f59e0b" : isDetached ? "rgba(239,68,68,.17)" : dark ? "rgba(99,102,241,.23)" : "rgba(99,102,241,.12)"
      ctx.strokeStyle = active ? "#f59e0b" : isDetached ? "#ef4444" : "#6366f1"
      ctx.lineWidth = active ? 3 : 2
      ctx.fillRect(p.x - nodeW / 2, p.y - nodeH / 2, nodeW, nodeH)
      ctx.strokeRect(p.x - nodeW / 2, p.y - nodeH / 2, nodeW, nodeH)
      ctx.strokeStyle = active ? "rgba(255,255,255,.55)" : dark ? "#52525b" : "#a1a1aa"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x + nodeW * 0.2, p.y - nodeH / 2)
      ctx.lineTo(p.x + nodeW * 0.2, p.y + nodeH / 2)
      ctx.stroke()
      ctx.fillStyle = active ? "#fff" : fg
      ctx.font = "600 15px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(node.value), p.x - nodeW * 0.14, p.y)
      ctx.font = "14px ui-monospace, monospace"
      ctx.fillText(node.next ? "•" : "∅", p.x + nodeW * 0.35, p.y)
      if (isDetached) {
        ctx.fillStyle = "#ef4444"
        ctx.font = "11px ui-sans-serif, system-ui"
        ctx.fillText(modeRef.current === "delete" ? "已脱链" : "new", p.x, p.y + nodeH / 2 + 18)
      }
    })

    const drawPointer = (id: NodeId | null | undefined, label: string, color: string, offset: number) => {
      if (!id) return
      const p = point(id)
      ctx.fillStyle = color
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(label, p.x + offset, p.y - nodeH / 2 - 14)
      ctx.beginPath()
      ctx.moveTo(p.x + offset, p.y - nodeH / 2 - 9)
      ctx.lineTo(p.x + offset - 5, p.y - nodeH / 2 - 1)
      ctx.lineTo(p.x + offset + 5, p.y - nodeH / 2 - 1)
      ctx.closePath()
      ctx.fill()
    }
    drawPointer(frame.head, "head", "#10b981", -18)
    drawPointer(frame.prev, "prev", "#8b5cf6", 8)
    drawPointer(frame.current, "curr", "#3b82f6", 25)

    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`单链表 · ${MODE_LABELS[modeRef.current]}`, cssW / 2, 35)
    ctx.fillStyle = muted
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.fillText(frame.message, cssW / 2, cssH - 22)
  }, [vp])

  useEffect(() => {
    const tick = (now: number) => {
      const currentTotal = FRAME_SETS[modeRef.current].length
      if (playingRef.current && now - lastRef.current >= STEP_MS) {
        lastRef.current = now
        if (posRef.current < currentTotal - 1) setPos((value) => value + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= total - 1
  const selectMode = useCallback((nextMode: Mode) => {
    setPlaying(false)
    playingRef.current = false
    modeRef.current = nextMode
    setMode(nextMode)
    setPos(0)
    posRef.current = 0
  }, [])
  const reset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const step = useCallback(() => {
    if (posRef.current < FRAME_SETS[modeRef.current].length - 1) setPos((value) => value + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (posRef.current >= FRAME_SETS[modeRef.current].length - 1) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
    } else setPlaying((value) => !value)
  }, [])

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
      const currentMode = modeRef.current
      const sentences: Record<Mode, string[]> = {
        insert: [
          "单链表的结点不必连续存放，每个结点除了数据，还保存指向下一个结点的 next。现在要在二十七后插入三十五。",
          "先沿 next 找到插入位置。关键顺序是先让 new.next 指向原后继；如果先覆盖 p.next，原来的后半条链就可能丢失。",
          "再令 p.next 指向新结点，插入完成。已知位置时只改两条指针，所以是 O(1)；若要先查找位置，查找本身是 O(n)。",
        ],
        delete: [
          "删除单链表中的结点时，需要同时记住目标 curr 和它的前驱 prev。这里目标是值为三十五的结点。",
          "让 prev.next 直接等于 curr.next，前驱就跨过目标指向目标的后继。目标结点因此从可达链条中脱离。",
          "最后释放脱链结点。已知前驱时修改是 O(1)，但从头查找目标或前驱通常需要 O(n)。",
        ],
        reverse: [
          "原地反转单链表只需要 prev、curr 和临时 next 三个指针。开始时 prev 为空，curr 指向头结点。",
          "每轮先保存 curr.next，随后把 curr.next 改为 prev，再让 prev 和 curr 各向前移动一步。保存后继必须发生在改边之前。",
          "所有边都反向后，curr 为空而 prev 指向原来的尾结点。把 head 设为 prev 即完成反转，时间 O(n)，额外空间 O(1)。",
        ],
      }
      return chunkedBeats(FRAME_SETS[currentMode].length, sentences[currentMode], (index) => setPos(Math.min(index, FRAME_SETS[currentMode].length - 1)))
    },
  })

  const caption = done ? `${MODE_LABELS[mode]}完成：${frames[pos].message}` : frames[pos].message

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 330, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">步骤 {pos + 1} / {total}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="px-4 pt-3 flex gap-2 border-t border-[var(--border)] bg-[var(--muted)]/30">
          {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
            <button key={key} type="button" onClick={() => selectMode(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${mode === key ? "bg-indigo-600 border-indigo-600 text-white" : "border-[var(--border)] hover:bg-[var(--muted)]"}`}>{MODE_LABELS[key]}</button>
          ))}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{done ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || done}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">方框左侧=数据 · 右侧=next</span>
        </div>
      )}
    </div>
  )
}
