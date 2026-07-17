/**
 * 概念动画 · 归并排序（数据结构与算法）
 * ------------------------------------------------------------------
 * 思路：录制一趟真实归并排序（top-down 分治）成帧，逐帧回放。
 *   - 递归把区间二分到底，再两两「归并」：比较左右子区间队首，小的先落位。
 *   - 柱高=值；当前归并区间整体高亮，刚写入的位置标 amber，全部完成转 emerald。
 *   - ▶播放/⏸暂停/⏭单步/↻重置（重置重新打乱，可反复演示）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

interface MFrame {
  arr: number[]
  range: [number, number] | null // 当前归并区间
  writeIdx: number | null // 刚写入的位置
  sorted: boolean // 全部完成
  caption: string
}

function genFrames(input: number[]): MFrame[] {
  const a = [...input]
  const frames: MFrame[] = []
  const push = (e: Partial<MFrame>, caption: string) =>
    frames.push({
      arr: [...a],
      range: e.range ?? null,
      writeIdx: e.writeIdx ?? null,
      sorted: e.sorted ?? false,
      caption,
    })

  const merge = (lo: number, mid: number, hi: number) => {
    push({ range: [lo, hi] }, `归并区间 [${lo},${hi}]：左 [${lo},${mid}] + 右 [${mid + 1},${hi}]`)
    const temp = a.slice(lo, hi + 1)
    let i = lo
    let j = mid + 1
    let k = lo
    while (i <= mid && j <= hi) {
      const lv = temp[i - lo]
      const rv = temp[j - lo]
      if (lv <= rv) {
        a[k] = lv
        push({ range: [lo, hi], writeIdx: k }, `比较 ${lv} ≤ ${rv}，取 ${lv} 放到位置 ${k}`)
        i++
      } else {
        a[k] = rv
        push({ range: [lo, hi], writeIdx: k }, `比较 ${lv} > ${rv}，取 ${rv} 放到位置 ${k}`)
        j++
      }
      k++
    }
    while (i <= mid) {
      a[k] = temp[i - lo]
      push({ range: [lo, hi], writeIdx: k }, `左侧剩 ${temp[i - lo]}，依次落到位置 ${k}`)
      i++
      k++
    }
    while (j <= hi) {
      a[k] = temp[j - lo]
      push({ range: [lo, hi], writeIdx: k }, `右侧剩 ${temp[j - lo]}，依次落到位置 ${k}`)
      j++
      k++
    }
    push({ range: [lo, hi] }, `区间 [${lo},${hi}] 归并完成，已局部有序`)
  }

  const sort = (lo: number, hi: number) => {
    if (lo >= hi) return
    const mid = (lo + hi) >> 1
    sort(lo, mid)
    sort(mid + 1, hi)
    merge(lo, mid, hi)
  }

  push({}, "初始乱序数组，自顶向下二分再归并")
  sort(0, a.length - 1)
  push({ sorted: true }, "全部归并完成，排序结束 ✓")
  return frames
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const N = 9

export function MergeSortAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)

  const initial = useMemo(() => {
    void seed
    return shuffled(N)
  }, [seed])
  const frames = useMemo(() => genFrames(initial), [initial])
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
    const labelColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)"
    const padX = 16
    const padTop = 26
    const padBottom = 22
    const n = frame.arr.length
    const gap = 8
    const barW = (cssW - padX * 2 - gap * (n - 1)) / n
    const maxV = Math.max(...frame.arr)
    const areaH = cssH - padTop - padBottom

    const inRange = (k: number) => frame.range && k >= frame.range[0] && k <= frame.range[1]

    const colorFor = (k: number): string => {
      if (frame.sorted) return isDark ? "#10b981" : "#059669" // emerald 全部完成
      if (k === frame.writeIdx) return "#f59e0b" // amber 刚写入
      if (inRange(k)) return isDark ? "#6366f1" : "#818cf8" // indigo 当前归并区间
      return isDark ? "#475569" : "#cbd5e1" // slate 区间外
    }

    // 当前归并区间底部托条
    if (frame.range && !frame.sorted) {
      const [lo, hi] = frame.range
      const x0 = padX + lo * (barW + gap)
      const x1 = padX + hi * (barW + gap) + barW
      ctx.strokeStyle = "#f59e0b"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0, padTop + areaH + 6)
      ctx.lineTo(x1, padTop + areaH + 6)
      ctx.stroke()
    }

    for (let k = 0; k < n; k++) {
      const h = (frame.arr[k] / maxV) * areaH
      const x = padX + k * (barW + gap)
      const y = padTop + (areaH - h)
      const r = 4
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.18)"
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 2
      ctx.fillStyle = colorFor(k)
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + barW, y, x + barW, y + h, r)
      ctx.arcTo(x + barW, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + barW, y, r)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = labelColor
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(String(frame.arr[k]), x + barW / 2, cssH - 7)
    }
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
          "归并排序用的是分治思想。先把数组从中间一刀一刀地二分，一直分到每段只剩一个元素——单个元素天然就是有序的。",
          "然后开始往回合并。把两个已经有序的小段合成一个大段：比较它们的队首，谁小谁先落位，再看下一个。",
          "看动画，相邻的有序段两两归并，段越并越长，而且始终保持有序。",
          "一路归并，直到最后两大段合成整体，数组就完全有序了。归并排序很稳定，时间复杂度始终是 n 乘以 log n。",
        ],
        (i) => setIdx(i)
      ),
  })

  useEffect(() => {
    const STEP_MS = lecture ? 3600 : 720
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
          <RotateCcw className="size-4" /> 重置打乱
        </Button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
          <Legend color="#818cf8" label="归并区间" />
          <Legend color="#f59e0b" label="刚落位" />
          <Legend color="#059669" label="完成" />
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
