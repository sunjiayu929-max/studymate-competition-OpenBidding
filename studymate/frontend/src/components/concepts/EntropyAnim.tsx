/**
 * 概念动画 · 信息熵 / 交叉熵 / KL 散度（机器学习 · 信息论基础）
 * ------------------------------------------------------------------
 * 熵 H(p)=−Σ pᵢ log₂ pᵢ 衡量一个分布有多「不确定」：
 *   均匀分布最不确定 → 熵最大；越接近确定 → 熵越接近 0。
 * 交叉熵 H(p,q)=−Σ pᵢ log₂ qᵢ、KL 散度 D(p‖q)=H(p,q)−H(p)：
 *   用「错的」分布 q 去编码真实分布 p，平均要多付的比特数。
 * 全部数值在 draw 里真实计算（log₂），与画面一致。模型训练最小化交叉熵 = 让 q 逼近 p。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const LABELS = ["A", "B", "C", "D"]
// 前 3 拍：单分布 p；第 4 拍：真实 p vs 模型 q
const DISTS: { p: number[]; q?: number[]; tag: string }[] = [
  { p: [0.25, 0.25, 0.25, 0.25], tag: "均匀：最不确定" },
  { p: [0.55, 0.25, 0.13, 0.07], tag: "不均匀：更可预测" },
  { p: [0.9, 0.06, 0.03, 0.01], tag: "近乎确定：熵≈0" },
  { p: [0.5, 0.25, 0.15, 0.1], q: [0.25, 0.25, 0.25, 0.25], tag: "交叉熵 / KL：用 q 编码 p" },
]
const log2 = (x: number) => Math.log(x) / Math.LN2
const entropy = (p: number[]) => -p.reduce((s, x) => s + (x > 0 ? x * log2(x) : 0), 0)
const crossEnt = (p: number[], q: number[]) => -p.reduce((s, x, i) => s + (x > 0 ? x * log2(q[i]) : 0), 0)

export function EntropyAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
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
    const d = DISTS[idxRef.current]
    const hasQ = !!d.q

    const baseY = cssH - 64
    const maxH = 150
    const groupW = cssW - 140
    const x0 = 84
    const slot = groupW / LABELS.length
    const bw = hasQ ? slot * 0.3 : slot * 0.42

    // y 轴刻度
    ctx.strokeStyle = isDark ? "#3f3f46" : "#e4e4e7"
    ctx.lineWidth = 1
    for (let t = 0; t <= 1; t += 0.25) {
      const gy = baseY - t * maxH
      ctx.beginPath()
      ctx.moveTo(x0 - 10, gy)
      ctx.lineTo(cssW - 36, gy)
      ctx.stroke()
      ctx.fillStyle = MUT
      ctx.font = "9px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(t.toFixed(2), x0 - 14, gy)
    }

    for (let i = 0; i < LABELS.length; i++) {
      const cx = x0 + i * slot + slot / 2
      // p 柱
      const ph = d.p[i] * maxH
      ctx.fillStyle = "#6366f1"
      ctx.fillRect(hasQ ? cx - bw - 2 : cx - bw / 2, baseY - ph, bw, ph)
      ctx.fillStyle = "#6366f1"
      ctx.font = "600 10px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(d.p[i].toFixed(2), hasQ ? cx - bw / 2 - 2 : cx, baseY - ph - 3)
      // q 柱（仅第 4 拍）
      if (hasQ && d.q) {
        const qh = d.q[i] * maxH
        ctx.fillStyle = "#f59e0b"
        ctx.fillRect(cx + 2, baseY - qh, bw, qh)
        ctx.fillStyle = "#f59e0b"
        ctx.fillText(d.q[i].toFixed(2), cx + bw / 2 + 2, baseY - qh - 3)
      }
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textBaseline = "top"
      ctx.fillText(LABELS[i], cx, baseY + 6)
    }
    // x 轴
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x0 - 10, baseY)
    ctx.lineTo(cssW - 36, baseY)
    ctx.stroke()

    // 数值读数
    const H = entropy(d.p)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    if (!hasQ) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 15px ui-sans-serif, system-ui"
      ctx.fillText(`熵 H(p) = ${H.toFixed(3)} 比特`, 120, 70)
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.fillText("H(p) = −Σ pᵢ·log₂ pᵢ（最大为 log₂4 = 2）", 120, 90)
    } else if (d.q) {
      const CE = crossEnt(d.p, d.q)
      const KL = CE - H
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.fillStyle = "#6366f1"
      ctx.fillText(`H(p)=${H.toFixed(3)}`, 120, 62)
      ctx.fillStyle = "#f59e0b"
      ctx.fillText(`交叉熵 H(p,q)=${CE.toFixed(3)}`, 230, 62)
      ctx.fillStyle = "#10b981"
      ctx.font = "600 15px ui-sans-serif, system-ui"
      ctx.fillText(`KL 散度 D(p‖q) = ${KL.toFixed(3)} 比特（多付的代价）`, 120, 86)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.fillText(`信息熵：分布越不确定，熵越大 · ${d.tag}`, 118, 28)
    if (hasQ) {
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.fillStyle = "#6366f1"
      ctx.textAlign = "right"
      ctx.fillText("■ p 真实", cssW - 120, 28)
      ctx.fillStyle = "#f59e0b"
      ctx.fillText("■ q 模型", cssW - 40, 28)
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = () => {
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
        text: "信息熵衡量一个分布有多「不确定」。四种结果概率完全相等的时候,你最猜不准下一个会是谁,不确定性最高,熵也达到最大——这里正好是 2 比特。",
      },
      {
        apply: () => setIdx(1),
        text: "当概率变得不均匀,有的结果明显更可能出现,你的把握变大了,不确定性下降,熵也跟着变小。",
      },
      {
        apply: () => setIdx(2),
        text: "如果几乎可以肯定就是某一个结果,熵就接近 0——因为没什么信息量了,你早就知道答案是谁。所以熵也常被理解成「平均要问几个是非问题才能确定结果」。",
      },
      {
        apply: () => setIdx(3),
        text: "交叉熵和 KL 散度,衡量用一个「错的」分布 q,去描述真实分布 p,要多付出的代价。这里用均匀的 q 去编码真实的 p,平均每个符号要多花 0.26 比特,这部分浪费就是 KL 散度。模型训练时最小化交叉熵,本质就是让预测分布 q 一点点逼近真实分布 p。",
      },
    ],
  })

  const d = DISTS[idx]
  const H = entropy(d.p)
  const caption = d.q
    ? `真实 p 的熵 ${H.toFixed(3)}，用均匀 q 编码的交叉熵 ${crossEnt(d.p, d.q).toFixed(3)} → KL=${(crossEnt(d.p, d.q) - H).toFixed(3)} 比特。最小化交叉熵 = 让 q 逼近 p。`
    : `${d.tag}：H(p) = −Σpᵢlog₂pᵢ = ${H.toFixed(3)} 比特。均匀分布熵最大(=2)，越确定越接近 0。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1}/{DISTS.length}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {DISTS.map((_, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {i < 3 ? `分布 ${i + 1}` : "交叉熵/KL"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=真实 p · 橙=模型 q · 数值实时算</span>
        </div>
      )}
    </div>
  )
}
