/**
 * 概念动画 · 支持向量机 SVM（机器学习）
 * ------------------------------------------------------------------
 * 真实次梯度下降训练软间隔线性 SVM（合页损失 + L2 正则）：
 *   - 实线 = 分隔超平面 w·x+b=0；两条虚线 = 间隔边界 w·x+b=±1
 *   - SVM 追求「最大间隔」：让两类离分隔线尽量远；落在间隔内/边界上的点
 *     就是支持向量（白圈高亮），它们唯一决定了这条线
 *   - HUD 实时显示间隔宽度 / 迭代次数；▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const COLORS = ["#f43f5e", "#0ea5e9"] // rose=类-1 / sky=类+1
const STEP_MS = 55
const SCALE = 2.5 // 特征标准化：f = (坐标-5)/SCALE
const LR = 0.06
const LAMBDA = 0.02 // 正则强度（越大间隔越宽、越软）
// 伪无限延伸范围（数据窗口 [0,10] 两侧各扩 EXT 倍；中心 5、半宽 5）
const EXT = 12
const EX_MIN = 5 - 5 * EXT
const EX_MAX = 5 + 5 * EXT

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clampW = (v: number) => Math.max(0.4, Math.min(9.6, v))

interface P {
  x: number
  y: number
  c: number // 0 → 标签 -1；1 → 标签 +1
}

// 两个明显可分的簇（沿对角线分开），保证有清晰的最大间隔
function genPoints(): P[] {
  const centers = [
    [3.0, 4.0],
    [7.0, 6.2],
  ]
  const pts: P[] = []
  centers.forEach(([cx, cy], ci) => {
    for (let i = 0; i < 13; i++) {
      pts.push({ x: clampW(cx + gauss() * 0.85), y: clampW(cy + gauss() * 0.85), c: ci })
    }
  })
  return pts
}

export function SvmAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ margin: number; iter: number; sv: number; done: boolean }>({
    margin: 0,
    iter: 0,
    sv: 0,
    done: false,
  })

  const ptsRef = useRef<P[]>([])
  const wRef = useRef<[number, number]>([0.01, 0.01])
  const bRef = useRef(0)
  const iterRef = useRef(0)
  const doneRef = useRef(false)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const fx = (x: number) => (x - 5) / SCALE
  const fy = (y: number) => (y - 5) / SCALE
  const label = (p: P) => (p.c === 1 ? 1 : -1)

  const stats = useCallback(() => {
    const [w0, w1] = wRef.current
    const norm = Math.hypot(w0, w1) || 1e-6
    let sv = 0
    for (const p of ptsRef.current) {
      const m = label(p) * (w0 * fx(p.x) + w1 * fy(p.y) + bRef.current)
      if (m <= 1.02) sv++
    }
    return { margin: 2 / norm, sv }
  }, [])

  const init = useCallback(() => {
    ptsRef.current = genPoints()
    wRef.current = [0.01, 0.01]
    bRef.current = 0
    iterRef.current = 0
    doneRef.current = false
    const s = stats()
    setInfo({ margin: s.margin, iter: 0, sv: s.sv, done: false })
  }, [stats])

  useEffect(() => {
    init()
  }, [init, seed])

  // 一次批量次梯度更新（Pegasos 思路）
  const gdStep = useCallback(() => {
    if (doneRef.current) return
    const pts = ptsRef.current
    const n = pts.length
    let [w0, w1] = wRef.current
    let b = bRef.current
    // 正则项梯度：λ·w
    let gw0 = LAMBDA * w0
    let gw1 = LAMBDA * w1
    let gb = 0
    for (const p of pts) {
      const y = label(p)
      const a = fx(p.x)
      const c = fy(p.y)
      // 合页损失：仅当 y(w·x+b) < 1 才有梯度 -y·x
      if (y * (w0 * a + w1 * c + b) < 1) {
        gw0 += -y * a / n
        gw1 += -y * c / n
        gb += -y / n
      }
    }
    w0 -= LR * gw0
    w1 -= LR * gw1
    b -= LR * gb
    wRef.current = [w0, w1]
    bRef.current = b
    iterRef.current += 1
    const s = stats()
    const converged = iterRef.current >= 800
    if (converged) {
      doneRef.current = true
      playingRef.current = false
      setPlaying(false)
    }
    setInfo({ margin: s.margin, iter: iterRef.current, sv: s.sv, done: doneRef.current })
  }, [stats])

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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const pad = 20
    const plotW = cssW - pad * 2
    const plotH = cssH - pad * 2
    const sx = (x: number) => pad + (x / 10) * plotW
    const sy = (y: number) => cssH - pad - (y / 10) * plotH
    const isDark = document.documentElement.classList.contains("dark")
    const pts = ptsRef.current
    const [w0, w1] = wRef.current
    const b = bRef.current

    // 伪无限：延伸区按「在分隔面哪一侧」着色成两个决策半平面（缩小时继续延伸、不空荡）；
    // 主窗口 [0,10] 跳过、保持干净不铺底色（默认视图观感不变）。
    {
      const exSpan = EX_MAX - EX_MIN
      const CN2 = 48
      const c2x = (sx(EX_MAX) - sx(EX_MIN)) / CN2
      const c2y = (sy(EX_MIN) - sy(EX_MAX)) / CN2
      for (let i = 0; i < CN2; i++) {
        for (let j = 0; j < CN2; j++) {
          const gx = EX_MIN + ((i + 0.5) / CN2) * exSpan
          const gy = EX_MIN + ((j + 0.5) / CN2) * exSpan
          if (gx > 0 && gx < 10 && gy > 0 && gy < 10) continue // 主窗口不铺底色
          const sgn = w0 * fx(gx) + w1 * fy(gy) + b
          ctx.fillStyle = sgn >= 0 ? "rgba(14,165,233,0.10)" : "rgba(244,63,94,0.10)"
          ctx.fillRect(sx(EX_MIN + (i / CN2) * exSpan), sy(EX_MIN + ((j + 1) / CN2) * exSpan), c2x + 1, c2y + 1)
        }
      }
      // 抹掉粗网格跨边界格子渗进主窗口的部分 → 主窗口保持干净透明（默认视图观感不变）
      ctx.clearRect(pad, pad, plotW, plotH)
    }

    // 画一条 w·f+b = level 的直线（f 为标准化坐标），延伸到 [EX_MIN,EX_MAX]、不裁剪 → 可延伸出绘图区
    const drawLine = (level: number, dash: number[], color: string, width: number) => {
      ctx.save()
      ctx.setLineDash(dash)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      if (Math.abs(w1) >= Math.abs(w0)) {
        const yAt = (x: number) => ((level - w0 * fx(x) - b) / w1) * SCALE + 5
        ctx.moveTo(sx(EX_MIN), sy(yAt(EX_MIN)))
        ctx.lineTo(sx(EX_MAX), sy(yAt(EX_MAX)))
      } else {
        const xAt = (y: number) => ((level - w1 * fy(y) - b) / w0) * SCALE + 5
        ctx.moveTo(sx(xAt(EX_MIN)), sy(EX_MIN))
        ctx.lineTo(sx(xAt(EX_MAX)), sy(EX_MAX))
      }
      ctx.stroke()
      ctx.restore()
    }

    // 间隔虚线 ±1 + 分隔实线 0
    drawLine(1, [6, 5], isDark ? "#71717a" : "#a1a1aa", 1.6)
    drawLine(-1, [6, 5], isDark ? "#71717a" : "#a1a1aa", 1.6)
    drawLine(0, [], isDark ? "#fafafa" : "#27272a", 2.6)

    // 数据点（支持向量加白圈）
    for (const p of pts) {
      const y = p.c === 1 ? 1 : -1
      const m = y * (w0 * fx(p.x) + w1 * fy(p.y) + b)
      const isSV = m <= 1.02
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), isSV ? 6.5 : 5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.fill()
      ctx.lineWidth = isSV ? 2.5 : 1.2
      ctx.strokeStyle = isSV ? (isDark ? "#fafafa" : "#18181b") : isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.8)"
      ctx.stroke()
    }
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && !doneRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        gdStep()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, gdStep])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setSeed((s) => s + 1)
  }, [])

  const togglePlay = useCallback(() => {
    if (doneRef.current) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [handleReset])

  // 「换一组新点」只在「进入讲课」时做一次；replay 不换 → 数字一致、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：3 拍快照。开讲时先模拟整段训练拿真实的间隔宽度/支持向量数，套进讲解词；跑完复位，播放时同步重训、与讲解词一致。
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
    buildBeats: () => {
      const resetW = () => {
        wRef.current = [0.01, 0.01]
        bRef.current = 0
        iterRef.current = 0
        doneRef.current = false
      }
      resetW()
      let g = 0
      while (!doneRef.current && g++ < 3000) gdStep()
      const sF = stats()
      resetW()
      const s0 = stats()
      setInfo({ margin: s0.margin, iter: 0, sv: s0.sv, done: false })
      return [
        {
          apply: () => {},
          text: "支持向量机也是做分类，但它有个更高的追求：不光要把两类分开，还要让分隔线离两边都尽可能远——也就是中间这条间隔带越宽越好。一开始线还没调好。",
        },
        {
          apply: () => {
            setPlaying(true)
            playingRef.current = true
          },
          text: "训练时它一边把分隔实线往两类中间推、一边把两条虚线往外撑，间隔越来越宽。间隔越宽，模型对新样本就越稳、越不容易分错。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            let h = 0
            while (!doneRef.current && h++ < 3000) gdStep()
          },
          text: `最后停在间隔最大的位置，间隔宽度大约 ${sF.margin.toFixed(2)}。注意那 ${sF.sv} 个被白圈圈住、正好贴在间隔边界上的点——它们叫支持向量，整条分隔线完全由它们决定，其它点怎么动都不影响。这就是 SVM。`,
        },
      ]
    },
  })

  const caption = info.done
    ? `训练完成：间隔宽度 ${info.margin.toFixed(2)}，共 ${info.sv} 个支持向量（白圈）。只有这些边界上的点决定了分隔线。`
    : info.iter === 0
      ? "SVM 不只想分对，还要让分隔线离两类「尽量远」——最大化间隔（两条虚线之间的宽度）。点播放。"
      : `迭代 ${info.iter} 次：合页损失推着虚线撑开间隔，落在间隔内的支持向量（${info.sv} 个）拉住这条线。`

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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-tight text-right">
          间隔 = {info.margin.toFixed(2)}
          <br />支持向量 = {info.sv}
          <br />iter = {info.iter}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {info.done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={gdStep} disabled={playing || info.done}>
          <SkipForward className="size-4" /> 单步（更新一次）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">实线 = 分隔面 · 虚线 = 间隔 · 白圈 = 支持向量</span>
      </div>
      )}
    </div>
  )
}
