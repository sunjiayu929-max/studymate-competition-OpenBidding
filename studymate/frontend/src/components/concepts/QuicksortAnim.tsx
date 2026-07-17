/**
 * 概念动画 · 快速排序（数据结构与算法旗舰）
 * ------------------------------------------------------------------
 * 思路：先把一趟真实快排（Lomuto 分区）"录制"成一串帧，再逐帧回放。
 *   - 帧由真实算法生成 → 永远正确、可单步逐帧看清每次比较 / 交换 / pivot 归位
 *   - 柱子高低 = 值大小；颜色标注角色（pivot / 比较中 / 交换中 / 已就位）
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置（重置会重新打乱，便于多次演示）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

interface QFrame {
  arr: number[]
  pivot: number | null
  i: number | null
  j: number | null
  compare: [number, number] | null
  swap: [number, number] | null
  sorted: number[]
  caption: string
}

function genFrames(input: number[]): QFrame[] {
  const a = [...input]
  const frames: QFrame[] = []
  const sorted = new Set<number>()
  const push = (e: Partial<QFrame>, caption: string) =>
    frames.push({
      arr: [...a],
      pivot: e.pivot ?? null,
      i: e.i ?? null,
      j: e.j ?? null,
      compare: e.compare ?? null,
      swap: e.swap ?? null,
      sorted: [...sorted],
      caption,
    })

  const qs = (lo: number, hi: number) => {
    if (lo > hi) return
    if (lo === hi) {
      sorted.add(lo)
      push({}, `区间只剩 a[${lo}]=${a[lo]}，已就位`)
      return
    }
    const pivot = a[hi]
    push({ pivot: hi, i: lo, j: lo }, `选 pivot = ${pivot}（区间 [${lo},${hi}] 最右元素）`)
    let i = lo
    for (let j = lo; j < hi; j++) {
      push({ pivot: hi, i, j, compare: [j, hi] }, `比较 a[${j}]=${a[j]} 与 pivot=${pivot}`)
      if (a[j] < pivot) {
        if (i !== j) {
          ;[a[i], a[j]] = [a[j], a[i]]
          push({ pivot: hi, i, j, swap: [i, j] }, `a[${j}]<pivot，交换到左区第 ${i} 位`)
        }
        i++
      }
    }
    if (i !== hi) {
      ;[a[i], a[hi]] = [a[hi], a[i]]
      push({ pivot: i, swap: [i, hi] }, `把 pivot 换到分界点第 ${i} 位`)
    }
    sorted.add(i)
    push({ pivot: i }, `pivot=${pivot} 最终位置确定 ✓ 左小右大`)
    qs(lo, i - 1)
    qs(i + 1, hi)
  }
  qs(0, a.length - 1)
  for (let k = 0; k < a.length; k++) sorted.add(k)
  push({}, "全部就位，排序完成 ✓")
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

export function QuicksortAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0) // 改变即重新生成数组
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

  // ===== 绘制 =====
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
    const padTop = 26 // 给上方指针标签留空间
    const padBottom = 22 // 给下方数值留空间
    const n = frame.arr.length
    const gap = 8
    const barW = (cssW - padX * 2 - gap * (n - 1)) / n
    const maxV = Math.max(...frame.arr)
    const areaH = cssH - padTop - padBottom

    const colorFor = (k: number): string => {
      if (frame.sorted.includes(k)) return isDark ? "#10b981" : "#059669" // emerald 已就位
      if (frame.swap && (k === frame.swap[0] || k === frame.swap[1]))
        return "#f43f5e" // rose 交换中
      if (k === frame.pivot) return "#f59e0b" // amber pivot
      if (frame.compare && (k === frame.compare[0] || k === frame.compare[1]))
        return "#eab308" // yellow 比较中
      return isDark ? "#6366f1" : "#818cf8" // indigo 默认
    }

    for (let k = 0; k < n; k++) {
      const h = (frame.arr[k] / maxV) * areaH
      const x = padX + k * (barW + gap)
      const y = padTop + (areaH - h)
      const r = 4
      // 圆角矩形（柔和阴影）
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

      // 数值
      ctx.fillStyle = labelColor
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(String(frame.arr[k]), x + barW / 2, cssH - 7)

      // 指针标签（pivot / i / j）
      const tags: string[] = []
      if (k === frame.pivot) tags.push("pivot")
      if (k === frame.i) tags.push("i")
      if (k === frame.j) tags.push("j")
      if (tags.length) {
        ctx.fillStyle = "#f59e0b"
        ctx.font = "bold 10px ui-sans-serif, system-ui"
        ctx.fillText(tags.join("·"), x + barW / 2, 14)
      }
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
          "快速排序的核心是分区。我们先在当前区间选一个基准值，叫 pivot，这里取最右边那个数。",
          "然后一个指针从左往右扫，把所有比 pivot 小的数都甩到左边、大的留在右边。扫完之后，把 pivot 交换到中间它该在的位置。",
          "这下 pivot 就归位了——它左边的全比它小、右边的全比它大。接着对左、右两个子区间，递归地做同样的事：选基准、分区、归位。",
          "一层层分下去，区间越来越小。当每个区间都只剩一个元素，再也不用分了，整个数组就排好序了。",
        ],
        (i) => setIdx(i)
      ),
  })

  // ===== 主循环 =====
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
    setSeed((s) => s + 1) // 重新打乱
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

      {!lecture && (
        <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">
          {frame.caption}
        </div>
      )}

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
          <Legend color="#f59e0b" label="pivot" />
          <Legend color="#eab308" label="比较" />
          <Legend color="#f43f5e" label="交换" />
          <Legend color="#059669" label="已就位" />
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
