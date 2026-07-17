/**
 * 概念动画 · 协同过滤 / 推荐系统（机器学习 · 应用）
 * ------------------------------------------------------------------
 * 基于用户的协同过滤：用「和你口味最像的人」来预测你没看过的电影评分。
 *   - 真实算法：对每个其他用户，在「共同评过分的电影」上算余弦相似度；
 *   - 预测缺失评分 = 按相似度加权平均其他用户对该片的打分（真实算）；
 *   - 相似用户都爱的片 → 高分推荐；只有口味不同的人爱 → 低分不推。
 * 旁白点明现代做法是矩阵分解（把评分矩阵拆成用户/物品隐向量）。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

// R[user][movie]，0 = 没评分。U0 = 目标用户（你）
const R = [
  [5, 3, 0, 4, 0, 1],
  [5, 2, 4, 4, 1, 1],
  [4, 3, 4, 5, 1, 2],
  [1, 2, 5, 2, 4, 5],
  [5, 3, 3, 4, 2, 1],
]
const UNAMES = ["你", "B", "C", "D", "E"]
const MNAMES = ["M1", "M2", "M3", "M4", "M5", "M6"]
const TARGET = 0
const MISSING = [2, 4]
function cosSim(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++)
    if (a[i] > 0 && b[i] > 0) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}
const SIMS = R.map((u, k) => (k === TARGET ? 1 : cosSim(R[TARGET], u)))
function predict(item: number): number {
  let num = 0
  let den = 0
  for (let k = 0; k < R.length; k++) {
    if (k === TARGET || R[k][item] <= 0) continue
    num += SIMS[k] * R[k][item]
    den += SIMS[k]
  }
  return den ? num / den : 0
}
const PRED: Record<number, number> = { 2: predict(2), 4: predict(4) }

export function CollaborativeFilteringAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
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

    // ===== 评分矩阵 =====
    const gx = 70
    const gy = 80
    const cw = 42
    const ch = 34
    // 列头（电影）
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let j = 0; j < MNAMES.length; j++) {
      ctx.fillStyle = MUT
      ctx.fillText(MNAMES[j], gx + j * cw + cw / 2, gy - 14)
    }
    for (let u = 0; u < R.length; u++) {
      const ry = gy + u * ch
      const isTarget = u === TARGET
      const simShown = stage >= 1 && !isTarget
      // 行头（用户）
      ctx.fillStyle = isTarget ? "#6366f1" : FG
      ctx.font = isTarget ? "600 12px ui-sans-serif, system-ui" : "11px ui-sans-serif, system-ui"
      ctx.textAlign = "right"
      ctx.fillText(UNAMES[u], gx - 8, ry + ch / 2)
      for (let j = 0; j < MNAMES.length; j++) {
        const cx = gx + j * cw
        const v = R[u][j]
        const isMiss = isTarget && MISSING.includes(j)
        const revealed = isMiss && ((j === 2 && stage >= 2) || (j === 4 && stage >= 3))
        // 单元格底
        ctx.fillStyle = isMiss
          ? revealed
            ? PRED[j] >= 3
              ? "rgba(16,185,129,0.22)"
              : "rgba(148,163,184,0.18)"
            : "rgba(99,102,241,0.12)"
          : isDark
            ? "#27272a"
            : "#f4f4f5"
        ctx.fillRect(cx + 2, ry + 2, cw - 4, ch - 4)
        // 高亮相似用户对缺失片的打分
        if (simShown && stage >= 2 && MISSING.includes(j) && v > 0) {
          ctx.strokeStyle = `rgba(99,102,241,${0.25 + SIMS[u] * 0.6})`
          ctx.lineWidth = 1.5
          ctx.strokeRect(cx + 2, ry + 2, cw - 4, ch - 4)
        }
        // 值
        ctx.textAlign = "center"
        if (isMiss && !revealed) {
          ctx.fillStyle = "#6366f1"
          ctx.font = "600 14px ui-sans-serif, system-ui"
          ctx.fillText("?", cx + cw / 2, ry + ch / 2)
        } else if (isMiss && revealed) {
          ctx.fillStyle = PRED[j] >= 3 ? "#10b981" : "#94a3b8"
          ctx.font = "600 13px ui-monospace, monospace"
          ctx.fillText(PRED[j].toFixed(1), cx + cw / 2, ry + ch / 2)
        } else if (v > 0) {
          ctx.fillStyle = FG
          ctx.font = "12px ui-monospace, monospace"
          ctx.fillText(String(v), cx + cw / 2, ry + ch / 2)
        } else {
          ctx.fillStyle = MUT
          ctx.font = "12px ui-monospace, monospace"
          ctx.fillText("·", cx + cw / 2, ry + ch / 2)
        }
      }
    }

    // ===== 右侧：相似度条 =====
    if (stage >= 1) {
      const sx = gx + MNAMES.length * cw + 28
      const sTop = gy + 6
      ctx.fillStyle = FG
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.fillText("与「你」的相似度", sx, sTop - 16)
      let row = 0
      for (let u = 1; u < R.length; u++) {
        const y = sTop + row * 30
        ctx.fillStyle = isDark ? "#3f3f46" : "#e4e4e7"
        ctx.fillRect(sx, y, 72, 14)
        ctx.fillStyle = SIMS[u] > 0.9 ? "#6366f1" : "#94a3b8"
        ctx.fillRect(sx, y, 72 * SIMS[u], 14)
        ctx.fillStyle = FG
        ctx.font = "9px ui-monospace, monospace"
        ctx.fillText(`${UNAMES[u]}  ${SIMS[u].toFixed(2)}`, sx + 78, y + 11)
        row++
      }
    }

    // ===== 结论 =====
    ctx.textAlign = "left"
    if (stage >= 2) {
      ctx.fillStyle = "#10b981"
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.fillText(`M3 预测 ${PRED[2].toFixed(1)} 分 → 口味相近的人都爱，推荐！`, gx, cssH - 38)
    }
    if (stage >= 3) {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "600 12px ui-sans-serif, system-ui"
      ctx.fillText(`M5 预测 ${PRED[4].toFixed(1)} 分 → 只有口味不同的 D 爱，不推。`, gx, cssH - 20)
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.fillText("协同过滤：用「和你最像的人」预测你没看过的片", 118, 28)
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
        text: "推荐系统最经典的思路叫协同过滤。这是一张评分表:每行一个用户,每列一部电影,数字是打分,点表示还没看过。最上面这行是你,你有两部片还没看,打了问号,我们想预测你会给它们打几分。",
      },
      {
        apply: () => setIdx(1),
        text: "基于用户的协同过滤,第一步是找「和你口味最像的人」。怎么衡量像不像?在你们都看过的电影上,算一个余弦相似度。右边的条形就是结果:E 和你几乎一模一样、B 和 C 也很像,而 D 的口味跟你差很远。",
      },
      {
        apply: () => setIdx(2),
        text: "现在预测你对 M3 的评分:看其他人给 M3 打了多少,然后按相似度加权平均——越像你的人,他的打分权重越大。算下来差不多 3.9 分。和你口味相近的人都挺喜欢,所以这部值得推荐给你。",
      },
      {
        apply: () => setIdx(3),
        text: "再看 M5,同样的算法,预测只有 1.8 分。因为给它高分的主要是口味跟你相反的 D,加权之后分数就被压下去了,这部就不推。这是最朴素的协同过滤;现在工业界更常用矩阵分解,把整张评分表拆成用户和物品的隐向量,既快又能处理海量稀疏数据。",
      },
    ],
  })

  const caption = [
    "评分矩阵：每行一个用户、每列一部电影。「你」有两部没看(?)，要预测评分。",
    "基于用户的 CF：在共同评过的电影上算余弦相似度，找口味最像的人。E 几乎和你一样。",
    `预测 M3 = 按相似度加权平均其他人的打分 = ${PRED[2].toFixed(1)} 分 → 推荐。`,
    `M5 仅口味相反的 D 爱 → 加权后仅 ${PRED[4].toFixed(1)} 分，不推。现代做法用矩阵分解。`,
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
          {["评分表", "算相似度", "预测 M3", "预测 M5"].map((t, i) => (
            <Button key={i} size="sm" variant={i === idx ? "default" : "outline"} onClick={() => setIdx(i)}>
              {t}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIdx(0)}>
            <RotateCcw className="size-4" />
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">蓝=相似用户 · 绿=推荐 · 灰=不推</span>
        </div>
      )}
    </div>
  )
}
