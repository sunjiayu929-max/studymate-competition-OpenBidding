/**
 * 笔记本页 `/notes` —— 三栏布局
 *
 * 左 sidebar：文件夹树（用户自定义） + 来源 chip + 搜索
 * 中列表：当前选中文件夹/筛选下的笔记
 * 右编辑器：Markdown 实时预览 + 标签 + 可改文件夹
 *
 * 设计取舍：
 * - 文件夹是 Note 的字符串字段（不存独立表），简化模型
 * - 没有"空文件夹"，新建文件夹会立即建一条占位笔记
 * - 5 门课的笔记**汇总在一起**，按用户自定义 folder 分组（而不是按课程强制隔离）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft, NotebookText, Loader2, Plus, Trash2, Save, Search, X, BookMarked,
  FileText, BookOpen, Bot, Pencil, FolderPlus, Folder, FolderOpen, Inbox, Check, Move,
  Eye, EyeOff, AlertTriangle, Download, FileDown, Sparkles, Wand2,
  CheckSquare, Square, Camera, RotateCcw,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentUser } from "@/store/user"
import { useCurrentCourse } from "@/store/course"
import { usePostSSE } from "@/hooks/usePostSSE"
import { createQuizSession } from "@/lib/quizSession"

type Source = "manual" | "doc" | "quiz" | "tutor" | "mindmap"

interface Note {
  id: number
  user_id: number
  course_id: number | null
  folder: string
  title: string
  content_md: string
  tags: string[]
  source: Source
  created_at: string | null
  updated_at: string | null
}

interface ListResp {
  count: number
  by_source: Record<Source, number>
  items: Note[]
}

interface FolderInfo {
  name: string
  count: number
}

interface FolderResp {
  total: number
  unfiled: number
  folders: FolderInfo[]
}

const SOURCE_META: Record<Source, { label: string; color: string; icon: typeof FileText }> = {
  manual: { label: "手动", color: "bg-[#F1EDE4] text-[#59636B]", icon: Pencil },
  doc:    { label: "讲解摘录", color: "bg-[#E7EDF3] text-[#315E83]", icon: FileText },
  quiz:   { label: "错题本", color: "bg-[#F4E8E2] text-[#9A4E35]", icon: BookOpen },
  tutor:  { label: "助教摘录", color: "bg-[#F4ECD8] text-[#8E6925]", icon: Bot },
  mindmap: { label: "思维导图", color: "bg-[#E2EEEB] text-[#3E7774]", icon: BookMarked },
}

// 特殊筛选 key
const ALL = "__all__"
const UNFILED = "__unfiled__"

type FolderDialog =
  | { mode: "create" }
  | { mode: "rename"; oldName: string }
  | { mode: "delete"; oldName: string; count: number }
  | null

type ActionNotice = { tone: "success" | "error"; message: string }

export function Notes() {
  useTrackPage("notes")
  const navigate = useNavigate()
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseId = course?.id ?? null
  // 当前"选中的文件夹/分类"：__all__ / __unfiled__ / 文件夹名
  const [selectedFolder, setSelectedFolder] = useState<string>(ALL)
  const [sourceFilter, setSourceFilter] = useState<Source | "">("")
  const [q, setQ] = useState("")
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false)

  const [list, setList] = useState<Note[]>([])
  const [bySrc, setBySrc] = useState<Record<string, number>>({})
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [unfiled, setUnfiled] = useState(0)
  const [total, setTotal] = useState(0)

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Note | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<number | null>(null)
  const editRevisionRef = useRef(0)
  const [notice, setNotice] = useState<ActionNotice | null>(null)
  const noticeTimerRef = useRef<number | null>(null)

  // 批量选择模式
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<"current" | "bulk" | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const batchPrintRef = useRef<HTMLDivElement>(null)
  const [batchPrintNotes, setBatchPrintNotes] = useState<Note[]>([])
  const [exportingBatchPdf, setExportingBatchPdf] = useState(false)

  const [folderDialog, setFolderDialog] = useState<FolderDialog>(null)
  const [folderBusy, setFolderBusy] = useState(false)

  const showNotice = useCallback((message: string, tone: ActionNotice["tone"] = "success") => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    setNotice({ message, tone })
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 3600)
  }, [])

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [])

  useTutorContext({
    page: "notes",
    title: editing?.title
      ? `笔记本 · 正在编辑：${editing.title}`
      : `笔记本（${total} 条）`,
    snippet: editing?.content_md?.slice(0, 600),
  })

  const fetchList = useCallback(async () => {
    if (!USER_ID) return
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams({ user_id: String(USER_ID) })
      if (selectedFolder === UNFILED) params.set("folder", UNFILED)
      else if (selectedFolder !== ALL) params.set("folder", selectedFolder)
      if (sourceFilter) params.set("source", sourceFilter)
      if (q.trim()) params.set("q", q.trim())
      const r = await apiGet<ListResp>(`/notes?${params}`)
      setList(r.items)
      setBySrc(r.by_source || {})
      // First entry should be immediately useful in the judge-facing notebook.
      // Keep a user's current selection intact while filters or refreshes change.
      setSelectedId((current) => current ?? r.items[0]?.id ?? null)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [selectedFolder, sourceFilter, q, USER_ID])

  const fetchFolders = useCallback(async () => {
    if (!USER_ID) return
    try {
      const r = await apiGet<FolderResp>(`/notes/folders?user_id=${USER_ID}`)
      setFolders(r.folders || [])
      setUnfiled(r.unfiled || 0)
      setTotal(r.total || 0)
    } catch {
      /* ignore */
    }
  }, [USER_ID])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    void fetchFolders()
  }, [fetchFolders])

  // 选中变化时同步 editing
  useEffect(() => {
    if (selectedId == null) {
      // 编辑草稿需要在外部选择清空时同步复位。
      setEditing(null)
      return
    }
    const n = list.find((x) => x.id === selectedId)
    if (n) {
      // 列表刷新后以服务端记录重建可编辑草稿。
      setEditing({ ...n })
      setDirty(false)
      setSaveError(null)
      editRevisionRef.current = 0
    }
  }, [selectedId, list])

  const createNewImmediately = useCallback(async () => {
    // 若当前在某个具体文件夹，新建笔记默认进该文件夹
    const folder = (selectedFolder === ALL || selectedFolder === UNFILED) ? "" : selectedFolder
    try {
      const n = await apiPost<Note>("/notes", {
        user_id: USER_ID,
        folder,
        title: "未命名笔记",
        content_md: "",
        tags: [],
        source: "manual",
      })
      await Promise.all([fetchList(), fetchFolders()])
      setSelectedId(n.id)
      setMobileEditorOpen(true)
      showNotice("新笔记已创建，开始记录吧")
    } catch (e) {
      setErr(String(e))
    }
  }, [USER_ID, fetchFolders, fetchList, selectedFolder, showNotice])

  const openCreateFolder = () => setFolderDialog({ mode: "create" })
  const openRenameFolder = (name: string) => setFolderDialog({ mode: "rename", oldName: name })
  const openDeleteFolder = (name: string, count: number) => setFolderDialog({ mode: "delete", oldName: name, count })

  const submitFolderDialog = async (input: string) => {
    if (!folderDialog) return
    setFolderBusy(true)
    try {
      if (folderDialog.mode === "create") {
        const name = input.trim().slice(0, 128)
        if (!name) { setFolderBusy(false); return }
        if (folders.some((f) => f.name === name)) {
          setErr(`文件夹「${name}」已存在`)
          setFolderBusy(false)
          return
        }
        await apiPost(`/notes/folders`, { user_id: USER_ID, name })
        await fetchFolders()
        setSelectedFolder(name)
        showNotice(`文件夹「${name}」已创建`)
      } else if (folderDialog.mode === "rename") {
        const newName = input.trim().slice(0, 128)
        if (!newName || newName === folderDialog.oldName) {
          setFolderDialog(null)
          setFolderBusy(false)
          return
        }
        if (folders.some((f) => f.name === newName)) {
          setErr(`文件夹「${newName}」已存在`)
          setFolderBusy(false)
          return
        }
        await apiPut(
          `/notes/folders/${encodeURIComponent(folderDialog.oldName)}?user_id=${USER_ID}`,
          { new_name: newName },
        )
        await Promise.all([fetchFolders(), fetchList()])
        if (selectedFolder === folderDialog.oldName) setSelectedFolder(newName)
        showNotice(`文件夹已重命名为「${newName}」`)
      } else if (folderDialog.mode === "delete") {
        await apiDelete(
          `/notes/folders/${encodeURIComponent(folderDialog.oldName)}?user_id=${USER_ID}`,
        )
        await Promise.all([fetchFolders(), fetchList()])
        if (selectedFolder === folderDialog.oldName) setSelectedFolder(ALL)
        showNotice(`文件夹「${folderDialog.oldName}」已删除，笔记已移到未分类`)
      }
      setFolderDialog(null)
    } catch (e) {
      setErr(String(e))
    } finally {
      setFolderBusy(false)
    }
  }

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (!editing) return true
    if (saving) return false
    const snapshot = { ...editing, tags: [...editing.tags] }
    const previous = list.find((note) => note.id === snapshot.id)
    const revisionAtStart = editRevisionRef.current
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await apiPut<Note>(`/notes/${snapshot.id}`, {
        title: snapshot.title,
        content_md: snapshot.content_md,
        tags: snapshot.tags,
        folder: snapshot.folder,
      })
      setLastSavedAt(Date.now())
      const fullySaved = editRevisionRef.current === revisionAtStart
      if (fullySaved) {
        setDirty(false)
        const folderChanged = previous != null && previous.folder !== saved.folder
        if (folderChanged || q.trim()) {
          await Promise.all([fetchList(), fetchFolders()])
        } else {
          // 普通正文、标题和标签自动保存直接使用 PUT 返回值更新本地状态，
          // 避免每次停笔都重拉整份笔记与文件夹统计并重复解析 Markdown。
          setEditing({ ...saved })
          setList((current) => [
            saved,
            ...current.filter((note) => note.id !== saved.id),
          ])
        }
      }
      return fullySaved
    } catch (e) {
      const message = `保存失败：${String(e)}`
      setSaveError(message)
      setErr(message)
      return false
    } finally {
      setSaving(false)
    }
  }, [editing, saving, list, q, fetchList, fetchFolders])

  // 自动保存：dirty 后 debounce 1.5s 触发；每次编辑都重置计时器
  useEffect(() => {
    if (!editing || !dirty || saving || saveError) return
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveCurrent()
    }, 1500)
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [editing, dirty, saving, saveError, saveCurrent])

  // Ctrl/Cmd+S 立即保存
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault()
        if (editing && dirty && !saving) void saveCurrent()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [editing, dirty, saving, saveCurrent])

  // 刷新/关闭浏览器时阻止未保存内容直接丢失；站内链接则先保存，成功后再跳转。
  useEffect(() => {
    if (!editing || !dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    const protectInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash === window.location.hash) return
      event.preventDefault()
      void saveCurrent().then((saved) => {
        if (saved) navigate(`${url.pathname}${url.search}${url.hash}`)
      })
    }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", protectInternalNavigation, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("click", protectInternalNavigation, true)
    }
  }, [editing, dirty, navigate, saveCurrent])

  const selectNoteSafely = useCallback(async (id: number) => {
    if (id === selectedId) {
      setMobileEditorOpen(true)
      return
    }
    if (dirty && !(await saveCurrent())) return
    setSelectedId(id)
    setMobileEditorOpen(true)
  }, [dirty, saveCurrent, selectedId])

  const selectFolderSafely = useCallback(async (folder: string) => {
    if (folder === selectedFolder) {
      setMobileFiltersOpen(false)
      return
    }
    if (dirty && !(await saveCurrent())) return
    setSelectedFolder(folder)
    setSelectedId(null)
    setMobileEditorOpen(false)
    setMobileFiltersOpen(false)
  }, [dirty, saveCurrent, selectedFolder])

  const closeMobileEditor = useCallback(async () => {
    if (dirty && !(await saveCurrent())) return
    setMobileEditorOpen(false)
  }, [dirty, saveCurrent])

  const createNew = useCallback(async () => {
    if (dirty && !(await saveCurrent())) return
    await createNewImmediately()
  }, [dirty, saveCurrent, createNewImmediately])

  const deleteCurrent = () => {
    if (editing) setDeleteDialog("current")
  }

  const confirmDeleteCurrent = async () => {
    if (!editing) return
    setDeleteBusy(true)
    try {
      await apiDelete(`/notes/${editing.id}`)
      setSelectedId(null)
      setEditing(null)
      setMobileEditorOpen(false)
      await Promise.all([fetchList(), fetchFolders()])
      showNotice(`笔记「${editing.title}」已删除`)
      setDeleteDialog(null)
    } catch (e) {
      setErr(String(e))
      setDeleteDialog(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const folderNames = useMemo(() => folders.map((f) => f.name), [folders])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllInView = useCallback(() => {
    setSelectedIds(new Set(list.map((n) => n.id)))
  }, [list])

  const bulkDelete = useCallback(() => {
    if (selectedIds.size > 0) setDeleteDialog("bulk")
  }, [selectedIds.size])

  const confirmBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all(Array.from(selectedIds).map((id) => apiDelete(`/notes/${id}`)))
      if (selectedId && selectedIds.has(selectedId)) setSelectedId(null)
      await Promise.all([fetchList(), fetchFolders()])
      exitSelectMode()
      showNotice(`${selectedIds.size} 条笔记已删除`)
      setDeleteDialog(null)
    } catch (e) {
      setErr(`批量删除失败：${String(e)}`)
      setDeleteDialog(null)
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, selectedId, fetchList, fetchFolders, exitSelectMode, showNotice])

  const bulkMove = useCallback(
    async (targetFolder: string) => {
      if (selectedIds.size === 0) return
      setBulkBusy(true)
      try {
        await Promise.all(
          Array.from(selectedIds).map((id) =>
            apiPut(`/notes/${id}`, { folder: targetFolder }),
          ),
        )
        await Promise.all([fetchList(), fetchFolders()])
        setMoveDialogOpen(false)
        exitSelectMode()
        showNotice(`${selectedIds.size} 条笔记已移动`)
      } catch (e) {
        setErr(`批量移动失败：${String(e)}`)
      } finally {
        setBulkBusy(false)
      }
    },
    [selectedIds, fetchList, fetchFolders, exitSelectMode, showNotice],
  )

  const bulkRequiz = useCallback(async () => {
    const picked = list.filter((n) => selectedIds.has(n.id) && n.source === "quiz")
    if (picked.length === 0) return
    // 抽 tags 当 topic 关键词，跳过通用 tag
    const SKIP = new Set(["错题", "mcq", "fill", "code"])
    const tagBag = new Set<string>()
    for (const n of picked) {
      for (const t of n.tags) {
        if (!SKIP.has(t) && !t.startsWith("错误类型:")) tagBag.add(t)
      }
    }
    const topicKeys = Array.from(tagBag).slice(0, 4)
    const topic = topicKeys.length > 0 ? topicKeys.join(" / ") : "错题复习"
    const n = picked.length
    setBulkBusy(true)
    try {
      const session = await createQuizSession({
        user_id: USER_ID,
        course_id: courseId,
        topic,
        mcq_count: Math.min(n, 3),
        fill_count: Math.min(Math.max(0, n - 3), 2),
        code_count: 0,
        difficulty: 3,
        mode: "quest",
        code_grading: "self",
      })
      exitSelectMode()
      navigate(`/quiz/${session.id}`)
    } catch (e) {
      setErr(`错题二刷失败：${String(e)}`)
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, list, USER_ID, courseId, navigate, exitSelectMode])

  const bulkExportPdf = useCallback(async () => {
    if (selectedIds.size === 0 || exportingBatchPdf) return
    const picked = list.filter((n) => selectedIds.has(n.id))
    if (picked.length === 0) return
    setExportingBatchPdf(true)
    try {
      setBatchPrintNotes(picked)
      // 等两帧确保隐藏区渲染完成
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      if (!batchPrintRef.current) throw new Error("打印区未就绪")
      const fname = `StudyMate-笔记合集-${picked.length}条-${new Date().toISOString().slice(0, 10)}.pdf`
      await renderNodeToPdf(batchPrintRef.current, fname)
      showNotice(`${picked.length} 条笔记已导出为 PDF`)
    } catch (e) {
      setErr(`批量 PDF 导出失败：${String(e)}`)
    } finally {
      setExportingBatchPdf(false)
      setBatchPrintNotes([])
    }
  }, [selectedIds, list, exportingBatchPdf, showNotice])

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="notes" appearance="paper" />

        <section className="mt-4 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-col items-stretch gap-2.5 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><NotebookText className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-bold text-[#18232D]">StudyMate 智能笔记</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">管理岗位训练笔记、错题与讲解摘录 · 支持 Markdown 编辑、识图总结及 Markdown / PDF 下载</p>
              </div>
            </div>
            <div className="nav-scroll flex w-full items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto sm:shrink-0 sm:overflow-visible sm:pb-0">
              <button type="button" aria-label={selectMode ? `已选择 ${selectedIds.size} 条笔记，退出批量管理` : "批量管理笔记"} onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors ${selectMode ? "border-[#AEBAB5] bg-[#E9EEE6] text-[#557052]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#66717B] hover:bg-[#F1EDE4]"}`}>
                <CheckSquare className="size-3.5" /><span className="hidden sm:inline">{selectMode ? `已选 ${selectedIds.size}` : "批量管理"}</span>
              </button>
              <button type="button" aria-label="新建文件夹" onClick={openCreateFolder} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#F1EDE4]">
                <FolderPlus className="size-3.5" /><span className="hidden sm:inline">新建文件夹</span>
              </button>
              <button type="button" onClick={createNew} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50]">
                <Plus className="size-3.5" />新建笔记
              </button>
            </div>
          </header>

          {err && (
            <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] p-3 text-sm text-[#9A4E35]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">{err}</span>
              <button type="button" aria-label="关闭错误提示" onClick={() => setErr(null)} className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#EBDAD1]"><X className="size-3.5" /></button>
            </div>
          )}

          <AnimatePresence>
            {notice && (
              <motion.div
                role={notice.tone === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={`mx-3 mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${notice.tone === "error" ? "border-[#DFC9BE] bg-[#F6ECE7] text-[#9A4E35]" : "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]"}`}
              >
                {notice.tone === "error" ? <AlertTriangle className="size-3.5 shrink-0" /> : <Check className="size-3.5 shrink-0" />}
                <span className="min-w-0 flex-1">{notice.message}</span>
                <button type="button" aria-label="关闭操作提示" onClick={() => setNotice(null)} className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5"><X className="size-3.5" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid min-h-[680px] grid-cols-1 gap-3 p-3 lg:h-[calc(100dvh-190px)] lg:min-h-[620px] lg:grid-cols-[205px_290px_minmax(0,1fr)]">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2 lg:hidden">
              {mobileEditorOpen && editing ? (
                <button type="button" onClick={() => { void closeMobileEditor() }} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#E7EDF3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/35">
                  <ArrowLeft className="size-4" /> 返回笔记列表
                </button>
              ) : (
                <button type="button" aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#E7EDF3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/35">
                  <FolderOpen className="size-4" /> {mobileFiltersOpen ? "收起分类" : "文件夹与筛选"}
                </button>
              )}
              <span className="truncate text-[11px] font-semibold text-[#7A746A]">
                {mobileEditorOpen && editing ? editing.title : `${list.length} 条笔记`}
              </span>
            </div>

            {/* 左：桌面常驻；移动端按需展开，避免把笔记列表挤出首屏 */}
            <div className={`${mobileEditorOpen && editing ? "hidden" : mobileFiltersOpen ? "block" : "hidden"} min-h-0 lg:contents`}>
              <Sidebar
                selectedFolder={selectedFolder}
                onSelectFolder={(f) => { void selectFolderSafely(f) }}
                folders={folders}
                total={total}
                unfiled={unfiled}
                bySrc={bySrc}
                sourceFilter={sourceFilter}
                onSourceFilter={(s) => {
                  setSourceFilter(s)
                  setMobileFiltersOpen(false)
                }}
                onCreateFolder={openCreateFolder}
                onRenameFolder={openRenameFolder}
                onDeleteFolder={openDeleteFolder}
              />
            </div>

            {/* 中：移动端是主列表；进入笔记后由编辑器接管当前区域 */}
            <div className={`${mobileEditorOpen && editing ? "hidden" : "h-[560px]"} min-h-0 lg:contents`}>
              <NoteList
                list={list}
                loading={loading}
                selectedId={selectedId}
                onSelect={(id) => {
                  if (selectMode) toggleSelect(id)
                  else void selectNoteSafely(id)
                }}
                q={q}
                onQ={setQ}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onSelectAll={selectAllInView}
                allSelected={list.length > 0 && list.every((n) => selectedIds.has(n.id))}
                bulkBar={
                  selectMode ? (
                    <BulkActionBar
                      count={selectedIds.size}
                      busy={bulkBusy}
                      exportingPdf={exportingBatchPdf}
                      onDelete={bulkDelete}
                      onMove={() => setMoveDialogOpen(true)}
                      onExportPdf={bulkExportPdf}
                      onCancel={exitSelectMode}
                      onRequiz={sourceFilter === "quiz" ? bulkRequiz : undefined}
                    />
                  ) : null
                }
              />
            </div>

            {/* 右：桌面常驻；移动端以主从详情页呈现 */}
            {editing ? (
              <div className={`${mobileEditorOpen ? "min-h-[620px]" : "hidden"} min-w-0 lg:contents`}>
                <Editor
                  key={editing.id}
                  note={editing}
                  dirty={dirty}
                  saving={saving}
                  saveError={saveError}
                  lastSavedAt={lastSavedAt}
                  folderNames={folderNames}
                  onChange={(patch) => {
                    editRevisionRef.current += 1
                    setEditing({ ...editing, ...patch })
                    setDirty(true)
                    setSaveError(null)
                  }}
                  onSave={saveCurrent}
                  onDelete={deleteCurrent}
                  onNotify={showNotice}
                />
              </div>
            ) : (
              <div className="hidden flex-col items-center justify-center rounded-[24px] border border-dashed border-[#C9C2B4] bg-[#F8F6F0] text-sm text-[#66717B] lg:flex">
                <span className="mb-4 grid size-14 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><BookMarked className="size-6" /></span>
                <div className="font-semibold text-[#27343D]">选择一篇笔记开始阅读或编辑</div>
                <p className="mt-1 text-xs text-[#8A8172]">也可以从一张空白笔记开始记录</p>
                <Button size="sm" onClick={createNew} className="mt-4">
                  <Plus className="size-4" /> 新建笔记
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>

      <FolderActionDialog
        dialog={folderDialog}
        busy={folderBusy}
        onSubmit={submitFolderDialog}
        onClose={() => setFolderDialog(null)}
      />

      <BulkMoveDialog
        open={moveDialogOpen}
        busy={bulkBusy}
        count={selectedIds.size}
        folderNames={folderNames}
        onSubmit={(target) => void bulkMove(target)}
        onClose={() => setMoveDialogOpen(false)}
      />

      <ConfirmDialog
        open={deleteDialog !== null}
        title={deleteDialog === "bulk" ? `删除 ${selectedIds.size} 条笔记？` : `删除「${editing?.title || "当前笔记"}」？`}
        description={deleteDialog === "bulk"
          ? "所选笔记会从全部文件夹中移除，删除后无法恢复。"
          : "这篇笔记会被永久移除，关联的编辑内容将无法恢复。"
        }
        confirmLabel={deleteDialog === "bulk" ? "删除所选" : "删除笔记"}
        busy={deleteDialog === "bulk" ? bulkBusy : deleteBusy}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (deleteDialog === "bulk") void confirmBulkDelete()
          else void confirmDeleteCurrent()
        }}
      />

      {/* 隐藏批量 PDF 打印区：动态渲染选中笔记，由 bulkExportPdf 控制挂载 */}
      {batchPrintNotes.length > 0 && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "800px",
            background: "#ffffff",
            color: "#111111",
            padding: "32px",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          }}
        >
          <div ref={batchPrintRef}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: "#111" }}>
              StudyMate 笔记合集
            </h1>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 24 }}>
              共 {batchPrintNotes.length} 条 · 导出于 {new Date().toLocaleString("zh-CN")}
            </div>
            {batchPrintNotes.map((n, i) => (
              <div key={n.id} style={{ marginBottom: 32, pageBreakInside: "avoid" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>第 {i + 1} 条</div>
                <NotePrintCard note={n} />
                {i < batchPrintNotes.length - 1 && (
                  <hr style={{ border: "none", borderTop: "2px dashed #e5e7eb", margin: "24px 0" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BulkMoveDialog({
  open, busy, count, folderNames, onSubmit, onClose,
}: {
  open: boolean
  busy: boolean
  count: number
  folderNames: string[]
  onSubmit: (folder: string) => void
  onClose: () => void
}) {
  const [target, setTarget] = useState("")
  useEffect(() => {
    // 每次重新打开批量移动弹窗时清空上一次选择。
    if (open) setTarget("")
  }, [open])
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
            <Move className="size-4 text-emerald-500" />
            <span className="font-medium">移动 {count} 条笔记到…</span>
          </div>
          <div className="p-4 space-y-3">
            <label className="text-xs text-[var(--muted-foreground)]">目标文件夹（留空 = 未分类）</label>
            <input
              list="bulk-move-folders"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="例如：监督学习 / 留空 = 未分类"
              maxLength={128}
              className="w-full h-9 px-3 rounded border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              autoFocus
            />
            <datalist id="bulk-move-folders">
              {folderNames.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
            <Button size="sm" onClick={() => onSubmit(target.trim())} disabled={busy}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              移动
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ============ Sidebar ============

function Sidebar({
  selectedFolder, onSelectFolder, folders, total, unfiled, bySrc, sourceFilter, onSourceFilter,
  onCreateFolder, onRenameFolder, onDeleteFolder,
}: {
  selectedFolder: string
  onSelectFolder: (f: string) => void
  folders: FolderInfo[]
  total: number
  unfiled: number
  bySrc: Record<string, number>
  sourceFilter: Source | ""
  onSourceFilter: (s: Source | "") => void
  onCreateFolder: () => void
  onRenameFolder: (name: string) => void
  onDeleteFolder: (name: string, count: number) => void
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_9px_24px_rgba(24,35,45,.045)]">
      <div className="border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6F8A69]">
        文件夹
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <FolderItem
          icon={Inbox}
          name="全部"
          count={total}
          active={selectedFolder === ALL}
          onClick={() => onSelectFolder(ALL)}
        />
        <FolderItem
          icon={NotebookText}
          name="未分类"
          count={unfiled}
          active={selectedFolder === UNFILED}
          onClick={() => onSelectFolder(UNFILED)}
          muted
        />
        {folders.length > 0 && (
          <div className="mt-2 mb-1 px-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold">我的文件夹</span>
            <button
              onClick={onCreateFolder}
              title="新建文件夹"
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </div>
        )}
        {folders.map((f) => (
          <FolderItem
            key={f.name}
            icon={selectedFolder === f.name ? FolderOpen : Folder}
            name={f.name}
            count={f.count}
            active={selectedFolder === f.name}
            onClick={() => onSelectFolder(f.name)}
            onRename={() => onRenameFolder(f.name)}
            onDelete={() => onDeleteFolder(f.name, f.count)}
          />
        ))}
        {folders.length === 0 && (
          <button
            onClick={onCreateFolder}
            className="mt-3 mx-2 px-2 py-2 rounded border border-dashed border-[var(--border)] text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] flex items-center gap-1 w-[calc(100%-1rem)] justify-center"
          >
            <FolderPlus className="size-3.5" /> 新建第一个文件夹
          </button>
        )}
      </div>

      <div className="border-t border-[#D7D1C4] bg-[#F8F6F0] p-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold mb-1.5 px-1">
          按来源
        </div>
        <div className="flex gap-1 flex-wrap px-1">
          <SrcChip label="全部" active={!sourceFilter} onClick={() => onSourceFilter("")} />
          {(Object.keys(SOURCE_META) as Source[]).map((s) => {
            const cnt = bySrc[s] || 0
            if (cnt === 0 && sourceFilter !== s) return null
            return (
              <SrcChip
                key={s}
                label={`${SOURCE_META[s].label} ${cnt || ""}`}
                color={SOURCE_META[s].color}
                active={sourceFilter === s}
                onClick={() => onSourceFilter(sourceFilter === s ? "" : s)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FolderItem({
  icon: Icon, name, count, active, onClick, muted, onRename, onDelete,
}: {
  icon: typeof Folder
  name: string
  count: number
  active: boolean
  onClick: () => void
  muted?: boolean
  onRename?: () => void
  onDelete?: () => void
}) {
  const hasActions = !!(onRename || onDelete)
  return (
    <div
      className={`group flex w-full items-center gap-1 rounded-xl px-1.5 py-1 text-sm transition-colors ${
        active
          ? "bg-[#E7EDF3] text-[#315E83] font-semibold"
          : muted
            ? "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            : "hover:bg-[var(--muted)]"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      {hasActions ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <span className={`mr-0.5 min-w-4 text-center text-[10px] ${active ? "" : "text-[var(--muted-foreground)]"}`}>{count}</span>
          <button
            type="button"
            onClick={() => onRename?.()}
            title="重命名"
            aria-label={`重命名文件夹「${name}」`}
            className="grid size-8 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[#FFFEFA] hover:text-[var(--foreground)]"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.()}
            title="删除"
            aria-label={`删除文件夹「${name}」`}
            className="grid size-8 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[#F6ECE7] hover:text-[#A65339]"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className={`text-[10px] shrink-0 ${active ? "" : "text-[var(--muted-foreground)]"}`}>{count}</span>
      )}
    </div>
  )
}

function SrcChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed="true"
        className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-current ${color || "bg-[var(--foreground)] text-[var(--background)]"}`}
      >
        {label}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed="false"
      className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity ${color || "border border-[var(--border)] text-[var(--muted-foreground)]"} ${color ? "opacity-75 hover:opacity-100" : "hover:text-[var(--foreground)]"}`}
    >
      {label}
    </button>
  )
}

// ============ List ============

function NoteList({
  list, loading, selectedId, onSelect, q, onQ,
  selectMode, selectedIds, onSelectAll, allSelected, bulkBar,
}: {
  list: Note[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  q: string
  onQ: (v: string) => void
  selectMode?: boolean
  selectedIds?: Set<number>
  onSelectAll?: () => void
  allSelected?: boolean
  bulkBar?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_9px_24px_rgba(24,35,45,.045)]">
      <div className="space-y-2 border-b border-[#D7D1C4] bg-[#F8F6F0] p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--muted-foreground)]" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="搜笔记标题 / 内容"
            className="h-9 w-full rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] pl-8 pr-3 text-sm outline-none transition-shadow focus:border-[#9FB1BC] focus:ring-2 focus:ring-[#315E83]/10"
          />
        </div>
        {selectMode && (
          <button
            onClick={onSelectAll}
            className="w-full text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--muted)] inline-flex items-center justify-center gap-1.5 text-[var(--muted-foreground)]"
          >
            {allSelected ? <CheckSquare className="size-3" /> : <Square className="size-3" />}
            {allSelected ? "已全选当前列表" : "选中当前列表全部"}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)] text-sm">
            <Loader2 className="size-4 animate-spin mr-2" /> 加载...
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted-foreground)] text-sm px-4">
            <NotebookText className="size-8 mx-auto mb-2 opacity-40" />
            这里还没有笔记
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            <AnimatePresence>
              {list.map((n) => {
                const m = SOURCE_META[n.source]
                const SIcon = m.icon
                const active = n.id === selectedId
                const checked = selectMode && selectedIds?.has(n.id)
                return (
                  <motion.li
                    key={n.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <button
                      type="button"
                      aria-pressed={Boolean(checked || (active && !selectMode))}
                      aria-label={`${selectMode ? "选择" : "打开"}笔记：${n.title}`}
                      onClick={() => onSelect(n.id)}
                      className={`flex w-full gap-2 p-3 text-left transition-colors ${
                        checked
                          ? "bg-[#E9EEE6]"
                          : active && !selectMode
                            ? "bg-[var(--accent)]"
                            : "hover:bg-[var(--muted)] focus-visible:bg-[#F1EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7894A7]"
                      }`}
                    >
                    {selectMode && (
                      <div className="pt-0.5 shrink-0">
                        {checked ? (
                            <CheckSquare className="size-4 text-[#6F8A69]" />
                        ) : (
                          <Square className="size-4 text-[var(--muted-foreground)]" />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${m.color} shrink-0`}>
                            <SIcon className="size-2.5" /> {m.label}
                          </span>
                          {n.folder && (
                            <span className="inline-flex max-w-[6rem] shrink-0 items-center gap-0.5 truncate rounded-full bg-[#E9EEE6] px-1.5 py-0.5 text-[10px] text-[#557052]">
                              <Folder className="size-2.5 shrink-0" /> {n.folder}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
                          {n.updated_at ? new Date(n.updated_at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : ""}
                        </span>
                      </div>
                      <div className="text-sm font-medium line-clamp-1">{n.title}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2">
                        {n.content_md.replace(/[#*`_]/g, "").slice(0, 80) || <span className="italic">空</span>}
                      </div>
                    </div>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {bulkBar}
    </div>
  )
}

function BulkActionBar({
  count, busy, exportingPdf, onDelete, onMove, onExportPdf, onCancel, onRequiz,
}: {
  count: number
  busy: boolean
  exportingPdf: boolean
  onDelete: () => void
  onMove: () => void
  onExportPdf: () => void
  onCancel: () => void
  onRequiz?: () => void
}) {
  const disabled = count === 0 || busy
  return (
    <div className="border-t border-[var(--border)] bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2 space-y-1.5">
      <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 px-1">
        已选 {count} 条
      </div>
      {onRequiz && (
        <Button
          size="sm"
          onClick={onRequiz}
          disabled={disabled}
          className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-white"
          title="基于这些错题暴露的岗位能力点生成新一轮测验"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
          错题二刷
        </Button>
      )}
      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" onClick={onMove} disabled={disabled} className="text-xs">
          <Move className="size-3" /> 移动
        </Button>
        <Button size="sm" variant="outline" onClick={onExportPdf} disabled={disabled || exportingPdf} className="text-xs">
          {exportingPdf ? <Loader2 className="size-3 animate-spin" /> : <FileDown className="size-3" />}
          {exportingPdf ? "导出中" : "导 PDF"}
        </Button>
        <Button
          size="sm"
          onClick={onDelete}
          disabled={disabled}
          className="text-xs bg-rose-500 hover:bg-rose-600 text-white"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          删除
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs">
          <X className="size-3" /> 取消
        </Button>
      </div>
    </div>
  )
}

// ============ Editor ============

function Editor({
  note, dirty, saving, saveError, lastSavedAt, folderNames, onChange, onSave, onDelete, onNotify,
}: {
  note: Note
  dirty: boolean
  saving: boolean
  saveError: string | null
  lastSavedAt: number | null
  folderNames: string[]
  onChange: (patch: Partial<Note>) => void
  onSave: () => void
  onDelete: () => void
  onNotify: (message: string, tone?: ActionNotice["tone"]) => void
}) {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseId = course?.id ?? null

  const [tagInput, setTagInput] = useState("")
  // 默认：有内容打开就是预览（阅读优先，符合 Notion / Obsidian 直觉）；空笔记默认编辑（直接开始写）
  const [previewMode, setPreviewMode] = useState(() => !!note.content_md.trim())
  const [exportingPdf, setExportingPdf] = useState(false)
  const [helperOpen, setHelperOpen] = useState(false)
  const [helperText, setHelperText] = useState("")
  const helperBufRef = useRef("")
  const [quizCreating, setQuizCreating] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const ocrFileRef = useRef<HTMLInputElement | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const m = SOURCE_META[note.source]
  const dlId = `folder-list-${note.id}`

  const helperSSE = usePostSSE({
    onEvent(ev) {
      if (ev.event === "delta") {
        const chunk = typeof ev.data === "string" ? ev.data : ev.raw
        helperBufRef.current += chunk
        setHelperText(helperBufRef.current)
      }
    },
  })

  const summarizeWithTutor = useCallback(() => {
    const content = note.content_md?.trim()
    if (!content) return
    helperBufRef.current = ""
    setHelperText("")
    setHelperOpen(true)
    const prompt = `请用 5 条简洁要点（每条 ≤ 30 字）总结下面这份笔记的核心知识，**直接输出 Markdown 列表**，不要前后客套：\n\n${content.slice(0, 4000)}`
    helperSSE.send("/api/tutor/chat", {
      user_id: USER_ID,
      course_id: courseId,
      messages: [{ role: "user", content: prompt }],
    })
  }, [note.content_md, USER_ID, courseId, helperSSE])

  const appendHelperToNote = useCallback(() => {
    const t = helperBufRef.current.trim()
    if (!t) return
    const sep = note.content_md.trim() ? "\n\n---\n\n" : ""
    onChange({ content_md: `${note.content_md}${sep}## 🤖 AI 助教要点\n\n${t}\n` })
    setHelperOpen(false)
    onNotify("AI 要点已追加，正在自动保存")
  }, [note.content_md, onChange, onNotify])

  const closeHelper = useCallback(() => {
    if (helperSSE.status === "open") helperSSE.abort()
    setHelperOpen(false)
  }, [helperSSE])

  const recognizePhoto = useCallback(async (files: FileList | null) => {
    const file = files?.[0]
    if (ocrFileRef.current) ocrFileRef.current.value = "" // 允许再次选同一文件
    if (!file || !file.type.startsWith("image/")) return
    setOcrBusy(true)
    try {
      const image = await compressImage(file)
      const { text } = await apiPost<{ text: string }>("/ocr/text", { image })
      if (!text?.trim()) {
        onNotify("未能从图片识别出文字，请换一张更清晰的图片", "error")
        return
      }
      const sep = note.content_md.trim() ? "\n\n" : ""
      onChange({ content_md: `${note.content_md}${sep}${text.trim()}\n` })
      onNotify("图片文字已追加，正在自动保存")
    } catch (e) {
      onNotify(`拍照识字失败：${String(e)}`, "error")
    } finally {
      setOcrBusy(false)
    }
  }, [note.content_md, onChange, onNotify])

  const generateQuizFromNote = useCallback(async () => {
    if (quizCreating) return
    const topic = note.title?.trim() || "笔记复习"
    setQuizCreating(true)
    try {
      const session = await createQuizSession({
        user_id: USER_ID,
        course_id: courseId,
        topic,
        mcq_count: 3,
        fill_count: 2,
        code_count: 0,
        difficulty: 2,
        mode: "exam",
        code_grading: "self",
      })
      navigate(`/quiz/${session.id}`)
    } catch (e) {
      onNotify(`出题失败：${String(e)}`, "error")
    } finally {
      setQuizCreating(false)
    }
  }, [USER_ID, courseId, note.title, navigate, quizCreating, onNotify])

  const exportPdf = useCallback(async () => {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      // 打印区只在导出期间挂载；等两帧确保 Markdown 与字体布局完成。
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      if (!printRef.current) throw new Error("打印区未就绪")
      const filename = `${safeFilename(note.title)}.pdf`
      await renderNodeToPdf(printRef.current, filename)
      onNotify("PDF 已导出到下载目录")
    } catch (e) {
      console.error("PDF 导出失败：", e)
      onNotify(`PDF 导出失败：${String(e)}`, "error")
    } finally {
      setExportingPdf(false)
    }
  }, [note.title, exportingPdf, onNotify])

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || note.tags.includes(t)) return
    onChange({ tags: [...note.tags, t] })
    setTagInput("")
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_9px_24px_rgba(24,35,45,.045)]">
      {/* 顶部 toolbar */}
      <div className="space-y-2.5 border-b border-[#D7D1C4] bg-[#F8F6F0] p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${m.color}`}>
            <m.icon className="size-3" /> {m.label}
          </span>
          <input
            value={note.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="笔记标题..."
            className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold text-[#18232D] outline-none transition-colors placeholder:text-[#9A978F] hover:border-[#D7D1C4] focus:border-[#7894A7] focus:ring-2 focus:ring-[#315E83]/10"
          />
          <div className="hidden shrink-0 md:block"><SaveStatusChip dirty={dirty} saving={saving} saveError={saveError} lastSavedAt={lastSavedAt} /></div>
          <Button size="sm" onClick={onSave} disabled={saving || (!dirty && !saveError)} title="Ctrl/⌘ + S 立即保存" className="shrink-0 bg-[#244C66] text-[#FFFEFA] hover:bg-[#193B50] disabled:bg-[#E4E1DA] disabled:text-[#8A8172]">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : saveError ? <RotateCcw className="size-3.5" /> : dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
            {saving ? "保存中" : saveError ? "重试保存" : dirty ? "保存" : "已保存"}
          </Button>
        </div>

        <div className="nav-scroll -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5" aria-label="笔记工具栏">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPreviewMode((v) => !v)}
            title={previewMode ? "切回编辑" : "切到渲染预览"}
            className="shrink-0 text-[#315E83] hover:bg-[#E7EDF3] hover:text-[#244C66]"
          >
            {previewMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {previewMode ? "编辑" : "预览"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="下载 Markdown (.md)"
            className="shrink-0 text-[#66717B] hover:bg-[#F1EDE4] hover:text-[#243746]"
            onClick={() => {
              const md = noteToMarkdown(note)
              const blob = new Blob([md], { type: "text/markdown;charset=utf-8" })
              downloadBlob(blob, `${safeFilename(note.title)}.md`)
              onNotify("Markdown 已下载")
            }}
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">MD</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="导出 PDF"
            disabled={exportingPdf}
            onClick={exportPdf}
            className="shrink-0 text-[#66717B] hover:bg-[#F1EDE4] hover:text-[#243746]"
          >
            {exportingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
            <span className="hidden sm:inline">{exportingPdf ? "导出中" : "PDF"}</span>
          </Button>
          <div className="mx-1 h-5 shrink-0 border-l border-[#D7D1C4]" />
          <input
            ref={ocrFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => recognizePhoto(e.target.files)}
          />
          <Button
            size="sm"
            variant="ghost"
            title="拍照识字：识别图片中的文字并追加到笔记"
            onClick={() => !ocrBusy && ocrFileRef.current?.click()}
            disabled={ocrBusy}
            className="shrink-0 text-[#315E83] hover:bg-[#E7EDF3] hover:text-[#244C66]"
          >
            {ocrBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            <span className="hidden sm:inline ml-1">拍照</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="让助教总结要点"
            onClick={summarizeWithTutor}
            disabled={!note.content_md?.trim() || helperSSE.status === "open"}
            className="shrink-0 text-[#8E6925] hover:bg-[#F4ECD8] hover:text-[#74551E]"
          >
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline ml-1">总结</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="基于笔记标题生成 5 道测验题"
            onClick={generateQuizFromNote}
            disabled={quizCreating || !note.title?.trim()}
            className="shrink-0 text-[#557052] hover:bg-[#E9EEE6] hover:text-[#405B40]"
          >
            {quizCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            <span className="hidden sm:inline ml-1">出题</span>
          </Button>
          <div className="mx-1 h-5 shrink-0 border-l border-[#D7D1C4]" />
          <Button size="sm" variant="ghost" onClick={onDelete} title="删除笔记" aria-label="删除笔记" className="shrink-0 text-[#9A4E35] hover:bg-[#F4E8E2] hover:text-[#7F3F2D]">
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* 文件夹 + 标签 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E2DDD3] pt-2">
          <div className="flex items-center gap-1">
            <Move className="size-3 text-[#8A8172]" />
            <span className="text-[10px] text-[#7A746A]">文件夹</span>
            <input
              list={dlId}
              value={note.folder || ""}
              onChange={(e) => onChange({ folder: e.target.value })}
              placeholder="(未分类)"
              className="h-7 w-28 rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] px-2 text-xs outline-none focus:border-[#7894A7] focus:ring-2 focus:ring-[#315E83]/10"
            />
            <datalist id={dlId}>
              {folderNames.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>

          <div className="h-4 border-l border-[#D7D1C4]" />

          {note.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-2 py-0.5 text-[10px] text-[#66717B]">
              {t}
              <button
                type="button"
                aria-label={`删除标签 ${t}`}
                onClick={() => onChange({ tags: note.tags.filter((x) => x !== t) })}
                className="transition-colors hover:text-[#B85C3E]"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="加标签 ↵"
            className="h-6 w-20 rounded-full border border-dashed border-[#CFC8B9] bg-[#FFFEFA] px-2 text-[10px] outline-none placeholder:text-[#98958D] focus:border-[#7894A7] focus:ring-2 focus:ring-[#315E83]/10"
          />
        </div>
      </div>

      {/* 编辑 / 预览 切换显示 */}
      <div className="flex-1 overflow-hidden">
        {previewMode ? (
          <div className="h-full overflow-y-auto bg-[#FFFEFA] px-4 py-6 sm:px-6">
            {note.content_md.trim() ? (
              <article className="mx-auto max-w-[820px]"><Markdown content={note.content_md} /></article>
            ) : (
              <div className="grid h-full min-h-72 place-items-center text-center">
                <div>
                  <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Pencil className="size-4" /></span>
                  <strong className="mt-3 block text-sm text-[#243746]">这是一张空白纸</strong>
                  <p className="mt-1 text-[11px] leading-5 text-[#7A817F]">切回「编辑」，写下第一条知识或疑问。</p>
                  <button type="button" onClick={() => setPreviewMode(false)} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]"><Pencil className="size-3.5" />开始编辑</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={note.content_md}
            onChange={(e) => onChange({ content_md: e.target.value })}
            placeholder="在这里写下你的想法 / 摘录 / 错题... 支持 Markdown 语法，点右上「预览」查看渲染效果"
            aria-label={`编辑笔记：${note.title || "未命名笔记"}`}
            spellCheck="false"
            className="h-full w-full resize-none bg-[#FFFEFA] px-5 py-6 text-sm leading-7 text-[#243746] outline-none placeholder:text-[#9A978F] focus:bg-[#FFFDF8] sm:px-7"
          />
        )}
      </div>

      {/* 助教结果浮层：右下抽屉，流式显示总结要点 */}
      <TutorHelperPanel
        open={helperOpen}
        status={helperSSE.status}
        content={helperText}
        onClose={closeHelper}
        onAppend={appendHelperToNote}
        onRetry={summarizeWithTutor}
      />

      {/* 隐藏打印区仅在用户实际导出时挂载，避免平时重复解析整篇 Markdown。 */}
      {exportingPdf && (
        <div
          ref={printRef}
          aria-hidden
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "800px",
            background: "#ffffff",
            color: "#111111",
            padding: "32px",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          }}
        >
          <NotePrintCard note={note} />
        </div>
      )}
    </div>
  )
}

function TutorHelperPanel({
  open, status, content, onClose, onAppend, onRetry,
}: {
  open: boolean
  status: "idle" | "open" | "done" | "error"
  content: string
  onClose: () => void
  onAppend: () => void
  onRetry: () => void
}) {
  const loading = status === "open"
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          role="dialog"
          aria-label="AI 笔记要点总结"
          className="fixed bottom-6 right-6 z-40 w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[22px] border border-[#D7C9AA] bg-[#FFFEFA] shadow-[0_20px_52px_rgba(24,35,45,.16)]"
        >
          <div className="flex items-center gap-2 border-b border-[#DED6C8] bg-[#F4ECD8] px-4 py-3">
            <span className="grid size-8 place-items-center rounded-xl bg-[#FFFEFA] text-[#8E6925]"><Sparkles className="size-4" /></span>
            <div><span className="block text-sm font-bold text-[#243746]">AI 助教 · 笔记要点总结</span><span className="mt-0.5 block text-[10px] text-[#7A7166]">结果可检查后再追加，不会直接改写原文</span></div>
            <div className="ml-auto flex items-center gap-1">
              {loading && <Loader2 className="size-3.5 animate-spin text-[#8E6925]" />}
              <button type="button" aria-label="关闭 AI 总结" onClick={onClose} className="grid size-7 place-items-center rounded-full text-[#716B62] hover:bg-[#E9DFC9]">
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-[40vh] overflow-y-auto p-4 text-sm">
            {content ? (
              <Markdown content={content} />
            ) : loading ? (
              <div className="inline-flex items-center gap-2 text-[#66717B]">
                <Loader2 className="size-3.5 animate-spin" /> 正在结合当前笔记组织 5 条核心要点…
              </div>
            ) : status === "error" ? (
              <div role="alert" className="rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] p-3 text-xs leading-5 text-[#9A4E35]">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="size-3.5" />总结生成中断</div>
                <p className="mt-1 text-[#7A625A]">当前笔记没有被修改，可以直接重新生成。</p>
              </div>
            ) : (
              <div className="text-[#7A817F] italic">暂时没有生成内容</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#DED6C8] bg-[#FCFAF5] px-4 py-3">
            <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
            {status === "error" ? (
              <Button size="sm" onClick={onRetry}><RotateCcw className="size-3.5" />重新生成</Button>
            ) : (
              <Button size="sm" onClick={onAppend} disabled={loading || !content.trim()}><Plus className="size-3.5" />追加到笔记</Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NotePrintCard({ note }: { note: Note }) {
  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#111" }}>{note.title}</h1>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
        {SOURCE_META[note.source].label}
        {note.folder ? ` · 文件夹：${note.folder}` : ""}
        {note.updated_at ? ` · 更新于 ${new Date(note.updated_at).toLocaleDateString("zh-CN")}` : ""}
      </div>
      {note.tags.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {note.tags.map((t) => (
            <span
              key={t}
              style={{
                display: "inline-block", fontSize: 10, padding: "2px 8px", borderRadius: 999,
                background: "#f3f4f6", color: "#374151", marginRight: 4, marginBottom: 2,
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}
      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "12px 0" }} />
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "#111" }}>
        <Markdown content={note.content_md || "（空笔记）"} />
      </div>
    </div>
  )
}

async function renderNodeToPdf(node: HTMLElement, filename: string): Promise<void> {
  // PDF 引擎只在用户真正导出时加载，打开笔记页时不预下载截图与排版依赖。
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ])
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  })
  const imgData = canvas.toDataURL("image/png")
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW - 20
  const imgH = (canvas.height * imgW) / canvas.width
  let heightLeft = imgH
  let position = 10
  pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
  heightLeft -= pageH - 20
  while (heightLeft > 0) {
    position = heightLeft - imgH + 10
    pdf.addPage()
    pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
    heightLeft -= pageH - 20
  }
  pdf.save(filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 下一帧释放 URL（让浏览器有机会启动下载）
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(s: string, fallback = "untitled"): string {
  const t = (s || fallback).replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80)
  return t || fallback
}

function noteToMarkdown(note: Note): string {
  const meta: string[] = []
  meta.push(`---`)
  meta.push(`title: ${note.title}`)
  if (note.folder) meta.push(`folder: ${note.folder}`)
  if (note.tags.length) meta.push(`tags: [${note.tags.join(", ")}]`)
  meta.push(`source: ${note.source}`)
  if (note.updated_at) meta.push(`updated_at: ${note.updated_at}`)
  meta.push(`---`)
  return `${meta.join("\n")}\n\n# ${note.title}\n\n${note.content_md || ""}`
}

function SaveStatusChip({
  dirty, saving, saveError, lastSavedAt,
}: { dirty: boolean; saving: boolean; saveError: string | null; lastSavedAt: number | null }) {
  const [, force] = useState(0)
  // 每 15s 刷一下相对时间
  useEffect(() => {
    if (!lastSavedAt) return
    const t = window.setInterval(() => force((x) => x + 1), 15000)
    return () => window.clearInterval(t)
  }, [lastSavedAt])

  if (saving) {
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[10px] text-[#66717B]">
        <Loader2 className="size-3 animate-spin" /> 保存中…
      </span>
    )
  }
  if (saveError) {
    return (
      <span role="alert" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B85C3E]" title={saveError}>
        <AlertTriangle className="size-3" /> 保存失败 · 请重试
      </span>
    )
  }
  if (dirty) {
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[10px] text-[#8E6925]">
        <Loader2 className="size-3 animate-spin" /> 1.5s 后自动保存
      </span>
    )
  }
  if (lastSavedAt) {
    const ago = relTime(lastSavedAt)
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[10px] text-[#557052]">
        <Check className="size-3" /> 已保存 · {ago}
      </span>
    )
  }
  return null
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return "刚刚"
  if (s < 60) return `${s}s 前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m 前`
  const h = Math.floor(m / 60)
  return `${h}h 前`
}

// ============ Folder Dialog ============

function FolderActionDialog({
  dialog, busy, onSubmit, onClose,
}: {
  dialog: FolderDialog
  busy: boolean
  onSubmit: (input: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!dialog) return
    // 弹窗切换动作时，用对应文件夹名初始化本地输入草稿。
    if (dialog.mode === "rename") setValue(dialog.oldName)
    else if (dialog.mode === "create") setValue("")
    // 下一帧聚焦 + 全选
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
    return () => clearTimeout(t)
  }, [dialog])

  // ESC 关闭
  useEffect(() => {
    if (!dialog) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [dialog, onClose])

  if (!dialog) return null

  const isDelete = dialog.mode === "delete"
  const title = dialog.mode === "create" ? "新建文件夹" : dialog.mode === "rename" ? "重命名文件夹" : "删除文件夹"

  const submit = () => {
    if (busy) return
    if (isDelete) onSubmit("")
    else onSubmit(value)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
            {isDelete ? (
              <AlertTriangle className="size-4 text-rose-500" />
            ) : (
              <FolderPlus className="size-4 text-emerald-500" />
            )}
            <span className="font-medium">{title}</span>
          </div>

          <div className="p-4 space-y-3">
            {dialog.mode === "create" && (
              <>
                <label className="text-xs text-[var(--muted-foreground)]">文件夹名（1–32 字推荐）</label>
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit() } }}
                  placeholder="例如：监督学习"
                  maxLength={128}
                  className="w-full h-9 px-3 rounded border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </>
            )}
            {dialog.mode === "rename" && (
              <>
                <label className="text-xs text-[var(--muted-foreground)]">
                  原名：<span className="text-[var(--foreground)] font-medium">{dialog.oldName}</span>
                </label>
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit() } }}
                  maxLength={128}
                  className="w-full h-9 px-3 rounded border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </>
            )}
            {dialog.mode === "delete" && (
              <div className="text-sm space-y-2">
                <p>
                  确定删除文件夹「<span className="font-medium">{dialog.oldName}</span>」？
                </p>
                {dialog.count > 0 ? (
                  <p className="text-[var(--muted-foreground)] text-xs">
                    其中的 <span className="font-medium text-rose-500">{dialog.count}</span> 条笔记将被移动到「未分类」，笔记本身不会丢失。
                  </p>
                ) : (
                  <p className="text-[var(--muted-foreground)] text-xs">该文件夹是空的。</p>
                )}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || (!isDelete && !value.trim())}
              className={isDelete ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {isDelete ? "删除" : dialog.mode === "create" ? "创建" : "保存"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
