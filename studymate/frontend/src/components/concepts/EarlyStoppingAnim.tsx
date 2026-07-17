/**
 * 概念动画 · 早停 Early Stopping（机器学习 · 正则化 / 训练技巧）
 * ------------------------------------------------------------------
 * 训练误差通常一路下降（模型在背训练集）；验证误差先降后升——回升点就是过拟合的信号。
 * 早停：盯住验证误差，它一旦不再下降（到达最低点）就停止训练、保留那一刻的模型。
 * 这里两条曲线由确定性函数生成，最低点 BESTE 真实算出，右侧为过拟合区。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const E = 40
const trainErr = (e: number) => 0.9 * Math.exp(-e / 9) + 0.05
const valErr = (e: number) => 0.9 * Math.exp(-e / 7) + 0.45 * (e / E) ** 2 + 0.12
let BESTE = 0
let bv = Infinity
for (let e = 0; e <= E; e++) {
  const v = valErr(e)
  if (v < bv) {
    bv = v
    BESTE = e
  }
}
const YMAX = 1.1
const STEP_MS = 110

export function EarlyStoppingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const cur = posRef.current

    const padL = 56
    const padR = 30
    const padT = 52
    const padB = 44
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const X = (e: number) => padL + (e / E) * plotW
    const Y = (v: number) => padT + (1 - v / YMAX) * plotH

    // 过拟合区阴影（最低点之后）
    if (cur >= BESTE) {
      ctx.fillStyle = isDark ? "rgba(244,63,94,0.08)" : "rgba(244,63,94,0.06)"
      ctx.fillRect(X(BESTE), padT, X(Math.min(cur, E)) - X(BESTE), plotH)
    }
    // 坐标轴
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, padT)
    ctx.lineTo(padL, padT + plotH)
    ctx.lineTo(padL + plotW, padT + plotH)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("训练轮数 epoch →", padL + plotW / 2, padT + plotH + 22)
    ctx.save()
    ctx.translate(16, padT + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("误差", 0, 0)
    ctx.restore()

    // 曲线（到当前 epoch）
    const drawCurve = (fn: (e: number) => number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let e = 0; e <= cur; e++) {
        const x = X(e)
        const y = Y(fn(e))
        if (e === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    drawCurve(trainErr, "#6366f1")
    drawCurve(valErr, "#f43f5e")

    // 标签
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillStyle = "#6366f1"
    ctx.fillText("训练误差↓", X(cur) + 6, Y(trainErr(cur)))
    ctx.fillStyle = "#f43f5e"
    ctx.fillText("验证误差", X(cur) + 6, Y(valErr(cur)) - 12)

    // 最低点 / 早停线
    if (cur >= BESTE) {
      ctx.strokeStyle = "#10b981"
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(X(BESTE), padT)
      ctx.lineTo(X(BESTE), padT + plotH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(X(BESTE), Y(valErr(BESTE)), 5, 0, Math.PI * 2)
      ctx.fillStyle = "#10b981"
      ctx.fill()
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(`← 早停点 (epoch ${BESTE})`, X(BESTE) + 64, padT + 10)
    }
    if (cur > BESTE + 2) {
      ctx.fillStyle = "#f43f5e"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("过拟合区：验证误差回升", X((BESTE + E) / 2), padT + 22)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("早停：验证误差不再下降就停，保留最好的那一刻", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < E) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= E
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
        E + 1,
        [
          "训练神经网络的时候,蓝色的训练误差通常会一路往下掉——模型把训练集背得越来越熟。",
          "但红色的验证误差不一样:它一开始也跟着降,可是降到某个点之后,反而开始回升了。",
          "这个回升,就是过拟合的信号:模型不再学习真正的规律,而是开始死记训练集里的噪声,在没见过的数据上反而越来越差。",
          "早停的做法特别简单:盯住验证误差,它一旦到达最低点、不再下降,就立刻停止训练,保留那一刻的模型,丢掉后面过拟合的部分。这是最省事、最常用的正则化手段之一。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? `验证误差在 epoch ${BESTE} 最低、之后回升(过拟合)。早停=停在最低点、保留那个模型。`
    : pos < BESTE
      ? `epoch ${pos}：训练/验证误差都在下降，继续训练。`
      : `epoch ${pos}：验证误差已过最低点(${BESTE})开始回升 → 该早停了。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          epoch {pos}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "开始训练"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=训练 · 红=验证 · 绿线=早停点</span>
        </div>
      )}
    </div>
  )
}
