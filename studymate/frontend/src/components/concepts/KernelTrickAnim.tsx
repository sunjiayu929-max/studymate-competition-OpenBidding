/**
 * 概念动画 · 核技巧 Kernel Trick（机器学习 · SVM）
 * ------------------------------------------------------------------
 * 低维线性不可分 → 升到高维变可分。经典例子 φ(x)=(x, x²)：
 *   一维上 A 类(|x|小)挤中间、B 类(|x|大)在两侧，一条阈值切不开；
 *   升到二维后 A 类 x² 小在下、B 类 x² 大在上，一条水平直线即可分开。
 * 核函数让我们不必真算高维坐标，直接算高维内积 → 省计算。
 * 逐帧把点从直线抬升到抛物线，再画出分隔线。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 90
const FRAMES = 26
const THRESH = 1.3 // |x|<THRESH 为 A 类
// 一维上的点
const XS = [-2.8, -2.3, -1.9, -1.5, -1.0, -0.6, -0.2, 0.2, 0.6, 1.0, 1.5, 1.9, 2.3, 2.8]
const clsA = (x: number) => Math.abs(x) < THRESH

export function KernelTrickAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 0..FRAMES，升维进度
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
    const f = Math.min(1, posRef.current / FRAMES) // 升维比例

    const padL = 50
    const padR = 30
    const plotW = cssW - padL - padR
    const xMin = -3.4
    const xMax = 3.4
    const X = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW
    const baseY = cssH - 64 // 一维直线所在高度
    const topY = 50
    const ySpan = baseY - topY
    const x2max = 9
    const Y = (x2: number) => baseY - (x2 / x2max) * ySpan * f

    // 一维数轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(padL, baseY)
    ctx.lineTo(cssW - padR, baseY)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let x = -3; x <= 3; x++) ctx.fillText(String(x), X(x), baseY + 6)

    // 抛物线引导线 + y 轴标注（升维后）
    if (f > 0.05) {
      ctx.strokeStyle = isDark ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.25)"
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      for (let px = padL; px <= cssW - padR; px += 3) {
        const x = xMin + ((px - padL) / plotW) * (xMax - xMin)
        const y = Y(x * x)
        if (px === padL) ctx.moveTo(px, y)
        else ctx.lineTo(px, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.save()
      ctx.translate(18, (baseY + topY) / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText("新维度 x²", 0, 0)
      ctx.restore()
    }

    // 分隔线（升维到位后）：水平线 x² = THRESH²
    if (f > 0.55) {
      const ly = Y(THRESH * THRESH)
      const alpha = Math.min(1, (f - 0.55) / 0.3)
      ctx.strokeStyle = `rgba(16,185,129,${alpha})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(padL, ly)
      ctx.lineTo(cssW - padR, ly)
      ctx.stroke()
      ctx.fillStyle = `rgba(16,185,129,${alpha})`
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.textBaseline = "bottom"
      ctx.fillText("分隔线 (一条直线即可分开)", cssW - padR, ly - 4)
    }

    // 点
    for (const x of XS) {
      const a = clsA(x)
      const px = X(x)
      const py = Y(x * x)
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fillStyle = a ? "#6366f1" : "#f43f5e"
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)"
      ctx.stroke()
    }

    // 顶部说明
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(f < 0.1 ? "① 一维：蓝(中间)红(两侧)交错，一条阈值切不开" : f < 0.9 ? "② 升维 φ(x)=(x, x²)：点抬升到抛物线" : "③ 二维：蓝在下红在上，一条水平直线分开！", 118, 26)
    // 图例
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = "#6366f1"
    ctx.textAlign = "right"
    ctx.fillText("● A 类(|x|小)", cssW - 187, 26)
    ctx.fillStyle = "#f43f5e"
    ctx.fillText("● B 类(|x|大)", cssW - 92, 26)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < FRAMES) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= FRAMES
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
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
        FRAMES + 1,
        [
          "有些数据在原始空间里,根本没法用一条直线分开。你看这一维上,蓝色 A 类挤在中间,红色 B 类分散在两边,无论阈值切在哪,总有一边混着两类。",
          "核技巧的思路是:把数据映射到更高的维度。这里用一个简单的映射 φ(x)=(x, x²),给每个点添上一个「x 的平方」作为新维度。本来挤在一条线上的点,就被抬升到了一条抛物线上。",
          "抬上去之后,奇妙的事情发生了:中间的 A 类 x² 小、待在下面,两边的 B 类 x² 大、跑到了上面。",
          "现在,只要一条水平的直线,就能把两类干净利落地分开!而真正的「核函数」更聪明:它让我们不必真的去算高维坐标,只要直接算高维空间里的内积就行,省下大量计算。SVM 配上 RBF 核、多项式核,就能在原空间画出各种弯曲的决策边界。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? "升维后 A 类(x²小)在下、B 类(x²大)在上，一条水平直线即可分开。核函数=不算高维坐标、直接算高维内积。"
    : pos === 0
      ? "一维上蓝(中)红(两侧)交错，线性不可分。点播放看 φ(x)=(x,x²) 升维变可分。"
      : "升维中：每个点抬升到 (x, x²)，原空间的非线性边界 → 高维的线性边界。"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          升维 {Math.round((Math.min(pos, FRAMES) / FRAMES) * 100)}%
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放升维"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=A(中间) · 红=B(两侧) · 升维后一线分开</span>
        </div>
      )}
    </div>
  )
}
