/**
 * 概念动画 · 权重初始化 Xavier / He（机器学习 · 训练技巧）
 * ------------------------------------------------------------------
 * 深层网络里权重初始大小很关键：太小 → 激活方差逐层衰减为 0（信号/梯度消失）；
 * 太大 → 逐层放大冲进 tanh 饱和区（梯度消失 + 易爆炸）；
 * Xavier/Glorot：让权重方差 = 1/输入维度，每层激活方差大致不变（He 版取 2/输入维度，配 ReLU）。
 * 这里真实前向传播 8 层、宽 48 的网络（确定性随机权重 + tanh），实测每层激活标准差。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const NL = 8
const W = 48
function rnd(s: number) {
  const x = Math.sin(s * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
function gauss(s: number) {
  return Math.sqrt(-2 * Math.log(rnd(s) || 1e-6)) * Math.cos(2 * Math.PI * rnd(s + 0.3))
}
function simulate(g: number): { std: number[]; sat: number[] } {
  let a = Array.from({ length: W }, (_, i) => gauss(i * 1.7 + 0.5))
  const std: number[] = []
  const sat: number[] = []
  for (let l = 0; l < NL; l++) {
    const z = new Array(W).fill(0)
    for (let i = 0; i < W; i++) {
      let s = 0
      for (let j = 0; j < W; j++) s += ((gauss(l * 4099 + i * W + j) * g) / Math.sqrt(W)) * a[j]
      z[i] = s
    }
    a = z.map(Math.tanh)
    const m = a.reduce((x, y) => x + y, 0) / W
    const v = a.reduce((x, y) => x + (y - m) ** 2, 0) / W
    std.push(Math.sqrt(v))
    sat.push(a.filter((x) => Math.abs(x) > 0.9).length / W)
  }
  return { std, sat }
}
const SCHEMES = [
  { name: "太小 (×0.25/√n)", sim: simulate(0.25), color: "#3b82f6", verdict: "激活逐层衰减 → 信号/梯度消失" },
  { name: "太大 (×3/√n)", sim: simulate(3.0), color: "#f43f5e", verdict: "冲进饱和区 → 梯度消失 + 易爆炸" },
  { name: "Xavier (×1/√n)", sim: simulate(1.0), color: "#10b981", verdict: "每层方差稳定 → 信号顺畅传播" },
]

export function WeightInitAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

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
    const stage = idxRef.current

    const padL = 56
    const padR = 36
    const padT = 64
    const padB = 56
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const X = (l: number) => padL + (l / (NL - 1)) * plotW
    const YMAX = 1.0
    const Y = (v: number) => padT + (1 - Math.min(v, YMAX) / YMAX) * plotH

    // 坐标轴 + 网格
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    for (let t = 0; t <= 1; t += 0.25) {
      ctx.beginPath()
      ctx.moveTo(padL, Y(t))
      ctx.lineTo(padL + plotW, Y(t))
      ctx.stroke()
      ctx.fillStyle = MUT
      ctx.font = "9px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(t.toFixed(2), padL - 6, Y(t))
    }
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("网络层 (1 → 8) →", padL + plotW / 2, padT + plotH + 22)
    ctx.save()
    ctx.translate(16, padT + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("激活标准差", 0, 0)
    ctx.restore()

    if (stage < 3) {
      const sc = SCHEMES[stage]
      // 柱
      for (let l = 0; l < NL; l++) {
        const cx = X(l)
        const h = padT + plotH - Y(sc.sim.std[l])
        ctx.fillStyle = sc.color
        ctx.fillRect(cx - 12, Y(sc.sim.std[l]), 24, h)
        ctx.fillStyle = FG
        ctx.font = "9px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(sc.sim.std[l].toFixed(2), cx, Y(sc.sim.std[l]) - 3)
      }
      const avgSat = (sc.sim.sat.reduce((a, b) => a + b, 0) / NL) * 100
      ctx.fillStyle = sc.color
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(sc.name + " → " + sc.verdict, padL, 50)
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText(`平均饱和比例(|a|>0.9)：${avgSat.toFixed(0)}%`, padL, padT + plotH + 40)
    } else {
      // 对比：三条折线
      for (const sc of SCHEMES) {
        ctx.strokeStyle = sc.color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let l = 0; l < NL; l++) {
          const x = X(l)
          const y = Y(sc.sim.std[l])
          if (l === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        for (let l = 0; l < NL; l++) {
          ctx.beginPath()
          ctx.arc(X(l), Y(sc.sim.std[l]), 3, 0, Math.PI * 2)
          ctx.fillStyle = sc.color
          ctx.fill()
        }
      }
      // 图例（三行排开）
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      SCHEMES.forEach((sc, k) => {
        const ly = 46 + k * 15
        ctx.fillStyle = sc.color
        ctx.fillRect(padL, ly - 5, 14, 10)
        ctx.font = "11px ui-sans-serif, system-ui"
        ctx.fillText(sc.name, padL + 20, ly)
      })
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("权重初始化：让每层激活方差既不衰减为 0、也不爆炸", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => [
      {
        apply: () => setIdx(0),
        text: "深层网络里,权重的初始大小特别关键。先看初始化得太小的情况:每往后过一层,激活值的标准差就缩小一截,传到第八层几乎全变成了 0。前向信号消失了,反向的梯度也跟着消失,网络根本学不动。",
      },
      {
        apply: () => setIdx(1),
        text: "再看初始化得太大:激活值一层层被放大,很快全部冲进 tanh 的饱和区,几乎都挤在正负一上。饱和区的导数趋近 0,梯度同样传不回去,而且数值很容易爆炸。",
      },
      {
        apply: () => setIdx(2),
        text: "Xavier 初始化,又叫 Glorot 初始化,就是为了解决这个问题:让权重的方差正好等于 1 除以输入维度,使得每一层激活值的方差大致保持不变。你看,从第一层到第八层,标准差稳稳地维持在一个合理的水平。专门配 ReLU 的版本叫 He 初始化,方差取 2 除以输入维度。",
      },
      {
        apply: () => setIdx(3),
        text: "三种放在一起对比就一目了然了:太小的指数衰减、太大的迅速饱和,只有 Xavier、He 这类「保持方差」的初始化,才能让深层网络里的信号既不消失、也不爆炸,顺利地训练起来。",
      },
    ],
  })

  const caption = [
    `太小初始化：激活标准差逐层衰减(末层≈${SCHEMES[0].sim.std[NL - 1].toFixed(2)}) → 信号/梯度消失。`,
    `太大初始化：冲进 tanh 饱和区(饱和≈${((SCHEMES[1].sim.sat.reduce((a, b) => a + b, 0) / NL) * 100).toFixed(0)}%) → 梯度消失 + 易爆炸。`,
    "Xavier(×1/√n)：每层激活方差稳定 → 信号顺畅传播。He 版取 2/√n 配 ReLU。",
    "对比：太小衰减、太大饱和、Xavier/He 保持方差，深层网络才训得动。",
  ][idx]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1}/4
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {["太小", "太大", "Xavier", "对比"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">柱高=该层激活标准差 · 实测</span>
        </div>
      )}
    </div>
  )
}
