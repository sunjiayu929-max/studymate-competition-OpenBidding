/**
 * 概念动画 · 混淆矩阵 Confusion Matrix（机器学习 · 模型评估）
 * ------------------------------------------------------------------
 * 真实统计：一组带真实标签 + 分类器打分的样本，按阈值 τ 判正/负，
 * 数出四格——TP/FP/FN/TN，再由四格算出全部评估指标：
 *   准确率 = (TP+TN)/N      查准率(precision) = TP/(TP+FP)
 *   查全率(recall) = TP/(TP+FN)   F1 = 2·P·R/(P+R)
 * 拖阈值 τ：调低 → 查全率↑ 查准率↓；调高 → 反之，一图看懂权衡。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

interface Sample {
  pos: boolean // 真实是否为正类
  score: number // 分类器给的「是正类」打分 [0,1]
}

// 真实为正的样本打分偏高、真实为负的偏低，但刻意有重叠 → 任何阈值都做不到完美，指标才有讲头
function genData(): Sample[] {
  const s: Sample[] = []
  const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v))
  for (let i = 0; i < 18; i++) s.push({ pos: true, score: clamp(0.62 + (Math.random() - 0.5) * 0.6) })
  for (let i = 0; i < 18; i++) s.push({ pos: false, score: clamp(0.38 + (Math.random() - 0.5) * 0.6) })
  return s
}

interface Counts {
  TP: number
  FP: number
  FN: number
  TN: number
}
function count(data: Sample[], tau: number): Counts {
  let TP = 0
  let FP = 0
  let FN = 0
  let TN = 0
  for (const s of data) {
    const predPos = s.score >= tau
    if (s.pos && predPos) TP++
    else if (s.pos && !predPos) FN++
    else if (!s.pos && predPos) FP++
    else TN++
  }
  return { TP, FP, FN, TN }
}
const acc = (c: Counts) => (c.TP + c.TN) / (c.TP + c.FP + c.FN + c.TN || 1)
const precision = (c: Counts) => (c.TP + c.FP === 0 ? 0 : c.TP / (c.TP + c.FP))
const recall = (c: Counts) => (c.TP + c.FN === 0 ? 0 : c.TP / (c.TP + c.FN))
const f1 = (c: Counts) => {
  const p = precision(c)
  const r = recall(c)
  return p + r === 0 ? 0 : (2 * p * r) / (p + r)
}

export function ConfusionMatrixAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [tau, setTau] = useState(0.5)
  const dataRef = useRef<Sample[]>(genData())
  const tauRef = useRef(0.5)
  useEffect(() => {
    tauRef.current = tau
  }, [tau])
  useEffect(() => {
    dataRef.current = genData()
    setTau(0.5)
  }, [seed])

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
    const data = dataRef.current
    const t = tauRef.current
    const c = count(data, t)
    const N = data.length

    // ===== 左：2×2 混淆矩阵 =====
    const cell = 76
    const mx = 78
    const my = 66
    const drawCell = (col: number, row: number, val: number, label: string, correct: boolean) => {
      const x = mx + col * cell
      const y = my + row * cell
      const frac = val / (N / 2 || 1)
      const a = 0.16 + Math.min(0.7, frac) * 0.7
      ctx.fillStyle = correct ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`
      ctx.fillRect(x, y, cell - 4, cell - 4)
      ctx.fillStyle = isDark ? "#fafafa" : "#18181b"
      ctx.font = "700 26px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(val), x + (cell - 4) / 2, y + (cell - 4) / 2 - 7)
      ctx.fillStyle = correct ? (isDark ? "#a7f3d0" : "#047857") : isDark ? "#fda4af" : "#be123c"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.fillText(label, x + (cell - 4) / 2, y + (cell - 4) / 2 + 16)
    }
    // 行=真实，列=预测；左上 TP，右上 FN，左下 FP，右下 TN
    drawCell(0, 0, c.TP, "TP 真正例", true)
    drawCell(1, 0, c.FN, "FN 漏报", false)
    drawCell(0, 1, c.FP, "FP 误报", false)
    drawCell(1, 1, c.TN, "TN 真负例", true)
    // 表头
    ctx.fillStyle = MUT
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("预测正", mx + cell / 2, my - 22)
    ctx.fillText("预测负", mx + cell + cell / 2, my - 22)
    ctx.fillText("← 预测 →", mx + cell - 2, my - 38)
    ctx.save()
    ctx.translate(mx - 24, my + cell)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = "center"
    ctx.fillText("← 真实 →", 0, 0)
    ctx.restore()
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillStyle = MUT
    ctx.fillText("真实正", mx - 6, my + cell / 2)
    ctx.fillText("真实负", mx - 6, my + cell + cell / 2)

    // ===== 右：四个指标条 =====
    const bx = mx + 2 * cell + 56
    const bw = Math.max(120, cssW - bx - 80)
    const metrics = [
      { name: "准确率 Accuracy", v: acc(c), col: "#6366f1", sub: `(${c.TP}+${c.TN})/${N}` },
      { name: "查准率 Precision", v: precision(c), col: "#10b981", sub: `${c.TP}/(${c.TP}+${c.FP})` },
      { name: "查全率 Recall", v: recall(c), col: "#f59e0b", sub: `${c.TP}/(${c.TP}+${c.FN})` },
      { name: "F1 分数", v: f1(c), col: "#ec4899", sub: "2·P·R/(P+R)" },
    ]
    const bh = 26
    const bgap = 26
    metrics.forEach((m, i) => {
      const y = my + 4 + i * (bh + bgap)
      ctx.fillStyle = FG
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(m.name, bx, y - 4)
      ctx.fillStyle = MUT
      ctx.font = "10px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.fillText(m.sub, bx + bw, y - 4)
      // 轨
      ctx.fillStyle = isDark ? "#27272a" : "#e4e4e7"
      ctx.fillRect(bx, y, bw, bh)
      // 值
      ctx.fillStyle = m.col
      ctx.fillRect(bx, y, bw * m.v, bh)
      ctx.fillStyle = isDark ? "#fafafa" : "#18181b"
      ctx.font = "700 13px ui-monospace, monospace"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(`${(m.v * 100).toFixed(1)}%`, bx + 8, y + bh / 2)
    })

    // ===== 底：样本打分条 + 阈值线 =====
    const sy = cssH - 30
    const sx0 = 24
    const sx1 = cssW - 24
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx0, sy)
    ctx.lineTo(sx1, sy)
    ctx.stroke()
    for (const s of data) {
      const x = sx0 + (sx1 - sx0) * s.score
      const predPos = s.score >= t
      const correct = predPos === s.pos
      ctx.beginPath()
      ctx.arc(x, sy - (s.pos ? 9 : -9), 4.5, 0, Math.PI * 2)
      ctx.fillStyle = correct ? "#10b981" : "#f43f5e"
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // 阈值线
    const tx = sx0 + (sx1 - sx0) * t
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(tx, sy - 26)
    ctx.lineTo(tx, sy + 26)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "#6366f1"
    ctx.font = "600 11px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`阈值 τ=${t.toFixed(2)}`, tx, sy - 30)
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("上排=真实正  下排=真实负  绿=判对 红=判错  阈值右侧判正", sx0, sy + 24)
  }, [applyViewport])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const handleReset = useCallback(() => setSeed((s) => s + 1), [])

  // 讲课：4 个状态拍。data 固定不重生成 → 讲解里的真实计数/指标与画面一致
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => {
      const data = dataRef.current
      const mid = count(data, 0.5)
      const low = count(data, 0.3)
      return [
        {
          apply: () => setTau(0.5),
          text: `评价一个分类器好不好，先把每个样本「真实是什么」和「模型预测是什么」交叉数一遍，填进这个 2×2 的混淆矩阵。对角线是判对的：真实正、也预测正的叫 TP，这里有 ${mid.TP} 个；真实负、也预测负的叫 TN，有 ${mid.TN} 个。`,
        },
        {
          apply: () => setTau(0.5),
          text: `另外两格是判错的：真的正例却被漏判成负的，叫 FN 漏报，有 ${mid.FN} 个；本是负例却被误判成正的，叫 FP 误报，有 ${mid.FP} 个。所有指标都从这四个数算出来。最直观的是准确率——判对的占总数，(${mid.TP}+${mid.TN})/${data.length}，等于 ${(acc(mid) * 100).toFixed(0)}%。`,
        },
        {
          apply: () => setTau(0.5),
          text: `但光看准确率不够。查准率 precision = TP/(TP+FP)，是「报了警的里头有多少是真的」，现在 ${(precision(mid) * 100).toFixed(0)}%；查全率 recall = TP/(TP+FN)，是「真有问题的里头抓到了多少」，现在 ${(recall(mid) * 100).toFixed(0)}%。一个看准不准、一个看全不全。`,
        },
        {
          apply: () => setTau(0.3),
          text: `这俩往往是跷跷板。把阈值调低、宁可错杀，你看查全率冲到 ${(recall(low) * 100).toFixed(0)}%、几乎不漏，可误报变多、查准率掉到 ${(precision(low) * 100).toFixed(0)}%；调高阈值则反过来。F1 分数就是这两者的调和平均，逼着模型又准又全——这才是评估分类器的完整画像。`,
        },
      ]
    },
  })

  const c = count(dataRef.current, tau)
  const caption = `阈值 τ=${tau.toFixed(2)}：TP=${c.TP} FP=${c.FP} FN=${c.FN} TN=${c.TN} → 准确率${(acc(c) * 100).toFixed(0)}% · 查准率${(precision(c) * 100).toFixed(0)}% · 查全率${(recall(c) * 100).toFixed(0)}% · F1=${(f1(c) * 100).toFixed(0)}%。调低阈值查全率↑查准率↓。`

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
          τ = {tau.toFixed(2)}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            阈值 τ
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={tau}
              onChange={(e) => setTau(parseFloat(e.target.value))}
              className="w-40 accent-indigo-500"
            />
            <span className="font-mono w-10 text-center">{tau.toFixed(2)}</span>
          </label>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 换一组样本
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            查准率↔查全率此消彼长 · F1 取调和平均
          </span>
        </div>
      )}
    </div>
  )
}
