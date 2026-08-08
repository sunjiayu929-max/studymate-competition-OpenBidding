import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BookOpen, CircleHelp, Database, ExternalLink, FileSearch, FileText, Hash, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react"

import { PageHeader } from "@/components/PageHeader"
import { apiGet } from "@/lib/api"
import { formatSourceLabel, sourceLink, visibleMetadata } from "@/lib/ragSource"
import { useTrackPage } from "@/lib/useTrackPage"
import { DEFAULT_SAMPLE_TOPICS, fallbackSamplesFor, useCourseConfig, useCurrentCourse } from "@/store/course"

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

const RESULT_LIMIT = 8

export function RagDemo() {
  useTrackPage("rag")
  const course = useCurrentCourse()
  const courseCfg = useCourseConfig()
  const sampleQueries: string[] = courseCfg?.sample_topics?.length
    ? courseCfg.sample_topics
    : course
      ? fallbackSamplesFor(course.name).topics
      : DEFAULT_SAMPLE_TOPICS
  const [q, setQ] = useState(sampleQueries[0] || "什么是梯度下降")
  const [stats, setStats] = useState<Stats | null>(null)
  const [resp, setResp] = useState<SearchResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const url = course ? `/rag/stats?course_id=${course.id}` : "/rag/stats"
    apiGet<Stats>(url).then(setStats).catch(() => {})
  }, [course])

  const doSearch = async (query: string) => {
    if (!query.trim()) return
    setLoading(true)
    setError("")
    try {
      const base = `/rag/search?q=${encodeURIComponent(query)}&k=${RESULT_LIMIT}`
      const url = course ? `${base}&course_id=${course.id}` : base
      setResp(await apiGet<SearchResp>(url))
    } catch (searchError) {
      setError(String(searchError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <PageHeader
          current="rag"
          title="岗位知识库检索"
          subtitle={`在《${course?.name || "当前训练资料"}》中定位岗位能力与任务依据，查看来源和相关片段。`}
          icon={Database}
          iconColor="text-[#315E83]"
          appearance="paper"
        />

        <section className="relative overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_16px_42px_rgba(24,35,45,.065)] sm:p-7">
          <div className="pointer-events-none absolute -right-24 -top-32 size-72 rounded-full border border-[#D8D1C3] opacity-60" />
          <div className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border border-[#D8D1C3] opacity-60" />
          <div className="relative grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-8">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-[#6F8A69]"><Sparkles className="size-3.5 text-[#B1842C]" />有依据的学习检索</span>
              <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D] sm:text-2xl">从岗位资料里，找到可以引用的答案</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66717B]">输入概念、问题或关键词。系统会返回最相关的原文片段，而不是只给出无法核实的结论。</p>

              <form onSubmit={(event) => { event.preventDefault(); doSearch(q) }} className="mt-6 flex items-center gap-2 rounded-[20px] border border-[#CFC8B9] bg-[#FFFEFA] p-2 shadow-[0_10px_28px_rgba(24,35,45,.07)] focus-within:border-[#9FB1BC]">
                <span className="grid size-10 shrink-0 place-items-center text-[#315E83]"><Search className="size-4.5" /></span>
                <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索知识点、公式或问题…" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[#18232D] outline-none placeholder:text-[#929792]" />
                <button type="submit" disabled={loading || !q.trim()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{loading ? "检索中" : "开始检索"}
                </button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <span className="mr-1 text-xs font-bold text-[#736958]">试试搜索</span>
                {sampleQueries.slice(0, 5).map((sample) => (
                  <button key={sample} type="button" onClick={() => { setQ(sample); doSearch(sample) }} className="rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-4 py-2 text-xs font-semibold text-[#59636B] shadow-[0_2px_7px_rgba(24,35,45,.035)] transition-all hover:-translate-y-0.5 hover:border-[#AEBAB5] hover:bg-[#E9EEE6] hover:text-[#315E83]">{sample}</button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA]/95 shadow-[0_10px_28px_rgba(24,35,45,.055)]">
              <InfoCard icon={BookOpen} eyebrow="当前检索范围" title={course?.name || "全部训练资料"} description={stats ? `${stats.count} 条知识片段可被检索` : "正在读取知识片段数量"} tone="blue" />
              <InfoCard icon={ShieldCheck} eyebrow="结果可信度" title="每条答案都有来源" description="保留文件名、页码、相关度与原文入口，便于验证。" tone="green" />
              <InfoCard icon={Database} eyebrow="检索引擎" title={stats?.engine || "正在连接"} description="先检索相关材料，再把依据交给学习智能体使用。" tone="gold" />
            </div>
          </div>
        </section>

        {error && <div className="mt-4 rounded-2xl border border-[#DFC9BE] bg-[#F6ECE7] p-4 text-sm text-[#9A4E35]">检索暂时失败：{error}</div>}

        <main className="mt-4">
          <section className="min-w-0">
            {resp ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2 px-1 py-2">
                  <div>
                    <span className="text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]">检索结果</span>
                    <h2 className="mt-1 text-lg font-bold text-[#18232D]">“{resp.query}” 找到 {resp.count} 条依据</h2>
                  </div>
                  <span className="text-[10px] font-semibold text-[#8A8172]">按相对匹配度排序 · 最多显示 {resp.k} 条</span>
                </div>

                <div className="flex items-start gap-2 rounded-2xl border border-[#C7D2D8] bg-[#F3F6F7] px-3.5 py-3 text-[11px] leading-5 text-[#59666E]">
                  <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-[#315E83]" />
                  <p><strong className="text-[#315E83]">相对匹配度如何计算：</strong>{resp.score_meta?.note || "根据课程资料中的词法与语义排序融合后换算，仅用于区分本次结果先后，不代表答案正确概率。"}</p>
                </div>

                {resp.results.map((result, index) => (
                  <motion.article key={result.chunk_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_9px_24px_rgba(24,35,45,.045)]">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E3DED3] pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-[#E7EDF3] text-[11px] font-bold text-[#315E83]">{String(result.rank ?? index + 1).padStart(2, "0")}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#27343D]"><FileText className="size-3.5 text-[#6F8A69]" />{formatSourceLabel(result.source)}</span>
                        {result.page != null && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8A8172]"><Hash className="size-3" />第 {result.page} 页</span>}
                        <a
                          href={sourceLink(result.chunk_id, result.url).href}
                          target={sourceLink(result.chunk_id, result.url).external ? "_blank" : undefined}
                          rel={sourceLink(result.chunk_id, result.url).external ? "noreferrer" : undefined}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#315E83] hover:underline"
                          title={sourceLink(result.chunk_id, result.url).external ? "打开外部原文" : "查看课程资料原文定位"}
                        >
                          <ExternalLink className="size-3" />查看原文
                        </a>
                      </div>
                      <span
                        className="rounded-full border border-[#DDD4BF] bg-[#F4ECD8] px-2.5 py-1 text-[10px] font-bold text-[#8E6925]"
                        title={`${resp.score_meta?.note || "RRF 排名融合分"} 原始分：${result.score.toFixed(6)}`}
                      >
                        {result.relevance_percent == null ? `排序分 ${result.score.toFixed(4)}` : `相对匹配 ${result.relevance_percent}%`}
                      </span>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#27343D]">{result.content}</p>
                    {visibleMetadata(result.meta).length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{visibleMetadata(result.meta).map(([key, value]) => <span key={key} className="rounded-lg bg-[#F1EDE4] px-2 py-1 text-[10px] text-[#66717B]">{key}={String(value)}</span>)}</div>}
                  </motion.article>
                ))}

                {resp.results.length === 0 && <EmptyResults />}
              </div>
            ) : (
              <section className="grid min-h-[360px] place-items-center rounded-[26px] border border-dashed border-[#C9C2B4] bg-[#F8F6F0] p-8 text-center">
                <div className="max-w-md">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><FileSearch className="size-5" /></span>
                  <h2 className="mt-4 text-lg font-bold text-[#18232D]">输入一个知识点开始检索</h2>
                  <p className="mt-2 text-sm leading-6 text-[#66717B]">检索结果会保留课程资料中的原始上下文，方便你核对结论并继续深入学习。</p>
                </div>
              </section>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, eyebrow, title, description, tone }: { icon: typeof Database; eyebrow: string; title: string; description: string; tone: "blue" | "green" | "gold" }) {
  const colors = { blue: "bg-[#E7EDF3] text-[#315E83]", green: "bg-[#E9EEE6] text-[#557052]", gold: "bg-[#F4ECD8] text-[#8E6925]" }
  return (
    <article className="border-b border-[#E3DED3] p-3.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${colors[tone]}`}><Icon className="size-4" /></span>
        <div className="min-w-0"><span className="text-[10px] font-bold tracking-[0.1em] text-[#8A8172]">{eyebrow}</span><h3 className="mt-1 text-sm font-bold text-[#18232D]">{title}</h3></div>
      </div>
      <p className="mt-1.5 pl-12 text-[11px] leading-5 text-[#66717B]">{description}</p>
    </article>
  )
}

function EmptyResults() {
  return (
    <div className="rounded-[24px] border border-dashed border-[#C9C2B4] bg-[#F8F6F0] p-10 text-center">
      <FileSearch className="mx-auto size-6 text-[#8A8172]" />
      <h3 className="mt-3 text-sm font-bold text-[#18232D]">没有找到匹配片段</h3>
      <p className="mt-1 text-xs text-[#66717B]">换一个更具体的知识点，或使用上方的推荐关键词。</p>
    </div>
  )
}
