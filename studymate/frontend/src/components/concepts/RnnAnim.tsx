/**
 * 概念动画 · 循环神经网络 RNN（机器学习 · 序列模型）
 * ------------------------------------------------------------------
 * 真实递推：序列 x₁…x_T 按时间步逐个喂入，隐藏状态带着「记忆」往后传：
 *   hₜ = tanh(W_xh·xₜ + W_hh·hₜ₋₁ + b)
 *   - 同一套权重 W 在每个时间步复用（参数共享）
 *   - hₜ₋₁ 把过去的信息带到当前步 → 网络有了「记忆」
 *   - 最后一个 h_T 浓缩了整条序列
 * 按时间步展开，隐藏状态沿时间轴传递。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 850
const T = 6 // 序列长度
const H = 3 // 隐藏维度

interface Net {
  xs: number[] // 输入序列（标量）
  Wxh: number[] // H
  Whh: number[][] // H×H
  bh: number[] // H
  hs: number[][] // 每步隐藏状态 H，hs[t]
}
const tanh = (v: number) => Math.tanh(v)
function genNet(): Net {
  const r = () => +(Math.random() * 1.6 - 0.8).toFixed(2)
  const xs = Array.from({ length: T }, () => +(Math.random() * 2 - 1).toFixed(1))
  const Wxh = Array.from({ length: H }, r)
  const Whh = Array.from({ length: H }, () => Array.from({ length: H }, () => +(Math.random() * 0.8 - 0.4).toFixed(2)))
  const bh = Array.from({ length: H }, () => +(Math.random() * 0.4 - 0.2).toFixed(2))
  const hs: number[][] = []
  let prev = new Array(H).fill(0)
  for (let t = 0; t < T; t++) {
    const h = new Array(H).fill(0).map((_, i) => {
      let s = Wxh[i] * xs[t] + bh[i]
      for (let j = 0; j < H; j++) s += Whh[i][j] * prev[j]
      return tanh(s)
    })
    hs.push(h)
    prev = h
  }
  return { xs, Wxh, Whh, bh, hs }
}

export function RnnAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已展开到第几个时间步（0..T）
  const netRef = useRef<Net>(genNet())
  const posRef = useRef(0)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    netRef.current = genNet()
    setPos(0)
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
    const net = netRef.current
    const p = posRef.current

    const cw = 70 // 单元宽
    const gap = (cssW - 40 - T * cw) / (T - 1)
    const x0 = 28
    const cellY = cssH / 2 - 30
    const cellH = 64
    const valColor = (v: number) => {
      const t = (v + 1) / 2 // -1..1 → 0..1
      return v >= 0 ? `rgba(99,102,241,${0.25 + t * 0.6})` : `rgba(244,63,94,${0.25 + (1 - t) * 0.6})`
    }

    // 顶部说明
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("隐藏状态 h（记忆）沿时间轴向右传递 · 每步复用同一套权重 W", 118, 22)

    for (let t = 0; t < T; t++) {
      const cx = x0 + t * (cw + gap)
      const revealed = t < p
      // 递推箭头（h_{t-1} → h_t）
      if (t > 0 && t <= p) {
        const px = x0 + (t - 1) * (cw + gap) + cw
        ctx.strokeStyle = revealed || t === p ? "#6366f1" : isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(px, cellY + cellH / 2)
        ctx.lineTo(cx, cellY + cellH / 2)
        ctx.stroke()
        // 箭头
        ctx.beginPath()
        ctx.moveTo(cx, cellY + cellH / 2)
        ctx.lineTo(cx - 6, cellY + cellH / 2 - 4)
        ctx.lineTo(cx - 6, cellY + cellH / 2 + 4)
        ctx.closePath()
        ctx.fillStyle = "#6366f1"
        ctx.fill()
      }
      // 单元格
      const cur = t === p - 1
      ctx.fillStyle = revealed ? (isDark ? "#1f2937" : "#eef2ff") : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"
      ctx.fillRect(cx, cellY, cw, cellH)
      ctx.strokeStyle = cur ? "#f59e0b" : revealed ? "#6366f1" : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = cur ? 3 : 1.5
      ctx.strokeRect(cx, cellY, cw, cellH)
      // RNN 标签
      ctx.fillStyle = revealed ? FG : MUT
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("RNN", cx + cw / 2, cellY + 15)
      // 隐藏状态 3 个值（小方块）
      if (revealed) {
        const bw = 16
        const by = cellY + 24
        for (let i = 0; i < H; i++) {
          const bx = cx + cw / 2 - (H * bw) / 2 + i * bw
          ctx.fillStyle = valColor(net.hs[t][i])
          ctx.fillRect(bx + 1, by, bw - 2, 22)
          ctx.fillStyle = isDark ? "#fafafa" : "#18181b"
          ctx.font = "10px ui-monospace, monospace"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(net.hs[t][i].toFixed(1), bx + bw / 2, by + 11)
        }
        ctx.textBaseline = "alphabetic"
      }
      // 时间步标签 + 输入 x_t（下方）
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(`t=${t + 1}`, cx + cw / 2, cellY + cellH + 18)
      // 输入箭头从下进入
      const ix = cx + cw / 2
      const iy = cellY + cellH + 24
      ctx.strokeStyle = revealed ? "#10b981" : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ix, iy + 18)
      ctx.lineTo(ix, cellY + cellH)
      ctx.stroke()
      ctx.fillStyle = revealed ? "#10b981" : MUT
      ctx.font = "600 11px ui-monospace, monospace"
      ctx.fillText(`x=${net.xs[t].toFixed(1)}`, ix, iy + 32)
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < T) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= T
  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < T) setPos((p) => p + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

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
    buildBeats: () =>
      chunkedBeats(
        T + 1,
        [
          "普通神经网络一次只能吃固定大小的输入，可像句子、语音、股价这种序列，长度不定、还讲先后顺序。循环神经网络 RNN 的办法是：把序列拆成一个个时间步，一步一步地处理。",
          "看第一步：把 x₁ 喂进来，算出一个隐藏状态 h₁，里面这几个数就是网络对「目前为止看到了什么」的记忆。注意每个时间步用的都是同一套权重 W——这叫参数共享，所以序列再长，参数也不增加。",
          "关键在这条向右的箭头：上一步的隐藏状态 hₜ₋₁ 会和当前输入 xₜ 一起，按 hₜ=tanh(W·xₜ + W·hₜ₋₁ + b) 算出新的 hₜ。过去的信息就这样被一路带着往后传，网络因此有了「记忆」。",
          "一步步走到序列末尾，最后那个 h 就浓缩了整条序列的信息，可以拿去做分类或预测。这就是 RNN——用循环复用同一套权重处理任意长度的序列。它也有长序列记不住的毛病，于是后来有了 LSTM 和注意力机制。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? `序列处理完毕：h 沿时间轴传到末尾，最后的 h 浓缩了整条序列。同一套权重 W 复用了 ${T} 步（参数共享）。`
    : pos === 0
      ? "RNN 把序列按时间步逐个处理，隐藏状态 h 当「记忆」沿时间轴向右传。点播放。"
      : `第 ${pos} 步：hₜ = tanh(W·xₜ + W·hₜ₋₁ + b)，把上一步记忆 hₜ₋₁ 和当前输入 xₜ 融合成新记忆。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          t = {Math.min(pos, T)} / {T}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-indigo-600 dark:text-indigo-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步（下一时间步）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 换序列
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=输入 xₜ · 方块=隐藏状态 h · 蓝箭头=记忆传递</span>
        </div>
      )}
    </div>
  )
}
