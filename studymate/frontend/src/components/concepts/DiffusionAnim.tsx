/**
 * 概念动画 · 扩散模型 Diffusion（机器学习 · 生成模型）
 * ------------------------------------------------------------------
 * 两步走：前向加噪（真实）——拿一份结构化数据（排成环的点），一小步一小步撒高斯噪声，
 *   xₜ = √(ᾱₜ)·x₀ + √(1−ᾱₜ)·ε，直到彻底变成纯噪声；
 * 模型学的是反过来：从纯噪声出发，一步步去噪，结构慢慢浮现 → 生成全新样本。
 * 这里前半程加噪、后半程把过程倒放示意去噪（每点噪声固定 → 去噪后精确还原结构）。
 * Stable Diffusion / DALL·E 的底层原理。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const NPTS = 150
const T = 28
const TOTAL = 2 * T // 0..2T：前向 0→T，反向 T→2T
function rnd(s: number) {
  const x = Math.sin(s * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
function gauss(s: number) {
  const u1 = rnd(s) || 1e-6
  const u2 = rnd(s + 0.5)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
const BASE: [number, number][] = []
const NOISE: [number, number][] = []
for (let i = 0; i < NPTS; i++) {
  const a = (i / NPTS) * Math.PI * 2
  BASE.push([Math.cos(a) * 0.62, Math.sin(a) * 0.62])
  NOISE.push([gauss(i * 2 + 1) * 0.92, gauss(i * 2 + 7) * 0.92])
}
const tOf = (pos: number) => (pos <= T ? pos : TOTAL - pos)
const STEP_MS = 90

export function DiffusionAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
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
    const t = tOf(posRef.current)
    const aBar = 1 - t / T // 1→0
    const s1 = Math.sqrt(Math.max(0, aBar))
    const s2 = Math.sqrt(Math.max(0, 1 - aBar))
    const forward = posRef.current <= T

    const cx = cssW / 2
    const cy = cssH / 2 + 14
    const sc = Math.min(cssW, cssH - 70) * 0.42

    for (let i = 0; i < NPTS; i++) {
      const x = s1 * BASE[i][0] + s2 * NOISE[i][0]
      const y = s1 * BASE[i][1] + s2 * NOISE[i][1]
      ctx.beginPath()
      ctx.arc(cx + x * sc, cy - y * sc, 3, 0, Math.PI * 2)
      ctx.fillStyle = BASE[i][1] >= 0 ? "rgba(99,102,241,0.85)" : "rgba(244,63,94,0.8)"
      ctx.fill()
    }

    // 阶段标记 + 噪声进度条
    ctx.fillStyle = forward ? "#f43f5e" : "#10b981"
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(forward ? "① 前向加噪 →" : "② 反向去噪 ←（模型从噪声生成）", cx, cssH - 22)
    // 进度条
    const barW = 180
    const bx = cx - barW / 2
    const by = 52
    ctx.fillStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.fillRect(bx, by, barW, 8)
    ctx.fillStyle = forward ? "#f43f5e" : "#10b981"
    ctx.fillRect(bx, by, barW * (t / T), 8)
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.fillText(`噪声 ${Math.round((t / T) * 100)}%`, cx, by + 24)

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("扩散模型：加噪把数据打成噪声，再学会一步步去噪生成", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < TOTAL) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= TOTAL
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
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
        TOTAL + 1,
        [
          "扩散模型的训练分两步走。先看前向加噪:拿一张真实数据,这里是排成一个环、上下两半不同颜色的点,然后一小步一小步地往上面撒高斯噪声。",
          "撒到最后,原来的环形结构彻底被淹没,上下两种颜色完全混在一起,变成一团看不出任何形状的纯噪声。",
          "模型真正要学的,是把这个过程反过来:从一团纯噪声出发,一步一步地预测并减掉噪声。",
          "随着去噪一步步进行,结构慢慢从混沌里浮现,颜色重新分开,最后从随机噪声里「生」出了一个清晰的、符合原始数据分布的样本。Stable Diffusion、DALL·E 画图,就是这么一步步去噪生成的。",
        ],
        (i) => setPos(i)
      ),
  })

  const t = tOf(pos)
  const caption = done
    ? "一轮加噪→去噪完成：模型学到的就是「从噪声还原结构」，由此能凭空生成新样本。"
    : pos <= T
      ? `前向加噪 ${Math.round((t / T) * 100)}%：xₜ=√ᾱₜ·x₀+√(1−ᾱₜ)·ε，结构逐步被噪声淹没。`
      : `反向去噪 ${Math.round((t / T) * 100)}%：从噪声一步步预测并减去噪声，结构浮现 → 生成。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {pos <= T ? "加噪" : "去噪"} {Math.round((t / T) * 100)}%
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "加噪→去噪"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">前向加噪 → 反向去噪生成</span>
        </div>
      )}
    </div>
  )
}
