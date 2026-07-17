/**
 * 概念动画 · 梯度下降（机器学习旗舰）
 * ------------------------------------------------------------------
 * 设计原则：画面用「确定性数学」驱动，永远正确、永远能跑，零 LLM 在渲染路径。
 *   - 真实损失曲面 f(x)=x²，真实更新规则 x ← x − η·f'(x)
 *   - 可拖学习率 η：调大演示「震荡 / 发散」，调小演示「收敛慢」——评委能自己玩
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置，单步可逐帧看清每一步
 *   - 字幕区随状态变化（下降中 / 已收敛 ∇≈0 / 学习率过大发散）
 *
 * TODO（接 TTS 旁白时）：把 caption 文案丢给 /api/voice/tts 朗读，
 *   复用 VoiceTutor「音频播完自动下一步」的同步逻辑即可。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

// ===== 损失函数与梯度（真实数学，可信） =====
const f = (x: number) => x * x
const grad = (x: number) => 2 * x

// 世界坐标范围
const X_MIN = -3.2
const X_MAX = 3.2
const Y_MIN = 0
const Y_MAX = 10.5

const START_X = 2.75 // 初始位置
const CONVERGE_EPS = 0.02 // |∇| 小于此值视为收敛
const DIVERGE_X = 6 // |x| 超过此值视为发散

interface Info {
  step: number
  x: number
  loss: number
  g: number
  status: "ready" | "descending" | "converged" | "diverged"
}

export function GradientDescentAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [eta, setEta] = useState(0.1)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<Info>({
    step: 0,
    x: START_X,
    loss: f(START_X),
    g: grad(START_X),
    status: "ready",
  })

  // 用 ref 维护动画态，避免每帧 setState
  const xRef = useRef(START_X) // 当前显示位置（动画插值用）
  const targetRef = useRef(START_X) // 这一步的目标位置
  const animatingRef = useRef(false) // 是否正在两点间滑动
  const settledAtRef = useRef(0) // 上次落定时间戳（自动播放节流）
  const trailRef = useRef<number[]>([START_X]) // 历史落点
  const stepRef = useRef(0)
  const etaRef = useRef(eta)
  const playingRef = useRef(playing)
  const rafRef = useRef(0)

  useEffect(() => {
    etaRef.current = eta
  }, [eta])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // ===== 坐标映射 =====
  const layout = useCallback((w: number, h: number) => {
    const padL = 44
    const padR = 20
    const padT = 18
    const padB = 30
    const sx = (x: number) => padL + ((x - X_MIN) / (X_MAX - X_MIN)) * (w - padL - padR)
    const sy = (y: number) => h - padB - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (h - padT - padB)
    return { sx, sy }
  }, [])

  // ===== 绘制一帧 =====
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

    const { sx, sy } = layout(cssW, cssH)
    const isDark = document.documentElement.classList.contains("dark")
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"
    const axisColor = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"
    const curveColor = isDark ? "#818cf8" : "#6366f1" // indigo
    const ballColor = "#f59e0b" // amber
    const trailColor = isDark ? "rgba(245,158,11,0.35)" : "rgba(245,158,11,0.4)"

    // 伪无限延伸：网格/坐标轴/损失曲线向四周扩 EXT 倍，缩小即可追看抛物线两臂继续上扬、不戛然而止
    const EXT = 12
    const exXMin = X_MIN * EXT
    const exXMax = X_MAX * EXT
    const exYTop = Y_MAX + (Y_MAX - Y_MIN) * (EXT - 1)
    const exYBot = Y_MIN - (Y_MAX - Y_MIN) * (EXT - 1)

    // 网格
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    for (let gx = Math.ceil(exXMin); gx <= exXMax; gx++) {
      ctx.beginPath()
      ctx.moveTo(sx(gx), sy(exYBot))
      ctx.lineTo(sx(gx), sy(exYTop))
      ctx.stroke()
    }
    for (let gy = Math.ceil(exYBot / 2) * 2; gy <= exYTop; gy += 2) {
      ctx.beginPath()
      ctx.moveTo(sx(exXMin), sy(gy))
      ctx.lineTo(sx(exXMax), sy(gy))
      ctx.stroke()
    }
    // 坐标轴
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(exYBot))
    ctx.lineTo(sx(0), sy(exYTop))
    ctx.stroke()

    // 损失曲线 f(x)=x²（采样到 ±exX，按真实抛物线连续延伸、不在边框削平）
    ctx.strokeStyle = curveColor
    ctx.lineWidth = 2.5
    ctx.beginPath()
    const CN = 1000
    for (let i = 0; i <= CN; i++) {
      const x = exXMin + ((exXMax - exXMin) * i) / CN
      const y = Math.min(f(x), 1e4) // 仅防浮点溢出，不在可视区削平
      if (i === 0) ctx.moveTo(sx(x), sy(y))
      else ctx.lineTo(sx(x), sy(y))
    }
    ctx.stroke()

    // 最优点标记
    ctx.fillStyle = isDark ? "rgba(16,185,129,0.9)" : "rgba(5,150,105,0.9)"
    ctx.beginPath()
    ctx.arc(sx(0), sy(0), 4, 0, Math.PI * 2)
    ctx.fill()

    // 历史落点轨迹
    const trail = trailRef.current
    for (let i = 0; i < trail.length; i++) {
      const tx = trail[i]
      if (Math.abs(tx) > X_MAX) continue
      ctx.fillStyle = trailColor
      ctx.beginPath()
      ctx.arc(sx(tx), sy(Math.min(f(tx), Y_MAX)), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // 当前小球
    const cx = Math.max(X_MIN, Math.min(X_MAX, xRef.current))
    const cy = Math.min(f(xRef.current), Y_MAX)
    const bx = sx(cx)
    const by = sy(cy)
    // 切线方向梯度箭头（指向下降方向）
    const g = grad(xRef.current)
    if (Math.abs(g) > CONVERGE_EPS && Math.abs(xRef.current) <= X_MAX) {
      const dir = -Math.sign(g)
      ctx.strokeStyle = ballColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx + dir * 28, by)
      ctx.stroke()
      // 箭头
      ctx.beginPath()
      ctx.moveTo(bx + dir * 28, by)
      ctx.lineTo(bx + dir * 20, by - 4)
      ctx.lineTo(bx + dir * 20, by + 4)
      ctx.closePath()
      ctx.fillStyle = ballColor
      ctx.fill()
    }
    // 球体（柔和阴影增加立体感）
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.28)"
    ctx.shadowBlur = 9
    ctx.shadowOffsetY = 3
    const ballGrad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, 9)
    ballGrad.addColorStop(0, "#fcd34d")
    ballGrad.addColorStop(1, ballColor)
    ctx.fillStyle = ballGrad
    ctx.beginPath()
    ctx.arc(bx, by, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = "rgba(255,255,255,0.6)"
    ctx.beginPath()
    ctx.arc(bx - 2.5, by - 2.5, 2.3, 0, Math.PI * 2)
    ctx.fill()

    // 轴标签
    ctx.fillStyle = axisColor
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillText("loss", sx(X_MIN) + 2, sy(Y_MAX) + 10)
    ctx.fillText("θ", sx(X_MAX) - 12, by > sy(0) - 14 ? sy(0) - 6 : sy(0) + 14)
  }, [layout, applyViewport])

  // ===== 执行一步梯度下降 =====
  const computeNext = useCallback((): { next: number; status: Info["status"] } => {
    const x = targetRef.current
    const g = grad(x)
    const next = x - etaRef.current * g
    let status: Info["status"] = "descending"
    if (Math.abs(next) > DIVERGE_X) status = "diverged"
    else if (Math.abs(grad(next)) < CONVERGE_EPS) status = "converged"
    return { next, status }
  }, [])

  const startStep = useCallback(() => {
    const { next, status } = computeNext()
    targetRef.current = next
    animatingRef.current = true
    stepRef.current += 1
    trailRef.current.push(next)
    if (trailRef.current.length > 40) trailRef.current.shift()
    if (status === "converged" || status === "diverged") {
      playingRef.current = false
      setPlaying(false)
    }
  }, [computeNext])

  // ===== 主循环（rAF） =====
  useEffect(() => {
    const SLIDE_MS = 520 // 两点滑动时长
    const PAUSE_MS = 320 // 落定后停顿再走下一步
    let slideStart = 0
    let slideFrom = xRef.current

    const tick = (now: number) => {
      if (animatingRef.current) {
        if (slideStart === 0) {
          slideStart = now
          slideFrom = xRef.current
        }
        const t = Math.min(1, (now - slideStart) / SLIDE_MS)
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // easeInOutQuad
        xRef.current = slideFrom + (targetRef.current - slideFrom) * ease
        if (t >= 1) {
          xRef.current = targetRef.current
          animatingRef.current = false
          slideStart = 0
          settledAtRef.current = now
          const x = xRef.current
          const g = grad(x)
          const status: Info["status"] =
            Math.abs(x) > DIVERGE_X
              ? "diverged"
              : Math.abs(g) < CONVERGE_EPS
                ? "converged"
                : "descending"
          setInfo({ step: stepRef.current, x, loss: f(x), g, status })
        }
      } else if (playingRef.current && now - settledAtRef.current > PAUSE_MS) {
        startStep()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, startStep])

  // ===== 控制 =====
  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    animatingRef.current = false
    xRef.current = START_X
    targetRef.current = START_X
    trailRef.current = [START_X]
    stepRef.current = 0
    settledAtRef.current = 0
    setInfo({ step: 0, x: START_X, loss: f(START_X), g: grad(START_X), status: "ready" })
  }, [])

  const handleStep = useCallback(() => {
    if (animatingRef.current) return
    if (info.status === "converged" || info.status === "diverged") return
    startStep()
  }, [startStep, info.status])

  const togglePlay = useCallback(() => {
    if (info.status === "converged" || info.status === "diverged") {
      handleReset()
      // 重置后自动开播
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [info.status, handleReset])

  // 讲课模式：3 拍 = 三种学习率（合适收敛 / 偏大震荡 / 过大发散），每拍设好 η+复位+开播，
  // 念这句话期间小球按真实更新规则滚/震/飞（音画大致同步）。
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
      const go = (v: number) => {
        setEta(v)
        etaRef.current = v
        handleReset()
        setPlaying(true)
        playingRef.current = true
      }
      return [
        {
          apply: () => go(0.1),
          text: "梯度下降，就是让参数沿着损失下降最快的方向、一步一步往下挪。学习率 η 控制每一步迈多大。先看一个合适的 η=0.1：小球稳稳地滚向谷底，最后停在最低点——这就是收敛。",
        },
        {
          apply: () => go(0.95),
          text: "现在把 η 调大到接近 1。步子迈得太大，小球一冲就过头，于是在谷底两边来回横跳、震荡好一会儿才勉强稳下来。",
        },
        {
          apply: () => go(1.05),
          text: "再大一点，超过临界值，你看——每一步反而越走越远、损失不降反升，直接发散了。所以学习率不是越大越好，得调得恰到好处。",
        },
      ]
    },
  })

  const caption = CAPTIONS[info.status]
  const statusColor =
    info.status === "converged"
      ? "text-emerald-600 dark:text-emerald-400"
      : info.status === "diverged"
        ? "text-rose-600 dark:text-rose-400"
        : "text-[var(--foreground)]"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* 画布 */}
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 320, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
        {/* 实时数值 HUD */}
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-relaxed">
          <div>step = {info.step}</div>
          <div>θ = {info.x.toFixed(3)}</div>
          <div>loss = {info.loss.toFixed(3)}</div>
          <div>∇ = {info.g.toFixed(3)}</div>
        </div>
      </div>

      {/* 讲课模式下隐藏自带字幕条/控件/提示，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${statusColor}`}>
        <span className="font-medium">{caption.title}</span>
        <span className="text-[var(--muted-foreground)]"> —— {caption.body}</span>
      </div>
      )}

      {!lecture && (<>
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {info.status === "converged" || info.status === "diverged"
            ? "重新演示"
            : playing
              ? "暂停"
              : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing}>
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>

        {/* 学习率 η 滑块 */}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
            学习率 η = <span className="font-mono text-[var(--foreground)]">{eta.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0.02}
            max={1.05}
            step={0.01}
            value={eta}
            onChange={(e) => setEta(parseFloat(e.target.value))}
            className="w-36 accent-amber-500"
          />
        </div>
      </div>

      {/* η 提示 */}
      <div className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
        试试：η&lt;0.1 收敛慢 · η≈0.5 临界震荡 · η&gt;1 直接发散 —— 一个滑块讲透学习率的作用
      </div>
      </>)}
    </div>
  )
}

const CAPTIONS: Record<Info["status"], { title: string; body: string }> = {
  ready: {
    title: "准备就绪",
    body: "小球停在损失曲面高处。点「播放」让它沿负梯度方向滚向谷底（最优解）。",
  },
  descending: {
    title: "沿负梯度下降一步",
    body: "更新规则 θ ← θ − η·∇f(θ)。梯度越陡，步子越大；越靠近谷底越平缓。",
  },
  converged: {
    title: "已收敛到最优解附近 ✓",
    body: "梯度 ∇≈0，参数几乎不再变化——这就是训练「收敛」的含义。",
  },
  diverged: {
    title: "发散了 ✗",
    body: "学习率过大，每步越走越远、损失反而暴涨。这说明 η 不是越大越好。",
  },
}
