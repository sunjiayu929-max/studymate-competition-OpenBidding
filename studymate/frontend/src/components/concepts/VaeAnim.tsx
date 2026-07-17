/**
 * 概念动画 · 变分自编码器 VAE（机器学习 · 生成模型）
 * ------------------------------------------------------------------
 * 和普通自编码器的关键区别：编码器把输入映射成一个「分布」(μ, σ)，而非一个点。
 *   ① 重参数化：z = μ + σ·ε（ε~N(0,1)）→ 可采样又可训练；
 *   ② KL 损失把所有后验拉向标准正态 N(0,I) → 潜空间紧致、连续、无空洞；
 *   ③ 生成：正因为潜空间规整，随便采一个 z~N(0,I) 解码就得到一个全新的、合理的样本。
 * 这里解码器是真实线性映射 z→输出向量，滑动 z 时输出连续平滑变化（潜空间连续性）。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const DIM = 10
const B1 = Array.from({ length: DIM }, (_, k) => Math.sin((2 * Math.PI * (k + 1)) / DIM))
const B2 = Array.from({ length: DIM }, (_, k) => Math.cos((2 * Math.PI * (k + 1)) / DIM))
const decode = (z: [number, number]) => B1.map((b, k) => z[0] * b + z[1] * B2[k])
// 几个输入的后验中心（spread）与正则后（pull 向原点）
const MU_RAW: [number, number][] = [
  [-2.2, 1.5],
  [1.9, 2.0],
  [2.4, -1.2],
  [-1.7, -2.0],
  [0.3, 2.5],
]
const COLS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"]
const SIG = 0.55

export function VaeAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const tickRef = useRef(0)
  const rafRef = useRef(0)
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
    const stage = idxRef.current
    const ph = tickRef.current * 0.03

    // KL 进度：stage>=2 时把后验从 RAW 拉向原点
    const pull = stage >= 2 ? 0.55 : 0
    const muOf = (i: number): [number, number] => [MU_RAW[i][0] * (1 - pull), MU_RAW[i][1] * (1 - pull)]

    // ===== 左：潜空间 =====
    const panel = Math.min(cssH - 96, 210)
    const ox = 46
    const oy = 60
    const cx = ox + panel / 2
    const cy = oy + panel / 2
    const sc = panel / 7 // z∈[-3.5,3.5]
    const Z = (z: [number, number]): [number, number] => [cx + z[0] * sc, cy - z[1] * sc]
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, panel, panel)
    // 先验 N(0,I)
    for (const r of [1, 2]) {
      ctx.strokeStyle = isDark ? "rgba(148,163,184,0.3)" : "rgba(100,116,139,0.25)"
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(cx, cy, r * sc, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.fillStyle = MUT
    ctx.font = "9px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("先验 N(0,I)", cx, cy + 2 * sc + 3)

    // 后验们
    for (let i = 0; i < MU_RAW.length; i++) {
      const mu = muOf(i)
      const [mx, my] = Z(mu)
      // KL 箭头
      if (stage >= 2 && pull > 0) {
        const [rx, ry] = Z(MU_RAW[i])
        ctx.strokeStyle = COLS[i] + "66"
        ctx.lineWidth = 1
        ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(mx, my)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // σ 圈
      ctx.strokeStyle = COLS[i]
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(mx, my, SIG * sc, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      // μ
      ctx.beginPath()
      ctx.arc(mx, my, 4, 0, Math.PI * 2)
      ctx.fillStyle = COLS[i]
      ctx.fill()
      // 重参数采样点
      if (stage >= 1 && stage < 3) {
        const ez: [number, number] = [Math.sin(ph * 1.7 + i), Math.cos(ph * 1.3 + i * 2)]
        const [sx, sy] = Z([mu[0] + SIG * ez[0], mu[1] + SIG * ez[1]])
        ctx.beginPath()
        ctx.arc(sx, sy, 3, 0, Math.PI * 2)
        ctx.fillStyle = "#fff"
        ctx.strokeStyle = COLS[i]
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
      }
    }

    // 生成游标（stage3）：在先验里漫游采样
    let activeZ: [number, number] = [muOf(0)[0] + SIG * Math.sin(ph * 1.7), muOf(0)[1] + SIG * Math.cos(ph * 1.3)]
    if (stage >= 3) {
      activeZ = [1.9 * Math.cos(ph), 1.9 * Math.sin(ph * 0.7)]
      const [gx, gy] = Z(activeZ)
      ctx.beginPath()
      ctx.arc(gx, gy, 7, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(16,185,129,0.85)"
      ctx.fill()
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = "#10b981"
      ctx.font = "600 10px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText("采样 z~N(0,I)", gx + 11, gy)
    }

    // ===== 右：解码输出 =====
    const rx = ox + panel + 44
    const rw = cssW - rx - 36
    if (rw > 60) {
      const out = decode(activeZ)
      const by = cy + 70
      const bh = 70
      const bw = rw / DIM
      const maxV = 3.4
      ctx.fillStyle = FG
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(stage >= 3 ? "解码器输出（新样本）" : "解码 z → 输出向量", rx, by - bh - 14)
      ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(rx, by)
      ctx.lineTo(rx + rw, by)
      ctx.stroke()
      for (let k = 0; k < DIM; k++) {
        const h = (out[k] / maxV) * (bh / 2)
        ctx.fillStyle = stage >= 3 ? "#10b981" : "#6366f1"
        ctx.fillRect(rx + k * bw + 2, by - Math.max(0, h), bw - 4, Math.abs(h))
      }
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText(stage >= 3 ? "z 平滑移动 → 输出连续变化" : "线性解码器 out = z₁·B₁ + z₂·B₂", rx, by + bh / 2 + 22)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("VAE：编码成「分布」+ KL 拉向 N(0,I) → 潜空间连续可生成", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = () => {
      tickRef.current += 1
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => [
      {
        apply: () => setIdx(0),
        text: "变分自编码器和普通自编码器最关键的区别在这里:普通自编码器把输入压成潜空间里的一个点,而 VAE 把输入编码成一个分布——给出一个中心 μ 和一个范围 σ,也就是图里每个带圈的小点。",
      },
      {
        apply: () => setIdx(1),
        text: "既然是分布,就要从里面采样。VAE 用一个巧妙的技巧叫重参数化:z 等于 μ 加上 σ 乘以一个标准正态的随机数 ε。你看每个圈里有个白点在轻轻抖动,那就是采出来的 z。这样既能随机采样,又能让梯度顺利传回去训练。",
      },
      {
        apply: () => setIdx(2),
        text: "光这样还不够。VAE 在损失里加了一项 KL 散度,把所有这些后验分布,往中间的标准正态 N(0,I) 拉。你看这些圈都被拉向了原点、聚拢成一团。这一步让整个潜空间变得紧致、连续,中间没有空洞。",
      },
      {
        apply: () => setIdx(3),
        text: "正因为潜空间规整又连续,生成就变得很简单:随便从标准正态里采一个 z,丢给解码器,就能得到一个全新的、合理的样本。而且当 z 平滑移动时,右边解码出的输出也跟着连续平滑地变化——这种连续性,正是 VAE 能做生成、能在样本之间「插值」的根本原因。",
      },
    ],
  })

  const caption = [
    "VAE 编码器输出的是分布(μ,σ)，不是一个点——图中每个带 σ 圈的中心。",
    "重参数化 z=μ+σ·ε：可采样又可训练(梯度能传回)。圈里白点=采样的 z。",
    "KL 损失把所有后验拉向 N(0,I)：潜空间紧致、连续、无空洞。",
    "生成：采 z~N(0,I) 解码即得新样本；z 平滑移动→输出连续变化(可插值)。",
  ][idx]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1}/4
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {["编码成分布", "重参数化", "KL 正则", "生成"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">圈=后验分布 · 绿=生成采样</span>
        </div>
      )}
    </div>
  )
}
