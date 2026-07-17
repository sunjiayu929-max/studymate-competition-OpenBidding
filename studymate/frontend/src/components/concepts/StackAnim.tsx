/**
 * 概念动画 · 栈 Stack
 * 用真实 push / pop 构造一次函数调用过程：调用压栈，返回弹栈，严格后进先出。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const STEP_MS = 900
type Operation = "start" | "push" | "pop"
type Frame = {
  stack: string[]
  operation: Operation
  functionName?: string
  popped?: string
  message: string
}

function buildFrames(): Frame[] {
  const stack: string[] = []
  const frames: Frame[] = [{ stack: [], operation: "start", message: "空栈：top = -1，等待第一次函数调用" }]
  const push = (functionName: string, caller?: string) => {
    stack.push(functionName)
    frames.push({
      stack: [...stack],
      operation: "push",
      functionName,
      message: caller ? `${caller} 调用 ${functionName}：push 到栈顶` : `程序进入 ${functionName}：push 到栈顶`,
    })
  }
  const pop = () => {
    const popped = stack.pop()
    if (!popped) return
    frames.push({
      stack: [...stack],
      operation: "pop",
      popped,
      functionName: stack.at(-1),
      message: `${popped} 返回：pop；控制权回到 ${stack.at(-1) ?? "操作系统"}`,
    })
  }

  push("main()")
  push("loadUser()", "main()")
  push("parseProfile()", "loadUser()")
  pop()
  push("validate()", "loadUser()")
  pop()
  pop()
  push("render()", "main()")
  pop()
  pop()
  return frames
}

const FRAMES = buildFrames()

export function StackAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const total = FRAMES.length

  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

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
    const border = dark ? "#52525b" : "#a1a1aa"
    const frame = FRAMES[Math.min(posRef.current, total - 1)]
    const stackW = Math.min(220, Math.max(150, cssW * 0.34))
    const cellH = 45
    const baseX = Math.max(36, cssW * 0.24 - stackW / 2)
    const baseY = cssH - 65
    const maxDepth = 4

    ctx.strokeStyle = border
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(baseX, baseY - maxDepth * cellH - 8)
    ctx.lineTo(baseX, baseY)
    ctx.lineTo(baseX + stackW, baseY)
    ctx.lineTo(baseX + stackW, baseY - maxDepth * cellH - 8)
    ctx.stroke()

    frame.stack.forEach((functionName, index) => {
      const y = baseY - (index + 1) * cellH
      const isTop = index === frame.stack.length - 1
      const justPushed = frame.operation === "push" && isTop
      ctx.fillStyle = justPushed ? "#10b981" : isTop ? "#6366f1" : dark ? "rgba(99,102,241,.2)" : "rgba(99,102,241,.11)"
      ctx.fillRect(baseX + 4, y + 3, stackW - 8, cellH - 5)
      ctx.strokeStyle = justPushed ? "#10b981" : isTop ? "#6366f1" : border
      ctx.lineWidth = isTop ? 2.5 : 1
      ctx.strokeRect(baseX + 4, y + 3, stackW - 8, cellH - 5)
      ctx.fillStyle = isTop ? "#fff" : fg
      ctx.font = "600 14px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(functionName, baseX + stackW / 2, y + cellH / 2)
      ctx.fillStyle = isTop ? "rgba(255,255,255,.8)" : muted
      ctx.font = "10px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.fillText(`#${index}`, baseX + stackW - 12, y + cellH / 2)
    })

    if (frame.stack.length > 0) {
      const topY = baseY - frame.stack.length * cellH + cellH / 2
      ctx.fillStyle = "#f59e0b"
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(`top = ${frame.stack.length - 1}`, baseX - 14, topY)
      ctx.beginPath()
      ctx.moveTo(baseX - 8, topY)
      ctx.lineTo(baseX, topY - 5)
      ctx.lineTo(baseX, topY + 5)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillStyle = muted
      ctx.font = "12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("empty", baseX + stackW / 2, baseY - 25)
      ctx.fillText("top = -1", baseX + stackW / 2, baseY + 18)
    }

    const panelX = Math.min(cssW - 230, Math.max(baseX + stackW + 52, cssW * 0.56))
    const panelW = Math.max(180, cssW - panelX - 25)
    ctx.fillStyle = dark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.035)"
    ctx.strokeStyle = dark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.fillRect(panelX, 60, panelW, 205)
    ctx.strokeRect(panelX, 60, panelW, 205)
    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("调用栈直觉", panelX + 16, 86)
    ctx.fillStyle = muted
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.fillText("push：函数调用 → 压到 top", panelX + 16, 118)
    ctx.fillText("pop：函数返回 → 只弹出 top", panelX + 16, 145)
    ctx.fillText("LIFO：最后进入，最先返回", panelX + 16, 172)
    ctx.fillStyle = frame.operation === "push" ? "#10b981" : frame.operation === "pop" ? "#ef4444" : muted
    ctx.font = "700 17px ui-monospace, monospace"
    ctx.fillText(frame.operation === "push" ? `PUSH ${frame.functionName}` : frame.operation === "pop" ? `POP ${frame.popped}` : "READY", panelX + 16, 215)
    if (frame.operation === "pop" && frame.popped) {
      ctx.fillStyle = "#ef4444"
      ctx.font = "12px ui-sans-serif, system-ui"
      ctx.fillText(`${frame.popped} 已离开栈顶`, panelX + 16, 242)
    }

    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(frame.message, cssW / 2, cssH - 22)
  }, [total, vp])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current >= STEP_MS) {
        lastRef.current = now
        if (posRef.current < total - 1) setPos((value) => value + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total - 1
  const reset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const step = useCallback(() => {
    if (posRef.current < total - 1) setPos((value) => value + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (posRef.current >= total - 1) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
    } else setPlaying((value) => !value)
  }, [total])

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
        total,
        [
          "栈是一种后进先出的数据结构，只允许在栈顶操作。push 把元素压到 top，pop 也只从 top 取出元素，这两个基本操作通常都是 O(1)。",
          "函数调用栈正是栈的典型应用。main 调用 loadUser，loadUser 又调用 parseProfile；每次调用都会把一个新的栈帧压在调用者上方。",
          "parseProfile 最后被调用，所以它最先返回并弹栈。随后 loadUser 还能调用 validate；返回地址和局部状态都留在各自栈帧中，控制权不会混乱。",
          "loadUser 完成后回到 main，main 再调用 render。最终 main 也返回，栈重新变空。括号匹配、撤销操作和深度优先搜索也都利用同一种后进先出规律。",
        ],
        (index) => setPos(Math.min(index, total - 1))
      ),
  })

  const frame = FRAMES[pos]
  const caption = done ? "调用结束，栈恢复为空。最后压入的栈帧总是最先弹出，这就是 LIFO。" : frame.message

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 335, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">步骤 {pos + 1} / {total}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{done ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || done}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=刚 push · 红=刚 pop · 紫=当前 top</span>
        </div>
      )}
    </div>
  )
}
