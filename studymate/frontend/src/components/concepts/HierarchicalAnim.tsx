/**
 * 概念动画 · 层次聚类 Hierarchical Clustering（机器学习 · 聚类）
 * ------------------------------------------------------------------
 * 凝聚式(自底向上)：每点自成一簇 → 反复合并「最近的两簇」(平均连接)
 * → 直到并成一棵树。右侧树状图(dendrogram)记录谁与谁、在多高距离合并。
 * 不用预设簇数；想要几簇就在树状图上横切一刀。逐步看合并 + 建树。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 1100
const PTS: [number, number][] = [
  [1.0, 1.2],
  [1.5, 1.6],
  [0.8, 2.0],
  [4.2, 1.2],
  [4.7, 1.7],
  [4.3, 0.7],
  [2.6, 4.1],
  [3.1, 4.4],
]
const N = PTS.length
const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#a855f7", "#06b6d4", "#ef4444", "#84cc16"]
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

interface Seg {
  xa: number
  ha: number
  xb: number
  hb: number
  h: number
}
interface Built {
  segs: Seg[]
  snaps: number[][][] // snaps[step] = 各簇成员
  maxH: number
}
function build(): Built {
  let clusters: { members: number[]; x: number; h: number }[] = PTS.map((_, i) => ({ members: [i], x: i, h: 0 }))
  const segs: Seg[] = []
  const snaps: number[][][] = [clusters.map((c) => [...c.members])]
  // 平均连接距离
  const avgDist = (A: number[], B: number[]) => {
    let s = 0
    for (const a of A) for (const b of B) s += dist(PTS[a], PTS[b])
    return s / (A.length * B.length)
  }
  let maxH = 0
  while (clusters.length > 1) {
    let bi = 0
    let bj = 1
    let bd = Infinity
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = avgDist(clusters[i].members, clusters[j].members)
        if (d < bd) {
          bd = d
          bi = i
          bj = j
        }
      }
    const A = clusters[bi]
    const B = clusters[bj]
    segs.push({ xa: A.x, ha: A.h, xb: B.x, hb: B.h, h: bd })
    maxH = Math.max(maxH, bd)
    const merged = { members: [...A.members, ...B.members], x: (A.x + B.x) / 2, h: bd }
    clusters = clusters.filter((_, k) => k !== bi && k !== bj)
    clusters.push(merged)
    snaps.push(clusters.map((c) => [...c.members]))
  }
  return { segs, snaps, maxH }
}

export function HierarchicalAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已完成的合并数 0..N-1
  const bRef = useRef<Built>(build())
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

  const total = N - 1 // 合并次数

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
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const { segs, snaps, maxH } = bRef.current
    const step = Math.min(posRef.current, total)
    const snap = snaps[step]
    // 点 → 颜色（按当前簇）
    const colorOf = new Array(N).fill(MUT)
    snap.forEach((members, ci) => members.forEach((p) => (colorOf[p] = PALETTE[ci % PALETTE.length])))

    // ===== 左：散点 =====
    const half = cssW / 2
    const lpadL = 40
    const lpadT = 50
    const lw = half - lpadL - 20
    const lh = cssH - lpadT - 36
    const xs = PTS.map((p) => p[0])
    const ys = PTS.map((p) => p[1])
    const xmn = Math.min(...xs) - 0.6
    const xmx = Math.max(...xs) + 0.6
    const ymn = Math.min(...ys) - 0.6
    const ymx = Math.max(...ys) + 0.6
    const LX = (x: number) => lpadL + ((x - xmn) / (xmx - xmn)) * lw
    const LY = (y: number) => lpadT + lh - ((y - ymn) / (ymx - ymn)) * lh
    ctx.fillStyle = MUT
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`数据点（当前 ${snap.length} 簇）`, lpadL, 30)
    // 同簇连线（凸显分组）
    snap.forEach((members, ci) => {
      if (members.length < 2) return
      ctx.strokeStyle = PALETTE[ci % PALETTE.length] + "66"
      ctx.lineWidth = 1.5
      for (let a = 0; a < members.length; a++)
        for (let b = a + 1; b < members.length; b++) {
          ctx.beginPath()
          ctx.moveTo(LX(PTS[members[a]][0]), LY(PTS[members[a]][1]))
          ctx.lineTo(LX(PTS[members[b]][0]), LY(PTS[members[b]][1]))
          ctx.stroke()
        }
    })
    PTS.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(LX(p[0]), LY(p[1]), 6, 0, Math.PI * 2)
      ctx.fillStyle = colorOf[i]
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)"
      ctx.stroke()
    })

    // ===== 右：树状图 =====
    const rpadL = half + 30
    const rpadT = 50
    const rw = cssW - rpadL - 30
    const rh = cssH - rpadT - 50
    const DX = (x: number) => rpadL + (x / (N - 1)) * rw
    const DH = (h: number) => rpadT + rh - (h / (maxH * 1.1)) * rh
    ctx.fillStyle = MUT
    ctx.font = "600 12px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText("树状图 dendrogram", rpadL, 30)
    // 叶子标签
    ctx.font = "10px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = colorOf[i]
      ctx.fillText(`P${i}`, DX(i), rpadT + rh + 6)
    }
    // 已发生的合并段
    for (let s = 0; s < step; s++) {
      const sg = segs[s]
      ctx.strokeStyle = s === step - 1 ? "#f59e0b" : isDark ? "#a1a1aa" : "#52525b"
      ctx.lineWidth = s === step - 1 ? 2.5 : 1.8
      ctx.beginPath()
      ctx.moveTo(DX(sg.xa), DH(sg.ha))
      ctx.lineTo(DX(sg.xa), DH(sg.h))
      ctx.lineTo(DX(sg.xb), DH(sg.h))
      ctx.lineTo(DX(sg.xb), DH(sg.hb))
      ctx.stroke()
    }
    // y 轴（距离）
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rpadL - 6, rpadT)
    ctx.lineTo(rpadL - 6, rpadT + rh)
    ctx.stroke()
    ctx.fillStyle = MUT
    ctx.font = "9px ui-monospace, monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillText("距离", rpadL - 10, rpadT + 6)
  }, [total, applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total) setPos((p) => p + 1)
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
        total + 1,
        [
          "层次聚类有个好处:不用事先告诉它分几簇。它从底往上来——一开始,每一个点都自成一簇,八个点就是八个簇。",
          "然后每一步,找出当前距离最近的两个簇,把它们合并成一个。右边这棵树状图同步记录:谁和谁合并了、是在多高的距离上合并的——越晚合并的,横杆的高度越高,说明它们离得越远。",
          "就这样一步步并下去:挨得近的点先抱团成小簇,小簇再并成大簇,直到所有点都并进同一棵树。",
          "想要几个簇呢?在树状图上横着切一刀就行:切得低,得到的簇就多;切得高,簇就少。这种不用预设簇数、还能看清数据层次结构的能力,正是层次聚类相对 K-Means 的优势。",
        ],
        (i) => setPos(i)
      ),
  })

  const snap = bRef.current.snaps[Math.min(pos, total)]
  const caption = done
    ? "全部并成一棵树。在树状图上横切一刀即得想要的簇数(切得低→簇多，高→簇少)。无需预设 K，还能看层次。"
    : pos === 0
      ? "凝聚式层次聚类：每点自成一簇，反复合并最近两簇。点播放看合并 + 建树状图。"
      : `已合并 ${pos} 次，当前 ${snap.length} 簇。右侧树状图横杆高度=合并时两簇的距离。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {snap.length} 簇
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
            <SkipForward className="size-4" /> 单步（合并一次）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">左=散点分簇 · 右=树状图 · 颜色=当前簇</span>
        </div>
      )}
    </div>
  )
}
