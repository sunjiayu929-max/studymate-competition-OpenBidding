/**
 * 概念动画 · 进程调度 时间片轮转 RR（操作系统）
 * ------------------------------------------------------------------
 * 真实模拟 Round Robin（时间片 q=2，所有进程 0 时刻到达）：
 *   - 甘特图按时间逐拍揭示，谁在 CPU 上跑一目了然
 *   - 就绪队列实时显示轮转顺序
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const Q = 2
const PROCS = [
  { id: "P1", burst: 5 },
  { id: "P2", burst: 3 },
  { id: "P3", burst: 6 },
  { id: "P4", burst: 2 },
]
const PCOLOR: Record<string, string> = {
  P1: "#6366f1",
  P2: "#10b981",
  P3: "#f59e0b",
  P4: "#ec4899",
}

interface Seg {
  id: string
  start: number
  end: number
  remainAfter: number
  queueAfter: string[]
}

function simulate(): Seg[] {
  const rem: Record<string, number> = {}
  for (const p of PROCS) rem[p.id] = p.burst
  const queue = PROCS.map((p) => p.id)
  const segs: Seg[] = []
  let t = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    const run = Math.min(Q, rem[id])
    const start = t
    t += run
    rem[id] -= run
    if (rem[id] > 0) queue.push(id) // 没跑完，回队尾
    segs.push({ id, start, end: t, remainAfter: rem[id], queueAfter: [...queue] })
  }
  return segs
}

export function SchedulingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const segs = useMemo(() => simulate(), [])
  const total = segs[segs.length - 1].end
  const [t, setT] = useState(0) // 当前已揭示到的时间
  const [playing, setPlaying] = useState(false)
  const atEnd = t >= total

  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // 当前时间所在的段
  const curSeg = segs.find((s) => t > s.start && t <= s.end) ?? (t === 0 ? null : segs[segs.length - 1])

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
    const padL = 16
    const padR = 16
    const barY = 40
    const barH = 56
    const usableW = cssW - padL - padR
    const ux = (time: number) => padL + (time / total) * usableW

    // 甘特块（揭示到 t）
    for (const s of segs) {
      const drawnEnd = Math.min(s.end, t)
      if (drawnEnd <= s.start) continue
      const x0 = ux(s.start)
      const x1 = ux(drawnEnd)
      ctx.fillStyle = PCOLOR[s.id]
      ctx.fillRect(x0, barY, x1 - x0, barH)
      ctx.strokeStyle = isDark ? "#18181b" : "#fff"
      ctx.lineWidth = 2
      ctx.strokeRect(x0, barY, x1 - x0, barH)
      if (x1 - x0 > 16) {
        ctx.fillStyle = "#fff"
        ctx.font = "bold 12px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(s.id, (x0 + x1) / 2, barY + barH / 2)
      }
    }
    ctx.textBaseline = "alphabetic"

    // 时间刻度
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    for (let i = 0; i <= total; i++) {
      ctx.fillText(String(i), ux(i), barY + barH + 14)
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ux(i), barY)
      ctx.lineTo(ux(i), barY + barH)
      ctx.stroke()
    }

    // 当前时间游标
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ux(t), barY - 8)
    ctx.lineTo(ux(t), barY + barH + 4)
    ctx.stroke()
    ctx.fillStyle = "#ef4444"
    ctx.font = "bold 11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.fillText(`t=${t}`, ux(t), barY - 12)

    // 就绪队列
    const queue = curSeg ? curSeg.queueAfter : PROCS.map((p) => p.id)
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("就绪队列：", padL, barY + barH + 40)
    let qx = padL + 64
    const qy = barY + barH + 32
    if (queue.length === 0) {
      ctx.fillText("（空，全部完成）", qx, barY + barH + 40)
    } else {
      for (const id of queue) {
        ctx.fillStyle = PCOLOR[id]
        ctx.fillRect(qx, qy, 28, 18)
        ctx.fillStyle = "#fff"
        ctx.font = "bold 11px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(id, qx + 14, qy + 9)
        qx += 34
      }
      ctx.textBaseline = "alphabetic"
    }
  }, [segs, t, total, curSeg, applyViewport])

  useEffect(() => {
    const STEP_MS = 650
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setT((v) => {
          if (v >= total) {
            playingRef.current = false
            setPlaying(false)
            return v
          }
          return v + 1
        })
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setT(0)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setT((v) => Math.min(v + 1, total))
  }, [atEnd, total])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setT(0)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  // 讲课模式：把甘特图按时间分 4 段讲，念一句、时间游标连着走过这段（音画同步）
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
        total + 1,
        [
          "时间片轮转的规矩很简单：给每个进程固定一小段 CPU 时间——这里时间片是 2。先让 P1 上来跑两个单位，时间一到，不管它跑没跑完，立刻换下一个 P2。",
          "就这么一个接一个轮着来，P3、P4 也各跑两个单位。你看 P4 一共就需要 2，一个时间片正好跑完、走人；没跑完的呢，就乖乖回到队尾排队。",
          "排到队尾的进程，转一圈又轮回来接着跑。P1 跑完它的第二段、P2 这次只剩一个单位就结束了。CPU 就这样在还没完成的进程之间公平地转。",
          "最后剩下的零头一一跑完，所有进程都结束。时间片轮转的好处是公平、响应快，谁都不会饿死；代价是切换频繁、有点开销。",
        ],
        (i) => setT(i)
      ),
  })

  const caption =
    t === 0
      ? `4 个进程（突发时间 P1=5 P2=3 P3=6 P4=2），时间片 q=${Q}。点「播放」看 RR 如何轮转。`
      : curSeg
        ? `t=${curSeg.start}~${curSeg.end}：${curSeg.id} 占用 CPU（跑 ${curSeg.end - curSeg.start} 个单位）${
            curSeg.remainAfter > 0 ? `，还剩 ${curSeg.remainAfter} → 回队尾` : "，已完成 ✓"
          }`
        : ""

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 200, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
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
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          时间片到了就换下一个 → 公平、响应快，但上下文切换有开销
        </span>
      </div>
      )}
    </div>
  )
}
