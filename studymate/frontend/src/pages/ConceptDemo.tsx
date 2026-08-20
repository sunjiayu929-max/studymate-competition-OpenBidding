/**
 * 概念动画微课 · 动画讲解 Agent
 * ------------------------------------------------------------------
 * 顶部：问任何概念 → Agent 智能匹配动画库 + AI 开场白 + 朗读（多模态讲解）。
 *   命中手写动画放精品；没命中 → AI 现编排通用模板动画（GenericConceptAnim）。
 * 底部：动画库入口 → 跳独立页 /concept/library 慢慢逛（不在本页抢搜索的戏）。
 */
import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, Film, Sparkles, Send, Loader2, Library, ChevronRight, PlayCircle, Layers3, MessageCircleMore } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"
import { useTargetRole } from "@/store/targetRole"
import { CONCEPT_ANIMS } from "@/components/concepts/registry"
import { ConceptResultView } from "@/components/concepts/ConceptResultView"
import { explainConcept, type ExplainResult } from "@/lib/concept"

const EXAMPLES = [
  "梯度下降是怎么工作的",
  "快速排序怎么分区",
  "TCP 为什么要三次握手",
  "什么是死锁",
  "Cache 怎么判断命中",
  "拥塞控制的 cwnd 怎么变化",
]

