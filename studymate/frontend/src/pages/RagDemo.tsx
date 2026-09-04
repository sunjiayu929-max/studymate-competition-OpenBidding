import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { AlertCircle, CircleHelp, ExternalLink, FileSearch, FileText, Hash, Loader2, Search, ShieldCheck } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { Markdown } from "@/components/Markdown"
import { apiGet } from "@/lib/api"
import { formatSourceLabel, sourceLink, visibleMetadata } from "@/lib/ragSource"
import { useTrackPage } from "@/lib/useTrackPage"
import { DEFAULT_SAMPLE_TOPICS, fallbackSamplesFor, useCourseConfig, useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

import "./RagDemo.css"

interface SearchResult {
  chunk_id: string
  content: string
  source: string
  page: number | null
  url: string | null
  meta: Record<string, unknown>
  score: number
  rank?: number
  relevance_percent?: number
  retrieval_mode?: "hybrid" | "lexical" | "semantic"
}

interface SearchResp {
  query: string
  k: number
  count: number
  results: SearchResult[]
  score_meta?: {
    method: string
    mode: string
    active_branches: number
    label: string
    note: string
  }
}

interface Stats {
  count: number
  engine: string
  course_id?: number | null
  per_course?: Record<string, number>
}

const DEFAULT_RESULT_LIMIT = 8
const FDE_RESULT_LIMIT = 12

export function RagDemo() {
  useTrackPage("rag")
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const courseCfg = useCourseConfig()
  const sampleQueries: string[] = targetRole?.sampleTasks?.length
    ? targetRole.sampleTasks
    : courseCfg?.sample_topics?.length
      ? courseCfg.sample_topics
      : course
        ? fallbackSamplesFor(course.name).topics
        : DEFAULT_SAMPLE_TOPICS
  const defaultQuery = sampleQueries[0] || "如何拆解岗位任务与验收标准"
  const resultLimit = targetRole?.id === "fde" ? FDE_RESULT_LIMIT : DEFAULT_RESULT_LIMIT
  const [q, setQ] = useState(defaultQuery)
  const [stats, setStats] = useState<Stats | null>(null)
  const [resp, setResp] = useState<SearchResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const url = course ? `/rag/stats?course_id=${course.id}` : "/rag/stats"
    apiGet<Stats>(url).then(setStats).catch(() => {})
  }, [course])

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) return
    setLoading(true)
    setError("")
    try {
      const base = `/rag/search?q=${encodeURIComponent(query)}&k=${resultLimit}`
      const url = course ? `${base}&course_id=${course.id}` : base
      setResp(await apiGet<SearchResp>(url))
    } catch (searchError) {
      setError(String(searchError))
    } finally {
      setLoading(false)
    }
  }, [course, resultLimit])

  useEffect(() => {
    if (!course) return
    setQ(defaultQuery)
    void doSearch(defaultQuery)
  }, [course, defaultQuery, doSearch])

  if (!course) {
    return (
      <div className="app-page paper-theme rag-evidence">
        <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
          <AppTopbar current="rag" appearance="paper" labelOverride="岗位知识库" groupOverride="知识检索与引用" selectionLabel={targetRole?.name} />
          <section className="rag-evidence-empty-state" role="status">
            <div className="max-w-md">
              <span className="rag-evidence-empty-icon"><AlertCircle /></span>
              <h2>{targetRole ? `${targetRole.name} 的岗位知识库正在建设` : "请先选择目标岗位"}</h2>
              <p>{targetRole ? "岗位选择已保存。专属资料接入后即可按岗位检索原文依据。" : "目标岗位决定检索边界、引用来源和后续测验归档。"}</p>
              <div className="rag-evidence-empty-actions">
                <Link to="/courses?returnTo=%2Frag" className="is-primary">{targetRole ? "更换已开放岗位" : "选择目标岗位"}</Link>
                {targetRole && <Link to="/competency">查看岗位训练状态</Link>}
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  const roleLabel = targetRole?.name || course.name

  return (
    <div className="app-page paper-theme rag-evidence">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="rag" appearance="paper" labelOverride="岗位知识库" groupOverride="知识检索与引用" selectionLabel={roleLabel} />

        <section className="rag-evidence-search-card" aria-labelledby="rag-evidence-title">
          <header className="rag-evidence-search-heading">
            <div className="min-w-0">
              <span className="rag-evidence-kicker"><FileSearch aria-hidden="true" />岗位原文证据检索</span>
              <h2 id="rag-evidence-title">查找可核验的岗位依据</h2>
              <p>输入岗位任务、能力点或现场问题，直接查看相关原文和来源位置。</p>
            </div>
            <span className={`rag-evidence-service-status ${loading ? "is-loading" : ""}`} role="status">
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              {loading ? "正在检索" : resp ? `${resp.count} 条依据已就绪` : "检索服务已就绪"}
            </span>
          </header>

          <form onSubmit={(event) => { event.preventDefault(); void doSearch(q) }} className="rag-evidence-search-form">
            <span className="rag-evidence-search-icon"><Search aria-hidden="true" /></span>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索岗位任务、能力点或现场问题…" aria-label="岗位知识检索问题" />
            <button type="submit" disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              {loading ? "检索中" : "检索岗位依据"}
            </button>
          </form>

          <div className="rag-evidence-support-row">
            <div className="rag-evidence-context" aria-label="当前检索范围">
              <span><small>当前岗位</small><strong>{roleLabel}</strong></span>
              <span><small>知识片段</small><strong>{stats ? `${stats.count} 条` : "读取中"}</strong></span>
              <span><small>检索方式</small><strong>{stats?.engine || "连接中"}</strong></span>
            </div>
            <div className="rag-evidence-suggestions" aria-label="推荐问题">
              <span>推荐问题</span>
              {sampleQueries.slice(0, 3).map((sample) => (
                <button key={sample} type="button" onClick={() => { setQ(sample); void doSearch(sample) }}>{sample}</button>
              ))}
            </div>
          </div>
        </section>

        {error && <div className="rag-evidence-error" role="alert">检索暂时失败：{error}</div>}

        <main className="rag-evidence-results">
          {resp ? (
            <div className="rag-evidence-result-stack">
              <header className="rag-evidence-results-heading">
                <div className="min-w-0">
                  <span>{resp.query === defaultQuery ? "默认知识片段" : "检索结果"}</span>
                  <h2>“{resp.query}” 找到 {resp.count} 条依据</h2>
                </div>
                <div className="rag-evidence-ranking-note" title={resp.score_meta?.note || "根据词法与语义排序融合后换算，仅用于区分本次结果先后，不代表答案正确概率。"}>
                  <CircleHelp aria-hidden="true" />
                  <span>按相对匹配度排序 · 最多 {resp.k} 条 · 仅用于本次排序</span>
                </div>
              </header>

              {resp.results.map((result, index) => {
                const link = sourceLink(result.chunk_id, result.url)
                const metadata = visibleMetadata(result.meta)
                return (
                  <motion.article
                    key={result.chunk_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: Math.min(index * 0.025, 0.15) }}
                    className="rag-evidence-result-card"
                  >
                    <header>
                      <div className="rag-evidence-source-line">
                        <span className="rag-evidence-rank">{String(result.rank ?? index + 1).padStart(2, "0")}</span>
                        <span className="rag-evidence-source"><FileText aria-hidden="true" />{formatSourceLabel(result.source)}</span>
                        {result.page != null && <span className="rag-evidence-page"><Hash aria-hidden="true" />第 {result.page} 页</span>}
                      </div>
                      <span className="rag-evidence-relevance" title={`${resp.score_meta?.note || "排序融合分"} 原始分：${result.score.toFixed(6)}`}>
                        {result.relevance_percent == null ? `排序分 ${result.score.toFixed(4)}` : `相对匹配 ${result.relevance_percent}%`}
                      </span>
                    </header>

                    <Markdown content={result.content} wrapLongContent className="rag-evidence-result-content [&_table]:text-left [&_th]:whitespace-nowrap [&_td]:align-top" />

                    <footer>
                      <div className="rag-evidence-metadata">
                        {metadata.map(([key, value]) => <span key={key}>{key}={String(value)}</span>)}
                      </div>
                      <a href={link.href} target={link.external ? "_blank" : undefined} rel={link.external ? "noreferrer" : undefined} title={link.external ? "打开外部原文" : "查看岗位知识库原文定位"}>
                        <ExternalLink aria-hidden="true" />查看原文
                      </a>
                    </footer>
                  </motion.article>
                )
              })}

              {resp.results.length === 0 && <EmptyResults />}
            </div>
          ) : (
            <section className="rag-evidence-loading-state" role="status">
              <div>
                {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSearch aria-hidden="true" />}
                <h2>正在加载岗位知识片段</h2>
                <p>首次进入会自动展示默认检索结果，随后可继续检索更具体的任务或能力点。</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyResults() {
  return (
    <div className="rag-evidence-no-results">
      <FileSearch aria-hidden="true" />
      <h3>没有找到匹配片段</h3>
      <p>换一个更具体的岗位能力点或任务问题，或使用上方的推荐问题。</p>
    </div>
  )
}
