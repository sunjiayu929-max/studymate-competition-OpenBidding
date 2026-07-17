/**
 * 概念动画 · 神经网络前向传播 Forward Propagation（机器学习）
 * ------------------------------------------------------------------
 * 真实多层感知机前向计算：a⁰=输入，逐层 z=W·a+b、a=σ(z)，数据从左到右流动。
 *   - 边按权重正负着色（蓝=正/红=负）、粗细按 |w|
 *   - 节点填充深浅 = 激活值大小；逐层揭示，看信号一层层算出来
 *   - ▶播放 / ⏸暂停 / ⏭单步（算下一层）/ ↻重置（换一组权重/输入）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const SIZES = [3, 4, 4, 2] // 各层神经元数：输入3 → 隐藏4 → 隐藏4 → 输出2
const STEP_MS = 900

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

interface Net {
  a: number[][] // 各层激活值
  W: number[][][] // W[l][j][i]：第 l→l+1 层，权重
}

function buildNet(): Net {
  const a: number[][] = [Array.from({ length: SIZES[0] }, () => rand(0.1, 0.95))]
  const W: number[][][] = []
  for (let l = 0; l < SIZES.length - 1; l++) {
    const w: number[][] = []
    const next: number[] = []
    for (let j = 0; j < SIZES[l + 1]; j++) {
      const row: number[] = []
      let z = rand(-0.6, 0.6) // bias
      for (let i = 0; i < SIZES[l]; i++) {
        const wij = rand(-1.3, 1.3)
        row.push(wij)
        z += wij * a[l][i]
      }
      w.push(row)
      next.push(sigmoid(z))
    }
    W.push(w)
    a.push(next)
  }
  return { a, W }
}

export function ForwardPropAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(0) // 已算到第几层（0=只有输入层）

  const netRef = useRef<Net>({ a: [], W: [] })
  const revealedRef = useRef(0)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    revealedRef.current = revealed
  }, [revealed])

  const init = useCallback(() => {
    netRef.current = buildNet()
    setRevealed(0)
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const maxLayer = SIZES.length - 1
  const done = revealed >= maxLayer

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

    const padX = 46
    const padY = 36
    const isDark = document.documentElement.classList.contains("dark")
    const net = netRef.current
    const nRev = revealedRef.current
    const L = SIZES.length

    const colX = (l: number) => padX + (l / (L - 1)) * (cssW - padX * 2)
    const nodeY = (l: number, i: number) => {
      const n = SIZES[l]
      const span = cssH - padY * 2
      return padY + (n === 1 ? span / 2 : (i / (n - 1)) * span)
    }

    // 边（仅画目标层已揭示的）
    for (let l = 0; l < L - 1; l++) {
      if (l + 1 > nRev) continue
      const active = l + 1 === nRev
      for (let j = 0; j < SIZES[l + 1]; j++) {
        for (let i = 0; i < SIZES[l]; i++) {
          const w = net.W[l][j][i]
          const pos = w >= 0
          ctx.strokeStyle = pos ? "#3b82f6" : "#ef4444"
          ctx.globalAlpha = (active ? 0.5 : 0.22) + Math.min(0.45, Math.abs(w) * 0.35)
          ctx.lineWidth = 0.6 + Math.abs(w) * 1.6
          ctx.beginPath()
          ctx.moveTo(colX(l) + 16, nodeY(l, i))
          ctx.lineTo(colX(l + 1) - 16, nodeY(l + 1, j))
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }

    // 节点
    for (let l = 0; l <= nRev; l++) {
      const active = l === nRev && nRev > 0
      for (let i = 0; i < SIZES[l]; i++) {
        const x = colX(l)
        const y = nodeY(l, i)
        const v = net.a[l][i]
        ctx.beginPath()
        ctx.arc(x, y, 16, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99,102,241,${0.12 + v * 0.8})`
        ctx.fill()
        ctx.lineWidth = active ? 3 : 1.5
        ctx.strokeStyle = active ? "#6366f1" : isDark ? "#52525b" : "#a1a1aa"
        ctx.stroke()
        // 激活值
        ctx.fillStyle = v > 0.55 ? "#fff" : isDark ? "#e4e4e7" : "#27272a"
        ctx.font = "bold 12px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(v.toFixed(2), x, y)
      }
    }

    // 层标签
    const labels = ["输入层", "隐藏层 1", "隐藏层 2", "输出层"]
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = isDark ? "#a1a1aa" : "#71717a"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let l = 0; l < L; l++) {
      ctx.globalAlpha = l <= nRev ? 1 : 0.35
      ctx.fillText(labels[l], colX(l), cssH - 18)
    }
    ctx.globalAlpha = 1
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (revealedRef.current < maxLayer) setRevealed((r) => r + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, maxLayer])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (revealedRef.current < maxLayer) setRevealed((r) => r + 1)
  }, [maxLayer])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

  // 讲课模式：3 拍讲清「输入层 → 加权求和+激活 → 一路传到输出」，逐层揭示（音画同步）
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
      // 念这一轮真实的输入特征值与最终输出（像老师指着圈里的数读）
      const a = netRef.current.a
      const inp = a[0].map((v) => v.toFixed(2)).join("、")
      const out = a[a.length - 1].map((v) => v.toFixed(2)).join(" 和 ")
      return chunkedBeats(
        maxLayer + 1,
        [
          `前向传播，就是数据从左往右、一层层算出结果的过程。最左边输入层是三个特征值：${inp}，这就是网络拿到的原始数据。`,
          "往右走一层：每个神经元，把上一层所有激活值收集过来，各自乘上一个权重再加起来——蓝边是正权重、红边是负权重，越粗越重要——加完再过一道激活函数 σ，压成自己的激活值，就是圈里那个数。",
          `后面每一层都重复这同一件事：加权求和、再激活，一层喂给下一层。信号一路传到输出层，最后得到两个输出：${out}。这就是神经网络的前向传播。`,
        ],
        (i) => setRevealed(i)
      )
    },
  })

  const caption = done
    ? "输出层算完，得到预测。前向传播 = 数据从左到右，每层做「加权求和 z=Σw·a+b」再过激活函数 σ(z)。"
    : revealed === 0
      ? "最左边是输入层（3 个特征值）。点播放，看信号一层层往右算。蓝边=正权重、红边=负权重，越粗越重要。"
      : revealed < maxLayer
        ? `第 ${revealed} 层算好了：每个神经元收集上一层所有激活值，加权求和再过 σ → 得到自己的激活值（圈里数字）。`
        : "到输出层了——继续算出最终预测。"

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
          层 {revealed} / {maxLayer}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
          <SkipForward className="size-4" /> 单步（算下一层）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 换一组
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">圈内数字 = 激活值 · 蓝/红边 = 权重正/负</span>
      </div>
      )}
    </div>
  )
}
