/**
 * 概念动画 · 奇异值分解 SVD（机器学习 · 矩阵分解 / 降维）
 * ------------------------------------------------------------------
 * 任意矩阵 A = U Σ Vᵀ：拆成一系列「秩 1 块」σᵣ·uᵣvᵣᵀ 之和，σ 从大到小。
 * 只保留前 k 个最大奇异值，就得到 A 的最佳 k 秩近似（Eckart–Young）。
 * 这里把一张 24×24 灰度图按真实正交基（DCT 基天然正交 → 这就是它的 SVD）
 * 构造成 A = Σ σᵣ uᵣ uᵣᵀ，逐步增加 k：
 *   - 重建图从模糊到清晰；
 *   - 重建误差有闭式 ‖A−Aₖ‖_F = √(Σ_{r≥k} σᵣ²)，精确算；
 *   - 存储从 N²=576 个数降到 k·(2N+1) 个数 → 图像压缩。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const N = 24
const STEP_MS = 520
// DCT-II 基（彼此正交、归一化）→ 用它构造的对称矩阵，奇异值正好是系数 σ
function dct(r: number): number[] {
  const v = Array.from({ length: N }, (_, i) => Math.cos((Math.PI * r * (i + 0.5)) / N))
  const s = Math.sqrt(v.reduce((a, x) => a + x * x, 0))
  return v.map((x) => x / s)
}
// 真实奇异值（从大到小），其余为 0 → 矩阵秩 = R
const SIGMA = [9, 7, 5.5, 4, 3, 2.2, 1.6, 1.1, 0.7, 0.45, 0.28, 0.15]
const R = SIGMA.length
const BASIS = SIGMA.map((_, r) => dct(r + 1))
// 预算每个奇异值贡献的秩 1 块，叠加得到 Aₖ
function reconstruct(k: number): number[][] {
  const A = Array.from({ length: N }, () => new Array<number>(N).fill(0))
  for (let r = 0; r < k; r++) {
    const u = BASIS[r]
    const s = SIGMA[r]
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) A[i][j] += s * u[i] * u[j]
  }
  return A
}
const FULL = reconstruct(R)
let VMIN = Infinity
let VMAX = -Infinity
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  VMIN = Math.min(VMIN, FULL[i][j])
  VMAX = Math.max(VMAX, FULL[i][j])
}
const TOTAL_E = Math.sqrt(SIGMA.reduce((a, s) => a + s * s, 0))
function errAt(k: number): number {
  let e = 0
  for (let r = k; r < R; r++) e += SIGMA[r] * SIGMA[r]
  return Math.sqrt(e)
}

export function SvdAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [k, setK] = useState(1)
  const kRef = useRef(1)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    kRef.current = k
  }, [k])

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
    const kk = kRef.current
    const A = reconstruct(kk)

    // ===== 左：重建灰度图 =====
    const imgSize = Math.min(cssH - 96, 220)
    const cell = imgSize / N
    const ox = 56
    const oy = 56
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const v = (A[i][j] - VMIN) / (VMAX - VMIN)
        const g = Math.round(Math.max(0, Math.min(1, v)) * 255)
        ctx.fillStyle = `rgb(${g},${g},${g})`
        ctx.fillRect(ox + j * cell, oy + i * cell, cell + 0.6, cell + 0.6)
      }
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, imgSize, imgSize)
    ctx.fillStyle = FG
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(kk >= R ? "原图 (全部秩)" : `用前 ${kk} 个奇异值重建`, ox + imgSize / 2, oy + imgSize + 8)

    // ===== 右：奇异值谱（柱） =====
    const sx = ox + imgSize + 70
    const sw = cssW - sx - 40
    const baseY = oy + 170
    const bw = Math.min(20, sw / R - 4)
    const maxS = SIGMA[0]
    ctx.fillStyle = FG
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("奇异值 σ (从大到小)", sx, oy + 4)
    for (let r = 0; r < R; r++) {
      const bx = sx + r * (sw / R)
      const bh = (SIGMA[r] / maxS) * 150
      ctx.fillStyle = r < kk ? "#6366f1" : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.fillRect(bx, baseY - bh, bw, bh)
    }
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx, baseY)
    ctx.lineTo(sx + sw, baseY)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.fillText("蓝=已保留 · 灰=丢弃", sx, baseY + 8)

    // 误差 + 压缩比
    const e = errAt(kk)
    const relErr = (e / TOTAL_E) * 100
    const stored = kk * (2 * N + 1)
    const ratio = (stored / (N * N)) * 100
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillStyle = "#10b981"
    ctx.fillText(`相对误差 ${relErr.toFixed(1)}%`, sx, baseY + 34)
    ctx.fillStyle = "#f59e0b"
    ctx.fillText(`存储 ${stored}/${N * N} = ${ratio.toFixed(0)}%`, sx, baseY + 56)
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillText("A = U Σ Vᵀ = Σ σᵣ·uᵣvᵣᵀ", sx, baseY + 80)

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("奇异值分解：大奇异值抓住主结构，小的可丢 → 压缩 / 降维", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (kRef.current < R) setK((v) => v + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = k >= R
  const handleReset = useCallback(() => {
    setPlaying(false)
    setK(1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setK(1)
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
        R,
        [
          "奇异值分解,是把任意一个矩阵拆成一串「秩 1 小块」相加:A 等于 U 乘 Σ 乘 V 转置。每个小块都配一个奇异值 σ,而且 σ 是从大到小排好的。这张图,我们现在只用最大的那 1 个奇异值来重建——非常模糊,但已经抓住了最粗的明暗大势。",
          "继续往里加奇异值。你看右边的谱,蓝色柱子一个个亮起来,左边的图也随之变清晰。关键在于:前几个大奇异值贡献了绝大部分信息,后面那些小柱子,加不加几乎看不出差别。",
          "这就是 SVD 最有用的地方:只保留前 k 个最大的奇异值,得到的就是这个矩阵在所有 k 秩矩阵里的最佳近似。看那个相对误差,只用一半的奇异值,误差就已经很小了。",
          "于是图像就被压缩了:原本要存 576 个数,现在只要存前 k 个奇异值对应的向量,数据量大幅下降,图却几乎没变。这套思路同样用来降维、去噪、做推荐系统的矩阵分解——抓主要、扔次要。",
        ],
        (i) => setK(Math.max(1, i + 1))
      ),
  })

  const caption = done
    ? `全部 ${R} 个奇异值 → 原图。前几个大奇异值已贡献绝大部分信息，小的可丢弃。`
    : `用前 ${k} 个奇异值重建：相对误差 ${((errAt(k) / TOTAL_E) * 100).toFixed(1)}%，存储降到 ${(((k * (2 * N + 1)) / (N * N)) * 100).toFixed(0)}%。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          k = {k}/{R}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "逐步加奇异值"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setK((v) => Math.min(R, v + 1))} disabled={playing || done}>
            下一个 σ
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝柱=保留 · 最佳 k 秩近似</span>
        </div>
      )}
    </div>
  )
}
