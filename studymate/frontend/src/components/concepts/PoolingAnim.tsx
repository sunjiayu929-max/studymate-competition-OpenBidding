/**
 * 概念动画 · 池化 Pooling（机器学习 · CNN 下采样）
 * ------------------------------------------------------------------
 * 真实池化运算：一个 2×2 窗口在特征图上以步长 2 不重叠地滑动，
 * 每个窗口取最大值（最大池化）或平均值（平均池化），写进输出图。
 *   - 6×6 输入 → 3×3 输出，尺寸减半、计算量降 4 倍
 *   - 最大池化保留最强响应（平移不变性）；平均池化做平滑
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻换输入，可切 最大/平均
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 750
const IN = 6
const POOL = 2
const OUT = IN / POOL // 3

// 输入图：左上角藏一块强响应的亮斑，让最大池化「抓住特征」看得见
function genInput(): number[][] {
  const g: number[][] = []
  for (let r = 0; r < IN; r++) {
    const row: number[] = []
    for (let c = 0; c < IN; c++) row.push(Math.round(1 + Math.random() * 4))
    g.push(row)
  }
  g[1][1] = 9
  g[0][2] = 8
  g[4][4] = 9
  return g
}

export function PoolingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已算到第几个输出格子（0..OUT*OUT）
  const [mode, setMode] = useState<"max" | "avg">("max")

  const inRef = useRef<number[][]>([])
  const posRef = useRef(0)
  const modeRef = useRef<"max" | "avg">("max")
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const init = useCallback(() => {
    inRef.current = genInput()
    setPos(0)
  }, [])
  useEffect(() => {
    init()
  }, [init, seed])

  const total = OUT * OUT

  const poolAt = (or: number, oc: number, m: "max" | "avg"): { val: number; argR: number; argC: number } => {
    const input = inRef.current
    if (!input.length) return { val: 0, argR: 0, argC: 0 } // 首帧 init 前 inRef 仍为空，防越界
    let best = -Infinity
    let sum = 0
    let argR = or * POOL
    let argC = oc * POOL
    for (let i = 0; i < POOL; i++)
      for (let j = 0; j < POOL; j++) {
        const v = input[or * POOL + i][oc * POOL + j]
        sum += v
        if (v > best) {
          best = v
          argR = or * POOL + i
          argC = oc * POOL + j
        }
      }
    return { val: m === "max" ? best : +(sum / (POOL * POOL)).toFixed(1), argR, argC }
  }

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
    const MUT = isDark ? "#a1a1aa" : "#52525b"
    const input = inRef.current
    if (!input.length) return
    const m = modeRef.current
    const p = posRef.current
    const cur = Math.min(p, total - 1)
    const curR = Math.floor(cur / OUT)
    const curC = cur % OUT

    const cell = 38
    const oCell = 46
    const gap = 70
    const contentW = IN * cell + gap + OUT * oCell
    const inX = Math.max(16, (cssW - contentW) / 2)
    const inY = (cssH - IN * cell) / 2 + 6

    // 当前窗口里被选中的格子（最大池化）
    const sel = poolAt(curR, curC, m)

    // 输入图
    ctx.font = "12px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let r = 0; r < IN; r++) {
      for (let c = 0; c < IN; c++) {
        const v = input[r][c]
        const t = v / 9
        ctx.fillStyle = isDark ? `rgba(${50 + t * 150},${60 + t * 120},${90 + t * 150},1)` : `rgba(${235 - t * 150},${240 - t * 120},${255 - t * 60},1)`
        ctx.fillRect(inX + c * cell, inY + r * cell, cell - 2, cell - 2)
        // 最大池化时高亮当前窗口选中的格子
        const isSel = m === "max" && r === sel.argR && c === sel.argC && (p < total || p === total)
        ctx.fillStyle = isSel ? "#f59e0b" : t > 0.55 ? (isDark ? "#fafafa" : "#fff") : isDark ? "#e4e4e7" : "#27272a"
        if (isSel) {
          ctx.font = "700 13px ui-monospace, monospace"
        } else {
          ctx.font = "12px ui-monospace, monospace"
        }
        ctx.fillText(String(v), inX + c * cell + (cell - 2) / 2, inY + r * cell + (cell - 2) / 2)
      }
    }
    // 当前 2×2 窗口框
    ctx.strokeStyle = "#6366f1"
    ctx.lineWidth = 3
    ctx.strokeRect(inX + curC * POOL * cell - 1, inY + curR * POOL * cell - 1, POOL * cell, POOL * cell)
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`输入 ${IN}×${IN}`, inX, inY - 12)

    // 中间运算提示
    const midX = inX + IN * cell + gap / 2
    ctx.textAlign = "center"
    ctx.fillStyle = "#6366f1"
    ctx.font = "700 13px ui-sans-serif, system-ui"
    ctx.fillText(m === "max" ? "最大池化" : "平均池化", midX, inY + IN * cell / 2 - 14)
    ctx.fillStyle = isDark ? "#a1a1aa" : "#52525b"
    ctx.font = "11px ui-monospace, monospace"
    ctx.fillText("2×2 → 1", midX, inY + IN * cell / 2 + 4)
    ctx.fillStyle = "#f59e0b"
    ctx.font = "700 18px ui-monospace, monospace"
    if (p < total || p === total) ctx.fillText(`= ${sel.val}`, midX, inY + IN * cell / 2 + 28)

    // 输出图
    const oX = inX + IN * cell + gap
    const oY = inY + (IN * cell - OUT * oCell) / 2
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.fillText(`输出 ${OUT}×${OUT}`, oX, inY - 12)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "700 15px ui-monospace, monospace"
    for (let r = 0; r < OUT; r++) {
      for (let c = 0; c < OUT; c++) {
        const idx = r * OUT + c
        const px = oX + c * oCell
        const py = oY + r * oCell
        if (idx < p) {
          const v = poolAt(r, c, m).val
          const t = v / 9
          ctx.fillStyle = `rgba(245,158,11,${0.18 + t * 0.7})`
          ctx.fillRect(px, py, oCell - 3, oCell - 3)
          ctx.fillStyle = t > 0.5 ? "#fff" : isDark ? "#e4e4e7" : "#27272a"
          ctx.fillText(String(v), px + (oCell - 3) / 2, py + (oCell - 3) / 2)
        } else {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          ctx.fillRect(px, py, oCell - 3, oCell - 3)
        }
        if (idx === cur && p < total) {
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2.5
          ctx.strokeRect(px - 1, py - 1, oCell - 1, oCell - 1)
        }
      }
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
    setSeed((s) => s + 1)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total) setPos((p) => p + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (done) {
      handleReset()
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done, handleReset])
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "max" ? "avg" : "max"))
    setPos(0)
    setPlaying(false)
  }, [])

  // 讲课：最大池化扫一遍，4 句讲清「下采样→取最大→尺寸减半→平移不变」
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      setMode("max")
      modeRef.current = "max"
    },
    buildBeats: () =>
      chunkedBeats(
        total + 1,
        [
          "卷积之后，特征图往往很大、还有不少冗余。池化就是给它「瘦身」——拿一个 2×2 的小窗口，在特征图上以步长 2 不重叠地滑过去。",
          "最大池化的规则很简单：每个窗口里，只保留最大的那个数，扔掉其余三个。你看蓝框每滑到一处，橙色标出的就是这块里的最强响应，把它填进右边的输出图。",
          `滑完整张图，6×6 就被压成了 3×3——长宽各减半、数据量直接少到四分之一，后面的计算量也跟着大降。`,
          "更妙的是：只要那个最强特征还在这个 2×2 区域里，不管它偏左偏右一点，取最大的结果都一样——这就是平移不变性，让网络对物体的微小位移更稳健。换成平均池化，则是取平均、做平滑。",
        ],
        (i) => setPos(i)
      ),
  })

  const cur = Math.min(pos, total - 1)
  const sel = poolAt(Math.floor(cur / OUT), cur % OUT, mode)
  const caption = done
    ? `池化完成：${IN}×${IN} → ${OUT}×${OUT}，尺寸减半、计算量降到 ¼。${mode === "max" ? "最大池化保留最强响应（平移不变）" : "平均池化做平滑"}。`
    : pos === 0
      ? `${mode === "max" ? "最大池化" : "平均池化"}：2×2 窗口以步长 2 滑过输入图，每窗${mode === "max" ? "取最大值" : "取平均值"}写进输出。点播放。`
      : `第 ${pos} 个窗口：2×2 区域${mode === "max" ? `取最大 = ${sel.val}（橙色格）` : `取平均 = ${sel.val}`}，写进输出图。`

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
          {Math.min(pos, total)} / {total}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
          {caption}
        </div>
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
          <Button size="sm" variant="outline" onClick={toggleMode}>
            {mode === "max" ? "切平均池化" : "切最大池化"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 换输入
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝框=2×2 窗口 · 橙色=被保留的最大值</span>
        </div>
      )}
    </div>
  )
}
