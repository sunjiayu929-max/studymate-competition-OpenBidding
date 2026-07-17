/**
 * 概念动画 · DBSCAN 密度聚类（机器学习 · 无监督）
 * ------------------------------------------------------------------
 * 真实 DBSCAN：
 *   - 两个参数：半径 ε、最少点数 minPts。某点 ε 内邻居数(含自己)≥minPts → 核心点
 *   - 从核心点出发 BFS：把 ε 邻域的点纳入同簇，邻居若也是核心则继续往外扩（密度可达）
 *   - 既非核心、又不在任何核心邻域里的点 → 噪声
 * 录制 BFS 过程帧回放；不用预先定 K，能发现任意形状的簇并挑出离群噪声。
 *   ▶播放 / ⏸暂停 / ⏭单步 / ↻重置（重新撒点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const EPS = 1.5
const MIN_PTS = 4
const CLUSTER_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"]

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
interface Frame {
  labels: number[] // 0=未分配 >0=簇号 -1=噪声
  cur: number // 当前正在处理(画 ε 圈)的点；-1 无
  final: boolean // 末帧：把未分配点显示为噪声
}
interface Model {
  pts: Pt[]
  core: boolean[]
  frames: Frame[]
  nClusters: number
  nNoise: number
}

function buildModel(): Model {
  const centers = [
    [3, 3.2],
    [7, 3.4],
    [5, 7],
  ]
  const pts: Pt[] = []
  for (const [cx, cy] of centers) {
    for (let i = 0; i < 12; i++) pts.push({ x: cx + gauss() * 0.55, y: cy + gauss() * 0.55 })
  }
  // 噪声点：均匀撒、且远离所有簇心
  let guard = 0
  let added = 0
  while (added < 5 && guard++ < 200) {
    const x = 0.6 + Math.random() * 8.8
    const y = 0.6 + Math.random() * 8.8
    if (centers.every(([cx, cy]) => Math.hypot(x - cx, y - cy) > 1.9)) {
      pts.push({ x, y })
      added++
    }
  }
  const n = pts.length
  // 邻居表
  const neigh: number[][] = pts.map((_, i) =>
    pts.map((_, j) => j).filter((j) => j !== i && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= EPS)
  )
  const core = neigh.map((ns) => ns.length + 1 >= MIN_PTS) // 含自己
  // BFS 录帧
  const labels = new Array(n).fill(0)
  const visited = new Array(n).fill(false)
  const frames: Frame[] = []
  const snap = (cur: number, final = false) => frames.push({ labels: [...labels], cur, final })
  snap(-1) // 初始全未分配
  let cid = 0
  for (let i = 0; i < n; i++) {
    if (visited[i] || !core[i]) continue
    cid++
    visited[i] = true
    labels[i] = cid
    snap(i)
    const queue = [...neigh[i]]
    while (queue.length) {
      const j = queue.shift() as number
      if (labels[j] === 0) labels[j] = cid // 纳入本簇（边界点也算）
      if (!visited[j]) {
        visited[j] = true
        if (core[j]) {
          for (const k of neigh[j]) if (labels[k] === 0) queue.push(k)
          snap(j) // 核心点 → 画 ε 圈继续扩
        } else {
          snap(-1) // 边界点纳入、不扩
        }
      }
    }
  }
  // 收尾：未分配 → 噪声
  let nNoise = 0
  for (let i = 0; i < n; i++)
    if (labels[i] === 0) {
      labels[i] = -1
      nNoise++
    }
  snap(-1, true)
  return { pts, core, frames, nClusters: cid, nNoise }
}

export function DbscanAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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
  const lastStepRef = useRef(0)
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
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const pad = 22
    const sc = Math.min(cssW - pad * 2, cssH - pad * 2) / 10
    const ox = (cssW - sc * 10) / 2
    const oy = (cssH - sc * 10) / 2
    const sx = (x: number) => ox + x * sc
    const sy = (y: number) => cssH - oy - y * sc
    const isDark = document.documentElement.classList.contains("dark")
    const m = modelRef.current
    const f = m.frames[Math.min(idxRef.current, m.frames.length - 1)]

    // 当前点的 ε 邻域圈
    if (f.cur >= 0) {
      const c = m.pts[f.cur]
      ctx.strokeStyle = isDark ? "rgba(165,180,252,0.9)" : "rgba(79,70,229,0.8)"
      ctx.fillStyle = isDark ? "rgba(99,102,241,0.10)" : "rgba(99,102,241,0.08)"
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.arc(sx(c.x), sy(c.y), EPS * sc, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 点
    m.pts.forEach((p, i) => {
      const lab = f.labels[i]
      const px = sx(p.x)
      const py = sy(p.y)
      if (lab > 0) {
        const col = CLUSTER_COLORS[(lab - 1) % CLUSTER_COLORS.length]
        if (m.core[i]) {
          // 核心点：实心 + 略大
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // 边界点：空心环
          ctx.fillStyle = isDark ? "#18181b" : "#fff"
          ctx.beginPath()
          ctx.arc(px, py, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = col
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(px, py, 4.5, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else if (lab < 0 || f.final) {
        // 噪声：灰色 ×
        ctx.strokeStyle = isDark ? "#71717a" : "#9ca3af"
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(px - 3.5, py - 3.5)
        ctx.lineTo(px + 3.5, py + 3.5)
        ctx.moveTo(px + 3.5, py - 3.5)
        ctx.lineTo(px - 3.5, py + 3.5)
        ctx.stroke()
      } else {
        // 未访问：灰点
        ctx.fillStyle = isDark ? "#52525b" : "#a1a1aa"
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      // 当前点描边
      if (i === f.cur) {
        ctx.strokeStyle = isDark ? "#e4e4e7" : "#27272a"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, 7, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
  }, [applyViewport])

  // 帧播放器
  useEffect(() => {
    const STEP_MS = 360
    const tick = (now: number) => {
      if (playingRef.current && now - lastStepRef.current > STEP_MS) {
        lastStepRef.current = now
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

  // 仅「进入讲课」时换一组新点；replay 不换 → 簇数/噪声数不变、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：帧式 chunkedBeats（节奏由底座按旁白时长自适应）
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
      return chunkedBeats(
        m.frames.length,
        [
          `DBSCAN 也是聚类，但它不用你提前说分几群。它只问两件事：半径 ε，和最少点数 minPts（这里是 ${MIN_PTS}）。一个点，如果以它为圆心、半径 ε 的圈里挤着至少 ${MIN_PTS} 个点，它就是个「核心点」——说明它待在稠密的地方。`,
          "聚类从一个核心点开始：把它 ε 圈里的邻居全拉进同一个簇。这些邻居里要是还有核心点，就接着从它往外扩，像感染一样一路蔓延，把连成一片的稠密区域整个圈下来。",
          "一个簇扩到再也够不到新点，就换下一个还没访问的核心点，长出一个新的簇。你看，几团稠密的点就这样被自动分了开来，颜色各不相同。",
          `最后剩下的——那些既不是核心点、又不挨着任何核心点的——就被判成噪声，用叉号标出来。这一轮分出了 ${m.nClusters} 个簇、挑出 ${m.nNoise} 个噪声点。能自动发现任意形状的簇、还能识别离群噪声，这正是 DBSCAN 比 K-Means 强的地方。`,
        ],
        (i) => setIdx(i)
      )
    },
  })

  const f = modelRef.current.frames[Math.min(idx, total - 1)]
  const caption = atEnd
    ? `完成：分出 ${modelRef.current.nClusters} 个簇 + ${modelRef.current.nNoise} 个噪声(×)。DBSCAN 不需预设 K，能发现任意形状的簇并识别离群点。`
    : idx === 0
      ? `ε=${EPS} 半径内邻居(含自己)≥${MIN_PTS} 即「核心点」。点「播放」看簇从核心点向外蔓延。`
      : f.cur >= 0
        ? "从核心点出发：把 ε 邻域的点纳入同簇；邻居中的核心点继续向外扩（密度可达）。"
        : "把边界点纳入当前簇（它不是核心、不再外扩），继续蔓延。"

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
          ε={EPS} · minPts={MIN_PTS}
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
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重新撒点
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
            实心=核心点 · 空心环=边界点 · ×=噪声
          </span>
        </div>
      )}
    </div>
  )
}
