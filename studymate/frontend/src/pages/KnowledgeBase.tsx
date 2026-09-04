import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  CheckCircle2,
  Database,
  FileSearch,
  FileText,
  Loader2,
  MousePointerClick,
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

import "./KnowledgeBase.css"

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
  const selectedReadyCount = useMemo(
    () => selected?.documents.filter((document) => ["ready", "ready_keyword"].includes(document.status)).length ?? 0,
    [selected],
  )
  const selectedActiveCount = useMemo(
    () => selected?.documents.filter((document) => ["queued", "parsing", "vectorizing"].includes(document.status)).length ?? 0,
    [selected],
  )

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
    <div className="app-page paper-theme knowledge-forge-page min-h-dvh pb-14">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-3">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="knowledge" appearance="paper" labelOverride="自建知识库" groupOverride="个人知识工程" selectionLabel={selected?.name} />

        <main className="knowledge-base-main">
          <header className="knowledge-base-intro">
            <div>
              <span>私有知识工程</span>
              <h1>让自己的资料，成为助教可引用的证据</h1>
              <p>选择知识库，查看文档处理状态，并用带来源与页码的结果验证检索质量。</p>
            </div>
            <dl aria-label="知识库概况">
              <div><dt>知识库</dt><dd>{items.length}</dd></div>
              <div><dt>已入库文件</dt><dd>{items.reduce((sum, item) => sum + item.document_count, 0)}</dd></div>
              <div><dt>处理管线</dt><dd>{hasActiveTask ? "运行中" : "待命"}</dd></div>
            </dl>
          </header>

          <section className="knowledge-base-workspace" aria-label="私有知识库工作台">
            <aside className="knowledge-base-rail" aria-label="知识库列表">
              <div className="knowledge-base-rail-heading">
                <div><Database /><span><strong>我的知识库</strong><small>选择助教引用源</small></span></div>
                <b>{items.length}</b>
              </div>

              <div className="knowledge-base-library-list">
                {loading && <div className="knowledge-base-loading" aria-label="正在加载知识库"><Loader2 className="animate-spin" /></div>}
                {items.map((item) => (
                  <button key={item.id} type="button" disabled={busy} onClick={() => chooseLibrary(item.id)} className={selected?.id === item.id ? "is-selected" : ""}>
                    <span className="knowledge-base-library-icon"><Database /></span>
                    <span><strong>{item.name}</strong><small>{item.document_count} 份资料 · 点击切换</small></span>
                    {selected?.id === item.id && <CheckCircle2 className="knowledge-base-library-check" />}
                  </button>
                ))}
              </div>

              <form className={`knowledge-base-create ${selected ? "is-secondary" : "is-primary"}`} onSubmit={(event) => { event.preventDefault(); void createLibrary() }}>
                <label htmlFor="knowledge-base-name">{selected ? "新建其他知识库" : "创建第一个知识库"}</label>
                <div>
                  <input id="knowledge-base-name" ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="输入知识库名称" maxLength={128} />
                  <button type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}{selected ? "新建" : "创建知识库"}</button>
                </div>
                <small>{selected ? "输入名称后，“新建”按钮会亮起。" : "知识库仅对当前账号可见；输入名称后即可创建。"}</small>
              </form>
            </aside>

            <div className="knowledge-base-stage">
              <header className="knowledge-base-current">
                <div className="knowledge-base-current-copy">
                  <span className="knowledge-base-kicker">当前助教引用库</span>
                  <div className="knowledge-base-current-title">
                    <h2>{selected?.name || "建立首个私有知识库"}</h2>
                    {selected && <span><i />已选用</span>}
                  </div>
                  <p>{selected
                    ? selected.bound_course_id
                      ? selected.bound_course_id === course?.id
                        ? `已绑定当前岗位《${course.name}》，助教会在相关学习场景中使用该库。`
                        : "已绑定岗位，助教会在相关学习场景中使用该库。"
                      : "当前为账号私有引用源，可绑定目标岗位并在助教会话中使用。"
                    : "创建后可上传 PDF、PPTX、DOCX、Markdown 或 TXT。"}</p>
                </div>

                {selected && (
                  <div className="knowledge-base-management" aria-label="知识库管理操作">
                    <span className="knowledge-base-action-hint"><MousePointerClick />点击这里管理当前知识库</span>
                    <div className="knowledge-base-management-buttons">
                      <button type="button" disabled={busy} onClick={renameLibrary} className="is-rename"><Pencil />重命名</button>
                      <button type="button" disabled={busy} onClick={bindCourse} className="is-bind"><BookOpen />{course ? "绑定当前岗位" : "解除岗位绑定"}</button>
                      <button type="button" disabled={busy} onClick={deleteLibrary} className="is-danger"><Trash2 />删除知识库</button>
                    </div>
                  </div>
                )}

                {selected && (
                  <dl className="knowledge-base-current-stats" aria-label="当前知识库状态">
                    <div><dt>资料</dt><dd>{selected.document_count}</dd></div>
                    <div><dt>可检索</dt><dd>{selectedReadyCount}</dd></div>
                    <div><dt>处理中</dt><dd>{selectedActiveCount}</dd></div>
                  </dl>
                )}
              </header>

              {message && <div role="status" className="knowledge-base-message"><i />{message}</div>}

              {!selected ? (
                <div className="knowledge-base-empty-stage">
                  <img src="/images/knowledge-ingestion-engine-v1.png" alt="" />
                  <p>解析进度、失败原因与可引用证据会在这里集中展示并持续更新。</p>
                </div>
              ) : (
                <>
                  <section className="knowledge-base-upload" aria-label="上传资料">
                    <input ref={fileRef} type="file" className="hidden" accept=".pdf,.pptx,.docx,.md,.markdown,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
                    <div className="knowledge-base-upload-copy">
                      <span className="knowledge-base-upload-icon"><Upload /></span>
                      <div><strong>添加资料到当前知识库</strong><small>PDF、PPTX、DOCX、Markdown、TXT · 单文件 20MB</small></div>
                    </div>
                    <ol className="knowledge-base-pipeline" aria-label="资料处理流程">
                      <li><b>1</b>上传</li><li><b>2</b>解析</li><li><b>3</b>向量化</li><li><b>4</b>可检索</li>
                    </ol>
                    <div className="knowledge-base-upload-action">
                      <span><MousePointerClick />建议从这里开始</span>
                      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                        {busy ? <Loader2 className="animate-spin" /> : <Upload />}上传资料
                      </button>
                    </div>
                  </section>

                  <div className="knowledge-base-tabs" role="tablist" aria-label="知识库工作区">
                    <button type="button" role="tab" aria-selected={tab === "library"} onClick={() => setTab("library")} className={tab === "library" ? "is-active" : ""}><FileText />资料与进度</button>
                    <button type="button" role="tab" aria-selected={tab === "search"} onClick={() => setTab("search")} className={tab === "search" ? "is-active" : ""}><FileSearch />RAG 检索测试</button>
                  </div>

                  {tab === "library" ? (
                    <section className="knowledge-base-documents" role="tabpanel" aria-label="资料与进度">
                      <div className="knowledge-base-panel-heading"><div><strong>库内资料</strong><small>后台处理进度会自动更新</small></div><span>{selected.documents.length} 份</span></div>
                      <div className="knowledge-base-document-list">
                        {selected.documents.map((document) => (
                          <article key={document.id} className={`knowledge-base-document is-${document.status}`}>
                            <div className="knowledge-base-file-icon"><FileText /></div>
                            <div className="knowledge-base-document-body">
                              <div className="knowledge-base-document-title"><strong>{document.filename}</strong><span>{document.status === "ready" ? "向量检索就绪" : document.status === "ready_keyword" ? "关键词检索就绪" : document.status === "error" ? "处理失败" : document.status === "queued" ? "等待后台处理" : document.status === "vectorizing" ? "正在向量化" : "正在解析"}</span></div>
                              {["queued", "parsing", "vectorizing"].includes(document.status) && (
                                <div className="knowledge-base-progress-grid">
                                  <Progress label="解析" value={document.parse_progress} />
                                  <Progress label="向量化" value={document.vector_progress} />
                                </div>
                              )}
                              <p>{document.page_count ? `${document.page_count} 页 · ` : ""}{document.error_detail || `${Math.ceil(document.size / 1024)} KB`}</p>
                              {document.ocr_status === "required_unconfigured" && <p className="knowledge-base-ocr">OCR 状态：扫描 PDF 路径可插拔但当前未配置；不会伪装解析成功。</p>}
                            </div>
                            <div className="knowledge-base-document-actions">
                              {document.retry_available && <button type="button" disabled={busy} onClick={() => void retryDocument(document.id)}><RefreshCw />重试 {document.retry_count}/3</button>}
                              <button type="button" disabled={busy} onClick={() => deleteDocument(document.id)} className="is-danger" aria-label={`删除 ${document.filename}`}><Trash2 /></button>
                            </div>
                          </article>
                        ))}
                        {selected.documents.length === 0 && <div className="knowledge-base-document-empty"><FileText /><strong>还没有资料</strong><span>使用上方“上传资料”，处理进度和来源页码会在这里持续更新。</span></div>}
                      </div>
                    </section>
                  ) : (
                    <section className="knowledge-base-search" role="tabpanel" aria-label="RAG 检索测试">
                      <div className="knowledge-base-panel-heading"><div><strong>验证引用证据</strong><small>只检索当前选中的私有知识库</small></div><span>最多返回 6 条</span></div>
                      <form onSubmit={(event) => { event.preventDefault(); void runSearch() }}>
                        <div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入岗位能力点或任务问题" /></div>
                        <button type="submit" disabled={busy || !query.trim()}>{busy ? <Loader2 className="animate-spin" /> : <FileSearch />}启动检索</button>
                      </form>
                      <div className="knowledge-base-results">
                        {results.map((result) => (
                          <article key={result.chunk_id}>
                            <div><strong>{result.source}{result.page ? ` · 第 ${result.page} 页` : ""}</strong><span>相对匹配 {result.relevance_percent}%</span></div>
                            <p>{result.content}</p>
                          </article>
                        ))}
                        {!results.length && <div className="knowledge-base-result-empty"><FileSearch /><span>检索结果会在这里形成带来源与页码的证据列表。</span></div>}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="knowledge-base-progress">
      <div><span>{label}</span><span>{value}%</span></div>
      <div><span style={{ width: `${value}%` }} /></div>
    </div>
  )
}
