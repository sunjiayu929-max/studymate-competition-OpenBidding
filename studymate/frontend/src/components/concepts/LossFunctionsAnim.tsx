/**
 * 概念动画 · 损失函数对比 Loss Functions（机器学习 · 基础）
 * ------------------------------------------------------------------
 * 损失函数衡量预测错得多离谱，训练就是最小化它。两类对照：
 *   回归(横轴=预测误差 r)：MSE=r²(对离群点敏感)、MAE=|r|(稳健)、Huber(折中)
 *   分类(横轴=间隔 m)：交叉熵=log(1+e⁻ᵐ)、合页 hinge=max(0,1−m)、0-1
 * 切换回归/分类，看不同损失「在乎什么」。曲线为真实函数值。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

type Mode = "reg" | "cls"
const HUBER_D = 1
const regLosses = [
  { name: "MSE 平方", col: "#6366f1", f: (r: number) => r * r },
  { name: "MAE 绝对", col: "#10b981", f: (r: number) => Math.abs(r) },
  { name: "Huber(δ=1)", col: "#f59e0b", f: (r: number) => (Math.abs(r) <= HUBER_D ? 0.5 * r * r : HUBER_D * (Math.abs(r) - 0.5 * HUBER_D)) },
]
const clsLosses = [
  { name: "交叉熵", col: "#6366f1", f: (m: number) => Math.log(1 + Math.exp(-m)) },
  { name: "合页 hinge", col: "#10b981", f: (m: number) => Math.max(0, 1 - m) },
  { name: "0-1", col: "#a1a1aa", f: (m: number) => (m < 0 ? 1 : 0) },
]

export function LossFunctionsAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [mode, setMode] = useState<Mode>("reg")
  const modeRef = useRef<Mode>("reg")
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

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
    const m = modeRef.current
    const losses = m === "reg" ? regLosses : clsLosses

    const padL = 50
    const padR = 30
    const padT = 40
    const padB = 40
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const xMin = -3
    const xMax = 3
    const yMax = m === "reg" ? 5 : 3.2
    const X = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW
    const Y = (y: number) => padT + plotH - (Math.min(y, yMax) / yMax) * plotH

    // 轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    ctx.strokeRect(padL, padT, plotW, plotH)
    // x=0 竖线
    ctx.strokeStyle = isDark ? "#52525b" : "#cbd5e1"
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(X(0), padT)
    ctx.lineTo(X(0), padT + plotH)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(m === "reg" ? "预测误差 r = 预测 − 真实 →" : "间隔 m（分对且越自信越靠右）→", padL + plotW / 2, cssH - 22)
    ctx.save()
    ctx.translate(16, padT + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("损失", 0, 0)
    ctx.restore()
    for (let x = -3; x <= 3; x++) {
      ctx.fillStyle = MUT
      ctx.fillText(String(x), X(x), padT + plotH + 6)
    }

    // 曲线
    losses.forEach((L) => {
      ctx.strokeStyle = L.col
      ctx.lineWidth = 2.5
      ctx.beginPath()
      let started = false
      for (let px = padL; px <= cssW - padR; px += 2) {
        const x = xMin + ((px - padL) / plotW) * (xMax - xMin)
        const v = L.f(x)
        const y = Y(v)
        // 0-1 阶跃单独处理（避免竖线斜连）
        if (L.name === "0-1") {
          if (!started) {
            ctx.moveTo(px, y)
            started = true
          } else ctx.lineTo(px, y)
        } else {
          if (!started) {
            ctx.moveTo(px, y)
            started = true
          } else ctx.lineTo(px, y)
        }
      }
      ctx.stroke()
    })

    // 图例（起点避开左上角缩放控件）
    let lx = 118
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textBaseline = "middle"
    for (const L of losses) {
      ctx.fillStyle = L.col
      ctx.fillRect(lx, padT - 22, 14, 4)
      ctx.textAlign = "left"
      ctx.fillText(L.name, lx + 18, padT - 20)
      lx += 18 + ctx.measureText(L.name).width + 20
    }

    // 标题（右对齐避开右上角徽章）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(m === "reg" ? "回归损失" : "分类损失", cssW - 92, padT - 22)
  }, [applyViewport])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => [
      {
        apply: () => setMode("reg"),
        text: "损失函数,衡量模型预测得有多离谱,训练的全部目的就是把它压到最小。先看回归问题,横轴是预测误差,也就是预测值减真实值,误差为 0 在正中间。",
      },
      {
        apply: () => setMode("reg"),
        text: "蓝色是 MSE 平方误差:误差一大,惩罚就平方级地暴涨,所以它对离群点极其敏感、会拼命去纠正那个大错。绿色 MAE 绝对误差:线性增长,不会被个别离群点带跑,更稳健。橙色 Huber:小误差时像 MSE 一样平滑,大误差时像 MAE 一样克制,取两者之长。",
      },
      {
        apply: () => setMode("cls"),
        text: "再换到分类,横轴变成「间隔」——分对了、而且越自信,就越往右。蓝色交叉熵:一旦分错还很自信,也就是间隔为很负,惩罚趋向无穷大,逼着模型别瞎自信。绿色合页损失是 SVM 用的:只要分对且间隔超过 1,损失直接归零,它只盯着边界附近那些点。",
      },
      {
        apply: () => setMode("cls"),
        text: "所以选对损失函数很关键:回归数据里有离群点,就用 MAE 或 Huber;分类任务一般用交叉熵。说到底,损失函数定义了模型到底「在乎什么」、会朝哪个方向去优化。",
      },
    ],
  })

  const caption =
    mode === "reg"
      ? "回归损失：MSE(r²)对离群点敏感、MAE(|r|)稳健、Huber 折中。点「分类损失」切换。"
      : "分类损失：交叉熵 log(1+e⁻ᵐ) 罚「错得自信」、hinge 分对且间隔≥1 即零损失。"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {mode === "reg" ? "回归" : "分类"}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" variant={mode === "reg" ? "default" : "outline"} onClick={() => setMode("reg")}>
            回归损失
          </Button>
          <Button size="sm" variant={mode === "cls" ? "default" : "outline"} onClick={() => setMode("cls")}>
            分类损失
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">曲线=真实损失函数值 · 损失定义模型「在乎什么」</span>
        </div>
      )}
    </div>
  )
}
