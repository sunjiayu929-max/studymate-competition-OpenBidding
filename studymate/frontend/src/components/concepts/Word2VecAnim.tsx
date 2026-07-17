/**
 * 概念动画 · 词嵌入 Word2Vec（机器学习 · NLP 基石）
 * ------------------------------------------------------------------
 * 词嵌入把每个词映射成一个向量（这里压到二维便于展示，向量为示意布局）。
 * 真实运算在展示向量上进行：
 *   - 语义相近 → 距离近：最近邻按真实欧氏距离找
 *   - 方向有含义：国王−男人+女人 的向量加减，落点最接近「王后」
 * 四步：空间 → 最近邻 → 类比运算 → 总结。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

interface Word {
  label: string
  x: number
  y: number
  g: number // 颜色组
}
const WORDS: Word[] = [
  { label: "男人", x: 1.2, y: 1.2, g: 0 },
  { label: "国王", x: 3.4, y: 1.2, g: 0 },
  { label: "女人", x: 1.2, y: 3.4, g: 0 },
  { label: "王后", x: 3.4, y: 3.4, g: 0 },
  { label: "苹果", x: 8.2, y: 5.8, g: 1 },
  { label: "香蕉", x: 8.9, y: 6.4, g: 1 },
  { label: "橙子", x: 7.7, y: 6.6, g: 1 },
  { label: "猫", x: 7.4, y: 1.4, g: 2 },
  { label: "狗", x: 8.1, y: 1.9, g: 2 },
]
const GROUP_COLORS = ["#6366f1", "#10b981", "#f59e0b"]
const idx = (l: string) => WORDS.findIndex((w) => w.label === l)
const dist = (a: Word | { x: number; y: number }, b: Word | { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

export function Word2VecAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [stage, setStage] = useState(0) // 0 空间 · 1 最近邻 · 2 类比 · 3 总结
  const stageRef = useRef(0)
  useEffect(() => {
    stageRef.current = stage
  }, [stage])

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
    const st = stageRef.current

    const padL = 40
    const padR = 30
    const padT = 44
    const padB = 30
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const X = (x: number) => padL + (x / 10) * plotW
    const Y = (y: number) => padT + plotH - (y / 8) * plotH

    // 网格框
    ctx.strokeStyle = isDark ? "#27272a" : "#eee"
    ctx.lineWidth = 1
    ctx.strokeRect(padL, padT, plotW, plotH)

    // 类比箭头（stage>=2）
    const iMan = idx("男人")
    const iKing = idx("国王")
    const iWoman = idx("女人")
    const iQueen = idx("王后")
    const result = { x: WORDS[iKing].x - WORDS[iMan].x + WORDS[iWoman].x, y: WORDS[iKing].y - WORDS[iMan].y + WORDS[iWoman].y }
    if (st >= 2) {
      const drawArrow = (a: { x: number; y: number }, b: { x: number; y: number }, color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(X(a.x), Y(a.y))
        ctx.lineTo(X(b.x), Y(b.y))
        ctx.stroke()
        const ang = Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x))
        ctx.beginPath()
        ctx.moveTo(X(b.x), Y(b.y))
        ctx.lineTo(X(b.x) - 9 * Math.cos(ang - 0.4), Y(b.y) - 9 * Math.sin(ang - 0.4))
        ctx.lineTo(X(b.x) - 9 * Math.cos(ang + 0.4), Y(b.y) - 9 * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      }
      drawArrow(WORDS[iMan], WORDS[iKing], "#a855f7") // 男人→国王 = 王室向量
      drawArrow(WORDS[iWoman], result, "#a855f7") // 女人→结果（同一向量）
      // 结果点
      ctx.beginPath()
      ctx.arc(X(result.x), Y(result.y), 8, 0, Math.PI * 2)
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = "#ef4444"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "bottom"
      ctx.fillText("国王−男人+女人", X(result.x) + 10, Y(result.y) - 6)
    }

    // 最近邻连线（stage 1）：苹果 → 最近
    if (st === 1) {
      const a = WORDS[idx("苹果")]
      let best = -1
      let bd = Infinity
      WORDS.forEach((w, k) => {
        if (w.label === "苹果") return
        const d = dist(a, w)
        if (d < bd) {
          bd = d
          best = k
        }
      })
      ctx.strokeStyle = "#ef4444"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(X(a.x), Y(a.y))
      ctx.lineTo(X(WORDS[best].x), Y(WORDS[best].y))
      ctx.stroke()
      ctx.fillStyle = "#ef4444"
      ctx.font = "600 11px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(`最近邻 d=${bd.toFixed(2)}`, (X(a.x) + X(WORDS[best].x)) / 2, (Y(a.y) + Y(WORDS[best].y)) / 2 - 4)
    }

    // 词点
    WORDS.forEach((w) => {
      const hl =
        (st === 1 && w.label === "苹果") ||
        (st >= 2 && (w.label === "王后" || w.label === "国王" || w.label === "男人" || w.label === "女人"))
      ctx.beginPath()
      ctx.arc(X(w.x), Y(w.y), hl ? 7 : 5.5, 0, Math.PI * 2)
      ctx.fillStyle = GROUP_COLORS[w.g]
      ctx.fill()
      if (st >= 2 && w.label === "王后") {
        ctx.strokeStyle = "#10b981"
        ctx.lineWidth = 3
        ctx.stroke()
      }
      ctx.fillStyle = FG
      ctx.font = `${hl ? "600 " : ""}13px ui-sans-serif, system-ui`
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(w.label, X(w.x) + 9, Y(w.y))
    })

    // 标题
    const titles = ["① 词嵌入：每个词是空间里的一个向量，语义近 → 距离近", "② 找近义词 = 找最近的点（真实欧氏距离）", "③ 类比：国王−男人+女人 的向量运算 ≈ 王后", "④ 词嵌入：语义关系 → 几何关系，NLP 的第一步"]
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(titles[st], 118, 26)
    if (st >= 2) {
      ctx.fillStyle = "#10b981"
      ctx.font = "11px ui-monospace, monospace"
      ctx.textAlign = "right"
      ctx.fillText(`结果(${result.x.toFixed(1)},${result.y.toFixed(1)}) 最接近「王后」(${WORDS[iQueen].x},${WORDS[iQueen].y})`, cssW - padR, 26)
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

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => [
      {
        apply: () => setStage(0),
        text: "词嵌入,就是把每一个词,映射成一个向量——这里为了好看压到二维。神奇的地方在于:语义相近的词,向量也挨得近。你看,苹果、香蕉、橙子自己凑成一团,猫和狗凑一团,而它们离「人、国王」这些词都老远。",
      },
      {
        apply: () => setStage(1),
        text: "这样一来,「找近义词」就变成了「找最近的点」。离苹果最近的,就是香蕉。计算机不再把词当成孤立的符号,而是用向量之间的距离,直接衡量词义有多近。",
      },
      {
        apply: () => setStage(2),
        text: "更惊艳的是,连方向都有含义。用国王减去男人,得到的是一个代表「王室身份」的向量;把这个向量加到女人身上,落点恰好就在王后附近。国王减男人加女人,约等于王后——抽象的语义类比,靠简单的向量加减就完成了。",
      },
      {
        apply: () => setStage(3),
        text: "这就是词嵌入,Word2Vec、GloVe 这些方法的核心思想:把离散的词变成连续的向量,让语义关系变成几何关系。今天几乎所有的 NLP 模型,第一步都是先把词查成这样的向量,再往下处理。",
      },
    ],
  })

  const captions = [
    "词嵌入：每个词→一个向量(此处二维)。语义近的词距离近(水果一团、动物一团)。",
    "找近义词=找最近点：离「苹果」最近的是「香蕉」(真实欧氏距离)。",
    "类比运算：国王−男人+女人 的向量加减，落点最接近「王后」。",
    "词嵌入(Word2Vec/GloVe)：离散词→连续向量，语义关系变几何关系，NLP 第一步。",
  ]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          步 {stage + 1}/4
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{captions[stage]}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {["空间", "最近邻", "类比", "总结"].map((lbl, i) => (
            <Button key={i} size="sm" variant={stage === i ? "default" : "outline"} onClick={() => setStage(i)}>
              {i + 1}.{lbl}
            </Button>
          ))}
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">距离=语义远近 · 方向=类比关系</span>
        </div>
      )}
    </div>
  )
}
