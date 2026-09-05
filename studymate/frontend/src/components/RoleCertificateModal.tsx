import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Award, Download, Loader2, X } from "lucide-react"

import certificateBackground from "@/assets/certificate/studymate-certificate-bg.png"
import { certificateFilename, formatCertificateDate, getOrCreateCertificateRecord } from "@/lib/certificates"

interface RoleCertificateModalProps {
  open: boolean
  learnerName: string
  roleName: string
  roleId: string
  userId: number
  completedRounds: number
  onClose: () => void
}

export function RoleCertificateModal({
  open,
  learnerName,
  roleName,
  roleId,
  userId,
  completedRounds,
  onClose,
}: RoleCertificateModalProps) {
  const titleId = useId()
  const certificateRef = useRef<HTMLDivElement>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState("")
  const record = useMemo(() => getOrCreateCertificateRecord({
    userId,
    learnerName,
    roleId,
    roleName,
    completedRounds,
  }), [completedRounds, learnerName, roleId, roleName, userId])
  const issuedDate = formatCertificateDate(record.issuedAt)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    downloadButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !downloading) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [downloading, onClose, open])

  const downloadCertificate = async () => {
    const node = certificateRef.current
    if (!node || downloading) return
    setDownloading(true)
    setDownloadError("")
    try {
      await document.fonts.ready
      const background = node.querySelector("img")
      if (background && !background.complete) {
        await new Promise<void>((resolve) => {
          background.addEventListener("load", () => resolve(), { once: true })
          background.addEventListener("error", () => resolve(), { once: true })
        })
      }
      const { default: html2canvas } = await import("html2canvas-pro")
      const canvas = await html2canvas(node, {
        backgroundColor: "#F8F2E5",
        scale: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1))
      if (!blob) throw new Error("奖状图片生成失败")
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = certificateFilename(learnerName, roleName)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "下载失败，请稍后重试")
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="paper-theme fixed inset-0 z-[140] grid place-items-center bg-[#091B31]/72 p-3 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !downloading) onClose()
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 18, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[94dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[26px] border border-[#D8C491] bg-[#FFFCF4] shadow-[0_32px_100px_rgba(4,14,27,.38)]"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#DED1B2] bg-[#F7F0E1] px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#DCC78E] bg-[#FFF9EB] text-[#A87822]"><Award className="size-[18px]" /></span>
                <div className="min-w-0">
                  <h2 id={titleId} className="truncate text-base font-bold text-[#173453]">祝贺你完成全部岗位学习</h2>
                  <p className="mt-0.5 text-[11px] text-[#6F6A5E]">你的坚持值得被正式记录，奖状可下载为高清 PNG。</p>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={downloading} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6C6A64] transition hover:bg-[#ECE2CE] disabled:opacity-45" aria-label="关闭奖状预览"><X className="size-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#E9E1D0] p-2.5 sm:p-5">
              <div
                ref={certificateRef}
                className="relative mx-auto aspect-[4/3] w-full max-w-[1080px] overflow-hidden bg-[#F8F2E5] shadow-[0_18px_44px_rgba(35,42,47,.16)]"
                style={{ containerType: "inline-size" }}
              >
                <img src={certificateBackground} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-x-[13%] top-[12.5%] bottom-[12%] text-center text-[#183756]">
                  <p className="font-semibold tracking-[0.28em] text-[#8A6A2E]" style={{ fontSize: "1.25cqw" }}>因材智训 · 岗位胜任力训练</p>
                  <h3 className="mt-[1.1cqw] font-serif font-bold tracking-[0.16em]" style={{ fontSize: "4.1cqw" }}>岗位学习荣誉证书</h3>
                  <p className="mt-[0.2cqw] font-medium tracking-[0.32em] text-[#B18A43]" style={{ fontSize: "1.1cqw" }}>CERTIFICATE OF ACHIEVEMENT</p>

                  <div className="mx-auto mt-[2.3cqw] h-px w-[18cqw] bg-[#C9A75F]" />
                  <p className="mt-[1.5cqw] tracking-[0.22em] text-[#77674D]" style={{ fontSize: "1.35cqw" }}>兹表彰</p>
                  <div className="mx-auto mt-[0.35cqw] inline-block min-w-[25cqw] border-b border-[#B8924D] px-[2cqw] pb-[0.25cqw] font-serif font-bold tracking-[0.12em] text-[#142F4C]" style={{ fontSize: "3.8cqw" }}>{learnerName}</div>

                  <p className="mx-auto mt-[1.6cqw] max-w-[62cqw] font-medium leading-[1.9] text-[#3E4B56]" style={{ fontSize: "1.55cqw" }}>
                    祝贺你坚持完成「{roleName}」岗位的全部学习内容，<br />顺利通过 {completedRounds} 轮训练与综合验收。
                  </p>
                  <p className="mx-auto mt-[1.1cqw] max-w-[58cqw] leading-[1.85] text-[#6B655A]" style={{ fontSize: "1.15cqw" }}>
                    你在学习中展现出的专注、行动与持续成长值得表彰。<br />愿你带着这份能力与勇气走向真实岗位，创造属于自己的专业价值。
                  </p>

                  <div className="absolute bottom-[10.5cqw] left-[15cqw] text-left text-[#5E625F]" style={{ fontSize: "1cqw" }}>
                    <p className="font-semibold text-[#263D52]" style={{ fontSize: "1.25cqw" }}>因材智训学习平台</p>
                    <p className="mt-[0.4cqw]">颁发日期：{issuedDate}</p>
                    <p className="mt-[0.15cqw] tracking-[0.04em]">证书编号：{record.serial}</p>
                    <p className="mt-[0.3cqw] text-[#827A6D]">电子学习成就证明 · 非职业资格证书</p>
                  </div>

                  <div className="absolute bottom-[0.2cqw] right-[2.2cqw] grid size-[12.4cqw] place-items-center rounded-full border-[0.35cqw] border-double border-[#BD954A] bg-[#FFF8E8]/80 text-[#9A722C]">
                    <div>
                      <span className="mx-auto grid size-[3.6cqw] place-items-center rounded-full border-[0.18cqw] border-[#B88936] font-bold leading-none" style={{ fontSize: "2.1cqw" }}>✓</span>
                      <strong className="mt-[0.2cqw] block tracking-[0.12em]" style={{ fontSize: "1.35cqw" }}>因材智训</strong>
                      <span className="mt-[0.1cqw] block tracking-[0.16em]" style={{ fontSize: "0.8cqw" }}>学习完成认证</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-[#DED1B2] bg-[#FFF9ED] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-h-5 text-[11px] text-[#786E5B]">
                {downloadError ? <span role="alert" className="font-semibold text-[#A64F36]">{downloadError}</span> : "奖状信息已与当前学习者、目标岗位和完成轮次关联。"}
              </div>
              <button ref={downloadButtonRef} type="button" onClick={downloadCertificate} disabled={downloading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#173B61] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(23,59,97,.2)] transition hover:bg-[#102E4D] disabled:opacity-55">
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {downloading ? "正在生成高清奖状" : "下载高清奖状"}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
