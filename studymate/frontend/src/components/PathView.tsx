import { useCallback, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { motion } from "framer-motion"
import { CheckCircle2, Circle, ChevronRight } from "lucide-react"

export interface PathNode {
  id: string
  position: { x: number; y: number }
  data: { title: string; desc: string; depth: number }
  type?: string
}

export interface PathEdge {
  id: string
  source: string
  target: string
  animated?: boolean
}

interface PathViewProps {
  nodes: PathNode[]
  edges: PathEdge[]
}

const PATH_COLUMNS = 4
const PATH_NODE_WIDTH = 230
const PATH_NODE_HEIGHT = 80
const PATH_HORIZONTAL_GAP = 70
const PATH_VERTICAL_GAP = 90

function snakePosition(index: number) {
  const row = Math.floor(index / PATH_COLUMNS)
  const offset = index % PATH_COLUMNS
  const column = row % 2 === 0 ? offset : PATH_COLUMNS - 1 - offset
  return {
    x: column * (PATH_NODE_WIDTH + PATH_HORIZONTAL_GAP),
    y: row * (PATH_NODE_HEIGHT + PATH_VERTICAL_GAP),
  }
}

function sourcePosition(current: { x: number; y: number }, next?: { x: number; y: number }) {
  if (!next) return Position.Right
  if (next.y > current.y) return Position.Bottom
  return next.x < current.x ? Position.Left : Position.Right
}

function targetPosition(current: { x: number; y: number }, previous?: { x: number; y: number }) {
  if (!previous) return Position.Left
  if (previous.y < current.y) return Position.Top
  return previous.x > current.x ? Position.Right : Position.Left
}

/** 自定义节点：带 depth 序号 + 完成状态切换 */
function StageNode({ id, data }: NodeProps) {
  const d = data as unknown as {
    title: string
    desc: string
    depth: number
    done?: boolean
    onToggle?: (id: string) => void
    targetPosition?: Position
    sourcePosition?: Position
  }
  const done = d.done
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: d.depth * 0.05 }}
      onClick={() => d.onToggle?.(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          d.onToggle?.(id)
        }
      }}
      role="button"
      tabIndex={0}
      data-path-depth={d.depth}
      aria-pressed={done}
      aria-label={`${d.title}，阶段 ${d.depth + 1}，${done ? "已完成" : "待完成"}`}
      className={`paper-lift relative w-[230px] cursor-pointer rounded-[18px] border px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/35 ${
        done
          ? "border-[#B9C7BC] bg-[#E9EEE6]"
          : "border-[#D8C9A8] bg-[#FFFEFA]"
      }`}
    >
      <Handle type="target" position={d.targetPosition ?? Position.Left} className="!size-2.5 !border-2 !border-[#FFFEFA] !bg-[#B1842C]" />
      <div className="flex items-start gap-2">
        {done ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#557052]" />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-[#B1842C]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] mb-0.5">
            阶段 {d.depth + 1}
          </div>
          <div className={`text-sm font-semibold leading-tight ${done ? "line-through opacity-70" : ""}`}>
            {d.title}
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1 line-clamp-2">{d.desc}</div>
        </div>
      </div>
      <Handle type="source" position={d.sourcePosition ?? Position.Right} className="!size-2.5 !border-2 !border-[#FFFEFA] !bg-[#B1842C]" />
    </motion.div>
  )
}

const nodeTypes = { stage: StageNode }

export function PathView({ nodes, edges }: PathViewProps) {
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setDoneSet((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const orderedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.data.depth - b.data.depth || a.id.localeCompare(b.id)),
    [nodes],
  )

  const rfNodes: Node[] = useMemo(
    () => {
      const positions = orderedNodes.map((_, index) => snakePosition(index))
      return orderedNodes.map((node, index) => ({
        id: node.id,
        position: positions[index],
        type: "stage",
        data: {
          ...node.data,
          depth: index,
          done: doneSet.has(node.id),
          onToggle: toggle,
          targetPosition: targetPosition(positions[index], positions[index - 1]),
          sourcePosition: sourcePosition(positions[index], positions[index + 1]),
        },
      }))
    },
    [orderedNodes, doneSet, toggle]
  )

  const rfEdges: Edge[] = useMemo(
    () => {
      const existing = new Map(edges.map((edge) => [`${edge.source}->${edge.target}`, edge]))
      return orderedNodes.slice(1).map((node, index) => {
        const previous = orderedNodes[index]
        const edge = existing.get(`${previous.id}->${node.id}`)
        return {
          id: edge?.id ?? `e-${previous.id}-${node.id}`,
          source: previous.id,
          target: node.id,
          animated: edge?.animated ?? true,
          style: { stroke: "#B1842C", strokeWidth: 2 },
        }
      })
    },
    [edges, orderedNodes]
  )

  const total = nodes.length
  const doneCount = doneSet.size
  const progress = total ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="flex h-[min(62dvh,560px)] min-h-[420px] flex-col overflow-hidden rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3.5 py-3 text-xs text-[var(--muted-foreground)]">
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <span className="shrink-0">
            {total} 个阶段 · 已完成 <strong className="text-[#557052]">{doneCount}</strong> · {progress}%
          </span>
          <span className="h-1.5 min-w-20 max-w-52 flex-1 overflow-hidden rounded-full bg-[#E2DED4]" aria-hidden>
            <span className="block h-full rounded-full bg-[#718B6A] transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px]">
          点击节点切换完成 <ChevronRight className="size-3" />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#F8F6F0]">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#CFC8B9" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
