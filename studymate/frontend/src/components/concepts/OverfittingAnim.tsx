/**
 * 概念动画 · 过拟合 / 欠拟合（机器学习）
 * ------------------------------------------------------------------
 * 真实多项式最小二乘拟合（法方程 + 高斯消元），全在浏览器里算：
 *   - 拖「多项式次数 d」滑块：d 小 → 欠拟合(高偏差)；d 适中 → 恰当；d 大 → 过拟合(高方差，曲线剧烈扭动)
 *   - 训练误差随 d 单调下降，测试误差呈 U 形：这就是泛化的核心权衡
 *   - ▶自动扫描 d=1→12 看测试误差先降后升 / ↻重新采样 / 讲课模式
 * 规模区间（欠拟合 / 恰当 / 过拟合）由「当前数据下测试误差最小的次数 d*」实算划定，非写死。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const N_TRAIN = 14
const N_TEST = 30
const MAX_DEG = 12
const NOISE = 0.06
// 纵轴可视范围（数据 y 大致 0~1，上下各留白给过拟合时曲线甩动，减少截断）
const Y_MIN = -0.3
const Y_MAX = 1.3

type Pt = { x: number; y: number }
type Regime = "underfit" | "good" | "overfit"

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// 真实曲线（待学习的目标函数），y 大致落在 [0,1]
const trueFn = (x: number) => 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.9 * x + 0.5)

function genData(n: number): Pt[] {
  return Array.from({ length: n }, () => {
    const x = Math.random()
    return { x, y: trueFn(x) + gauss() * NOISE }
  })
}

// 法方程最小二乘：在归一化 u=2x-1 上拟合 d 次多项式，返回系数 [c0..cd]
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
  for (let i = 0; i < m; i++) A[i][i] += 1e-7 // 微岭回归稳数值
  // 高斯-约当消元
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

const mse = (pts: Pt[], coeffs: number[]) =>
  pts.reduce((s, p) => s + (predict(coeffs, p.x) - p.y) ** 2, 0) / pts.length

export function OverfittingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [deg, setDeg] = useState(4)
  const [playing, setPlaying] = useState(false)

  // 数据按 seed 固定
  const { train, test } = useMemo(() => {
    void seed
    return { train: genData(N_TRAIN), test: genData(N_TEST) }
  }, [seed])

  // 各次数测试误差 → 最优次数 d*（实算划定区间，非写死）
  const dBest = useMemo(() => {
    let best = 1
    let bestErr = Infinity
    for (let d = 1; d <= MAX_DEG; d++) {
      const e = mse(test, fitPoly(train, d))
      if (e < bestErr) {
        bestErr = e
        best = d
      }
    }
    return best
  }, [train, test])

  const coeffs = useMemo(() => fitPoly(train, deg), [train, deg])
  const trainMSE = useMemo(() => mse(train, coeffs), [train, coeffs])
  const testMSE = useMemo(() => mse(test, coeffs), [test, coeffs])

  const regime: Regime = deg <= dBest - 1 ? "underfit" : deg >= dBest + 2 ? "overfit" : "good"

  // refs 供 rAF 取值
  const trainRef = useRef(train)
  const testRef = useRef(test)
  const coeffsRef = useRef(coeffs)
  trainRef.current = train
  testRef.current = test
  coeffsRef.current = coeffs

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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const pad = 22
    const sx = (x: number) => pad + x * (cssW - pad * 2)
    const sy = (y: number) => pad + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")
    // 真实曲线（虚线灰）
    ctx.strokeStyle = isDark ? "#52525b" : "#9ca3af"
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    for (let i = 0; i <= 200; i++) {
      const x = i / 200
      if (i === 0) ctx.moveTo(sx(x), sy(trueFn(x)))
      else ctx.lineTo(sx(x), sy(trueFn(x)))
    }
    ctx.stroke()
    ctx.setLineDash([])

    // 拟合曲线（靛蓝实线）：按真实斜率连续画，过拟合时顺势冲出画面（缩小可追看），不在边框处截断。
    // 仅给一个很大的有限上限防浮点溢出；真无穷(NaN/Inf)才断笔。
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let pen = false
    for (let i = 0; i <= 240; i++) {
      const x = i / 240
      const yv = predict(coeffsRef.current, x)
      if (!Number.isFinite(yv)) {
        pen = false
        continue
      }
      const Y = sy(Math.max(-1e4, Math.min(1e4, yv))) // 大上限仅防溢出，过拟合时曲线在窗口内连续甩动、不截断
      if (!pen) {
        ctx.moveTo(sx(x), Y)
        pen = true
      } else ctx.lineTo(sx(x), Y)
    }
    ctx.stroke()

    // 训练点（实心翠绿）
    for (const p of trainRef.current) {
      ctx.fillStyle = "#10b981"
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // 测试点（空心琥珀，小）
    ctx.strokeStyle = "#f59e0b"
    ctx.lineWidth = 1.5
    for (const p of testRef.current) {
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 2.6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [applyViewport])

  // 轻量 rAF 循环：负责重绘（处理 dpr / 主题 / 尺寸变化）
  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  // 自动扫描：d 每步 +1，到顶即停
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setDeg((d) => {
        if (d >= MAX_DEG) {
          setPlaying(false)
          return d
        }
        return d + 1
      })
    }, 850)
    return () => clearInterval(id)
  }, [playing])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setDeg(4)
    setSeed((s) => s + 1)
  }, [])

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && deg >= MAX_DEG) setDeg(1)
      return !p
    })
  }, [deg])

  // 分步讲课：开场一次性预合成全部语音 → 逐拍推进 → 念完才进下一拍，音画同步（统一走 useLecture）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => setPlaying(false),
    buildBeats: () => [
      { apply: () => setDeg(1), text: "咱们先从最简单的模型说起。假设它就是一条直线，你看，连数据这个弯儿都拐不过来，太死板了。这种情况呢，我们叫它欠拟合，训练误差和测试误差都挺高。" },
      { apply: () => setDeg(4), text: "那我们把模型放灵活一点，用四次多项式试试。诶，这下好了，曲线就顺着数据的趋势走了，训练和测试的误差都降了下来。这就是我们想要的，拟合得刚刚好。" },
      { apply: () => setDeg(12), text: "那是不是越灵活就越好呢？别急，咱们接着加到十二次看看。你瞧这条线，开始疯狂地扭来扭去，非得穿过每一个训练点。训练误差几乎为零了，可测试误差反倒越来越大。这个就叫过拟合，它把数据里的噪声都当真给背下来了。" },
      { apply: () => setDeg(4), text: "所以你看啊，模型并不是越复杂越好。太简单了欠拟合，太复杂了过拟合，得在中间找一个平衡。这个权衡呢，就是机器学习里特别重要的偏差和方差。" },
    ],
  })

  const cap = CAPTIONS[regime]
  const regimeColor =
    regime === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : regime === "overfit"
        ? "text-rose-600 dark:text-rose-400"
        : "text-amber-600 dark:text-amber-400"

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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-relaxed">
          <div>次数 d = {deg}</div>
          <div>训练 MSE = {trainMSE.toFixed(4)}</div>
          <div>测试 MSE = {testMSE.toFixed(4)}</div>
        </div>
      </div>

      {/* 讲课模式下隐藏自带字幕条，交给播放器的大字幕（避免重复） */}
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${regimeColor}`}>
          <span className="font-medium">{cap.title}</span>
          <span className="text-[var(--muted-foreground)]"> —— {cap.body}</span>
        </div>
      )}

      {/* 讲课模式下隐藏自带控件，交给影院播放器控制条 */}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "暂停" : deg >= MAX_DEG ? "重新扫描" : "自动扫描 d"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新采样
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
              多项式次数 d = <span className="font-mono text-[var(--foreground)]">{deg}</span>
            </label>
            <input
              type="range"
              min={1}
              max={MAX_DEG}
              step={1}
              value={deg}
              onChange={(e) => {
                setPlaying(false)
                setDeg(parseInt(e.target.value))
              }}
              className="w-36 accent-indigo-500"
            />
          </div>
        </div>
      )}

      <div className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
        — 虚线=真实函数 · <span className="text-emerald-600 dark:text-emerald-400">●</span> 训练点 ·{" "}
        <span className="text-amber-600 dark:text-amber-400">○</span> 测试点 · 蓝线=模型拟合。
        本数据最优次数 d* = {dBest}：d 太小欠拟合、太大过拟合。
      </div>
    </div>
  )
}

const CAPTIONS: Record<Regime, { title: string; body: string }> = {
  underfit: {
    title: "欠拟合（高偏差）",
    body: "模型太简单，连训练数据的趋势都没抓住，训练误差和测试误差都偏高。",
  },
  good: {
    title: "拟合恰当 ✓",
    body: "复杂度刚好：训练与测试误差都低，曲线贴合真实函数，能泛化到没见过的新数据。",
  },
  overfit: {
    title: "过拟合（高方差）",
    body: "模型太复杂，硬背训练点（训练误差→0），曲线剧烈扭动，测试误差反而回升。",
  },
}
