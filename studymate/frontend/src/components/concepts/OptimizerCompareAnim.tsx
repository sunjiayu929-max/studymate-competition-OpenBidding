/**
 * 概念动画 · 优化器对比 SGD / Momentum / Adam（机器学习）
 * ------------------------------------------------------------------
 * 三个球从同一点、同一狭长（病态）损失谷出发，各用真实的更新公式迭代：
 *   - SGD：x ← x − η·g                           陡方向来回震荡、缓方向爬得慢
 *   - Momentum：v ← μv − η·g; x ← x + v          借惯性冲过震荡、加速收敛
 *   - Adam：m,v 一阶/二阶矩 + 偏差校正，逐维自适应步长，又快又稳
 * 损失谷等高线是椭圆（病态：一个方向陡、一个方向平）。▶播放 / ⏭单步 / ↻重置 / 讲课模式。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const CX = 0.025 // 平缓方向曲率
const CY = 0.9 // 陡峭方向曲率（病态比 ~36:1，SGD 沿平缓方向爬得极慢）
const ETA = 1.8 // SGD / Momentum 学习率（贴近陡方向临界 → 可见震荡）
const ETA_ADAM = 0.45
const MU = 0.9
const B1 = 0.9
const B2 = 0.999
const EPS = 1e-8
const START: [number, number] = [-3.4, 1.55]
const XR = 4
const YR = 2
const MAX_STEP = 160
const CONVERGE = 0.07

const loss = (x: number, y: number) => 0.5 * (CX * x * x + CY * y * y)
const grad = (x: number, y: number): [number, number] => [CX * x, CY * y]

type Kind = "sgd" | "momentum" | "adam"
interface Opt {
  kind: Kind
  color: string
  label: string
  x: number
  y: number
  vx: number
  vy: number // momentum 速度 / adam 一阶矩
  sx: number
  sy: number // adam 二阶矩
  trail: [number, number][]
  done: boolean
}

const COLORS: Record<Kind, string> = { sgd: "#6366f1", momentum: "#10b981", adam: "#f59e0b" }
const LABELS: Record<Kind, string> = { sgd: "SGD", momentum: "Momentum", adam: "Adam" }

function freshOpts(): Opt[] {
  return (["sgd", "momentum", "adam"] as Kind[]).map((kind) => ({
    kind,
    color: COLORS[kind],
    label: LABELS[kind],
    x: START[0],
    y: START[1],
    vx: 0,
    vy: 0,
    sx: 0,
    sy: 0,
    trail: [[START[0], START[1]]],
    done: false,
  }))
}

// 对单个优化器走一步（真实更新公式）
function stepOpt(o: Opt, t: number) {
  if (o.done) return
  const [gx, gy] = grad(o.x, o.y)
  if (o.kind === "sgd") {
    o.x -= ETA * gx
    o.y -= ETA * gy
  } else if (o.kind === "momentum") {
    o.vx = MU * o.vx - ETA * gx
    o.vy = MU * o.vy - ETA * gy
    o.x += o.vx
    o.y += o.vy
  } else {
    // Adam
    o.vx = B1 * o.vx + (1 - B1) * gx
    o.vy = B1 * o.vy + (1 - B1) * gy
    o.sx = B2 * o.sx + (1 - B2) * gx * gx
    o.sy = B2 * o.sy + (1 - B2) * gy * gy
    const mhx = o.vx / (1 - Math.pow(B1, t))
    const mhy = o.vy / (1 - Math.pow(B1, t))
    const vhx = o.sx / (1 - Math.pow(B2, t))
    const vhy = o.sy / (1 - Math.pow(B2, t))
    o.x -= (ETA_ADAM * mhx) / (Math.sqrt(vhx) + EPS)
    o.y -= (ETA_ADAM * mhy) / (Math.sqrt(vhy) + EPS)
  }
  o.trail.push([o.x, o.y])
  if (Math.hypot(o.x, o.y) < CONVERGE) o.done = true
}

export function OptimizerCompareAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ step: number; status: "ready" | "running" | "done" }>({
    step: 0,
    status: "ready",
  })

  const optsRef = useRef<Opt[]>(freshOpts())
  const stepRef = useRef(0)
  const playingRef = useRef(playing)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const reset = useCallback(() => {
    optsRef.current = freshOpts()
    stepRef.current = 0
    setInfo({ step: 0, status: "ready" })
  }, [])
  useEffect(() => {
    reset()
  }, [reset, seed])

  const doStep = useCallback(() => {
    stepRef.current += 1
    const t = stepRef.current
    for (const o of optsRef.current) stepOpt(o, t)
    const allDone = optsRef.current.every((o) => o.done)
    if (allDone || stepRef.current >= MAX_STEP) {
      playingRef.current = false
      setPlaying(false)
      setInfo({ step: stepRef.current, status: "done" })
    } else {
      setInfo({ step: stepRef.current, status: "running" })
    }
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
    const scaleX = (cssW - pad * 2) / (2 * XR)
    const scaleY = (cssH - pad * 2) / (2 * YR)
    const sx = (x: number) => cssW / 2 + x * scaleX
    const sy = (y: number) => cssH / 2 - y * scaleY
    const isDark = document.documentElement.classList.contains("dark")

    // 等高线椭圆（损失谷）
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    for (const c of [0.1, 0.3, 0.6, 1.0, 1.5]) {
      const rx = Math.sqrt((2 * c) / CX) * scaleX
      const ry = Math.sqrt((2 * c) / CY) * scaleY
      ctx.beginPath()
      ctx.ellipse(sx(0), sy(0), rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 最优点
    ctx.fillStyle = isDark ? "#71717a" : "#a1a1aa"
    ctx.beginPath()
    ctx.arc(sx(0), sy(0), 3, 0, Math.PI * 2)
    ctx.fill()

    // 轨迹 + 球
    for (const o of optsRef.current) {
      ctx.strokeStyle = o.color
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.6
      ctx.beginPath()
      o.trail.forEach(([x, y], i) => {
        const X = sx(x)
        const Y = sy(y)
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      })
      ctx.stroke()
      ctx.globalAlpha = 1
      const last = o.trail[o.trail.length - 1]
      ctx.fillStyle = o.color
      ctx.beginPath()
      ctx.arc(sx(last[0]), sy(last[1]), 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [applyViewport])

  // rAF：自动播放节流 + 重绘
  useEffect(() => {
    const STEP_MS = 80
    let last = 0
    let raf = 0
    const loop = (now: number) => {
      if (playingRef.current && now - last > STEP_MS) {
        last = now
        doStep()
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw, doStep])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])

  const togglePlay = useCallback(() => {
    if (info.status === "done") {
      handleReset()
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [info.status, handleReset])

  const handleStep = useCallback(() => {
    if (info.status === "done" || playing) return
    doStep()
  }, [info.status, playing, doStep])

  // 讲课模式：3 拍（介绍 → 看三球赛跑 → 收敛对比）；beat1 开自动播放(三球真实更新、smooth)，beat2 同步收尾
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      reset()
    },
    buildBeats: () => [
      {
        apply: () => {},
        text: "这里有三个最常用的优化器：SGD、Momentum 和 Adam。它们从同一个点出发，掉进同一个又窄又长的损失谷，比谁先到谷底。这个谷一个方向很陡、一个方向很平，特别考验优化器。",
      },
      {
        apply: () => {
          setPlaying(true)
          playingRef.current = true
        },
        text: "看蓝色的 SGD：在陡的方向来回横跳、震荡，在平缓的方向又爬得特别慢，走得最纠结。绿色的 Momentum 借着惯性一路冲，把来回的震荡抹平了，明显快一截。橙色的 Adam 给每个方向自动调步长，又快又稳，最先冲到谷底。",
      },
      {
        apply: () => {
          setPlaying(false)
          playingRef.current = false
          let g = 0
          while (!optsRef.current.every((o) => o.done) && stepRef.current < MAX_STEP && g++ < 500) doStep()
        },
        text: "同样的起点、同样的学习率，Momentum 和 Adam 就是比朴素的 SGD 收敛快得多。所以训练神经网络时，选对优化器，往往比硬调参数还管用。",
      },
    ],
  })

  const cap = CAPTIONS[info.status]

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
        <div className="absolute top-2 right-3 text-[11px] font-mono bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-relaxed space-y-0.5">
          <div className="text-[var(--muted-foreground)]">step = {info.step}</div>
          {optsRef.current.map((o) => (
            <div key={o.kind} style={{ color: o.color }}>
              {o.label} loss={loss(o.x, o.y).toFixed(3)}
            </div>
          ))}
        </div>
      </div>

      {/* 讲课模式下隐藏自带字幕条/控件/提示，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.status === "done" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        <span className="font-medium">{cap.title}</span>
        <span className="text-[var(--muted-foreground)]"> —— {cap.body}</span>
      </div>
      )}

      {!lecture && (<>
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {info.status === "done" ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || info.status === "done"}>
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)] flex items-center gap-2 flex-wrap">
          {(["sgd", "momentum", "adam"] as Kind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS[k] }} />
              {LABELS[k]}
            </span>
          ))}
        </span>
      </div>

      <div className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
        同一起点、同一学习率、同一病态损失谷——朴素 SGD 沿陡方向来回震荡走得慢，Momentum 与 Adam 明显更快收敛。
      </div>
      </>)}
    </div>
  )
}

const CAPTIONS: Record<"ready" | "running" | "done", { title: string; body: string }> = {
  ready: {
    title: "准备就绪",
    body: "三个优化器在同一狭长损失谷的同一点出发。点「播放」看它们走向谷底的路径差异。",
  },
  running: {
    title: "下降中",
    body: "SGD 在陡方向来回震荡、缓方向爬得慢；Momentum 借惯性冲过震荡；Adam 逐维自适应步长，又快又稳。",
  },
  done: {
    title: "都到谷底附近 ✓",
    body: "同起点同学习率，Momentum / Adam 明显比朴素 SGD 收敛更快——这就是选对优化器的意义。",
  },
}
