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
    <div className="app-page paper-theme knowledge-forge-page min-h-dvh pb-14">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="knowledge" appearance="paper" labelOverride="自建知识库" groupOverride="个人知识工程" selectionLabel={selected?.name} showRocketFormation />

        <main className="knowledge-forge-main">
          <section className="knowledge-forge-command">
            <div className="knowledge-forge-hero-copy">
              <span className="knowledge-forge-eyebrow">PRIVATE KNOWLEDGE FORGE · 私有知识工程</span>
              <h1>文件入库，<em>即刻可检索</em></h1>
              <p>选择知识仓，上传资料；解析、向量化与检索证据在同一工作台持续更新。</p>
              <div className="knowledge-forge-metrics">
                <span><b>{items.length}</b><small>知识仓</small></span>
                <span><b>{items.reduce((sum, item) => sum + item.document_count, 0)}</b><small>已入库文件</small></span>
                <span><b>{hasActiveTask ? "运行中" : "待命"}</b><small>解析管线</small></span>
              </div>
            </div>
            <div className="knowledge-forge-quick-select">
              <div className="knowledge-forge-subhead"><span>当前知识仓</span><b>{selected ? "助教已选用" : "等待创建"}</b></div>
              <div className="knowledge-forge-quick-libraries">
                {loading && <div className="knowledge-forge-loading" />}
                {items.map((item) => <button key={item.id} type="button" onClick={() => chooseLibrary(item.id)} className={selected?.id === item.id ? "is-selected" : ""}><Database /><span><strong>{item.name}</strong><small>{item.document_count} 份资料</small></span>{selected?.id === item.id && <CheckCircle2 />}</button>)}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void createLibrary() }}>
                <label htmlFor="knowledge-forge-name">新建私有知识仓</label>
                <div><input id="knowledge-forge-name" ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="输入知识库名称" maxLength={128} /><button type="submit" disabled={busy || !name.trim()}><Plus />创建</button></div>
              </form>
            </div>
          </section>

          <section className="knowledge-forge-section knowledge-forge-workbench knowledge-forge-workbench-primary">
            <SectionHeading number="01" eyebrow="INGESTION & RETRIEVAL" title="文件入库与索引工作台" description="上传、等待、解析、向量化、成功与失败状态分层呈现；操作区与运行状态互不干扰。" />
            <div className="knowledge-forge-tabs">
              <button type="button" onClick={() => setTab("library")} className={tab === "library" ? "is-active" : ""}><span>01</span>资料与进度</button>
              <button type="button" onClick={() => setTab("search")} className={tab === "search" ? "is-active" : ""}><span>02</span>RAG 检索测试</button>
            </div>
            {message && <div role="status" className="knowledge-forge-message"><i />{message}</div>}

            {tab === "library" ? (
              <div className="knowledge-forge-documents">
                {!selected && (
                  <div className="knowledge-forge-empty">
                    <img src="/images/knowledge-ingestion-engine-v1.png" alt="" /><span>WAREHOUSE OFFLINE</span><h2>先建立一座私有知识仓</h2>
                    <p>创建后即可上传 PDF、PPTX、DOCX、Markdown 或 TXT；解析进度、来源页码和失败重试都会真实展示。</p>
                    <button type="button" onClick={() => nameInputRef.current?.focus()}><Plus />立即命名创建</button>
                  </div>
                )}
                {selected && (
                  <div className="knowledge-forge-upload-row">
                    <input ref={fileRef} type="file" className="hidden" accept=".pdf,.pptx,.docx,.md,.markdown,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
                    <div><img src="/images/knowledge-ingestion-engine-v1.png" alt="" /><span><b>INGESTION ENGINE</b><strong>投递文件进入解析管线</strong><small>PDF、PPTX、DOCX、Markdown、TXT · 单文件 20MB</small></span></div>
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                      {busy ? <Loader2 className="animate-spin" /> : <Upload />}选择并上传
                    </button>
                  </div>
                )}

                <div className="knowledge-forge-document-list">
                  {selected?.documents.map((document) => (
                    <article key={document.id} className={`knowledge-forge-document is-${document.status}`}>
                      <div className="knowledge-forge-file-icon"><FileText /></div>
                      <div className="knowledge-forge-document-body">
                        <div className="knowledge-forge-document-title"><strong>{document.filename}</strong><span>{document.status === "ready" ? "向量检索就绪" : document.status === "ready_keyword" ? "关键词检索就绪" : document.status === "error" ? "处理失败" : document.status === "queued" ? "等待后台处理" : document.status === "vectorizing" ? "正在向量化" : "正在解析"}</span></div>
                        {["queued", "parsing", "vectorizing"].includes(document.status) && (
                          <div className="knowledge-forge-progress-grid">
                            <Progress label="解析" value={document.parse_progress} />
                            <Progress label="向量化" value={document.vector_progress} />
                          </div>
                        )}
                        <p>{document.page_count ? `${document.page_count} 页 · ` : ""}{document.error_detail || `${Math.ceil(document.size / 1024)} KB`}</p>
                        {document.ocr_status === "required_unconfigured" && <p className="knowledge-forge-ocr">OCR 状态：扫描 PDF 路径可插拔但当前未配置；不会伪装解析成功。</p>}
                      </div>
                      <div className="knowledge-forge-document-actions">
                        {document.retry_available && <button type="button" disabled={busy} onClick={() => void retryDocument(document.id)}><RefreshCw />重试 {document.retry_count}/3</button>}
                        <button type="button" onClick={() => deleteDocument(document.id)} className="is-danger" aria-label={`删除 ${document.filename}`}><Trash2 /></button>
                      </div>
                    </article>
                  ))}
                  {selected && selected.documents.length === 0 && <div className="knowledge-forge-document-empty">管线当前待命。上传资料后，解析、索引和来源页码会在这里展示。</div>}
                </div>
              </div>
            ) : (
              <div className="knowledge-forge-search-panel">
                <form onSubmit={(event) => { event.preventDefault(); void runSearch() }}>
                  <div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入岗位能力点或任务问题，验证当前私有库的检索结果" /></div>
                  <button type="submit" disabled={busy || !selected || !query.trim()}>{busy ? <Loader2 className="animate-spin" /> : <FileSearch />}启动检索</button>
                </form>
                <div className="knowledge-forge-results">
                  {results.map((result) => (
                    <article key={result.chunk_id}>
                      <div><strong>{result.source}{result.page ? ` · 第 ${result.page} 页` : ""}</strong><span>相对匹配 {result.relevance_percent}%</span></div>
                      <p>{result.content}</p>
                    </article>
                  ))}
                  {!results.length && <div className="knowledge-forge-result-empty"><FileSearch /><span>检索结果将在这里形成带来源与页码的证据列表</span></div>}
                </div>
              </div>
            )}
          </section>

          <section className={`knowledge-forge-transfer ${hasActiveTask ? "is-running" : ""}`} aria-label="文件从上传到可检索的处理管线">
            <div className="knowledge-forge-transfer-copy"><span>PIPELINE TRANSFER</span><strong>从原始文件到检索证据</strong><p>数据包沿专属处理轨道依次通过解析、切片、向量化与索引校验。</p></div>
            <div className="knowledge-forge-transfer-visual"><img src="/images/knowledge-transfer-rail-v1.png" alt="文件上传、解析、向量化和知识归档处理管线" /><i /><i /><i /></div>
            <div className="knowledge-forge-transfer-steps"><span><b>01</b>上传</span><span><b>02</b>解析</span><span><b>03</b>向量化</span><span><b>04</b>可检索</span></div>
          </section>

          <section className="knowledge-forge-section knowledge-forge-library-section">
            <SectionHeading number="02" eyebrow="WAREHOUSE GOVERNANCE" title="知识仓编排与权限边界" description="选择助教引用源，维护岗位绑定和知识仓生命周期；高风险删除操作保持独立。" />
            <div className="knowledge-forge-library-layout">
              <aside className="knowledge-forge-library-list">
                <div className="knowledge-forge-subhead"><span>全部知识仓</span><b>{items.length} 个</b></div>
                {items.map((item) => (
                  <button key={item.id} type="button" onClick={() => chooseLibrary(item.id)} className={selected?.id === item.id ? "is-selected" : ""}>
                    <span><Database /></span><span><strong>{item.name}</strong><small>{item.document_count} 份资料</small></span>
                    {selectedId === item.id && <CheckCircle2 />}
                  </button>
                ))}
              </aside>
              <div className="knowledge-forge-library-console">
                <div className="knowledge-forge-console-info">
                  <span>ACTIVE WAREHOUSE</span>
                  <h2>{selected?.name || "尚未创建知识库"}</h2>
                  <p>{selected?.bound_course_id ? `已绑定岗位 ID ${selected.bound_course_id}` : "可绑定当前岗位，也可在任意助教会话中使用。"}</p>
                  {selected && <div className="knowledge-forge-selected-state"><i />助教已选用 · 私有边界生效</div>}
                </div>
                {selected && <div className="knowledge-forge-console-actions">
                  <span>WAREHOUSE ACTIONS</span>
                  <div className="knowledge-forge-management">
                    <button type="button" onClick={renameLibrary}><Pencil />重命名</button>
                    <button type="button" onClick={bindCourse}><BookOpen />绑定当前岗位</button>
                    <button type="button" onClick={deleteLibrary} className="is-danger"><Trash2 />删除知识库</button>
                  </div>
                </div>}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="knowledge-forge-progress">
      <div><span>{label}</span><span>{value}%</span></div>
      <div><span style={{ width: `${value}%` }} /></div>
    </div>
  )
}

function SectionHeading({ number, eyebrow, title, description }: { number: string; eyebrow: string; title: string; description: string }) {
  return <header className="knowledge-forge-section-heading">
    <span className="knowledge-forge-section-number">{number}</span>
    <div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
    <i aria-hidden="true"><b /><b /><b /></i>
  </header>
}
