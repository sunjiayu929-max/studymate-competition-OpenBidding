/**
 * 概念动画 · 自注意力 Attention（机器学习 / Transformer 核心）
 * ------------------------------------------------------------------
 * 真实自注意力计算：每个词有 Query/Key/Value 向量（这里 d=4，随机初始化）。
 *   每个词作为 Query，和所有词的 Key 做点积 → ÷√d → softmax 归一化成注意力权重，
 *   输出 = 各词 Value 的加权和。逐行揭示注意力矩阵（颜色越深越关注）。
 *   ▶播放 / ⏸暂停 / ⏭单步（算下一个词的注意力行）/ ↻重置（换一组向量）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const TOKENS = ["小猫", "坐", "在", "垫子", "上"]
const N = TOKENS.length
const D = 4
const STEP_MS = 1000

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

// 计算注意力矩阵：attn[i][j] = softmax_j(Q_i·K_j/√d)
function computeAttn(): number[][] {
  const Q: number[][] = []
  const Kk: number[][] = []
  for (let i = 0; i < N; i++) {
    Q.push(Array.from({ length: D }, () => rand(-1, 1)))
    Kk.push(Array.from({ length: D }, () => rand(-1, 1)))
  }
  const attn: number[][] = []
  for (let i = 0; i < N; i++) {
    const scores: number[] = []
    for (let j = 0; j < N; j++) {
      let s = 0
      for (let d = 0; d < D; d++) s += Q[i][d] * Kk[j][d]
      scores.push(s / Math.sqrt(D))
    }
    const mx = Math.max(...scores)
    const exps = scores.map((v) => Math.exp(v - mx))
    const sum = exps.reduce((a, b) => a + b, 0)
    attn.push(exps.map((e) => e / sum))
  }
  return attn
}

export function AttentionAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(0) // 已算出几行注意力

  const attnRef = useRef<number[][]>([])
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
    attnRef.current = computeAttn()
    setRevealed(0)
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const done = revealed >= N

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

    const isDark = document.documentElement.classList.contains("dark")
    const attn = attnRef.current
    const nRev = revealedRef.current

    const gy0 = 56 // 顶部留给 Key 标签
    // 格子尺寸受高度约束，再把整个网格按画布宽度水平居中（左侧仍留 Query 标签位）
    const cell = Math.min(54, (cssW - 186) / N, (cssH - gy0 - 30) / N)
    const gridW = cell * N
    const gx0 = Math.max(70, (cssW - gridW) / 2)

    // 顶部说明
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = isDark ? "#a1a1aa" : "#71717a"
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText("Key →（被关注的词）", gx0, 12)
    ctx.save()
    ctx.translate(Math.max(18, gx0 - 64), gy0 + gridW / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = "center"
    ctx.fillText("Query ↑（发出注意力的词）", 0, 0)
    ctx.restore()

    // Key 标签（列，顶部）
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let j = 0; j < N; j++) {
      ctx.fillStyle = isDark ? "#d4d4d8" : "#3f3f46"
      ctx.fillText(TOKENS[j], gx0 + j * cell + cell / 2, gy0 - 16)
    }
    // Query 标签（行，左侧）
    ctx.textAlign = "right"
    for (let i = 0; i < N; i++) {
      const activeRow = i === nRev - 1
      ctx.fillStyle = activeRow ? "#6366f1" : i < nRev ? (isDark ? "#d4d4d8" : "#3f3f46") : isDark ? "#52525b" : "#a1a1aa"
      ctx.font = activeRow ? "bold 12px ui-sans-serif, system-ui" : "12px ui-sans-serif, system-ui"
      ctx.fillText(TOKENS[i], gx0 - 12, gy0 + i * cell + cell / 2)
    }

    // 热力图格子
    ctx.font = "11px ui-monospace, monospace"
    ctx.textAlign = "center"
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const px = gx0 + j * cell
        const py = gy0 + i * cell
        if (i < nRev) {
          const w = attn[i][j]
          ctx.fillStyle = `rgba(99,102,241,${0.08 + w * 0.9})`
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2)
          ctx.fillStyle = w > 0.45 ? "#fff" : isDark ? "#a1a1aa" : "#52525b"
          ctx.fillText(w.toFixed(2), px + cell / 2, py + cell / 2)
        } else {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)"
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2)
        }
        // 当前正在算的行加边框
        if (i === nRev - 1) {
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2
          ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2)
        }
      }
    }

    // 当前行的「权重和=1」提示
    if (nRev > 0 && nRev <= N) {
      ctx.font = "11px ui-monospace, monospace"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillStyle = isDark ? "#a1a1aa" : "#71717a"
      ctx.fillText("Σ=1", gx0 + gridW + 10, gy0 + (nRev - 1) * cell + cell / 2)
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (revealedRef.current < N) setRevealed((r) => r + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (revealedRef.current < N) setRevealed((r) => r + 1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

  // 讲课模式：3 拍讲清「QKV → 点积/softmax 成权重 → Value 加权和」，热力图逐行揭示（音画同步）
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
        N + 1,
        [
          "自注意力想解决一个问题：句子里每个词，到底该重点关注哪些词？为此，每个词都准备了三样东西——Query、Key、Value 三个向量。",
          "算的时候，拿一个词的 Query，去和句子里每个词的 Key 做点积，得分越高表示越相关；再除以根号 d、做一次 softmax，就归一成这一行注意力权重，加起来正好等于 1。颜色越深，表示越关注那个词。",
          "每个词都这么算出一行，就拼成整张注意力热力图。最后每个词的新表示，就是把所有词的 Value 按这行权重加权求和。这套 Query-Key-Value 的机制，正是 Transformer 的核心。",
        ],
        (i) => setRevealed(i)
      ),
  })

  const caption = done
    ? "完整注意力矩阵：每个词都按相关度「看」其它所有词，输出是各词 Value 的加权和——这就是自注意力（Transformer 的核心）。"
    : revealed === 0
      ? "每个词有 Query/Key/Value 向量。点播放，逐行算注意力：某个词该「关注」句中哪些词。"
      : `「${TOKENS[revealed - 1]}」作为 Query：和每个词的 Key 点积得分 → ÷√d → softmax，归一成这一行权重（和为 1）。颜色越深越关注。`

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
          行 {revealed} / {N}
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
          <SkipForward className="size-4" /> 单步（下一行）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 换一组向量
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">每行 = 一个词对全句的注意力分布</span>
      </div>
      )}
    </div>
  )
}
