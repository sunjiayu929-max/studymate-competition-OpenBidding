/**
 * 概念动画 · PR 曲线 Precision-Recall（机器学习 · 模型评估）
 * ------------------------------------------------------------------
 * 和 ROC 类似，但更适合正样本稀少的情形。横轴召回率、纵轴查准率。
 * 把样本按打分从高到低排，阈值从高往低降，每多判一个为正就算一次 (查全率, 查准率)：
 *   召回率单调上升、查准率通常震荡下降（抓得越多、混进的假阳性越多）。
 * 曲线下面积 = AP（平均精度），真实用阶梯面积算。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

// [score, label]，已按分数从高到低排
const RAW: [number, number][] = [
  [0.95, 1],
  [0.88, 1],
  [0.83, 0],
  [0.78, 0],
  [0.72, 1],
  [0.65, 0],
  [0.6, 1],
  [0.55, 0],
  [0.5, 0],
  [0.45, 1],
  [0.4, 0],
  [0.35, 0],
  [0.3, 0],
  [0.25, 0],
  [0.2, 0],
  [0.15, 0],
]
const NPOS = RAW.filter((r) => r[1] === 1).length
const PR: { prec: number; rec: number; score: number }[] = []
{
  let tp = 0
  for (let k = 1; k <= RAW.length; k++) {
    if (RAW[k - 1][1] === 1) tp++
    PR.push({ prec: tp / k, rec: tp / NPOS, score: RAW[k - 1][0] })
  }
}
let AP = 0
{
  let prevR = 0
  for (const p of PR) {
    AP += (p.rec - prevR) * p.prec
    prevR = p.rec
  }
}
const STEP_MS = 360

export function PrCurveAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [k, setK] = useState(1)
  const kRef = useRef(1)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    kRef.current = k
  }, [k])

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
    const kk = kRef.current
    const cur = PR[kk - 1]

    // ===== 左：样本按分数排（阈值线）=====
    const lx = 70
    const lTop = 56
    const lBot = cssH - 40
    const lH = lBot - lTop
    const SY = (s: number) => lBot - s * lH // 分数 0..1 映射高度
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(lx, lTop)
    ctx.lineTo(lx, lBot)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "9px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillText("分数", lx - 6, lTop - 4)
    for (let i = 0; i < RAW.length; i++) {
      const [s, lab] = RAW[i]
      const included = i < kk
      ctx.beginPath()
      ctx.arc(lx + 18, SY(s), 5, 0, Math.PI * 2)
      ctx.fillStyle = lab === 1 ? "#10b981" : isDark ? "#52525b" : "#cbd5e1"
      ctx.globalAlpha = included ? 1 : 0.4
      ctx.fill()
      ctx.globalAlpha = 1
      if (included) {
        ctx.strokeStyle = lab === 1 ? "#10b981" : "#94a3b8"
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
    // 阈值线
    const thy = SY(cur.score) + 0
    ctx.strokeStyle = "#f59e0b"
    ctx.setLineDash([5, 3])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lx - 4, thy + 0.0)
    ctx.lineTo(lx + 52, thy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "#f59e0b"
    ctx.font = "9px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(`阈值 ${cur.score.toFixed(2)}`, lx + 26, thy - 8)
    ctx.fillStyle = "#10b981"
    ctx.fillText("● 正", lx - 4, lBot + 14)
    ctx.fillStyle = isDark ? "#52525b" : "#94a3b8"
    ctx.fillText("● 负", lx + 30, lBot + 14)

    // ===== 右：PR 平面 =====
    const ox = 180
    const oy = 56
    const pw = cssW - ox - 40
    const ph = cssH - oy - 50
    const PX = (r: number) => ox + r * pw
    const PY = (p: number) => oy + (1 - p) * ph
    ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, pw, ph)
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("召回率 Recall →", ox + pw / 2, oy + ph + 8)
    ctx.save()
    ctx.translate(ox - 24, oy + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("查准率 Precision", 0, 0)
    ctx.restore()
    // 已描出的 PR 阶梯（含面积阴影）
    ctx.beginPath()
    ctx.moveTo(PX(0), PY(PR[0].prec))
    let prevR = 0
    for (let i = 0; i < kk; i++) {
      ctx.lineTo(PX(prevR), PY(PR[i].prec))
      ctx.lineTo(PX(PR[i].rec), PY(PR[i].prec))
      prevR = PR[i].rec
    }
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 2.5
    ctx.stroke()
    // 点
    for (let i = 0; i < kk; i++) {
      ctx.beginPath()
      ctx.arc(PX(PR[i].rec), PY(PR[i].prec), 3, 0, Math.PI * 2)
      ctx.fillStyle = "#6366f1"
      ctx.fill()
    }
    // 当前点
    ctx.beginPath()
    ctx.arc(PX(cur.rec), PY(cur.prec), 5, 0, Math.PI * 2)
    ctx.fillStyle = "#f59e0b"
    ctx.fill()

    // 读数
    ctx.fillStyle = FG
    ctx.font = "600 12px ui-monospace, monospace"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`查准率 ${(cur.prec * 100).toFixed(0)}%  查全率 ${(cur.rec * 100).toFixed(0)}%`, ox + 8, oy + ph - 24)
    if (kk >= RAW.length) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.fillText(`AP（平均精度）= ${AP.toFixed(3)}`, ox + 8, oy + ph - 6)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.fillText("PR 曲线：阈值下降，查全率升、查准率震荡降；面积=AP", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (kRef.current < RAW.length) setK((v) => v + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = k >= RAW.length
  const handleReset = useCallback(() => {
    setPlaying(false)
    setK(1)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setK(1)
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
        RAW.length,
        [
          "PR 曲线和 ROC 很像,但当正样本很稀少的时候,它更能反映真实表现。横轴是召回率,纵轴是查准率。我们先把所有样本,按模型打的分从高到低排好,绿色是真正的正样本,灰色是负样本。",
          "阈值从最高开始,一点点往下降。每放进一个被判为正的样本,就在右边算一次:查准率,是判为正的里头真正对的比例;查全率,是所有正样本里被抓到的比例。",
          "随着阈值降低,你看召回率一路往右升高,而查准率却在上下震荡着往下走——因为抓得越多,混进来的假阳性也越多,准头自然下降。",
          "整条曲线越往右上角凸,模型越好;曲线下的面积,就叫 AP、平均精度。在正负样本极不平衡的场景,比如欺诈检测、信息检索,PR 曲线和 AP 通常比 ROC 更靠谱。",
        ],
        (i) => setK(Math.min(RAW.length, i + 1))
      ),
  })

  const cur = PR[k - 1]
  const caption = done
    ? `扫完所有阈值，PR 曲线完成，AP（平均精度）= ${AP.toFixed(3)}。正负不平衡时比 ROC 更靠谱。`
    : `阈值 ${cur.score.toFixed(2)}：判 ${k} 个为正 → 查准率 ${(cur.prec * 100).toFixed(0)}%、查全率 ${(cur.rec * 100).toFixed(0)}%。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          阈值 {cur.score.toFixed(2)}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "降低阈值"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setK((v) => Math.min(RAW.length, v + 1))} disabled={playing || done}>
            下一步
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=正样本 · 面积=AP</span>
        </div>
      )}
    </div>
  )
}
