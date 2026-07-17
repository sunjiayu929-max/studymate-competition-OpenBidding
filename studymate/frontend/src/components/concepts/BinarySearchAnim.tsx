/**
 * 概念动画 · 二分查找 Binary Search（数据结构与算法）
 * ------------------------------------------------------------------
 * 前提：数组有序。每步看中间元素 mid：
 *   == 目标 → 找到；< 目标 → 砍掉左半（lo=mid+1）；> 目标 → 砍掉右半（hi=mid-1）
 * 每步范围减半 → O(log n)。逐步看 lo/hi 逼近、半区被淘汰。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 1100
const ARR = [3, 8, 12, 17, 23, 28, 34, 41, 47, 52, 58, 63, 70, 76, 85]
const TARGET = 58

interface Step {
  lo: number
  hi: number
  mid: number
  cmp: "eq" | "lt" | "gt"
}
function buildSteps(): Step[] {
  const steps: Step[] = []
  let lo = 0
  let hi = ARR.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const cmp = ARR[mid] === TARGET ? "eq" : ARR[mid] < TARGET ? "lt" : "gt"
    steps.push({ lo, hi, mid, cmp })
    if (cmp === "eq") break
    if (cmp === "lt") lo = mid + 1
    else hi = mid - 1
  }
  return steps
}

export function BinarySearchAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 当前步 0..steps.length-1
  const stepsRef = useRef<Step[]>(buildSteps())
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  const total = stepsRef.current.length

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
    const steps = stepsRef.current
    const s = steps[Math.min(posRef.current, total - 1)]
    const found = s.cmp === "eq"

    const n = ARR.length
    const cw = Math.min(56, (cssW - 48) / n)
    const totW = n * cw
    const x0 = (cssW - totW) / 2
    const cy = cssH / 2 - 14
    const ch = 42

    // 目标
    ctx.fillStyle = FG
    ctx.font = "600 14px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`查找目标：${TARGET}`, cssW / 2, 34)

    for (let i = 0; i < n; i++) {
      const x = x0 + i * cw
      const inRange = i >= s.lo && i <= s.hi
      const isMid = i === s.mid
      ctx.globalAlpha = inRange ? 1 : 0.28
      ctx.fillStyle = isMid ? (found ? "#10b981" : "#f59e0b") : inRange ? (isDark ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.14)") : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"
      ctx.fillRect(x + 2, cy, cw - 4, ch)
      ctx.strokeStyle = isMid ? (found ? "#10b981" : "#f59e0b") : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = isMid ? 2.5 : 1
      ctx.strokeRect(x + 2, cy, cw - 4, ch)
      ctx.fillStyle = isMid ? "#fff" : FG
      ctx.font = "600 14px ui-monospace, monospace"
      ctx.fillText(String(ARR[i]), x + cw / 2, cy + ch / 2 + 5)
      // 下标
      ctx.globalAlpha = inRange ? 0.7 : 0.25
      ctx.fillStyle = MUT
      ctx.font = "10px ui-monospace, monospace"
      ctx.fillText(String(i), x + cw / 2, cy + ch + 14)
      ctx.globalAlpha = 1
    }

    // lo / hi / mid 标记
    const markX = (i: number) => x0 + i * cw + cw / 2
    const drawMark = (i: number, label: string, color: string, above: boolean, yOff = 0) => {
      ctx.fillStyle = color
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      if (above) {
        ctx.fillText(label, markX(i), cy - 8)
        ctx.beginPath()
        ctx.moveTo(markX(i), cy - 4)
        ctx.lineTo(markX(i) - 4, cy - 10)
        ctx.lineTo(markX(i) + 4, cy - 10)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillText(label, markX(i), cy + ch + 32 + yOff)
      }
    }
    drawMark(s.mid, "mid", found ? "#10b981" : "#f59e0b", true)
    drawMark(s.lo, "lo", "#3b82f6", false)
    // lo 与 hi 重合时（范围收敛到一格）把 hi 下移一行，避免叠成乱码
    drawMark(s.hi, "hi", "#ec4899", false, s.lo === s.hi ? 15 : 0)

    // 说明
    ctx.fillStyle = found ? "#10b981" : FG
    ctx.font = "13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    const msg = found
      ? `arr[${s.mid}] = ${ARR[s.mid]} = 目标，找到！共 ${posRef.current + 1} 步（n=${n}）`
      : s.cmp === "lt"
        ? `arr[${s.mid}]=${ARR[s.mid]} < ${TARGET} → 目标在右半，lo = ${s.mid + 1}`
        : `arr[${s.mid}]=${ARR[s.mid]} > ${TARGET} → 目标在左半，hi = ${s.mid - 1}`
    ctx.fillText(msg, cssW / 2, cy + ch + 56)
  }, [total, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total - 1) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total - 1
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total - 1) setPos((p) => p + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (done) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done])

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
          `二分查找有个硬前提:数组必须有序。我们要在这 ${ARR.length} 个升序排好的数里找 ${TARGET}。不一个个翻,而是直接看正中间那个数。`,
          `比一比:中间这个数要是正好等于目标,就找到了;要是比目标小,说明目标只可能在它右边,左半边连同它一起整个扔掉,lo 跳到 mid 右边;要是比目标大,就反过来扔掉右半。`,
          "关键就在这一扔:每比一次,搜索范围直接砍掉一半,lo 和 hi 飞快地往中间夹。",
          `所以哪怕几万个数,也就 log₂n 步——这里 ${ARR.length} 个数,几步就锁定了 ${TARGET}。这就是二分查找 O(log n) 的威力,代价仅仅是「数组得先排好序」。`,
        ],
        (i) => setPos(i)
      ),
  })

  const s = stepsRef.current[Math.min(pos, total - 1)]
  const caption =
    s.cmp === "eq"
      ? `arr[${s.mid}]=${ARR[s.mid]} 命中目标 ${TARGET}，${pos + 1} 步搞定。二分查找 O(log n)，前提：有序。`
      : pos === 0
        ? `在有序数组里找 ${TARGET}：看中间 arr[${s.mid}]=${ARR[s.mid]}，据大小砍掉一半。点播放。`
        : `arr[${s.mid}]=${ARR[s.mid]} ${s.cmp === "lt" ? "<" : ">"} ${TARGET}：砍掉${s.cmp === "lt" ? "左" : "右"}半，范围减半。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          步 {Math.min(pos + 1, total)} / {total}
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
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=mid · 蓝=lo · 粉=hi · 灰=已淘汰</span>
        </div>
      )}
    </div>
  )
}
