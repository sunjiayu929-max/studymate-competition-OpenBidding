/**
 * 概念动画 · K 近邻 KNN（机器学习）
 * ------------------------------------------------------------------
 * 真实距离计算：对一个待分类的「?」查询点，按距离从近到远逐个揭示最近邻，
 * 揭满 K 个后投票，多数类即查询点的预测类别。
 *   - K 滑块：看 K 变大/变小如何改变投票结果（KNN 的核心超参）
 *   - ▶播放 / ⏸暂停 / ⏭单步（揭示下一个最近邻）/ ↻重置（重新撒点 + 新查询点）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const COLORS = ["#6366f1", "#10b981", "#f59e0b"] // indigo / emerald / amber
const CLASS_NAMES = ["A 类", "B 类", "C 类"]
const W_MIN = 0.5
const W_MAX = 9.5

interface Pt {
  x: number
  y: number
  c: number // 类别 0/1/2；查询点 = -1
}

function gauss() {
  let u = 0
  let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clampW = (v: number) => Math.max(W_MIN, Math.min(W_MAX, v))
const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

function genPoints(): Pt[] {
  const centers = [
    [3, 3.2],
    [7, 3.4],
    [5, 7],
  ]
  const pts: Pt[] = []
  centers.forEach(([cx, cy], ci) => {
    for (let i = 0; i < 10; i++) {
      pts.push({ x: clampW(cx + gauss() * 1.05), y: clampW(cy + gauss() * 1.05), c: ci })
    }
  })
  return pts
}
const genQuery = (): Pt => ({ x: clampW(3 + Math.random() * 4), y: clampW(3 + Math.random() * 3.4), c: -1 })

export function KnnAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [k, setK] = useState(5)
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(0) // 已揭示的最近邻个数 0..k
  const [voted, setVoted] = useState(false)

  const ptsRef = useRef<Pt[]>([])
  const queryRef = useRef<Pt>({ x: 5, y: 5, c: -1 })
  const orderRef = useRef<number[]>([]) // 点索引，按到查询点距离升序
  const playingRef = useRef(playing)
  const revealedRef = useRef(0)
  const votedRef = useRef(false)
  const kRef = useRef(k)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    revealedRef.current = revealed
  }, [revealed])
  useEffect(() => {
    votedRef.current = voted
  }, [voted])
  useEffect(() => {
    kRef.current = k
  }, [k])

  const init = useCallback(() => {
    const pts = genPoints()
    const q = genQuery()
    const order = pts.map((_, i) => i).sort((a, b) => dist2(pts[a], q) - dist2(pts[b], q))
    ptsRef.current = pts
    queryRef.current = q
    orderRef.current = order
    setRevealed(0)
    setVoted(false)
  }, [])

  useEffect(() => {
    init()
  }, [init, seed])

  // 改 K：未投票时实时反映；已投票则收起重来到「揭满 K」状态
  useEffect(() => {
    setVoted(false)
    setRevealed((r) => Math.min(r, k))
  }, [k])

  // 当前 K 个最近邻里的投票结果
  const tally = useCallback(() => {
    const cnt = [0, 0, 0]
    const order = orderRef.current
    const pts = ptsRef.current
    for (let i = 0; i < Math.min(kRef.current, order.length); i++) cnt[pts[order[i]].c]++
    let best = 0
    for (let i = 1; i < 3; i++) if (cnt[i] > cnt[best]) best = i
    return { cnt, best }
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
    const sx = (x: number) => pad + (x / 10) * (cssW - pad * 2)
    const sy = (y: number) => cssH - pad - (y / 10) * (cssH - pad * 2)
    const isDark = document.documentElement.classList.contains("dark")
    const q = queryRef.current
    const order = orderRef.current
    const pts = ptsRef.current
    const nRev = revealedRef.current

    // 邻域圈：以查询点为心，半径 = 当前已揭示的最远那个邻居
    if (nRev > 0) {
      const far = pts[order[nRev - 1]]
      const r = Math.sqrt(dist2(far, q))
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = isDark ? "#71717a" : "#a1a1aa"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx(q.x), sy(q.y), (r / 10) * (cssW - pad * 2), 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 已揭示邻居的连线
    for (let i = 0; i < nRev; i++) {
      const p = pts[order[i]]
      ctx.strokeStyle = COLORS[p.c]
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(sx(q.x), sy(q.y))
      ctx.lineTo(sx(p.x), sy(p.y))
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 点
    const revSet = new Set(order.slice(0, nRev))
    pts.forEach((p, i) => {
      const isNbr = revSet.has(i)
      ctx.beginPath()
      ctx.arc(sx(p.x), sy(p.y), isNbr ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[p.c]
      ctx.globalAlpha = nRev > 0 && !isNbr ? 0.4 : 1
      ctx.fill()
      if (isNbr) {
        ctx.globalAlpha = 1
        ctx.lineWidth = 2
        ctx.strokeStyle = isDark ? "#fafafa" : "#18181b"
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    })

    // 查询点
    const qx = sx(q.x)
    const qy = sy(q.y)
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.25)"
    ctx.shadowBlur = 7
    ctx.shadowOffsetY = 2
    const predicted = votedRef.current ? tally().best : -1
    ctx.fillStyle = predicted >= 0 ? COLORS[predicted] : isDark ? "#27272a" : "#fff"
    ctx.strokeStyle = predicted >= 0 ? COLORS[predicted] : isDark ? "#e4e4e7" : "#3f3f46"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(qx, qy, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = predicted >= 0 ? "#fff" : isDark ? "#e4e4e7" : "#3f3f46"
    ctx.font = "bold 12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("?", qx, qy + 0.5)
  }, [tally, applyViewport])

  // 自动播放：逐个揭示最近邻，揭满 K 个后投票
  useEffect(() => {
    const STEP_MS = 620
    const tick = (now: number) => {
      if (playingRef.current && !votedRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (revealedRef.current < Math.min(kRef.current, orderRef.current.length)) {
          setRevealed((r) => r + 1)
        } else {
          setVoted(true)
          setPlaying(false)
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
    setSeed((s) => s + 1)
  }, [])

  const handleStep = useCallback(() => {
    if (votedRef.current) return
    if (revealedRef.current < Math.min(kRef.current, orderRef.current.length)) {
      setRevealed((r) => r + 1)
    } else {
      setVoted(true)
    }
  }, [])

  const togglePlay = useCallback(() => {
    if (voted) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [voted, handleReset])

  // 「换一组新点/新问号」只在「进入讲课」时做一次；replay 不换 → 数字一致、语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：4 拍（想法 → 找最近 K 个邻居 → 投票判类 → K 的选择）。
  // 开讲时读这一轮真实的最近邻投票（各类几个、判给谁），套进讲解词（像老师真的在数）。
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
      const reveal = (n: number, v: boolean) => {
        setRevealed(n)
        revealedRef.current = n
        setVoted(v)
        votedRef.current = v
      }
      const kk = kRef.current
      const nbr = Math.min(kk, orderRef.current.length)
      const { cnt, best } = tally()
      const parts = cnt.map((n, i) => (n > 0 ? `${CLASS_NAMES[i]} ${n} 个` : null)).filter(Boolean).join("、")
      return [
        {
          apply: () => reveal(0, false),
          text: `要给这个问号点分类，KNN 的想法特别朴素：看它周围最近的几个邻居都是什么类，然后少数服从多数。这里 K 等于 ${kk}。`,
        },
        {
          apply: () => reveal(nbr, false),
          text: `先算问号到每个点的距离，从最近的开始一个个找，圈出最近的 ${kk} 个邻居，那条虚线圆圈就是这个邻域的范围。`,
        },
        {
          apply: () => reveal(nbr, true),
          text: `然后在这 ${kk} 个邻居里数一数：${parts}。${CLASS_NAMES[best]}最多，所以问号就判给 ${CLASS_NAMES[best]}。KNN 连训练都不用，来一个新点现算就行。`,
        },
        {
          apply: () => reveal(nbr, true),
          text: `K 是 KNN 唯一的关键参数：K 太小，容易被个别离群的噪声点带偏；K 太大，又会把远处不相干的点也拉进来投票。所以选一个合适的 K，很重要。`,
        },
      ]
    },
  })

  const { cnt, best } = tally()
  const caption = voted
    ? `投票结束：最近 ${k} 个邻居中 ${CLASS_NAMES[best]} 最多（${cnt.join(" : ")}）→ 「?」判为 ${CLASS_NAMES[best]}。`
    : revealed === 0
      ? `要给「?」分类：先算它到所有点的距离。点「播放」从最近的邻居开始一个个揭示。`
      : revealed < k
        ? `已找到第 ${revealed} 近的邻居（共需 K=${k} 个）。虚线圈是当前邻域范围。`
        : `最近 ${k} 个邻居都找齐了。点「播放」或「单步」开始投票。`

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
          K = {k}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${voted ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {voted ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || voted}>
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重新撒点
        </Button>
        <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] ml-1">
          K
          <input
            type="range"
            min={1}
            max={9}
            step={2}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-24 accent-indigo-500"
          />
          <span className="font-mono w-3">{k}</span>
        </label>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">? = 待分类点 · 圈住的是最近邻</span>
      </div>
      )}
    </div>
  )
}
