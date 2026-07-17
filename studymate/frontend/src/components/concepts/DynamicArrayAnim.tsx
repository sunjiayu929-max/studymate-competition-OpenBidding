/**
 * 概念动画 · 数组与动态扩容
 * 真实执行 append：空间不足时申请两倍容量，逐项复制旧元素，切换存储区后写入新元素。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const STEP_MS = 820
const APPENDS = [7, 14, 21, 28, 35]

type Phase = "ready" | "allocate" | "copy" | "switch" | "write"
type Frame = {
  phase: Phase
  capacity: number
  data: number[]
  oldCapacity?: number
  oldData?: number[]
  newCapacity?: number
  newData?: Array<number | null>
  activeIndex?: number
  value?: number
  message: string
}

function buildFrames(): Frame[] {
  let capacity = 2
  let data: number[] = []
  const frames: Frame[] = [{ phase: "ready", capacity, data: [], message: "空动态数组：size=0，capacity=2" }]

  for (const value of APPENDS) {
    if (data.length === capacity) {
      const oldData = [...data]
      const oldCapacity = capacity
      const newCapacity = capacity * 2
      const newData: Array<number | null> = new Array(newCapacity).fill(null)
      frames.push({
        phase: "allocate",
        capacity,
        data: [...data],
        oldCapacity,
        oldData,
        newCapacity,
        newData: [...newData],
        value,
        message: `容量 ${capacity} 已满：申请容量 ${newCapacity} 的连续空间`,
      })
      oldData.forEach((item, index) => {
        newData[index] = item
        frames.push({
          phase: "copy",
          capacity,
          data: [...data],
          oldCapacity,
          oldData,
          newCapacity,
          newData: [...newData],
          activeIndex: index,
          value,
          message: `复制 old[${index}]=${item} 到 new[${index}]`,
        })
      })
      capacity = newCapacity
      data = oldData
      frames.push({
        phase: "switch",
        capacity,
        data: [...data],
        activeIndex: data.length - 1,
        value,
        message: `切换到新存储区并释放旧空间：capacity=${capacity}`,
      })
    }
    const writeIndex = data.length
    data = [...data, value]
    frames.push({
      phase: "write",
      capacity,
      data: [...data],
      activeIndex: writeIndex,
      value,
      message: `写入 arr[${writeIndex}]=${value}：size=${data.length}，capacity=${capacity}`,
    })
  }
  return frames
}

const FRAMES = buildFrames()

export function DynamicArrayAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const maxCapacity = Math.max(frame.capacity, frame.newCapacity ?? 0)
    const cellW = Math.min(58, Math.max(36, (cssW - 76) / maxCapacity))
    const cellH = 46
    const rowW = (capacity: number) => capacity * cellW
    const rowX = (capacity: number) => (cssW - rowW(capacity)) / 2

    const drawRow = (
      label: string,
      values: Array<number | null>,
      capacity: number,
      y: number,
      activeIndex: number | undefined,
      activeColor: string
    ) => {
      const x0 = rowX(capacity)
      ctx.fillStyle = muted
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(label, x0, y - 12)
      for (let index = 0; index < capacity; index++) {
        const x = x0 + index * cellW
        const active = index === activeIndex
        ctx.fillStyle = active
          ? activeColor
          : values[index] != null
            ? dark
              ? "rgba(99,102,241,.23)"
              : "rgba(99,102,241,.13)"
            : dark
              ? "rgba(255,255,255,.035)"
              : "rgba(0,0,0,.025)"
        ctx.fillRect(x + 2, y, cellW - 4, cellH)
        ctx.strokeStyle = active ? activeColor : border
        ctx.lineWidth = active ? 2.5 : 1
        ctx.strokeRect(x + 2, y, cellW - 4, cellH)
        ctx.fillStyle = active ? "#fff" : fg
        ctx.font = "600 15px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(values[index] == null ? "·" : String(values[index]), x + cellW / 2, y + cellH / 2)
        ctx.fillStyle = muted
        ctx.font = "10px ui-monospace, monospace"
        ctx.fillText(String(index), x + cellW / 2, y + cellH + 12)
      }
    }

    if (frame.oldData && frame.newData && frame.oldCapacity != null && frame.newCapacity != null) {
      const oldValues: Array<number | null> = [...frame.oldData]
      while (oldValues.length < frame.oldCapacity!) oldValues.push(null)
      drawRow("旧空间 old（即将释放）", oldValues, frame.oldCapacity!, 74, frame.phase === "copy" ? frame.activeIndex : undefined, "#f59e0b")
      drawRow("新空间 new（容量 × 2）", frame.newData!, frame.newCapacity!, 190, frame.phase === "copy" ? frame.activeIndex : undefined, "#10b981")
      if (frame.phase === "copy" && frame.activeIndex != null) {
        const oldX = rowX(frame.oldCapacity!) + (frame.activeIndex + 0.5) * cellW
        const newX = rowX(frame.newCapacity!) + (frame.activeIndex + 0.5) * cellW
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(oldX, 74 + cellH + 17)
        ctx.bezierCurveTo(oldX, 160, newX, 160, newX, 183)
        ctx.stroke()
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.moveTo(newX, 190)
        ctx.lineTo(newX - 5, 181)
        ctx.lineTo(newX + 5, 181)
        ctx.closePath()
        ctx.fill()
      }
    } else {
      const values: Array<number | null> = [...frame.data]
      while (values.length < frame.capacity) values.push(null)
      drawRow("当前连续存储区", values, frame.capacity, 126, frame.activeIndex, frame.phase === "write" ? "#3b82f6" : "#10b981")
      const utilization = frame.capacity ? frame.data.length / frame.capacity : 0
      const barX = Math.max(24, (cssW - 330) / 2)
      const barW = Math.min(330, cssW - 48)
      ctx.fillStyle = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)"
      ctx.fillRect(barX, 235, barW, 12)
      ctx.fillStyle = utilization === 1 ? "#f59e0b" : "#10b981"
      ctx.fillRect(barX, 235, barW * utilization, 12)
      ctx.fillStyle = muted
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(`size / capacity = ${frame.data.length} / ${frame.capacity}`, cssW / 2, 265)
    }

    ctx.fillStyle = frame.phase === "copy" || frame.phase === "allocate" ? "#f59e0b" : fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(frame.message, cssW / 2, cssH - 17)
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
          "动态数组表面上和普通数组一样可以按下标访问，底层仍是一段连续内存。它额外记录 size 和 capacity；size 是已有元素数，capacity 是当前空间最多能放多少个。",
          "追加元素时，如果 size 小于 capacity，直接在末尾写入即可，单次是常数时间。现在容量二已经装满，再追加就必须扩容。",
          "扩容不是把原内存凭空拉长，而是申请一块通常为两倍大的新连续空间，再把旧元素一个不漏地逐项复制过去，最后切换指针并释放旧空间。",
          "一次扩容会花线性时间，但容量翻倍让昂贵复制不会每次发生。连续追加很多次后，平均到每次 append 的摊还复杂度仍是 O(1)，这正是动态数组的核心权衡。",
        ],
        (index) => setPos(Math.min(index, total - 1))
      ),
  })

  const frame = FRAMES[pos]
  const caption = done
    ? "两次扩容都完成：单次扩容是 O(n)，但按倍数增长容量后，连续 append 的摊还复杂度为 O(1)。"
    : frame.message

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 330, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">步骤 {pos + 1} / {total}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{done ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || done}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=旧元素 · 绿=复制结果 · 蓝=追加写入</span>
        </div>
      )}
    </div>
  )
}
