/**
 * 概念动画 · TCP 拥塞控制（计算机网络）
 * ------------------------------------------------------------------
 * 真实 cwnd 演化（Tahoe 式）逐轮 RTT 绘出经典锯齿：
 *   - 慢启动：cwnd 每轮翻倍（指数）直到 ssthresh
 *   - 拥塞避免：cwnd 每轮 +1（线性）
 *   - 丢包：ssthresh=cwnd/2，cwnd 重置为 1，重新慢启动
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const CAPACITY = 24 // 网络容量：cwnd 超过即丢包
const ROUNDS = 22

interface RPoint {
  round: number
  cwnd: number
  phase: "SS" | "CA"
  ssthresh: number
  loss: boolean // 这一轮发生丢包
}

function simulate(): RPoint[] {
  const pts: RPoint[] = []
  let cwnd = 1
  let ssthresh = 16
  for (let round = 1; round <= ROUNDS; round++) {
    const phase: "SS" | "CA" = cwnd < ssthresh ? "SS" : "CA"
    const next = phase === "SS" ? cwnd * 2 : cwnd + 1
    let loss = false
    if (next > CAPACITY) {
      loss = true
      pts.push({ round, cwnd, phase, ssthresh, loss })
      ssthresh = Math.max(2, Math.floor(cwnd / 2))
      cwnd = 1
    } else {
      pts.push({ round, cwnd, phase, ssthresh, loss })
      cwnd = next
    }
  }
  return pts
}

export function CongestionAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const pts = useMemo(() => simulate(), [])
  const maxCwnd = Math.max(...pts.map((p) => p.cwnd), CAPACITY)
  const [idx, setIdx] = useState(0) // 已揭示到第几轮（0=未开始）
  const [playing, setPlaying] = useState(false)
  const atEnd = idx >= pts.length

  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

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
    const isDark = document.documentElement.classList.contains("dark")
    const padL = 34
    const padR = 14
    const padT = 14
    const padB = 26
    const sx = (r: number) => padL + ((r - 1) / (ROUNDS - 1)) * (cssW - padL - padR)
    const sy = (c: number) => cssH - padB - (c / (maxCwnd + 2)) * (cssH - padT - padB)

    // 轴
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, padT)
    ctx.lineTo(padL, cssH - padB)
    ctx.lineTo(cssW - padR, cssH - padB)
    ctx.stroke()
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.fillText("cwnd", padL - 6, padT + 8)
    ctx.textAlign = "center"
    ctx.fillText("RTT 轮次 →", (cssW) / 2, cssH - 6)

    // 容量线
    ctx.strokeStyle = "rgba(239,68,68,0.5)"
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(padL, sy(CAPACITY))
    ctx.lineTo(cssW - padR, sy(CAPACITY))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "rgba(239,68,68,0.8)"
    ctx.textAlign = "left"
    ctx.fillText(`容量≈${CAPACITY}`, padL + 4, sy(CAPACITY) - 4)

    const shown = pts.slice(0, idx)
    // 连线（按相邻、丢包处断开）
    for (let i = 1; i < shown.length; i++) {
      const a = shown[i - 1]
      const b = shown[i]
      ctx.strokeStyle = b.phase === "SS" ? "#6366f1" : "#10b981"
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(sx(a.round), sy(a.cwnd))
      if (a.loss) {
        // 丢包后回到 1，画竖直下落
        ctx.lineTo(sx(b.round), sy(b.cwnd))
      } else {
        ctx.lineTo(sx(b.round), sy(b.cwnd))
      }
      ctx.stroke()
    }
    // 点
    for (const p of shown) {
      ctx.fillStyle = p.phase === "SS" ? "#6366f1" : "#10b981"
      ctx.beginPath()
      ctx.arc(sx(p.round), sy(p.cwnd), 3.5, 0, Math.PI * 2)
      ctx.fill()
      if (p.loss) {
        ctx.strokeStyle = "#ef4444"
        ctx.lineWidth = 2
        const x = sx(p.round)
        const y = sy(p.cwnd)
        ctx.beginPath()
        ctx.moveTo(x - 5, y - 5)
        ctx.lineTo(x + 5, y + 5)
        ctx.moveTo(x + 5, y - 5)
        ctx.lineTo(x - 5, y + 5)
        ctx.stroke()
      }
    }
  }, [pts, idx, maxCwnd, applyViewport])

  useEffect(() => {
    const STEP_MS = 520
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setIdx((i) => {
          if (i >= pts.length) {
            playingRef.current = false
            setPlaying(false)
            return i
          }
          return i + 1
        })
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, pts.length])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setIdx(0)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setIdx((i) => Math.min(i + 1, pts.length))
  }, [atEnd, pts.length])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIdx(0)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  // 讲课模式：4 拍讲清「慢启动→拥塞避免→丢包重置→锯齿」，曲线随讲解连续画出（音画同步）
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
        pts.length + 1,
        [
          "拥塞窗口 cwnd 决定一次能发多少数据。一开始它从 1 出发，进入慢启动：每过一轮就翻一倍，1、2、4、8……指数往上冲，快速试探网络到底能扛多少。",
          "涨到阈值 ssthresh 之后，再翻倍就太猛、容易出事，于是换成拥塞避免：每轮只加 1，小心翼翼地线性增长，慢慢逼近网络容量。",
          "可一旦 cwnd 撑过了网络容量，就丢包了！这时候 ssthresh 砍到当前的一半，cwnd 直接打回 1，从头再来一遍慢启动。",
          "于是 cwnd 就这样一次次冲高、丢包、重置，画出这条经典的锯齿曲线——这就是 TCP 一边试探带宽、一边躲避拥塞的自我调节。",
        ],
        (i) => setIdx(i)
      ),
  })

  const cur = idx > 0 ? pts[idx - 1] : null
  const caption = !cur
    ? "cwnd=拥塞窗口。点「播放」看它如何在慢启动、拥塞避免、丢包间演化出锯齿。"
    : cur.loss
      ? `第 ${cur.round} 轮：cwnd=${cur.cwnd} 触顶丢包！ssthresh 降到 ${Math.max(2, Math.floor(cur.cwnd / 2))}，cwnd 重置为 1，重新慢启动。`
      : cur.phase === "SS"
        ? `第 ${cur.round} 轮：慢启动，cwnd=${cur.cwnd}（每轮翻倍，指数增长，未到 ssthresh=${cur.ssthresh}）`
        : `第 ${cur.round} 轮：拥塞避免，cwnd=${cur.cwnd}（每轮 +1，线性增长，已超 ssthresh）`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 280, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${cur?.loss ? "text-rose-600 dark:text-rose-400 font-medium" : ""}`}>
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
          <RotateCcw className="size-4" /> 重置
        </Button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: "#6366f1" }} />慢启动
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: "#10b981" }} />拥塞避免
          </span>
        </div>
      </div>
      )}
    </div>
  )
}
