/**
 * 概念动画 · 激活函数 Activation Functions（机器学习）
 * ------------------------------------------------------------------
 * 真实绘制 4 个常用激活函数及其导数：实线=f(x)，虚线=f'(x)。
 *   - 一个标记从左到右扫过，实时显示 x / f(x) / f'(x)
 *   - 重点看导数：sigmoid/tanh 两端饱和 → 导数趋 0 → 梯度消失；
 *     ReLU 正半轴导数恒为 1（不衰减），负半轴为 0（死区）
 *   - 顶部切换函数；▶播放 / ⏸暂停 / ⏭单步 / ↻重置（标记回到最左）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const STEP_MS = 28
const XR = 6 // x 轴范围 [-6,6]（默认视图）
// 伪无限：曲线/坐标轴/网格按真实函数向左右(及上下)延伸 PLOT_EXT 倍。
// 默认 scale=1 时只露出 [-6,6]，与原来一致；缩小或平移即可追看曲线连续延伸、永不凭空截断。
const PLOT_EXT = 12

interface Fn {
  key: string
  name: string
  f: (x: number) => number
  d: (x: number) => number
  yr: [number, number] // y 轴范围
  note: string
}

const FNS: Fn[] = [
  {
    key: "relu",
    name: "ReLU",
    f: (x) => Math.max(0, x),
    d: (x) => (x > 0 ? 1 : 0),
    yr: [-0.5, 6],
    note: "ReLU(x)=max(0,x)：正半轴导数恒为 1（梯度不衰减、训练快），负半轴恒为 0（神经元可能「死掉」）。深网默认首选。",
  },
  {
    key: "sigmoid",
    name: "Sigmoid",
    f: (x) => 1 / (1 + Math.exp(-x)),
    d: (x) => {
      const s = 1 / (1 + Math.exp(-x))
      return s * (1 - s)
    },
    yr: [-0.1, 1.1],
    note: "σ(x)=1/(1+e⁻ˣ)：把值压到 (0,1) 像概率。但两端平坦 → 导数趋 0 → 深层梯度消失，且输出非零中心。",
  },
  {
    key: "tanh",
    name: "Tanh",
    f: (x) => Math.tanh(x),
    d: (x) => 1 - Math.tanh(x) ** 2,
    yr: [-1.1, 1.1],
    note: "tanh(x)：形状像 sigmoid 但压到 (-1,1)、零中心，收敛通常更好；两端同样饱和、仍有梯度消失问题。",
  },
  {
    key: "leaky",
    name: "Leaky ReLU",
    f: (x) => (x > 0 ? x : 0.1 * x),
    d: (x) => (x > 0 ? 1 : 0.1),
    yr: [-1, 6],
    note: "Leaky ReLU：负半轴给一个小斜率 0.1 而非 0，让「死掉」的神经元仍有微弱梯度可恢复，是 ReLU 的改良。",
  },
]

export function ActivationAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [fnIdx, setFnIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [t, setT] = useState(0) // 标记位置 0..1（映射到 x）

  const fnIdxRef = useRef(0)
  const tRef = useRef(0)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    fnIdxRef.current = fnIdx
  }, [fnIdx])
  useEffect(() => {
    tRef.current = t
  }, [t])
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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const pad = 30
    const plotW = cssW - pad * 2
    const plotH = cssH - pad * 2
    const isDark = document.documentElement.classList.contains("dark")
    const fn = FNS[fnIdxRef.current]
    const [y0, y1] = fn.yr
    const sx = (x: number) => pad + ((x + XR) / (2 * XR)) * plotW
    const sy = (y: number) => cssH - pad - ((y - y0) / (y1 - y0)) * plotH
    // 伪无限延伸范围：x 向两侧扩到 ±XR·PLOT_EXT，坐标轴/网格竖向也扩 PLOT_EXT 倍
    const EX = XR * PLOT_EXT
    const exTop = pad - plotH * (PLOT_EXT - 1)
    const exBot = cssH - pad + plotH * (PLOT_EXT - 1)
    const SAMPLES = 2600 // 拉宽后保持曲线分辨率

    // 网格 + 坐标轴（向四周延伸，缩小/平移时仍有参照、不戛然而止）
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"
    ctx.lineWidth = 1
    for (let gx = -EX; gx <= EX; gx += 2) {
      ctx.beginPath()
      ctx.moveTo(sx(gx), exTop)
      ctx.lineTo(sx(gx), exBot)
      ctx.stroke()
    }
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)"
    ctx.lineWidth = 1.2
    ctx.beginPath() // x 轴
    ctx.moveTo(sx(-EX), sy(0))
    ctx.lineTo(sx(EX), sy(0))
    ctx.stroke()
    ctx.beginPath() // y 轴
    ctx.moveTo(sx(0), exTop)
    ctx.lineTo(sx(0), exBot)
    ctx.stroke()

    // 导数虚线（按真实函数采样到 ±EX，曲线连续延伸）
    ctx.strokeStyle = "#f59e0b"
    ctx.globalAlpha = 0.65
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.8
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
      const x = -EX + (i / SAMPLES) * 2 * EX
      const cy = sy(fn.d(x)) // 真实位置，不夹边框 → 缩放/平移下连续、不截断
      if (i === 0) ctx.moveTo(sx(x), cy)
      else ctx.lineTo(sx(x), cy)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // 函数实线
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
      const x = -EX + (i / SAMPLES) * 2 * EX
      const cy = sy(fn.f(x)) // 真实位置，不夹边框 → 缩放/平移下连续、不截断
      if (i === 0) ctx.moveTo(sx(x), cy)
      else ctx.lineTo(sx(x), cy)
    }
    ctx.stroke()

    // 扫描标记
    const mx = -XR + tRef.current * 2 * XR
    const my = fn.f(mx)
    const md = fn.d(mx)
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx(mx), pad)
    ctx.lineTo(sx(mx), cssH - pad)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(sx(mx), sy(Math.max(y0, Math.min(y1, my))), 6, 0, Math.PI * 2)
    ctx.fillStyle = "#6366f1"
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = isDark ? "#0a0a0a" : "#fff"
    ctx.stroke()

    // 读数
    ctx.font = "12px ui-monospace, monospace"
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillStyle = "#6366f1"
    ctx.fillText(`f(x) = ${my.toFixed(2)}`, pad + 6, pad + 4)
    ctx.fillStyle = "#f59e0b"
    ctx.fillText(`f'(x) = ${md.toFixed(2)}`, pad + 6, pad + 22)
    ctx.fillStyle = isDark ? "#a1a1aa" : "#71717a"
    ctx.fillText(`x = ${mx.toFixed(2)}`, pad + 6, pad + 40)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setT((v) => {
          const nv = v + 0.006
          if (nv >= 1) {
            setPlaying(false)
            return 1
          }
          return nv
        })
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setT(0)
    setPlaying(true)
  }, [])
  const handleStep = useCallback(() => {
    setT((v) => Math.min(1, v + 0.05))
  }, [])
  const togglePlay = useCallback(() => {
    if (tRef.current >= 1) {
      setT(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [])
  const switchFn = useCallback((i: number) => {
    setFnIdx(i)
    setT(0)
    setPlaying(true)
  }, [])

  // 讲课模式：4 拍 = Sigmoid 形状 → Sigmoid 两端饱和(梯度消失) → ReLU → Leaky ReLU；apply 切函数 + 把扫描标记移到要讲的区域
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
      const show = (fi: number, tv: number) => {
        setFnIdx(fi)
        fnIdxRef.current = fi
        setT(tv)
        tRef.current = tv
        setPlaying(false)
        playingRef.current = false
      }
      return [
        {
          apply: () => show(1, 0.5),
          text: "激活函数给神经网络加上非线性——没有它，叠再多层也等于一层。先看最经典的 Sigmoid：它把任意输入都压到 0 到 1 之间，像个概率。",
        },
        {
          apply: () => show(1, 0.93),
          text: "但你盯着它两端看：输入稍微大一点或小一点，曲线就压得很平，导数那条虚线趋近于 0。深层网络反向传播时，这些接近 0 的梯度一层层相乘，越乘越小、几乎消失——这就是臭名昭著的梯度消失。",
        },
        {
          apply: () => show(0, 0.8),
          text: "于是 ReLU 登场：正半轴直接原样输出、导数恒等于 1，梯度一点都不衰减，训练快得多——所以它是现在深层网络的默认首选。",
        },
        {
          apply: () => show(3, 0.18),
          text: "不过 ReLU 也有毛病：负半轴恒为 0，神经元一旦掉进负区就再也激活不了、可能彻底死掉。Leaky ReLU 给负半轴留一点小斜率，让死掉的神经元还有机会复活。",
        },
      ]
    },
  })

  const fn = FNS[fnIdx]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* 函数切换（讲课模式由讲解词切换、隐藏手动切换条） */}
      {!lecture && (
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        {FNS.map((f, i) => (
          <button
            key={f.key}
            onClick={() => switchFn(i)}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              i === fnIdx
                ? "bg-indigo-500 text-white"
                : "border border-[var(--border)] text-[var(--muted-foreground)] hover:border-indigo-300"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>
      )}
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 300, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
      </div>
      {/* 讲课模式下隐藏自带说明 + 控件，交给播放器 */}
      {!lecture && (<>
      <div className="px-4 py-2.5 text-sm border-t border-[var(--border)] text-[var(--muted-foreground)] leading-relaxed">
        {fn.note}
      </div>
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {t >= 1 ? "重新扫描" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={t >= 1}>
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          <span className="text-indigo-500">实线 f(x)</span> · <span className="text-amber-500">虚线 f'(x)</span>
        </span>
      </div>
      </>)}
    </div>
  )
}
