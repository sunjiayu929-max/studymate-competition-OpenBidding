/**
 * 概念动画 · 位置编码 Positional Encoding（机器学习 · Transformer）
 * ------------------------------------------------------------------
 * 自注意力本身分不清词序（打乱输入结果一样）。位置编码给每个位置一个独特「指纹」加到词向量上。
 * 经典正弦做法（真实公式）：
 *   PE(pos, 2i)   = sin(pos / 10000^(2i/d))
 *   PE(pos, 2i+1) = cos(pos / 10000^(2i/d))
 * 热力图每一列是一个维度：靠前维度频率高(条纹密)、靠后维度频率低(渐变慢)；
 * 每一行(每个位置)由此得到独一无二的编码，且相邻位置编码接近。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const NPOS = 24
const NDIM = 24
function pe(pos: number, d: number): number {
  const i2 = 2 * Math.floor(d / 2)
  const denom = Math.pow(10000, i2 / NDIM)
  return d % 2 === 0 ? Math.sin(pos / denom) : Math.cos(pos / denom)
}
const STEP_MS = 130

export function PositionalEncodingAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [cols, setCols] = useState(0)
  const colsRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    colsRef.current = cols
  }, [cols])

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
    const shown = colsRef.current

    const ox = 78
    const oy = 56
    const gw = Math.min(cssW - ox - 150, 360)
    const gh = cssH - oy - 44
    const cw = gw / NDIM
    const ch = gh / NPOS

    for (let p = 0; p < NPOS; p++)
      for (let d = 0; d < NDIM; d++) {
        if (d >= shown) continue
        const v = pe(p, d)
        const t = Math.abs(v)
        ctx.fillStyle = v >= 0 ? `rgba(245,158,11,${0.15 + t * 0.8})` : `rgba(59,130,246,${0.15 + t * 0.8})`
        ctx.fillRect(ox + d * cw, oy + p * ch, cw + 0.5, ch + 0.5)
      }
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, gw, gh)
    // 轴标
    ctx.fillStyle = MUT
    ctx.font = "10px ui-sans-serif, system-ui"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("维度 dim (频率高 → 低)", ox + gw / 2, oy + gh + 8)
    ctx.save()
    ctx.translate(ox - 30, oy + gh / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText("位置 pos →", 0, 0)
    ctx.restore()

    // 右侧：当前维度的正弦波（说明频率随维度变化）
    const wx = ox + gw + 28
    const ww = cssW - wx - 30
    if (ww > 60 && shown > 0) {
      const d = Math.min(shown - 1, NDIM - 1)
      const wyTop = oy + 10
      const wyH = 70
      const wyMid = wyTop + wyH / 2
      ctx.fillStyle = d % 2 === 0 ? "#f59e0b" : "#3b82f6"
      ctx.font = "600 11px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(`维度 ${d}：${d % 2 === 0 ? "sin" : "cos"}（${d < 4 ? "高频" : d > NDIM - 6 ? "低频" : "中频"}）`, wx, wyTop - 6)
      ctx.strokeStyle = d % 2 === 0 ? "#f59e0b" : "#3b82f6"
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let p = 0; p <= NPOS; p++) {
        const x = wx + (p / NPOS) * ww
        const y = wyMid - pe(p, d) * (wyH / 2)
        if (p === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.fillStyle = MUT
      ctx.font = "10px ui-sans-serif, system-ui"
      ctx.fillText("沿位置看该维取值", wx, wyTop + wyH + 14)
      // 取一个位置的编码列（指纹）
      if (shown >= NDIM) {
        const pp = 6
        const fy = wyTop + wyH + 40
        ctx.fillStyle = FG
        ctx.font = "11px ui-sans-serif, system-ui"
        ctx.fillText(`位置 ${pp} 的编码 = 一串独特指纹`, wx, fy)
        for (let d2 = 0; d2 < NDIM; d2++) {
          const v = pe(pp, d2)
          const t = Math.abs(v)
          ctx.fillStyle = v >= 0 ? `rgba(245,158,11,${0.2 + t * 0.8})` : `rgba(59,130,246,${0.2 + t * 0.8})`
          ctx.fillRect(wx + d2 * (ww / NDIM), fy + 8, ww / NDIM + 0.5, 16)
        }
      }
    }

    // 顶部标题（避开左上角缩放控件 → x≥118）
    ctx.fillStyle = FG
    ctx.font = "600 13px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("位置编码：用不同频率的 sin/cos 给每个位置一个独特指纹", 118, 28)
  }, [applyViewport])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (colsRef.current < NDIM) setCols((v) => v + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const done = cols >= NDIM
  const handleReset = useCallback(() => {
    setPlaying(false)
    setCols(0)
  }, [])
  const togglePlay = useCallback(() => {
    if (done) {
      setCols(0)
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
        NDIM,
        [
          "Transformer 的自注意力有个软肋:它本身分不清词的先后顺序。你把句子里的词打乱重排,它算出来的结果是一样的。位置编码,就是来补这个短板的:给每一个位置,生成一个独一无二的「数字指纹」,加到词向量上,把顺序信息塞进去。",
          "经典做法是用一组不同频率的正弦和余弦。我们一列一列地填这张热力图,每一列对应向量的一个维度。靠前的维度,频率很高,所以沿着位置方向看,条纹密密麻麻、变化很快。",
          "越往后的维度,频率越低,变化越慢,到最后几列几乎是平缓的渐变。高频负责区分相邻的细微位置,低频负责表示大跨度的位置,各管一段。",
          "这样一来,每一个位置——也就是热力图的每一行——都拿到了一串独一无二的编码指纹。而且相邻位置的指纹很接近、相隔远的差别大,任意两个位置的相对距离还能用固定的线性变换表示出来。这就是为什么 Transformer 不靠循环结构,也能理解词的顺序。",
        ],
        (i) => setCols(Math.min(NDIM, i + 1))
      ),
  })

  const caption = done
    ? "热力图完成：每行(位置)都是独特编码，相邻行相近。让无序的注意力获得位置信息。"
    : `已填 ${cols}/${NDIM} 个维度：靠前维度频率高(条纹密)、靠后频率低(渐变慢)。PE=sin/cos(pos/10000^(2i/d))。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          dim {cols}/{NDIM}
        </div>
      </div>
      {!lecture && <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}`}>{caption}</div>}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "逐维填充"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=正 · 蓝=负 · 列=维度(频率)</span>
        </div>
      )}
    </div>
  )
}
