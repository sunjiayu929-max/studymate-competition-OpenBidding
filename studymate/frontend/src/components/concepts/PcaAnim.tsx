/**
 * 概念动画 · 主成分分析 PCA（机器学习）
 * ------------------------------------------------------------------
 * 真实 2×2 协方差矩阵特征分解（闭式解）：
 *   - 一团有相关性的二维点 → 求散得最开的方向（第一主成分 PC1）
 *   - 投影到某方向 u 的方差 = uᵀ·C·u（精确算）；扫一圈方向、方差在 PC1 处最大
 *   - 把点投影到 PC1：二维降成一维，保留绝大部分方差
 *   ▶播放 / ⏸暂停 / ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const N = 46
const CX = 5
const CY = 5

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface Pt {
  x: number
  y: number
}

interface Model {
  pts: Pt[]
  mean: Pt
  cov: { sxx: number; syy: number; sxy: number }
  pcaDeg: number // PC1 方向角(度)
  l1: number // 较大特征值（PC1 方差）
  l2: number // 较小特征值（PC2 方差）
  ratio: number // PC1 解释的方差占比
}

function buildModel(): Model {
  // 沿随机主轴拉长的高斯团（主轴方差大、次轴方差小）
  const theta = ((20 + Math.random() * 50) * Math.PI) / 180
  const sMaj = 1.9
  const sMin = 0.55
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const pts: Pt[] = []
  for (let i = 0; i < N; i++) {
    const a = gauss() * sMaj
    const b = gauss() * sMin
    pts.push({ x: CX + a * ct - b * st, y: CY + a * st + b * ct })
  }
  // 样本均值
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p.x
    my += p.y
  }
  mx /= N
  my /= N
  // 协方差矩阵
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of pts) {
    const dx = p.x - mx
    const dy = p.y - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  sxx /= N
  syy /= N
  sxy /= N
  // 2×2 对称矩阵特征值（闭式）
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = tr / 2 - disc
  // PC1 特征向量：(l1 - syy, sxy) 方向（sxy≈0 时退化为坐标轴）
  let vx = l1 - syy
  let vy = sxy
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) {
    vx = 1
    vy = 0
  }
  const pcaDeg = (Math.atan2(vy, vx) * 180) / Math.PI
  return { pts, mean: { x: mx, y: my }, cov: { sxx, syy, sxy }, pcaDeg, l1, l2, ratio: l1 / (l1 + l2) }
}

// 投影到方向角 deg 的方差 = uᵀ C u（精确）
function projVar(cov: { sxx: number; syy: number; sxy: number }, deg: number): number {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return c * c * cov.sxx + 2 * c * s * cov.sxy + s * s * cov.syy
}

export function PcaAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  // stage: 0=原始点云  1=扫描找方向  2=锁定 PC1+投影降维
  const [info, setInfo] = useState<{ stage: number; scanDeg: number; varNow: number; done: boolean }>({
    stage: 0,
    scanDeg: 0,
    varNow: 0,
    done: false,
  })

  const modelRef = useRef<Model>(buildModel())
  const stageRef = useRef(0)
  const scanRef = useRef(0) // 当前扫描方向角
  const bestRef = useRef({ deg: 0, v: -1 }) // 扫描中遇到的最大方差方向
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const init = useCallback(() => {
    modelRef.current = buildModel()
    stageRef.current = 0
    scanRef.current = modelRef.current.pcaDeg - 90 // 从 PC1 前 90° 起扫
    bestRef.current = { deg: 0, v: -1 }
    setInfo({ stage: 0, scanDeg: scanRef.current, varNow: projVar(modelRef.current.cov, scanRef.current), done: false })
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

    const pad = 26
    const sc = Math.min(cssW - pad * 2, cssH - pad * 2) / 10
    const ox = (cssW - sc * 10) / 2
    const oy = (cssH - sc * 10) / 2
    const sx = (x: number) => ox + x * sc
    const sy = (y: number) => cssH - oy - y * sc
    const isDark = document.documentElement.classList.contains("dark")
    const m = modelRef.current
    const stage = stageRef.current

    // 一条经过均值、沿方向角 deg 的线段（向两侧各延伸 len 个数据单位）
    const axisSeg = (deg: number, len: number) => {
      const r = (deg * Math.PI) / 180
      const dx = Math.cos(r) * len
      const dy = Math.sin(r) * len
      return [
        { x: m.mean.x - dx, y: m.mean.y - dy },
        { x: m.mean.x + dx, y: m.mean.y + dy },
      ]
    }

    // 扫描阶段：候选方向 + 把点投影到候选轴的薄影，直观看「这个方向上散得开不开」
    if (stage === 1) {
      const deg = scanRef.current
      const r = (deg * Math.PI) / 180
      const ux = Math.cos(r)
      const uy = Math.sin(r)
      // 候选轴（虚线）
      const seg = axisSeg(deg, 5.2)
      ctx.strokeStyle = isDark ? "#a78bfa" : "#7c3aed"
      ctx.lineWidth = 2
      ctx.setLineDash([6, 5])
      ctx.beginPath()
      ctx.moveTo(sx(seg[0].x), sy(seg[0].y))
      ctx.lineTo(sx(seg[1].x), sy(seg[1].y))
      ctx.stroke()
      ctx.setLineDash([])
      // 每个点 → 候选轴上的投影点（细灰线 + 紫色投影点），散开度=方差
      for (const p of m.pts) {
        const t = (p.x - m.mean.x) * ux + (p.y - m.mean.y) * uy
        const fx = m.mean.x + t * ux
        const fy = m.mean.y + t * uy
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.28)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx(p.x), sy(p.y))
        ctx.lineTo(sx(fx), sy(fy))
        ctx.stroke()
      }
      for (const p of m.pts) {
        const t = (p.x - m.mean.x) * ux + (p.y - m.mean.y) * uy
        const fx = m.mean.x + t * ux
        const fy = m.mean.y + t * uy
        ctx.fillStyle = isDark ? "#a78bfa" : "#7c3aed"
        ctx.beginPath()
        ctx.arc(sx(fx), sy(fy), 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 结果阶段：PC1 + PC2 + 投影到 PC1
    if (stage === 2) {
      const r = (m.pcaDeg * Math.PI) / 180
      const ux = Math.cos(r)
      const uy = Math.sin(r)
      // 投影连线（点 → PC1）
      for (const p of m.pts) {
        const t = (p.x - m.mean.x) * ux + (p.y - m.mean.y) * uy
        const fx = m.mean.x + t * ux
        const fy = m.mean.y + t * uy
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.32)" : "rgba(100,116,139,0.3)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx(p.x), sy(p.y))
        ctx.lineTo(sx(fx), sy(fy))
        ctx.stroke()
      }
      // PC2（短、次轴）
      const seg2 = axisSeg(m.pcaDeg + 90, Math.sqrt(m.l2) * 2.4)
      ctx.strokeStyle = isDark ? "#34d399" : "#059669"
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(sx(seg2[0].x), sy(seg2[0].y))
      ctx.lineTo(sx(seg2[1].x), sy(seg2[1].y))
      ctx.stroke()
      // PC1（长、主轴）
      const seg1 = axisSeg(m.pcaDeg, Math.sqrt(m.l1) * 2.4)
      ctx.strokeStyle = isDark ? "#f59e0b" : "#d97706"
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(sx(seg1[0].x), sy(seg1[0].y))
      ctx.lineTo(sx(seg1[1].x), sy(seg1[1].y))
      ctx.stroke()
      // 投影点（落在 PC1 上）
      for (const p of m.pts) {
        const t = (p.x - m.mean.x) * ux + (p.y - m.mean.y) * uy
        const fx = m.mean.x + t * ux
        const fy = m.mean.y + t * uy
        ctx.fillStyle = isDark ? "#fbbf24" : "#d97706"
        ctx.beginPath()
        ctx.arc(sx(fx), sy(fy), 3, 0, Math.PI * 2)
        ctx.fill()
      }
      // 轴标签
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.fillStyle = isDark ? "#fbbf24" : "#d97706"
      ctx.fillText("PC1", sx(seg1[1].x) + 4, sy(seg1[1].y))
      ctx.fillStyle = isDark ? "#34d399" : "#059669"
      ctx.fillText("PC2", sx(seg2[1].x) + 4, sy(seg2[1].y))
    }

    // 原始数据点（始终画在最上层）
    for (const p of m.pts) {
      ctx.fillStyle = isDark ? "#60a5fa" : "#2563eb"
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // 均值十字
    const mxp = sx(m.mean.x)
    const myp = sy(m.mean.y)
    ctx.strokeStyle = isDark ? "#e4e4e7" : "#27272a"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(mxp - 7, myp)
    ctx.lineTo(mxp + 7, myp)
    ctx.moveTo(mxp, myp - 7)
    ctx.lineTo(mxp, myp + 7)
    ctx.stroke()
  }, [applyViewport])

  // 主循环：扫描阶段转动候选方向、记录最大方差方向
  useEffect(() => {
    // 讲课时放慢，让「转一圈」贯穿整句旁白（避免扫描 2 秒就完、剩下大半句对着结果干讲）；交互时快些
    const SCAN_DEG_PER_S = lecture ? 9 : 36
    let last = 0
    const tick = (now: number) => {
      if (last === 0) last = now
      const dt = (now - last) / 1000
      last = now
      if (playingRef.current && stageRef.current === 1) {
        const m = modelRef.current
        scanRef.current += SCAN_DEG_PER_S * dt
        const v = projVar(m.cov, scanRef.current)
        if (v > bestRef.current.v) bestRef.current = { deg: scanRef.current, v }
        // 扫满 180°（覆盖所有方向）→ 锁定到真实 PC1
        if (scanRef.current >= m.pcaDeg + 90) {
          scanRef.current = m.pcaDeg
          stageRef.current = 2
          playingRef.current = false
          setPlaying(false)
          setInfo({ stage: 2, scanDeg: m.pcaDeg, varNow: m.l1, done: true })
        } else {
          setInfo({ stage: 1, scanDeg: scanRef.current, varNow: v, done: false })
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
    const m = modelRef.current
    if (info.done || stageRef.current === 2) {
      // 重新从扫描开始
      stageRef.current = 1
      scanRef.current = m.pcaDeg - 90
      bestRef.current = { deg: 0, v: -1 }
      setInfo({ stage: 1, scanDeg: scanRef.current, varNow: projVar(m.cov, scanRef.current), done: false })
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    if (stageRef.current === 0) {
      stageRef.current = 1
      scanRef.current = m.pcaDeg - 90
      bestRef.current = { deg: 0, v: -1 }
    }
    setPlaying((p) => !p)
  }, [info.done])

  // 仅「进入讲课」时换一组新点；replay 不换 → 讲解词数值不变、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：3 拍（找方向是过程→自动扫描；投影是结果→停在 PC1 上讲）
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
      const pct = Math.round(m.ratio * 100)
      return [
        {
          apply: () => {
            stageRef.current = 0
            setInfo({ stage: 0, scanDeg: 0, varNow: 0, done: false })
          },
          text: "这一团点有两个特征 x 和 y，但你看它们明显沿着一个斜方向拉长——说明两个特征是相关的、信息有冗余。PCA 想做的，就是找到数据散得最开的那个方向，用它来代替原来的两根坐标轴。",
        },
        {
          apply: () => {
            stageRef.current = 1
            scanRef.current = m.pcaDeg - 90
            bestRef.current = { deg: 0, v: -1 }
            setPlaying(true)
            playingRef.current = true
          },
          text: "怎么找？把所有点投影到一个方向上，看投影散得开不开——也就是方差大不大。咱们让这根紫色的轴转一圈，挨个方向试过去。你看，转到跟点云长轴对齐时，投影拉得最长、方差最大；偏离了就缩成一团。方差最大的那个方向，就是第一主成分 PC1。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            stageRef.current = 2
            scanRef.current = m.pcaDeg
            setInfo({ stage: 2, scanDeg: m.pcaDeg, varNow: m.l1, done: true })
          },
          text: `锁定 PC1（橙色这根），再取一根和它垂直的方向当 PC2。现在把每个点投影到 PC1 上，二维就压成了一维——而这一根 PC1 就保留了原始数据大约 ${pct}% 的方差。这就是降维：用更少的维度，留住数据里绝大部分的信息。`,
        },
      ]
    },
  })

  const caption = info.stage === 2
    ? `PC1（橙）= 方差最大方向，保留约 ${Math.round(modelRef.current.ratio * 100)}% 方差；点投影到 PC1 即「二维→一维」降维。`
    : info.stage === 1
      ? `扫描方向 ${info.scanDeg.toFixed(0)}°：当前投影方差 = ${info.varNow.toFixed(2)}（在 PC1 方向达到最大）。`
      : "一团沿斜方向拉长的点（两特征相关）。点「播放」让候选轴转一圈，找方差最大的方向 = PC1。"

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
          {info.stage === 2 ? `PC1 占比 ${Math.round(modelRef.current.ratio * 100)}%` : info.stage === 1 ? `方差 ${info.varNow.toFixed(2)}` : "原始数据"}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${info.stage === 2 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
          {caption}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {info.stage === 2 ? "重新扫描" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新撒点
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            橙 = PC1（主方向）· 绿 = PC2 · ✕ = 均值
          </span>
        </div>
      )}
    </div>
  )
}
