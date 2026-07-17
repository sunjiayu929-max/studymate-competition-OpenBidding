/**
 * 拍照识题按钮：选图/拍照 → 压缩 → POST /api/ocr/topic（qwen-vl 视觉识题）
 * → onResult(主题) 回调，父组件塞进 topic 输入框。
 *
 * 移动端 capture="environment" 直接调后置摄像头；桌面端走文件选择。
 * 视觉范式与 MicButton 对齐（圆形按钮 + lucide 图标 + framer-motion）。
 */
import { useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { apiPost } from "@/lib/api"
import { compressImage } from "@/lib/image"

interface Props {
  onResult: (topic: string) => void
  onError?: (err: Error) => void
  size?: "sm" | "md"
  className?: string
  disabled?: boolean
}

interface OcrTopicResponse {
  topic: string
}

export function PhotoTopicButton({ onResult, onError, size = "sm", className = "", disabled }: Props) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handlePick = async (files: FileList | null) => {
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = "" // 允许连拍同一文件再次触发
    if (!file) return
    if (!file.type.startsWith("image/")) {
      onError?.(new Error("请选择图片文件"))
      return
    }
    setBusy(true)
    try {
      const image = await compressImage(file)
      const r = await apiPost<OcrTopicResponse>("/ocr/topic", { image })
      if (r.topic) onResult(r.topic)
      else onError?.(new Error("未能识别出主题"))
    } catch (e) {
      onError?.(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const sz = size === "md" ? "w-9 h-9" : "w-8 h-8"
  const iconSz = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />
      <motion.button
        type="button"
        onClick={() => !busy && !disabled && fileRef.current?.click()}
        whileTap={{ scale: 0.9 }}
        title={busy ? "识别中…" : "拍照识题"}
        disabled={busy || disabled}
        className={`${sz} relative inline-flex items-center justify-center rounded-full transition-colors ${
          busy
            ? "bg-[var(--card)] border border-[var(--primary)] text-[var(--primary)]"
            : "bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        } ${className}`}
      >
        {busy ? <Loader2 className={`${iconSz} animate-spin`} /> : <Camera className={iconSz} />}
      </motion.button>
    </>
  )
}
