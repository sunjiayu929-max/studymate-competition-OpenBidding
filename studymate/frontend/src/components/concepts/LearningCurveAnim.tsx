/**
 * 概念动画 · 学习曲线 Learning Curve（机器学习 · 模型诊断）
 * ------------------------------------------------------------------
 * 真实拟合：训练集从小到大,每个规模都真训一个多项式模型,分别测：
 *   - 训练误差（在用到的训练点上）  - 验证误差（在固定验证集上）
 * 画成两条随「训练样本数」变化的曲线：
 *   - 数据少：训练误差低、验证误差高 → 差距大
 *   - 数据多：训练误差升、验证误差降 → 互相靠拢
 *   看收敛位置诊断：都高且贴近=欠拟合(高偏差)；差距持续大=过拟合(高方差)
 * 切「简单/复杂」模型,看两种典型学习曲线形态。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { ConceptAnimProps } from "./registry"
import { Button } from "@/components/ui/button"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const POOL = 40 // 训练池大小
const VAL = 40 // 验证集大小
const CAP = 0.5 // 误差显示上限

// 解线性方程组 Mx=b（高斯消元）
function solve(M: number[][], b: number[]): number[] {
  const n = b.length
  const A = M.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    ;[A[c], A[piv]] = [A[piv], A[c]]
    if (Math.abs(A[c][c]) < 1e-12) continue
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]
    }
  }
  return A.map((row, i) => (Math.abs(A[i][i]) < 1e-12 ? 0 : row[n] / A[i][i]))
}
// 多项式最小二乘拟合（次数 d）
function polyfit(xs: number[], ys: number[], d: number): number[] {
  const n = d + 1
  const M = Array.from({ length: n }, () => new Array(n).fill(0))
  const b = new Array(n).fill(0)
  for (let i = 0; i < xs.length; i++) {
    const pw = [1]
    for (let k = 1; k < 2 * n; k++) pw.push(pw[k - 1] * xs[i])
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) M[r][c] += pw[r + c]
      b[r] += pw[r] * ys[i]
    }
  }
  return solve(M, b)
}
const polyval = (c: number[], x: number) => c.reduce((s, ci, i) => s + ci * x ** i, 0)
function rmse(c: number[], xs: number[], ys: number[]): number {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += (ys[i] - polyval(c, xs[i])) ** 2
  return Math.sqrt(s / xs.length)
}

interface Data {
  trX: number[]
  trY: number[]
  vaX: number[]
  vaY: number[]
}
function genData(): Data {
  const f = (x: number) => 0.5 + 0.32 * Math.sin(2 * Math.PI * x)
  const mk = (n: number) =>
    Array.from({ length: n }, () => {
      const x = Math.random()
      return [x, f(x) + (Math.random() - 0.5) * 0.22] as [number, number]
    })
  const tr = mk(POOL).sort((a, b) => a[0] - b[0])
  const va = mk(VAL)
  return { trX: tr.map((p) => p[0]), trY: tr.map((p) => p[1]), vaX: va.map((p) => p[0]), vaY: va.map((p) => p[1]) }
}

// 给定复杂度,算各训练规模 m 下的训练/验证误差曲线
function curves(data: Data, d: number): { ms: number[]; tr: number[]; va: number[] } {
  const ms: number[] = []
  const tr: number[] = []
  const va: number[] = []
  for (let m = d + 2; m <= POOL; m += 2) {
    const xs = data.trX.slice(0, m)
    const ys = data.trY.slice(0, m)
    const c = polyfit(xs, ys, d)
    ms.push(m)
    tr.push(rmse(c, xs, ys))
    va.push(rmse(c, data.vaX, data.vaY))
  }
  return { ms, tr, va }
}

export function LearningCurveAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [complex, setComplex] = useState(true) // true=复杂(d=5) / false=简单(d=1)
  const [reveal, setReveal] = useState(99) // 显示到第几个 m（动画揭示用）
  const dataRef = useRef<Data>(genData())
  const complexRef = useRef(true)
  const revealRef = useRef(99)
  useEffect(() => {
    complexRef.current = complex
  }, [complex])
  useEffect(() => {
    revealRef.current = reveal
  }, [reveal])
  useEffect(() => {
    dataRef.current = genData()
    setReveal(99)
  }, [seed])

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
    const d = complexRef.current ? 5 : 1
    const { ms, tr, va } = curves(dataRef.current, d)
    const nShow = Math.min(ms.length, revealRef.current)

    const padL = 48
    const padR = 18
    const padT = 30
    const padB = 40
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const X = (m: number) => padL + ((m - ms[0]) / (POOL - ms[0])) * plotW
    const Y = (e: number) => padT + plotH - (Math.min(e, CAP) / CAP) * plotH

    // 轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    ctx.strokeRect(padL, padT, plotW, plotH)
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("训练样本数 →", padL + plotW / 2, cssH - 20)
    ctx.save()
    ctx.translate(14, padT + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("误差 (RMSE)", 0, 0)
    ctx.restore()

    const drawCurve = (arr: number[], color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i < nShow; i++) {
        const x = X(ms[i])
        const y = Y(arr[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      for (let i = 0; i < nShow; i++) {
        ctx.beginPath()
        ctx.arc(X(ms[i]), Y(arr[i]), 2.6, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
    }
    drawCurve(va, "#3b82f6") // 验证 蓝
    drawCurve(tr, "#f43f5e") // 训练 红

    // 图例 + 诊断
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.fillStyle = "#f43f5e"
    ctx.fillText("训练误差", padL + 8, padT + 18)
    ctx.fillStyle = "#3b82f6"
    ctx.fillText("验证误差", padL + 80, padT + 18)
    ctx.fillStyle = FG
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.fillText(complexRef.current ? "复杂模型 (d=5)" : "简单模型 (d=1)", cssW - 92, padT - 12)
    // 末端差距
    if (nShow >= ms.length) {
      const gap = va[va.length - 1] - tr[tr.length - 1]
      const diag = complexRef.current ? `末端差距 ${gap.toFixed(3)} → 偏大=高方差(过拟合)` : `两线都偏高且贴近 → 高偏差(欠拟合)`
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.fillText(diag, cssW - padR, cssH - 22)
    }
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

  const nM = curves(dataRef.current, complex ? 5 : 1).ms.length

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => {
      const cx = curves(dataRef.current, 5)
      const gap = cx.va[cx.va.length - 1] - cx.tr[cx.tr.length - 1]
      return [
        {
          apply: () => {
            setComplex(true)
            setReveal(2)
          },
          text: "学习曲线,是把模型的误差,画成「训练样本数」的函数。横轴是用了多少训练数据,纵轴是误差;红线是训练误差,蓝线是验证误差。它是诊断模型到底是欠拟合还是过拟合的利器。",
        },
        {
          frames: Array.from({ length: nM }, (_, i) => i + 1),
          seek: (i: number) => {
            setComplex(true)
            setReveal(i + 1)
          },
          text: "从左往右看,数据越来越多。最左边数据很少时,模型把那几个点背得滚瓜烂熟,训练误差(红)几乎为 0;可它没真学到规律,换到验证集上(蓝)错得一塌糊涂——两条线差距巨大。随着数据增多,红线慢慢升、蓝线慢慢降,两者往中间靠。",
        },
        {
          apply: () => {
            setComplex(true)
            setReveal(99)
          },
          text: `这是个复杂模型,数据加到头,红蓝两线之间还留着明显的差距,大约 ${gap.toFixed(3)}。这种「训练误差低、验证误差高、差距迟迟合不拢」的形态,就是高方差、过拟合的典型信号——对策是加数据、加正则、或者把模型调简单点。`,
        },
        {
          apply: () => {
            setComplex(false)
            setReveal(99)
          },
          text: "再换个简单模型对比:这下两条线很快就贴在一起了,可它俩都停在一个偏高的位置下不来。差距小、但整体误差都高,说明模型太简单、根本没学够——这是高偏差、欠拟合。注意这种情况下再加数据也没用,得换更复杂的模型。一张学习曲线,过拟合还是欠拟合,一眼就分得清。",
        },
      ]
    },
  })

  const d = complex ? 5 : 1
  const cc = curves(dataRef.current, d)
  const gap = cc.va[cc.va.length - 1] - cc.tr[cc.tr.length - 1]
  const caption = complex
    ? `复杂模型(d=5)：训练误差低、验证误差高，末端差距 ${gap.toFixed(3)} 偏大 → 高方差/过拟合（加数据、正则有用）。`
    : `简单模型(d=1)：两线很快贴合但都偏高 → 高偏差/欠拟合（加数据没用，要更复杂模型）。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          d = {d}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" variant={complex ? "default" : "outline"} onClick={() => setComplex(true)}>
            复杂模型 (d=5)
          </Button>
          <Button size="sm" variant={!complex ? "default" : "outline"} onClick={() => setComplex(false)}>
            简单模型 (d=1)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReveal((r) => (r >= nM ? 2 : r + 100))}>
            {reveal >= nM ? "重放揭示" : "全显"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)}>
            换数据
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">差距大=过拟合 · 都高且贴近=欠拟合</span>
        </div>
      )}
    </div>
  )
}
