/** 红黑树：真实 BST 插入与 CLRS 染色 / 旋转修复。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

type NodeColor = "red" | "black"
type Action = "start" | "compare" | "insert" | "recolor" | "rotate" | "done"

interface RbNode {
  value: number
  color: NodeColor
  parent: number | null
  left: number | null
  right: number | null
}

type RbTree = Record<number, RbNode>

interface RbFrame {
  tree: RbTree
  root: number | null
  active: number[]
  action: Action
  caption: string
}

const INSERTION = [10, 5, 15, 1, 6, 7, 8]

function cloneTree(tree: RbTree): RbTree {
  const copy: RbTree = {}
  Object.keys(tree).forEach((key) => {
    const id = Number(key)
    copy[id] = { ...tree[id] }
  })
  return copy
}

function buildFrames(): RbFrame[] {
  const tree: RbTree = {}
  let root: number | null = null
  const frames: RbFrame[] = []
  const colorOf = (id: number | null): NodeColor => (id === null ? "black" : tree[id].color)
  const push = (caption: string, action: Action, active: Array<number | null> = []) => {
    frames.push({ tree: cloneTree(tree), root, active: active.filter((id): id is number => id !== null), action, caption })
  }
  const rotateLeft = (x: number) => {
    const y = tree[x].right
    if (y === null) return
    tree[x].right = tree[y].left
    if (tree[y].left !== null) tree[tree[y].left as number].parent = x
    tree[y].parent = tree[x].parent
    if (tree[x].parent === null) root = y
    else if (x === tree[tree[x].parent].left) tree[tree[x].parent].left = y
    else tree[tree[x].parent].right = y
    tree[y].left = x
    tree[x].parent = y
  }
  const rotateRight = (y: number) => {
    const x = tree[y].left
    if (x === null) return
    tree[y].left = tree[x].right
    if (tree[x].right !== null) tree[tree[x].right as number].parent = y
    tree[x].parent = tree[y].parent
    if (tree[y].parent === null) root = x
    else if (y === tree[tree[y].parent].left) tree[tree[y].parent].left = x
    else tree[tree[y].parent].right = x
    tree[x].right = y
    tree[y].parent = x
  }

  push(`按顺序插入 ${INSERTION.join("、")}，新节点先染红，再修复红红冲突`, "start")
  for (const value of INSERTION) {
    let parent: number | null = null
    let current = root
    while (current !== null) {
      parent = current
      push(`BST 比较：${value} ${value < current ? "<" : ">"} ${current}，向${value < current ? "左" : "右"}走`, "compare", [current])
      current = value < current ? tree[current].left : tree[current].right
    }
    tree[value] = { value, color: "red", parent, left: null, right: null }
    if (parent === null) root = value
    else if (value < parent) tree[parent].left = value
    else tree[parent].right = value
    push(`${value} 按 BST 规则落位，并先染成红色`, "insert", [value, parent])

    let z = value
    while (true) {
      const p = tree[z].parent
      if (p === null || colorOf(p) === "black") break
      const g = tree[p].parent
      if (g === null) break

      if (p === tree[g].left) {
        const uncle = tree[g].right
        if (colorOf(uncle) === "red") {
          push(`父节点 ${p} 和叔叔 ${uncle} 都是红色：先做变色`, "recolor", [z, p, uncle, g])
          tree[p].color = "black"
          if (uncle !== null) tree[uncle].color = "black"
          tree[g].color = "red"
          push(`父与叔染黑、祖父 ${g} 染红，把冲突向上移动`, "recolor", [p, uncle, g])
          z = g
          continue
        }
        if (z === tree[p].right) {
          push(`叔叔为黑，且 ${z} 是内侧右孩子：先绕父节点 ${p} 左旋`, "rotate", [z, p, g])
          z = p
          rotateLeft(z)
          push(`左旋后转成外侧 LL 形态`, "rotate", [z, tree[z].parent])
        }
        const newParent = tree[z].parent as number
        const newGrand = tree[newParent].parent as number
        tree[newParent].color = "black"
        tree[newGrand].color = "red"
        push(`父节点 ${newParent} 染黑、祖父 ${newGrand} 染红`, "recolor", [newParent, newGrand])
        rotateRight(newGrand)
        push(`绕祖父 ${newGrand} 右旋，消除红红冲突`, "rotate", [newParent, newGrand])
      } else {
        const uncle = tree[g].left
        if (colorOf(uncle) === "red") {
          push(`父节点 ${p} 和叔叔 ${uncle} 都是红色：先做变色`, "recolor", [z, p, uncle, g])
          tree[p].color = "black"
          if (uncle !== null) tree[uncle].color = "black"
          tree[g].color = "red"
          push(`父与叔染黑、祖父 ${g} 染红，把冲突向上移动`, "recolor", [p, uncle, g])
          z = g
          continue
        }
        if (z === tree[p].left) {
          push(`叔叔为黑，且 ${z} 是内侧左孩子：先绕父节点 ${p} 右旋`, "rotate", [z, p, g])
          z = p
          rotateRight(z)
          push(`右旋后转成外侧 RR 形态`, "rotate", [z, tree[z].parent])
        }
        const newParent = tree[z].parent as number
        const newGrand = tree[newParent].parent as number
        tree[newParent].color = "black"
        tree[newGrand].color = "red"
        push(`父节点 ${newParent} 染黑、祖父 ${newGrand} 染红`, "recolor", [newParent, newGrand])
        rotateLeft(newGrand)
        push(`绕祖父 ${newGrand} 左旋，消除红红冲突`, "rotate", [newParent, newGrand])
      }
    }

    if (root !== null && tree[root].color !== "black") {
      tree[root].color = "black"
      push(`根节点 ${root} 必须保持黑色`, "recolor", [root])
    }
    push(`插入 ${value} 修复完成：不存在相邻红节点`, "done", [value])
  }
  push("全部插入完成：根为黑、红节点孩子为黑，任一路径黑高相同 ✓", "done", [root])
  return frames
}

function layout(tree: RbTree, root: number | null) {
  const positions: Record<number, { column: number; depth: number }> = {}
  let column = 0
  let maxDepth = 0
  const visit = (id: number | null, depth: number) => {
    if (id === null) return
    visit(tree[id].left, depth + 1)
    positions[id] = { column: column++, depth }
    maxDepth = Math.max(maxDepth, depth)
    visit(tree[id].right, depth + 1)
  }
  visit(root, 0)
  return { positions, columns: column, maxDepth }
}

export function RedBlackTreeAnim({
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const frames = useMemo(() => buildFrames(), [])
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
    const actionText: Record<Action, string> = {
      start: "准备插入",
      compare: "BST 定位",
      insert: "红色落位",
      recolor: "重新染色",
      rotate: "旋转修复",
      done: "性质恢复",
    }
    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`红黑树插入 · ${actionText[frame.action]}`, w / 2, 28)
    ctx.fillStyle = muted
    ctx.font = "11px ui-monospace, monospace"
    ctx.fillText(`序列：${INSERTION.join(" → ")}`, w / 2, 47)

    const { positions, columns, maxDepth } = layout(frame.tree, frame.root)
    if (!columns) {
      ctx.fillStyle = muted
      ctx.font = "16px ui-sans-serif, system-ui"
      ctx.fillText("空树", w / 2, h / 2)
      return
    }
    const padX = Math.min(70, w * 0.1)
    const top = 88
    const rowGap = maxDepth ? Math.min(88, (h - top - 55) / maxDepth) : 0
    const colGap = columns > 1 ? (w - padX * 2) / (columns - 1) : 0
    const xOf = (id: number) => (columns === 1 ? w / 2 : padX + positions[id].column * colGap)
    const yOf = (id: number) => top + positions[id].depth * rowGap
    Object.keys(frame.tree).forEach((key) => {
      const id = Number(key)
      for (const child of [frame.tree[id].left, frame.tree[id].right]) {
        if (child === null) continue
        ctx.strokeStyle = edge
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(xOf(id), yOf(id))
        ctx.lineTo(xOf(child), yOf(child))
        ctx.stroke()
      }
    })
    const active = new Set(frame.active)
    Object.keys(frame.tree).forEach((key) => {
      const id = Number(key)
      const node = frame.tree[id]
      const x = xOf(id)
      const y = yOf(id)
      if (active.has(id)) {
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = node.color === "red" ? "#ef4444" : dark ? "#18181b" : "#27272a"
      ctx.beginPath()
      ctx.arc(x, y, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = node.color === "red" ? "#fca5a5" : dark ? "#a1a1aa" : "#09090b"
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "700 13px ui-monospace, monospace"
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(String(node.value), x, y)
      if (id === frame.root) {
        ctx.fillStyle = muted
        ctx.font = "10px ui-sans-serif, system-ui"
        ctx.textBaseline = "alphabetic"
        ctx.fillText("root", x, y - 29)
      }
    })
  }, [frame, vp])

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
          "红黑树先按二叉搜索树规则寻找空位，新插入的节点先染红。染红不会立刻改变每条路径的黑节点数量。",
          "如果父节点也是红色，就出现红红冲突。父亲和叔叔都为红时，把父亲与叔叔染黑、祖父染红，再向上继续检查。",
          "如果叔叔是黑色，就通过局部旋转把结构变成外侧形态，同时交换父亲和祖父的颜色。动画后段会看到一次真实左旋。",
          "最后把根保持为黑色。由这些变色和旋转，红黑树把高度限制在对数级，搜索、插入和删除都是 O(log n)。",
        ],
        setIdx,
      ),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > 820) {
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
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 390, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute right-3 top-2 rounded bg-[var(--card)]/75 px-2 py-1 text-[11px] font-mono text-[var(--muted-foreground)] backdrop-blur">
          {idx + 1} / {frames.length}
        </div>
      </div>
      {!lecture && <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm">{frame.caption}</div>}
      {!lecture && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
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
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">红/黑=节点颜色 · 橙环=本步相关节点</span>
        </div>
      )}
    </div>
  )
}
