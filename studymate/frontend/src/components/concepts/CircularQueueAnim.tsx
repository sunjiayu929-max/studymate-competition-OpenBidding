/**
 * 概念动画 · 循环队列
 * 用固定容量数组真实执行 enqueue / dequeue，front 和 rear 每次都通过取模环绕。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

const STEP_MS = 880
const CAPACITY = 6
type Operation = "start" | "enqueue" | "dequeue"
type Frame = {
  slots: Array<string | null>
  front: number
  rear: number
  size: number
  operation: Operation
  activeIndex?: number
  value?: string
  wrapped?: boolean
  message: string
}

function buildFrames(): Frame[] {
  const slots: Array<string | null> = new Array(CAPACITY).fill(null)
  let front = 0
  let rear = 0
  let size = 0
  const frames: Frame[] = [
    { slots: [...slots], front, rear, size, operation: "start", message: "空队列：front=rear=0，size=0" },
  ]
  const enqueue = (value: string) => {
    if (size === CAPACITY) return
    const writeIndex = rear
    slots[writeIndex] = value
    rear = (rear + 1) % CAPACITY
    size += 1
    frames.push({
      slots: [...slots],
      front,
      rear,
      size,
      operation: "enqueue",
      activeIndex: writeIndex,
      value,
      wrapped: rear === 0,
      message: `enqueue(${value})：写入槽 ${writeIndex}，rear=(${writeIndex}+1) mod ${CAPACITY}=${rear}`,
    })
  }
  const dequeue = () => {
    if (size === 0) return
    const readIndex = front
    const value = slots[readIndex]!
    slots[readIndex] = null
    front = (front + 1) % CAPACITY
    size -= 1
    frames.push({
      slots: [...slots],
      front,
      rear,
      size,
      operation: "dequeue",
      activeIndex: readIndex,
      value,
      wrapped: front === 0,
      message: `dequeue()=${value}：清空槽 ${readIndex}，front=(${readIndex}+1) mod ${CAPACITY}=${front}`,
    })
  }

  enqueue("A")
  enqueue("B")
  enqueue("C")
  enqueue("D")
  dequeue()
  dequeue()
  enqueue("E")
  enqueue("F")
  enqueue("G")
  enqueue("H")
  dequeue()
  return frames
}

const FRAMES = buildFrames()

export function CircularQueueAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const centerX = Math.min(235, Math.max(155, cssW * 0.34))
    const centerY = 165
    const radius = Math.min(95, Math.max(72, cssW * 0.16))
    const cellW = Math.min(66, radius * 0.72)
    const cellH = 42
    const point = (index: number, extraRadius = 0) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / CAPACITY
      return { x: centerX + Math.cos(angle) * (radius + extraRadius), y: centerY + Math.sin(angle) * (radius + extraRadius), angle }
    }

    ctx.strokeStyle = dark ? "rgba(99,102,241,.28)" : "rgba(99,102,241,.18)"
    ctx.lineWidth = 13
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = muted
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("固定数组", centerX, centerY - 9)
    ctx.fillText(`容量 ${CAPACITY}`, centerX, centerY + 10)

    frame.slots.forEach((value, index) => {
      const p = point(index)
      const active = index === frame.activeIndex
      const color = frame.operation === "dequeue" ? "#ef4444" : "#10b981"
      ctx.fillStyle = active ? color : value ? (dark ? "#3730a3" : "#e0e7ff") : dark ? "#27272a" : "#fafafa"
      ctx.strokeStyle = active ? color : value ? "#6366f1" : border
      ctx.lineWidth = active ? 3 : 1.5
      ctx.fillRect(p.x - cellW / 2, p.y - cellH / 2, cellW, cellH)
      ctx.strokeRect(p.x - cellW / 2, p.y - cellH / 2, cellW, cellH)
      ctx.fillStyle = active || (value && dark) ? "#fff" : fg
      ctx.font = "700 16px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(value ?? "·", p.x, p.y)
      ctx.fillStyle = muted
      ctx.font = "10px ui-monospace, monospace"
      const indexPoint = point(index, 35)
      ctx.fillText(`[${index}]`, indexPoint.x, indexPoint.y)
    })

    const drawPointer = (index: number, label: string, color: string, tangentialOffset: number) => {
      const outer = point(index, 66)
      const inner = point(index, cellW / 2 + 5)
      const tx = -Math.sin(outer.angle) * tangentialOffset
      const ty = Math.cos(outer.angle) * tangentialOffset
      const ox = outer.x + tx
      const oy = outer.y + ty
      const ix = inner.x + tx * 0.3
      const iy = inner.y + ty * 0.3
      const angle = Math.atan2(iy - oy, ix - ox)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ix, iy)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(ix - 8 * Math.cos(angle - 0.5), iy - 8 * Math.sin(angle - 0.5))
      ctx.lineTo(ix - 8 * Math.cos(angle + 0.5), iy - 8 * Math.sin(angle + 0.5))
      ctx.closePath()
      ctx.fill()
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(label, ox, oy - 12)
    }
    if (frame.front === frame.rear) {
      drawPointer(frame.front, `front=rear=${frame.front}`, frame.size === 0 ? "#a1a1aa" : "#f59e0b", 0)
    } else {
      drawPointer(frame.front, `front=${frame.front}`, "#3b82f6", -15)
      drawPointer(frame.rear, `rear=${frame.rear}`, "#f59e0b", 15)
    }

    const panelX = Math.max(centerX + radius + 82, cssW * 0.59)
    const panelW = Math.max(160, cssW - panelX - 22)
    ctx.fillStyle = dark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.035)"
    ctx.strokeStyle = dark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.fillRect(panelX, 70, panelW, 192)
    ctx.strokeRect(panelX, 70, panelW, 192)
    ctx.fillStyle = fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("指针约定", panelX + 15, 96)
    ctx.fillStyle = muted
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.fillText("front：下一次读取的位置", panelX + 15, 125)
    ctx.fillText("rear：下一次写入的位置", panelX + 15, 151)
    ctx.fillText("移动：(index + 1) mod 6", panelX + 15, 177)
    ctx.fillText(`size：${frame.size} / ${CAPACITY}`, panelX + 15, 203)
    ctx.fillStyle = frame.size === CAPACITY ? "#ef4444" : frame.size === 0 ? muted : "#10b981"
    ctx.font = "700 14px ui-sans-serif, system-ui"
    ctx.fillText(frame.size === CAPACITY ? "队列已满" : frame.size === 0 ? "队列为空" : `${CAPACITY - frame.size} 个空位`, panelX + 15, 236)

    ctx.fillStyle = frame.wrapped ? "#f59e0b" : fg
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(frame.wrapped ? `${frame.message}（发生环绕）` : frame.message, cssW / 2, cssH - 20)
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
          "循环队列用固定数组保存先进先出的数据。front 指向下一次读取的位置，rear 指向下一次写入的位置，size 用来区分空队列与满队列。",
          "入队时把元素写到 rear，再令 rear 等于 rear 加一后对容量取模；出队则读取 front，再用同样的取模公式移动 front。两种操作都是 O(1)。",
          "A 和 B 出队后，数组开头出现空位，但 C 和 D 仍在后半段。普通线性队列可能误以为尾部没空间，循环队列会继续向前环绕，重新利用这些空槽。",
          "当 rear 从五加一对六取模得到零时，写指针回到了数组开头。继续入队直到 size 等于容量；此时 front 可以等于 rear，但 size 告诉我们这是满而不是空。",
          "随后再出队，front 也继续沿环移动。环形画法只是把固定数组首尾相接的逻辑直观化，底层索引仍然是零到五。",
        ],
        (index) => setPos(Math.min(index, total - 1))
      ),
  })

  const frame = FRAMES[pos]
  const caption = done
    ? "front 继续前进后队列保持 FIFO；取模让固定数组的尾部与开头在逻辑上相连。"
    : frame.wrapped
      ? `${frame.message}，索引通过取模回到 0。`
      : frame.message

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 340, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">步骤 {pos + 1} / {total}</div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{done ? "重新演示" : playing ? "暂停" : "播放"}</Button>
          <Button size="sm" variant="outline" onClick={step} disabled={playing || done}><SkipForward className="size-4" /> 单步</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="size-4" /> 重置</Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=front · 橙=rear · 绿=入队 · 红=出队</span>
        </div>
      )}
    </div>
  )
}
