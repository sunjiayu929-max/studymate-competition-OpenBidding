/**
 * 概念动画 · 生成对抗网络 GAN（机器学习 · 生成模型）
 * ------------------------------------------------------------------
 * 真实 1D 对抗训练：
 *   生成器 G(z)=a·z+b（z~N(0,1) → 假样本 ~ N(b, a²)）想骗过判别器
 *   判别器 D(x)=σ(w·x+c) 想分辨真(绿)/假(橙)
 *   交替做真实梯度更新：D 学着区分、G 学着把分布挪向真实
 *   最终假分布≈真分布、D 处处≈0.5（分不清）→ 纳什均衡
 * 确定性训练并录快照，逐快照看两分布从分离走向重合。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 950
const MU_R = 2.2
const SG_R = 0.7
const M = 48
const CHECKPOINTS = [0, 2, 5, 10, 20, 40, 80, 160, 320]
const sig = (v: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))))

function lcg(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
function normals(n: number, mu: number, sg: number, rnd: () => number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-9, rnd())
    const u2 = rnd()
    out.push(mu + sg * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2))
  }
  return out
}

interface Snap {
  a: number
  b: number
  w: number
  c: number
  iter: number
}
function train(): Snap[] {
  const rnd = lcg(7)
  const real = normals(M, MU_R, SG_R, rnd)
  const noise = normals(M, 0, 1, rnd)
  let a = 0.9
  let b = -1.2 // 假分布初始 ~ N(-1.2, 0.9²)，离真实远
  let w = 0.1
  let c = 0
  const lrD = 0.08
  const lrG = 0.06
  const snaps: Snap[] = [{ a, b, w, c, iter: 0 }]
  let cp = 1
  for (let it = 1; it <= CHECKPOINTS[CHECKPOINTS.length - 1]; it++) {
    // 判别器：梯度上升 log D(real) + log(1-D(fake))，跑 2 步
    for (let k = 0; k < 2; k++) {
      let gw = 0
      let gc = 0
      for (const x of real) {
        const d = sig(w * x + c)
        gw += (1 - d) * x
        gc += 1 - d
      }
      for (const z of noise) {
        const xf = a * z + b
        const d = sig(w * xf + c)
        gw += -d * xf
        gc += -d
      }
      w += (lrD * gw) / (2 * M)
      c += (lrD * gc) / (2 * M)
    }
    // 生成器：梯度上升 log D(fake)（非饱和），调 a,b 把假样本推向 D 认为真的方向
    let ga = 0
    let gb = 0
    for (const z of noise) {
      const xf = a * z + b
      const d = sig(w * xf + c)
      const common = (1 - d) * w
      ga += common * z
      gb += common
    }
    a += (lrG * ga) / M
    b += (lrG * gb) / M
    if (Math.abs(a) < 0.2) a = a < 0 ? -0.2 : 0.2
    if (it === CHECKPOINTS[cp]) {
      snaps.push({ a, b, w, c, iter: it })
      cp++
    }
  }
  return snaps
}

export function GanAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const snapsRef = useRef<Snap[]>(train())
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
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const sn = snapsRef.current[Math.min(posRef.current, total - 1)]
    const af = Math.abs(sn.a)

    const padL = 40
    const padR = 30
    const padB = 44
    const padT = 40
    const plotW = cssW - padL - padR
    const plotH = cssH - padT - padB
    const xMin = -5
    const xMax = 6
    const X = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW
    const baseY = padT + plotH
    const pdf = (x: number, mu: number, sg: number) => Math.exp(-((x - mu) ** 2) / (2 * sg * sg)) / (sg * Math.sqrt(2 * Math.PI))
    const peak = pdf(0, 0, Math.min(SG_R, af)) // 用于纵向缩放
    const H = (v: number) => baseY - (v / peak) * (plotH * 0.78)

    // 轴
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, baseY)
    ctx.lineTo(cssW - padR, baseY)
    ctx.stroke()

    const curve = (mu: number, sg: number, color: string, fill: boolean) => {
      ctx.beginPath()
      for (let px = padL; px <= cssW - padR; px += 2) {
        const x = xMin + ((px - padL) / plotW) * (xMax - xMin)
        const y = H(pdf(x, mu, sg))
        if (px === padL) ctx.moveTo(px, y)
        else ctx.lineTo(px, y)
      }
      if (fill) {
        ctx.lineTo(cssW - padR, baseY)
        ctx.lineTo(padL, baseY)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
    }
    // 真实(绿) + 生成(橙)
    curve(MU_R, SG_R, isDark ? "rgba(16,185,129,0.22)" : "rgba(16,185,129,0.18)", true)
    curve(MU_R, SG_R, "#10b981", false)
    curve(sn.b, af, isDark ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.16)", true)
    curve(sn.b, af, "#f59e0b", false)

    // 判别器 D(x)（紫，0..1 映射到上半）
    ctx.strokeStyle = "#a855f7"
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    for (let px = padL; px <= cssW - padR; px += 2) {
      const x = xMin + ((px - padL) / plotW) * (xMax - xMin)
      const d = sig(sn.w * x + sn.c)
      const y = baseY - d * (plotH * 0.8)
      if (px === padL) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    // D=0.5 参考线
    ctx.strokeStyle = isDark ? "#52525b" : "#cbd5e1"
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(padL, baseY - 0.5 * plotH * 0.8)
    ctx.lineTo(cssW - padR, baseY - 0.5 * plotH * 0.8)
    ctx.stroke()
    ctx.setLineDash([])

    // 图例
    const leg = [
      ["真实数据", "#10b981"],
      ["生成器造的", "#f59e0b"],
      ["判别器 D(x)", "#a855f7"],
    ] as const
    let lx = padL + 6
    ctx.font = "600 11px ui-sans-serif, system-ui"
    ctx.textBaseline = "middle"
    for (const [t, col] of leg) {
      ctx.fillStyle = col
      ctx.fillRect(lx, padT - 24, 14, 4)
      ctx.textAlign = "left"
      ctx.fillText(t, lx + 18, padT - 22)
      lx += 18 + ctx.measureText(t).width + 22
    }

    // HUD
    ctx.fillStyle = MUT
    ctx.font = "11px ui-monospace, monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`迭代 ${sn.iter} · 生成分布≈N(${sn.b.toFixed(2)}, ${af.toFixed(2)}²) · 真实 N(${MU_R}, ${SG_R}²)`, cssW - padR, cssH - 18)
    // x 刻度
    ctx.textAlign = "center"
    for (let x = -4; x <= 6; x += 2) {
      ctx.fillStyle = MUT
      ctx.fillText(String(x), X(x), baseY + 16)
    }
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
    buildBeats: () => {
      const snaps = snapsRef.current
      const last = snaps[snaps.length - 1]
      return chunkedBeats(
        total,
        [
          "生成对抗网络 GAN,让两个网络互相博弈。一个叫生成器,负责凭空造数据;一个叫判别器,负责分辨真假。绿色是真实数据的分布,橙色是生成器一开始造出来的——你看,差得十万八千里。",
          "先训练判别器。紫色这条线,是它给每个位置打的「这是真数据」的概率。真实数据扎堆的地方它打得很高、生成器造假的地方打得很低,轻轻松松就识破了。",
          "然后轮到生成器收反馈,它会调整参数,把自己造的分布往「判别器以为是真的」那一侧使劲挪。橙色这一坨,就一点点地朝绿色靠过去。",
          `两边你追我赶地拉锯,反复对抗。到最后,生成器造的分布(中心挪到了约 ${last.b.toFixed(1)})和真实分布大幅重叠;判别器再怎么看也分不清真假,曲线被压平、概率处处趋近 0.5,达到纳什均衡。这就是 GAN,图像生成、人脸合成、超分辨率的基础。`,
        ],
        (i) => setPos(i)
      )
    },
  })

  const sn = snapsRef.current[Math.min(pos, total - 1)]
  const caption = done
    ? `对抗收敛：生成分布≈N(${sn.b.toFixed(2)}, ${Math.abs(sn.a).toFixed(2)}²) 与真实 N(${MU_R}, ${SG_R}²) 大幅重叠，判别器处处≈0.5 分不清 → 纳什均衡。`
    : pos === 0
      ? "GAN：生成器(橙)造数据想骗过判别器(紫)，判别器想分辨真(绿)/假。初始两分布相距甚远。点播放看对抗训练。"
      : `迭代 ${sn.iter}：判别器(紫)区分真假，生成器把橙色分布往真实(绿)挪。`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          迭代 {sn.iter}
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
            <SkipForward className="size-4" /> 单步（+迭代）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">绿=真实 · 橙=生成 · 紫=判别器</span>
        </div>
      )}
    </div>
  )
}
