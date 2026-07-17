/** 最大堆建堆 + 逐次取顶的完整堆排序。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

type Phase = "initial" | "build" | "extract" | "done"

interface HeapFrame {
  arr: number[]
  heapEnd: number
  compare: [number, number] | null
  swap: [number, number] | null
  active: number | null
  phase: Phase
  caption: string
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildFrames(input: number[]): HeapFrame[] {
  const a = [...input]
  const frames: HeapFrame[] = []
  const push = (
    caption: string,
    phase: Phase,
    heapEnd: number,
    opts: Partial<Pick<HeapFrame, "compare" | "swap" | "active">> = {},
  ) => frames.push({ arr: [...a], heapEnd, phase, compare: opts.compare ?? null, swap: opts.swap ?? null, active: opts.active ?? null, caption })

  const siftDown = (start: number, end: number, phase: "build" | "extract") => {
    let root = start
    while (root * 2 + 1 <= end) {
      const left = root * 2 + 1
      const right = left + 1
      let larger = left
      push(`比较父节点 ${a[root]} 与左孩子 ${a[left]}`, phase, end, { compare: [root, left], active: root })
      if (right <= end) {
        push(`比较两个孩子 ${a[left]} 与 ${a[right]}，选择较大者`, phase, end, { compare: [left, right], active: root })
        if (a[right] > a[left]) larger = right
      }
      push(`较大孩子是 ${a[larger]}，与父节点 ${a[root]} 比较`, phase, end, { compare: [root, larger], active: root })
      if (a[root] >= a[larger]) {
        push(`${a[root]} ≥ ${a[larger]}，这一支已经满足最大堆性质`, phase, end, { active: root })
        return
      }
      const parentValue = a[root]
      const childValue = a[larger]
      ;[a[root], a[larger]] = [a[larger], a[root]]
      push(`${parentValue} < ${childValue}，交换并继续向下调整`, phase, end, { swap: [root, larger], active: larger })
      root = larger
    }
  }

  push(`初始数组：${a.join("、")}`, "initial", a.length - 1)
  for (let start = Math.floor(a.length / 2) - 1; start >= 0; start--) {
    push(`从最后一个非叶节点 ${start} 开始向下调整`, "build", a.length - 1, { active: start })
    siftDown(start, a.length - 1, "build")
  }
  push(`最大堆建成，堆顶 ${a[0]} 是当前最大值`, "build", a.length - 1, { active: 0 })

  for (let end = a.length - 1; end > 0; end--) {
    const max = a[0]
    ;[a[0], a[end]] = [a[end], a[0]]
    push(`取出堆顶 ${max}，与末尾位置 ${end} 交换；${max} 就位`, "extract", end - 1, { swap: [0, end] })
    if (end - 1 > 0) {
      push(`堆范围缩到 0…${end - 1}，新堆顶 ${a[0]} 向下调整`, "extract", end - 1, { active: 0 })
      siftDown(0, end - 1, "extract")
    }
  }
  push("所有堆顶依次取出，数组升序排列完成 ✓", "done", -1)
  return frames
}

export function HeapSortAnim({
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const input = useMemo(() => {
    void seed
    return shuffled(9)
  }, [seed])
  const frames = useMemo(() => buildFrames(input), [input])
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
    const phaseText: Record<Phase, string> = { initial: "准备", build: "① 自底向上建最大堆", extract: "② 取堆顶并缩小堆", done: "排序完成" }
    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(phaseText[frame.phase], w / 2, 28)

    const treeTop = 62
    const levelGap = 58
    const radius = 17
    const heapSize = Math.max(0, frame.heapEnd + 1)
    const position = (i: number): [number, number] => {
      const level = Math.floor(Math.log2(i + 1))
      const first = 2 ** level - 1
      const inLevel = i - first
      const count = 2 ** level
      return [((inLevel + 0.5) / count) * (w - 100) + 50, treeTop + level * levelGap]
    }

    for (let i = 1; i < heapSize; i++) {
      const [x, y] = position(i)
      const [px, py] = position((i - 1) >> 1)
      ctx.strokeStyle = edge
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    for (let i = 0; i < heapSize; i++) {
      const [x, y] = position(i)
      const comparing = frame.compare?.includes(i)
      const swapping = frame.swap?.includes(i)
      ctx.fillStyle = swapping ? "#f43f5e" : comparing ? "#f59e0b" : frame.active === i ? "#8b5cf6" : dark ? "#4f46e5" : "#6366f1"
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,.35)"
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "600 13px ui-monospace, monospace"
      ctx.textBaseline = "middle"
      ctx.textAlign = "center"
      ctx.fillText(String(frame.arr[i]), x, y)
    }

    const n = frame.arr.length
    const cell = Math.min(48, (w - 72) / n)
    const x0 = (w - cell * n) / 2
    const ay = h - 65
    ctx.textBaseline = "middle"
    frame.arr.forEach((value, i) => {
      const x = x0 + i * cell
      const sorted = i > frame.heapEnd
      const comparing = frame.compare?.includes(i)
      const swapping = frame.swap?.includes(i)
      ctx.fillStyle = sorted
        ? "rgba(16,185,129,.82)"
        : swapping
          ? "rgba(244,63,94,.9)"
          : comparing
            ? "rgba(245,158,11,.85)"
            : dark
              ? "rgba(99,102,241,.22)"
              : "rgba(99,102,241,.14)"
      ctx.fillRect(x + 1, ay, cell - 2, 31)
      ctx.strokeStyle = sorted ? "#10b981" : edge
      ctx.strokeRect(x + 1, ay, cell - 2, 31)
      ctx.fillStyle = sorted || comparing || swapping ? "#fff" : fg
      ctx.font = "600 13px ui-monospace, monospace"
      ctx.fillText(String(value), x + cell / 2, ay + 15)
      ctx.fillStyle = muted
      ctx.font = "10px ui-monospace, monospace"
      ctx.fillText(String(i), x + cell / 2, ay + 43)
    })
    ctx.textBaseline = "alphabetic"
    if (heapSize === 0) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 20px ui-sans-serif, system-ui"
      ctx.fillText("升序完成", w / 2, 145)
    }
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
          "堆排序先把数组看成一棵完全二叉树。从最后一个非叶节点开始，依次向下调整。",
          "向下调整时比较两个孩子，选择较大的那个；如果它比父节点大，就交换并继续向下。全部调整后得到最大堆。",
          "最大堆的堆顶一定是当前最大值。把堆顶和堆的最后一个元素交换，最大值就固定在数组末尾。",
          "缩小堆的范围，再把新堆顶向下调整。不断取顶，最终得到升序数组，整体复杂度是 O(n log n)。",
        ],
        setIdx,
      ),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > 650) {
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
    setSeed((s) => s + 1)
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
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 350, display: "block", ...vp.canvasProps.style }} />
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
            <RotateCcw className="size-4" /> 换一组
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=比较 · 红=交换 · 绿=已取出的堆顶</span>
        </div>
      )}
    </div>
  )
}
