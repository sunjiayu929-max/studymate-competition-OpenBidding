/**
 * 概念动画 · 动态规划 0/1 背包（数据结构与算法）
 * ------------------------------------------------------------------
 * 真实 DP 填表：dp[i][c] = 用前 i 件物品、容量 c 时能装的最大价值
 *   不拿第 i 件：dp[i-1][c]
 *   拿第 i 件（放得下时）：dp[i-1][c-wᵢ] + vᵢ
 *   dp[i][c] = max(上面两者)
 * 一行行填，每格看「正上方」和「左上方某格」两个来源；右下角即答案。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 520
const CAP = 8 // 背包容量
const ITEMS = [
  { w: 2, v: 3 },
  { w: 3, v: 4 },
  { w: 4, v: 5 },
  { w: 5, v: 8 },
]
const N = ITEMS.length

// dp 表 (N+1) × (CAP+1)
function buildDp(): number[][] {
  const dp = Array.from({ length: N + 1 }, () => new Array(CAP + 1).fill(0))
  for (let i = 1; i <= N; i++) {
    for (let c = 0; c <= CAP; c++) {
      const { w, v } = ITEMS[i - 1]
      dp[i][c] = w > c ? dp[i - 1][c] : Math.max(dp[i - 1][c], dp[i - 1][c - w] + v)
    }
  }
  return dp
}

export function DpKnapsackAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已填格数（按 i=1..N, c=0..CAP 行优先）
  const dpRef = useRef<number[][]>(buildDp())
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

  const total = N * (CAP + 1) // 需要填的格子数（i=1..N 每行 CAP+1 格）

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
    const dp = dpRef.current
    const p = posRef.current

    // 当前正在填的格子 (curI, curC)
    const filled = p // 已填格数
    const curIdx = Math.min(filled, total - 1)
    const curI = 1 + Math.floor(curIdx / (CAP + 1))
    const curC = curIdx % (CAP + 1)
    const isCellFilled = (i: number, c: number) => i === 0 || (i - 1) * (CAP + 1) + c < filled

    const cw = 42
    const ch = 30
    const tableW = (CAP + 2) * cw // 含行首标签列
    const x0 = Math.max(150, (cssW - tableW) / 2 + 40)
    const y0 = 64

    // 列头（容量 0..CAP）
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = MUT
    ctx.fillText("容量→", x0 - cw / 2, y0 - 16)
    for (let c = 0; c <= CAP; c++) ctx.fillText(String(c), x0 + cw / 2 + (c + 1) * cw - cw, y0 - 16)

    for (let i = 0; i <= N; i++) {
      // 行头
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.fillText(i === 0 ? "0 件" : `前${i}件`, x0 - 8, y0 + ch / 2 + i * ch)
      for (let c = 0; c <= CAP; c++) {
        const cx = x0 + c * cw
        const cy = y0 + i * ch
        const cur = i === curI && c === curC && p < total
        const src1 = p < total && i === curI - 1 && c === curC // 正上方
        const src2 = p < total && i === curI - 1 && ITEMS[curI - 1] && ITEMS[curI - 1].w <= curC && c === curC - ITEMS[curI - 1].w // 左上来源
        const fill = isCellFilled(i, c)
        ctx.fillStyle = cur
          ? "rgba(245,158,11,0.85)"
          : src1
            ? "rgba(59,130,246,0.5)"
            : src2
              ? "rgba(16,185,129,0.5)"
              : fill
                ? isDark
                  ? "rgba(99,102,241,0.16)"
                  : "rgba(99,102,241,0.10)"
                : isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.03)"
        ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2)
        ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 1
        ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2)
        if (fill) {
          ctx.fillStyle = cur ? "#fff" : FG
          ctx.font = "600 13px ui-monospace, monospace"
          ctx.textAlign = "center"
          ctx.fillText(String(dp[i][c]), cx + cw / 2, cy + ch / 2)
        }
      }
    }

    // 左侧物品清单
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = MUT
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.fillText("物品(重量/价值)", 14, y0 - 4)
    ITEMS.forEach((it, k) => {
      const active = p < total && k === curI - 1
      ctx.fillStyle = active ? "#f59e0b" : FG
      ctx.font = `${active ? "600 " : ""}12px ui-monospace, monospace`
      ctx.fillText(`#${k + 1}  w=${it.w}  v=${it.v}`, 14, y0 + 16 + k * 20)
    })
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillText(`背包容量 = ${CAP}`, 14, y0 + 16 + N * 20 + 8)

    // 当前格的来源说明
    if (p < total) {
      const { w, v } = ITEMS[curI - 1]
      ctx.fillStyle = FG
      ctx.font = "12px ui-sans-serif, system-ui"
      const txt =
        w > curC
          ? `放不下#${curI}(w=${w}>${curC}) → 继承上方 ${dp[curI - 1][curC]}`
          : `max(不拿 ${dp[curI - 1][curC]}, 拿 ${dp[curI - 1][curC - w]}+${v}) = ${dp[curI][curC]}`
      ctx.fillText(txt, 14, y0 + 16 + N * 20 + 30)
    } else {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 13px ui-sans-serif, system-ui"
      ctx.fillText(`答案 dp[${N}][${CAP}] = ${dp[N][CAP]}`, 14, y0 + 16 + N * 20 + 30)
    }
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
    buildBeats: () => {
      const dp = dpRef.current
      return chunkedBeats(
        total + 1,
        [
          "0/1 背包是动态规划的招牌题:背包容量有限,每件物品有重量和价值,每件要么拿、要么不拿,问怎么选总价值最大、又不超重。",
          "解法是填一张表。行表示「只考虑前 i 件物品」,列表示「背包容量上限」,格子 dp[i][c] 就是这种情况下能装的最大价值。我们从上到下、从左到右一行行填。",
          "填每一格只问一个问题:第 i 件物品,拿还是不拿?不拿,就直接继承正上方那格(蓝色);拿,就看左上方那格——容量先腾出这件的重量、再加上它的价值(绿色)。两者取较大的填进来。",
          `就这样把表填满,右下角 dp[${N}][${CAP}]=${dp[N][CAP]} 就是答案。动态规划的精髓就在这:把大问题拆成一个个小问题,把小问题的答案存进表里反复查,避免重复计算。`,
        ],
        (i) => setPos(i)
      )
    },
  })

  const dp = dpRef.current
  const caption = done
    ? `填表完成:dp[${N}][${CAP}] = ${dp[N][CAP]} 即容量 ${CAP} 下的最大价值。DP = 拆子问题 + 存表复用,避免重复计算。`
    : pos === 0
      ? "0/1 背包:每件物品拿或不拿,求容量内最大价值。dp[i][c]=max(不拿, 拿)。点播放逐格填表。"
      : `填 dp[${Math.min(1 + Math.floor(Math.min(pos, total - 1) / (CAP + 1)), N)}][${Math.min(pos, total - 1) % (CAP + 1)}]:看正上方(蓝)和左上方(绿)两个来源,取大。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {Math.min(pos, total)} / {total}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步（下一格）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=不拿(正上) · 绿=拿(左上) · 橙=当前格</span>
        </div>
      )}
    </div>
  )
}
