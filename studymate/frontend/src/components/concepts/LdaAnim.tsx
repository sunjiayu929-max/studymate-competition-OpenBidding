/**
 * 概念动画 · 线性判别分析 LDA（机器学习 · 有监督降维）
 * ------------------------------------------------------------------
 * 和 PCA 一样找投影方向，但 LDA 是有监督的：要让两类投影后「分得最开」。
 * 转一圈，每个方向 u 算 Fisher 准则 J(u) = (m₁−m₂)² / (s₁²+s₂²)（真实计算）：
 *   类间均值差越大、类内散度越小 → J 越大。J 最大的方向 = 最佳判别方向。
 * 投到它上面，两类几乎不重叠，一条阈值即可分类。常用作分类前的特征提取。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

function rnd(s: number) {
  const x = Math.sin(s * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
function gauss(s: number) {
  return Math.sqrt(-2 * Math.log(rnd(s) || 1e-6)) * Math.cos(2 * Math.PI * rnd(s + 0.3))
}
function makeClass(cx: number, cy: number, seed: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + gauss(seed + i * 2) * 0.42, cy + gauss(seed + i * 2 + 1) * 0.42] as [number, number])
}
const CA = makeClass(-1.0, 0.7, 3, 16)
const CB = makeClass(1.0, -0.7, 71, 16)
const ALL = [...CA, ...CB]
const CENTER: [number, number] = [ALL.reduce((s, p) => s + p[0], 0) / ALL.length, ALL.reduce((s, p) => s + p[1], 0) / ALL.length]
const FRAMES = 36
function fisher(theta: number): number {
  const u: [number, number] = [Math.cos(theta), Math.sin(theta)]
  const proj = (p: [number, number]) => p[0] * u[0] + p[1] * u[1]
  const pa = CA.map(proj)
  const pb = CB.map(proj)
  const m1 = pa.reduce((s, v) => s + v, 0) / pa.length
  const m2 = pb.reduce((s, v) => s + v, 0) / pb.length
  const s1 = pa.reduce((s, v) => s + (v - m1) ** 2, 0)
  const s2 = pb.reduce((s, v) => s + (v - m2) ** 2, 0)
  return (m1 - m2) ** 2 / (s1 + s2 + 1e-9)
}
const JARR = Array.from({ length: FRAMES + 1 }, (_, i) => fisher((Math.PI * i) / FRAMES))
const JMAX = Math.max(...JARR)
const BESTI = JARR.indexOf(JMAX)
const STEP_MS = 130

export function LdaAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const i = posRef.current
    const theta = (Math.PI * i) / FRAMES
    const u: [number, number] = [Math.cos(theta), Math.sin(theta)]

    const scatterH = cssH - 86
    const cx = cssW / 2
    const cy = 46 + scatterH / 2 - 40
    const sc = Math.min(cssW, scatterH) * 0.2
    const P = (p: [number, number]): [number, number] => [cx + (p[0] - CENTER[0]) * sc, cy - (p[1] - CENTER[1]) * sc]

    // 投影轴（过中心、方向 u）
    const C = P(CENTER)
    const axLen = Math.min(cssW, scatterH) * 0.46
    const ax1: [number, number] = [C[0] - u[0] * axLen, C[1] + u[1] * axLen]
    const ax2: [number, number] = [C[0] + u[0] * axLen, C[1] - u[1] * axLen]
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ax1[0], ax1[1])
    ctx.lineTo(ax2[0], ax2[1])
    ctx.stroke()

    // 投影脚 + 连线
    const drawSet = (set: [number, number][], color: string) => {
      for (const p of set) {
        const sp = P(p)
        const t = (p[0] - CENTER[0]) * u[0] + (p[1] - CENTER[1]) * u[1]
        const foot: [number, number] = [C[0] + t * u[0] * sc, C[1] - t * u[1] * sc]
        ctx.strokeStyle = color + "55"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sp[0], sp[1])
        ctx.lineTo(foot[0], foot[1])
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(foot[0], foot[1], 3.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.beginPath()
        ctx.arc(sp[0], sp[1], 5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
    }
    drawSet(CA, "#f43f5e")
    drawSet(CB, "#3b82f6")

    // J(θ) 曲线（底部）
    const jBase = cssH - 18
    const jTop = cssH - 64
    const jx0 = 60
    const jw = cssW - 120
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(jx0, jBase)
    ctx.lineTo(jx0 + jw, jBase)
    ctx.stroke()
    ctx.strokeStyle = "#10b981"
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k <= i; k++) {
      const x = jx0 + (k / FRAMES) * jw
      const y = jBase - (JARR[k] / JMAX) * (jBase - jTop)
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // 当前点
    ctx.beginPath()
    ctx.arc(jx0 + (i / FRAMES) * jw, jBase - (JARR[i] / JMAX) * (jBase - jTop), 4, 0, Math.PI * 2)
    ctx.fillStyle = "#10b981"
    ctx.fill()
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "bottom"
    ctx.fillText("Fisher 准则 J(方向)", jx0, jTop - 2)
    ctx.fillStyle = "#10b981"
    ctx.font = "600 12px ui-monospace, monospace"
    ctx.textAlign = "right"
    ctx.fillText(`J=${JARR[i].toFixed(2)}`, jx0 + jw, jTop + 2)
    if (i >= BESTI) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("← 最佳判别方向", jx0 + (BESTI / FRAMES) * jw, jBase + 16)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("LDA：转一圈找让两类投影最分得开的方向（有监督降维）", 118, 28)
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = "#f43f5e"
    ctx.textAlign = "right"
    ctx.fillText("● 类 A", cssW - 150, 28)
    ctx.fillStyle = "#3b82f6"
    ctx.fillText("● 类 B", cssW - 92, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < FRAMES) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = pos >= FRAMES
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
        FRAMES + 1,
        [
          "线性判别分析 LDA 也是降维,但它和 PCA 有个根本区别:PCA 只看数据整体怎么散开,完全不管类别;而 LDA 是有监督的,它知道每个点属于哪一类,目标是找一个投影方向,让两类投影下去之后分得最开。",
          "我们把所有点投影到这条线上,然后让这条线转一圈。每转到一个角度,就算一个指标,叫 Fisher 准则:两类投影中心隔得越远、各自又越聚拢,这个指标就越大。",
          "看下面那条绿色曲线,它就是不同方向对应的 Fisher 准则。转着转着,它在某个角度冲到了最高点——那个方向,就是最佳的判别方向。",
          "投影到这个方向上,你看红蓝两类几乎不再重叠,中间画一条阈值就能把它们分开。所以 LDA 既把数据降了维,又最大化了类与类之间的区分度,常用来在分类之前做特征提取。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? `找到最佳判别方向：J=${JMAX.toFixed(2)} 最大，两类投影几乎不重叠。LDA=有监督降维(对比 PCA 无监督)。`
    : `转动投影方向：Fisher 准则 J=(m₁−m₂)²/(s₁²+s₂²)=${JARR[pos].toFixed(2)}，越大两类分得越开。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {Math.round((180 * pos) / FRAMES)}°
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "转动方向"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">点在轴上的投影 · J 最大=最佳方向</span>
        </div>
      )}
    </div>
  )
}
