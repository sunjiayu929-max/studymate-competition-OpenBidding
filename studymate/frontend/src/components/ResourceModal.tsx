import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface ResourceModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: LucideIcon
  tone?: "indigo" | "rose" | "emerald" | "amber" | "sky" | "violet"
  /** 顶部右侧的额外操作（如「下载 / 复制」按钮）*/
  actions?: React.ReactNode
  children: React.ReactNode
}

const TONE_BG: Record<NonNullable<ResourceModalProps["tone"]>, string> = {
  indigo:  "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]",
  rose:    "border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]",
  emerald: "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]",
  amber:   "border-[#D8C9A8] bg-[#F7F2E7] text-[#8E6925]",
  sky:     "border-[#C6D5D3] bg-[#E7EFED] text-[#3E7774]",
  violet:  "border-[#D5CFD8] bg-[#EEE9EF] text-[#706178]",
}

export function ResourceModal({ open, onClose, title, subtitle, icon: Icon, tone = "indigo", actions, children }: ResourceModalProps) {
  const titleId = useId()
  // ESC 关闭 + body 滚动锁
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="paper-theme fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* 蒙层 */}
          <div
            className="absolute inset-0 bg-[#18232D]/30 backdrop-blur-[2px]"
            onMouseDown={onClose}
            aria-hidden
          />

          {/* 卡片 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative flex max-h-[min(92dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_26px_80px_rgba(24,35,45,.2)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${TONE_BG[tone]}`}>
                    <Icon className="size-4.5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 id={titleId} className="truncate text-base font-bold leading-tight tracking-[-0.02em] text-[#18232D]">{title}</h2>
                  {subtitle && (
                    <p className="mt-0.5 max-sm:line-clamp-2 text-xs leading-5 text-[#66717B] sm:truncate">{subtitle}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {actions}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-10 items-center justify-center rounded-xl text-[#66717B] transition-colors hover:bg-[#ECE8DE] hover:text-[#27343D]"
                  aria-label="关闭"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {children}
            </div>

            {/* Footer hint */}
            <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-[#DED8CC] bg-[#FAF7F0] px-4 py-2.5 text-[10px] font-medium text-[#7A817E] sm:px-6">
              <span>智能生成内容 · 关键结论建议结合课程资料复核</span>
              <span>Esc 或点击外部关闭</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
