/** N 皇后：用 4×4 棋盘完整回放放置、冲突、撤销，直到找到首个解。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const N = 4
const STEP_MS = 560
type QueenAction = "start" | "place" | "conflict" | "remove" | "solution"

interface QueenFrame {
  board: number[]
  row: number
  col: number
  conflictRow: number | null
  action: QueenAction
  caption: string
}

function generateFrames(): QueenFrame[] {
  const board = Array(N).fill(-1) as number[]
  const frames: QueenFrame[] = []
  const push = (action: QueenAction, caption: string, row = -1, col = -1, conflictRow: number | null = null) =>
    frames.push({ board: [...board], row, col, conflictRow, action, caption })
  const conflictWith = (row: number, col: number) => {
    for (let previous = 0; previous < row; previous++) {
      if (board[previous] === col || Math.abs(board[previous] - col) === row - previous) return previous
    }
    return null
  }
  const solve = (row: number): boolean => {
    if (row === N) {
      push("solution", `找到解：[${board.join(", ")}]，每行、每列和两条对角线上都只有一个皇后。`)
      return true
    }
    for (let col = 0; col < N; col++) {
      const conflictRow = conflictWith(row, col)
      if (conflictRow !== null) {
        push(
          "conflict",
          `尝试 (${row}, ${col})：与第 ${conflictRow} 行皇后同${board[conflictRow] === col ? "列" : "对角线"}，发生冲突。`,
          row,
          col,
          conflictRow
        )
        continue
      }
      board[row] = col
      push("place", `第 ${row} 行把皇后放在第 ${col} 列，继续搜索下一行。`, row, col)
      if (solve(row + 1)) return true
      board[row] = -1
      push("remove", `后续行无合法位置，撤销 (${row}, ${col})，回到第 ${row} 行尝试下一列。`, row, col)
    }
    return false
  }

  push("start", "从第 0 行开始逐行放置皇后；每次只选择不冲突的列。")
  solve(0)
  return frames
}

export function NQueensAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const dark = document.documentElement.classList.contains("dark")
    const fg = dark ? "#e4e4e7" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const cell = Math.min(65, (width - 110) / N, (height - 42) / N)
    const boardSize = cell * N
    const left = (width - boardSize) / 2
    const top = (height - boardSize) / 2
    const center = (row: number, col: number): [number, number] => [left + (col + 0.5) * cell, top + (row + 0.5) * cell]

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const focused = row === frame.row && col === frame.col
        let fill = (row + col) % 2 === 0 ? (dark ? "#3f3f46" : "#e4e4e7") : dark ? "#18181b" : "#a1a1aa"
        if (focused && frame.action === "conflict") fill = "#ef4444"
        if (focused && frame.action === "place") fill = "#f59e0b"
        if (focused && frame.action === "remove") fill = dark ? "#7f1d1d" : "#fecaca"
        if (frame.action === "solution" && frame.board[row] === col) fill = "#10b981"
        ctx.fillStyle = fill
        ctx.fillRect(left + col * cell, top + row * cell, cell, cell)
      }
    }

    if (frame.action === "conflict" && frame.conflictRow !== null) {
      const [x1, y1] = center(frame.row, frame.col)
      const [x2, y2] = center(frame.conflictRow, frame.board[frame.conflictRow])
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 4
      ctx.setLineDash([7, 5])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    for (let row = 0; row < N; row++) {
      const col = frame.board[row]
      if (col < 0) continue
      const [x, y] = center(row, col)
      const conflict = frame.action === "conflict" && frame.conflictRow === row
      ctx.fillStyle = conflict ? "#fee2e2" : "#fff"
      ctx.font = `${Math.round(cell * 0.58)}px Georgia, serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("♛", x, y + 1)
    }

    if (frame.action === "conflict") {
      const [x, y] = center(frame.row, frame.col)
      ctx.fillStyle = "#fff"
      ctx.font = `700 ${Math.round(cell * 0.45)}px ui-sans-serif, system-ui`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("×", x, y)
    } else if (frame.action === "remove") {
      const [x, y] = center(frame.row, frame.col)
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x - cell * 0.18, y - cell * 0.18)
      ctx.lineTo(x + cell * 0.18, y + cell * 0.18)
      ctx.moveTo(x + cell * 0.18, y - cell * 0.18)
      ctx.lineTo(x - cell * 0.18, y + cell * 0.18)
      ctx.stroke()
    }

    ctx.fillStyle = muted
    ctx.font = "11px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let col = 0; col < N; col++) ctx.fillText(String(col), left + (col + 0.5) * cell, top - 13)
    ctx.textAlign = "right"
    for (let row = 0; row < N; row++) ctx.fillText(String(row), left - 12, top + (row + 0.5) * cell)
    ctx.fillStyle = fg
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(`N=${N} · 已放置 ${frame.board.filter((col) => col >= 0).length}/${N}`, left + boardSize + 16, top + 16)
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
          "N 皇后要求在 N 乘 N 棋盘上放 N 个皇后，让任意两个皇后都不同列、也不在同一条对角线上。这里用四皇后完整演示回溯。",
          "搜索按行推进。当前格安全就放下皇后并进入下一行；同列或同对角线冲突时，这个候选立即被排除。",
          "如果下一行所有列都冲突，说明刚才的选择走进了死路。算法撤销上一枚皇后，回到上一个决策点继续尝试下一列。",
          "这样不断执行选择、递归、失败撤销，最终找到一个完整解。回溯本质上是带约束剪枝的深度优先搜索。",
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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">4 皇后 · {idx + 1}/{frames.length}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{frame.caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{atEnd ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || atEnd}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=放置 · 红=冲突/撤销 · 绿=完整解</span>
        </div>
      )}
    </div>
  )
}