export function ConceptDemo() {
  useTrackPage("concept")
  const user = useCurrentUser()
  const targetRole = useTargetRole()
  const USER_ID = user?.user_id ?? 0
  const examples = Array.from(new Set([
    ...(targetRole?.sampleTasks?.slice(0, 2) || []),
    ...(targetRole?.skills?.slice(0, 2) || []),
    ...EXAMPLES,
  ])).slice(0, 6)

  const [searchParams] = useSearchParams()
  const initialAnimKey = searchParams.get("anim")
  const initialMatchedAnim = initialAnimKey ? CONCEPT_ANIMS.find((item) => item.key === initialAnimKey) : null
  const initialQuery = initialMatchedAnim?.title ?? searchParams.get("q")?.trim() ?? ""
  const initialNeedsExplain = !initialMatchedAnim && Boolean(initialQuery)
  const initialResult: ExplainResult | null = initialMatchedAnim
    ? {
        matched: true,
        key: initialMatchedAnim.key,
        title: initialMatchedAnim.title,
        intro: `现在播放「${initialMatchedAnim.title}」，你可以暂停、逐步查看或切换讲课模式。`,
        script: null,
        generated: false,
        mock: true,
      }
    : null

  const [question, setQuestion] = useState(initialQuery)
  const [loading, setLoading] = useState(initialNeedsExplain)
  const [result, setResult] = useState<ExplainResult | null>(initialResult)
  const [lastQuery, setLastQuery] = useState(initialQuery) // 已提交的问题，用于 B 站视频检索

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim()
      if (!text || loading) return
      setLoading(true)
      setResult(null)
      setLastQuery(text)
      try {
        const r = await explainConcept(text, USER_ID)
        setResult(r)
      } finally {
        setLoading(false)
      }
    },
    [loading, USER_ID]
  )

  // 动画库已有条目走 anim，直接进入播放器；未命中搜索走 q，让 AI 现编兜底。
  useEffect(() => {
    if (!initialNeedsExplain) return
    let cancelled = false
    void explainConcept(initialQuery, USER_ID)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [USER_ID, initialNeedsExplain, initialQuery])

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="concept" appearance="paper" />

        <section className="mt-4 flex min-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-col gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Film className="size-4" /></span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-[#18232D]">StudyMate 可视讲解</h1>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">用动画、推演和视频理解岗位知识</p>
              </div>
            </div>
            <Link to="/concept/library" className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#F4ECD8] hover:text-[#8E6925] sm:w-auto">
              <Library className="size-3.5" />浏览动画库
            </Link>
          </header>

          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 sm:p-6">
              <div className="pointer-events-none absolute -right-20 -top-28 size-64 rounded-full border border-[#DDD4BF]" />
              <span className="relative inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#6F8A69]"><Sparkles className="size-3.5 text-[#B1842C]" />岗位能力可视化引擎</span>
          <h2 className="relative mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D] sm:text-2xl">把抽象概念变成可播放的过程</h2>
          <p className="relative mt-2 text-sm leading-6 text-[#66717B]">输入能力点、任务步骤或技术概念，查看分步动画和相关视频。</p>

        {/* Agent 提问框 */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="relative mt-5 flex max-w-4xl gap-2 rounded-[20px] border border-[#CFC8B9] bg-[#FFFEFA] p-2 shadow-[0_10px_28px_rgba(24,35,45,.07)]"
        >
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#B1842C]" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入岗位能力点或任务原理，我用动画讲给你看…"
              className="h-11 w-full bg-transparent pl-9 pr-3 text-sm text-[#18232D] outline-none placeholder:text-[#929792]"
            />
          </div>
          <button type="submit" disabled={loading || !question.trim()} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50] disabled:cursor-not-allowed disabled:opacity-45">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            讲解
          </button>
        </form>

        {/* 示例问题 */}
        <div className="relative mt-3 flex flex-wrap gap-2">
          {examples.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuestion(s)
                ask(s)
              }}
              className="rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5 text-[10px] font-semibold text-[#59636B] transition-colors hover:bg-[#E9EEE6] hover:text-[#315E83]"
            >
              {s}
            </button>
          ))}
        </div>
            </section>

        {/* Agent 结果 —— 与多 Agent 工作台「可视讲解」卡共用同一渲染 */}
        <div className="mt-5 flex-1">
          <ConceptResultView result={result} loading={loading} lastQuery={lastQuery} />
          {!result && !loading && (
            <div className="grid gap-3 md:grid-cols-3">
              <CapabilityCard icon={PlayCircle} title="分步动画" description="控制播放节奏，逐步观察算法、系统和网络过程。" tone="blue" />
              <CapabilityCard icon={Layers3} title="黑板推演" description="把公式、结构和因果关系拆开讲清楚。" tone="gold" />
              <CapabilityCard icon={MessageCircleMore} title="真人视频补充" description="匹配相关教学视频，从另一种表达继续理解。" tone="green" />
            </div>
          )}
        </div>

        {/* 动画库入口 —— 单独成页，不在这里抢搜索的戏 */}
        <Link
          to="/concept/library"
          className="group mt-6 flex items-center gap-3 border-t border-[#D7D1C4] pt-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4ECD8] text-[#8E6925]">
            <Library className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-[#243746] transition-colors group-hover:text-[#8E6925]">
              浏览动画库
            </span>
            <span className="block text-xs text-[var(--muted-foreground)]">
            {CONCEPT_ANIMS.length} 个分步动画 · 支持搜索、暂停和单步查看
            </span>
          </span>
          <ChevronRight className="size-5 text-[#8A8172] transition-all group-hover:translate-x-0.5 group-hover:text-[#B1842C]" />
        </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

function CapabilityCard({ icon: Icon, title, description, tone }: { icon: typeof Film; title: string; description: string; tone: "blue" | "gold" | "green" }) {
  const colors = { blue: "bg-[#E7EDF3] text-[#315E83]", gold: "bg-[#F4ECD8] text-[#8E6925]", green: "bg-[#E9EEE6] text-[#557052]" }
  return (
    <article className="rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] p-4 shadow-[0_9px_24px_rgba(24,35,45,.04)]">
      <span className={`grid size-9 place-items-center rounded-xl ${colors[tone]}`}><Icon className="size-4" /></span>
      <h3 className="mt-3 text-sm font-bold text-[#18232D]">{title}</h3>
      <p className="mt-1 text-[11px] leading-5 text-[#66717B]">{description}</p>
    </article>
  )
}
