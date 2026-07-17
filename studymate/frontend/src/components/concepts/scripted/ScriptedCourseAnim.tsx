import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "../registry"
import { useCanvasViewport } from "../useCanvasViewport"
import { ViewportControls } from "../ViewportControls"
import { useLecture } from "../useLecture"
import type { ScriptedCourseSpec, ScriptedEdge, ScriptedVisualKind } from "./courseAnimSpec"

const STEP_MS = 1350

interface Point {
  x: number
  y: number
}

function automaticEdges(spec: ScriptedCourseSpec): ScriptedEdge[] {
  if (spec.edges.length) return spec.edges
  const ids = spec.nodes.map((node) => node.id)
  // A list-like visual has an unambiguous reading order. Hierarchies, cycles and
  // networks do not: inventing a binary tree or ring would teach a false relation.
  if (spec.kind !== "flow" && spec.kind !== "timeline" && spec.kind !== "memory") return []
  return ids.slice(0, -1).map((id, index) => ({ from: id, to: ids[index + 1] }))
}

function evenPositions(count: number, left: number, right: number, y: number): Point[] {
  if (count <= 1) return [{ x: (left + right) / 2, y }]
  return Array.from({ length: count }, (_, index) => ({ x: left + ((right - left) * index) / (count - 1), y }))
}

function gridColumns(width: number, count: number, maximum: number, idealCellWidth = 104): number {
  const side = Math.max(28, Math.min(58, width * 0.12))
  const usable = Math.max(1, width - side * 2)
  const minimum = count > 1 && usable >= 150 ? 2 : 1
  return Math.max(minimum, Math.min(maximum, count, Math.floor(usable / idealCellWidth)))
}

function gridPositions(count: number, width: number, top: number, bottom: number, maximum = 5, idealCellWidth = 104): Point[] {
  const side = Math.max(28, Math.min(58, width * 0.12))
  const columns = gridColumns(width, count, maximum, idealCellWidth)
  const rows = Math.ceil(count / columns)
  const result: Point[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns)
    const rowCount = Math.min(columns, count - row * columns)
    const rowPoints = evenPositions(
      rowCount,
      side + (width - side * 2) / Math.max(2, columns * 2),
      width - side - (width - side * 2) / Math.max(2, columns * 2),
      top + ((bottom - top) * (row + 0.5)) / rows
    )
    result.push(rowPoints[i % columns])
  }
  return result
}

function layoutNodes(kind: ScriptedVisualKind, count: number, width: number, height: number, edges: ScriptedEdge[], ids: string[]): Point[] {
  const side = Math.max(28, Math.min(58, width * 0.12))
  const left = side
  const right = width - side
  const top = 88
  const bottom = height - 72
  if (count === 0) return []

  if (kind === "cycle" || kind === "network") {
    const radiusX = Math.min((right - left) * 0.4, 260)
    const radiusY = Math.min((bottom - top) * 0.43, 105)
    const cx = width / 2
    const cy = (top + bottom) / 2
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
      return { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY }
    })
  }

  if (kind === "hierarchy") {
    if (edges.length === 0) return gridPositions(count, width, top, bottom, 4, 72)
    const depth = new Map<string, number>()
    const incoming = new Map(ids.map((id) => [id, 0]))
    const connected = new Set<string>()
    edges.forEach((edge) => {
      connected.add(edge.from)
      connected.add(edge.to)
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    })
    const roots = ids.filter((id) => connected.has(id) && (incoming.get(id) ?? 0) === 0)
    const queue = (roots.length ? roots : [ids[0]]).map((id) => ({ id, d: 0 }))
    while (queue.length) {
      const current = queue.shift()!
      if ((depth.get(current.id) ?? Infinity) <= current.d) continue
      depth.set(current.id, current.d)
      edges.filter((edge) => edge.from === current.id).forEach((edge) => queue.push({ id: edge.to, d: current.d + 1 }))
    }
    const connectedMaxDepth = depth.size ? Math.max(...depth.values()) : 0
    ids.filter((id) => !depth.has(id)).forEach((id) => depth.set(id, connectedMaxDepth + 1))
    const maxDepth = Math.max(...depth.values())
    const result = new Array<Point>(count)
    for (let d = 0; d <= maxDepth; d++) {
      const row = ids.map((id, index) => ({ id, index })).filter(({ id }) => depth.get(id) === d)
      const rowY = top + ((bottom - top) * d) / Math.max(1, maxDepth)
      evenPositions(row.length, left, right, rowY).forEach((point, i) => (result[row[i].index] = point))
    }
    return result
  }

  if (kind === "compare") {
    const firstCount = Math.ceil(count / 2)
    const leftPoints = evenPositions(firstCount, top, bottom, width * 0.3).map((point) => ({ x: width * 0.3, y: point.x }))
    const rightCount = count - firstCount
    const rightPoints = evenPositions(Math.max(1, rightCount), top, bottom, width * 0.7).map((point) => ({ x: width * 0.7, y: point.x }))
    return [...leftPoints, ...rightPoints.slice(0, rightCount)]
  }

  if (kind === "table" || kind === "memory") {
    return gridPositions(count, width, top, bottom, 4)
  }

  if (kind === "timeline") {
    return gridPositions(count, width, top, bottom)
  }

  return gridPositions(count, width, top, bottom)
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, label?: string, nodeRadius = 34) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const sx = from.x + Math.cos(angle) * nodeRadius
  const sy = from.y + Math.sin(angle) * nodeRadius
  const ex = to.x - Math.cos(angle) * nodeRadius
  const ey = to.y - Math.sin(angle) * nodeRadius
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - 8 * Math.cos(angle - 0.45), ey - 8 * Math.sin(angle - 0.45))
  ctx.lineTo(ex - 8 * Math.cos(angle + 0.45), ey - 8 * Math.sin(angle + 0.45))
  ctx.closePath()
  ctx.fill()
  if (label) {
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(label, (sx + ex) / 2, (sy + ey) / 2 - 3)
  }
}

function fittedLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, maxWidth: number) {
  let text = label
  while (text.length > 2 && ctx.measureText(text).width > maxWidth) text = `${text.slice(0, -2)}…`
  ctx.fillText(text, x, y)
}

export function ScriptedCourseAnim({
  spec,
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps & { spec: ScriptedCourseSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewport = useCanvasViewport(canvasRef)
  const { apply: applyViewport } = viewport
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const indexRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const edges = useMemo(() => automaticEdges(spec), [spec])

  useEffect(() => {
    indexRef.current = index
  }, [index])
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
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const border = dark ? "#52525b" : "#d4d4d8"
    const idleFill = dark ? "#27272a" : "#f4f4f5"
    const step = spec.steps[Math.min(indexRef.current, spec.steps.length - 1)]
    const active = new Set(step.active)
    const completed = new Set(spec.steps.slice(0, indexRef.current).flatMap((item) => item.active))
    const positions = layoutNodes(spec.kind, spec.nodes.length, width, height, edges, spec.nodes.map((node) => node.id))
    const byId = new Map(spec.nodes.map((node, nodeIndex) => [node.id, { node, point: positions[nodeIndex] }]))
    const headerLeft = Math.min(118, width * 0.38)
    const headerRight = Math.max(headerLeft + 48, width - Math.min(72, width * 0.24))
    const headerX = (headerLeft + headerRight) / 2
    const headerWidth = Math.max(48, headerRight - headerLeft)

    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    fittedLabel(ctx, step.title, headerX, 30, headerWidth)
    if (step.formula) {
      ctx.fillStyle = muted
      ctx.font = "11px ui-monospace, monospace"
      fittedLabel(ctx, step.formula, headerX, 49, headerWidth)
    }

    ctx.save()
    applyViewport(ctx)
    const circleNode = spec.kind === "cycle" || spec.kind === "network" || (spec.kind === "hierarchy" && edges.length === 0)
    let nearestDistance = Infinity
    if (circleNode) {
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          nearestDistance = Math.min(nearestDistance, Math.hypot(positions[a].x - positions[b].x, positions[a].y - positions[b].y))
        }
      }
    }
    const circleRadius = circleNode ? Math.max(19, Math.min(31, (nearestDistance - 10) / 2)) : 31
    for (const edge of edges) {
      const from = byId.get(edge.from)
      const to = byId.get(edge.to)
      if (!from || !to) continue
      const edgeActive = active.has(edge.from) && active.has(edge.to)
      const edgeDone = completed.has(edge.from) && completed.has(edge.to)
      const arrowNodeRadius = spec.kind === "hierarchy" && edges.length > 0 ? 29 : circleNode ? circleRadius + 3 : 34
      drawArrow(ctx, from.point, to.point, edgeActive ? "#f59e0b" : edgeDone ? "#10b981" : border, edge.label, arrowNodeRadius)
    }

    const columns = gridColumns(width, spec.nodes.length, spec.kind === "table" || spec.kind === "memory" ? 4 : 5)
    const side = Math.max(28, Math.min(58, width * 0.12))
    const nodeWidth = spec.kind === "hierarchy" && edges.length > 0 ? Math.max(92, Math.min(150, width - side * 2 - 20)) : Math.max(64, Math.min(150, (width - side * 2) / columns - 16))
    for (const { node, point } of byId.values()) {
      const isActive = active.has(node.id)
      const isDone = completed.has(node.id)
      ctx.fillStyle = isActive ? "#f59e0b" : isDone ? "#10b981" : idleFill
      ctx.strokeStyle = isActive ? "#d97706" : isDone ? "#059669" : border
      ctx.lineWidth = isActive ? 2.5 : 1.4
      ctx.beginPath()
      if (circleNode) ctx.arc(point.x, point.y, circleRadius, 0, Math.PI * 2)
      else ctx.roundRect(point.x - nodeWidth / 2, point.y - 28, nodeWidth, 56, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = isActive || isDone ? "#fff" : fg
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      fittedLabel(ctx, node.label, point.x, point.y - (node.detail ? 7 : 0), circleNode ? circleRadius * 2 - 8 : nodeWidth - 14)
      if (node.detail) {
        ctx.fillStyle = isActive || isDone ? "rgba(255,255,255,.82)" : muted
        ctx.font = "10px ui-sans-serif, system-ui"
        fittedLabel(ctx, node.detail, point.x, point.y + 12, circleNode ? circleRadius * 2 - 6 : nodeWidth - 14)
      }
    }
    ctx.restore()

    ctx.fillStyle = muted
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("橙=当前 · 绿=已完成 · 灰=待处理", 18, height - 14)
  }, [applyViewport, edges, spec])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current >= STEP_MS) {
        lastRef.current = now
        const lastIndex = spec.steps.length - 1
        const next = Math.min(indexRef.current + 1, lastIndex)
        indexRef.current = next
        setIndex(next)
        if (next >= lastIndex) {
          playingRef.current = false
          setPlaying(false)
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, spec.steps.length])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      indexRef.current = 0
      setIndex(0)
    },
    buildBeats: () =>
      spec.steps.map((step, stepIndex) => ({
        apply: () => {
          indexRef.current = stepIndex
          setIndex(stepIndex)
        },
        text: step.caption,
      })),
  })

  const atEnd = index >= spec.steps.length - 1
  const canvasHeight = spec.kind === "hierarchy" && edges.length > 0 ? 430 : 350
  const toggle = () => {
    if (atEnd) {
      indexRef.current = 0
      setIndex(0)
      lastRef.current = performance.now()
      playingRef.current = true
      setPlaying(true)
    } else {
      lastRef.current = performance.now()
      setPlaying((current) => {
        playingRef.current = !current
        return !current
      })
    }
  }
  const reset = () => {
    setPlaying(false)
    playingRef.current = false
    indexRef.current = 0
    setIndex(0)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...viewport.canvasProps}
          className="w-full"
          style={{ height: canvasHeight, display: "block", ...viewport.canvasProps.style }}
          role="img"
          aria-label={`${spec.title}，第 ${index + 1} 步：${spec.steps[index].title}`}
        />
        <ViewportControls vp={viewport} />
        <div className="absolute right-3 top-2 rounded bg-[var(--card)]/75 px-2 py-1 text-[11px] font-mono text-[var(--muted-foreground)] backdrop-blur">
          {index + 1} / {spec.steps.length}
        </div>
      </div>
      {!lecture && <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm">{spec.steps[index].caption}</div>}
      {!lecture && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
          <Button size="sm" onClick={toggle}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={playing || atEnd}
            onClick={() => {
              const next = Math.min(indexRef.current + 1, spec.steps.length - 1)
              indexRef.current = next
              setIndex(next)
            }}
          >
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">{spec.course} · 确定性分步讲解</span>
        </div>
      )}
    </div>
  )
}

// Factory is evaluated once while building the registry; returned components stay stable.
// eslint-disable-next-line react-refresh/only-export-components
export function createScriptedCourseAnim(spec: ScriptedCourseSpec) {
  function GeneratedCourseAnim(props: ConceptAnimProps) {
    return <ScriptedCourseAnim {...props} spec={spec} />
  }
  GeneratedCourseAnim.displayName = `ScriptedCourseAnim(${spec.key})`
  return GeneratedCourseAnim
}
