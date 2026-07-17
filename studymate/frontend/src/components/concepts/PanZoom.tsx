/**
 * 思维导图式平移 / 缩放视口（方案 A：CSS transform 视口壳）
 * ------------------------------------------------------------------
 * 套在概念动画外层，给「拖拉拽 + 放大放小」能力，一处改动覆盖全部动画：
 *   - 滚轮（按住 Ctrl/⌘，或触控板捏合）→ 朝光标处缩放
 *   - 放大后空白处拖拽 → 平移；双指捏合 → 缩放（移动端 / 触屏）
 *   - 左上角 −/百分比/＋ 按钮；双击复位
 *
 * 设计要点（不回归现有交互）：
 *   1. **scale≈1 时完全不接管指针**：内部滑块 / 按钮 / 画布自带拖拽照常工作，
 *      只有用户主动放大（scale>1）后才启用拖拽平移 —— 此时「导航模式」才合理。
 *   2. 拖拽落在 input/button/a 等控件上时不平移，保证放大后控件仍可操作。
 *   3. 动画是 <canvas> 位图，放大 >1x 会有轻微栅格糊（方案 A 的已知取舍）；
 *      平移与缩小始终清晰，演示「指着讲」足够。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ZoomIn, ZoomOut } from "lucide-react"

const MIN = 0.5
const MAX = 6

type T = { s: number; x: number; y: number }

export function PanZoom({ children, className = "" }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 })
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pan = useRef<{ id: number; x: number; y: number } | null>(null)
  const pinch = useRef<{ dist: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s))

  // 朝视口内某点 (cx, cy) 缩放：保证该点下的内容缩放前后不动
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setT((p) => {
      const s = clamp(p.s * factor)
      const f = s / p.s
      return { s, x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f }
    })
  }, [])

  const reset = useCallback(() => setT({ s: 1, x: 0, y: 0 }), [])

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = wrapRef.current
      if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
    },
    [zoomAt]
  )

  // 原生非被动 wheel：按住 Ctrl/⌘（触控板捏合也走这条）才缩放，普通滚轮留给页面滚动
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
      pan.current = null
      setGrabbing(false)
      return
    }
    // 单指拖拽平移：仅在已放大、且没落在交互控件上时启用 → 不抢内部滑块 / 按钮 / 画布拖拽
    if (tRef.current.s <= 1.001) return
    if ((e.target as HTMLElement).closest("input,button,a,select,textarea,[data-no-pan]")) return
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    setGrabbing(true)
    wrapRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const cur = local(e)
    pointers.current.set(e.pointerId, cur)

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const factor = dist / (pinch.current.dist || dist)
      pinch.current = { dist }
      zoomAt(factor, cx, cy)
      return
    }

    if (pan.current && pan.current.id === e.pointerId) {
      const dx = e.clientX - pan.current.x
      const dy = e.clientY - pan.current.y
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
    }
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pan.current?.id === e.pointerId) {
      pan.current = null
      setGrabbing(false)
    }
  }

  const pannable = t.s > 1.001

  return (
    <div
      ref={wrapRef}
      className={`group relative overflow-hidden ${pannable ? "select-none" : ""} ${className}`}
      style={{ touchAction: pannable ? "none" : "auto", cursor: pannable ? (grabbing ? "grabbing" : "grab") : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={() => {
        if (pannable) reset()
      }}
    >
      <div style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "0 0", willChange: "transform" }}>
        {children}
      </div>

      {/* 缩放控件：默认隐形，悬停 / 放大后浮现 */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute left-2 top-2 z-20 flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#18232D]/78 p-0.5 text-white shadow-lg backdrop-blur transition-opacity ${
          pannable ? "opacity-100" : "opacity-80 hover:opacity-100 focus-within:opacity-100"
        }`}
      >
        <button
          type="button"
          data-no-pan
          onClick={() => zoomCenter(1 / 1.25)}
          title="缩小"
          aria-label="缩小画布"
          className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
        >
          <ZoomOut className="size-4" />
        </button>
        <button
          type="button"
          data-no-pan
          onClick={reset}
          title="复位（双击画面也可）"
          aria-label="恢复画布缩放"
          className="min-h-8 min-w-[3rem] rounded-lg px-1 text-xs tabular-nums transition-colors hover:bg-white/15"
        >
          {Math.round(t.s * 100)}%
        </button>
        <button
          type="button"
          data-no-pan
          onClick={() => zoomCenter(1.25)}
          title="放大"
          aria-label="放大画布"
          className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>
    </div>
  )
}
