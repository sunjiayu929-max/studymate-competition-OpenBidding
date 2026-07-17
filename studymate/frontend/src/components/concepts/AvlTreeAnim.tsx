/** AVL 树四种失衡（LL / RR / LR / RL）的真实插入与旋转修复。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

type AvlCase = "LL" | "RR" | "LR" | "RL"

interface AvlNode {
  value: number
  left: number | null
  right: number | null
  height: number
}

type AvlTree = Record<number, AvlNode>

interface AvlFrame {
  tree: AvlTree
  root: number | null
  active: number[]
  rotation: AvlCase | null
  caption: string
}

const CASES: Record<AvlCase, { seq: number[]; title: string; detail: string }> = {
  LL: { seq: [30, 20, 10], title: "LL：右旋", detail: "新节点落在失衡点的左孩子的左侧" },
  RR: { seq: [10, 20, 30], title: "RR：左旋", detail: "新节点落在失衡点的右孩子的右侧" },
  LR: { seq: [30, 10, 20], title: "LR：先左后右", detail: "新节点落在左孩子的右侧" },
  RL: { seq: [10, 30, 20], title: "RL：先右后左", detail: "新节点落在右孩子的左侧" },
}

function cloneTree(tree: AvlTree): AvlTree {
  const copy: AvlTree = {}
  Object.keys(tree).forEach((key) => {
    const id = Number(key)
    copy[id] = { ...tree[id] }
  })
  return copy
}

function buildFrames(which: AvlCase): AvlFrame[] {
  const tree: AvlTree = {}
  let root: number | null = null
  const frames: AvlFrame[] = []
  const height = (id: number | null) => (id === null ? 0 : tree[id].height)
  const updateAll = (id: number | null): number => {
    if (id === null) return 0
    tree[id].height = Math.max(updateAll(tree[id].left), updateAll(tree[id].right)) + 1
    return tree[id].height
  }
  const balance = (id: number) => height(tree[id].left) - height(tree[id].right)
  const snapshot = (caption: string, active: number[] = [], rotation: AvlCase | null = null) => {
    updateAll(root)
    frames.push({ tree: cloneTree(tree), root, active: [...active], rotation, caption })
  }
  const parentOf = (target: number): number | null => {
    if (root === null || root === target) return null
    let cur: number | null = root
    while (cur !== null) {
      if (tree[cur].left === target || tree[cur].right === target) return cur
      cur = target < cur ? tree[cur].left : tree[cur].right
    }
    return null
  }
  const attachReplacement = (oldRoot: number, newRoot: number, parent: number | null) => {
    if (parent === null) root = newRoot
    else if (tree[parent].left === oldRoot) tree[parent].left = newRoot
    else tree[parent].right = newRoot
  }
  const rotateRight = (y: number) => {
    const parent = parentOf(y)
    const x = tree[y].left as number
    const middle = tree[x].right
    tree[x].right = y
    tree[y].left = middle
    attachReplacement(y, x, parent)
    updateAll(root)
    return x
  }
  const rotateLeft = (x: number) => {
    const parent = parentOf(x)
    const y = tree[x].right as number
    const middle = tree[y].left
    tree[y].left = x
    tree[x].right = middle
    attachReplacement(x, y, parent)
    updateAll(root)
    return y
  }

  snapshot(`演示 ${CASES[which].title}，插入序列 ${CASES[which].seq.join(" → ")}`)
  for (const value of CASES[which].seq) {
    if (root === null) {
      tree[value] = { value, left: null, right: null, height: 1 }
      root = value
      snapshot(`空树：${value} 成为根节点`, [value])
      continue
    }

    let cur: number = root
    const path: number[] = []
    while (true) {
      path.push(cur)
      snapshot(`比较 ${value} 与 ${tree[cur].value}：${value < tree[cur].value ? "向左" : "向右"}`, [cur])
      if (value < tree[cur].value) {
        if (tree[cur].left === null) {
          tree[value] = { value, left: null, right: null, height: 1 }
          tree[cur].left = value
          path.push(value)
          snapshot(`${value} 插入为 ${tree[cur].value} 的左孩子`, [cur, value])
          break
        }
        cur = tree[cur].left as number
      } else {
        if (tree[cur].right === null) {
          tree[value] = { value, left: null, right: null, height: 1 }
          tree[cur].right = value
          path.push(value)
          snapshot(`${value} 插入为 ${tree[cur].value} 的右孩子`, [cur, value])
          break
        }
        cur = tree[cur].right as number
      }
    }

    updateAll(root)
    let repaired = false
    for (let i = path.length - 2; i >= 0; i--) {
      const z = path[i]
      const bf = balance(z)
      snapshot(`回溯更新 ${z}：高度 ${tree[z].height}，平衡因子 ${bf}`, [z])
      if (bf > 1) {
        const left = tree[z].left as number
        if (value < left) {
          snapshot(`${z} 的平衡因子为 ${bf}，发生 LL 失衡`, [z, left], "LL")
          const newRoot = rotateRight(z)
          snapshot(`绕 ${z} 右旋，${newRoot} 成为这棵子树的新根`, [newRoot, z], "LL")
        } else {
          snapshot(`${z} 的平衡因子为 ${bf}，发生 LR 失衡`, [z, left], "LR")
          const raised = rotateLeft(left)
          snapshot(`第一步：绕 ${left} 左旋，把 ${raised} 提上来`, [left, raised], "LR")
          const newRoot = rotateRight(z)
          snapshot(`第二步：绕 ${z} 右旋，${newRoot} 成为新根`, [newRoot, z], "LR")
        }
        repaired = true
        break
      }
      if (bf < -1) {
        const right = tree[z].right as number
        if (value > right) {
          snapshot(`${z} 的平衡因子为 ${bf}，发生 RR 失衡`, [z, right], "RR")
          const newRoot = rotateLeft(z)
          snapshot(`绕 ${z} 左旋，${newRoot} 成为这棵子树的新根`, [newRoot, z], "RR")
        } else {
          snapshot(`${z} 的平衡因子为 ${bf}，发生 RL 失衡`, [z, right], "RL")
          const raised = rotateRight(right)
          snapshot(`第一步：绕 ${right} 右旋，把 ${raised} 提上来`, [right, raised], "RL")
          const newRoot = rotateLeft(z)
          snapshot(`第二步：绕 ${z} 左旋，${newRoot} 成为新根`, [newRoot, z], "RL")
        }
        repaired = true
        break
      }
    }
    if (!repaired) snapshot(`插入 ${value} 后所有节点的平衡因子仍在 -1 到 1 之间`, [value])
  }
  snapshot(`${which} 修复完成：中序有序，且每个节点的左右子树高度差不超过 1`)
  return frames
}

function layout(tree: AvlTree, root: number | null) {
  const positions: Record<number, { column: number; depth: number }> = {}
  let column = 0
  let maxDepth = 0
  const walk = (id: number | null, depth: number) => {
    if (id === null) return
    walk(tree[id].left, depth + 1)
    positions[id] = { column: column++, depth }
    maxDepth = Math.max(maxDepth, depth)
    walk(tree[id].right, depth + 1)
  }
  walk(root, 0)
  return { positions, columns: column, maxDepth }
}

export function AvlTreeAnim({
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [which, setWhich] = useState<AvlCase>("LL")
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const frames = useMemo(() => buildFrames(which), [which])
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
    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`${CASES[which].title} · ${CASES[which].detail}`, w / 2, 30)
    if (frame.rotation) {
      ctx.fillStyle = "#f59e0b"
      ctx.font = "700 12px ui-sans-serif, system-ui"
      ctx.fillText(`正在处理 ${frame.rotation} 失衡`, w / 2, 51)
    }

    const { positions, columns, maxDepth } = layout(frame.tree, frame.root)
    if (!columns) {
      ctx.fillStyle = muted
      ctx.font = "16px ui-sans-serif, system-ui"
      ctx.fillText("空树", w / 2, h / 2)
      return
    }
    const padX = Math.min(120, w * 0.18)
    const top = 92
    const rowGap = maxDepth ? Math.min(105, (h - top - 62) / maxDepth) : 0
    const columnGap = columns > 1 ? (w - padX * 2) / (columns - 1) : 0
    const xOf = (id: number) => (columns === 1 ? w / 2 : padX + positions[id].column * columnGap)
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
      const bf = (node.left === null ? 0 : frame.tree[node.left].height) - (node.right === null ? 0 : frame.tree[node.right].height)
      const x = xOf(id)
      const y = yOf(id)
      ctx.fillStyle = Math.abs(bf) > 1 ? "#f43f5e" : active.has(id) ? "#f59e0b" : dark ? "#4f46e5" : "#6366f1"
      ctx.beginPath()
      ctx.arc(x, y, 23, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = Math.abs(bf) > 1 ? "#fb7185" : "rgba(255,255,255,.35)"
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "700 14px ui-monospace, monospace"
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(String(node.value), x, y)
      ctx.fillStyle = Math.abs(bf) > 1 ? "#f43f5e" : muted
      ctx.font = "11px ui-monospace, monospace"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(`h=${node.height}  BF=${bf}`, x, y + 39)
    })
  }, [frame, vp, which])

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
          `这次演示 ${which} 情况，依次插入 ${CASES[which].seq.join("、")}。AVL 树首先按二叉搜索树规则插入。`,
          "插入后沿路径向上更新高度。平衡因子等于左子树高度减右子树高度，绝对值超过一就失衡。",
          `${CASES[which].detail}，因此采用${which === "LL" ? "一次右旋" : which === "RR" ? "一次左旋" : which === "LR" ? "先左旋再右旋" : "先右旋再左旋"}。`,
          "旋转只改变局部连接，不破坏二叉搜索树的中序顺序，并把高度重新压回平衡范围。",
        ],
        setIdx,
      ),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > 850) {
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

  const choose = (next: AvlCase) => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
    setWhich(next)
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
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 360, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute right-3 top-2 rounded bg-[var(--card)]/75 px-2 py-1 text-[11px] font-mono text-[var(--muted-foreground)] backdrop-blur">
          {idx + 1} / {frames.length}
        </div>
      </div>
      {!lecture && <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm">{frame.caption}</div>}
      {!lecture && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
          {(["LL", "RR", "LR", "RL"] as AvlCase[]).map((item) => (
            <Button key={item} size="sm" variant={which === item ? "default" : "outline"} onClick={() => choose(item)}>
              {item}
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
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">BF=左高−右高 · 红=失衡 · 橙=当前</span>
        </div>
      )}
    </div>
  )
}
