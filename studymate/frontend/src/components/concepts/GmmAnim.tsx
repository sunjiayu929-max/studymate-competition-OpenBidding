/**
 * 概念动画 · 高斯混合模型 GMM / EM 算法（机器学习 · 软聚类）
 * ------------------------------------------------------------------
 * 真实 EM：假设数据由 K=2 个二维高斯混出来
 *   - E 步：算每个点属于各成分的「责任(后验概率)」——软的，骑在两团间的点颜色是混的
 *   - M 步：每个成分用「带责任权重的点」更新均值、协方差(位置/胖瘦/朝向)与混合系数
 *   - E、M 交替到稳定 → 两个高斯椭圆贴合数据
 * 比 K-Means(硬分配、只圈圆)更强：能拟合椭圆、给出软概率。录制 E/M 交替帧回放。
 *   ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const ITERS = 13
const REG = 0.06 // 协方差对角正则，防奇异
const SKY = [56, 132, 220] // 成分0
const ROSE = [225, 60, 96] // 成分1

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
interface Cov {
  a: number
  b: number
  d: number
} // [[a,b],[b,d]]
interface Comp {
  mx: number
  my: number
  cov: Cov
  w: number
}
interface Frame {
  resp1: number[] // 每个点属于成分1的责任
  comps: Comp[]
  phase: "E" | "M" | "init"
}
interface Model {
  pts: Pt[]
  frames: Frame[]
}

// 沿主轴拉长的高斯团
function blob(cx: number, cy: number, sMaj: number, sMin: number, deg: number, n: number): Pt[] {
  const t = (deg * Math.PI) / 180
  const ct = Math.cos(t)
  const st = Math.sin(t)
  return Array.from({ length: n }, () => {
    const a = gauss() * sMaj
    const b = gauss() * sMin
    return { x: cx + a * ct - b * st, y: cy + a * st + b * ct }
  })
}

function pdf(p: Pt, c: Comp): number {
  const dx = p.x - c.mx
  const dy = p.y - c.my
  const det = c.cov.a * c.cov.d - c.cov.b * c.cov.b
  const di = Math.max(det, 1e-6)
  // 二次型 dxᵀ Σ⁻¹ dx
  const q = (dx * dx * c.cov.d - 2 * dx * dy * c.cov.b + dy * dy * c.cov.a) / di
  return Math.exp(-0.5 * q) / (2 * Math.PI * Math.sqrt(di))
}

function buildModel(): Model {
  const pts = [...blob(3.7, 5.4, 1.7, 0.6, 18, 30), ...blob(6.4, 4.6, 0.65, 1.5, -12, 30)]
  const n = pts.length
  // 初始成分：随机两点当均值、单位协方差
  const i0 = Math.floor(Math.random() * n)
  let i1 = Math.floor(Math.random() * n)
  while (i1 === i0) i1 = Math.floor(Math.random() * n)
  let comps: Comp[] = [
    { mx: pts[i0].x, my: pts[i0].y, cov: { a: 1.3, b: 0, d: 1.3 }, w: 0.5 },
    { mx: pts[i1].x, my: pts[i1].y, cov: { a: 1.3, b: 0, d: 1.3 }, w: 0.5 },
  ]
  const respOf = (): number[] =>
    pts.map((p) => {
      const p0 = comps[0].w * pdf(p, comps[0])
      const p1 = comps[1].w * pdf(p, comps[1])
      const s = p0 + p1
      return s > 0 ? p1 / s : 0.5
    })
  const frames: Frame[] = []
  let resp1 = respOf()
  frames.push({ resp1: [...resp1], comps: structuredClone(comps), phase: "init" })

  for (let it = 0; it < ITERS; it++) {
    // ===== M 步 =====
    const next: Comp[] = []
    for (let k = 0; k < 2; k++) {
      const r = pts.map((_, i) => (k === 0 ? 1 - resp1[i] : resp1[i]))
      const Nk = r.reduce((a, b) => a + b, 0) || 1e-9
      const mx = pts.reduce((s, p, i) => s + r[i] * p.x, 0) / Nk
      const my = pts.reduce((s, p, i) => s + r[i] * p.y, 0) / Nk
      let a = 0
      let b = 0
      let d = 0
      for (let i = 0; i < n; i++) {
        const dx = pts[i].x - mx
        const dy = pts[i].y - my
        a += r[i] * dx * dx
        b += r[i] * dx * dy
        d += r[i] * dy * dy
      }
      next.push({ mx, my, cov: { a: a / Nk + REG, b: b / Nk, d: d / Nk + REG }, w: Nk / n })
    }
    comps = next
    frames.push({ resp1: [...resp1], comps: structuredClone(comps), phase: "M" })
    // ===== E 步 =====
    resp1 = respOf()
    frames.push({ resp1: [...resp1], comps: structuredClone(comps), phase: "E" })
  }
  return { pts, frames }
}

// 2×2 协方差 → 椭圆参数（半轴 + 旋转角，数据坐标）
function ellipseOf(cov: Cov, kSigma: number): { rMaj: number; rMin: number; ang: number } {
  const { a, b, d } = cov
  const tr = a + d
  const disc = Math.sqrt(Math.max(0, ((a - d) / 2) ** 2 + b * b))
  const l1 = tr / 2 + disc
  const l2 = Math.max(1e-6, tr / 2 - disc)
  let ang: number
  if (Math.abs(b) < 1e-9) ang = a >= d ? 0 : Math.PI / 2
  else ang = Math.atan2(l1 - a, b) // 主特征向量 (b, l1-a)
  return { rMaj: Math.sqrt(l1) * kSigma, rMin: Math.sqrt(l2) * kSigma, ang }
}

export function GmmAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const modelRef = useRef<Model>(buildModel())
  const idxRef = useRef(0)
  const playingRef = useRef(playing)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

  const init = useCallback(() => {
    modelRef.current = buildModel()
    setIdx(0)
    idxRef.current = 0
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const total = modelRef.current.frames.length
  const atEnd = idx >= total - 1

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
    const pad = 22
    const sc = Math.min(cssW - pad * 2, cssH - pad * 2) / 10
    const ox = (cssW - sc * 10) / 2
    const oy = (cssH - sc * 10) / 2
    const sx = (x: number) => ox + x * sc
    const sy = (y: number) => cssH - oy - y * sc
    const isDark = document.documentElement.classList.contains("dark")
    const m = modelRef.current
    const f = m.frames[Math.min(idxRef.current, m.frames.length - 1)]
    const compCol = [SKY, ROSE]

    // 椭圆（每个成分 1.6σ 等概率轮廓）
    f.comps.forEach((c, k) => {
      const e = ellipseOf(c.cov, 1.6)
      const col = compCol[k]
      ctx.save()
      ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${isDark ? 0.1 : 0.08})`
      ctx.lineWidth = 2.2
      ctx.beginPath()
      // 数据坐标旋转 ang → 屏幕 y 翻转，旋转取负
      ctx.ellipse(sx(c.mx), sy(c.my), e.rMaj * sc, e.rMin * sc, -e.ang, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    })

    // 点（按责任在 SKY↔ROSE 间混色 → 软分配）
    m.pts.forEach((p, i) => {
      const r = f.resp1[i]
      const cr = Math.round(SKY[0] + (ROSE[0] - SKY[0]) * r)
      const cg = Math.round(SKY[1] + (ROSE[1] - SKY[1]) * r)
      const cb = Math.round(SKY[2] + (ROSE[2] - SKY[2]) * r)
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`
      ctx.strokeStyle = isDark ? "#18181b" : "#fff"
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 4.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })

    // 成分中心十字
    f.comps.forEach((c, k) => {
      const col = compCol[k]
      const x = sx(c.mx)
      const y = sy(c.my)
      ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x - 7, y)
      ctx.lineTo(x + 7, y)
      ctx.moveTo(x, y - 7)
      ctx.lineTo(x, y + 7)
      ctx.stroke()
    })
  }, [applyViewport])

  useEffect(() => {
    const STEP_MS = 460
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        const last = modelRef.current.frames.length - 1
        if (idxRef.current >= last) {
          playingRef.current = false
          setPlaying(false)
        } else {
          idxRef.current += 1
          setIdx(idxRef.current)
        }
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (playingRef.current) return
    const last = modelRef.current.frames.length - 1
    setIdx((i) => Math.min(last, i + 1))
  }, [])
  const togglePlay = useCallback(() => {
    const last = modelRef.current.frames.length - 1
    if (idxRef.current >= last) {
      setIdx(0)
      idxRef.current = 0
      requestAnimationFrame(() => {
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [])

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
    buildBeats: () =>
      chunkedBeats(
        modelRef.current.frames.length,
        [
          "高斯混合模型假设：这堆数据其实是几个高斯分布混在一起生成的。这里设 2 个成分，先随便放下两个高斯——就是这两个椭圆，位置和形状都还不对。",
          "E 步，算「责任」：每个点分别属于两个成分的后验概率。注意它和 K-Means 最大的不同——不是非此即彼，而是软的：骑在两团中间的点，颜色是蓝红混着的，表示它两边都沾一点。",
          "M 步，更新成分：每个高斯用「带责任权重」的点，重新算自己的中心、还有协方差——所以椭圆的位置、胖瘦、连倾斜朝向都在变，去贴合属于自己的那片点。",
          "E、M 两步就这么交替：算责任、更新高斯、再算责任……直到稳定，两个椭圆刚好罩住两团数据。比起 K-Means 只能圈正圆、还硬性二选一，高斯混合能拟合带朝向的椭圆、给出软概率——这就是 GMM。",
        ],
        (i) => setIdx(i)
      ),
  })

  const f = modelRef.current.frames[Math.min(idx, total - 1)]
  const caption = atEnd
    ? "EM 收敛：两个高斯椭圆贴合数据，点按软概率着色。GMM 比 K-Means 强在：拟合椭圆形簇 + 给出软分配概率。"
    : idx === 0
      ? "两个高斯成分(椭圆)随机初始化。点「播放」看 EM 交替「E 算责任 / M 更新高斯」逐步贴合数据。"
      : f.phase === "M"
        ? "M 步：每个高斯用带责任权重的点更新中心与协方差(椭圆位置/形状/朝向都在变)。"
        : "E 步：算每个点属于各成分的责任(后验概率)，软着色——骑在中间的点颜色是混的。"

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
          {idx === 0 ? "init" : f.phase} · {Math.min(idx, total - 1)}/{total - 1}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${atEnd ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
          {caption}
        </div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || atEnd}>
            <SkipForward className="size-4" /> 单步(E/M)
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新撒点
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            椭圆=高斯成分 · 点色=软分配(蓝↔红) · ✕=成分中心
          </span>
        </div>
      )}
    </div>
  )
}
