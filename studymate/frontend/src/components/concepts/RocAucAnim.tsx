/**
 * 概念动画 · ROC 曲线与 AUC（机器学习 · 模型评估）
 * ------------------------------------------------------------------
 * 真实阈值扫描：
 *   - 一批样本，各有真实标签(正/负)和分类器打的分数
 *   - 阈值从高到低扫，分数≥阈值判为正；每纳入一个样本：正样本→TPR 上一台阶，负样本→FPR 右一台阶
 *   - 描出 ROC 阶梯曲线；AUC = 曲线下面积（梯形精确算）
 *   ▶播放（扫描）/ ⏸暂停 / ↻重置（重新打分）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const NP = 11 // 正样本数
const NN = 11 // 负样本数

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v))

interface Sample {
  score: number
  pos: boolean
  jit: number // 纵向抖动(0..1)，画散点用
}

interface Model {
  samples: Sample[] // 按分数降序
  roc: { fpr: number; tpr: number }[] // 阶梯顶点 0..N
  auc: number
}

function buildModel(): Model {
  const samples: Sample[] = []
  for (let i = 0; i < NP; i++) samples.push({ score: clamp01(0.63 + gauss() * 0.15), pos: true, jit: Math.random() })
  for (let i = 0; i < NN; i++) samples.push({ score: clamp01(0.37 + gauss() * 0.15), pos: false, jit: Math.random() })
  samples.sort((a, b) => b.score - a.score)
  // 阶梯：从(0,0)起，按分数降序纳入，正样本↑、负样本→
  const roc: { fpr: number; tpr: number }[] = [{ fpr: 0, tpr: 0 }]
  let tp = 0
  let fp = 0
  for (const s of samples) {
    if (s.pos) tp++
    else fp++
    roc.push({ fpr: fp / NN, tpr: tp / NP })
  }
  // AUC = 梯形面积
  let auc = 0
  for (let i = 1; i < roc.length; i++) {
    const dx = roc[i].fpr - roc[i - 1].fpr
    auc += dx * (roc[i].tpr + roc[i - 1].tpr) / 2
  }
  return { samples, roc, auc }
}

export function RocAucAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ prog: number; done: boolean; started: boolean }>({ prog: 0, done: false, started: false })

  const modelRef = useRef<Model>(buildModel())
  const progRef = useRef(0) // 已纳入样本数(float)，0..N
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const init = useCallback(() => {
    modelRef.current = buildModel()
    progRef.current = 0
    setInfo({ prog: 0, done: false, started: false })
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

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
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const isDark = document.documentElement.classList.contains("dark")
    const m = modelRef.current
    const N = m.samples.length
    const p = Math.max(0, Math.min(N, Math.floor(progRef.current)))
    // 当前阈值 = 最后纳入样本的分数（未开始=1）
    const thr = p === 0 ? 1 : m.samples[p - 1].score
    const POS = isDark ? "#fb7185" : "#e11d48" // rose
    const NEG = isDark ? "#38bdf8" : "#0284c7" // sky
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"

    // ===== 左：分数轴 + 阈值线 =====
    const lx0 = 44
    const lx1 = cssW * 0.44
    const lyTop = 40
    const lyBot = cssH - 40
    const scoreX = (s: number) => lx0 + s * (lx1 - lx0)
    // 轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(lx0, lyBot)
    ctx.lineTo(lx1, lyBot)
    ctx.stroke()
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = MUT
    ctx.textAlign = "center"
    for (const s of [0, 0.5, 1]) {
      ctx.fillText(s.toFixed(1), scoreX(s), lyBot + 16)
    }
    ctx.textAlign = "left"
    ctx.fillText("分类器打分 →", lx0, lyTop - 14)
    // 散点（正在上半、负在下半，纵向抖动）
    for (const s of m.samples) {
      const x = scoreX(s.score)
      const band = s.pos ? [lyTop, (lyTop + lyBot) / 2 - 6] : [(lyTop + lyBot) / 2 + 6, lyBot - 8]
      const y = band[0] + s.jit * (band[1] - band[0])
      const predPos = s.score >= thr - 1e-9 && p > 0
      ctx.fillStyle = s.pos ? POS : NEG
      ctx.globalAlpha = predPos ? 1 : 0.5
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      if (predPos) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = FG
        ctx.lineWidth = 1.4
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    // 阈值竖线
    if (p > 0 && p < N + 1) {
      const tx = scoreX(thr)
      ctx.strokeStyle = isDark ? "#fbbf24" : "#d97706"
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(tx, lyTop - 6)
      ctx.lineTo(tx, lyBot)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = isDark ? "#fbbf24" : "#d97706"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(`阈值 ${thr.toFixed(2)}`, tx, lyTop - 8)
      ctx.textAlign = "left"
    }
    // 图例
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = POS
    ctx.fillText("● 正样本", lx0, lyBot + 32)
    ctx.fillStyle = NEG
    ctx.fillText("● 负样本", lx0 + 70, lyBot + 32)
    ctx.fillStyle = MUT
    ctx.fillText("（描边=判为正）", lx0 + 140, lyBot + 32)

    // ===== 右：ROC 正方形 =====
    const side = Math.min(cssH - 80, cssW * 0.46)
    const rx0 = cssW - 24 - side
    const ry1 = cssH - 40
    const fX = (f: number) => rx0 + f * side
    const tY = (t: number) => ry1 - t * side
    // 边框 + 网格
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.strokeRect(rx0, ry1 - side, side, side)
    // 对角线（随机猜测 AUC=0.5）
    ctx.strokeStyle = isDark ? "#52525b" : "#cbd5e1"
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(fX(0), tY(0))
    ctx.lineTo(fX(1), tY(1))
    ctx.stroke()
    ctx.setLineDash([])
    // 轴标签
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText("FPR（假正率）→", rx0 + side / 2, ry1 + 18)
    ctx.save()
    ctx.translate(rx0 - 14, ry1 - side / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("TPR（真正率）↑", 0, 0)
    ctx.restore()
    ctx.textAlign = "left"
    // 已描出的 ROC 曲线 + AUC 填充
    if (p >= 1) {
      // 填充 AUC 区域（到当前为止）
      ctx.beginPath()
      ctx.moveTo(fX(0), tY(0))
      for (let i = 1; i <= p; i++) ctx.lineTo(fX(m.roc[i].fpr), tY(m.roc[i].tpr))
      ctx.lineTo(fX(m.roc[p].fpr), tY(0))
      ctx.closePath()
      ctx.fillStyle = isDark ? "rgba(251,191,36,0.16)" : "rgba(217,119,6,0.14)"
      ctx.fill()
      // 曲线
      ctx.strokeStyle = isDark ? "#fbbf24" : "#d97706"
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(fX(0), tY(0))
      for (let i = 1; i <= p; i++) ctx.lineTo(fX(m.roc[i].fpr), tY(m.roc[i].tpr))
      ctx.stroke()
      // 当前点
      const cur = m.roc[p]
      ctx.fillStyle = isDark ? "#fde68a" : "#b45309"
      ctx.beginPath()
      ctx.arc(fX(cur.fpr), tY(cur.tpr), 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // AUC 数值（完成后）
    if (p >= N) {
      ctx.fillStyle = isDark ? "#fbbf24" : "#b45309"
      ctx.font = "700 15px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(`AUC = ${m.auc.toFixed(3)}`, rx0 + side * 0.62, tY(0.22))
      ctx.textAlign = "left"
    }
  }, [applyViewport])

  // 主循环：播放时推进阈值扫描
  useEffect(() => {
    // 讲课时放慢，让阈值扫描贯穿整句旁白（避免 5 秒扫完、剩下大半句对着完整曲线干讲）；交互时快些
    const PER_S = lecture ? 1.1 : 4.5 // 每秒纳入样本数
    let last = 0
    const tick = (now: number) => {
      if (last === 0) last = now
      const dt = (now - last) / 1000
      last = now
      const N = modelRef.current.samples.length
      if (playingRef.current) {
        progRef.current = Math.min(N, progRef.current + PER_S * dt)
        if (progRef.current >= N) {
          progRef.current = N
          playingRef.current = false
          setPlaying(false)
          setInfo({ prog: N, done: true, started: true })
        } else {
          setInfo({ prog: progRef.current, done: false, started: true })
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, lecture])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])

  const togglePlay = useCallback(() => {
    const N = modelRef.current.samples.length
    if (info.done || progRef.current >= N) {
      progRef.current = 0
      setInfo({ prog: 0, done: false, started: true })
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [info.done])

  // 仅「进入讲课」时重新打分；replay 不换 → AUC 等数值不变、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：3 拍（描曲线是过程→自动扫描；AUC 是结果→停在完整曲线上讲）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
    },
    onLectureEnd,
    buildBeats: () => {
      const m = modelRef.current
      const N = m.samples.length
      return [
        {
          apply: () => {
            progRef.current = 0
            setInfo({ prog: 0, done: false, started: false })
          },
          text: "评价一个二分类器，光看准确率不够。左边每个点是一个样本，红的真为正、蓝的真为负，横轴是分类器给它打的分。问题来了：分数高于多少才判成正？这个阈值不同，对错的比例就不同。",
        },
        {
          apply: () => {
            progRef.current = 0
            setPlaying(true)
            playingRef.current = true
            setInfo({ prog: 0, done: false, started: true })
          },
          text: "那咱们干脆把阈值从最高一路调到最低，每越过一个样本就把它判成正。诶你看：越过的是个真正样本，曲线就往上跳一格——真正率 TPR 升高；越过的是个负样本，曲线就往右跳一格——假正率 FPR 升高。右边这条阶梯，就是 ROC 曲线。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            progRef.current = N
            setInfo({ prog: N, done: true, started: true })
          },
          text: `曲线下面这块面积，就是 AUC，这次等于 ${m.auc.toFixed(3)}。它越接近 1，说明分类器越能把正样本排在负样本前面；等于 0.5 就是中间那条对角线、跟瞎猜一样。ROC 和 AUC 的好处是：不管你最后挑哪个阈值，它都能衡量这个分类器整体排序的好坏。`,
        },
      ]
    },
  })

  const N = modelRef.current.samples.length
  const caption = info.done
    ? `AUC = ${modelRef.current.auc.toFixed(3)}（曲线下面积）。越接近 1 越好，0.5 = 对角线 = 瞎猜。`
    : info.started
      ? `阈值下移中：纳入 ${Math.floor(info.prog)}/${N} 个样本。正样本→TPR↑（上台阶），负样本→FPR↑（右台阶）。`
      : "左：样本按分类器打分排开（红正/蓝负）。右：ROC 方框。点「播放」把阈值从高扫到低，描出 ROC 曲线。"

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
          {info.done ? `AUC ${modelRef.current.auc.toFixed(3)}` : `${Math.floor(info.prog)}/${N}`}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.done ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
          {caption}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {info.done ? "重新扫描" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新打分
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            阈值↓ → 逐个纳入 → 描 ROC → AUC=面积
          </span>
        </div>
      )}
    </div>
  )
}
