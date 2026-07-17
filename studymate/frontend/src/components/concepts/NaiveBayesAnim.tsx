/**
 * 概念动画 · 朴素贝叶斯 Naive Bayes（机器学习）
 * ------------------------------------------------------------------
 * 真实高斯朴素贝叶斯：对每类拟合「每个特征独立的高斯分布」，再用贝叶斯公式
 *   后验 ∝ 先验 × P(x|类) × P(y|类)
 * 给一个待分类「?」点，分步揭示：
 *   ① 两类各自的高斯分布（同心椭圆 = 等概率线，"朴素"=轴对齐、特征独立）
 *   ② 逐类把 ? 的两个特征似然相乘 × 先验 → 后验
 *   ③ 比较两类后验，谁大判谁（右侧后验概率条）
 *   ▶播放 / ⏸暂停 / ⏭单步（下一步揭示）/ ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const COLORS = ["#f43f5e", "#0ea5e9"] // rose / sky 两类
const CLASS_NAMES = ["A 类", "B 类"]
const STEP_MS = 1100
const TOTAL = 4

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clampW = (v: number) => Math.max(0.6, Math.min(9.4, v))

interface P {
  x: number
  y: number
  c: number
}
interface ClassModel {
  prior: number
  mx: number
  my: number
  sx: number
  sy: number
}

const pdf = (v: number, m: number, s: number) => Math.exp(-((v - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI))

function genPoints(): P[] {
  const specs = [
    [3.2, 4.0, 1.0, 1.3],
    [6.8, 6.4, 1.3, 1.0],
  ]
  const pts: P[] = []
  specs.forEach(([cx, cy, sx, sy], ci) => {
    for (let i = 0; i < 14; i++) {
      pts.push({ x: clampW(cx + gauss() * sx), y: clampW(cy + gauss() * sy), c: ci })
    }
  })
  return pts
}

function fitModels(pts: P[]): ClassModel[] {
  const out: ClassModel[] = []
  for (let c = 0; c < 2; c++) {
    const sub = pts.filter((p) => p.c === c)
    const n = sub.length
    const mx = sub.reduce((a, p) => a + p.x, 0) / n
    const my = sub.reduce((a, p) => a + p.y, 0) / n
    const sx = Math.sqrt(sub.reduce((a, p) => a + (p.x - mx) ** 2, 0) / n) || 0.5
    const sy = Math.sqrt(sub.reduce((a, p) => a + (p.y - my) ** 2, 0) / n) || 0.5
    out.push({ prior: n / pts.length, mx, my, sx: Math.max(0.4, sx), sy: Math.max(0.4, sy) })
  }
  return out
}

export function NaiveBayesAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(0)

  const ptsRef = useRef<P[]>([])
  const modelsRef = useRef<ClassModel[]>([])
  const queryRef = useRef<P>({ x: 5, y: 5, c: -1 })
  const postRef = useRef<[number, number]>([0.5, 0.5])
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
    const pts = genPoints()
    const models = fitModels(pts)
    const q: P = { x: clampW(4 + Math.random() * 2.5), y: clampW(4.2 + Math.random() * 2), c: -1 }
    // 后验（归一化）
    const raw = models.map((m) => m.prior * pdf(q.x, m.mx, m.sx) * pdf(q.y, m.my, m.sy))
    const sum = raw[0] + raw[1] || 1
    ptsRef.current = pts
    modelsRef.current = models
    queryRef.current = q
    postRef.current = [raw[0] / sum, raw[1] / sum]
    setRevealed(0)
  }, [])

  useEffect(() => {
    init()
  }, [init, seed])

  const done = revealed >= TOTAL
  const predicted = postRef.current[0] >= postRef.current[1] ? 0 : 1

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
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const pad = 20
    const plotW = cssW - pad * 2
    const plotH = cssH - pad * 2
    const sx = (x: number) => pad + (x / 10) * plotW
    const sy = (y: number) => cssH - pad - (y / 10) * plotH
    const isDark = document.documentElement.classList.contains("dark")
    const pts = ptsRef.current
    const models = modelsRef.current
    const q = queryRef.current
    const nRev = revealedRef.current

    // 各类高斯等概率椭圆（揭示到对应类时画）：1σ/2σ 同心椭圆
    models.forEach((m, c) => {
      const show = (c === 0 && nRev >= 1) || (c === 1 && nRev >= 2)
      if (!show) return
      for (const k of [2, 1]) {
        ctx.beginPath()
        ctx.ellipse(sx(m.mx), sy(m.my), (m.sx * k * plotW) / 10, (m.sy * k * plotH) / 10, 0, 0, Math.PI * 2)
        ctx.strokeStyle = COLORS[c]
        ctx.globalAlpha = k === 1 ? 0.55 : 0.3
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.fillStyle = COLORS[c]
        ctx.globalAlpha = k === 1 ? 0.1 : 0.05
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // 从 ? 到该类中心连一条到「似然」的引导虚线
      if ((c === 0 && nRev === 1) || (c === 1 && nRev === 2)) {
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = COLORS[c]
        ctx.globalAlpha = 0.7
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(sx(q.x), sy(q.y))
        ctx.lineTo(sx(m.mx), sy(m.my))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    })

    // 数据点
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4.5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // 待分类 ? 点
    const qx = sx(q.x)
    const qy = sy(q.y)
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.25)"
    ctx.shadowBlur = 7
    ctx.shadowOffsetY = 2
    const classified = nRev >= TOTAL
    ctx.fillStyle = classified ? COLORS[predicted] : isDark ? "#27272a" : "#fff"
    ctx.strokeStyle = classified ? COLORS[predicted] : isDark ? "#e4e4e7" : "#3f3f46"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(qx, qy, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = classified ? "#fff" : isDark ? "#e4e4e7" : "#3f3f46"
    ctx.font = "bold 12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("?", qx, qy + 0.5)

    // 后验概率条（揭示到第 3 步起画）
    if (nRev >= 3) {
      const post = postRef.current
      const bw = 110
      const bx = pad + 8
      const by = pad + 8
      ctx.textAlign = "left"
      ctx.font = "11px ui-sans-serif, system-ui"
      for (let c = 0; c < 2; c++) {
        const yy = by + c * 30
        ctx.fillStyle = isDark ? "#a1a1aa" : "#52525b"
        ctx.fillText(`P(${CLASS_NAMES[c]}|x)`, bx, yy)
        // 轨
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"
        ctx.fillRect(bx, yy + 4, bw, 9)
        // 值
        ctx.fillStyle = COLORS[c]
        ctx.globalAlpha = predicted === c && classified ? 1 : 0.7
        ctx.fillRect(bx, yy + 4, bw * post[c], 9)
        ctx.globalAlpha = 1
        ctx.fillStyle = isDark ? "#e4e4e7" : "#3f3f46"
        ctx.fillText(`${(post[c] * 100).toFixed(0)}%`, bx + bw + 6, yy + 9)
      }
    }
  }, [predicted, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (revealedRef.current < TOTAL) {
          setRevealed((r) => r + 1)
        } else {
          setPlaying(false)
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
    setSeed((s) => s + 1)
  }, [])

  const handleStep = useCallback(() => {
    if (revealedRef.current < TOTAL) setRevealed((r) => r + 1)
  }, [])

  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])

  // 讲课模式：4 拍讲清「按类拟合高斯 → 各类似然×先验 → 后验 → 谁大判谁」，逐步揭示（音画同步）
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
          "朴素贝叶斯要判断这个问号点属于哪一类。它的思路是概率：先看看每一类的数据长什么样，再算问号落在各类里的可能性有多大。",
          "先看 A 类。把 A 类的点拟合成一个高斯分布，这些同心椭圆就是等概率线，越靠中心概率越高。算一下问号落在这个分布上的似然，再乘上 A 类的先验概率。",
          "B 类同样处理：拟合高斯、算问号的似然乘先验。顺便说一句，「朴素」这两个字，就是指它假设两个特征互相独立——所以椭圆都是横平竖直、轴对齐的，不会斜。",
          "最后，把两类的「先验乘似然」一归一化，就得到右上角这两条后验概率。谁的概率条更长，问号就判给谁——这就是朴素贝叶斯，一个又简单又快的概率分类器。",
        ],
        (i) => setRevealed(i)
      ),
  })

  const post = postRef.current
  const caption = done
    ? `比较后验：P(${CLASS_NAMES[0]})=${(post[0] * 100).toFixed(0)}% vs P(${CLASS_NAMES[1]})=${(post[1] * 100).toFixed(0)}% → 「?」判为 ${CLASS_NAMES[predicted]}（谁的后验大归谁）。`
    : revealed === 0
      ? "朴素贝叶斯：先按每类拟合高斯分布，再用贝叶斯公式算「?」属于各类的后验概率。点播放。"
      : revealed === 1
        ? "揭示 A 类的高斯分布（椭圆=等概率线）。算 ? 落在这分布上的似然 P(x|A)·P(y|A)，再乘先验 P(A)。"
        : revealed === 2
          ? "同样揭示 B 类分布，算 ? 的似然 × 先验。「朴素」指假设两个特征相互独立，所以椭圆是轴对齐的。"
          : "把两类的「先验 × 似然」归一化，得到后验概率条（右上）。下一步比较大小做判决。"

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
          步骤 {Math.min(revealed, TOTAL)} / {TOTAL}
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
          <SkipForward className="size-4" /> 单步（下一步）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">椭圆 = 各类高斯分布 · 条 = 后验概率</span>
      </div>
      )}
    </div>
  )
}
