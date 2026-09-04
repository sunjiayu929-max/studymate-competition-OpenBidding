import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { LockKeyhole, Maximize2, Minimize2, Minus, Move, Plus, UnlockKeyhole } from "lucide-react"

import { cn } from "@/lib/utils"

interface InteractiveCanvasProps {
  children: ReactNode
  canvasWidth: number
  canvasHeight: number
  viewportHeight: number
  label: string
  className?: string
}

const MIN_SCALE = .55
const MAX_SCALE = 1.8
const SCALE_STEP = .15

export function InteractiveCanvas({ children, canvasWidth, canvasHeight, viewportHeight, label, className }: InteractiveCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 12, y: 12 })
  const [dragging, setDragging] = useState(false)
  const [scaleLocked, setScaleLocked] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const fit = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const availableHeight = viewport.clientHeight || viewportHeight
    const nextScale = Math.max(MIN_SCALE, Math.min(1, (viewport.clientWidth - 24) / canvasWidth, (availableHeight - 24) / canvasHeight))
    setScale(nextScale)
    setPosition({ x: 12, y: Math.max(12, (availableHeight - canvasHeight * nextScale) / 2) })
  }, [canvasHeight, canvasWidth, viewportHeight])

  const reset = useCallback(() => {
    setScale(1)
    setPosition({ x: 12, y: 12 })
  }, [])

  useEffect(() => {
    reset()
  }, [canvasHeight, canvasWidth, reset, viewportHeight])

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    if (!fullscreen || scaleLocked) return
    const frame = requestAnimationFrame(() => requestAnimationFrame(fit))
    return () => cancelAnimationFrame(frame)
  }, [fit, fullscreen, scaleLocked])

  const toggleBestView = async () => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement === container) {
      await document.exitFullscreen()
      return
    }
    if (container.requestFullscreen) {
      await container.requestFullscreen()
      return
    }
    fit()
  }

  const zoomTo = (nextScale: number, anchorX?: number, anchorY?: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const ax = anchorX ?? rect.width / 2
    const ay = anchorY ?? rect.height / 2
    const ratio = clamped / scale
    setPosition((current) => ({ x: Math.round(ax - (ax - current.x) * ratio), y: Math.round(ay - (ay - current.y) * ratio) }))
    setScale(clamped)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY })
  }

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div ref={containerRef} className={cn("interactive-canvas relative overflow-hidden", scaleLocked && "is-scale-locked", className)}>
      <div className="interactive-canvas-toolbar absolute right-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-[#CCD8E8] bg-white/95 p-1 shadow-[0_8px_22px_rgba(35,57,86,.14)] backdrop-blur" aria-label={`${label}画布控制`}>
        <button type="button" onClick={() => zoomTo(scale - SCALE_STEP)} disabled={scaleLocked} className="interactive-canvas-button disabled:cursor-not-allowed disabled:opacity-35" aria-label="缩小画布"><Minus className="size-4" /></button>
        <span className="min-w-14 px-2 py-2 text-center text-xs font-extrabold text-[#36506D]" aria-label={`当前画布比例百分之${Math.round(scale * 100)}`}>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomTo(scale + SCALE_STEP)} disabled={scaleLocked} className="interactive-canvas-button disabled:cursor-not-allowed disabled:opacity-35" aria-label="放大画布"><Plus className="size-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-[#DCE4EF]" />
        <button type="button" onClick={reset} disabled={scaleLocked} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-extrabold text-[#36506D] transition-colors hover:bg-[#EDF3FA] disabled:cursor-not-allowed disabled:opacity-35" aria-label="恢复画布到一比一比例"><LockKeyhole className="size-3.5" />1:1</button>
        <button type="button" onClick={() => void toggleBestView()} disabled={scaleLocked} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-extrabold text-[#36506D] transition-colors hover:bg-[#EDF3FA] disabled:cursor-not-allowed disabled:opacity-35" aria-label={fullscreen ? "退出全屏画板" : "全屏并调整到最适显示比例"}>{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{fullscreen ? "退出" : "最适"}</button>
        <button type="button" onClick={() => setScaleLocked((locked) => !locked)} className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-extrabold transition-colors", scaleLocked ? "bg-[#DDECF7] text-[#19577F]" : "text-[#526981] hover:bg-[#EDF3FA]")} aria-pressed={scaleLocked} aria-label={scaleLocked ? "解除画布比例锁定" : "锁定当前画布比例"}>{scaleLocked ? <LockKeyhole className="size-3.5" /> : <UnlockKeyhole className="size-3.5" />}{scaleLocked ? "已锁" : "锁定"}</button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-2 rounded-lg border border-[#D7E0EC] bg-white/95 px-3 py-2 text-xs font-bold text-[#52677F] shadow-sm"><Move className="size-3.5" />拖动浏览 · 滚轮缩放</div>
      <div
        ref={viewportRef}
        className={cn("h-full w-full touch-none select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
        style={{ height: fullscreen ? "100vh" : viewportHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={(event) => {
          if (scaleLocked) {
            event.preventDefault()
            const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
            window.scrollBy({ top: event.deltaY * multiplier, left: event.deltaX * multiplier, behavior: "auto" })
            return
          }
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          zoomTo(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP), event.clientX - rect.left, event.clientY - rect.top)
        }}
        tabIndex={0}
        role="group"
        aria-label={`${label}，可拖动、滚轮缩放，也可使用右上角按钮控制`}
      >
        <div className="absolute" style={{ left: Math.round(position.x), top: Math.round(position.y) }}>
          <div style={{ width: canvasWidth, height: canvasHeight, ...(scale === 1 ? {} : { zoom: scale }) }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
