/**
 * 概念动画 · K 折交叉验证 K-Fold Cross-Validation（机器学习 · 模型评估）
 * ------------------------------------------------------------------
 * 真实评估：2D 两类数据，最近质心分类器
 *   - 数据随机均分 K 份；每一轮留 1 份当验证集、其余 K-1 份训练，在验证集上测准确率
 *   - K 轮轮流(每份都当一次验证) → K 个准确率 → 平均 = 交叉验证得分
 * 准确率是真实算出的(非写死)。逐轮揭示经典 K 折图。
 *   ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const K = 5
const NPER = 8 // 每折点数 → N=40

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
interface Pt {
  x: number
  y: number
  c: number
}
interface Model {
  folds: Pt[][] // K 折
  acc: number[] // 每轮验证准确率
  mean: number
}

function buildModel(): Model {
  // 两类带重叠的高斯（→ 准确率 ~0.8-0.95，真实而非满分）
  const pts: Pt[] = []
  const n = K * NPER
  for (let i = 0; i < n; i++) {
    const c = i % 2
    const cx = c === 0 ? 4 : 6
    const cy = c === 0 ? 6 : 4
    pts.push({ x: cx + gauss() * 1.5, y: cy + gauss() * 1.5, c })
  }
  // 洗牌后均分 K 折
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pts[i], pts[j]] = [pts[j], pts[i]]
  }
  const folds: Pt[][] = Array.from({ length: K }, (_, k) => pts.filter((_, i) => i % K === k))
  // 每轮：留 fold r 验证，其余训练（最近质心分类器）
  const acc: number[] = []
  for (let r = 0; r < K; r++) {
    const train = folds.filter((_, k) => k !== r).flat()
    const val = folds[r]
    const cent = [
      { x: 0, y: 0, n: 0 },
      { x: 0, y: 0, n: 0 },
    ]
    for (const p of train) {
      cent[p.c].x += p.x
      cent[p.c].y += p.y
      cent[p.c].n++
    }
    for (const c of cent) {
      c.x /= c.n || 1
      c.y /= c.n || 1
    }
    let correct = 0
    for (const p of val) {
      const d0 = (p.x - cent[0].x) ** 2 + (p.y - cent[0].y) ** 2
      const d1 = (p.x - cent[1].x) ** 2 + (p.y - cent[1].y) ** 2
      if ((d0 <= d1 ? 0 : 1) === p.c) correct++
    }
    acc.push(correct / (val.length || 1))
  }
  return { folds, acc, mean: acc.reduce((a, b) => a + b, 0) / K }
}

export function KFoldAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0) // 已揭示轮数 0..K
  const modelRef = useRef<Model>(buildModel())
  const idxRef = useRef(0)
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

  const init = useCallback(() => {
    modelRef.current = buildModel()
    setIdx(0)
    idxRef.current = 0
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const atEnd = idx >= K

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
    const m = modelRef.current
    const revealed = Math.min(idxRef.current, K)
    const TRAIN = isDark ? "#3b82f6" : "#93c5fd"
    const VAL = isDark ? "#f59e0b" : "#f59e0b"
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"

    const labelW = 56
    const accW = 96
    const x0 = labelW + 8
    const x1 = cssW - accW - 14
    const barW = x1 - x0
    const segW = barW / K
    const top = 30
    const rowH = 28
    const gap = 10
    ctx.textBaseline = "middle"

    // 表头
    ctx.font = "12px ui-sans-serif, system-ui"
    ctx.fillStyle = MUT
    ctx.textAlign = "left"
    ctx.fillText("数据均分 5 份", x0, 14)
    ctx.textAlign = "right"
    ctx.fillText("验证准确率", cssW - 14, 14)

    for (let r = 0; r < K; r++) {
      const y = top + r * (rowH + gap)
      const shown = r < revealed
      ctx.globalAlpha = shown ? 1 : 0.18
      // 轮标签
      ctx.fillStyle = FG
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText(`第${r + 1}轮`, 4, y + rowH / 2)
      // K 段
      for (let j = 0; j < K; j++) {
        const sx = x0 + j * segW
        const isVal = j === r
        ctx.fillStyle = isVal ? VAL : TRAIN
        ctx.fillRect(sx + 1, y, segW - 2, rowH)
        if (isVal && shown) {
          ctx.fillStyle = isDark ? "#1c1917" : "#fff"
          ctx.font = "700 11px ui-sans-serif, system-ui"
          ctx.textAlign = "center"
          ctx.fillText("验证", sx + segW / 2, y + rowH / 2)
        }
      }
      // 准确率
      if (shown) {
        ctx.fillStyle = FG
        ctx.font = "600 13px ui-sans-serif, system-ui"
        ctx.textAlign = "right"
        ctx.fillText(m.acc[r].toFixed(3), cssW - 14, y + rowH / 2)
      }
      ctx.globalAlpha = 1
    }

    // 图例
    const legY = top + K * (rowH + gap) + 4
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillStyle = TRAIN
    ctx.fillRect(x0, legY, 14, 11)
    ctx.fillStyle = MUT
    ctx.fillText("训练", x0 + 18, legY + 6)
    ctx.fillStyle = VAL
    ctx.fillRect(x0 + 60, legY, 14, 11)
    ctx.fillStyle = MUT
    ctx.fillText("验证", x0 + 78, legY + 6)

    // 平均（全部揭示后）
    if (revealed >= K) {
      ctx.fillStyle = isDark ? "#34d399" : "#059669"
      ctx.font = "700 14px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.fillText(`平均 = ${m.mean.toFixed(3)}`, cssW - 14, legY + 6)
    }
  }, [applyViewport])

  useEffect(() => {
    const STEP_MS = 900
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (idxRef.current >= K) {
          playingRef.current = false
          setPlaying(false)
        } else {
          idxRef.current += 1
          setIdx(idxRef.current)
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (playingRef.current) return
    setIdx((i) => Math.min(K, i + 1))
  }, [])
  const togglePlay = useCallback(() => {
    if (idxRef.current >= K) {
      setIdx(0)
      idxRef.current = 0
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
    },
    onLectureEnd,
    buildBeats: () => {
      const m = modelRef.current
      return chunkedBeats(
        K + 1,
        [
          "K 折交叉验证，是用来公平评估模型的办法。先把所有数据随机打乱、均分成 K 份，这里 K 等于 5。",
          `第一轮：留第 1 份当验证集，也就是橙色这块；剩下四份蓝色的拿来训练。模型训练好，就在这份没见过的验证集上测一个准确率——这轮是 ${m.acc[0].toFixed(3)}。`,
          "接着轮流来：第二份当验证、第三份当验证……每一份都轮流当一次验证集。这样训练加测试一共做 5 次，每次都得到一个准确率。",
          `最后，把这 5 个准确率一平均，得到 ${m.mean.toFixed(3)}，这就是交叉验证得分。它比只随机切一次「训练集/测试集」更稳——不会因为某一次划分的运气好坏而误判，所以更可靠，也常用来对比模型、调超参数。`,
        ],
        (i) => setIdx(i)
      )
    },
  })

  const m = modelRef.current
  const caption = atEnd
    ? `5 轮验证准确率平均 = ${m.mean.toFixed(3)}，即交叉验证得分。比单次划分更稳、更可靠。`
    : idx === 0
      ? "数据均分 5 份。点「播放」逐轮：每份轮流当验证集(橙)、其余训练(蓝)，测准确率。"
      : `第 ${idx} 轮：第 ${idx} 份当验证集，其余训练 → 准确率 ${m.acc[idx - 1].toFixed(3)}。每份都要轮一次。`

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
          {Math.min(idx, K)} / {K} 轮
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
          {caption}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || atEnd}>
            <SkipForward className="size-4" /> 单步(下一轮)
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新分折
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            橙=验证集 · 蓝=训练集 · 每份轮流当一次验证
          </span>
        </div>
      )}
    </div>
  )
}
