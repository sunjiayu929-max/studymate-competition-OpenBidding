/**
 * 概念动画 · Softmax 归一化指数函数（机器学习 · 多分类输出层）
 * ------------------------------------------------------------------
 * 真实计算：把 K 个原始分数 logits 变成一组和为 1 的概率
 *   pᵢ = e^(zᵢ/T) / Σⱼ e^(zⱼ/T)
 *   - 取指数 → 大的更突出、且都变正；再归一化 → 和为 1 的概率
 *   - 温度 T：调小 → 向最大者集中(趋近 one-hot 硬判决)；调大 → 拉平(趋于均匀)
 * 三栏对照 logits → 指数 → 概率。拖温度 T 看软硬变化。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const NAMES = ["A", "B", "C", "D"]
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"]

function genLogits(): number[] {
  return NAMES.map(() => +(-1.4 + Math.random() * 3.8).toFixed(1))
}
function softmax(z: number[], T: number): { ex: number[]; p: number[] } {
  const ex = z.map((v) => Math.exp(v / T))
  const s = ex.reduce((a, b) => a + b, 0) || 1
  return { ex, p: ex.map((v) => v / s) }
}

export function SoftmaxAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [T, setT] = useState(1)
  const logitsRef = useRef<number[]>(genLogits())
  const TRef = useRef(1)
  useEffect(() => {
    TRef.current = T
  }, [T])
  useEffect(() => {
    logitsRef.current = genLogits()
    setT(1)
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
    const z = logitsRef.current
    const { ex, p } = softmax(z, TRef.current)
    const zmin = Math.min(...z)
    const zmax = Math.max(...z)
    const exmax = Math.max(...ex)
    const pmax = Math.max(...p)
    const argmax = p.indexOf(pmax)

    const K = z.length
    const top = 52
    const rowH = 26
    const gap = 18
    // 三栏
    const cols = [
      { title: "① 原始分数 z", x0: 60, x1: cssW * 0.34 },
      { title: "② 指数 eᶻ̸ᵀ", x0: cssW * 0.40, x1: cssW * 0.64 },
      { title: "③ 概率 p (Σ=1)", x0: cssW * 0.71, x1: cssW - 16 },
    ]
    ctx.textBaseline = "middle"
    // 栏标题
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.fillStyle = MUT
    ctx.textAlign = "left"
    for (const c of cols) ctx.fillText(c.title, c.x0, 22)
    // 运算符
    ctx.fillStyle = FG
    ctx.font = "13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`e^(·/T)`, (cols[0].x1 + cols[1].x0) / 2, top + (rowH + gap) * K - gap + 14)
    ctx.fillText("÷Σ", (cols[1].x1 + cols[2].x0) / 2, top + (rowH + gap) * K - gap + 14)
    ctx.font = "16px ui-sans-serif, system-ui"
    ctx.fillText("→", (cols[0].x1 + cols[1].x0) / 2, top + rowH)
    ctx.fillText("→", (cols[1].x1 + cols[2].x0) / 2, top + rowH)

    for (let i = 0; i < K; i++) {
      const y = top + i * (rowH + gap)
      // 类标签
      ctx.fillStyle = COLORS[i]
      ctx.font = "700 13px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText(NAMES[i], 22, y + rowH / 2)
      // ① z 条（按 [zmin,zmax] 归一化长度，标注真实值含负）
      const drawBar = (x0: number, x1: number, frac: number, label: string, hot: boolean) => {
        const w = Math.max(2, (x1 - x0) * Math.max(0, Math.min(1, frac)))
        ctx.fillStyle = hot ? COLORS[i] : isDark ? "#3f3f46" : "#d4d4d8"
        ctx.fillRect(x0, y + 3, w, rowH - 6)
        ctx.fillStyle = FG
        ctx.font = "11px ui-sans-serif, system-ui"
        ctx.textAlign = "left"
        ctx.fillText(label, x0 + w + 5, y + rowH / 2)
      }
      const zf = zmax > zmin ? (z[i] - zmin) / (zmax - zmin) : 0.5
      drawBar(cols[0].x0, cols[0].x1 - 30, 0.15 + 0.85 * zf, z[i].toFixed(1), false)
      drawBar(cols[1].x0, cols[1].x1 - 30, ex[i] / exmax, ex[i].toFixed(2), false)
      drawBar(cols[2].x0, cols[2].x1 - 38, p[i], `${(p[i] * 100).toFixed(0)}%`, i === argmax)
    }

    // 概率和 = 1 提示
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(`温度 T = ${TRef.current.toFixed(1)} · 概率之和 = ${p.reduce((a, b) => a + b, 0).toFixed(2)} · 最大概率类 ${NAMES[argmax]}`, 22, cssH - 16)
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

  // 讲课：4 个状态拍（logits → 指数+归一化 → T 调小变硬 → T 调大变软）。logits 固定不重生成 → 数值与画面一致
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => {
      const z = logitsRef.current
      const r1 = softmax(z, 1)
      const am = r1.p.indexOf(Math.max(...r1.p))
      const sharp = softmax(z, 0.4)
      return [
        {
          apply: () => setT(1),
          text: "Softmax 把神经网络输出的一串原始分数（叫 logits），变成一组加起来正好等于 1 的概率。你看左边这一栏，四个类的原始分数有高有低、还有负的，没法直接当概率用。",
        },
        {
          apply: () => setT(1),
          text: `两步走：第一步，每个分数取指数 e 的 z 次方——指数让大的更突出，而且不管正负都变成正数（中间这栏）；第二步，除以它们的总和做归一化，就得到右边的概率，全部加起来正好是 1。最大的分数对应最大的概率，这里是 ${NAMES[am]} 类、${(r1.p[am] * 100).toFixed(0)}%。`,
        },
        {
          apply: () => setT(0.4),
          text: `Softmax 还有个旋钮叫温度 T。把 T 调小，你看——概率猛地向最大那个类集中，${NAMES[am]} 一下涨到 ${(sharp.p[am] * 100).toFixed(0)}%，几乎是非 0 即 1 的「硬判决」，趋近 one-hot。`,
        },
        {
          apply: () => setT(2.6),
          text: "反过来把 T 调大，概率被拉平，各个类越来越接近均等、模型越来越「犹豫」。分类网络的输出层、注意力里的权重、知识蒸馏，用的都是 Softmax——把分数变概率的标准件。",
        },
      ]
    },
  })

  const z = logitsRef.current
  const { p } = softmax(z, T)
  const am = p.indexOf(Math.max(...p))
  const caption = `T=${T.toFixed(1)}：logits 取指数 e^(z/T) 再归一化 → 概率(和=1)。最大概率类 ${NAMES[am]}（${(p[am] * 100).toFixed(0)}%）。T 越小越「硬」、越大越「平」。`

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
          T = {T.toFixed(1)}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            温度 T
            <input
              type="range"
              min={0.3}
              max={3}
              step={0.1}
              value={T}
              onChange={(e) => setT(parseFloat(e.target.value))}
              className="w-40 accent-indigo-500"
            />
            <span className="font-mono w-8 text-center">{T.toFixed(1)}</span>
          </label>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 换一组分数
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            T 小→集中(硬) · T 大→拉平(软)
          </span>
        </div>
      )}
    </div>
  )
}
