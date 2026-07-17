/**
 * 概念动画 · CNN 卷积 Convolution（机器学习）
 * ------------------------------------------------------------------
 * 真实卷积运算：一个 3×3 卷积核在输入特征图上从左到右、从上到下滑动，
 * 每个位置把核盖住的 3×3 区域逐元素相乘再求和，写进输出图对应格子。
 *   - 左：输入图（当前感受野高亮）  中：卷积核  右：输出特征图（已算的格子填色）
 *   - 卷积核这里用「垂直边缘检测」算子，输出能看出原图的竖直边缘
 *   - ▶播放 / ⏸暂停 / ⏭单步（滑到下一个位置）/ ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 700
const IN = 7 // 输入 7x7
const K = 3 // 核 3x3
const OUT = IN - K + 1 // 输出 5x5
// 垂直边缘检测核（Sobel 风格）
const KERNEL = [
  [1, 0, -1],
  [2, 0, -2],
  [1, 0, -1],
]

// 输入图：左半亮、右半暗，中间一条竖直边缘
function genInput(): number[][] {
  const g: number[][] = []
  for (let r = 0; r < IN; r++) {
    const row: number[] = []
    for (let c = 0; c < IN; c++) {
      let v = c < IN / 2 ? 8 : 1
      v += Math.round((Math.random() - 0.5) * 2) // 轻噪声
      row.push(Math.max(0, Math.min(9, v)))
    }
    g.push(row)
  }
  return g
}

function convAt(input: number[][], or: number, oc: number): number {
  let s = 0
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) s += input[or + i][oc + j] * KERNEL[i][j]
  return s
}

export function ConvAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已算到第几个输出格子（0..OUT*OUT）

  const inRef = useRef<number[][]>([])
  const outRef = useRef<number[]>([])
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

  const init = useCallback(() => {
    const input = genInput()
    const out: number[] = []
    for (let r = 0; r < OUT; r++) for (let c = 0; c < OUT; c++) out.push(convAt(input, r, c))
    inRef.current = input
    outRef.current = out
    setPos(0)
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const total = OUT * OUT
  const done = pos >= total

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
    const input = inRef.current
    const out = outRef.current
    const p = posRef.current
    const cur = Math.min(p, total - 1)
    const curR = Math.floor(cur / OUT)
    const curC = cur % OUT

    const cell = 30
    const kCell = 26
    const oCell = 28
    const gap1 = 26
    const gap2 = 30
    // 三块（输入图 / 核 / 输出图）总宽，按画布宽度水平居中，避免内容堆左、右侧大片空白
    const contentW = IN * cell + gap1 + K * kCell + gap2 + OUT * oCell
    const inX = Math.max(12, (cssW - contentW) / 2)
    const inY = (cssH - IN * cell) / 2
    // 输入图
    ctx.font = "11px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let r = 0; r < IN; r++) {
      for (let c = 0; c < IN; c++) {
        const v = input[r][c]
        const t = v / 9
        ctx.fillStyle = isDark ? `rgba(${60 + t * 150},${60 + t * 150},${70 + t * 160},1)` : `rgba(${40 + (1 - t) * 200},${40 + (1 - t) * 200},${50 + (1 - t) * 200},1)`
        ctx.fillRect(inX + c * cell, inY + r * cell, cell - 2, cell - 2)
        ctx.fillStyle = t > 0.5 === !isDark ? "#27272a" : "#e4e4e7"
        ctx.fillText(String(v), inX + c * cell + cell / 2 - 1, inY + r * cell + cell / 2)
      }
    }
    // 当前感受野高亮
    if (!done || p === total) {
      ctx.strokeStyle = "#6366f1"
      ctx.lineWidth = 3
      ctx.strokeRect(inX + curC * cell - 1, inY + curR * cell - 1, K * cell, K * cell)
    }

    // 卷积核（中间）
    const kX = inX + IN * cell + gap1
    const kY = inY + 6
    ctx.fillStyle = isDark ? "#a1a1aa" : "#52525b"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("卷积核", kX, kY - 8)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "bold 11px ui-monospace, monospace"
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        const w = KERNEL[i][j]
        ctx.fillStyle = w > 0 ? "rgba(59,130,246,0.25)" : w < 0 ? "rgba(239,68,68,0.25)" : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"
        ctx.fillRect(kX + j * kCell, kY + i * kCell, kCell - 2, kCell - 2)
        ctx.fillStyle = isDark ? "#e4e4e7" : "#27272a"
        ctx.fillText(w > 0 ? `+${w}` : String(w), kX + j * kCell + kCell / 2 - 1, kY + i * kCell + kCell / 2)
      }
    }
    // 当前乘加式
    if (p < total || done) {
      const val = out[cur]
      ctx.fillStyle = isDark ? "#a1a1aa" : "#52525b"
      ctx.font = "11px ui-monospace, monospace"
      ctx.textAlign = "left"
      ctx.fillText("Σ(输入×核)", kX, kY + K * kCell + 16)
      ctx.fillStyle = "#6366f1"
      ctx.font = "bold 15px ui-monospace, monospace"
      ctx.fillText(`= ${val}`, kX, kY + K * kCell + 36)
    }

    // 输出图（右）
    const oX = kX + K * kCell + gap2
    const oY = inY + (IN * cell - OUT * oCell) / 2
    ctx.fillStyle = isDark ? "#a1a1aa" : "#52525b"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("输出特征图", oX, oY - 8)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "11px ui-monospace, monospace"
    // 输出值域用于着色
    let mn = Infinity
    let mx = -Infinity
    for (const v of out) {
      mn = Math.min(mn, v)
      mx = Math.max(mx, v)
    }
    const span = mx - mn || 1
    for (let r = 0; r < OUT; r++) {
      for (let c = 0; c < OUT; c++) {
        const idx = r * OUT + c
        const px = oX + c * oCell
        const py = oY + r * oCell
        if (idx < p) {
          const t = (out[idx] - mn) / span
          ctx.fillStyle = `rgba(99,102,241,${0.12 + t * 0.75})`
          ctx.fillRect(px, py, oCell - 2, oCell - 2)
          ctx.fillStyle = t > 0.55 ? "#fff" : isDark ? "#e4e4e7" : "#27272a"
          ctx.fillText(String(out[idx]), px + oCell / 2 - 1, py + oCell / 2)
        } else {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          ctx.fillRect(px, py, oCell - 2, oCell - 2)
        }
        if (idx === cur && p < total) {
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2.5
          ctx.strokeRect(px - 1, py - 1, oCell, oCell)
        }
      }
    }
  }, [done, total, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total) setPos((p) => p + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

  // 讲课模式：4 拍讲清「滑窗→乘加→边缘响应强→提取特征」，卷积核随讲解连续扫过全图（音画同步）
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
      const mx = Math.max(0, ...outRef.current.map((v) => Math.abs(v)))
      return chunkedBeats(
        total + 1,
        [
          "卷积，就是拿一个小小的卷积核，在输入图上一格一格地滑。左边这张图左边亮、右边暗，中间藏着一条竖直的边；中间这个核，是专门用来检测竖直边缘的。",
          "每滑到一个位置，就把核盖住的那 3×3 区域，和核里的数字一一对应相乘、再全部加起来，得到一个数，填进右边的输出图。",
          `你盯着右边输出图慢慢被填满。在图像平坦的地方，左右差不多、相乘求和接近 0，颜色淡；可一滑到中间那条边，左右差异大、响应一下子变强，最强的地方算出来高达 ${mx}。`,
          "扫完整张图，右边就高亮出一条竖线——这正是核检测到的竖直边缘。这就是卷积：用同一个核扫遍全图、提取某种局部特征；换不同的核，就能提取不同的花纹。",
        ],
        (i) => setPos(i)
      )
    },
  })

  const caption = done
    ? "整张输出特征图算完——中间那条亮线就是核检测到的「竖直边缘」。卷积 = 用同一个核扫全图，提取局部特征。"
    : pos === 0
      ? "左边输入图左亮右暗、中间有条竖边。卷积核(中)在图上滑动，每处算「盖住区域 × 核」之和。点播放。"
      : `第 ${pos} 个位置：把核盖住的 3×3 与核逐格相乘再求和 = ${outRef.current[Math.min(pos, total - 1)]}，写进输出图。核在边缘处响应最强。`

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
          {Math.min(pos, total)} / {total}
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
          <SkipForward className="size-4" /> 单步（下一个位置）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 换输入
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝框 = 感受野 · 右图 = 提取的特征</span>
      </div>
      )}
    </div>
  )
}
