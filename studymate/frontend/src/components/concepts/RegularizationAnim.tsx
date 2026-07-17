/**
 * 概念动画 · L1 / L2 正则化（机器学习）
 * ------------------------------------------------------------------
 * 经典「约束区相切」几何图，全部由闭式解实算：
 *   损失 = 0.5·Σ hᵢ(wᵢ−aᵢ)²（等高线为椭圆，中心 a = 无正则最小二乘解）
 *   - L2(岭回归)  min 损失 + λ‖w‖²  → wᵢ = hᵢaᵢ/(hᵢ+2λ)，整体按比例缩小，约束区是圆，权重不会恰好为 0
 *   - L1(Lasso)   min 损失 + λ‖w‖₁  → wᵢ = sign(aᵢ)·max(0,|aᵢ|−λ/hᵢ)，约束区是菱形，尖角落在坐标轴 → 权重被精确压成 0（稀疏）
 * 拖 λ 看解如何收缩；切 L1 看某权重在某个 λ 处突然变 0。讲课模式自动扫 λ。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

const H: [number, number] = [1.0, 0.45] // 两个方向的曲率（各向异性 → 椭圆）
const A: [number, number] = [2.3, 1.1] // 无正则最小二乘解（两维都非零）
const MAX_LAM = 3
const MID_X = 1.2
const MID_Y = 0.55
const VIEW_W = 4.0
const VIEW_H = 2.7

type Mode = "l1" | "l2"

function solve(mode: Mode, lam: number): [number, number] {
  if (mode === "l2") return [(H[0] * A[0]) / (H[0] + 2 * lam), (H[1] * A[1]) / (H[1] + 2 * lam)]
  return [
    Math.sign(A[0]) * Math.max(0, Math.abs(A[0]) - lam / H[0]),
    Math.sign(A[1]) * Math.max(0, Math.abs(A[1]) - lam / H[1]),
  ] as [number, number]
}

export function RegularizationAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [mode, setMode] = useState<Mode>("l1")
  const [lam, setLam] = useState(0.6)
  const [playing, setPlaying] = useState(false)

  const w = useMemo(() => solve(mode, lam), [mode, lam])
  const sparse = mode === "l1" && (Math.abs(w[0]) < 1e-6 || Math.abs(w[1]) < 1e-6)

  const wRef = useRef(w)
  const modeRef = useRef(mode)
  wRef.current = w
  modeRef.current = mode

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

    const pad = 22
    const scale = Math.min((cssW - pad * 2) / VIEW_W, (cssH - pad * 2) / VIEW_H)
    const sx = (x: number) => cssW / 2 + (x - MID_X) * scale
    const sy = (y: number) => cssH / 2 - (y - MID_Y) * scale
    const isDark = document.documentElement.classList.contains("dark")
    const wv = wRef.current
    const md = modeRef.current

    // 坐标轴（w1=0 / w2=0），稀疏发生在轴上
    ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx(-1), sy(0))
    ctx.lineTo(sx(3.4), sy(0))
    ctx.moveTo(sx(0), sy(-1))
    ctx.lineTo(sx(0), sy(2.2))
    ctx.stroke()

    // 损失等高线椭圆（中心 a），高亮过 w* 的那条
    const cStar = 0.5 * (H[0] * (wv[0] - A[0]) ** 2 + H[1] * (wv[1] - A[1]) ** 2)
    for (const c of [cStar * 0.35, cStar, cStar * 1.9, cStar * 3.1].filter((v) => v > 1e-4)) {
      const rx = Math.sqrt((2 * c) / H[0]) * scale
      const ry = Math.sqrt((2 * c) / H[1]) * scale
      ctx.strokeStyle = Math.abs(c - cStar) < 1e-6 ? "#6366f1" : isDark ? "#3f3f46" : "#e4e4e7"
      ctx.lineWidth = Math.abs(c - cStar) < 1e-6 ? 2 : 1
      ctx.beginPath()
      ctx.ellipse(sx(A[0]), sy(A[1]), rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 约束区（过 w* 的 L_p 球）：L2=圆，L1=菱形
    ctx.strokeStyle = "#f59e0b"
    ctx.fillStyle = isDark ? "rgba(245,158,11,0.10)" : "rgba(245,158,11,0.12)"
    ctx.lineWidth = 2
    ctx.beginPath()
    if (md === "l2") {
      const t = Math.hypot(wv[0], wv[1]) * scale
      ctx.ellipse(sx(0), sy(0), t, t, 0, 0, Math.PI * 2)
    } else {
      const t = Math.abs(wv[0]) + Math.abs(wv[1])
      ctx.moveTo(sx(t), sy(0))
      ctx.lineTo(sx(0), sy(t))
      ctx.lineTo(sx(-t), sy(0))
      ctx.lineTo(sx(0), sy(-t))
      ctx.closePath()
    }
    ctx.fill()
    ctx.stroke()

    // a（无正则解，空心）
    ctx.strokeStyle = isDark ? "#a1a1aa" : "#71717a"
    ctx.fillStyle = isDark ? "#18181b" : "#fff"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx(A[0]), sy(A[1]), 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // w*（正则解，实心靛蓝；稀疏时变翠绿强调）
    const onAxis = md === "l1" && (Math.abs(wv[0]) < 1e-6 || Math.abs(wv[1]) < 1e-6)
    ctx.fillStyle = onAxis ? "#10b981" : "#6366f1"
    ctx.beginPath()
    ctx.arc(sx(wv[0]), sy(wv[1]), 6, 0, Math.PI * 2)
    ctx.fill()
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

  // 自动扫 λ
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setLam((l) => {
        const next = Math.round((l + 0.1) * 10) / 10
        if (next >= MAX_LAM) {
          setPlaying(false)
          return MAX_LAM
        }
        return next
      })
    }, 260)
    return () => clearInterval(id)
  }, [playing])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setLam(0.6)
  }, [])

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && lam >= MAX_LAM) setLam(0)
      return !p
    })
  }, [lam])

  // 讲课模式：4 拍（L2 圆约束 → L2 整体缩小不为 0 → L1 菱形尖角 → L1 命中坐标轴稀疏）；apply 切 mode + 设 λ
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => setPlaying(false),
    buildBeats: () => {
      const go = (m: Mode, v: number) => {
        setMode(m)
        modeRef.current = m
        setLam(v)
      }
      return [
        {
          apply: () => go("l2", 0.5),
          text: "正则化是给模型套个紧箍咒，防止它把训练数据背得太死、过拟合。先看 L2，也叫岭回归：它在原本的损失之外，再加一项对权重大小的惩罚，约束区就是这个橙色的圆。",
        },
        {
          apply: () => go("l2", 2.5),
          text: "把惩罚强度 λ 调大，你看那个解被整体往原点拉、按比例缩小。但请注意：它只是变小，永远不会恰好等于 0。",
        },
        {
          apply: () => go("l1", 0.4),
          text: "再看 L1，也叫 Lasso。它的约束区不是圆，而是一个带尖角的菱形——而这几个尖角，正好都落在坐标轴上。",
        },
        {
          apply: () => go("l1", 1.0),
          text: "继续把 λ 调大，解一滑，就滑到了菱形的尖角上——某个权重被精确地压成了 0！这等于自动把那个特征给剔除了。这种稀疏，正是 L1 区别于 L2 最大的本事。",
        },
      ]
    },
  })

  const regimeKey: "l2" | "l1" | "l1sparse" = mode === "l2" ? "l2" : sparse ? "l1sparse" : "l1"
  const cap = CAPTIONS[regimeKey]
  const capColor = sparse ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]"

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
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1 leading-relaxed">
          <div>λ = {lam.toFixed(1)}</div>
          <div>w = ({w[0].toFixed(2)}, {w[1].toFixed(2)})</div>
          <div>{mode === "l1" ? "‖w‖₁" : "‖w‖²"} = {(mode === "l1" ? Math.abs(w[0]) + Math.abs(w[1]) : w[0] ** 2 + w[1] ** 2).toFixed(2)}</div>
        </div>
      </div>

      {/* 讲课模式下隐藏自带字幕条/控件/提示，交给播放器 */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${capColor}`}>
        <span className="font-medium">{cap.title}</span>
        <span className="text-[var(--muted-foreground)]"> —— {cap.body}</span>
      </div>
      )}

      {!lecture && (<>
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden">
          {(["l1", "l2"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m ? "bg-indigo-500 text-white" : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {m === "l1" ? "L1 (Lasso)" : "L2 (Ridge)"}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "暂停" : lam >= MAX_LAM ? "重新扫 λ" : "自动扫 λ"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
            正则强度 λ = <span className="font-mono text-[var(--foreground)]">{lam.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={MAX_LAM}
            step={0.1}
            value={lam}
            onChange={(e) => {
              setPlaying(false)
              setLam(parseFloat(e.target.value))
            }}
            className="w-32 accent-amber-500"
          />
        </div>
      </div>

      <div className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
        蓝椭圆=损失等高线（中心 ○ 是无正则解 a）· 橙色=正则约束区（L2 圆 / L1 菱形）· 实心点=正则解 w*。
        切到 L1 拖大 λ，看 w* 滑到尖角、某权重变 0。
      </div>
      </>)}
    </div>
  )
}

const CAPTIONS: Record<"l2" | "l1" | "l1sparse", { title: string; body: string }> = {
  l2: {
    title: "L2 正则（岭回归）",
    body: "惩罚 λ‖w‖²：约束区是圆，把权重整体按比例缩小但都不会恰好为 0——抗共线、稳系数。",
  },
  l1: {
    title: "L1 正则（Lasso）",
    body: "惩罚 λ‖w‖₁：约束区是带尖角的菱形。增大 λ 把解往原点推，准备让某个权重触轴。",
  },
  l1sparse: {
    title: "命中坐标轴 → 稀疏！✓",
    body: "菱形尖角落在坐标轴上，某权重被精确压成 0，相当于自动剔除该特征——这正是 L1 区别于 L2 的核心。",
  },
}
