import { useEffect, useId, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  tone?: "danger" | "primary"
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  busy = false,
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  }, [busy, onClose])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    cancelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-center bg-[#18232D]/28 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onClose()
          }}
        >
          <motion.section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-[#CEC6B7] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.18)]"
          >
            <div className="flex items-start gap-3.5 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <span className={tone === "danger"
                ? "grid size-10 shrink-0 place-items-center rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]"
                : "grid size-10 shrink-0 place-items-center rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"
              }>
                <AlertTriangle className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-[17px] font-bold tracking-[-0.025em] text-[#18232D]">{title}</h2>
                <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-[#66717B]">{description}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-[#7A817E] transition-colors hover:bg-[#F1EDE4] hover:text-[#27343D] disabled:opacity-40"
                aria-label="关闭确认窗口"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[#DED8CC] bg-[#FAF7F0] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={busy} className="sm:min-w-24">
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant={tone === "danger" ? "destructive" : "default"}
                onClick={onConfirm}
                disabled={busy}
                aria-busy={busy}
                className="sm:min-w-24"
              >
                {busy && <Loader2 className="animate-spin" />}
                {busy ? "正在处理" : confirmLabel}
              </Button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
