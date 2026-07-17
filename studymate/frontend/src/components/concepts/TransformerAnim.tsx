/**
 * 概念动画 · Transformer 架构（机器学习 · 大模型基石）
 * ------------------------------------------------------------------
 * 一个 Transformer 编码器块的数据流（自底向上）：
 *   输入嵌入+位置编码 → 多头自注意力 → Add&Norm → 前馈 FFN → Add&Norm → 输出
 * 核心是多头自注意力：每词生成 Q/K/V，Q·Kᵀ/√d → softmax → 加权 V；
 * 多个「头」并行看不同关系，最后拼接。右侧热力图为真实计算(2 头)。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 1700
const TOKENS = ["我", "爱", "学", "习"]
const N = TOKENS.length
const D = 4
const HEADS = 2
const DH = D / HEADS

// 固定矩阵
const X = [
  [0.9, 0.1, 0.2, 0.7],
  [0.2, 0.8, 0.6, 0.1],
  [0.7, 0.3, 0.9, 0.4],
  [0.1, 0.6, 0.3, 0.8],
]
// 权重幅度放大些，让真实算出的注意力有明显对比（否则点积太小、softmax 近乎均匀）
const mk = (seed: number) =>
  Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => +(Math.sin((i + 1) * 12.9 + (j + 1) * 7.7 + seed) * 1.6).toFixed(2)))
const WQ = mk(1)
const WK = mk(2)
function matmul(A: number[][], B: number[][]): number[][] {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))
}
function softmaxRow(v: number[]): number[] {
  const m = Math.max(...v)
  const e = v.map((x) => Math.exp(x - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / s)
}
// 每个头的注意力矩阵（真实）
function attentions(): number[][][] {
  const Q = matmul(X, WQ)
  const K = matmul(X, WK)
  const heads: number[][][] = []
  for (let h = 0; h < HEADS; h++) {
    const c0 = h * DH
    const A: number[][] = []
    for (let i = 0; i < N; i++) {
      const scores: number[] = []
      for (let j = 0; j < N; j++) {
        let dot = 0
        for (let d = 0; d < DH; d++) dot += Q[i][c0 + d] * K[j][c0 + d]
        scores.push(dot / Math.sqrt(DH))
      }
      A.push(softmaxRow(scores))
    }
    heads.push(A)
  }
  return heads
}

const STAGES = ["输入嵌入 + 位置编码", "多头自注意力", "Add & Norm（残差+层归一化）", "前馈网络 FFN", "Add & Norm", "编码器输出"]

export function TransformerAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 当前阶段 0..STAGES-1
  const headsRef = useRef<number[][][]>(attentions())
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

  const total = STAGES.length

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
    const p = posRef.current

    // ===== 左：堆叠块流程图（自底向上）=====
    const bx = 30
    const bw = 240
    const bh = 36
    const gap = 10
    const totalH = STAGES.length * bh + (STAGES.length - 1) * gap
    const by0 = (cssH - totalH) / 2
    for (let i = 0; i < STAGES.length; i++) {
      // 自底向上：i=0 在最下
      const y = by0 + (STAGES.length - 1 - i) * (bh + gap)
      const active = i === p
      const reached = i <= p
      const isAttn = i === 1
      const isFFN = i === 3
      ctx.fillStyle = active
        ? "rgba(245,158,11,0.85)"
        : reached
          ? isAttn
            ? "rgba(99,102,241,0.32)"
            : isFFN
              ? "rgba(16,185,129,0.28)"
              : isDark
                ? "rgba(99,102,241,0.16)"
                : "rgba(99,102,241,0.1)"
          : isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(0,0,0,0.04)"
      ctx.fillRect(bx, y, bw, bh)
      ctx.strokeStyle = active ? "#f59e0b" : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = active ? 2.5 : 1
      ctx.strokeRect(bx, y, bw, bh)
      ctx.fillStyle = active ? "#fff" : reached ? FG : MUT
      ctx.font = `${active ? "600 " : ""}12px ui-sans-serif, system-ui`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(STAGES[i], bx + bw / 2, y + bh / 2)
      // 向上箭头
      if (i < STAGES.length - 1) {
        const ay = y - gap / 2
        ctx.strokeStyle = i < p ? "#6366f1" : isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(bx + bw / 2, y)
        ctx.lineTo(bx + bw / 2, ay + 3)
        ctx.stroke()
      }
    }

    // ===== 右：多头自注意力热力图（真实）=====
    const heads = headsRef.current
    const panelX = bx + bw + 40
    ctx.fillStyle = FG
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("多头自注意力（每词关注谁，真实计算）", panelX, by0 - 2)

    const grid = 30
    const labelPad = 22
    const hmW = labelPad + N * grid
    for (let h = 0; h < HEADS; h++) {
      const ox = panelX + h * (hmW + 30)
      const oy = by0 + 24
      ctx.fillStyle = p === 1 ? "#6366f1" : MUT
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText(`头 ${h + 1}`, ox + labelPad, oy - 6)
      // 列标签
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (let j = 0; j < N; j++) ctx.fillText(TOKENS[j], ox + labelPad + j * grid + grid / 2, oy - 0)
      for (let i = 0; i < N; i++) {
        // 行标签
        ctx.fillStyle = MUT
        ctx.textAlign = "right"
        ctx.fillText(TOKENS[i], ox + labelPad - 4, oy + 14 + i * grid + grid / 2)
        for (let j = 0; j < N; j++) {
          const a = heads[h][i][j]
          ctx.fillStyle = `rgba(99,102,241,${0.1 + a * 0.85})`
          ctx.fillRect(ox + labelPad + j * grid, oy + 14 + i * grid, grid - 2, grid - 2)
          ctx.fillStyle = a > 0.5 ? "#fff" : isDark ? "#a1a1aa" : "#52525b"
          ctx.font = "9px ui-monospace, monospace"
          ctx.textAlign = "center"
          ctx.fillText(a.toFixed(2), ox + labelPad + j * grid + grid / 2, oy + 14 + i * grid + grid / 2)
        }
      }
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("行=查询词, 列=被关注词", ox + labelPad + (N * grid) / 2, oy + 14 + N * grid + 14)
    }

    // 当前阶段说明
    ctx.fillStyle = "#f59e0b"
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`▶ ${STAGES[Math.min(p, total - 1)]}`, panelX, cssH - 22)
  }, [total, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total - 1) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total - 1
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total - 1) setPos((p) => p + 1)
  }, [total])
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
        total,
        [
          "Transformer 彻底抛弃了 RNN 那种一个词一个词按顺序处理的方式,让句子里所有词一次性、并行地相互「看」。第一步,给每个词一个向量表示,再加上位置编码,把词的先后顺序信息补回来。",
          "它的心脏是多头自注意力。每个词都生成三个向量:查询 Q、键 K、值 V。拿自己的 Q 去和所有词的 K 做点积、除以根号 d、再 softmax,就得到「我该多关注每个词」的权重——右边热力图就是真实算出来的,颜色越深关注越多。再用这些权重去加权所有词的 V。",
          "而且不止一个头:多个注意力头并行工作,各看各的关系,有的盯语法、有的盯指代,最后把各头的结果拼接起来。之后过一个 Add&Norm——残差连接加层归一化,稳住深层训练。",
          "接着每个位置再独立过一个前馈网络 FFN 做非线性加工,又一次 Add&Norm,就完成了一个 Transformer 块。把这样的块堆叠 N 层,就是编码器。全程没有循环、高度并行、还能直接看到长距离依赖——这正是 BERT、GPT 这些大模型的基石。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? "一个 Transformer 块：多头自注意力 + Add&Norm + FFN + Add&Norm。堆叠 N 层即编码器，全靠注意力、高度并行 → 大模型基石。"
    : `阶段 ${pos + 1}/${total}：${STAGES[pos]}。${pos === 1 ? "右侧热力图=真实算出的每词注意力权重(2 个头)。" : "核心是多头自注意力。"}`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {pos + 1} / {total}
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
            <SkipForward className="size-4" /> 单步（下一阶段）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">左=块流程 · 右=真实多头注意力</span>
        </div>
      )}
    </div>
  )
}
