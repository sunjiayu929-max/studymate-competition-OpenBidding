/**
 * 概念动画 · 图遍历 BFS / DFS（数据结构与算法）
 * ------------------------------------------------------------------
 * 从起点系统访问全图、不重复。两大策略：
 *   - 广度优先 BFS：用队列，一层层向外扩（像水波纹）
 *   - 深度优先 DFS：用栈/递归，一条路走到底，走不通再回退
 * 真实遍历录制帧；展示访问顺序 + 队列/栈内容。可切 BFS / DFS。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const STEP_MS = 950
const LABELS = ["A", "B", "C", "D", "E", "F", "G"]
const POS: [number, number][] = [
  [0.5, 0.16],
  [0.25, 0.44],
  [0.75, 0.44],
  [0.13, 0.76],
  [0.43, 0.76],
  [0.72, 0.76],
  [0.55, 0.96],
]
const ADJ: number[][] = [
  [1, 2], // A
  [0, 3, 4], // B
  [0, 4, 5], // C
  [1, 6], // D
  [1, 2, 6], // E
  [2, 6], // F
  [3, 4, 5], // G
]
type Mode = "bfs" | "dfs"
interface Frame {
  order: number[]
  cur: number
  frontier: number[]
}
function traverse(mode: Mode): Frame[] {
  const frames: Frame[] = []
  const seen = new Set<number>([0])
  const order: number[] = []
  if (mode === "bfs") {
    const q = [0]
    while (q.length) {
      const u = q.shift()!
      order.push(u)
      for (const v of ADJ[u]) {
        if (!seen.has(v)) {
          seen.add(v)
          q.push(v)
        }
      }
      frames.push({ order: [...order], cur: u, frontier: [...q] })
    }
  } else {
    const st = [0]
    while (st.length) {
      const u = st.pop()!
      order.push(u)
      frames.push({ order: [...order], cur: u, frontier: [...st] })
      for (const v of [...ADJ[u]].reverse()) {
        if (!seen.has(v)) {
          seen.add(v)
          st.push(v)
        }
      }
    }
  }
  return frames
}

export function GraphTraversalAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [mode, setMode] = useState<Mode>("bfs")
  const framesRef = useRef<Record<Mode, Frame[]>>({ bfs: traverse("bfs"), dfs: traverse("dfs") })
  const posRef = useRef(0)
  const modeRef = useRef<Mode>("bfs")
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

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
    applyViewport(ctx)
    const isDark = document.documentElement.classList.contains("dark")
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const m = modeRef.current
    const frames = framesRef.current[m]
    const f = frames[Math.min(posRef.current, frames.length - 1)]
    const R = 18
    const gx = 40
    const gw = cssW - 80
    const gTop = 56
    const gh = cssH - 150
    const P = (i: number): [number, number] => [gx + POS[i][0] * gw, gTop + POS[i][1] * gh]
    const visitedIdx = (i: number) => f.order.indexOf(i)

    // 边
    for (let u = 0; u < ADJ.length; u++)
      for (const v of ADJ[u])
        if (u < v) {
          const [x1, y1] = P(u)
          const [x2, y2] = P(v)
          ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
    // 节点
    for (let i = 0; i < LABELS.length; i++) {
      const [x, y] = P(i)
      const vi = visitedIdx(i)
      const isCur = i === f.cur
      const visited = vi >= 0
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fillStyle = isCur ? "#f59e0b" : visited ? "#10b981" : isDark ? "#312e81" : "#a5b4fc"
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)"
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "600 15px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(LABELS[i], x, y)
      // 访问序号
      if (visited) {
        ctx.fillStyle = isDark ? "#34d399" : "#059669"
        ctx.font = "600 11px ui-monospace, monospace"
        ctx.fillText(`#${vi + 1}`, x + R + 8, y - R + 2)
      }
    }

    // 访问顺序
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`${m === "bfs" ? "BFS 广度优先（队列）" : "DFS 深度优先（栈）"}\u3000访问顺序：${f.order.map((i) => LABELS[i]).join(" → ")}`, 40, cssH - 50)

    // 队列/栈
    ctx.fillStyle = MUT
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.fillText(m === "bfs" ? "队列(先进先出)：" : "栈(后进先出)：", 40, cssH - 22)
    let fx = 40 + 116
    const front = m === "bfs" ? f.frontier : [...f.frontier].reverse()
    if (front.length === 0) {
      ctx.fillStyle = MUT
      ctx.fillText("空", fx, cssH - 22)
    }
    front.forEach((i) => {
      ctx.fillStyle = "#6366f1"
      ctx.fillRect(fx, cssH - 36, 26, 20)
      ctx.fillStyle = "#fff"
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(LABELS[i], fx + 13, cssH - 26)
      fx += 32
    })
    if (m === "dfs" && front.length) {
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText("← 栈顶", fx + 2, cssH - 22)
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      const frames = framesRef.current[modeRef.current]
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < frames.length - 1) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const curFrames = framesRef.current[mode]
  const done = pos >= curFrames.length - 1
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < framesRef.current[modeRef.current].length - 1) setPos((p) => p + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done])
  const switchMode = useCallback((mm: Mode) => {
    setMode(mm)
    modeRef.current = mm
    setPlaying(false)
    setPos(0)
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
      setMode("bfs")
      modeRef.current = "bfs"
    },
    buildBeats: () => {
      const bfs = framesRef.current.bfs
      const dfs = framesRef.current.dfs
      const bo = bfs[bfs.length - 1].order.map((i) => LABELS[i]).join("→")
      const dor = dfs[dfs.length - 1].order.map((i) => LABELS[i]).join("→")
      return [
        {
          apply: () => {
            setMode("bfs")
            modeRef.current = "bfs"
            setPos(0)
          },
          text: "图遍历,就是从一个起点出发,系统地访问到所有能到达的节点,而且不重复走。最常用的有两大策略:广度优先 BFS 和深度优先 DFS。我们从 A 出发。",
        },
        {
          frames: Array.from({ length: bfs.length }, (_, i) => i),
          seek: (i: number) => {
            setMode("bfs")
            modeRef.current = "bfs"
            setPos(i)
          },
          text: `先看 BFS。它用一个队列,先进先出。先访问起点 A,把它的邻居都排进队列;然后一个个出队,一层访问完再访问下一层,像往水里扔石头、波纹一圈圈向外扩。访问顺序是 ${bo}。`,
        },
        {
          frames: Array.from({ length: dfs.length }, (_, i) => i),
          seek: (i: number) => {
            setMode("dfs")
            modeRef.current = "dfs"
            setPos(i)
          },
          text: `再看 DFS,换成栈、后进先出(也就是递归)。它的脾气是「一条路走到黑」:沿着一个方向使劲往深里钻,直到走不通,再回退、换另一条路。你看它一头扎到底再回头,顺序是 ${dor}。`,
        },
        {
          apply: () => {
            setMode("dfs")
            modeRef.current = "dfs"
            setPos(dfs.length - 1)
          },
          text: "两者都能不重不漏地遍历全图,区别只在「先扩散还是先深入」。无权图里求最短路要用 BFS;而判连通、找环、拓扑排序、回溯搜索,通常用 DFS。一个队列、一个栈,就是它俩的全部秘密。",
        },
      ]
    },
  })

  const f = curFrames[Math.min(pos, curFrames.length - 1)]
  const caption = done
    ? `${mode.toUpperCase()} 遍历完成，顺序：${f.order.map((i) => LABELS[i]).join("→")}。BFS=队列层层扩(无权最短路)，DFS=栈一路到底(连通/拓扑/回溯)。`
    : pos === 0
      ? `从 A 出发做 ${mode.toUpperCase()}（${mode === "bfs" ? "队列、层层扩散" : "栈、一路到底"}）。点播放，可切换 BFS/DFS。`
      : `${mode.toUpperCase()}：访问 ${LABELS[f.cur]}，${mode === "bfs" ? "邻居入队" : "邻居压栈"}。当前顺序 ${f.order.map((i) => LABELS[i]).join("→")}。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {mode.toUpperCase()} {Math.min(pos + 1, curFrames.length)}/{curFrames.length}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant={mode === "bfs" ? "default" : "outline"} onClick={() => switchMode("bfs")}>
            BFS
          </Button>
          <Button size="sm" variant={mode === "dfs" ? "default" : "outline"} onClick={() => switchMode("dfs")}>
            DFS
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=当前 · 绿=已访问 · 蓝=队列/栈</span>
        </div>
      )}
    </div>
  )
}
