/**
 * Canvas 真·视口（缩放 / 平移）—— 思维导图式导航的通用底座
 * ------------------------------------------------------------------
 * 与外层 PanZoom（CSS 放大位图，会糊、划出去是空白）不同：这个把缩放/平移
 * 喂进动画自己的 draw()，每帧按新变换重绘 → 清晰，且平移能露出「视区外」的点和线。
 *
 * 用法：
 *   const vp = useCanvasViewport(canvasRef)
 *   // draw() 里：setTransform(dpr) → clearRect → vp.apply(ctx) → 照常画场景
 *   <canvas ref={canvasRef} {...vp.canvasProps} />
 *   vp.scale / vp.reset() / vp.zoomBy(f) 给缩放控件用
 *
 * 交互：拖拽平移、Ctrl/⌘+滚轮（或触控板捏合）朝光标缩放、双指捏合、双击复位。
 * 适合「画布内没有自带指针交互」的动画（图/树/网络）；有内部拖拽的动画需另行协调。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

const MIN = 0.3
const MAX = 8

type T = { s: number; x: number; y: number }

export function useCanvasViewport(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 })
  const tRef = useRef(t)
  tRef.current = t
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pan = useRef<{ id: number; x: number; y: number } | null>(null)
  const pinch = useRef<{ dist: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s))

  // 朝画布内某点 (cx, cy, CSS px) 缩放：该点下的内容缩放前后不动
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setT((p) => {
      const s = clamp(p.s * factor)
      const f = s / p.s
      return { s, x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f }
    })
  }, [])

  const reset = useCallback(() => setT({ s: 1, x: 0, y: 0 }), [])

  const zoomBy = useCallback(
    (factor: number) => {
      const el = canvasRef.current
      if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
    },
    [canvasRef, zoomAt]
  )

  // 非被动 wheel：滚轮直接朝光标缩放（思维导图手感）；触控板捏合走 ctrlKey 同一条路。
  // 光标在画布上时滚轮缩放、不再滚页（要滚页把鼠标移开画布即可）。
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [canvasRef, zoomAt])

  const localOf = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, localOf(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
      pan.current = null
      setGrabbing(false)
      return
    }
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    setGrabbing(true)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, localOf(e))

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(dist / (pinch.current.dist || dist), (a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch.current = { dist }
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

  // draw() 调用：把当前缩放/平移叠到 ctx（在 setTransform(dpr) + clearRect 之后）
  const apply = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { s, x, y } = tRef.current
      ctx.translate(x, y)
      ctx.scale(s, s)
    },
    []
  )

  const zoomed = t.s > 1.001 || t.x !== 0 || t.y !== 0

  return {
    apply,
    scale: t.s,
    zoomed,
    reset,
    zoomBy,
    canvasProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onDoubleClick: () => {
        if (zoomed) reset()
      },
      style: { cursor: grabbing ? "grabbing" : "grab", touchAction: "none" as const },
    },
  }
}

export type CanvasViewport = ReturnType<typeof useCanvasViewport>
