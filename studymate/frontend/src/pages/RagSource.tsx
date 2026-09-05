import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, BookOpen, Database, ExternalLink, FileText, Hash, Link2, Loader2, RotateCcw, ShieldCheck } from "lucide-react"

import { PageHeader } from "@/components/PageHeader"
import { Markdown } from "@/components/Markdown"
import { ApiError, apiGet } from "@/lib/api"
import { formatInternalLocator, formatSourceLabel, visibleMetadata } from "@/lib/ragSource"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"

interface SourceContextItem {
  chunk_id: string
  content: string
  page: number | null
  meta: Record<string, unknown>
  is_current: boolean
}

interface SourceDetail {
  chunk_id: string
  course_id: number
  course_name: string
  source: string
  page: number | null
  url: string | null
  external_url: string | null
  meta: Record<string, unknown>
  context: SourceContextItem[]
}

interface SourceLoadError {
  message: string
  status: number
}

interface SourceCitation {
  name: string
  url: string
  kind: string
}

function sourceCitations(meta: Record<string, unknown>, fallbackUrl: string | null): SourceCitation[] {
  const raw = Array.isArray(meta.citations) ? meta.citations : []
  const items = raw.flatMap((item): SourceCitation[] => (
    item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string"
      ? [{
        name: typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : "外部原文资料",
        url: (item as { url: string }).url,
        kind: typeof (item as { kind?: unknown }).kind === "string" ? (item as { kind: string }).kind : "原始网页资料",
      }]
      : []
  ))
  if (fallbackUrl && !items.some((item) => item.url === fallbackUrl)) items.unshift({ name: "当前命中原文", url: fallbackUrl, kind: "原始网页资料" })
  return items.filter((item, index, all) => /^https?:\/\//.test(item.url) && all.findIndex((other) => other.url === item.url) === index)
}

export function RagSource() {
  const { chunkId } = useParams<{ chunkId: string }>()
  useTrackPage(`rag_source:${chunkId || "unknown"}`)
  const [data, setData] = useState<SourceDetail | null>(null)
  const [error, setError] = useState<SourceLoadError | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!chunkId) return
    let cancelled = false
    setData(null)
    setError(null)
    apiGet<SourceDetail>(`/rag/chunks/${encodeURIComponent(chunkId)}`)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((requestError) => {
        if (cancelled) return
        setError({
          message: requestError instanceof Error ? requestError.message : String(requestError),
          status: requestError instanceof ApiError ? requestError.status : 0,
        })
      })
    return () => { cancelled = true }
  }, [chunkId, retryToken])

  const current = useMemo(() => data?.context.find((item) => item.is_current), [data])
  const citations = useMemo(() => data ? sourceCitations(data.meta, data.external_url) : [], [data])
  const sourceChapter = useMemo(() => {
    if (!data) return "来源章节未标注"
    const chapter = data.source.match(/第\s*\d+\s*章(?:：[^，]+)?/u)?.[0]
    if (chapter) return `来源章节 · ${chapter}`
    if (data.source.includes("后记")) return "来源章节 · 后记：FDE 的职业道德"
    if (data.source.includes("训练切片")) return "来源章节 · 因材智训 FDE 训练场景"
    return "来源章节未标注"
  }, [data])
  useTutorContext(data ? {
    page: "rag",
    title: `原文依据：${formatSourceLabel(data.source)}`,
    topic: typeof data.meta.topic === "string" ? data.meta.topic : undefined,
    snippet: current?.content.slice(0, 1200),
  } : null)

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <PageHeader
          current="rag"
          title="岗位资料来源"
          subtitle="核对命中片段的来源章节、已入库内容与相邻上下文。"
          icon={FileText}
          iconColor="text-[#315E83]"
          appearance="paper"
          backTo="/rag"
          backLabel="返回检索"
        />

        {!data && !error && (
          <section className="grid min-h-[520px] place-items-center rounded-[28px] border border-[#CFC8B9] bg-[#F8F6F0]">
            <div className="text-center text-sm font-semibold text-[#66717B]"><Loader2 className="mx-auto mb-3 size-5 animate-spin text-[#315E83]" />正在定位岗位知识库原文</div>
          </section>
        )}

        {error && (
          <section role="alert" className="grid min-h-[520px] place-items-center rounded-[28px] border border-[#D8CBBE] bg-[#F8F6F0] p-5 shadow-[0_14px_36px_rgba(24,35,45,.055)]">
            <div className="w-full max-w-[620px] overflow-hidden rounded-[26px] border border-[#D8CBBE] bg-[#FFFEFA] text-center shadow-[0_16px_38px_rgba(24,35,45,.065)]">
              <div className="border-b border-[#E0DACE] bg-[#F6ECE7] px-5 py-7 sm:px-8">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-[#DFC9BE] bg-[#FFFEFA] text-[#B85C3E]"><AlertTriangle className="size-5" /></span>
                <p className="mt-3 text-[11px] font-bold tracking-[0.12em] text-[#B85C3E]">原文定位未完成 · 检索记录仍保留</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">{error.status === 404 ? "这条原文依据不存在" : "暂时无法加载原文依据"}</h2>
                <p className="mx-auto mt-2 max-w-[480px] text-xs leading-5 text-[#6F787A]">{error.message}</p>
              </div>
              <div className="px-5 py-4 text-left sm:px-7">
                <p className="text-[11px] leading-5 text-[#737C80]">你可以返回检索结果选择另一条岗位依据；如果是短暂的网络波动，重新定位不会重复提交或修改任何学习记录。</p>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-[#E0DACE] bg-[#FCFAF5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/rag" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D1C9BA] bg-[#FFFEFA] px-4 text-xs font-bold text-[#59666E] transition-colors hover:bg-[#F1EDE4]"><ArrowLeft className="size-3.5" />返回检索结果</Link>
                {error.status !== 404 ? (
                  <button type="button" onClick={() => setRetryToken((value) => value + 1)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white transition-colors hover:bg-[#1D4058]"><RotateCcw className="size-3.5" />重新定位原文</button>
                ) : (
                  <Link to="/" className="inline-flex h-10 items-center justify-center rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white transition-colors hover:bg-[#1D4058]">返回今日学习</Link>
                )}
              </div>
            </div>
          </section>
        )}

        {data && (
          <>
            <section className="relative overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_16px_42px_rgba(24,35,45,.065)] sm:p-7">
              <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full border border-[#D8D1C3] opacity-60" />
              <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-[#6F8A69]"><ShieldCheck className="size-3.5" />可追溯的岗位依据</span>
                  <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[#18232D] sm:text-3xl">{formatSourceLabel(data.source)}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#66717B]">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5"><BookOpen className="size-3.5 text-[#6F8A69]" />{data.course_name}</span>
                    {data.page != null && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5"><Hash className="size-3.5 text-[#B1842C]" />第 {data.page} 页</span>}
                  </div>
                </div>
              </div>
            </section>

            <main className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="overflow-hidden rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_12px_32px_rgba(24,35,45,.05)]">
                <div className="border-b border-[#E3DED3] bg-[#F8F6F0] px-5 py-4 sm:px-6">
                  <span className="text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]">原文上下文</span>
                  <h2 className="mt-1 text-lg font-bold text-[#18232D]">已入库的命中内容与相邻片段</h2>
                </div>
                <div className="divide-y divide-[#E3DED3]">
                  {data.context.map((item) => (
                    <article key={item.chunk_id} id={`chunk-${item.chunk_id}`} className={`relative px-5 py-5 sm:px-6 ${item.is_current ? "bg-[#F4ECD8]/45" : "bg-[#FFFEFA]"}`}>
                      {item.is_current && <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#244C66] px-3 py-1 text-[10px] font-bold text-[#FFFEFA]"><Link2 className="size-3" />当前命中片段</span>}
                      {!item.is_current && <span className="mb-3 inline-flex text-[10px] font-bold tracking-[0.1em] text-[#8A8172]">相邻原文</span>}
                      {item.page != null && <span className="ml-2 text-[10px] font-semibold text-[#8A8172]">第 {item.page} 页</span>}
                      <Markdown content={item.content} wrapLongContent className={`text-sm leading-8 ${item.is_current ? "font-medium text-[#18232D]" : "text-[#3F4A51]"}`} />
                    </article>
                  ))}
                </div>
              </section>

              <aside className="space-y-3 lg:sticky lg:top-4">
                <InfoBlock icon={Database} title="资料定位" lines={[
                  data.course_name,
                  sourceChapter,
                  formatInternalLocator(data.url),
                ]} />
                <InfoBlock icon={ShieldCheck} title="核对说明" lines={[
                  "当前高亮内容就是检索命中的原文片段",
                  "上下相邻内容来自同一岗位知识资料",
                  "来源和页码由知识库入库时保留",
                ]} />
                {citations.length > 0 && <section className="rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4">
                  <h3 className="text-sm font-bold text-[#18232D]">真实网页来源</h3>
                  <div className="mt-3 space-y-2">{citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2 text-[11px] leading-5 text-[#315E83] transition-colors hover:bg-[#E7EDF3]"><ExternalLink className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 break-words"><strong className="block font-bold">{citation.name}</strong><small className="mt-0.5 block text-[10px] font-medium text-[#78827F]">{citation.kind}</small></span></a>)}</div>
                </section>}
                {visibleMetadata(data.meta).length > 0 && (
                  <section className="rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4">
                    <h3 className="text-sm font-bold text-[#18232D]">片段标签</h3>
                    <div className="mt-3 flex flex-wrap gap-1.5">{visibleMetadata(data.meta).map(([key, value]) => <span key={key} className="rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] px-2 py-1 text-[10px] text-[#66717B]">{key}={String(value)}</span>)}</div>
                  </section>
                )}
              </aside>
            </main>
          </>
        )}
      </div>
    </div>
  )
}

function InfoBlock({ icon: Icon, title, lines }: { icon: typeof Database; title: string; lines: string[] }) {
  return (
    <section className="rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4 shadow-[0_8px_20px_rgba(24,35,45,.035)]">
      <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><Icon className="size-4" /></span><h3 className="text-sm font-bold text-[#18232D]">{title}</h3></div>
      <ul className="mt-3 space-y-2 text-[11px] leading-5 text-[#66717B]">{lines.map((line) => <li key={line} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-[#6F8A69]" /><span className="break-words">{line}</span></li>)}</ul>
    </section>
  )
}
