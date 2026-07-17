/**
 * 概念动画 · 偏差-方差权衡 Bias-Variance Tradeoff（机器学习）
 * ------------------------------------------------------------------
 * 真实演示「偏差/方差分解」：
 *   - 同一条真曲线，反复重采样出 M 份训练集，各拟合一个 d 次多项式
 *   - 把这 M 条拟合画在一起：它们彼此散开的程度 = 方差；它们的均值线偏离真曲线的程度 = 偏差
 *   - d 小 → 拟合挤成一束(方差小)但都偏离真曲线(偏差大)=欠拟合
 *   - d 大 → 拟合乱扭、彼此散开(方差大)，但均值线贴近真曲线(偏差小)=过拟合
 * 偏差²、方差在测试网格上真实算出。拖「模型复杂度 d」滑块看权衡。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const M = 9 // 重采样份数
const N = 11 // 每份点数
const NOISE = 0.09
const Y_MIN = -0.45
const Y_MAX = 1.45
const COLORS = ["#818cf8", "#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#c084fc", "#2dd4bf"]

type Pt = { x: number; y: number }
function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
// 待学习的真曲线（带弯，y 大致落在 [0,1]）
const trueFn = (x: number) => 0.5 + 0.32 * Math.sin(2 * Math.PI * 0.85 * x + 0.4)

function genSet(): Pt[] {
  return Array.from({ length: N }, () => {
    const x = Math.random()
    return { x, y: trueFn(x) + gauss() * NOISE }
  })
}

// 法方程最小二乘：在 u=2x-1 上拟合 d 次多项式（微岭稳数值）
function fitPoly(pts: Pt[], d: number): number[] {
  const m = d + 1
  const A = Array.from({ length: m }, () => new Array(m + 1).fill(0))
  for (const p of pts) {
    const u = 2 * p.x - 1
    const pow = [1]
    for (let k = 1; k <= 2 * d; k++) pow[k] = pow[k - 1] * u
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) A[i][j] += pow[i + j]
      A[i][m] += pow[i] * p.y
    }
  }
  for (let i = 0; i < m; i++) A[i][i] += 1e-7
  for (let col = 0; col < m; col++) {
    let piv = col
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    ;[A[col], A[piv]] = [A[piv], A[col]]
    const dv = A[col][col] || 1e-12
    for (let r = 0; r < m; r++) {
      if (r === col) continue
      const f = A[r][col] / dv
      for (let c = col; c <= m; c++) A[r][c] -= f * A[col][c]
    }
  }
  return A.map((row, i) => row[m] / (row[i] || 1e-12))
}
function predict(coeffs: number[], x: number): number {
  const u = 2 * x - 1
  let y = 0
  for (let i = coeffs.length - 1; i >= 0; i--) y = y * u + coeffs[i]
  return y
}

export function BiasVarianceAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [deg, setDeg] = useState(1)
  const degRef = useRef(1)
  useEffect(() => {
    degRef.current = deg
  }, [deg])

  // M 份重采样数据（按 seed 固定）
  const sets = useMemo(() => {
    void seed
    return Array.from({ length: M }, () => genSet())
  }, [seed])

  // 当前 d 下：M 条拟合系数 + 偏差²/方差（测试网格上真实算）
  const fit = useMemo(() => {
    const coeffsAll = sets.map((s) => fitPoly(s, deg))
    const grid = Array.from({ length: 41 }, (_, i) => 0.03 + (i / 40) * 0.94)
    let bias2 = 0
    let varc = 0
    for (const x of grid) {
      const preds = coeffsAll.map((c) => predict(c, x))
      const mean = preds.reduce((a, b) => a + b, 0) / M
      bias2 += (mean - trueFn(x)) ** 2
      varc += preds.reduce((a, b) => a + (b - mean) ** 2, 0) / M
    }
    return { coeffsAll, bias2: bias2 / grid.length, varc: varc / grid.length }
  }, [sets, deg])

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
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const pad = 26
    const sx = (x: number) => pad + x * (cssW - pad * 2)
    const sy = (y: number) => cssH - pad - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")
    const clampY = (y: number) => Math.max(-1e4, Math.min(1e4, y))

    // 一条曲线连续采样（超范围不夹边、由 canvas 裁，避免凭空截断）
    const curve = (f: (x: number) => number) => {
      ctx.beginPath()
      for (let i = 0; i <= 240; i++) {
        const x = i / 240
        const y = clampY(f(x))
        if (i === 0) ctx.moveTo(sx(x), sy(y))
        else ctx.lineTo(sx(x), sy(y))
      }
      ctx.stroke()
    }

    // M 条拟合（细、半透明）
    fit.coeffsAll.forEach((c, k) => {
      ctx.strokeStyle = COLORS[k % COLORS.length]
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.6
      curve((x) => predict(c, x))
    })
    ctx.globalAlpha = 1

    // 均值拟合线（橙色虚线）
    ctx.strokeStyle = isDark ? "#fb923c" : "#ea580c"
    ctx.lineWidth = 2.4
    ctx.setLineDash([7, 5])
    curve((x) => fit.coeffsAll.reduce((s, c) => s + predict(c, x), 0) / M)
    ctx.setLineDash([])

    // 真曲线（粗、深色）
    ctx.strokeStyle = isDark ? "#fafafa" : "#18181b"
    ctx.lineWidth = 3
    curve(trueFn)
  }, [fit, applyViewport])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const handleReset = useCallback(() => setSeed((s) => s + 1), [])

  // 注：不在进入讲课时 setSeed 重采样——`sets` 走 useMemo(state) 是异步的，buildBeats 会读到旧
  // `sets`、而画面用新 `sets` 渲染 → 数值对不上画面。保持同一份 `sets`，讲解词数值与画面一致、replay 也稳定。

  // 讲课模式：3 个状态拍（欠拟合→过拟合→折中）。结果型 → 停在关键 d 上讲、念真实偏差²/方差
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => {
      const stat = (d: number) => {
        const cs = sets.map((s) => fitPoly(s, d))
        const grid = Array.from({ length: 41 }, (_, i) => 0.03 + (i / 40) * 0.94)
        let b = 0
        let v = 0
        for (const x of grid) {
          const ps = cs.map((c) => predict(c, x))
          const mean = ps.reduce((a, c) => a + c, 0) / M
          b += (mean - trueFn(x)) ** 2
          v += ps.reduce((a, c) => a + (c - mean) ** 2, 0) / M
        }
        return { b: b / grid.length, v: v / grid.length }
      }
      const s1 = stat(1)
      const s7 = stat(7)
      const s3 = stat(3)
      return [
        {
          apply: () => setDeg(1),
          text: `先用最简单的模型——一根直线，去拟合这 ${M} 份重新采样的数据。你看这些彩色直线几乎重叠、挤成一束，说明换一份数据它也基本不变、很稳定，方差只有 ${s1.v.toFixed(3)}；可它们整体都拉不出真曲线（黑线）的弯，全都系统性地偏离，偏差²高达 ${s1.b.toFixed(3)}。这就是欠拟合：太死板。`,
        },
        {
          apply: () => setDeg(7),
          text: `换成很高次的多项式。这下每条拟合都死贴住自己那份数据里的噪声，于是彼此乱扭、散得很开，方差猛涨到 ${s7.v.toFixed(3)}；但你看那条橙色均值线反而挺贴真曲线，偏差²降到 ${s7.b.toFixed(3)}。这就是过拟合：太敏感，换份数据就面目全非。`,
        },
        {
          apply: () => setDeg(3),
          text: `取一个适中的复杂度，偏差² ${s3.b.toFixed(3)}、方差 ${s3.v.toFixed(3)}，两个都不大：拟合既跟得上真曲线的弯、彼此又不太散。这就是偏差-方差权衡——模型太简单偏差大、太复杂方差大，泛化最好的那个点，往往落在中间。`,
        },
      ]
    },
  })

  const caption = `复杂度 d=${deg}：偏差² = ${fit.bias2.toFixed(3)}，方差 = ${fit.varc.toFixed(3)}。${deg <= 1 ? "拟合挤成一束但偏离真曲线 → 偏差大、方差小（欠拟合）。" : deg >= 6 ? "拟合彼此乱扭散开 → 方差大、偏差小（过拟合）。" : "偏差/方差都不大，折中最好。"}`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 320, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          偏差² {fit.bias2.toFixed(3)} · 方差 {fit.varc.toFixed(3)}
        </div>
      </div>
      {!lecture && (
        <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            模型复杂度 d
            <input
              type="range"
              min={1}
              max={9}
              step={1}
              value={deg}
              onChange={(e) => setDeg(parseInt(e.target.value))}
              className="w-40 accent-indigo-500"
            />
            <span className="font-mono w-5 text-center">{deg}</span>
          </label>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新采样
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            黑=真曲线 · 彩=各份拟合 · 橙虚=均值
          </span>
        </div>
      )}
    </div>
  )
}
