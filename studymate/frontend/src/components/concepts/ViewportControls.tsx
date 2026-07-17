/**
 * 真·视口缩放控件（配合 useCanvasViewport 用）
 * ------------------------------------------------------------------
 * 浮在画布左上角的 −/百分比/＋ 小条。拖拽平移、滚轮/双指缩放、双击复位由 hook 负责，
 * 这里只是给鼠标用户一个兜底入口 + 显示当前倍率。
 */
import { ZoomIn, ZoomOut } from "lucide-react"
import type { CanvasViewport } from "./useCanvasViewport"

export function ViewportControls({ vp }: { vp: CanvasViewport }) {
  return (
    <div className="absolute left-2 top-2 z-10 flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#18232D]/78 p-0.5 text-white shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => vp.zoomBy(0.8)}
        title="缩小"
        aria-label="缩小画布"
        className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
      >
        <ZoomOut className="size-4" />
      </button>
      <button
        type="button"
        onClick={vp.reset}
        title="复位（双击画面也可）"
        aria-label="恢复画布缩放"
        className="min-h-8 min-w-[3rem] rounded-lg px-1 text-xs tabular-nums transition-colors hover:bg-white/15"
      >
        {Math.round(vp.scale * 100)}%
      </button>
      <button
        type="button"
        onClick={() => vp.zoomBy(1.25)}
        title="放大"
        aria-label="放大画布"
        className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-white/15"
      >
        <ZoomIn className="size-4" />
      </button>
    </div>
  )
}
