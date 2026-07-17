/**
 * 概念动画 · 最大似然估计 MLE（机器学习 · 统计基础）
 * ------------------------------------------------------------------
 * 「这堆数据最可能来自哪个分布？」假设来自正态分布、固定 σ，只调均值 μ：
 *   - 把候选 μ 从左扫到右，每个 μ 算一次对数似然 ℓ(μ)=Σ logN(xᵢ;μ,σ)（真实算）；
 *   - 上面的钟形曲线套在数据上，下面 ℓ(μ) 曲线被逐步描出；
 *   - ℓ(μ) 在 μ=样本均值处达到最大 → 最大似然估计。
 * 最小二乘 / 交叉熵本质都是最大似然，这是绝大多数模型训练的根。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const DATA = [3.1, 4.6, 5.2, 5.8, 6.1, 6.7, 7.3, 8.4]
const SIG = 1.5
const MEAN = DATA.reduce((a, b) => a + b, 0) / DATA.length // = 5.9
const MU0 = 3.2
const MU1 = 8.6
const FRAMES = 44
const muAt = (i: number) => MU0 + (MU1 - MU0) * (i / FRAMES)
const pdf = (x: number, mu: number) => Math.exp(-((x - mu) ** 2) / (2 * SIG * SIG)) / (SIG * Math.sqrt(2 * Math.PI))
const logLik = (mu: number) => DATA.reduce((s, x) => s + (-0.5 * Math.log(2 * Math.PI * SIG * SIG) - (x - mu) ** 2 / (2 * SIG * SIG)), 0)
let LLMIN = Infinity
let LLMAX = -Infinity
for (let i = 0; i <= FRAMES; i++) {
  const l = logLik(muAt(i))
  LLMIN = Math.min(LLMIN, l)
  LLMAX = Math.max(LLMAX, l)
}
const STEP_MS = 80

export function MleAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
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
    const mu = muAt(posRef.current)

    const padL = 46
    const padR = 28
    const plotW = cssW - padL - padR
    const VMINX = 2.4
    const VMAXX = 9.2
    const X = (v: number) => padL + ((v - VMINX) / (VMAXX - VMINX)) * plotW

    // ===== 上：数据 + 钟形曲线 =====
    const axisY = 168
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(padL, axisY)
    ctx.lineTo(cssW - padR, axisY)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let v = 3; v <= 9; v++) ctx.fillText(String(v), X(v), axisY + 6)

    // 钟形曲线 N(mu, sig)
    const bellScale = 210
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let px = padL; px <= cssW - padR; px += 2) {
      const v = VMINX + ((px - padL) / plotW) * (VMAXX - VMINX)
      const y = axisY - pdf(v, mu) * bellScale
      if (px === padL) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    ctx.stroke()
    // μ 竖线
    ctx.strokeStyle = "rgba(99,102,241,0.5)"
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(X(mu), axisY - pdf(mu, mu) * bellScale)
    ctx.lineTo(X(mu), axisY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "#6366f1"
    ctx.font = "600 11px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(`μ=${mu.toFixed(2)}`, X(mu), axisY - pdf(mu, mu) * bellScale - 4)

    // 数据点 + 在曲线上的高度（似然贡献）
    for (const x of DATA) {
      const h = pdf(x, mu)
      const cy = axisY - h * bellScale
      ctx.strokeStyle = isDark ? "rgba(244,63,94,0.4)" : "rgba(244,63,94,0.35)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(X(x), axisY)
      ctx.lineTo(X(x), cy)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(X(x), axisY, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = "#f43f5e"
      ctx.fill()
      ctx.beginPath()
      ctx.arc(X(x), cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = "#6366f1"
      ctx.fill()
    }

    // ===== 下：对数似然曲线 ℓ(μ) =====
    const llBase = cssH - 28
    const llTop = 198
    const LY = (l: number) => llBase - ((l - LLMIN) / (LLMAX - LLMIN)) * (llBase - llTop)
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, llBase)
    ctx.lineTo(cssW - padR, llBase)
    ctx.stroke()
    // 已描出的部分（从 MU0 到当前 μ）
    ctx.strokeStyle = "#10b981"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let started = false
    for (let i = 0; i <= posRef.current; i++) {
      const m = muAt(i)
      const px = X(m)
      const py = LY(logLik(m))
      if (!started) {
        ctx.moveTo(px, py)
        started = true
      } else ctx.lineTo(px, py)
    }
    ctx.stroke()
    // 当前点
    const curPx = X(mu)
    const curPy = LY(logLik(mu))
    ctx.beginPath()
    ctx.arc(curPx, curPy, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = "#10b981"
    ctx.fill()
    // 峰值标记（μ*=样本均值）
    if (mu >= MEAN - 0.06) {
      ctx.strokeStyle = "rgba(16,185,129,0.5)"
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(X(MEAN), LY(logLik(MEAN)))
      ctx.lineTo(X(MEAN), llBase)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = "#10b981"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(`最大似然 μ*=${MEAN.toFixed(1)}（=样本均值）`, X(MEAN), LY(logLik(MEAN)) - 8)
    }
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("对数似然 ℓ(μ)", padL, llTop - 4)

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.fillText("最大似然：哪个 μ 让这堆数据出现的概率最大？", 118, 26)
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
          "最大似然估计要回答一个问题:这堆数据,最可能是从哪个分布里生出来的?我们先假设它来自一个正态分布,标准差固定,只调均值 μ。一开始 μ 放在左边,钟形曲线套在数据上很别扭——左边空着,右边的点几乎落在曲线尾巴上,概率很低。",
          "我们让 μ 从左往右扫。每挪到一个位置,就把每个数据点在当前曲线下的高度——也就是它的概率密度——全乘起来,取对数加起来,得到下面这条对数似然曲线。曲线越高,说明这个 μ 越能解释这堆数据。",
          "当 μ 挪到数据正中间,钟形曲线最贴合这一堆点,每个点都落在曲线高处,下面的对数似然也爬到了最高点。",
          "这个让似然最大的 μ,就是最大似然估计。对正态分布来说,它正好等于样本均值。最大似然是绝大多数模型训练的根:最小二乘、最小化交叉熵,本质上都是在做最大似然。",
        ],
        (i) => setPos(i)
      ),
  })

  const mu = muAt(pos)
  const caption = done
    ? `μ* = ${MEAN.toFixed(1)}（样本均值）让对数似然最大 → 这就是最大似然估计。最小二乘 / 交叉熵本质都是它。`
    : `候选 μ=${mu.toFixed(2)}：把各点的概率密度连乘取对数 = 对数似然 ${logLik(mu).toFixed(1)}。扫到样本均值处最大。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          μ = {mu.toFixed(2)}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "扫描 μ"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">红=数据 · 蓝=钟形曲线 · 绿=对数似然</span>
        </div>
      )}
    </div>
  )
}
