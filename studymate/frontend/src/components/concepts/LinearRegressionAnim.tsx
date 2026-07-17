/**
 * 概念动画 · 线性回归 Linear Regression（机器学习）
 * ------------------------------------------------------------------
 * 真实梯度下降拟合 y = w·x + b：
 *   - 灰色竖线 = 残差（预测与真实的差），直线转动/平移让残差平方和(MSE)变小
 *   - HUD 实时显示 w / b / MSE，MSE 单调下降直到收敛
 *   - ▶播放 / ⏸暂停 / ⏭单步（一次梯度更新）/ ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const LR = 0.014
const STEP_MS = 70
const N = 18
// 伪无限延伸：数据窗口 [0,10] 两侧按同密度补点、拟合线也延伸到此范围（中心 5、半宽 5）
const EXT = 12
const EX_MIN = 5 - 5 * EXT
const EX_MAX = 5 + 5 * EXT

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clampY = (v: number) => Math.max(0.4, Math.min(9.6, v))

interface Pt {
  x: number
  y: number
}

function genData(): { pts: Pt[]; ext: Pt[] } {
  const w = 0.45 + Math.random() * 0.35
  const b = 1.4 + Math.random() * 1.2
  // 训练用：主窗口 [0.8,9.2] 内 N 点（默认视图，密度/钳制沿用原版 → 梯度下降动态完全不变）
  const pts: Pt[] = []
  const step = 8.4 / (N - 1)
  for (let i = 0; i < N; i++) {
    const x = 0.8 + i * step
    pts.push({ x, y: clampY(w * x + b + gauss() * 0.9) })
  }
  // 仅显示：窗口两侧按同密度、沿同一条真线补点（不钳制、不参与训练 →
  // 避免远点(x 可达 65)放大梯度致发散；缩小/平移时直线穿过连续散点、不再空荡）
  const ext: Pt[] = []
  for (let x = 0.8 - step; x >= EX_MIN; x -= step) ext.push({ x, y: w * x + b + gauss() * 0.9 })
  for (let x = 9.2 + step; x <= EX_MAX; x += step) ext.push({ x, y: w * x + b + gauss() * 0.9 })
  return { pts, ext }
}

function mse(pts: Pt[], w: number, b: number): number {
  let s = 0
  for (const p of pts) s += (w * p.x + b - p.y) ** 2
  return s / pts.length
}

export function LinearRegressionAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ w: number; b: number; mse: number; iter: number; done: boolean }>({
    w: 0,
    b: 5,
    mse: 0,
    iter: 0,
    done: false,
  })

  const ptsRef = useRef<Pt[]>([])
  const extRef = useRef<Pt[]>([]) // 仅显示的两侧延伸点（不参与训练）
  const wRef = useRef(0)
  const bRef = useRef(5)
  const iterRef = useRef(0)
  const prevMseRef = useRef(Infinity)
  const doneRef = useRef(false)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const init = useCallback(() => {
    const { pts, ext } = genData()
    ptsRef.current = pts
    extRef.current = ext
    wRef.current = 0
    bRef.current = 5
    iterRef.current = 0
    prevMseRef.current = Infinity
    doneRef.current = false
    setInfo({ w: 0, b: 5, mse: mse(pts, 0, 5), iter: 0, done: false })
  }, [])

  useEffect(() => {
    init()
  }, [init, seed])

  // 一次梯度下降更新
  const gdStep = useCallback(() => {
    if (doneRef.current) return
    const pts = ptsRef.current
    const n = pts.length
    let gw = 0
    let gb = 0
    for (const p of pts) {
      const err = wRef.current * p.x + bRef.current - p.y
      gw += err * p.x
      gb += err
    }
    gw = (2 / n) * gw
    gb = (2 / n) * gb
    wRef.current -= LR * gw
    bRef.current -= LR * gb
    iterRef.current += 1
    const m = mse(pts, wRef.current, bRef.current)
    const converged = Math.abs(prevMseRef.current - m) < 1e-5 || iterRef.current >= 400
    prevMseRef.current = m
    if (converged) {
      doneRef.current = true
      playingRef.current = false
      setPlaying(false)
    }
    setInfo({ w: wRef.current, b: bRef.current, mse: m, iter: iterRef.current, done: doneRef.current })
  }, [])

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

    const pad = 20
    const sx = (x: number) => pad + (x / 10) * (cssW - pad * 2)
    const sy = (y: number) => cssH - pad - (y / 10) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")
    const pts = [...ptsRef.current, ...extRef.current] // 画散点：窗口内 + 两侧延伸点（训练仍只用 ptsRef）
    const w = wRef.current
    const b = bRef.current

    // 残差竖线
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 1.5
    for (const p of pts) {
      const yhat = w * p.x + b
      ctx.beginPath()
      ctx.moveTo(sx(p.x), sy(p.y))
      ctx.lineTo(sx(p.x), sy(yhat))
      ctx.stroke()
    }

    // 拟合直线（延伸到与散点同范围 → 缩小/平移时直线连续穿过数据、不在边框中断头）
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx(EX_MIN), sy(w * EX_MIN + b))
    ctx.lineTo(sx(EX_MAX), sy(w * EX_MAX + b))
    ctx.stroke()

    // 数据点
    ctx.fillStyle = "#10b981"
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && !doneRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        gdStep()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, gdStep])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])

  const togglePlay = useCallback(() => {
    if (doneRef.current) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [handleReset])

  // 「换一组新数据」只在「进入讲课」时做一次；replay 不换 → 数字一致、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：3 拍快照（初始乱线 → 中途靠拢 → 收敛）。开讲时先模拟整段训练拿到真实迭代次数/起止 MSE/最终方程，
  // 套进讲解词（像老师念真实数字）；跑完把权重复位，播放时 apply 同步重新训练、与讲解词一致。
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
    buildBeats: () => {
      const pts = ptsRef.current
      const mse0 = mse(pts, 0, 5)
      const resetW = () => {
        wRef.current = 0
        bRef.current = 5
        iterRef.current = 0
        prevMseRef.current = Infinity
        doneRef.current = false
      }
      resetW()
      let g = 0
      while (!doneRef.current && g++ < 3000) gdStep()
      const wF = wRef.current
      const bF = bRef.current
      const iterF = iterRef.current
      const mseF = mse(pts, wF, bF)
      resetW()
      setInfo({ w: 0, b: 5, mse: mse0, iter: 0, done: false })
      return [
        {
          apply: () => {},
          text: `这是一条随便乱放的初始直线，此刻所有点到它的均方误差 MSE 是 ${mse0.toFixed(2)}。线性回归要找一条最贴合所有点的直线——让每个点的竖直残差，平方加起来最小。`,
        },
        {
          apply: () => {
            setPlaying(true)
            playingRef.current = true
          },
          text: "梯度下降登场：它顺着让 MSE 下降最快的方向，一点点调直线的斜率和截距。你看，线正慢慢转过来、往数据中间靠，MSE 也跟着往下掉。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            let h = 0
            while (!doneRef.current && h++ < 3000) gdStep()
          },
          text: `一直调到再也降不动，训练就收敛了。一共迭代了 ${iterF} 次，MSE 从一开始的 ${mse0.toFixed(2)} 一路压到了 ${mseF.toFixed(2)}。此刻这条直线 y 等于 ${wF.toFixed(2)} 乘 x 加 ${bF.toFixed(2)}，就是误差最小的最佳拟合线。`,
        },
      ]
    },
  })

  const caption = info.done
    ? `已收敛：直线 y = ${info.w.toFixed(2)}·x + ${info.b.toFixed(2)}，MSE = ${info.mse.toFixed(3)}。残差平方和最小，即最佳拟合线。`
    : info.iter === 0
      ? "一条乱放的初始直线。梯度下降会不断调 w(斜率)、b(截距)，让所有竖线(残差)的平方和最小。"
      : `迭代 ${info.iter} 次：直线正向数据靠拢，MSE 持续下降（越小拟合越好）。`

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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-tight text-right">
          w = {info.w.toFixed(2)}
          <br />b = {info.b.toFixed(2)}
          <br />MSE = {info.mse.toFixed(3)}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {info.done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={gdStep} disabled={playing || info.done}>
          <SkipForward className="size-4" /> 单步（更新一次）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿点 = 数据 · 灰线 = 残差 · 蓝线 = 拟合</span>
      </div>
      )}
    </div>
  )
}
