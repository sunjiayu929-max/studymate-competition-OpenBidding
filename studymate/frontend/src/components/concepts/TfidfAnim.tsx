/**
 * 概念动画 · TF-IDF（机器学习 · NLP / 信息检索）
 * ------------------------------------------------------------------
 * 衡量一个词对某篇文档有多「重要 / 有区分度」：
 *   TF（词频）= 词在该文档出现次数 / 文档长度 —— 出现得多 → 重要；
 *   IDF（逆文档频率）= ln(总文档数 / 含该词的文档数) —— 越多文档都有 → 越没区分度；
 *   TF-IDF = TF × IDF。
 * 关键洞察：「喜欢」三篇都有 → IDF=0 → 权重 0（像停用词）；「鱼」只在文档1出现 → 高权重 = 关键词。
 * 全部数值真实计算。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const DOCS = [
  ["猫", "喜欢", "鱼", "猫", "鱼"],
  ["狗", "喜欢", "骨头", "狗"],
  ["猫", "狗", "都", "喜欢", "玩"],
]
const TERMS = ["猫", "狗", "喜欢", "鱼", "骨头"]
const N = DOCS.length
const df = (t: string) => DOCS.filter((d) => d.includes(t)).length
const IDF = TERMS.map((t) => Math.log(N / df(t)))
const D1 = DOCS[0]
const TF = TERMS.map((t) => D1.filter((w) => w === t).length / D1.length)
const TFIDF = TERMS.map((_, i) => TF[i] * IDF[i])

export function TfidfAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    idxRef.current = idx
  }, [idx])

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
    const stage = idxRef.current

    // ===== 三篇文档 =====
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    for (let d = 0; d < N; d++) {
      const y = 60 + d * 30
      ctx.fillStyle = d === 0 ? "#6366f1" : MUT
      ctx.font = d === 0 ? "600 12px ui-sans-serif, system-ui" : "11px ui-sans-serif, system-ui"
      ctx.fillText(`文档${d + 1}${d === 0 ? "(目标)" : ""}`, 40, y)
      let x = 130
      for (const w of DOCS[d]) {
        const isTerm = TERMS.includes(w)
        const hot = w === "喜欢"
        ctx.font = "12px ui-sans-serif, system-ui"
        const tw = ctx.measureText(w).width + 14
        ctx.fillStyle = hot ? "rgba(244,63,94,0.18)" : isTerm ? (isDark ? "#312e81" : "#e0e7ff") : isDark ? "#27272a" : "#f4f4f5"
        ctx.fillRect(x, y - 11, tw, 22)
        ctx.fillStyle = hot ? "#f43f5e" : FG
        ctx.textAlign = "center"
        ctx.fillText(w, x + tw / 2, y)
        ctx.textAlign = "left"
        x += tw + 6
      }
    }

    // ===== 柱状（按 stage 显示 TF / IDF / TF-IDF）=====
    const vals = stage === 1 ? TF : stage === 2 ? IDF : stage >= 3 ? TFIDF : null
    const label = stage === 1 ? "TF 词频(在文档1)" : stage === 2 ? "IDF 逆文档频率" : stage >= 3 ? "TF-IDF = TF × IDF" : ""
    if (vals) {
      const baseY = cssH - 56
      const maxH = 110
      const x0 = 70
      const slot = (cssW - 120) / TERMS.length
      const maxV = Math.max(...vals, 1e-6)
      ctx.fillStyle = FG
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText(label, x0, baseY - maxH - 16)
      for (let i = 0; i < TERMS.length; i++) {
        const cx = x0 + i * slot + slot / 2
        const h = (vals[i] / maxV) * maxH
        const zero = vals[i] < 1e-9
        const top = TFIDF[i] === Math.max(...TFIDF) && stage >= 3
        ctx.fillStyle = zero ? "#f43f5e" : top ? "#10b981" : "#6366f1"
        ctx.fillRect(cx - slot * 0.28, baseY - h, slot * 0.56, h)
        ctx.fillStyle = zero ? "#f43f5e" : FG
        ctx.font = "600 10px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(vals[i].toFixed(2), cx, baseY - h - 3)
        ctx.fillStyle = TERMS[i] === "喜欢" ? "#f43f5e" : FG
        ctx.font = "12px ui-sans-serif, system-ui"
        ctx.textBaseline = "top"
        ctx.fillText(TERMS[i], cx, baseY + 6)
        if (stage === 2) {
          ctx.fillStyle = MUT
          ctx.font = "9px ui-monospace, monospace"
          ctx.fillText(`df=${df(TERMS[i])}`, cx, baseY + 22)
        }
      }
      ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, baseY)
      ctx.lineTo(cssW - 50, baseY)
      ctx.stroke()
    }
    if (stage === 3) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.textBaseline = "alphabetic"
      ctx.fillText("「鱼」权重最高 = 文档1的关键词；「喜欢」处处都有 → 权重 0", cssW - 50, 150)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("TF-IDF：出现得多(TF) × 别处少见(IDF) = 关键词", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    buildBeats: () => [
      {
        apply: () => setIdx(0),
        text: "TF-IDF 要解决的问题是:在一篇文档里,哪些词才是真正的关键词?这里有三篇很短的文档,我们以第一篇为目标,看看怎么给它的每个词打分。",
      },
      {
        apply: () => setIdx(1),
        text: "第一步算词频 TF:一个词在这篇文档里出现的次数,除以文档总词数。文档1里「猫」和「鱼」各出现两次,词频最高。光看词频,它们俩最重要。",
      },
      {
        apply: () => setIdx(2),
        text: "但光看词频会被「的、了、喜欢」这种到处都是的词带偏。所以第二步算逆文档频率 IDF:一个词出现在越多文档里,区分度越低、IDF 越小。「喜欢」三篇文档全都有,它的 IDF 直接等于 0;而「鱼」「骨头」只在一篇里出现,IDF 最高。",
      },
      {
        apply: () => setIdx(3),
        text: "把两者一乘,就是 TF-IDF。结果一目了然:「鱼」既出现得多、又别处少见,权重最高,是文档1的关键词;而「喜欢」虽然词频不低,但因为 IDF 是 0,权重被压成 0,等于自动当成了停用词。搜索引擎和文本分类,都用它来挑关键词。",
      },
    ],
  })

  const caption = [
    "三篇文档，以文档1为目标，给每个词算重要度。",
    "TF 词频：词在文档1出现次数 / 文档长度。「猫」「鱼」各 2 次最高。",
    "IDF=ln(N/df)：出现在越多文档越没区分度。「喜欢」三篇全有 → IDF=0。",
    "TF-IDF=TF×IDF：「鱼」最高=关键词；「喜欢」被压成 0=停用词。搜索/分类常用。",
  ][idx]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {idx + 1}/4
        </div>
      </div>
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          {["文档", "TF", "IDF", "TF-IDF"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=关键词 · 红=处处都有(权重0)</span>
        </div>
      )}
    </div>
  )
}
