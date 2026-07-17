/**
 * 概念动画 · 梯度消失 Vanishing Gradient（机器学习 · 深层网络训练难题）
 * ------------------------------------------------------------------
 * 真实连乘：反向传播时，某层的梯度 = 输出端梯度 × 沿途每层「激活导数 × 权重」的连乘。
 *   - Sigmoid 导数最大才 0.25，恒 <1 → 每往前一层就乘一个小于 1 的数 → 指数级衰减
 *   - 走到靠近输入的浅层，梯度≈0，几乎不更新 = 梯度消失
 *   - 换 ReLU：正区间导数恒为 1 → 梯度近乎原样穿过，深层网络才训得动
 * 反传从右(输出)扫到左(输入)，逐层看梯度大小。可切 Sigmoid / Tanh / ReLU。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { ConceptAnimProps } from "./registry"
import { Button } from "@/components/ui/button"
import { Play, Pause, RotateCcw } from "lucide-react"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const L = 8 // 层数
const STEP_MS = 600
type Act = "sigmoid" | "tanh" | "relu"
const ACT_DERIV: Record<Act, number> = { sigmoid: 0.25, tanh: 0.55, relu: 1.0 }
const ACT_LABEL: Record<Act, string> = { sigmoid: "Sigmoid (导数≤0.25)", tanh: "Tanh (导数≤1)", relu: "ReLU (正区导数=1)" }

// 每层「激活导数 × |权重|」因子（确定性，权重在 0.85~1.0 间轻微抖动让画面自然）
function factors(act: Act, seed: number): number[] {
  const d = ACT_DERIV[act]
  return Array.from({ length: L }, (_, i) => {
    const w = 0.85 + 0.15 * (((i * 31 + seed * 17) % 7) / 6)
    return +(d * w).toFixed(3)
  })
}
// grad[i] = 从输出(L-1)连乘到第 i 层；grad[L-1]=1
function grads(f: number[]): number[] {
  const g = new Array(L).fill(1)
  for (let i = L - 2; i >= 0; i--) g[i] = g[i + 1] * f[i + 1]
  return g
}

export function VanishingGradientAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [act, setAct] = useState<Act>("sigmoid")
  const [pos, setPos] = useState(L) // 已反传到的层数（从右数 pos 层可见），默认全显
  const [playing, setPlaying] = useState(false)
  const actRef = useRef<Act>("sigmoid")
  const posRef = useRef(L)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    actRef.current = act
  }, [act])
  useEffect(() => {
    posRef.current = pos
  }, [pos])
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
    applyViewport(ctx)
    const isDark = document.documentElement.classList.contains("dark")
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const a = actRef.current
    const f = factors(a, 0)
    const g = grads(f)
    const p = posRef.current

    const padX = 40
    const colW = (cssW - padX * 2) / (L - 1)
    const nodeY = 64
    const baseY = cssH - 56
    const maxBarH = baseY - 96
    // 梯度→柱高（对数，跨度 1 到 ~1e-5）
    const barH = (gv: number) => Math.max(2, maxBarH * Math.max(0, Math.min(1, 1 + Math.log10(Math.max(gv, 1e-9)) / 6)))

    // 顶部标题
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("反向传播：梯度从右(输出)往左(输入)连乘传递 · 柱高=该层梯度大小(对数)", 118, 22)
    ctx.textAlign = "right"
    ctx.fillStyle = "#6366f1"
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.fillText(ACT_LABEL[a], cssW - 92, 22)

    for (let i = 0; i < L; i++) {
      const cx = padX + i * colW
      const revealed = i >= L - p
      const isCur = i === L - p
      // 连接线 + 因子
      if (i < L - 1) {
        ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, nodeY)
        ctx.lineTo(cx + colW, nodeY)
        ctx.stroke()
      }
      // 梯度柱
      if (revealed) {
        const h = barH(g[i])
        const grd = i <= 1 && a !== "relu" ? "#f43f5e" : "#6366f1"
        ctx.fillStyle = isCur ? "#f59e0b" : grd
        ctx.fillRect(cx - 13, baseY - h, 26, h)
        // 梯度值
        ctx.fillStyle = FG
        ctx.font = "10px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.fillText(g[i] >= 0.01 ? g[i].toFixed(3) : g[i].toExponential(1), cx, baseY - h - 6)
      }
      // 节点
      ctx.beginPath()
      ctx.arc(cx, nodeY, 11, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? "#10b981" : i === L - 1 ? "#f59e0b" : revealed ? "#6366f1" : isDark ? "#27272a" : "#e4e4e7"
      ctx.fill()
      // 层号
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(i === 0 ? "输入" : i === L - 1 ? "输出" : `L${i}`, cx, baseY + 16)
      // 因子标注（往左乘谁）
      if (i < L - 1) {
        ctx.fillStyle = MUT
        ctx.font = "9px ui-monospace, monospace"
        ctx.fillText(`×${f[i + 1].toFixed(2)}`, cx + colW / 2, nodeY - 14)
      }
    }
    // 反传方向箭头
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText("◀ 梯度反向传播方向", cssW / 2, baseY + 34)
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

  const replaySweep = useCallback(() => {
    setPos(1)
    setPlaying(true)
  }, [])
  const cycleAct = useCallback(() => {
    setAct((a) => (a === "sigmoid" ? "tanh" : a === "tanh" ? "relu" : "sigmoid"))
  }, [])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      setAct("sigmoid")
      actRef.current = "sigmoid"
    },
    buildBeats: () => {
      const gs = grads(factors("sigmoid", 0))
      const gr = grads(factors("relu", 0))
      return [
        {
          apply: () => {
            setAct("sigmoid")
            setPos(1)
          },
          text: "深层网络靠反向传播来训练：梯度从最右边的输出层,沿着链式法则一层层往左传回输入层。而链式法则的本质,是把沿途每一层的「激活函数导数 × 权重」连乘起来。",
        },
        {
          frames: Array.from({ length: L }, (_, i) => i + 1),
          seek: (i: number) => {
            setAct("sigmoid")
            setPos(i)
          },
          text: "问题就出在这个连乘上。用 Sigmoid 激活,它的导数最大也才 0.25,永远小于 1。你看反传每往左走一层,梯度柱就矮一截——因为又乘上了一个小于 1 的数。",
        },
        {
          apply: () => {
            setAct("sigmoid")
            setPos(L)
          },
          text: `连乘是指数级的:走到靠近输入的浅层,梯度已经从输出端的 1 缩到了 ${gs[0].toExponential(1)},几乎归零(红柱)。梯度一没,浅层的权重就基本不更新、学不到东西——这就是梯度消失,深层网络早年训不动的元凶。`,
        },
        {
          apply: () => {
            setAct("relu")
            setPos(L)
          },
          text: `换成 ReLU 看看:它在正区间的导数恒等于 1,连乘时不再每层打折。梯度几乎原样穿过整个网络,传到输入层还有 ${gr[0].toFixed(2)} 左右(蓝柱)。ReLU 加上残差连接、批归一化,正是今天能训练几百层深网络的关键。`,
        },
      ]
    },
  })

  const f = factors(act, 0)
  const g = grads(f)
  const caption =
    act === "relu"
      ? `ReLU：正区间导数=1,连乘不衰减,梯度传到输入层仍有 ${g[0].toFixed(2)} → 深层可训练。`
      : `${act === "sigmoid" ? "Sigmoid" : "Tanh"}：导数<1,反传连乘指数衰减,到输入层梯度仅 ${g[0] >= 0.01 ? g[0].toFixed(3) : g[0].toExponential(1)} ≈ 0 → 梯度消失,浅层学不动。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {ACT_DERIV[act] === 1 ? "ReLU" : act}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={replaySweep}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />} 反传演示
          </Button>
          <Button size="sm" variant="outline" onClick={cycleAct}>
            切激活函数（当前 {act}）
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPos(L)}>
            <RotateCcw className="size-4" /> 全显
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">柱高=梯度(对数) · 红=趋近 0 的浅层</span>
        </div>
      )}
    </div>
  )
}
