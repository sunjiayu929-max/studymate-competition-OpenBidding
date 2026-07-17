/**
 * 概念动画 · 逻辑回归 Logistic Regression（机器学习）
 * ------------------------------------------------------------------
 * 真实梯度下降训练 sigmoid 分类器 p = σ(w1·x + w2·y + b)：
 *   - 背景按预测概率从 rose(类0) 渐变到 sky(类1) 着色，p=0.5 处即决策边界（白线）
 *   - 梯度下降不断转动/平移边界，让交叉熵损失(BCE)下降直到收敛
 *   - HUD 实时显示 loss / 迭代次数
 *   - ▶播放 / ⏸暂停 / ⏭单步（一次梯度更新）/ ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const COLORS = ["#f43f5e", "#0ea5e9"] // rose=类0 / sky=类1
const RGB = [
  [244, 63, 94],
  [14, 165, 233],
]
const LR = 0.5
const STEP_MS = 60
const SCALE = 2.5 // 特征标准化尺度：f = (坐标-5)/SCALE，让梯度数值稳定
// 伪无限延伸范围（数据窗口 [0,10] 两侧各扩 EXT 倍；中心 5、半宽 5）
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
const clampW = (v: number) => Math.max(0.4, Math.min(9.6, v))
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

interface P {
  x: number
  y: number
  c: number
}

function genPoints(): P[] {
  const centers = [
    [3.2, 3.6],
    [6.8, 6.4],
  ]
  const pts: P[] = []
  centers.forEach(([cx, cy], ci) => {
    for (let i = 0; i < 16; i++) {
      pts.push({ x: clampW(cx + gauss() * 1.15), y: clampW(cy + gauss() * 1.15), c: ci })
    }
  })
  return pts
}

export function LogisticRegressionAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ loss: number; iter: number; done: boolean }>({ loss: 0, iter: 0, done: false })

  const ptsRef = useRef<P[]>([])
  const wRef = useRef<[number, number]>([0, 0])
  const bRef = useRef(0)
  const iterRef = useRef(0)
  const prevLossRef = useRef(Infinity)
  const doneRef = useRef(false)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const fx = (x: number) => (x - 5) / SCALE
  const fy = (y: number) => (y - 5) / SCALE

  const lossOf = useCallback((pts: P[], w: [number, number], b: number) => {
    let s = 0
    for (const p of pts) {
      const z = w[0] * fx(p.x) + w[1] * fy(p.y) + b
      const pr = Math.min(1 - 1e-7, Math.max(1e-7, sigmoid(z)))
      s += -(p.c * Math.log(pr) + (1 - p.c) * Math.log(1 - pr))
    }
    return s / pts.length
  }, [])

  const init = useCallback(() => {
    const pts = genPoints()
    ptsRef.current = pts
    wRef.current = [0, 0]
    bRef.current = 0
    iterRef.current = 0
    prevLossRef.current = Infinity
    doneRef.current = false
    setInfo({ loss: lossOf(pts, [0, 0], 0), iter: 0, done: false })
  }, [lossOf])

  useEffect(() => {
    init()
  }, [init, seed])

  // 一次梯度下降更新
  const gdStep = useCallback(() => {
    if (doneRef.current) return
    const pts = ptsRef.current
    const n = pts.length
    let gw0 = 0
    let gw1 = 0
    let gb = 0
    const [w0, w1] = wRef.current
    const b = bRef.current
    for (const p of pts) {
      const a = fx(p.x)
      const c = fy(p.y)
      const err = sigmoid(w0 * a + w1 * c + b) - p.c
      gw0 += err * a
      gw1 += err * c
      gb += err
    }
    wRef.current = [w0 - (LR * gw0) / n, w1 - (LR * gw1) / n]
    bRef.current = b - (LR * gb) / n
    iterRef.current += 1
    const m = lossOf(pts, wRef.current, bRef.current)
    const converged = Math.abs(prevLossRef.current - m) < 1e-6 || iterRef.current >= 600
    prevLossRef.current = m
    if (converged) {
      doneRef.current = true
      playingRef.current = false
      setPlaying(false)
    }
    setInfo({ loss: m, iter: iterRef.current, done: doneRef.current })
  }, [lossOf])

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
    const plotW = cssW - pad * 2
    const plotH = cssH - pad * 2
    const sx = (x: number) => pad + (x / 10) * plotW
    const sy = (y: number) => cssH - pad - (y / 10) * plotH
    const isDark = document.documentElement.classList.contains("dark")
    const pts = ptsRef.current
    const [w0, w1] = wRef.current
    const b = bRef.current

    // 伪无限：先用粗网格把延伸区也按概率着色（缩小时两个决策半平面继续延伸、不空荡）；
    // 主窗口 [0,10] 跳过、留给下面的细网格保持清晰（避免叠加变暗）。
    const exSpan = EX_MAX - EX_MIN
    const CN2 = 48
    const c2x = (sx(EX_MAX) - sx(EX_MIN)) / CN2
    const c2y = (sy(EX_MIN) - sy(EX_MAX)) / CN2
    for (let i = 0; i < CN2; i++) {
      for (let j = 0; j < CN2; j++) {
        const gx = EX_MIN + ((i + 0.5) / CN2) * exSpan
        const gy = EX_MIN + ((j + 0.5) / CN2) * exSpan
        if (gx > 0 && gx < 10 && gy > 0 && gy < 10) continue // 主窗口交给细网格
        const p = sigmoid(w0 * fx(gx) + w1 * fy(gy) + b)
        const r = Math.round(RGB[0][0] + (RGB[1][0] - RGB[0][0]) * p)
        const g = Math.round(RGB[0][1] + (RGB[1][1] - RGB[0][1]) * p)
        const bl = Math.round(RGB[0][2] + (RGB[1][2] - RGB[0][2]) * p)
        ctx.fillStyle = `rgba(${r},${g},${bl},0.16)`
        ctx.fillRect(sx(EX_MIN + (i / CN2) * exSpan), sy(EX_MIN + ((j + 1) / CN2) * exSpan), c2x + 1, c2y + 1)
      }
    }
    // 抹掉粗网格跨边界格子渗进主窗口的部分 → 主窗口只由下面的细网格着色、不叠加变暗
    ctx.clearRect(pad, pad, plotW, plotH)

    // 概率背景：网格逐格算 sigmoid，按概率在 rose↔sky 间插值
    const COLS = 34
    const ROWS = 24
    const cw = plotW / COLS
    const chh = plotH / ROWS
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const gx = ((i + 0.5) / COLS) * 10
        const gy = ((j + 0.5) / ROWS) * 10
        const p = sigmoid(w0 * fx(gx) + w1 * fy(gy) + b)
        const r = Math.round(RGB[0][0] + (RGB[1][0] - RGB[0][0]) * p)
        const g = Math.round(RGB[0][1] + (RGB[1][1] - RGB[0][1]) * p)
        const bl = Math.round(RGB[0][2] + (RGB[1][2] - RGB[0][2]) * p)
        ctx.fillStyle = `rgba(${r},${g},${bl},0.16)`
        ctx.fillRect(pad + i * cw, cssH - pad - (j + 1) * chh, cw + 1, chh + 1)
      }
    }

    // 决策边界 p=0.5 ⇔ z=0，白线（延伸到与底色同范围，去掉裁剪 → 缩小/平移时连续不断头）
    ctx.strokeStyle = isDark ? "#fafafa" : "#27272a"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    if (Math.abs(w1) >= Math.abs(w0)) {
      // 解 y：fy = -(w0·fx + b)/w1
      const yAt = (x: number) => (-(w0 * fx(x) + b) / w1) * SCALE + 5
      ctx.moveTo(sx(EX_MIN), sy(yAt(EX_MIN)))
      ctx.lineTo(sx(EX_MAX), sy(yAt(EX_MAX)))
    } else {
      const xAt = (y: number) => (-(w1 * fy(y) + b) / w0) * SCALE + 5
      ctx.moveTo(sx(xAt(EX_MIN)), sy(EX_MIN))
      ctx.lineTo(sx(xAt(EX_MAX)), sy(EX_MAX))
    }
    ctx.stroke()

    // 数据点
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.85)"
      ctx.stroke()
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

  // 「换一组新点」只在「进入讲课」时做一次；replay 不换 → 数字一致、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：3 拍快照。开讲时先模拟整段训练拿真实迭代次数/起止交叉熵损失，套进讲解词；跑完复位，播放时同步重训、与讲解词一致。
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
      const loss0 = lossOf(pts, [0, 0], 0)
      const resetW = () => {
        wRef.current = [0, 0]
        bRef.current = 0
        iterRef.current = 0
        prevLossRef.current = Infinity
        doneRef.current = false
      }
      resetW()
      let g = 0
      while (!doneRef.current && g++ < 3000) gdStep()
      const iterF = iterRef.current
      const lossF = lossOf(pts, wRef.current, bRef.current)
      resetW()
      setInfo({ loss: loss0, iter: 0, done: false })
      return [
        {
          apply: () => {},
          text: `逻辑回归是做二分类的。它先给每个点算一个分数 w·x+b，再用 sigmoid 压成 0 到 1 的概率，中间那条白线是概率正好一半的决策边界。一开始边界乱放，此刻的交叉熵损失是 ${loss0.toFixed(3)}。`,
        },
        {
          apply: () => {
            setPlaying(true)
            playingRef.current = true
          },
          text: "梯度下降不断转动这条边界，去把交叉熵损失压小——说白了，就是让每个点尽量落进正确颜色的那一侧。你看边界正往两类中间挪。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            let h = 0
            while (!doneRef.current && h++ < 3000) gdStep()
          },
          text: `调到损失最低、边界稳稳卡在两类中间，分类器就训练好了。一共迭代 ${iterF} 次，交叉熵损失从 ${loss0.toFixed(3)} 降到了 ${lossF.toFixed(3)}。背景的红蓝渐变，就是它对每个位置给出的类别概率。`,
        },
      ]
    },
  })

  const caption = info.done
    ? `已收敛：交叉熵损失降到 ${info.loss.toFixed(3)}。白线是决策边界，背景颜色越深表示属于该类的概率越高。`
    : info.iter === 0
      ? "逻辑回归用 sigmoid 把「w·x+b」压成 0~1 概率。初始边界乱放，梯度下降会把它调到两类中间。"
      : `迭代 ${info.iter} 次：边界正向两类之间移动，交叉熵损失 ${info.loss.toFixed(3)} 持续下降。`

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
          loss = {info.loss.toFixed(3)}
          <br />iter = {info.iter}
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
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">白线 = 决策边界 · 底色深浅 = 类别概率</span>
      </div>
      )}
    </div>
  )
}
