import { useCallback, useEffect, useRef, useState } from "react"
import { Transformer } from "markmap-lib/no-plugins"
import { Markmap } from "markmap-view"
import { AlertTriangle, Maximize2, Minus, Plus, ChevronsUpDown, ChevronsDownUp, Fullscreen, Network } from "lucide-react"

interface MindMapViewProps {
  markdown: string
  /** 容器高度，默认 480px。详情页推荐 70vh */
  height?: string
  /** 默认展开层级（0=只看 root；1=root+主分支；2=root+主分支+子分支标题，子分支内容折叠）默认 2 */
  defaultExpandLevel?: number
}

const transformer = new Transformer()
const PAPER_BRANCH_COLORS = ["#244C66", "#B85C3E", "#6F8A69", "#B1842C", "#7E6B83"]

interface MMNode {
  payload?: { fold?: number; [k: string]: unknown }
  children?: MMNode[]
}

/** 递归设置 fold：depth >= foldFrom 的节点收起 */
function applyFold(node: MMNode, foldFrom: number, depth = 0) {
  if (!node) return
  if (foldFrom >= 0 && depth >= foldFrom && node.children && node.children.length > 0) {
    node.payload = { ...(node.payload || {}), fold: 1 }
  } else if (node.payload?.fold) {
    // 全部展开模式：清掉 fold
    node.payload = { ...node.payload, fold: 0 }
  }
  node.children?.forEach((c) => applyFold(c, foldFrom, depth + 1))
}

export function MindMapView({ markdown, height = "480px", defaultExpandLevel = 2 }: MindMapViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const mmRef = useRef<Markmap | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [renderError, setRenderError] = useState("")

  // 渲染 / 重渲染
  const renderMarkmap = useCallback((foldFrom: number) => {
    if (!svgRef.current) return
    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current, {
        maxWidth: 200,
        spacingHorizontal: 70,
        spacingVertical: 10,
        paddingX: 10,
        fitRatio: 0.88,
        duration: 350,
        color: (node) => PAPER_BRANCH_COLORS[(node.state.depth || 0) % PAPER_BRANCH_COLORS.length],
        lineWidth: (node) => Math.max(1.25, 3.5 - node.state.depth * 0.6),
      })
    }
    try {
      const { root } = transformer.transform(markdown || "# 等待生成")
      applyFold(root as MMNode, foldFrom)
      mmRef.current.setData(root)
      mmRef.current.fit()
      setRenderError("")
    } catch {
      // 流式过程中 Markdown 可能短暂不完整，保留上一帧并给出可理解的状态。
      setRenderError("当前内容尚未形成完整层级，已保留上一版导图")
    }
  }, [markdown])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => renderMarkmap(defaultExpandLevel))
    return () => window.cancelAnimationFrame(frame)
  }, [renderMarkmap, defaultExpandLevel])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || typeof ResizeObserver === "undefined") return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        void mmRef.current?.fit()
      })
    })
    observer.observe(wrapper)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => () => {
    mmRef.current?.destroy()
    mmRef.current = null
  }, [])

  // 全屏 API：把 wrapper 撑满屏幕
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const handleFit = useCallback(() => mmRef.current?.fit(), [])
  const handleZoom = useCallback((scale: number) => {
    mmRef.current?.rescale(scale)
  }, [])
  const handleExpandAll = useCallback(() => renderMarkmap(-1), [renderMarkmap])
  const handleCollapseAll = useCallback(() => renderMarkmap(1), [renderMarkmap])
  const handleFullscreen = useCallback(async () => {
    const el = wrapperRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.()
      } else {
        await document.exitFullscreen?.()
      }
      setRenderError("")
      // 全屏切换后稍延迟 fit 一次，让 SVG 重新自适应
      setTimeout(() => void mmRef.current?.fit(), 200)
    } catch {
      setRenderError("当前浏览器未允许进入全屏，仍可继续缩放和拖拽查看")
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="relative w-full overflow-hidden rounded-[22px] border border-[#CFC8B9] bg-[#FBF8F0] shadow-[inset_0_0_0_1px_rgba(255,255,255,.55)]"
      style={{ height: isFullscreen ? "100dvh" : height }}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA]/90 px-3 py-2 shadow-[0_5px_14px_rgba(24,35,45,.06)] backdrop-blur">
        <span className="grid size-7 place-items-center rounded-lg bg-[#F4E8E2] text-[#9A4E35]"><Network className="size-3.5" /></span>
        <span><strong className="block text-[10px] text-[#243746]">交互式知识结构</strong><span className="block text-[9px] text-[#7A817F]">本次仅渲染当前导图</span></span>
      </div>

      <svg ref={svgRef} role="img" aria-label="可拖拽、缩放和折叠的交互式思维导图" className="h-full w-full" />

      {/* 工具栏 */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA]/90 p-1 shadow-[0_5px_14px_rgba(24,35,45,.08)] backdrop-blur">
        <ToolButton onClick={handleExpandAll} title="全部展开">
          <ChevronsUpDown className="size-3.5" />
        </ToolButton>
        <ToolButton onClick={handleCollapseAll} title="只看主分支">
          <ChevronsDownUp className="size-3.5" />
        </ToolButton>
        <div className="mx-1 h-px bg-[#D7D1C4]" />
        <ToolButton onClick={() => handleZoom(1.25)} title="放大">
          <Plus className="size-3.5" />
        </ToolButton>
        <ToolButton onClick={() => handleZoom(0.8)} title="缩小">
          <Minus className="size-3.5" />
        </ToolButton>
        <ToolButton onClick={handleFit} title="自适应">
          <Maximize2 className="size-3.5" />
        </ToolButton>
        <div className="mx-1 h-px bg-[#D7D1C4]" />
        <ToolButton onClick={handleFullscreen} title={isFullscreen ? "退出全屏" : "全屏查看"}>
          <Fullscreen className="size-3.5" />
        </ToolButton>
      </div>

      {/* 左下角提示 */}
      <div className="absolute bottom-3 left-3 max-w-[calc(100%-5.5rem)] rounded-lg border border-[#D7D1C4] bg-[#FFFEFA]/90 px-2.5 py-1 text-[10px] text-[#66717B] backdrop-blur">
        拖拽移动 · 滚轮缩放 · 点击圆点折叠
      </div>

      {renderError ? (
        <div role="status" aria-live="polite" className="absolute bottom-11 left-3 right-3 z-10 flex items-start gap-2 rounded-xl border border-[#DFC8BE] bg-[#FCF7F4]/95 px-3 py-2 text-[10px] leading-4 text-[#9A4E35] shadow-sm backdrop-blur sm:left-auto sm:max-w-md">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{renderError}
        </div>
      ) : null}
    </div>
  )
}

function ToolButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="flex size-8 items-center justify-center rounded-lg text-[#66717B] transition-colors hover:bg-[#F4ECD8] hover:text-[#8E6925] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/30"
      title={title}
    >
      {children}
    </button>
  )
}
