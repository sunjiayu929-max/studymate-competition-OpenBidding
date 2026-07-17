/** 二叉树前序 / 中序 / 后序 / 层序遍历，展示真实栈或队列状态。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

type TraversalMode = "preorder" | "inorder" | "postorder" | "levelorder"

interface DemoNode {
  label: string
  left: number | null
  right: number | null
}

const TREE: DemoNode[] = [
  { label: "A", left: 1, right: 2 },
  { label: "B", left: 3, right: 4 },
  { label: "C", left: 5, right: 6 },
  { label: "D", left: null, right: null },
  { label: "E", left: 7, right: 8 },
  { label: "F", left: null, right: null },
  { label: "G", left: null, right: null },
  { label: "H", left: null, right: null },
  { label: "I", left: null, right: null },
]

interface TraversalFrame {
  visited: number[]
  current: number | null
  frontier: string[]
  caption: string
}

const META: Record<TraversalMode, { name: string; order: string; structure: string; lecture: string[] }> = {
  preorder: {
    name: "前序",
    order: "根 → 左 → 右",
    structure: "栈",
    lecture: [
      "前序遍历的顺序是根、左、右。迭代写法从栈中弹出一个节点就立刻访问。",
      "为了让左孩子先被处理，要先把右孩子压栈，再把左孩子压栈。",
      "栈后进先出，所以左子树会完整走完，再回到右子树。",
      "最终得到前序序列，它常用于复制树或输出树的前缀表达。",
    ],
  },
  inorder: {
    name: "中序",
    order: "左 → 根 → 右",
    structure: "栈",
    lecture: [
      "中序遍历的顺序是左、根、右。先沿左孩子不断向下，并把路上的节点压栈。",
      "走到空位置后弹出栈顶，这时它的左子树已经处理完，可以访问这个节点。",
      "随后转向它的右孩子，再重复一路向左的过程。",
      "二叉搜索树的中序遍历结果正好是从小到大的有序序列。",
    ],
  },
  postorder: {
    name: "后序",
    order: "左 → 右 → 根",
    structure: "标记栈",
    lecture: [
      "后序遍历必须先访问左右子树，最后才访问根节点。这里用带回访标记的栈来实现。",
      "第一次弹出节点时先不访问，而是把带回访标记的自己、右孩子和左孩子依次压栈。",
      "带标记的节点第二次弹出时，它的两个子树都已处理完，此时才加入结果。",
      "后序遍历适合删除整棵树，也常用于自底向上计算子树信息。",
    ],
  },
  levelorder: {
    name: "层序",
    order: "逐层从左到右",
    structure: "队列",
    lecture: [
      "层序遍历使用先进先出的队列。根节点先入队，再从队首依次取出。",
      "访问一个节点后，把它的左、右孩子按顺序加入队尾。",
      "同一层的节点会先于下一层出队，所以结果天然按深度逐层展开。",
      "这就是树上的广度优先搜索，求最短层数时尤其常用。",
    ],
  },
}

function labels(ids: number[]): string[] {
  return ids.map((id) => TREE[id].label)
}

function buildFrames(mode: TraversalMode): TraversalFrame[] {
  const frames: TraversalFrame[] = []
  const visited: number[] = []
  const push = (caption: string, current: number | null, frontier: string[]) =>
    frames.push({ visited: [...visited], current, frontier: [...frontier], caption })

  if (mode === "preorder") {
    const stack = [0]
    push("根节点 A 入栈，准备开始前序遍历", null, labels(stack))
    while (stack.length) {
      const id = stack.pop() as number
      push(`${TREE[id].label} 从栈顶弹出`, id, labels(stack))
      visited.push(id)
      push(`访问 ${TREE[id].label}，加入遍历结果`, id, labels(stack))
      const node = TREE[id]
      if (node.right !== null) stack.push(node.right)
      if (node.left !== null) stack.push(node.left)
      if (node.left !== null || node.right !== null) {
        push(`先压右、再压左，保证 ${node.left !== null ? TREE[node.left].label : "左子树"} 下一步先出栈`, id, labels(stack))
      }
    }
  } else if (mode === "inorder") {
    const stack: number[] = []
    let current: number | null = 0
    push("从根开始，先一路向左", current, labels(stack))
    while (current !== null || stack.length) {
      while (current !== null) {
        stack.push(current)
        push(`${TREE[current].label} 入栈，继续寻找左孩子`, current, labels(stack))
        current = TREE[current].left
      }
      const id = stack.pop() as number
      push(`左侧到底，弹出 ${TREE[id].label}`, id, labels(stack))
      visited.push(id)
      push(`访问 ${TREE[id].label}，然后转向右孩子`, id, labels(stack))
      current = TREE[id].right
    }
  } else if (mode === "postorder") {
    const stack: Array<{ id: number; expanded: boolean }> = [{ id: 0, expanded: false }]
    const stackLabels = () => stack.map((item) => `${TREE[item.id].label}${item.expanded ? "↩" : ""}`)
    push("根节点 A 入标记栈；↩ 表示下次弹出时可以访问", null, stackLabels())
    while (stack.length) {
      const item = stack.pop() as { id: number; expanded: boolean }
      const node = TREE[item.id]
      if (item.expanded) {
        push(`${node.label} 带回访标记弹出，左右子树均已完成`, item.id, stackLabels())
        visited.push(item.id)
        push(`现在访问 ${node.label}`, item.id, stackLabels())
      } else {
        push(`${node.label} 首次弹出，暂不访问`, item.id, stackLabels())
        stack.push({ id: item.id, expanded: true })
        if (node.right !== null) stack.push({ id: node.right, expanded: false })
        if (node.left !== null) stack.push({ id: node.left, expanded: false })
        push(`压入 ${node.label}↩、右孩子、左孩子`, item.id, stackLabels())
      }
    }
  } else {
    const queue = [0]
    push("根节点 A 进入队列", null, labels(queue))
    while (queue.length) {
      const id = queue.shift() as number
      push(`${TREE[id].label} 从队首出队`, id, labels(queue))
      visited.push(id)
      push(`访问 ${TREE[id].label}`, id, labels(queue))
      const node = TREE[id]
      if (node.left !== null) queue.push(node.left)
      if (node.right !== null) queue.push(node.right)
      if (node.left !== null || node.right !== null) push(`${TREE[id].label} 的孩子依次加入队尾`, id, labels(queue))
    }
  }

  push(`${META[mode].name}遍历完成：${labels(visited).join(" → ")}`, null, [])
  return frames
}

const POS: Array<[number, number]> = [
  [0.5, 0.08],
  [0.27, 0.35],
  [0.73, 0.35],
  [0.12, 0.68],
  [0.4, 0.68],
  [0.62, 0.68],
  [0.86, 0.68],
  [0.34, 0.96],
  [0.47, 0.96],
]

export function TreeTraversalAnim({
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [mode, setMode] = useState<TraversalMode>("preorder")
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const frames = useMemo(() => buildFrames(mode), [mode])
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
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    vp.apply(ctx)
    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const edge = dark ? "#52525b" : "#d4d4d8"
    const panelX = w * 0.72
    const treeW = panelX - 22
    const treeTop = 52
    const treeH = 235
    const point = (id: number): [number, number] => [22 + POS[id][0] * (treeW - 44), treeTop + POS[id][1] * treeH]

    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`${META[mode].name}遍历：${META[mode].order}`, treeW / 2, 27)
    TREE.forEach((node, id) => {
      const [x, y] = point(id)
      for (const child of [node.left, node.right]) {
        if (child === null) continue
        const [cx, cy] = point(child)
        ctx.strokeStyle = edge
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(cx, cy)
        ctx.stroke()
      }
    })
    const visited = new Set(frame.visited)
    TREE.forEach((node, id) => {
      const [x, y] = point(id)
      const waiting = frame.frontier.some((item) => item.startsWith(node.label))
      ctx.fillStyle = frame.current === id ? "#f59e0b" : visited.has(id) ? "#10b981" : waiting ? "#6366f1" : dark ? "#3f3f46" : "#e4e4e7"
      ctx.beginPath()
      ctx.arc(x, y, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = frame.current === id ? "#fbbf24" : edge
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = frame.current === id || visited.has(id) || waiting ? "#fff" : fg
      ctx.font = "700 14px ui-sans-serif, system-ui"
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(node.label, x, y)
    })

    ctx.strokeStyle = edge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(panelX, 42)
    ctx.lineTo(panelX, h - 20)
    ctx.stroke()
    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(mode === "levelorder" ? "队列（队首在上）" : "栈（栈顶在上）", panelX + 16, 67)
    const display = mode === "levelorder" ? frame.frontier : [...frame.frontier].reverse()
    display.slice(0, 8).forEach((item, i) => {
      const y = 83 + i * 29
      ctx.fillStyle = dark ? "rgba(99,102,241,.25)" : "rgba(99,102,241,.13)"
      ctx.fillRect(panelX + 16, y, Math.max(58, w - panelX - 32), 23)
      ctx.strokeStyle = "#6366f1"
      ctx.strokeRect(panelX + 16, y, Math.max(58, w - panelX - 32), 23)
      ctx.fillStyle = fg
      ctx.font = "600 12px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(item, panelX + 16 + Math.max(58, w - panelX - 32) / 2, y + 11.5)
    })
    if (!display.length) {
      ctx.fillStyle = muted
      ctx.font = "12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText("（空）", panelX + 16, 99)
    }
    ctx.fillStyle = muted
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("访问结果", panelX + 16, h - 70)
    ctx.fillStyle = "#10b981"
    ctx.font = "600 12px ui-monospace, monospace"
    ctx.fillText(labels(frame.visited).join(" → ") || "—", panelX + 16, h - 46)
  }, [frame, mode, vp])

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
    buildBeats: () => chunkedBeats(frames.length, META[mode].lecture, setIdx),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > 720) {
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
  }, [draw, frames.length])

  const chooseMode = (next: TraversalMode) => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
    setMode(next)
  }
  const reset = () => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
  }
  const toggle = () => {
    if (atEnd) {
      setIdx(0)
      lastRef.current = performance.now()
      setPlaying(true)
    } else setPlaying((p) => !p)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 370, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute right-3 top-2 rounded bg-[var(--card)]/75 px-2 py-1 text-[11px] font-mono text-[var(--muted-foreground)] backdrop-blur">
          {idx + 1} / {frames.length}
        </div>
      </div>
      {!lecture && <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm">{frame.caption}</div>}
      {!lecture && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
          {(["preorder", "inorder", "postorder", "levelorder"] as TraversalMode[]).map((item) => (
            <Button key={item} size="sm" variant={mode === item ? "default" : "outline"} onClick={() => chooseMode(item)}>
              {META[item].name}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--border)]" />
          <Button size="sm" onClick={toggle}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" disabled={playing || atEnd} onClick={() => setIdx((i) => Math.min(i + 1, frames.length - 1))}>
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=待处理 · 橙=当前 · 绿=已访问</span>
        </div>
      )}
    </div>
  )
}
