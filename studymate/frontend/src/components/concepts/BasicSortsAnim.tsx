/**
 * 冒泡 / 选择 / 插入排序：由真实算法录制逐帧过程，再交给 Canvas 回放。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { chunkedBeats, useLecture } from "./useLecture"

type SortMode = "bubble" | "selection" | "insertion"

interface SortFrame {
  arr: number[]
  compare: [number, number] | null
  swap: [number, number] | null
  focus: number | null
  sorted: number[]
  comparisons: number
  writes: number
  caption: string
}

const MODE_META: Record<SortMode, { name: string; complexity: string; lecture: string[] }> = {
  bubble: {
    name: "冒泡排序",
    complexity: "O(n²) · 稳定",
    lecture: [
      "冒泡排序反复比较相邻元素。如果左边比右边大，就交换它们。",
      "一趟从左扫到右，当前最大的数会像气泡一样移动到最右边，右侧因此确定有序。",
      "接着只扫描还没排好的前半段；如果一整趟都没有交换，就可以提前结束。",
      "冒泡排序简单且稳定，但平均和最坏时间复杂度都是平方级。",
    ],
  },
  selection: {
    name: "选择排序",
    complexity: "O(n²) · 原地",
    lecture: [
      "选择排序先把当前位置当作最小值候选，再扫描它右边的所有元素。",
      "遇到更小的值，只更新最小值下标；一趟扫描结束后，才把真正的最小值交换到前面。",
      "每一趟都会固定一个左侧位置，所以有序前缀不断增长。",
      "它始终要做平方级比较，但交换次数很少，最多只交换 n 减一次。",
    ],
  },
  insertion: {
    name: "插入排序",
    complexity: "O(n²) · 稳定",
    lecture: [
      "插入排序把左侧看成已经排好的序列，每次取出右边的下一个元素作为关键字。",
      "从有序区末尾向左比较；只要元素比关键字大，就把它向右移动一格。",
      "找到第一个不大于关键字的位置后，把关键字插进空位，有序区随之扩大。",
      "数据接近有序时，它只需很少移动，最好情况是线性时间。",
    ],
  },
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildFrames(input: number[], mode: SortMode): SortFrame[] {
  const a = [...input]
  const frames: SortFrame[] = []
  let comparisons = 0
  let writes = 0
  const push = (
    caption: string,
    opts: Partial<Pick<SortFrame, "compare" | "swap" | "focus" | "sorted">> = {},
  ) => {
    frames.push({
      arr: [...a],
      compare: opts.compare ?? null,
      swap: opts.swap ?? null,
      focus: opts.focus ?? null,
      sorted: opts.sorted ? [...opts.sorted] : [],
      comparisons,
      writes,
      caption,
    })
  }

  push(`初始数组：${a.join("、")}`)

  if (mode === "bubble") {
    const sorted = new Set<number>()
    for (let end = a.length - 1; end > 0; end--) {
      let changed = false
      push(`第 ${a.length - end} 趟：扫描下标 0 到 ${end}`, { focus: end, sorted: [...sorted] })
      for (let j = 0; j < end; j++) {
        comparisons++
        push(`比较相邻的 ${a[j]} 和 ${a[j + 1]}`, { compare: [j, j + 1], sorted: [...sorted] })
        if (a[j] > a[j + 1]) {
          ;[a[j], a[j + 1]] = [a[j + 1], a[j]]
          writes += 2
          changed = true
          push(`${a[j + 1]} 更大，交换相邻元素`, { swap: [j, j + 1], sorted: [...sorted] })
        }
      }
      sorted.add(end)
      push(`${a[end]} 冒到最右侧，位置 ${end} 已确定`, { focus: end, sorted: [...sorted] })
      if (!changed) {
        for (let i = 0; i < end; i++) sorted.add(i)
        push("这一趟没有发生交换，数组已经有序，可以提前结束", { sorted: [...sorted] })
        break
      }
    }
  } else if (mode === "selection") {
    const sorted = new Set<number>()
    for (let i = 0; i < a.length - 1; i++) {
      let min = i
      push(`在未排序区间中寻找第 ${i + 1} 小的元素`, { focus: min, sorted: [...sorted] })
      for (let j = i + 1; j < a.length; j++) {
        comparisons++
        push(`比较候选最小值 ${a[min]} 与 ${a[j]}`, { compare: [min, j], focus: min, sorted: [...sorted] })
        if (a[j] < a[min]) {
          min = j
          push(`${a[min]} 更小，更新最小值候选`, { focus: min, sorted: [...sorted] })
        }
      }
      if (min !== i) {
        const chosen = a[min]
        ;[a[i], a[min]] = [a[min], a[i]]
        writes += 2
        push(`把最小值 ${chosen} 交换到位置 ${i}`, { swap: [i, min], sorted: [...sorted] })
      } else {
        push(`${a[i]} 已经在正确位置，不必交换`, { focus: i, sorted: [...sorted] })
      }
      sorted.add(i)
      push(`有序前缀扩展到位置 ${i}`, { focus: i, sorted: [...sorted] })
    }
  } else {
    for (let i = 1; i < a.length; i++) {
      const key = a[i]
      let j = i - 1
      push(`取出关键字 ${key}，准备插入左侧有序区`, {
        focus: i,
        sorted: Array.from({ length: i }, (_, k) => k),
      })
      while (j >= 0) {
        comparisons++
        push(`比较 ${a[j]} 与关键字 ${key}`, {
          compare: [j, j + 1],
          focus: j + 1,
          sorted: Array.from({ length: i }, (_, k) => k),
        })
        if (a[j] <= key) break
        a[j + 1] = a[j]
        writes++
        push(`${a[j]} 比 ${key} 大，向右移动一格`, {
          swap: [j, j + 1],
          focus: j,
          sorted: Array.from({ length: i + 1 }, (_, k) => k),
        })
        j--
      }
      a[j + 1] = key
      writes++
      push(`把关键字 ${key} 插入位置 ${j + 1}`, {
        focus: j + 1,
        sorted: Array.from({ length: i + 1 }, (_, k) => k),
      })
    }
  }

  push(`${MODE_META[mode].name}完成：比较 ${comparisons} 次，写入 ${writes} 次`, {
    sorted: a.map((_, i) => i),
  })
  return frames
}

export function BasicSortsAnim({
  lecture = false,
  narrate,
  prepareNarration,
  replayNonce = 0,
  onLectureEnd,
}: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const [mode, setMode] = useState<SortMode>("bubble")
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)

  const initial = useMemo(() => {
    void seed
    return shuffled(8)
  }, [seed])
  const frames = useMemo(() => buildFrames(initial, mode), [initial, mode])
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
    ctx.fillStyle = fg
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`${MODE_META[mode].name} · ${MODE_META[mode].complexity}`, w / 2, 30)

    const padX = 24
    const top = 58
    const bottom = 42
    const gap = 9
    const n = frame.arr.length
    const bw = (w - padX * 2 - gap * (n - 1)) / n
    const areaH = h - top - bottom
    const max = Math.max(...frame.arr)
    const sorted = new Set(frame.sorted)

    frame.arr.forEach((value, i) => {
      const bh = (value / max) * areaH
      const x = padX + i * (bw + gap)
      const y = top + areaH - bh
      const comparing = frame.compare?.includes(i)
      const swapping = frame.swap?.includes(i)
      const focused = frame.focus === i
      ctx.fillStyle = swapping
        ? "#f43f5e"
        : comparing
          ? "#f59e0b"
          : focused
            ? "#8b5cf6"
            : sorted.has(i)
              ? "#10b981"
              : dark
                ? "#6366f1"
                : "#818cf8"
      ctx.beginPath()
      ctx.roundRect(x, y, bw, bh, 5)
      ctx.fill()
      ctx.fillStyle = fg
      ctx.font = "600 12px ui-monospace, monospace"
      ctx.fillText(String(value), x + bw / 2, h - 18)
      ctx.fillStyle = muted
      ctx.font = "10px ui-monospace, monospace"
      ctx.fillText(String(i), x + bw / 2, h - 4)
    })
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
    buildBeats: () => chunkedBeats(frames.length, MODE_META[mode].lecture, setIdx),
  })

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > 620) {
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

  const chooseMode = (next: SortMode) => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
    setMode(next)
  }
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 rounded bg-[var(--card)]/75 px-2 py-1 text-[11px] font-mono text-[var(--muted-foreground)] backdrop-blur">
          {idx + 1} / {frames.length}
        </div>
      </div>
      {!lecture && <div className="border-t border-[var(--border)] px-4 py-2.5 text-sm">{frame.caption}</div>}
      {!lecture && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
          {(["bubble", "selection", "insertion"] as SortMode[]).map((item) => (
            <Button key={item} size="sm" variant={mode === item ? "default" : "outline"} onClick={() => chooseMode(item)}>
              {MODE_META[item].name.replace("排序", "")}
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
            <RotateCcw className="size-4" /> 换一组
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=比较 · 红=交换/移动 · 绿=有序</span>
        </div>
      )}
    </div>
  )
}
