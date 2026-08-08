import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  CheckCircle2,
  Database,
  FileSearch,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { getSelectedKnowledgeBaseId, setSelectedKnowledgeBaseId } from "@/store/knowledgeBase"

interface KnowledgeDocument {
  id: number
  filename: string
  media_type: string
  size: number
  status: "queued" | "parsing" | "vectorizing" | "ready" | "ready_keyword" | "error"
  parse_progress: number
  vector_progress: number
  error_detail: string
  page_count: number
  retry_count: number
  retry_available: boolean
  ocr_status: "pending" | "not_needed" | "required_unconfigured"
}

interface KnowledgeLibrary {
  id: number
  name: string
  description: string
  bound_course_id: number | null
  document_count: number
  documents: KnowledgeDocument[]
}

interface SearchHit {
  chunk_id: number
  content: string
  source: string
  page: number | null
  relevance_percent: number
}

export function KnowledgeBase() {
  useTrackPage("knowledge")
  const course = useCurrentCourse()
  const fileRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<KnowledgeLibrary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(getSelectedKnowledgeBaseId)
  const [tab, setTab] = useState<"library" | "search">("library")
  const [name, setName] = useState("")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || items[0] || null, [items, selectedId])

  const refresh = useCallback(async () => {
    const response = await apiGet<{ items: KnowledgeLibrary[] }>("/knowledge-bases")
    setItems(response.items)
    setSelectedId((current) => {
      const next = current && response.items.some((item) => item.id === current)
        ? current
        : response.items[0]?.id ?? null
      setSelectedKnowledgeBaseId(next)
      return next
    })
  }, [])

  useEffect(() => {
    refresh()
      .catch((error) => setMessage(String(error)))
      .finally(() => setLoading(false))
  }, [refresh])

  const hasActiveTask = useMemo(
    () => items.some((library) => library.documents.some((document) => ["queued", "parsing", "vectorizing"].includes(document.status))),
    [items],
  )

  useEffect(() => {
    if (!hasActiveTask) return
    const timer = window.setTimeout(() => {
      void refresh().catch((error) => setMessage(String(error)))
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [hasActiveTask, items, refresh])

  const createLibrary = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const created = await apiPost<KnowledgeLibrary>("/knowledge-bases", {
        name: name.trim(),
        description: "",
        bound_course_id: course?.id ?? null,
      })
      setName("")
      await refresh()
      setSelectedId(created.id)
      setSelectedKnowledgeBaseId(created.id)
      setMessage("私有知识库已创建，并只对当前账号可见")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const chooseLibrary = (id: number) => {
    setSelectedId(id)
    setSelectedKnowledgeBaseId(id)
    setResults([])
    setMessage("AI 助教将从下一轮回答开始引用这个知识库")
  }

  const renameLibrary = async () => {
    if (!selected) return
    const next = window.prompt("知识库名称", selected.name)?.trim()
    if (!next || next === selected.name) return
    setBusy(true)
    try {
      await apiPatch(`/knowledge-bases/${selected.id}`, {
        name: next,
        description: selected.description,
        bound_course_id: selected.bound_course_id,
      })
      await refresh()
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const bindCourse = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await apiPatch(`/knowledge-bases/${selected.id}`, {
        name: selected.name,
        description: selected.description,
        bound_course_id: course?.id ?? null,
      })
      await refresh()
      setMessage(course ? `已绑定当前岗位《${course.name}》` : "已解除岗位绑定")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteLibrary = async () => {
    if (!selected || !window.confirm(`删除知识库“${selected.name}”及其全部资料？此操作不可恢复。`)) return
    setBusy(true)
    try {
      await apiDelete(`/knowledge-bases/${selected.id}`)
      setSelectedId(null)
      setSelectedKnowledgeBaseId(null)
      await refresh()
      setMessage("知识库及对应分片、向量已删除")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const uploadFile = async (file: File) => {
    if (!selected) return
    setBusy(true)
    setMessage(`正在解析 ${file.name}…`)
    const body = new FormData()
    body.append("file", file)
    try {
      const response = await fetch(`/api/knowledge-bases/${selected.id}/documents`, {
        method: "POST",
        body,
        credentials: "include",
      })
      const payload = await response.json() as { detail?: string; status?: string }
      if (!response.ok) throw new Error(payload.detail || "资料上传失败")
      await refresh()
      setMessage("资料已进入后台解析队列；离开页面不会丢失状态，完成后可被 AI 助教引用")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const retryDocument = async (documentId: number) => {
    setBusy(true)
    try {
      await apiPost(`/knowledge-bases/documents/${documentId}/retry`)
      await refresh()
      setMessage("已安全重试：原文件校验通过后会重新解析，进度会持续保存")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteDocument = async (documentId: number) => {
    if (!window.confirm("删除这份资料及其全部检索分片？")) return
    setBusy(true)
    try {
      await apiDelete(`/knowledge-bases/documents/${documentId}`)
      await refresh()
      setMessage("资料、文本分片与向量已同步删除")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const runSearch = async () => {
    if (!selected || !query.trim()) return
    setBusy(true)
    try {
      const response = await apiGet<{ items: SearchHit[] }>(`/knowledge-bases/${selected.id}/search?q=${encodeURIComponent(query.trim())}`)
      setResults(response.items)
      setMessage(response.items.length ? `找到 ${response.items.length} 条私有资料来源` : "没有找到匹配内容，可以换一个关键词")
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="knowledge" appearance="paper" />

        <main className="mt-4 grid min-h-[calc(100dvh-104px)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] p-3 shadow-sm">
            <div className="flex items-center justify-between px-1 py-2">
              <div><span className="text-[10px] font-bold tracking-[.1em] text-[#6F8A69]">PRIVATE LIBRARIES</span><h2 className="mt-1 text-sm font-bold text-[#18232D]">我的知识库</h2></div>
              <span className="rounded-full bg-[#E7EDF3] px-2 py-1 text-[9px] font-bold text-[#315E83]">{items.length} 个</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {loading && <div className="h-16 animate-pulse rounded-2xl bg-[#ECE8DE]" />}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseLibrary(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-2xl border p-3 text-left transition-colors ${selected?.id === item.id ? "border-[#9FB1BC] bg-[#E7EDF3]" : "border-transparent bg-[#FFFEFA] hover:border-[#D7D1C4]"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]"><Database className="size-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-[#18232D]">{item.name}</strong><small className="mt-0.5 block text-[9px] text-[#7A817F]">{item.document_count} 份资料</small></span>
                  {selectedId === item.id && <CheckCircle2 className="size-3.5 text-[#557052]" />}
                </button>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void createLibrary() }} className="mt-3 rounded-2xl border border-dashed border-[#C9C2B4] bg-[#FFFEFA] p-2.5">
              <input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="新知识库名称" maxLength={128} className="h-9 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px] outline-none focus:border-[#9FB1BC]" />
              <button type="submit" disabled={busy || !name.trim()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#244C66] text-[10px] font-bold text-white disabled:opacity-40"><Plus className="size-3.5" />创建私有知识库</button>
            </form>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_14px_36px_rgba(24,35,45,.06)]">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-base font-bold text-[#18232D]">{selected?.name || "创建第一个私有知识库"}</h1>
                  {selected && selectedId === selected.id && <span className="rounded-full bg-[#E9EEE6] px-2 py-1 text-[9px] font-bold text-[#557052]">助教已选用</span>}
                </div>
                <p className="mt-1 text-[11px] text-[#66717B]">{selected?.bound_course_id ? `已绑定岗位 ID ${selected.bound_course_id}` : "可绑定当前岗位，也可在任意助教会话中使用"}</p>
              </div>
              {selected && <div className="flex items-center gap-1.5">
                <button type="button" onClick={renameLibrary} className="grid size-9 place-items-center rounded-xl border border-[#D7D1C4] text-[#59636B] hover:bg-[#ECE8DE]" aria-label="重命名知识库"><Pencil className="size-3.5" /></button>
                <button type="button" onClick={bindCourse} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] px-3 text-[10px] font-bold text-[#315E83] hover:bg-[#E7EDF3]"><BookOpen className="size-3.5" />绑定当前岗位</button>
                <button type="button" onClick={deleteLibrary} className="grid size-9 place-items-center rounded-xl border border-[#DFC8BE] text-[#9A4E35] hover:bg-[#F4E8E2]" aria-label="删除知识库"><Trash2 className="size-3.5" /></button>
              </div>}
            </header>

            <div className="border-b border-[#E3DED3] px-4 pt-3 sm:px-5">
              <button type="button" onClick={() => setTab("library")} className={`mr-5 border-b-2 px-1 pb-3 text-[11px] font-bold ${tab === "library" ? "border-[#315E83] text-[#244C66]" : "border-transparent text-[#7A817F]"}`}>资料与进度</button>
              <button type="button" onClick={() => setTab("search")} className={`border-b-2 px-1 pb-3 text-[11px] font-bold ${tab === "search" ? "border-[#315E83] text-[#244C66]" : "border-transparent text-[#7A817F]"}`}>RAG 检索测试</button>
            </div>

            {message && <div role="status" className="mx-4 mt-4 rounded-xl border border-[#C7D2D8] bg-[#EDF2F5] px-3 py-2 text-[10px] font-semibold text-[#315E83] sm:mx-5">{message}</div>}

            {tab === "library" ? (
              <div className="p-4 sm:p-5">
                {!selected && (
                  <div className="grid min-h-[440px] place-items-center rounded-[22px] border border-dashed border-[#D7D1C4] bg-[#FDFBF6] px-6 py-10 text-center">
                    <div className="max-w-lg">
                      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83] shadow-sm">
                        <Database className="size-6" />
                      </span>
                      <h2 className="mt-4 text-lg font-bold text-[#18232D]">把自己的资料接入学习闭环</h2>
                      <p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-[#66717B]">
                        先在左侧创建知识库，再上传 PDF、PPTX、DOCX、Markdown 或 TXT。解析进度、来源页码和失败重试都会在这里真实展示。
                      </p>
                      <div className="mx-auto mt-5 grid max-w-md gap-2 text-left sm:grid-cols-3">
                        {["01 命名建库", "02 上传解析", "03 助教引用"].map((step) => (
                          <span key={step} className="rounded-xl border border-[#DED8CC] bg-[#FFFEFA] px-3 py-2.5 text-[10px] font-bold text-[#59636B]">{step}</span>
                        ))}
                      </div>
                      <button type="button" onClick={() => nameInputRef.current?.focus()} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[10px] font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#193B50]">
                        <Plus className="size-3.5" />在左侧命名并创建
                      </button>
                    </div>
                  </div>
                )}
                {selected && (
                  <>
                    <input ref={fileRef} type="file" className="hidden" accept=".pdf,.pptx,.docx,.md,.markdown,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex min-h-[116px] w-full items-center justify-center gap-4 rounded-[22px] border border-dashed border-[#BEB6A7] bg-[#FDFBF6] text-left transition-colors hover:bg-[#F7F2E7] disabled:opacity-50">
                      <span className="grid size-11 place-items-center rounded-2xl bg-[#E7EDF3] text-[#315E83]">{busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}</span>
                      <span><strong className="block text-sm text-[#18232D]">上传学习资料</strong><small className="mt-1 block text-[10px] text-[#7A817F]">PDF、PPTX、DOCX、Markdown、TXT · 单文件 20MB · 后台解析</small></span>
                    </button>
                  </>
                )}

                <div className="mt-4 space-y-2.5">
                  {selected?.documents.map((document) => (
                    <article key={document.id} className="flex flex-col gap-3 rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-3.5 sm:flex-row sm:items-center">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FFFEFA] text-[#315E83] shadow-sm"><FileText className="size-4.5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><strong className="truncate text-[11px] text-[#18232D]">{document.filename}</strong><span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold ${document.status === "ready" ? "bg-[#E9EEE6] text-[#557052]" : document.status === "ready_keyword" ? "bg-[#F4ECD8] text-[#8E6925]" : document.status === "error" ? "bg-[#F4E8E2] text-[#9A4E35]" : "bg-[#E7EDF3] text-[#315E83]"}`}>{document.status === "ready" ? "向量检索就绪" : document.status === "ready_keyword" ? "关键词检索就绪" : document.status === "error" ? "处理失败" : document.status === "queued" ? "等待后台处理" : document.status === "vectorizing" ? "正在向量化" : "正在解析"}</span></div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Progress label="解析" value={document.parse_progress} />
                          <Progress label="向量化" value={document.vector_progress} />
                        </div>
                        <p className={`mt-1.5 text-[9px] ${document.status === "error" ? "text-[#9A4E35]" : "text-[#7A817F]"}`}>{document.page_count ? `${document.page_count} 页 · ` : ""}{document.error_detail || `${Math.ceil(document.size / 1024)} KB`}</p>
                        {document.ocr_status === "required_unconfigured" && <p className="mt-1 text-[9px] font-semibold text-[#8E6925]">OCR 状态：扫描 PDF 路径可插拔但当前未配置；不会伪装解析成功。</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {document.retry_available && <button type="button" disabled={busy} onClick={() => void retryDocument(document.id)} className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#D8C9A8] bg-[#FBF7ED] px-2.5 text-[9px] font-bold text-[#8E6925] hover:bg-[#F4ECD8] disabled:opacity-40"><RefreshCw className="size-3" />重试 {document.retry_count}/3</button>}
                        <button type="button" onClick={() => deleteDocument(document.id)} className="grid size-8 place-items-center rounded-xl text-[#9A4E35] hover:bg-[#F4E8E2]" aria-label={`删除 ${document.filename}`}><Trash2 className="size-3.5" /></button>
                      </div>
                    </article>
                  ))}
                  {selected && selected.documents.length === 0 && <div className="rounded-2xl border border-dashed border-[#D7D1C4] p-8 text-center text-[11px] text-[#7A817F]">上传资料后，解析、索引和来源页码会在这里展示。</div>}
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5">
                <form onSubmit={(event) => { event.preventDefault(); void runSearch() }} className="flex gap-2">
                  <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A8172]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入知识点，验证当前私有库的检索结果" className="h-11 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] pl-10 pr-3 text-[11px] outline-none focus:border-[#9FB1BC]" /></div>
                  <button type="submit" disabled={busy || !selected || !query.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[10px] font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}检索</button>
                </form>
                <div className="mt-4 space-y-2.5">
                  {results.map((result) => (
                    <article key={result.chunk_id} className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4">
                      <div className="flex items-center justify-between gap-3"><strong className="truncate text-[11px] text-[#244C66]">{result.source}{result.page ? ` · 第 ${result.page} 页` : ""}</strong><span className="shrink-0 rounded-full bg-[#E9EEE6] px-2 py-1 text-[9px] font-bold text-[#557052]">相对匹配 {result.relevance_percent}%</span></div>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 text-[#59636B]">{result.content}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[8px] font-bold text-[#7A817F]"><span>{label}</span><span>{value}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#E2DDD2]"><span className="block h-full rounded-full bg-[#6F8A69]" style={{ width: `${value}%` }} /></div>
    </div>
  )
}
