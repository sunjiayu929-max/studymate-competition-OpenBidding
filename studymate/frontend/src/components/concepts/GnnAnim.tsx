/**
 * 概念动画 · 图神经网络 GNN / GCN（机器学习 · 图数据）
 * ------------------------------------------------------------------
 * 图结构数据（社交网络/分子/知识图谱）上做半监督节点分类。
 * 核心是「消息传递」：每个未知节点把自己 + 邻居的特征取平均来更新自己（真实迭代），
 *   已知标签节点保持不变（clamp）。多轮后标签信息沿边扩散，节点被「染」成所属社区颜色。
 * 卷积是消息传递在规则网格上的特例。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const POS: [number, number][] = [
  [0.15, 0.28],
  [0.3, 0.62],
  [0.12, 0.78],
  [0.36, 0.36],
  [0.62, 0.3],
  [0.74, 0.64],
  [0.88, 0.36],
  [0.66, 0.82],
  [0.9, 0.74],
]
const EDGES = [
  [0, 1],
  [0, 3],
  [1, 2],
  [1, 3],
  [4, 5],
  [4, 6],
  [5, 7],
  [5, 8],
  [6, 8],
  [7, 8],
  [3, 4],
]
const NN = POS.length
const ADJ: number[][] = Array.from({ length: NN }, () => [])
EDGES.forEach(([a, b]) => {
  ADJ[a].push(b)
  ADJ[b].push(a)
})
const LABEL: (number | null)[] = POS.map(() => null)
LABEL[0] = 1
LABEL[8] = -1
const STEPS = 8
const HIST: number[][] = [POS.map((_, i) => LABEL[i] ?? 0)]
for (let t = 0; t < STEPS; t++) {
  const cur = HIST[t]
  const nxt = cur.slice()
  for (let v = 0; v < NN; v++) {
    if (LABEL[v] !== null) {
      nxt[v] = LABEL[v] as number
      continue
    }
    let sum = cur[v]
    let cnt = 1
    for (const u of ADJ[v]) {
      sum += cur[u]
      cnt++
    }
    nxt[v] = sum / cnt
  }
  HIST.push(nxt)
}
const STEP_MS = 700
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
function colorOf(v: number): string {
  const t = (Math.max(-1, Math.min(1, v)) + 1) / 2 // 0=蓝 .5=灰 1=红
  // blue(59,130,246) → gray(148,163,184) → red(244,63,94)
  if (t < 0.5) {
    const k = t / 0.5
    return `rgb(${lerp(59, 148, k)},${lerp(130, 163, k)},${lerp(246, 184, k)})`
  }
  const k = (t - 0.5) / 0.5
  return `rgb(${lerp(148, 244, k)},${lerp(163, 63, k)},${lerp(184, 94, k)})`
}

export function GnnAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    stepRef.current = step
  }, [step])

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
    const vals = HIST[Math.min(stepRef.current, STEPS)]
    const padX = 60
    const padTop = 56
    const padBot = 40
    const X = (fx: number) => padX + fx * (cssW - 2 * padX)
    const Y = (fy: number) => padTop + fy * (cssH - padTop - padBot)

    // 边
    ctx.strokeStyle = isDark ? "rgba(148,163,184,0.3)" : "rgba(100,116,139,0.28)"
    ctx.lineWidth = 1.5
    for (const [a, b] of EDGES) {
      ctx.beginPath()
      ctx.moveTo(X(POS[a][0]), Y(POS[a][1]))
      ctx.lineTo(X(POS[b][0]), Y(POS[b][1]))
      ctx.stroke()
    }
    // 节点
    for (let v = 0; v < NN; v++) {
      const x = X(POS[v][0])
      const y = Y(POS[v][1])
      const labeled = LABEL[v] !== null
      ctx.beginPath()
      ctx.arc(x, y, labeled ? 18 : 15, 0, Math.PI * 2)
      ctx.fillStyle = colorOf(vals[v])
      ctx.fill()
      ctx.lineWidth = labeled ? 3 : 1.5
      ctx.strokeStyle = labeled ? "#fff" : isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)"
      ctx.stroke()
      if (labeled) {
        ctx.fillStyle = "#fff"
        ctx.font = "600 12px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(LABEL[v] === 1 ? "A" : "B", x, y)
      } else {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)"
        ctx.font = "9px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(vals[v].toFixed(1), x, y)
      }
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("图神经网络：节点反复聚合邻居特征 → 标签沿边扩散", 118, 28)
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = MUT
    ctx.textAlign = "right"
    ctx.fillText(`第 ${Math.min(stepRef.current, STEPS)} 轮消息传递`, cssW - 92, 28)
    // 图例
    ctx.fillStyle = "#f43f5e"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("● A 类", 60, cssH - 16)
    ctx.fillStyle = "#3b82f6"
    ctx.fillText("● B 类", 120, cssH - 16)
    ctx.fillStyle = MUT
    ctx.fillText("白边=已知标签(保持不变)", 180, cssH - 16)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (stepRef.current < STEPS) setStep((s) => s + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = step >= STEPS
  const handleReset = useCallback(() => {
    setPlaying(false)
    setStep(0)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setStep(0)
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
        STEPS + 1,
        [
          "图神经网络处理的是图结构数据:社交网络、分子、知识图谱。每个节点都有自己的特征。这张图里,一开始只有两个节点被打了标签——带白边的 A 是一类、B 是另一类,其余全是不知道类别的灰点。",
          "核心操作叫消息传递:每个未知节点,把自己和所有邻居的特征做一次平均,用这个结果更新自己;而打了标签的 A、B 始终保持不变。一轮下来,标签信息就从已知节点,渗透到了它紧挨着的邻居身上。",
          "再传几轮,信息沿着边一层一层往外扩散,每个节点都综合了越来越大范围邻居的信息,颜色也越来越分明。",
          "最后,左边这一团被染成了红色、右边这一团被染成了蓝色,两个社区被清晰地区分开来。这就是图神经网络做半监督节点分类。其实我们熟悉的卷积,就是消息传递在规则网格上的一个特例。",
        ],
        (i) => setStep(i)
      ),
  })

  const caption = done
    ? "标签沿边扩散完成：左团→A 类、右团→B 类，两社区分清。这就是 GNN 半监督节点分类。"
    : `第 ${step} 轮消息传递：每个未知节点 = 自己 + 邻居特征的平均；已知标签保持不变，信息逐层扩散。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {Math.min(step, STEPS)}/{STEPS}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "消息传递"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStep((s) => Math.min(STEPS, s + 1))} disabled={playing || done}>
            下一轮
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">聚合邻居 → 标签扩散</span>
        </div>
      )}
    </div>
  )
}
