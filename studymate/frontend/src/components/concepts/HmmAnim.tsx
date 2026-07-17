/**
 * 概念动画 · 隐马尔可夫模型 HMM / 维特比算法（机器学习 · 序列模型）
 * ------------------------------------------------------------------
 * 背后有看不见的「隐状态」（天气：晴/雨），只能看到它发出的「观测」（朋友：散步/购物/打扫）。
 * 已知观测序列，用维特比算法反推最可能的隐状态序列：
 *   δ[t][s] = 走到状态 s、最可能那条路径的概率（真实动态规划）；
 *   每个格子从上一列挑最大的接上 × 转移 × 发射，记下来路（backpointer）；
 *   填到末列挑最大、顺着来路回溯 → 最可能隐藏序列。语音识别 / 词性标注都靠它。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const STATES = ["晴", "雨"]
const OBSN = ["散步", "购物", "打扫"]
const OBS = [0, 1, 2] // 观测序列
const START = [0.6, 0.4]
const TRANS = [
  [0.7, 0.3],
  [0.4, 0.6],
]
const EMIT = [
  [0.6, 0.3, 0.1],
  [0.1, 0.4, 0.5],
]
// 维特比：δ 概率 + ψ 来路
const T = OBS.length
const DELTA: number[][] = Array.from({ length: T }, () => [0, 0])
const PSI: number[][] = Array.from({ length: T }, () => [0, 0])
for (let s = 0; s < 2; s++) DELTA[0][s] = START[s] * EMIT[s][OBS[0]]
for (let t = 1; t < T; t++)
  for (let s = 0; s < 2; s++) {
    let best = -1
    let arg = 0
    for (let p = 0; p < 2; p++) {
      const v = DELTA[t - 1][p] * TRANS[p][s]
      if (v > best) {
        best = v
        arg = p
      }
    }
    DELTA[t][s] = best * EMIT[s][OBS[t]]
    PSI[t][s] = arg
  }
const PATH: number[] = new Array(T).fill(0)
PATH[T - 1] = DELTA[T - 1][0] >= DELTA[T - 1][1] ? 0 : 1
for (let t = T - 2; t >= 0; t--) PATH[t] = PSI[t + 1][PATH[t + 1]]

export function HmmAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
    const stage = idxRef.current
    const revealCols = stage === 0 ? 0 : stage === 1 ? 1 : T
    const showPath = stage >= 3

    const leftX = 130
    const colGap = (cssW - leftX - 80) / (T - 1)
    const rowY = [110, 210]
    const colX = (t: number) => leftX + t * colGap
    const R = 30

    // 观测序列（顶部）
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let t = 0; t < T; t++) {
      ctx.fillStyle = "#f59e0b"
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.fillText(`第${t + 1}天`, colX(t), 60)
      ctx.fillStyle = FG
      ctx.font = "13px ui-sans-serif, system-ui"
      ctx.fillText(`👀${OBSN[OBS[t]]}`, colX(t), 78)
    }
    // 行标（隐状态）
    ctx.textAlign = "right"
    for (let s = 0; s < 2; s++) {
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.fillText("隐状态", leftX - R - 16, rowY[s] - 14)
      ctx.fillStyle = s === 0 ? "#f59e0b" : "#3b82f6"
      ctx.font = "600 14px ui-sans-serif, system-ui"
      ctx.fillText(STATES[s], leftX - R - 16, rowY[s] + 4)
    }

    // 转移边（已揭示列之间）
    for (let t = 1; t < revealCols; t++)
      for (let s = 0; s < 2; s++)
        for (let p = 0; p < 2; p++) {
          const chosen = PSI[t][s] === p
          ctx.strokeStyle = chosen ? "rgba(99,102,241,0.85)" : isDark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.16)"
          ctx.lineWidth = chosen ? 2.5 : 1
          ctx.beginPath()
          ctx.moveTo(colX(t - 1) + R, rowY[p])
          ctx.lineTo(colX(t) - R, rowY[s])
          ctx.stroke()
        }

    // 最优路径（回溯）
    if (showPath) {
      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 4
      ctx.beginPath()
      for (let t = 0; t < T; t++) {
        const x = colX(t)
        const y = rowY[PATH[t]]
        if (t === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 节点
    for (let t = 0; t < revealCols; t++)
      for (let s = 0; s < 2; s++) {
        const x = colX(t)
        const y = rowY[s]
        const onPath = showPath && PATH[t] === s
        ctx.beginPath()
        ctx.arc(x, y, R, 0, Math.PI * 2)
        ctx.fillStyle = onPath ? "rgba(16,185,129,0.25)" : isDark ? "#27272a" : "#f4f4f5"
        ctx.fill()
        ctx.lineWidth = onPath ? 3 : 2
        ctx.strokeStyle = onPath ? "#10b981" : s === 0 ? "#f59e0b" : "#3b82f6"
        ctx.stroke()
        ctx.fillStyle = s === 0 ? "#f59e0b" : "#3b82f6"
        ctx.font = "600 13px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(STATES[s], x, y - 7)
        ctx.fillStyle = FG
        ctx.font = "600 11px ui-monospace, monospace"
        ctx.fillText(DELTA[t][s].toFixed(t === 0 ? 2 : 4), x, y + 10)
      }

    // 结论
    if (showPath) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(`最可能的天气序列：${PATH.map((p) => STATES[p]).join(" → ")}`, cssW / 2, cssH - 20)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("隐马尔可夫：由观测反推隐状态 · 维特比逐列填最大概率路径", 118, 28)
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
        text: "隐马尔可夫模型里,背后有一串看不见的「隐状态」,比如今天到底是晴还是雨,我们看不到;能看到的只是它发出的「观测」,比如朋友今天选择散步、购物还是打扫。已知这三天朋友干了什么,我们要反过来推测,最可能的天气序列是什么。",
      },
      {
        apply: () => setIdx(1),
        text: "维特比算法从左往右填这张网格。每个格子记一个数:走到这个状态、最可能的那条路径有多大概率。第一列没有前一天,就用初始概率乘上发射概率——比如晴天本来概率高、晴天又爱散步,所以第一天晴的得分明显比雨高。",
      },
      {
        apply: () => setIdx(2),
        text: "往后每一列,每个状态都要从上一列的两个格子里,挑一条乘上转移概率后最大的接上来,再乘这一天的发射概率。蓝色的粗线,就记下了「我是从谁那儿来的」,这一步叫记录来路。",
      },
      {
        apply: () => setIdx(3),
        text: "填到最后一列,挑出概率最大的那个格子,然后顺着蓝色来路一路往回走,就得到了最可能的隐藏天气序列:晴、雨、雨。这套「逐列保留最优、最后回溯」的思路,就是维特比算法,语音识别和词性标注都靠它把观测翻译回隐藏序列。",
      },
    ],
  })

  const caption = [
    "HMM：隐状态(天气)看不见，只能看到观测(朋友活动)。目标：由观测反推最可能的隐状态序列。",
    "维特比第 1 列：δ = 初始概率 × 发射概率。晴天得分高于雨天。",
    "逐列递推：每格从上一列挑「最大×转移」再乘发射，蓝线记下来路(backpointer)。",
    `回溯：末列取最大、顺来路返回 → 最可能序列 ${PATH.map((p) => STATES[p]).join("、")}。语音识别/词性标注同理。`,
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
          {["问题", "第1列", "递推", "回溯路径"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=来路 · 绿=最优隐藏序列</span>
        </div>
      )}
    </div>
  )
}
