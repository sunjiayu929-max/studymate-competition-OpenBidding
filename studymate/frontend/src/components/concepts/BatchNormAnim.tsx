/**
 * 概念动画 · 批归一化 Batch Normalization（机器学习 · 稳定深层训练）
 * ------------------------------------------------------------------
 * 真实变换：对一个 mini-batch 的激活值做标准化,再用可学习参数缩放平移：
 *   ① 算批均值 μ、批方差 σ²    ② x̂ = (x−μ)/√(σ²+ε) → 均值0、方差1
 *   ③ y = γ·x̂ + β（γ 缩放、β 平移,可学习,恢复表达力）
 *   - 让每层输入分布稳定（缓解内部协变量偏移）→ 可用更大学习率、训练更快更稳
 * 四步看一批激活如何「居中 → 缩成单位方差 → γβ 重塑」。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { ConceptAnimProps } from "./registry"
import { Button } from "@/components/ui/button"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const N = 24
function genBatch(): number[] {
  // 偏移又分散的一批激活（均值≈3.5, 标准差≈1.8）
  return Array.from({ length: N }, () => +(3.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 1.5).toFixed(2))
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const std = (a: number[], m: number) => Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)

export function BatchNormAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [stage, setStage] = useState(0) // 0 raw · 1 居中 · 2 标准化 · 3 γβ
  const [gamma, setGamma] = useState(1.5)
  const [beta, setBeta] = useState(2)
  const rawRef = useRef<number[]>(genBatch())
  const stageRef = useRef(0)
  const gRef = useRef(1.5)
  const bRef = useRef(2)
  useEffect(() => {
    stageRef.current = stage
  }, [stage])
  useEffect(() => {
    gRef.current = gamma
  }, [gamma])
  useEffect(() => {
    bRef.current = beta
  }, [beta])
  useEffect(() => {
    rawRef.current = genBatch()
    setStage(0)
  }, [seed])

  const valuesAt = (stage: number, raw: number[], g: number, b: number): number[] => {
    const m = mean(raw)
    const s = std(raw, m) || 1
    if (stage === 0) return raw
    if (stage === 1) return raw.map((v) => v - m)
    if (stage === 2) return raw.map((v) => (v - m) / s)
    return raw.map((v) => g * ((v - m) / s) + b)
  }

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
    const raw = rawRef.current
    const st = stageRef.current
    const vals = valuesAt(st, raw, gRef.current, bRef.current)
    const m = mean(vals)
    const s = std(vals, m)

    const padL = 30
    const plotW = cssW - padL * 2
    const midX = padL + plotW / 2
    const axisY = cssH / 2 + 20
    const px = plotW / 22 // 每单位像素（值域约 ±11）
    const X = (v: number) => midX + v * px

    // 0 轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, axisY)
    ctx.lineTo(cssW - padL, axisY)
    ctx.stroke()
    // 刻度
    ctx.fillStyle = MUT
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let v = -10; v <= 10; v += 2) {
      const x = X(v)
      if (x < padL || x > cssW - padL) continue
      ctx.fillText(String(v), x, axisY + 6)
      ctx.strokeStyle = v === 0 ? (isDark ? "#71717a" : "#a1a1aa") : isDark ? "#27272a" : "#ececec"
      ctx.lineWidth = v === 0 ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(x, axisY - 4)
      ctx.lineTo(x, axisY + 4)
      ctx.stroke()
    }

    // 高斯钟形（按当前 m,s）
    if (s > 0.01) {
      ctx.strokeStyle = "#6366f1"
      ctx.lineWidth = 2
      ctx.beginPath()
      const amp = 120
      for (let xpix = padL; xpix <= cssW - padL; xpix += 2) {
        const v = (xpix - midX) / px
        const y = axisY - amp * Math.exp(-((v - m) ** 2) / (2 * s * s))
        if (xpix === padL) ctx.moveTo(xpix, y)
        else ctx.lineTo(xpix, y)
      }
      ctx.stroke()
    }

    // 数据点（竖向轻微错开,落在轴上方）
    vals.forEach((v, i) => {
      const x = X(v)
      const y = axisY - 8 - (i % 6) * 7
      ctx.beginPath()
      ctx.arc(x, y, 3.4, 0, Math.PI * 2)
      ctx.fillStyle = "#10b981"
      ctx.globalAlpha = 0.85
      ctx.fill()
      ctx.globalAlpha = 1
    })

    // 均值线
    ctx.strokeStyle = "#f59e0b"
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X(m), axisY - 150)
    ctx.lineTo(X(m), axisY + 4)
    ctx.stroke()
    ctx.setLineDash([])

    // 顶部状态
    const titles = ["① 原始激活：偏移又分散", "② 减去批均值 μ → 居中", "③ 再除以标准差 σ → 方差=1", "④ y = γ·x̂ + β（缩放+平移）"]
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(titles[st], 118, 26)
    ctx.fillStyle = MUT
    ctx.font = "11px ui-monospace, monospace"
    ctx.fillText(`当前分布：均值=${m.toFixed(2)}  标准差=${s.toFixed(2)}` + (st === 3 ? `  (γ=${gRef.current.toFixed(1)}, β=${beta.toFixed(1)})` : ""), 118, 44)
    ctx.fillStyle = "#f59e0b"
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.fillText("μ", X(m), axisY - 154)
  }, [beta, applyViewport])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => {
      const raw = rawRef.current
      const m0 = mean(raw)
      const s0 = std(raw, m0)
      return [
        {
          apply: () => setStage(0),
          text: `先看一批激活值,绿点就是这个 mini-batch 里每个样本的激活。它们整体偏向右边、又比较分散——这一批的均值是 ${m0.toFixed(2)}、标准差 ${s0.toFixed(2)}。训练中每一层的输入分布都这样飘忽不定,后面的层得不停适应,训练就慢、还容易不稳。`,
        },
        {
          apply: () => setStage(1),
          text: "批归一化分两小步收拾它。第一步:整批减去这一批的均值 μ,你看橙色的均值线一下子挪到了 0,整团点被搬到原点附近、居中了。",
        },
        {
          apply: () => setStage(2),
          text: "第二步:再除以这一批的标准差 σ。点被收拢,分布的胖瘦标准化成方差等于 1。现在不管这一批原本多偏多散,出来的都是均值 0、方差 1 的规整分布——后面的层看到的输入终于稳定了,于是可以放心用更大的学习率,训练又快又稳。",
        },
        {
          apply: () => {
            setGamma(1.5)
            setBeta(2)
            setStage(3)
          },
          text: "不过死死钉在均值0方差1也太死板,会限制网络表达。所以最后再加两个可学习的参数:γ 负责缩放、β 负责平移,y=γx̂+β,让网络自己学着把分布调整到最合适的位置和胖瘦。标准化保证稳定,γβ 还回灵活——这就是 BatchNorm 能让深层网络又快又稳的秘诀。",
        },
      ]
    },
  })

  const vals = valuesAt(stage, rawRef.current, gamma, beta)
  const m = mean(vals)
  const s = std(vals, m)
  const caption = ["原始激活分布偏移、分散 → 层间分布飘忽,训练不稳。", "减均值 μ：整批居中到 0。", "除标准差 σ：方差归一成 1，得到均值0方差1的标准分布。", `γ·x̂+β：可学习缩放平移(当前 γ=${gamma.toFixed(1)}, β=${beta.toFixed(1)}) → 稳定又不失表达力。`][stage] + ` 当前均值=${m.toFixed(2)}、标准差=${s.toFixed(2)}。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          步 {stage + 1}/4
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {["原始", "减μ", "除σ", "γβ"].map((lbl, i) => (
            <Button key={i} size="sm" variant={stage === i ? "default" : "outline"} onClick={() => setStage(i)}>
              {i + 1}.{lbl}
            </Button>
          ))}
          {stage === 3 && (
            <>
              <label className="flex items-center gap-1 text-sm">
                γ
                <input type="range" min={0.3} max={2.5} step={0.1} value={gamma} onChange={(e) => setGamma(parseFloat(e.target.value))} className="w-20 accent-indigo-500" />
                <span className="font-mono w-7 text-center">{gamma.toFixed(1)}</span>
              </label>
              <label className="flex items-center gap-1 text-sm">
                β
                <input type="range" min={-3} max={3} step={0.5} value={beta} onChange={(e) => setBeta(parseFloat(e.target.value))} className="w-20 accent-indigo-500" />
                <span className="font-mono w-7 text-center">{beta.toFixed(1)}</span>
              </label>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)}>
            换一批
          </Button>
        </div>
      )}
    </div>
  )
}
