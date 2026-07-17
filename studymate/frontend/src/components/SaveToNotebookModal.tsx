/**
 * 保存到笔记本的弹窗：让用户在保存前自选文件夹（或新建文件夹），
 * 复用于 WorkspaceDetail 资源摘录 + QuizCard 错题收藏。
 *
 * 设计取舍：
 * - 默认 folder 由调用方给（通常 = 当前课名），用户可改 / 选其他 / 新建
 * - title 也允许微调，避免一律默认名
 * - 实际写库还是走 POST /api/notes，弹窗只是收参数
 */
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { X, Loader2, FolderPlus, Save, NotebookText, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/api"
import { useCurrentUser } from "@/store/user"

interface FolderInfo {
  name: string
  count: number
}

interface FolderResp {
  total: number
  unfiled: number
  folders: FolderInfo[]
}

const NEW_KEY = "__new__"
const UNFILED_KEY = "__unfiled__"

interface SaveToNotebookModalProps {
  open: boolean
  onClose: () => void
  /** 调用方做最终的 POST；弹窗只负责收 folder + title */
  onConfirm: (params: { folder: string; title: string }) => Promise<void>
  defaultTitle: string
  /** 默认建议的文件夹（通常 = 当前课名）；用户可改 */
  defaultFolder?: string
  /** 描述文本，比如「将《K-Means》讲解保存到笔记本」*/
  description?: string
}

export function SaveToNotebookModal({
  open, onClose, onConfirm, defaultTitle, defaultFolder = "", description,
}: SaveToNotebookModalProps) {
  const user = useCurrentUser()
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [unfiledCount, setUnfiledCount] = useState(0)
  const [loadingF, setLoadingF] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [folderChoice, setFolderChoice] = useState<string>(defaultFolder)
  const [newFolderName, setNewFolderName] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 打开时初始化 + 拉文件夹
  useEffect(() => {
    if (!open) return
    let active = true
    const frame = window.requestAnimationFrame(() => {
      setTitle(defaultTitle)
      setFolderChoice(defaultFolder || UNFILED_KEY)
      setNewFolderName("")
      setSaving(false)
      setDone(false)
      setErr(null)
      setFolders([])
      setUnfiledCount(0)
      const userId = user?.user_id
      if (!userId) {
        setLoadingF(false)
        return
      }
      setLoadingF(true)
      apiGet<FolderResp>(`/notes/folders?user_id=${userId}`)
        .then((r) => {
          if (!active) return
          setFolders(r.folders || [])
          setUnfiledCount(r.unfiled || 0)
          // 如果建议的 folder 不在已有列表中且非空，把它当一个待新建项
          if (defaultFolder && !(r.folders || []).some((f) => f.name === defaultFolder)) {
            setFolderChoice(NEW_KEY)
            setNewFolderName(defaultFolder)
          }
        })
        .catch(() => {
          if (active) setFolders([])
        })
        .finally(() => {
          if (active) setLoadingF(false)
        })
    })
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
    }
  }, [open, defaultTitle, defaultFolder, user?.user_id])

  // 弹窗必须脱离页面中的 transform / overflow 容器，否则 fixed 会相对长页面定位，
  // 输入框自动聚焦时还会把页面滚到弹窗所在的错误位置。
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, saving, onClose])

  const finalFolder = useMemo(() => {
    if (folderChoice === UNFILED_KEY) return ""
    if (folderChoice === NEW_KEY) return newFolderName.trim()
    return folderChoice
  }, [folderChoice, newFolderName])

  const canSave = title.trim() !== "" && (folderChoice !== NEW_KEY || newFolderName.trim() !== "")

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setErr(null)
    try {
      await onConfirm({ folder: finalFolder, title: title.trim() })
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#18232D]/35 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-to-notebook-title"
      aria-describedby={description ? "save-to-notebook-description" : undefined}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex max-h-[min(92dvh,720px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#DDD7CB] bg-[#F8F6F0] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${done ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"}`}>
              {done ? <Check className="size-4" /> : <NotebookText className="size-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">学习成果沉淀</p>
              <h2 id="save-to-notebook-title" className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-[#18232D]">
                {done ? "笔记已保存" : "保存到智能笔记"}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="grid size-8 shrink-0 place-items-center rounded-lg text-[#66717B] transition-colors hover:bg-[#ECE7DD] hover:text-[#243746] disabled:opacity-40" aria-label="关闭保存笔记弹窗">
            <X className="size-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4 sm:px-6">
          {done ? (
            <div className="rounded-[20px] border border-[#C9D1CB] bg-[#E9EEE6] p-5 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full border border-[#C9D1CB] bg-[#FFFEFA] text-[#557052]"><Check className="size-5" /></span>
              <strong className="mt-3 block text-sm text-[#24372E]">《{title.trim()}》已写入笔记库</strong>
              <p className="mt-1 text-xs leading-5 text-[#66736A]">你可以回到资源继续学习，也可以关闭弹窗后直接前往笔记或生成同主题测验。</p>
            </div>
          ) : (
            <>
              {description && (
                <p id="save-to-notebook-description" className="mb-4 rounded-xl border border-[#E0DACE] bg-[#FBF9F4] px-3 py-2.5 text-xs leading-5 text-[#66717B]">{description}</p>
              )}

              <label htmlFor="note-title" className="mb-1.5 block text-[11px] font-bold text-[#59636B]">笔记标题</label>
              <input
                id="note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-4 h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] px-3 text-sm text-[#18232D] outline-none transition focus:border-[#315E83] focus:ring-2 focus:ring-[#315E83]/10"
                placeholder="输入标题"
                disabled={saving}
                autoFocus
              />

              <label className="mb-1.5 block text-[11px] font-bold text-[#59636B]">保存位置</label>
              <div className="space-y-2">
                {loadingF ? (
                  <div role="status" className="flex items-center gap-2 rounded-xl border border-[#E0DACE] bg-[#FBF9F4] px-3 py-4 text-xs text-[#66717B]">
                    <Loader2 className="size-3.5 animate-spin text-[#315E83]" /> 正在读取笔记文件夹…
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] p-1" aria-label="选择笔记文件夹">
                    <FolderOption
                      value={UNFILED_KEY}
                      label="未分类"
                      count={unfiledCount}
                      selected={folderChoice === UNFILED_KEY}
                      onSelect={() => setFolderChoice(UNFILED_KEY)}
                    />
                    {folders.map((f) => (
                      <FolderOption
                        key={f.name}
                        value={f.name}
                        label={f.name}
                        count={f.count}
                        selected={folderChoice === f.name}
                        onSelect={() => setFolderChoice(f.name)}
                      />
                    ))}
                    <FolderOption
                      value={NEW_KEY}
                      label="新建文件夹"
                      count={null}
                      selected={folderChoice === NEW_KEY}
                      onSelect={() => setFolderChoice(NEW_KEY)}
                      isNew
                    />
                  </div>
                )}

                {folderChoice === NEW_KEY && (
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="例如：数据结构错题 / 期末冲刺"
                    className="h-10 w-full rounded-xl border border-[#D9CFB7] bg-[#FBF7ED] px-3 text-sm text-[#18232D] outline-none transition focus:border-[#8E6925] focus:ring-2 focus:ring-[#8E6925]/10"
                    disabled={saving}
                    autoFocus
                  />
                )}
              </div>
            </>
          )}

          {err && <div role="alert" className="mt-3 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2.5 text-xs text-[#9A4E35]">{err}</div>}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[#DDD7CB] bg-[#FCFAF5] px-5 py-3.5 sm:px-6">
          <p className="hidden text-[10px] leading-4 text-[#8A8172] sm:block">保存后仍可在智能笔记中编辑、预览与导出</p>
          <div className="ml-auto flex gap-2">
            {!done && <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>}
            {done ? (
              <Button onClick={onClose}><Check className="size-4" />完成</Button>
            ) : (
              <Button onClick={handleSave} disabled={!canSave || saving}>
                {saving ? <><Loader2 className="size-4 animate-spin" />保存中</> : <><Save className="size-4" />确认保存</>}
              </Button>
            )}
          </div>
        </footer>
      </motion.div>
    </div>,
    document.body,
  )
}

function FolderOption({
  label, count, selected, onSelect, isNew,
}: {
  value: string
  label: string
  count: number | null
  selected: boolean
  onSelect: () => void
  isNew?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        selected
          ? "bg-[#E7EDF3] font-semibold text-[#244C66]"
          : "text-[#59636B] hover:bg-[#F1EDE4]"
      } ${isNew ? "mt-1 border-t border-dashed border-[#D7D1C4] text-[#8E6925]" : ""}`}
    >
      <span className="flex items-center gap-1.5 truncate">
        {isNew ? <FolderPlus className="size-3.5" /> : <NotebookText className={`size-3.5 ${selected ? "opacity-100" : "opacity-55"}`} />}
        <span className="truncate">{label}</span>
      </span>
      {count !== null && <span className="rounded-full bg-[#F1EDE4] px-2 py-0.5 text-[10px] text-[#8A8172]">{count}</span>}
    </button>
  )
}
