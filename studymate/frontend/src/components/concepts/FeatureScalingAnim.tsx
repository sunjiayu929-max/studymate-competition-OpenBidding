/**
 * 概念动画 · 特征缩放 标准化 / 归一化（机器学习 · 数据预处理）
 * ------------------------------------------------------------------
 * 特征量纲悬殊（面积 0~1000 vs 房间数 0~5）会把损失等高线拉成又扁又长的山谷，
 * 梯度下降在里面来回横跳、走得慢；标准化（减均值除标准差）后等高线变成圆碗，
 * 梯度直指谷底、几步就到。这里两侧都跑**真实梯度下降**（同起点、固定 lr）：
 *   左：病态损失 0.5(A·w₁²+w₂²), A=18 → 锯齿；右：A=1 圆碗 → 直线。
 * KNN / SVM / 神经网络都对尺度敏感，缩放几乎是必做预处理。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

function genPath(A: number, lr: number, steps: number): [number, number][] {
  let w: [number, number] = [-2.6, 2.6]
  const path: [number, number][] = [[...w]]
  for (let t = 0; t < steps; t++) {
    w = [w[0] - lr * A * w[0], w[1] - lr * 1 * w[1]]
    path.push([...w])
  }
  return path
}
const RAW = genPath(18, 0.1, 30)
const SCALED = genPath(1, 0.6, 14)
const MAXLEN = RAW.length
const STEP_MS = 240

export function FeatureScalingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const stepRef = useRef(0)
  const lastRef = useRef(0)
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
    const id = idxRef.current
    const step = stepRef.current

    const panelW = (cssW - 60) / 2
    const panelH = 200
    const top = 70
    const drawPanel = (ox: number, A: number, path: [number, number][], title: string, color: string, emph: boolean) => {
      const cx = ox + panelW / 2
      const cy = top + panelH / 2
      const sx = panelW / 6.4 // w∈[-3.2,3.2]
      const sy = panelH / 6.4
      const W2P = (w: [number, number]): [number, number] => [cx + w[0] * sx, cy - w[1] * sy]
      // 边框
      ctx.strokeStyle = emph ? color : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = emph ? 2 : 1
      ctx.strokeRect(ox, top, panelW, panelH)
      // 等高线
      ctx.lineWidth = 1
      for (const c of [0.6, 1.6, 3.2, 5.6]) {
        const ax = Math.sqrt((2 * c) / A) * sx
        const ay = Math.sqrt(2 * c) * sy
        ctx.strokeStyle = isDark ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.18)"
        ctx.beginPath()
        ctx.ellipse(cx, cy, ax, ay, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 谷底
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = "#10b981"
      ctx.fill()
      // 路径（到当前 step）
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      const upto = Math.min(step, path.length - 1)
      for (let i = 0; i <= upto; i++) {
        const [px, py] = W2P(path[i])
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      // 球
      const [bx, by] = W2P(path[upto])
      ctx.beginPath()
      ctx.arc(bx, by, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)"
      ctx.lineWidth = 1.5
      ctx.stroke()
      // 标题 + 收敛步数
      ctx.fillStyle = emph ? color : FG
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillText(title, cx, top + panelH + 8)
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText(`等高线轴比 ${Math.sqrt(A).toFixed(1)} : 1`, cx, top + panelH + 26)
    }

    drawPanel(28, 18, RAW, "未缩放：又扁又长 → 锯齿绕行", "#f43f5e", id <= 1)
    drawPanel(28 + panelW + 4, 1, SCALED, "标准化后：圆碗 → 直奔谷底", "#10b981", id >= 3)

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("特征缩放：把量纲悬殊的特征拉到同一尺度，梯度下降才好走", 118, 28)
    if (id === 2) {
      ctx.fillStyle = "#6366f1"
      ctx.font = "600 13px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.fillText("标准化  x' = (x − μ) / σ   →  均值 0、方差 1", cssW / 2, 50)
    } else {
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("两侧同起点、同梯度下降；左边 lr 还得调小才不发散", cssW / 2, 50)
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (now - lastRef.current > STEP_MS) {
        lastRef.current = now
        stepRef.current = stepRef.current >= MAXLEN + 3 ? 0 : stepRef.current + 1
      }
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
        text: "很多特征的量纲天差地别:比如房子的面积是几百平米,卧室数量只有几个。如果直接把它们喂给模型,会出大问题。",
      },
      {
        apply: () => setIdx(1),
        text: "看左边:没缩放时,损失函数的等高线被大尺度的那个特征拉成一个又扁又长的山谷。梯度下降的小球在里面来回横跳、绕来绕去,走得又慢又费劲,学习率还得调得很小才不至于直接飞出去。",
      },
      {
        apply: () => setIdx(2),
        text: "解决办法叫标准化:把每个特征都减去它的均值、再除以标准差,让它们统统变成均值为 0、方差为 1 的同一个尺度。另一种常见做法是归一化,把数值压到 0 到 1 之间。",
      },
      {
        apply: () => setIdx(3),
        text: "看右边:缩放之后,损失面变成了一个漂亮的圆碗,梯度直接指向谷底,几步就到。不只是梯度下降,KNN、SVM、还有神经网络都对特征尺度很敏感,所以特征缩放几乎是必做的预处理。",
      },
    ],
  })

  const caption = [
    "特征量纲悬殊（如面积 vs 房间数）会让模型偏向大尺度特征、训练困难。",
    "未缩放：损失等高线又扁又长，梯度下降锯齿绕行、收敛慢、易发散。",
    "标准化 x'=(x−μ)/σ → 均值0方差1；归一化则压到 [0,1]。",
    "缩放后等高线变圆碗，梯度直奔谷底、几步收敛。KNN/SVM/神经网络都需要。",
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
          {["量纲悬殊", "未缩放", "标准化", "缩放后"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">红=未缩放锯齿 · 绿=缩放后直奔</span>
        </div>
      )}
    </div>
  )
}
