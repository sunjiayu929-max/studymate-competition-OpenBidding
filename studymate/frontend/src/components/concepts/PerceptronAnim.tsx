/**
 * 概念动画 · 感知机 Perceptron（机器学习）
 * ------------------------------------------------------------------
 * 真实感知机学习算法（神经网络的鼻祖）：
 *   - 逐个检查样本，遇到「分错」的点就更新权重 w ← w + η·y·x、b ← b + η·y
 *   - 每次更新都让分隔线朝着把这个点纠正过来的方向转动
 *   - 当完整扫一遍都没有错分点 → 线性可分数据上保证收敛
 *   - 黄圈 = 当前正在纠正的错分点；▶播放 / ⏸暂停 / ⏭单步（纠正一个点）/ ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const COLORS = ["#f43f5e", "#0ea5e9"] // rose=类-1 / sky=类+1
const STEP_MS = 520
const SCALE = 2.5
const ETA = 0.3

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
  c: number // 0 → -1；1 → +1
}

// 两簇拉近一点（间隔变小）→ 需要更多次纠正，讲课才有「一个个纠正」的过程可看
function genRaw(): P[] {
  const centers = [
    [3.6, 4.4],
    [6.4, 5.6],
  ]
  const pts: P[] = []
  centers.forEach(([cx, cy], ci) => {
    for (let i = 0; i < 12; i++) {
      pts.push({ x: clampW(cx + gauss() * 0.82), y: clampW(cy + gauss() * 0.82), c: ci })
    }
  })
  return pts
}

// 纯模拟：这组点上感知机收敛需要纠正几次（不可分则返回 Infinity）。用于挑「有过程又能收敛」的数据。
function countCorrections(pts: P[]): number {
  let w0 = 0
  let w1 = 0
  let b = 0
  let scan = 0
  let clean = 0
  let updates = 0
  const n = pts.length
  const fx = (x: number) => (x - 5) / SCALE
  const fy = (y: number) => (y - 5) / SCALE
  for (let guard = 0; guard < 20000; guard++) {
    const p = pts[scan % n]
    const y = p.c === 1 ? 1 : -1
    const pred = w0 * fx(p.x) + w1 * fy(p.y) + b
    scan = (scan + 1) % n
    if (y * pred <= 0) {
      w0 += ETA * y * fx(p.x)
      w1 += ETA * y * fy(p.y)
      b += ETA * y
      updates++
      clean = 0
    } else {
      clean++
      if (clean >= n) return updates // 扫满一圈无错 → 收敛
    }
  }
  return Infinity // 没收敛（线性不可分）
}

// 重抽到「线性可分 + 纠正 4~14 次」→ 保证收敛、且讲课有个真过程可看
function genPoints(): P[] {
  for (let t = 0; t < 300; t++) {
    const pts = genRaw()
    const c = countCorrections(pts)
    if (c >= 4 && c <= 14) return pts
  }
  return genRaw()
}

export function PerceptronAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<{ updates: number; cur: number; done: boolean }>({
    updates: 0,
    cur: -1,
    done: false,
  })

  const ptsRef = useRef<P[]>([])
  const wRef = useRef<[number, number]>([0, 0])
  const bRef = useRef(0)
  const scanRef = useRef(0) // 下一个要检查的样本下标
  const cleanRef = useRef(0) // 连续检查通过的样本数（达到 n → 收敛）
  const updatesRef = useRef(0)
  const curRef = useRef(-1)
  const doneRef = useRef(false)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const fx = (x: number) => (x - 5) / SCALE
  const fy = (y: number) => (y - 5) / SCALE

  const init = useCallback(() => {
    ptsRef.current = genPoints()
    wRef.current = [0, 0]
    bRef.current = 0
    scanRef.current = 0
    cleanRef.current = 0
    updatesRef.current = 0
    curRef.current = -1
    doneRef.current = false
    setInfo({ updates: 0, cur: -1, done: false })
  }, [])

  useEffect(() => {
    init()
  }, [init, seed])

  // 一步 = 找到下一个错分点并纠正一次（若扫满一圈无错则收敛）
  const step = useCallback(() => {
    if (doneRef.current) return
    const pts = ptsRef.current
    const n = pts.length
    let [w0, w1] = wRef.current
    let b = bRef.current
    let scanned = 0
    while (scanned < n) {
      const i = scanRef.current % n
      const p = pts[i]
      const y = p.c === 1 ? 1 : -1
      const pred = w0 * fx(p.x) + w1 * fy(p.y) + b
      scanRef.current = (scanRef.current + 1) % n
      scanned++
      if (y * pred <= 0) {
        // 错分 → 纠正
        w0 += ETA * y * fx(p.x)
        w1 += ETA * y * fy(p.y)
        b += ETA * y
        wRef.current = [w0, w1]
        bRef.current = b
        updatesRef.current += 1
        cleanRef.current = 0
        curRef.current = i
        setInfo({ updates: updatesRef.current, cur: i, done: false })
        return
      }
      cleanRef.current += 1
      if (cleanRef.current >= n) {
        doneRef.current = true
        curRef.current = -1
        playingRef.current = false
        setPlaying(false)
        setInfo({ updates: updatesRef.current, cur: -1, done: true })
        return
      }
    }
  }, [])

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
    const hasLine = w0 !== 0 || w1 !== 0

    // 分隔线 w·f+b=0（裁剪在绘图区内）
    if (hasLine) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(pad, pad, plotW, plotH)
      ctx.clip()
      ctx.strokeStyle = isDark ? "#fafafa" : "#27272a"
      ctx.lineWidth = 2.6
      ctx.beginPath()
      if (Math.abs(w1) >= Math.abs(w0)) {
        const yAt = (x: number) => (-(w0 * fx(x) + b) / w1) * SCALE + 5
        ctx.moveTo(sx(0), sy(yAt(0)))
        ctx.lineTo(sx(10), sy(yAt(10)))
      } else {
        const xAt = (y: number) => (-(w1 * fy(y) + b) / w0) * SCALE + 5
        ctx.moveTo(sx(xAt(0)), sy(0))
        ctx.lineTo(sx(xAt(10)), sy(10))
      }
      ctx.stroke()
      ctx.restore()
    }

    // 数据点（当前纠正点加黄圈脉冲）
    pts.forEach((p, i) => {
      const isCur = i === curRef.current
      if (isCur) {
        ctx.beginPath()
        ctx.arc(sx(p.x), sy(p.y), 11, 0, Math.PI * 2)
        ctx.strokeStyle = "#facc15"
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), 5, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.fill()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.85)"
      ctx.stroke()
    })
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      // 讲课模式放慢节奏：每次纠正停留更久，黄圈看得清、跟得上老师的话（真老师不会唰唰飞过）
      const ms = lecture ? 1500 : STEP_MS
      if (playingRef.current && !doneRef.current && now - lastRef.current > ms) {
        lastRef.current = now
        step()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, step, lecture])

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

  // 「换一组新点」只在「进入讲课」时做一次；replay 不换 → 数字一致、语音缓存命中
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：自动播放——念这段话时，感知机一个个真实地纠正错分点（黄圈逐个出现、线在转），而不是跳过去。
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
      // 先模拟到收敛拿真实纠正次数；跑完复位（不动数据），播放时一个个真实纠正
      const resetP = () => {
        wRef.current = [0, 0]
        bRef.current = 0
        scanRef.current = 0
        cleanRef.current = 0
        updatesRef.current = 0
        curRef.current = -1
        doneRef.current = false
      }
      resetP()
      let g = 0
      while (!doneRef.current && g++ < 3000) step()
      const updatesF = updatesRef.current
      resetP()
      setInfo({ updates: 0, cur: -1, done: false })
      return [
        {
          apply: () => {},
          text: "感知机是怎么从一片空白、自己学会画出一条分界线的？咱们一步一步来看。一开始它手里什么都没有，连线都还没画出来。",
        },
        {
          // 只纠正第一个分错点 → 黄圈停在这里、把这一个讲透（不连播）
          apply: () => {
            step()
          },
          text: "它挨个检查这些点。诶，你看现在被黄圈圈住的这一个——它分错了，落在了分界线错误的那一侧。感知机的办法很直接：把分界线朝着能纠正它的方向推过去。看，线就转到了这里，这个点现在分对了。",
        },
        {
          // 剩下的自动播放，但讲课模式已放慢到 1500ms/步，看得清
          apply: () => {
            setPlaying(true)
            playingRef.current = true
          },
          text: "接下来就是重复这件事：每碰到一个分错的点，就把它圈出来，再把线往那个方向推一点。它一遍一遍地扫，慢慢地把这条线，调到能把两类分开的位置。",
        },
        {
          apply: () => {
            setPlaying(false)
            playingRef.current = false
            let h = 0
            while (!doneRef.current && h++ < 3000) step()
          },
          text: `直到扫完一整圈，再也找不到一个分错的点，它就收敛了。这一轮一共纠正了 ${updatesF} 次，两类被一条直线干干净净地分开。只要数据本身能用一条直线分开，感知机就一定学得会——这就是它最了不起的地方。`,
        },
      ]
    },
  })

  const caption = info.done
    ? `收敛：扫一整遍再无错分点，${info.updates} 次更新后两类被完全分开。线性可分数据上感知机保证收敛。`
    : info.updates === 0
      ? "感知机：从一条「白板」直线开始，每遇到一个分错的点，就把线朝纠正它的方向推一下。点播放。"
      : `第 ${info.updates} 次更新：黄圈是刚被纠正的错分点，w ← w + η·y·x 让分隔线朝它转过去。`

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
          更新 {info.updates} 次
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
        <Button size="sm" variant="outline" onClick={step} disabled={playing || info.done}>
          <SkipForward className="size-4" /> 单步（纠正一个点）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">黑线 = 分隔线 · 黄圈 = 当前纠正的错分点</span>
      </div>
      )}
    </div>
  )
}
