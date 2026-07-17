/**
 * 概念动画 · 残差连接 ResNet（机器学习 · 深层网络）
 * ------------------------------------------------------------------
 * 退化问题：朴素堆叠太深，信号/梯度逐层衰减、反而更难训(非过拟合)。
 * 残差连接：每个块加「捷径」让输入 x 跳过去和输出相加 y=F(x)+x，
 *   块只需学残差 F；即使 F→0，x 也原样穿过 → 信号/梯度不衰减。
 * 左=朴素(信号逐层衰减)，右=残差(捷径保住信号)，逐层揭示对照。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 700
const L = 7 // 块数
const DECAY = 0.72 // 朴素网每层信号衰减
const plainSig = (l: number) => Math.pow(DECAY, l)
const resSig = (layer: number) => {
  void layer
  return 1
} // 残差：identity 主导，信号几乎不衰减

export function ResNetAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已揭示到第几层 0..L
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
    const p = posRef.current

    const top = 56
    const bot = cssH - 44
    const rowH = (bot - top) / (L + 1)
    const bw = 150
    const colX = [cssW * 0.28 - bw / 2, cssW * 0.68 - bw / 2]
    const titles = ["朴素深网", "残差网络 ResNet"]

    for (let col = 0; col < 2; col++) {
      const cx = colX[col]
      ctx.fillStyle = col === 0 ? "#f43f5e" : "#10b981"
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(titles[col], cx + bw / 2, top - 20)

      // 输入(底) → 块 → 输出(顶)
      for (let l = 0; l <= L; l++) {
        const y = bot - l * rowH - rowH * 0.7
        const revealed = l <= p
        const sig = col === 0 ? plainSig(l) : resSig(l)
        const isInput = l === 0
        // 连线
        if (l > 0 && l <= p) {
          ctx.strokeStyle = col === 0 ? "#f43f5e" : "#10b981"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(cx + bw / 2, bot - (l - 1) * rowH - rowH * 0.7)
          ctx.lineTo(cx + bw / 2, y + rowH * 0.55)
          ctx.stroke()
          // 残差捷径（跳过本块）
          if (col === 1) {
            ctx.strokeStyle = "#6366f1"
            ctx.lineWidth = 2
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(cx + bw + 6, bot - (l - 1) * rowH - rowH * 0.7)
            ctx.quadraticCurveTo(cx + bw + 28, (bot - (l - 1) * rowH - rowH * 0.7 + y) / 2, cx + bw + 6, y)
            ctx.stroke()
            ctx.setLineDash([])
            // ⊕
            ctx.fillStyle = "#6366f1"
            ctx.font = "12px ui-sans-serif, system-ui"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText("⊕", cx + bw + 6, y + 1)
          }
        }
        // 块
        const hh = 0.55 * rowH
        const intensity = revealed ? 0.15 + sig * 0.7 : 0.05
        ctx.fillStyle = isInput
          ? "#6366f1"
          : col === 0
            ? `rgba(244,63,94,${intensity})`
            : `rgba(16,185,129,${intensity})`
        ctx.fillRect(cx, y, bw, hh)
        ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 1
        ctx.strokeRect(cx, y, bw, hh)
        if (revealed) {
          ctx.fillStyle = sig > 0.5 || isInput ? "#fff" : FG
          ctx.font = "600 12px ui-sans-serif, system-ui"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(isInput ? "输入 x  信号=1.00" : `${col === 1 ? "F(x)+x" : "块"}  信号=${sig.toFixed(2)}`, cx + bw / 2, y + hh / 2)
        }
      }
    }

    // 顶部说明
    ctx.fillStyle = FG
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("信号自下而上逐层传递 · 颜色越淡=信号越弱", 118, 24)
    ctx.fillStyle = "#6366f1"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.fillText("蓝色虚线=残差捷径 (y=F(x)+x)", cssW - 92, 24)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < L) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= L
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < L) setPos((p) => p + 1)
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
        L + 1,
        [
          "网络越深就越强吗?不一定。把普通的层一味地往深里堆,反而更难训练、精度还会下降——这叫退化问题,注意它不是过拟合。你看左边这个朴素深网,信号从底下的输入往上传,每过一层就弱一截,到顶上几乎没了。",
          "残差连接想了个妙招:给每个块加一条捷径,把这个块的输入 x,直接跳过去、和块的输出相加,写成 y = F(x) + x。这么一来,块要学的不再是完整的映射,而只是「还差多少」的那点残差 F。",
          "这条蓝色捷径,就成了一条高速公路:哪怕这个块啥也没学到、F 趋近于 0,输入 x 也能原样穿过去。所以你看右边残差网,信号几乎不衰减地一路传到顶。",
          "反向传播时同理,梯度能顺着这些捷径无损地流回浅层,梯度消失也被大大缓解。于是网络能堆到几百甚至上千层还训得动。ResNet 正是靠它拿下 2015 年 ImageNet 冠军,如今残差连接是几乎所有深层网络、包括 Transformer 的标配。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? `信号传到顶层：朴素网衰减到 ${plainSig(L).toFixed(2)}，残差网仍 ${resSig(L).toFixed(2)}。捷径 y=F(x)+x 让信号/梯度不衰减 → 可训极深网络。`
    : pos === 0
      ? "对照朴素深网 vs 残差网络。点播放看信号逐层传递：朴素衰减、残差靠捷径保住。"
      : `第 ${pos} 层：朴素信号=${plainSig(pos).toFixed(2)}(衰减)，残差=${resSig(pos).toFixed(2)}(捷径保住)。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          层 {Math.min(pos, L)} / {L}
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
            <SkipForward className="size-4" /> 单步（上一层）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">红=朴素(衰减) · 绿=残差 · 蓝虚线=捷径</span>
        </div>
      )}
    </div>
  )
}
