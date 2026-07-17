/**
 * 概念动画 · 自编码器 Autoencoder（机器学习 · 表示学习）
 * ------------------------------------------------------------------
 * 先压缩再还原：编码器把高维输入(12 维)压成瓶颈(2 维 code)，解码器再重建回 12 维。
 * 逼网络用极少信息抓住数据本质。这里数据落在 2 个基向量张成的子空间，
 *   编码 = 投影到基(真实点积)，解码 = 用 code 线性重建 → 重建≈输入。
 * 重建(橙)与输入(蓝)几乎重合，说明 2 个数就抓住了主要结构。无监督。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const STEP_MS = 1600
const DIM = 12
// 两个正交基（同频 sin/cos 在均匀采样下正交），归一化
function mkBasis(): [number[], number[]] {
  const b1 = Array.from({ length: DIM }, (_, k) => Math.sin((2 * Math.PI * (k + 1)) / DIM))
  const b2 = Array.from({ length: DIM }, (_, k) => Math.cos((2 * Math.PI * (k + 1)) / DIM))
  const norm = (v: number[]) => {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    return v.map((x) => x / n)
  }
  return [norm(b1), norm(b2)]
}
const [B1, B2] = mkBasis()
const COEFS: [number, number][] = [
  [2.4, 1.0],
  [1.3, -2.2],
  [-2.6, 0.6],
  [0.4, 2.4],
  [-1.6, -1.4],
  [2.2, 1.8],
]
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
function sample(idx: number): { x: number[]; code: [number, number]; recon: number[] } {
  const [a, c] = COEFS[idx % COEFS.length]
  // 输入 = a·b1 + c·b2 + 极小噪声（确定性）
  const x = B1.map((v, i) => a * v + c * B2[i] + 0.04 * Math.sin(i * 3.1 + idx))
  const code: [number, number] = [dot(x, B1), dot(x, B2)]
  const recon = B1.map((v, i) => code[0] * v + code[1] * B2[i])
  return { x, code, recon }
}

export function AutoencoderAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

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
    const { x, code, recon } = sample(idxRef.current)
    const err = Math.sqrt(x.reduce((s, v, i) => s + (v - recon[i]) ** 2, 0) / DIM)

    // ===== 顶部：funnel 示意 12 → 6 → 2 → 6 → 12 =====
    const fy = 64
    const layers = [DIM, 6, 2, 6, DIM]
    const colX = [70, cssW * 0.32, cssW * 0.5, cssW * 0.68, cssW - 70]
    const nodeY = (li: number, n: number, cnt: number) => fy + (n - (cnt - 1) / 2) * (li === 2 ? 26 : 13)
    // 连线
    for (let li = 0; li < layers.length - 1; li++) {
      for (let i = 0; i < layers[li]; i++)
        for (let j = 0; j < layers[li + 1]; j++) {
          ctx.strokeStyle = isDark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.07)"
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(colX[li], nodeY(li, i, layers[li]))
          ctx.lineTo(colX[li + 1], nodeY(li + 1, j, layers[li + 1]))
          ctx.stroke()
        }
    }
    for (let li = 0; li < layers.length; li++) {
      for (let n = 0; n < layers[li]; n++) {
        const isBottle = li === 2
        ctx.beginPath()
        ctx.arc(colX[li], nodeY(li, n, layers[li]), isBottle ? 11 : 4.5, 0, Math.PI * 2)
        ctx.fillStyle = isBottle ? "#f59e0b" : li === 0 ? "#6366f1" : li === 4 ? "#10b981" : isDark ? "#52525b" : "#cbd5e1"
        ctx.fill()
        if (isBottle) {
          ctx.fillStyle = "#fff"
          ctx.font = "600 10px ui-monospace, monospace"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(code[n].toFixed(1), colX[li], nodeY(li, n, layers[li]))
        }
      }
    }
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("输入 12", colX[0], fy + 56)
    ctx.fillStyle = "#f59e0b"
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.fillText("瓶颈 2 (code)", colX[2], fy + 56)
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.fillText("重建 12", colX[4], fy + 56)
    ctx.fillStyle = MUT
    ctx.fillText("编码器", (colX[0] + colX[2]) / 2, fy - 40)
    ctx.fillText("解码器", (colX[2] + colX[4]) / 2, fy - 40)

    // ===== 底部：输入 vs 重建 柱状对比 =====
    const by = cssH - 50
    const bh = 64
    const bw = (cssW - 80) / DIM
    const x0 = 40
    const allMax = Math.max(...x.map(Math.abs), ...recon.map(Math.abs), 0.5)
    ctx.fillStyle = FG
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("输入(蓝) vs 重建(橙)：", x0, by - bh - 10)
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, by)
    ctx.lineTo(cssW - 40, by)
    ctx.stroke()
    for (let i = 0; i < DIM; i++) {
      const cx = x0 + i * bw
      const hIn = (x[i] / allMax) * (bh / 2)
      const hRe = (recon[i] / allMax) * (bh / 2)
      ctx.fillStyle = "rgba(99,102,241,0.85)"
      ctx.fillRect(cx + 2, by - Math.max(0, hIn), bw / 2 - 3, Math.abs(hIn))
      ctx.fillStyle = "rgba(245,158,11,0.85)"
      ctx.fillRect(cx + bw / 2, by - Math.max(0, hRe), bw / 2 - 3, Math.abs(hRe))
    }
    ctx.fillStyle = "#10b981"
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.fillText(`重建误差 = ${err.toFixed(3)}（几乎为 0）`, cssW - 40, by - bh - 10)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setIdx((i) => (i + 1) % COEFS.length)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setIdx(0)
  }, [])
  const handleStep = useCallback(() => setIdx((i) => (i + 1) % COEFS.length), [])
  const togglePlay = useCallback(() => setPlaying((p) => !p), [])

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
    buildBeats: () => [
      {
        apply: () => setIdx(0),
        text: "自编码器是一个「先压缩、再还原」的网络。左边是输入,中间要挤过一个非常窄的瓶颈,右边的目标是:重建出和输入一模一样的东西。它的标签就是输入自己,所以是无监督的。",
      },
      {
        apply: () => setIdx(1),
        text: "前半段叫编码器,负责把高维输入——这里是 12 个数——压缩成瓶颈处的少数几个数,我们这里只留 2 个,叫 code。后半段叫解码器,再从这 2 个数,努力重建回完整的 12 维。",
      },
      {
        apply: () => setIdx(2),
        text: "看下面的对比:橙色的重建,和蓝色的原始输入几乎完全重合,重建误差接近 0。这说明,仅仅 2 个数,就抓住了这条数据的主要结构。这个瓶颈里的 code,就是网络自动学到的低维表示。",
      },
      {
        apply: () => setIdx(3),
        text: "正因为能用极少的信息抓住本质,自编码器用途很广:降维、给图像去噪、还能做异常检测——重建误差特别大的样本,往往就是异常。它也是 VAE 这类生成模型的基础。",
      },
    ],
  })

  const { err } = (() => {
    const s = sample(idx)
    return { err: Math.sqrt(s.x.reduce((a, v, i) => a + (v - s.recon[i]) ** 2, 0) / DIM) }
  })()
  const caption = `样本 ${idx + 1}：12 维输入 → 压成 2 维 code → 重建 12 维。重建误差 ${err.toFixed(3)}(几乎为 0) → 2 个数即抓住主要结构。无监督降维/去噪/异常检测。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          样本 {idx + 1}/{COEFS.length}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "暂停" : "播放(轮换样本)"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing}>
            <SkipForward className="size-4" /> 换样本
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=输入 · 橙=重建 · 瓶颈=低维表示</span>
        </div>
      )}
    </div>
  )
}
