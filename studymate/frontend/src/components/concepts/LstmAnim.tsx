/**
 * 概念动画 · 长短期记忆网络 LSTM（机器学习 · 序列模型）
 * ------------------------------------------------------------------
 * 真实门控（标量演示）：在 RNN 基础上加一条「细胞状态」传送带 c + 三个门：
 *   f = σ(Wf·[h,x]+bf)  遗忘门：旧记忆留多少
 *   i = σ(Wi·[h,x]+bi)  输入门：新信息写多少
 *   g = tanh(Wg·[h,x]+bg)  候选记忆
 *   o = σ(Wo·[h,x]+bo)  输出门：从记忆读多少
 *   c' = f·c + i·g        h' = o·tanh(c')
 * 让梯度沿 c 长距离流动 → 记得住长依赖。逐时间步看门与记忆更新。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 1100
const T = 6
const sig = (v: number) => 1 / (1 + Math.exp(-v))
// 固定权重 [w_h, w_x, b]，让各门值有高有低、好看
const W = {
  f: [0.6, 1.1, 0.2],
  i: [0.5, 1.3, -0.1],
  g: [0.4, 1.5, 0.0],
  o: [0.7, 0.9, 0.1],
}
interface Cell {
  x: number
  f: number
  i: number
  g: number
  o: number
  c: number
  h: number
}
function genSeq(): Cell[] {
  const xs = [0.8, -0.6, 1.0, 0.3, -0.9, 0.7]
  const cells: Cell[] = []
  let h = 0
  let c = 0
  for (let t = 0; t < T; t++) {
    const x = xs[t]
    const f = sig(W.f[0] * h + W.f[1] * x + W.f[2])
    const i = sig(W.i[0] * h + W.i[1] * x + W.i[2])
    const g = Math.tanh(W.g[0] * h + W.g[1] * x + W.g[2])
    const o = sig(W.o[0] * h + W.o[1] * x + W.o[2])
    c = f * c + i * g
    h = o * Math.tanh(c)
    cells.push({ x, f, i, g, o, c, h })
  }
  return cells
}

export function LstmAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已处理到第几步 0..T
  const seqRef = useRef<Cell[]>(genSeq())
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])

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
    const cells = seqRef.current
    const p = posRef.current
    const idx = Math.min(Math.max(p - 1, 0), T - 1)
    const cur = cells[idx]
    const prevC = idx > 0 ? cells[idx - 1].c : 0

    // ===== 上：细胞状态 c 传送带 + 隐藏状态 h 时间线 =====
    const tlY = 56
    const cw = (cssW - 80) / T
    const x0 = 40
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillStyle = "#f59e0b"
    ctx.fillText("细胞 c", x0 - 6, tlY)
    ctx.fillStyle = "#6366f1"
    ctx.fillText("隐藏 h", x0 - 6, tlY + 34)
    const colorCell = (v: number, hot: string) => {
      const t = Math.max(0, Math.min(1, (v + 1.5) / 3))
      return `rgba(${hot === "c" ? "245,158,11" : "99,102,241"},${0.2 + t * 0.7})`
    }
    for (let t = 0; t < T; t++) {
      const cx = x0 + t * cw
      const on = t < p
      // c
      ctx.fillStyle = on ? colorCell(cells[t].c, "c") : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
      ctx.fillRect(cx, tlY - 12, cw - 8, 24)
      // h
      ctx.fillStyle = on ? colorCell(cells[t].h, "h") : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
      ctx.fillRect(cx, tlY + 22, cw - 8, 24)
      if (on) {
        ctx.fillStyle = isDark ? "#fafafa" : "#18181b"
        ctx.font = "10px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.fillText(cells[t].c.toFixed(2), cx + (cw - 8) / 2, tlY)
        ctx.fillText(cells[t].h.toFixed(2), cx + (cw - 8) / 2, tlY + 34)
      }
      ctx.strokeStyle = t === idx && p > 0 ? "#10b981" : "transparent"
      ctx.lineWidth = 2.5
      if (t === idx && p > 0) {
        ctx.strokeRect(cx - 1, tlY - 13, cw - 6, 24)
        ctx.strokeRect(cx - 1, tlY + 21, cw - 6, 24)
      }
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(`t${t + 1} x=${cells[t].x}`, cx + (cw - 8) / 2, tlY + 58)
    }

    // ===== 下：当前步的门 =====
    if (p === 0) {
      ctx.fillStyle = MUT
      ctx.font = "13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("LSTM：细胞状态 c 当「记忆传送带」，三个门精细控制读写。点播放逐步处理序列。", cssW / 2, 200)
      return
    }
    const gates = [
      { k: "遗忘门 f", v: cur.f, col: "#ef4444", desc: "旧记忆留多少" },
      { k: "输入门 i", v: cur.i, col: "#10b981", desc: "新信息写多少" },
      { k: "候选 g", v: cur.g, col: "#3b82f6", desc: "候选新记忆" },
      { k: "输出门 o", v: cur.o, col: "#a855f7", desc: "记忆读出多少" },
    ]
    const gy = 150
    const gw = (cssW - 80) / 4
    gates.forEach((g, k) => {
      const gx = 40 + k * gw
      ctx.fillStyle = FG
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(g.k, gx, gy)
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText(g.desc, gx, gy + 15)
      // 门值条（g 是 tanh ∈[-1,1]，其余 σ∈[0,1]）
      const isTanh = g.k.startsWith("候选")
      const frac = isTanh ? (g.v + 1) / 2 : g.v
      ctx.fillStyle = isDark ? "#27272a" : "#e4e4e7"
      ctx.fillRect(gx, gy + 22, gw - 24, 16)
      ctx.fillStyle = g.col
      ctx.fillRect(gx, gy + 22, (gw - 24) * frac, 16)
      ctx.fillStyle = FG
      ctx.font = "600 11px ui-monospace, monospace"
      ctx.fillText(g.v.toFixed(2), gx, gy + 52)
    })

    // 更新公式（真实数值）
    ctx.fillStyle = FG
    ctx.font = "12px ui-monospace, monospace"
    ctx.textAlign = "left"
    ctx.fillText(`c' = f·c + i·g = ${cur.f.toFixed(2)}·${prevC.toFixed(2)} + ${cur.i.toFixed(2)}·${cur.g.toFixed(2)} = ${cur.c.toFixed(2)}`, 40, gy + 78)
    ctx.fillText(`h' = o·tanh(c') = ${cur.o.toFixed(2)}·tanh(${cur.c.toFixed(2)}) = ${cur.h.toFixed(2)}`, 40, gy + 98)
    ctx.fillStyle = "#10b981"
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.fillText(`第 ${idx + 1} 步`, 40, gy - 4)
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
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < T) setPos((p) => p + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done])

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
          "普通 RNN 有个老毛病:序列一长,早期的信息就被冲淡、梯度也消失了,记不住长依赖。LSTM 的解法是加一条贯穿始终的「细胞状态」传送带 c,信息可以在上面几乎无损地一路传下去。",
          "怎么往传送带上读写,由三个门把关。遗忘门 f 是个 0 到 1 的开关,决定上一刻的旧记忆留多少;输入门 i 决定新的候选信息 g 写进去多少。新记忆 c' = f 乘旧记忆,加上 i 乘候选——该忘的忘、该记的记。",
          "最后输出门 o 决定,从更新好的细胞状态里读出多少,作为这一步真正输出的隐藏状态 h。你看下面这四个门的数值,每一步都在根据当前输入和上一步状态实时变化。",
          "正是这条 c 传送带,让梯度能跨越很多时间步稳定回传,LSTM 因此能记住很久以前的信息,搞定长句翻译、语音、时间序列这些长依赖任务。它的简化版 GRU 把门并成两个,更轻量。",
        ],
        (i) => setPos(i)
      ),
  })

  const cells = seqRef.current
  const idx = Math.min(Math.max(pos - 1, 0), T - 1)
  const cur = cells[idx]
  const caption = done
    ? `序列处理完:细胞状态 c 一路把记忆传到末尾。三个门(f/i/o)精细控制读写 → 记得住长依赖(解决 RNN 梯度消失)。`
    : pos === 0
      ? "LSTM = RNN + 细胞状态传送带 c + 三个门。点播放逐步看门控与记忆更新。"
      : `第 ${idx + 1} 步：f=${cur.f.toFixed(2)} i=${cur.i.toFixed(2)} o=${cur.o.toFixed(2)} → c=${cur.c.toFixed(2)}, h=${cur.h.toFixed(2)}。`

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
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=细胞 c · 蓝=隐藏 h · 下方=四个门</span>
        </div>
      )}
    </div>
  )
}
