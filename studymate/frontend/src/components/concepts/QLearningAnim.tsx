/**
 * 概念动画 · 强化学习 Q-learning（机器学习 · 智能体试错）
 * ------------------------------------------------------------------
 * 真实 Q-learning：格子世界里智能体从起点走到终点(+1)、避开陷阱(-1)。
 * 维护 Q 表 Q[状态][动作]，每走一步按 Bellman 更新：
 *   Q(s,a) ← Q(s,a) + α·[ r + γ·maxₐ' Q(s',a') − Q(s,a) ]
 * 训练若干回合后，每格的最优动作箭头指向通往终点的最优策略。
 * 用确定性随机数训练并录快照，逐快照看策略收敛。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 950
const R = 4
const C = 4
const GOAL = [3, 3]
const TRAP = [1, 3]
const START = [0, 0]
const ALPHA = 0.5
const GAMMA = 0.9
const DA = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] // 上下左右
const CHECKPOINTS = [0, 1, 2, 4, 8, 16, 32, 64, 120, 250]

function lcg(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const isGoal = (r: number, c: number) => r === GOAL[0] && c === GOAL[1]
const isTrap = (r: number, c: number) => r === TRAP[0] && c === TRAP[1]
const isTerm = (r: number, c: number) => isGoal(r, c) || isTrap(r, c)

// 训练并在 checkpoints 处录 Q 表快照
function train(): number[][][] {
  const rnd = lcg(12345)
  const Q: number[][] = Array.from({ length: R * C }, () => [0, 0, 0, 0])
  const snaps: number[][][] = [Q.map((row) => [...row])] // checkpoint 0
  let cpIdx = 1
  for (let ep = 1; ep <= CHECKPOINTS[CHECKPOINTS.length - 1]; ep++) {
    let r = START[0]
    let c = START[1]
    const eps = Math.max(0.1, 0.9 - ep * 0.01) // 探索率递减
    for (let step = 0; step < 60; step++) {
      const s = r * C + c
      let a: number
      if (rnd() < eps) a = Math.floor(rnd() * 4)
      else {
        let best = 0
        for (let k = 1; k < 4; k++) if (Q[s][k] > Q[s][best]) best = k
        a = best
      }
      let nr = r + DA[a][0]
      let nc = c + DA[a][1]
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) {
        nr = r
        nc = c
      }
      const term = isTerm(nr, nc)
      const rew = isGoal(nr, nc) ? 1 : isTrap(nr, nc) ? -1 : -0.02
      const ns = nr * C + nc
      const maxNext = term ? 0 : Math.max(...Q[ns])
      Q[s][a] += ALPHA * (rew + GAMMA * maxNext - Q[s][a])
      r = nr
      c = nc
      if (term) break
    }
    if (ep === CHECKPOINTS[cpIdx]) {
      snaps.push(Q.map((row) => [...row]))
      cpIdx++
    }
  }
  return snaps
}

export function QLearningAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // checkpoint 索引
  const snapsRef = useRef<number[][][]>(train())
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

  const total = CHECKPOINTS.length

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
    const Q = snapsRef.current[Math.min(posRef.current, total - 1)]

    const cell = Math.min(64, (cssH - 90) / R)
    const gw = cell * C
    const gx = (cssW - gw) / 2 - 20
    const gy = 56

    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const x = gx + c * cell
        const y = gy + r * cell
        const s = r * C + c
        const maxQ = Math.max(...Q[s])
        let bestA = 0
        for (let k = 1; k < 4; k++) if (Q[s][k] > Q[s][bestA]) bestA = k
        // 底色
        if (isGoal(r, c)) ctx.fillStyle = "rgba(16,185,129,0.55)"
        else if (isTrap(r, c)) ctx.fillStyle = "rgba(244,63,94,0.55)"
        else {
          const v = Math.max(-1, Math.min(1, maxQ))
          ctx.fillStyle = v >= 0 ? `rgba(16,185,129,${0.08 + v * 0.4})` : `rgba(244,63,94,${0.08 + -v * 0.4})`
        }
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
        ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)

        if (isGoal(r, c)) {
          ctx.fillStyle = "#065f46"
          ctx.font = "600 13px ui-sans-serif, system-ui"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText("终点 +1", x + cell / 2, y + cell / 2)
        } else if (isTrap(r, c)) {
          ctx.fillStyle = "#7f1d1d"
          ctx.font = "600 13px ui-sans-serif, system-ui"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText("陷阱 -1", x + cell / 2, y + cell / 2)
        } else {
          // 策略箭头
          const arrow = ["↑", "↓", "←", "→"][bestA]
          ctx.fillStyle = Math.abs(maxQ) < 1e-6 ? MUT : FG
          ctx.font = "600 22px ui-sans-serif, system-ui"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(Math.abs(maxQ) < 1e-6 ? "·" : arrow, x + cell / 2, y + cell / 2 - 4)
          ctx.fillStyle = MUT
          ctx.font = "9px ui-monospace, monospace"
          ctx.fillText(maxQ.toFixed(2), x + cell / 2, y + cell - 9)
        }
        if (r === START[0] && c === START[1]) {
          ctx.fillStyle = "#6366f1"
          ctx.font = "9px ui-sans-serif, system-ui"
          ctx.textAlign = "left"
          ctx.textBaseline = "top"
          ctx.fillText("起点", x + 4, y + 4)
        }
      }
    }

    // 右侧 Bellman 公式
    const px = gx + gw + 24
    if (px < cssW - 30) {
      ctx.fillStyle = MUT
      ctx.font = "11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText("Bellman 更新：", px, gy + 8)
      ctx.fillStyle = FG
      ctx.font = "11px ui-monospace, monospace"
      ctx.fillText("Q(s,a) ←", px, gy + 30)
      ctx.fillText(" Q + α·[r", px, gy + 48)
      ctx.fillText("  + γ·maxQ'", px, gy + 66)
      ctx.fillText("  − Q]", px, gy + 84)
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText("α=0.5 γ=0.9", px, gy + 108)
    }

    // 标题
    ctx.fillStyle = "#6366f1"
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`已训练 ${CHECKPOINTS[Math.min(posRef.current, total - 1)]} 回合`, gx, gy - 14)
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
          "强化学习里,一个智能体在环境里不断试错,目标是拿到尽可能多的奖励。这个 4×4 的格子世界:右下角是终点、奖励 +1,中间这个红格是陷阱、奖励 −1,智能体要从左上角的起点走过去。",
          "它脑子里有一张 Q 表:每个格子的上下左右各打一个分,表示「从这儿往那个方向走,以后预计能拿到多少奖励」。一开始全是 0,啥也不懂,只能东撞西撞地乱试。",
          "每走一步,就用 Bellman 公式更新那个 Q 值:新的 Q,等于旧的 Q,加上学习率乘以「这步拿到的奖励,加上打了折的下一步最大 Q,再减去旧 Q」。奖励信号就这样从终点,一格一格地往回渗透。",
          "训练几百个回合后,你看每个格子的箭头,都稳稳指向了通往终点、又绕开陷阱的方向——这张箭头图就是它学到的最优策略。不给标准答案、只给奖励,让它自己摸索出最优解,这就是 Q-learning。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? "训练收敛:每格箭头指向通往终点、避开陷阱的最优方向 = 学到的最优策略。Q-learning 靠 Bellman 更新让奖励从终点回传。"
    : pos === 0
      ? "格子世界:起点(左上)→终点(+1)，避开陷阱(-1)。Q 表初始全 0。点播放看策略随训练收敛。"
      : `已训练 ${CHECKPOINTS[Math.min(pos, total - 1)]} 回合：箭头=各格当前最优动作，颜色=该格价值(绿正红负)。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {CHECKPOINTS[Math.min(pos, total - 1)]} 回合
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
            <SkipForward className="size-4" /> 单步（+回合）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">箭头=最优动作 · 绿=高价值 · 红=陷阱</span>
        </div>
      )}
    </div>
  )
}
