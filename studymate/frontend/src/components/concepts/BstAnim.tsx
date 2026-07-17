/**
 * 概念动画 · 二叉搜索树 BST（数据结构与算法）
 * ------------------------------------------------------------------
 * 思路：录制一串真实 BST 插入过程成帧，逐帧回放。
 *   - 依次插入 → 从根比较：小往左、大往右，走到空位挂上新节点。
 *   - 高亮当前比较路径（yellow），新挂节点（emerald）；树用「中序定 x、深度定 y」自动布局。
 *   - 体现 BST 不变式：左子树 < 根 < 右子树，中序遍历即升序。
 *   - ▶播放/⏸暂停/⏭单步/↻重置（重置换一组插入序列）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

interface BNode {
  val: number
  left: number | null
  right: number | null
}
type Tree = Record<number, BNode>

interface BFrame {
  tree: Tree
  root: number | null
  path: number[] // 当前比较路径上的节点 id
  newId: number | null // 刚挂上的新节点
  caption: string
}

function genFrames(seq: number[]): BFrame[] {
  const tree: Tree = {}
  let root: number | null = null
  let nextId = 0
  const frames: BFrame[] = []

  const snapshot = (path: number[], newId: number | null, caption: string) => {
    // 深拷贝 tree 供回放
    const copy: Tree = {}
    for (const k in tree) copy[k] = { ...tree[k] }
    frames.push({ tree: copy, root, path: [...path], newId, caption })
  }

  const insert = (val: number) => {
    snapshot([], null, `插入 ${val}`)
    if (root === null) {
      const id = nextId++
      tree[id] = { val, left: null, right: null }
      root = id
      snapshot([], id, `空树，${val} 成为根节点`)
      return
    }
    let cur: number = root
    const path: number[] = []
    while (true) {
      path.push(cur)
      snapshot(path, null, `比较 ${val} 与节点 ${tree[cur].val}`)
      if (val < tree[cur].val) {
        if (tree[cur].left === null) {
          const id = nextId++
          tree[id] = { val, left: null, right: null }
          tree[cur].left = id
          snapshot([...path, id], id, `${val} < ${tree[cur].val} 且左孩子为空 → 挂为左孩子 ✓`)
          return
        }
        snapshot(path, null, `${val} < ${tree[cur].val}，往左走`)
        cur = tree[cur].left as number
      } else if (val > tree[cur].val) {
        if (tree[cur].right === null) {
          const id = nextId++
          tree[id] = { val, left: null, right: null }
          tree[cur].right = id
          snapshot([...path, id], id, `${val} > ${tree[cur].val} 且右孩子为空 → 挂为右孩子 ✓`)
          return
        }
        snapshot(path, null, `${val} > ${tree[cur].val}，往右走`)
        cur = tree[cur].right as number
      } else {
        snapshot(path, null, `${val} 已存在，BST 不插入重复值`)
        return
      }
    }
  }

  for (const v of seq) insert(v)
  snapshot([], null, "插入完成 · 左子树 < 根 < 右子树，中序遍历即升序")
  return frames
}

function randomSeq(): number[] {
  // 1..99 取 8 个不重复，保证树有点形状
  const pool = Array.from({ length: 99 }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 8)
}

// 中序定 col、深度定 row → 计算每个节点坐标列号/深度
function layout(tree: Tree, root: number | null) {
  const pos: Record<number, { col: number; depth: number }> = {}
  let col = 0
  let maxDepth = 0
  const ino = (id: number | null, depth: number) => {
    if (id === null) return
    maxDepth = Math.max(maxDepth, depth)
    ino(tree[id].left, depth + 1)
    pos[id] = { col: col++, depth }
    ino(tree[id].right, depth + 1)
  }
  ino(root, 0)
  return { pos, cols: col, maxDepth }
}

export function BstAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)

  const seq = useMemo(() => {
    void seed
    return randomSeq()
  }, [seed])
  const frames = useMemo(() => genFrames(seq), [seq])
  const frame = frames[Math.min(idx, frames.length - 1)]
  const atEnd = idx >= frames.length - 1

  const playingRef = useRef(playing)
  const lastAdvanceRef = useRef(0)
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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const isDark = document.documentElement.classList.contains("dark")
    const { tree, root, path, newId } = frame
    const { pos, cols, maxDepth } = layout(tree, root)
    if (cols === 0) return

    const padX = 28
    const padTop = 28
    const padBottom = 18
    const R = Math.min(18, (cssW - padX * 2) / Math.max(cols, 1) / 2.2)
    const colW = cols > 1 ? (cssW - padX * 2) / (cols - 1) : 0
    const rowH = maxDepth > 0 ? (cssH - padTop - padBottom) / maxDepth : 0
    const cx = (id: number) => (cols > 1 ? padX + pos[id].col * colW : cssW / 2)
    const cy = (id: number) => padTop + pos[id].depth * rowH

    const pathSet = new Set(path)

    // 边
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.22)"
    ctx.lineWidth = 1.6
    for (const k in tree) {
      const id = Number(k)
      const node = tree[id]
      for (const child of [node.left, node.right]) {
        if (child === null) continue
        ctx.beginPath()
        ctx.moveTo(cx(id), cy(id))
        ctx.lineTo(cx(child), cy(child))
        ctx.stroke()
      }
    }

    // 节点
    for (const k in tree) {
      const id = Number(k)
      const isNew = id === newId
      const onPath = pathSet.has(id)
      let fill: string
      if (isNew) fill = isDark ? "#10b981" : "#059669" // emerald 新节点
      else if (onPath) fill = "#eab308" // yellow 比较路径
      else fill = isDark ? "#6366f1" : "#818cf8" // indigo 默认

      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.22)"
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 2
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(cx(id), cy(id), R, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = "#fff"
      ctx.font = `bold ${Math.round(R * 0.85)}px ui-sans-serif, system-ui`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(tree[id].val), cx(id), cy(id))
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
          "二叉搜索树的规则是：任何一个节点，它的左子树都比它小、右子树都比它大。我们把数一个一个插进去。",
          "插入时，从根节点开始比较：比当前节点小就往左走，大就往右走，顺着这条路一直往下找。",
          "走到一个空位，就把新节点挂在那儿。你看，每个数都沿着一条比较路径，找到属于自己的位置。",
          "全部插完，就得到一棵二叉搜索树。对它做中序遍历——左子树、根、右子树——出来正好是从小到大排好的顺序。",
        ],
        (i) => setIdx(i)
      ),
  })

  useEffect(() => {
    const STEP_MS = lecture ? 3800 : 760
    const tick = (now: number) => {
      if (playingRef.current && now - lastAdvanceRef.current > STEP_MS) {
        lastAdvanceRef.current = now
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
    setSeed((s) => s + 1)
  }, [])

  const handleStep = useCallback(() => {
    if (atEnd) return
    setIdx((i) => Math.min(i + 1, frames.length - 1))
  }, [atEnd, frames.length])

  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIdx(0)
      lastAdvanceRef.current = performance.now()
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
          style={{ height: 300, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1} / {frames.length}
        </div>
        <div className="absolute top-2 left-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          插入序列：{seq.join(" ")}
        </div>
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
          <RotateCcw className="size-4" /> 换一组
        </Button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
          <Legend color="#eab308" label="比较路径" />
          <Legend color="#059669" label="新节点" />
        </div>
      </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
