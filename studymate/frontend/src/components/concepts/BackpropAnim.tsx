/**
 * 概念动画 · 反向传播 Backpropagation（机器学习）
 * ------------------------------------------------------------------
 * 真实训练循环（[2,3,1] 网络拟合一个目标值），四相循环：
 *   ① 前向：算出预测 ŷ   ② 损失：L=½(ŷ-y)²
 *   ③ 反向：链式法则把误差 δ 从输出一层层回传   ④ 更新：w ← w - η·∂L/∂w
 * 权重持久，每轮 loss 真实下降——看着 loss 一轮轮往下掉就是"训练"。
 *   ▶播放 / ⏸暂停 / ⏭单步（推进一相）/ ↻重置（换初始权重）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const STEP_MS = 1100
const LR = 0.35
const TARGET = 0.85
const X = [0.7, 0.9]
const MAX_EPOCH = 30

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

interface State {
  W1: number[][] // 3x2
  b1: number[] // 3
  W2: number[] // 3
  b2: number // 1
  a1: number[] // 隐藏激活
  yhat: number
  loss: number
  dz1: number[] // 隐藏层 δ
  dz2: number // 输出层 δ
}

function freshWeights(): State {
  return {
    W1: [
      [rand(-1, 1), rand(-1, 1)],
      [rand(-1, 1), rand(-1, 1)],
      [rand(-1, 1), rand(-1, 1)],
    ],
    b1: [rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5)],
    W2: [rand(-1, 1), rand(-1, 1), rand(-1, 1)],
    b2: rand(-0.5, 0.5),
    a1: [0, 0, 0],
    yhat: 0,
    loss: 0,
    dz1: [0, 0, 0],
    dz2: 0,
  }
}

export function BackpropAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<{ phase: number; epoch: number; loss: number; done: boolean }>({
    phase: 0,
    epoch: 0,
    loss: 0,
    done: false,
  })

  const sRef = useRef<State>(freshWeights())
  const phaseRef = useRef(0)
  const epochRef = useRef(0)
  const doneRef = useRef(false)
  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const forward = useCallback(() => {
    const s = sRef.current
    const a1 = s.W1.map((row, j) => sigmoid(s.b1[j] + row[0] * X[0] + row[1] * X[1]))
    const yhat = s.b2 + s.W2.reduce((acc, w, j) => acc + w * a1[j], 0)
    s.a1 = a1
    s.yhat = yhat
    s.loss = 0.5 * (yhat - TARGET) ** 2
  }, [])

  const backward = useCallback(() => {
    const s = sRef.current
    const dz2 = s.yhat - TARGET // 线性输出
    const dz1 = s.a1.map((a, j) => s.W2[j] * dz2 * a * (1 - a)) // sigmoid'
    s.dz2 = dz2
    s.dz1 = dz1
  }, [])

  const update = useCallback(() => {
    const s = sRef.current
    // ∂L/∂W2 = δ2·a1 ；∂L/∂W1 = δ1·x
    s.W2 = s.W2.map((w, j) => w - LR * s.dz2 * s.a1[j])
    s.b2 = s.b2 - LR * s.dz2
    s.W1 = s.W1.map((row, j) => [row[0] - LR * s.dz1[j] * X[0], row[1] - LR * s.dz1[j] * X[1]])
    s.b1 = s.b1.map((b, j) => b - LR * s.dz1[j])
  }, [])

  const init = useCallback(() => {
    sRef.current = freshWeights()
    forward()
    // 避免随机初值恰好接近目标 → loss 太小、讲解词（差了一截/损失从X掉到Y）没意义；重抽到预测明显偏离目标
    let guard = 0
    while (Math.abs(sRef.current.yhat - TARGET) < 0.35 && guard++ < 60) {
      sRef.current = freshWeights()
      forward()
    }
    phaseRef.current = 0
    epochRef.current = 0
    doneRef.current = false
    setView({ phase: 0, epoch: 0, loss: sRef.current.loss, done: false })
  }, [forward])
  useEffect(() => {
    init()
  }, [init, seed])

  // 推进一相
  const advance = useCallback(() => {
    if (doneRef.current) return
    const p = phaseRef.current
    if (p === 0 || p === 4) {
      // → 前向（新一轮）
      if (p === 0) {
        epochRef.current = 1
      } else {
        epochRef.current += 1
      }
      forward()
      phaseRef.current = 1
    } else if (p === 1) {
      phaseRef.current = 2
    } else if (p === 2) {
      backward()
      phaseRef.current = 3
    } else if (p === 3) {
      update()
      forward() // 用更新后的权重重算，loss 直接掉下来
      phaseRef.current = 4
    }
    if (epochRef.current >= MAX_EPOCH && phaseRef.current === 4) {
      doneRef.current = true
      playingRef.current = false
      setPlaying(false)
    }
    setView({ phase: phaseRef.current, epoch: epochRef.current, loss: sRef.current.loss, done: doneRef.current })
  }, [forward, backward, update])

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

    const padX = 70
    const padY = 40
    const isDark = document.documentElement.classList.contains("dark")
    const s = sRef.current
    const phase = phaseRef.current
    const SIZES = [2, 3, 1]
    const fwd = phase === 1 || phase === 2
    const bwd = phase === 3 || phase === 4

    const colX = (l: number) => padX + (l / 2) * (cssW - padX * 2)
    const nodeY = (l: number, i: number) => {
      const n = SIZES[l]
      const span = cssH - padY * 2
      return padY + (n === 1 ? span / 2 : (i / (n - 1)) * span)
    }
    const aOf = (l: number, i: number) => (l === 0 ? X[i] : l === 1 ? s.a1[i] : s.yhat)

    // 边
    const drawEdges = (l: number, w: (j: number, i: number) => number) => {
      for (let j = 0; j < SIZES[l + 1]; j++) {
        for (let i = 0; i < SIZES[l]; i++) {
          const wij = w(j, i)
          ctx.strokeStyle = bwd ? "#ef4444" : fwd ? "#10b981" : wij >= 0 ? "#3b82f6" : "#ef4444"
          ctx.globalAlpha = (fwd || bwd ? 0.5 : 0.25) + Math.min(0.4, Math.abs(wij) * 0.3)
          ctx.lineWidth = 0.7 + Math.abs(wij) * 1.5
          ctx.beginPath()
          ctx.moveTo(colX(l) + 19, nodeY(l, i))
          ctx.lineTo(colX(l + 1) - 19, nodeY(l + 1, j))
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }
    drawEdges(0, (j, i) => s.W1[j][i])
    drawEdges(1, (j) => s.W2[j])

    // 方向标
    ctx.font = "bold 12px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    if (fwd) {
      ctx.fillStyle = "#10b981"
      ctx.fillText("➡ 前向：算预测", cssW / 2, 8)
    } else if (bwd) {
      ctx.fillStyle = "#ef4444"
      ctx.fillText("⬅ 反向：回传梯度 δ", cssW / 2, 8)
    }

    // 节点
    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < SIZES[l]; i++) {
        const x = colX(l)
        const y = nodeY(l, i)
        const v = aOf(l, i)
        const vis = Math.max(0, Math.min(1, l === 2 ? v : v))
        ctx.beginPath()
        ctx.arc(x, y, 19, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99,102,241,${0.12 + Math.min(1, Math.abs(vis)) * 0.7})`
        ctx.fill()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
        ctx.stroke()
        ctx.fillStyle = Math.abs(vis) > 0.55 ? "#fff" : isDark ? "#e4e4e7" : "#27272a"
        ctx.font = "bold 12px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(v.toFixed(2), x, y)
        // 反向时标 δ：隐藏层放节点右侧；输出节点在最右、改放节点「上方·右对齐」，避开右侧目标/损失文字、也不冲出画布
        if (bwd && l >= 1) {
          const d = l === 2 ? s.dz2 : s.dz1[i]
          ctx.fillStyle = "#ef4444"
          ctx.font = "bold 12px ui-monospace, monospace"
          if (l === 2) {
            ctx.textAlign = "right"
            ctx.fillText(`δ=${d.toFixed(2)}`, cssW - 6, y - 32)
          } else {
            ctx.textAlign = "left"
            ctx.fillText(`δ=${d.toFixed(2)}`, x + 24, y)
          }
        }
      }
    }

    // 输出目标 / 损失：放在输出节点「下方」、右对齐，竖向留足间距避开节点本身（节点 r=19，±16 会压住节点里的值）
    ctx.font = "12.5px ui-sans-serif, system-ui"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillStyle = isDark ? "#a1a1aa" : "#71717a"
    const oy = nodeY(2, 0)
    ctx.fillText(`目标 y=${TARGET}`, cssW - 6, oy + 32)
    if (phase >= 2) {
      ctx.fillStyle = phase === 2 ? "#f59e0b" : isDark ? "#a1a1aa" : "#71717a"
      ctx.fillText(`L=½(ŷ-y)²=${s.loss.toFixed(3)}`, cssW - 6, oy + 52)
    }

    // 层标签
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.fillStyle = isDark ? "#71717a" : "#a1a1aa"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ;["输入", "隐藏", "输出"].forEach((t, l) => ctx.fillText(t, colX(l), cssH - 6))
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && !doneRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        advance()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, advance])

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

  // 「换一组新权重」只在「进入讲课」时做一次；replay（再讲一遍）不换 → 数字一致、讲解词不变 → 语音缓存命中、秒开
  const lectureWasOn = useRef(false)
  useEffect(() => {
    if (lecture && !lectureWasOn.current) init()
    lectureWasOn.current = lecture
  }, [lecture, init])

  // 讲课模式：讲一轮的四相（前向→损失→反向→更新）。开讲时先「快照→模拟整轮→记下真实数值→复位」，
  // 把这一轮真实算出的预测/损失/δ 套进讲解词（像老师念板书）；播放时 apply 幂等重算、与讲解词一致。
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
      const snap = JSON.parse(JSON.stringify(sRef.current)) as State
      forward()
      const pred = sRef.current.yhat
      const lossBefore = sRef.current.loss
      backward()
      const dOut = sRef.current.dz2
      update()
      forward()
      const lossAfter = sRef.current.loss
      sRef.current = JSON.parse(JSON.stringify(snap)) as State
      forward() // 复位回初始前向，供播放时 apply 干净重算
      return [
        {
          apply: () => {
            forward()
            phaseRef.current = 1
            setView({ phase: 1, epoch: 1, loss: sRef.current.loss, done: false })
          },
          text: `训练神经网络，核心就是反向传播。咱们一轮一轮看。第一步前向：输入沿着绿色的边加权求和、再激活，一路算到最右边，得到网络此刻的预测，是 ${pred.toFixed(2)}。`,
        },
        {
          apply: () => {
            phaseRef.current = 2
            setView({ phase: 2, epoch: 1, loss: sRef.current.loss, done: false })
          },
          text: `第二步算损失：我们想要的目标是 ${TARGET}，可现在只预测出 ${pred.toFixed(2)}，差了一截。把这个差距平方一下，就是损失 L，等于 ${lossBefore.toFixed(3)}。这个误差，正是后面一切的起点。`,
        },
        {
          apply: () => {
            backward()
            phaseRef.current = 3
            setView({ phase: 3, epoch: 1, loss: sRef.current.loss, done: false })
          },
          text: `第三步反向传播：从输出端的误差出发，沿着红色的边、用链式法则一层层往回传，算出每个神经元该担多少责任，也就是梯度 δ。你看输出这里的 δ 是 ${dOut.toFixed(2)}，再顺着往回传到隐藏层。`,
        },
        {
          apply: () => {
            update()
            forward()
            phaseRef.current = 4
            setView({ phase: 4, epoch: 1, loss: sRef.current.loss, done: false })
          },
          text: `第四步更新：每个权重都朝着让损失变小的方向挪一小步。你看损失立刻从 ${lossBefore.toFixed(3)} 掉到了 ${lossAfter.toFixed(3)}！前向、算损失、反向、更新，这四步一轮轮重复几十次，损失越压越低，网络就这么慢慢学会了。`,
        },
      ]
    },
  })

  const phaseName = ["准备", "① 前向", "② 损失", "③ 反向", "④ 更新"][view.phase]
  const caption = view.done
    ? `训练 ${MAX_EPOCH} 轮后 loss 降到 ${view.loss.toFixed(3)}。反向传播 = 用链式法则把误差从输出层一层层回传，再按梯度更新每个权重。`
    : view.phase === 0
      ? "一个 2-3-1 的小网络要拟合目标 y=0.85。点播放，看「前向→损失→反向→更新」一轮轮把 loss 压下去。"
      : view.phase === 1
        ? "① 前向：输入沿绿边加权求和+激活，一路算到输出 ŷ（圈里数字）。"
        : view.phase === 2
          ? `② 损失：比较预测 ŷ 和目标 y，得 L=${view.loss.toFixed(3)}。误差就是反向传播的起点。`
          : view.phase === 3
            ? "③ 反向：从输出的误差 δ 出发，沿红边用链式法则逐层回传，算出每层的 δ（梯度信号）。"
            : `④ 更新：每个权重按 w←w-η·∂L/∂w 调整，loss 掉到 ${view.loss.toFixed(3)}。回到前向，进入下一轮。`

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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-tight text-right">
          {phaseName}
          <br />轮次 {view.epoch}
          <br />loss {view.loss.toFixed(3)}
        </div>
      </div>
      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${view.done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>
        {caption}
      </div>
      )}
      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {view.done ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={advance} disabled={playing || view.done}>
          <SkipForward className="size-4" /> 单步（推进一相）
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 换初始权重
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=前向 · 红=反向梯度 δ · loss 逐轮下降</span>
      </div>
      )}
    </div>
  )
}
