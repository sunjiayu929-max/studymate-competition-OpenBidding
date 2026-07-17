/**
 * 概念动画 · 堆 / 二叉堆 Heap（数据结构与算法 · 最大堆）
 * ------------------------------------------------------------------
 * 完全二叉树 + 数组存储：下标 i 的孩子是 2i+1、2i+2，父亲是 (i-1)/2。
 * 最大堆：每个父节点 ≥ 孩子。插入 = 放到末尾再「上浮」：
 *   与父亲比，比父亲大就交换，一路浮到不再大为止 → 堆性质恢复。
 * 树 + 数组对照，逐步看插入与上浮。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 750
const KEYS = [5, 9, 3, 12, 8, 15, 7]

interface Frame {
  arr: number[]
  cur: number // 当前活跃节点
  par: number // 比较的父亲（-1 无）
  act: "place" | "cmp" | "swap" | "done"
  note: string
}
function buildFrames(): Frame[] {
  const frames: Frame[] = []
  const a: number[] = []
  for (const k of KEYS) {
    a.push(k)
    let i = a.length - 1
    frames.push({ arr: [...a], cur: i, par: -1, act: "place", note: `插入 ${k}：放到数组末尾（树的最后一个位置）` })
    while (i > 0) {
      const p = (i - 1) >> 1
      frames.push({ arr: [...a], cur: i, par: p, act: "cmp", note: `比较 ${a[i]} 与父亲 ${a[p]}` })
      if (a[i] > a[p]) {
        ;[a[i], a[p]] = [a[p], a[i]]
        frames.push({ arr: [...a], cur: p, par: i, act: "swap", note: `${a[p]} > ${a[i]}，上浮：交换` })
        i = p
      } else {
        frames.push({ arr: [...a], cur: i, par: p, act: "done", note: `${a[i]} ≤ ${a[p]}，停止上浮` })
        break
      }
    }
    if (i === 0) frames.push({ arr: [...a], cur: 0, par: -1, act: "done", note: `${a[0]} 浮到堆顶` })
  }
  return frames
}

export function HeapAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const framesRef = useRef<Frame[]>(buildFrames())
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  const total = framesRef.current.length

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
    const f = framesRef.current[Math.min(posRef.current, total - 1)]
    const a = f.arr
    const n = a.length

    // 树布局
    const top = 64
    const levelGap = 58
    const R = 17
    const nodePos = (i: number): [number, number] => {
      const L = Math.floor(Math.log2(i + 1))
      const cnt = 2 ** L
      const posInL = i - (cnt - 1)
      const x = ((posInL + 0.5) / cnt) * (cssW - 80) + 40
      return [x, top + L * levelGap]
    }

    // 边
    for (let i = 1; i < n; i++) {
      const p = (i - 1) >> 1
      const [x1, y1] = nodePos(i)
      const [x2, y2] = nodePos(p)
      ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    // 节点
    for (let i = 0; i < n; i++) {
      const [x, y] = nodePos(i)
      const isCur = i === f.cur
      const isPar = i === f.par
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fillStyle = isCur
        ? f.act === "swap"
          ? "#10b981"
          : "#f59e0b"
        : isPar
          ? "#3b82f6"
          : i === 0
            ? isDark
              ? "#4338ca"
              : "#6366f1"
            : isDark
              ? "#312e81"
              : "#a5b4fc"
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)"
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "600 14px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(a[i]), x, y)
    }

    // 数组视图（底部）
    const cw = Math.min(40, (cssW - 80) / KEYS.length)
    const ax0 = (cssW - KEYS.length * cw) / 2
    const ay = cssH - 56
    ctx.textBaseline = "middle"
    for (let i = 0; i < KEYS.length; i++) {
      const x = ax0 + i * cw
      const has = i < n
      const isCur = i === f.cur && has
      const isPar = i === f.par && has
      ctx.fillStyle = isCur ? (f.act === "swap" ? "rgba(16,185,129,0.85)" : "rgba(245,158,11,0.85)") : isPar ? "rgba(59,130,246,0.7)" : has ? (isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.12)") : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
      ctx.fillRect(x + 1, ay, cw - 2, 28)
      ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = 1
      ctx.strokeRect(x + 1, ay, cw - 2, 28)
      if (has) {
        ctx.fillStyle = isCur ? "#fff" : FG
        ctx.font = "600 13px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.fillText(String(a[i]), x + cw / 2, ay + 14)
      }
      ctx.fillStyle = MUT
      ctx.font = "10px ui-monospace, monospace"
      ctx.fillText(String(i), x + cw / 2, ay + 40)
    }
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.fillText("数组：", ax0 - 8, ay + 14)

    // 动作说明
    ctx.fillStyle = f.act === "swap" ? "#10b981" : FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(f.note, cssW / 2, 30)
  }, [total, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total - 1) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total - 1
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total - 1) setPos((p) => p + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (done) {
      setPos(0)
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
        total,
        [
          "堆是一棵完全二叉树,但用数组来存:下标 i 的左右孩子是 2i+1 和 2i+2,父亲是 (i-1)/2。我们建的是最大堆,要求每个父节点都不小于它的孩子。",
          "插入一个新元素,先把它放到数组的最末尾,也就是树的最后一个位置。这时候它可能比父亲大、破坏了堆的性质。",
          "于是「上浮」:拿它和父亲比,只要比父亲大,就和父亲交换,往上挪一层;接着再跟新的父亲比。绿色就是正在交换上浮。",
          "一路浮到不再比父亲大、或者到了堆顶为止,堆的性质就修好了。最大堆的堆顶永远是最大值,取最大 O(1),插入和删除都是 O(log n)——优先队列、堆排序、求 Top-K 全靠它。",
        ],
        (i) => setPos(i)
      ),
  })

  const f = framesRef.current[Math.min(pos, total - 1)]
  const caption = done
    ? `最大堆建好：堆顶 ${f.arr[0]} 是最大值。数组下标 i 的孩子=2i+1/2i+2，父=(i-1)/2；插入靠上浮 O(log n)。`
    : pos === 0
      ? "堆=完全二叉树+数组存储，最大堆每个父≥孩子。插入放末尾再上浮。点播放。"
      : f.note

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {Math.min(pos + 1, total)} / {total}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-indigo-600 dark:text-indigo-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=当前 · 蓝=父亲 · 绿=交换上浮</span>
        </div>
      )}
    </div>
  )
}
