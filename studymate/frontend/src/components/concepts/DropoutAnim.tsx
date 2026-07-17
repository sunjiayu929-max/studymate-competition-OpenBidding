/**
 * 概念动画 · Dropout 随机失活（机器学习 · 神经网络正则化）
 * ------------------------------------------------------------------
 * 训练时，每个隐藏神经元以概率 p 被随机「关掉」（连同它的连边一起消失），
 * 每个小批量都换一套随机子网络 → 相当于训练了指数级多个「瘦身网络」的集成，
 * 逼网络别依赖个别神经元（防过拟合）。推理时全部启用、权重乘以 (1-p) 做补偿。
 *   - 拖失活率 p / 「下一批」换一套随机掩码 / 切 训练↔推理
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const LAYERS = [4, 6, 6, 2] // 输入 / 隐藏×2 / 输出
const ROUNDS = 8

// 确定性伪随机：同 (layer,node,round,seed) 永远同结果 → 讲课可复现、replay 不变
function hash01(a: number, b: number, c: number, d: number): number {
  let x = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ ((d + 1) * 2654435761)
  x = (x ^ (x >>> 13)) >>> 0
  x = (x * 1597334677) >>> 0
  return (x % 100000) / 100000
}
// 隐藏层(1,2)才会被失活；输入/输出层永远在
function isDropped(layer: number, node: number, round: number, seed: number, p: number): boolean {
  if (layer === 0 || layer === LAYERS.length - 1) return false
  return hash01(layer, node, round, seed) < p
}

export function DropoutAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [seed, setSeed] = useState(0)
  const [p, setP] = useState(0.4)
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<"train" | "infer">("train")
  const pRef = useRef(0.4)
  const roundRef = useRef(0)
  const phaseRef = useRef<"train" | "infer">("train")
  const seedRef = useRef(0)
  useEffect(() => {
    pRef.current = p
  }, [p])
  useEffect(() => {
    roundRef.current = round
  }, [round])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    seedRef.current = seed
  }, [seed])

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
    const infer = phaseRef.current === "infer"
    const rnd = roundRef.current
    const sd = seedRef.current
    const pp = pRef.current

    const padX = 70
    const top = 56
    const bot = cssH - 54
    const colW = (cssW - padX * 2) / (LAYERS.length - 1)
    const R = 13

    const pos = (l: number, n: number): [number, number] => {
      const x = padX + l * colW
      const cnt = LAYERS[l]
      const h = bot - top
      const y = LAYERS[l] === 1 ? (top + bot) / 2 : top + (h * n) / (cnt - 1)
      return [x, y]
    }
    const active = (l: number, n: number) => infer || !isDropped(l, n, rnd, sd, pp)

    // 边：仅当两端都活跃才画
    for (let l = 0; l < LAYERS.length - 1; l++) {
      for (let i = 0; i < LAYERS[l]; i++) {
        for (let j = 0; j < LAYERS[l + 1]; j++) {
          if (!active(l, i) || !active(l + 1, j)) continue
          const [x1, y1] = pos(l, i)
          const [x2, y2] = pos(l + 1, j)
          ctx.strokeStyle = isDark ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.20)"
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
      }
    }

    // 节点
    for (let l = 0; l < LAYERS.length; l++) {
      for (let n = 0; n < LAYERS[l]; n++) {
        const [x, y] = pos(l, n)
        const on = active(l, n)
        ctx.beginPath()
        ctx.arc(x, y, R, 0, Math.PI * 2)
        if (on) {
          ctx.fillStyle = l === 0 ? "#10b981" : l === LAYERS.length - 1 ? "#f59e0b" : "#6366f1"
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)"
          ctx.stroke()
        } else {
          // 被失活：空心虚线 + ×
          ctx.fillStyle = isDark ? "#18181b" : "#f4f4f5"
          ctx.fill()
          ctx.setLineDash([3, 3])
          ctx.lineWidth = 1.5
          ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
          ctx.stroke()
          ctx.setLineDash([])
          ctx.strokeStyle = isDark ? "#71717a" : "#a1a1aa"
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x - 5, y - 5)
          ctx.lineTo(x + 5, y + 5)
          ctx.moveTo(x + 5, y - 5)
          ctx.lineTo(x - 5, y + 5)
          ctx.stroke()
        }
      }
    }

    // 层标签
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    const names = ["输入层", "隐藏层", "隐藏层", "输出层"]
    for (let l = 0; l < LAYERS.length; l++) {
      const [x] = pos(l, 0)
      ctx.fillText(names[l], x, top - 22)
    }

    // 底部状态条（放底部避开左上角视口控件 / 右上角 HUD）
    const statusY = cssH - 14
    ctx.textAlign = "left"
    ctx.font = "600 13px ui-sans-serif, system-ui"
    if (infer) {
      ctx.fillStyle = "#10b981"
      ctx.fillText("推理阶段：全部神经元启用，权重 × (1−p) 补偿", 18, statusY)
    } else {
      // 数出本批失活了几个隐藏神经元
      let dropped = 0
      let hidden = 0
      for (let l = 1; l < LAYERS.length - 1; l++)
        for (let n = 0; n < LAYERS[l]; n++) {
          hidden++
          if (isDropped(l, n, rnd, sd, pp)) dropped++
        }
      ctx.fillStyle = "#6366f1"
      ctx.fillText(`训练 · 第 ${rnd + 1} 批：随机关掉 ${dropped}/${hidden} 个隐藏神经元（p=${pp.toFixed(2)}）`, 18, statusY)
    }
  }, [applyViewport])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const handleReset = useCallback(() => {
    setSeed((s) => s + 1)
    setRound(0)
    setPhase("train")
  }, [])
  const handleNext = useCallback(() => {
    setPhase("train")
    setRound((r) => (r + 1) % ROUNDS)
  }, [])
  const togglePhase = useCallback(() => setPhase((ph) => (ph === "train" ? "infer" : "train")), [])

  // 讲课：概念型（不塞数字）——失活→子网络集成→防过拟合→推理全开补偿
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPhase("train")
      phaseRef.current = "train"
      setRound(0)
    },
    buildBeats: () => [
      {
        apply: () => {
          setPhase("train")
          setRound(0)
        },
        text: "Dropout，直译就是「随机失活」，是防止神经网络过拟合最常用的招之一。它的做法出人意料地简单粗暴：训练的时候，每个隐藏神经元都有一定概率 p 被临时关掉。",
      },
      {
        frames: Array.from({ length: ROUNDS }, (_, i) => i),
        seek: (i: number) => {
          setPhase("train")
          setRound(i)
        },
        text: "你看，被打叉的就是这一批被关掉的神经元，它和它的所有连线都暂时消失了。关键是——每喂一个小批量数据，就重新随机抽一套关掉谁，所以网络每次看到的都是一张不一样的「瘦身网络」。",
      },
      {
        apply: () => {
          setPhase("train")
          setRound(2)
        },
        text: "这样一来，网络没法死死依赖某几个神经元——因为它们随时可能缺席，每个神经元都被迫学会独当一面、特征之间不再相互勾结。相当于同时训练了海量个结构不同的子网络，最后求平均，自然就不容易过拟合了。",
      },
      {
        apply: () => setPhase("infer"),
        text: "等到推理、真正预测的时候，就不再关谁了——所有神经元全部启用，但把权重统一乘上 (1−p) 做个补偿，让输出的规模和训练时对得上。训练随机瘦身、推理全员上阵，这就是 Dropout。",
      },
    ],
  })

  const caption =
    phase === "infer"
      ? "推理阶段：不再失活，全部神经元启用，权重 ×(1−p) 补偿——相当于把训练出的众多子网络做集成平均。"
      : `训练第 ${round + 1} 批：隐藏层按 p=${p.toFixed(2)} 随机关掉一批神经元（打叉），每批换一套 → 训练众多「瘦身子网络」，防过拟合。`

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
          {phase === "infer" ? "推理" : `批 ${round + 1}/${ROUNDS}`}
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleNext} disabled={phase === "infer"}>
            <SkipForward className="size-4" /> 下一批（换掩码）
          </Button>
          <Button size="sm" variant={phase === "infer" ? "default" : "outline"} onClick={togglePhase}>
            {phase === "infer" ? "回训练" : "切到推理"}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            失活率 p
            <input
              type="range"
              min={0.1}
              max={0.6}
              step={0.05}
              value={p}
              onChange={(e) => setP(parseFloat(e.target.value))}
              disabled={phase === "infer"}
              className="w-32 accent-indigo-500"
            />
            <span className="font-mono w-10 text-center">{p.toFixed(2)}</span>
          </label>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">× = 本批被关掉的神经元</span>
        </div>
      )}
    </div>
  )
}
