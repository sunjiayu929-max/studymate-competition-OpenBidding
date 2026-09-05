/**
 * 可视讲解中心：输入或选择概念，立即观看并操控讲解。
 * 裸路由展示公共推荐示例；q / anim 深链接保持原有行为。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Film,
  Library,
  Loader2,
  PlayCircle,
  Send,
  Sparkles,
} from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { ExternalLearningResources } from "@/components/ExternalLearningResources"
import { ConceptResultView } from "@/components/concepts/ConceptResultView"
import { CONCEPT_ANIMS } from "@/components/concepts/registry"
import { explainConcept, type ConceptRoleContext, type ExplainResult } from "@/lib/concept"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import "./ConceptDemo.css"

const EXAMPLES = [
  "梯度下降是怎么工作的",
  "快速排序怎么分区",
  "TCP 为什么要三次握手",
  "什么是死锁",
  "Cache 怎么判断命中",
  "拥塞控制的 cwnd 怎么变化",
]

const DEFAULT_SHOWCASE_QUERY = "FDE这个岗位是干什么的？"

export function ConceptDemo() {
  useTrackPage("concept")
  const user = useCurrentUser()
  const targetRole = useTargetRole()
  const USER_ID = user?.user_id ?? 0
  const roleContext = useMemo<ConceptRoleContext | undefined>(() => targetRole
    ? {
        target_role: targetRole.name,
        role_summary: targetRole.summary,
        core_competencies: targetRole.skills,
        sample_tasks: targetRole.sampleTasks,
      }
    : undefined, [targetRole])
  const examples = Array.from(new Set([
    ...(targetRole?.sampleTasks?.slice(0, 2) || []),
    ...(targetRole?.skills?.slice(0, 2) || []),
    ...EXAMPLES,
  ])).slice(0, 6)

  const [searchParams] = useSearchParams()
  const queryParam = searchParams.get("q")?.trim() ?? ""
  const initialAnimKey = searchParams.get("anim")
  const initialMatchedAnim = initialAnimKey ? CONCEPT_ANIMS.find((item) => item.key === initialAnimKey) : null
  const isBareRoute = !initialMatchedAnim && !queryParam
  const initialQuery = initialMatchedAnim?.title ?? (queryParam || DEFAULT_SHOWCASE_QUERY)
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
  const [lastQuery, setLastQuery] = useState(initialQuery)
  const [recommended, setRecommended] = useState(isBareRoute)
  const [resourcesOpen, setResourcesOpen] = useState(true)

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim()
      if (!text || loading) return
      setRecommended(false)
      setLoading(true)
      setResult(null)
      setLastQuery(text)
      try {
        const nextResult = await explainConcept(text, USER_ID, roleContext)
        setResult(nextResult)
      } finally {
        setLoading(false)
      }
    },
    [loading, USER_ID, roleContext],
  )

  useEffect(() => {
    if (!loading && result && lastQuery) {
      setResourcesOpen(true)
    }
  }, [loading, result, lastQuery])

  // anim 直接进入已有播放器；q 与裸路由公共示例继续自动装载。
  useEffect(() => {
    if (!initialNeedsExplain) return
    let cancelled = false
    void explainConcept(initialQuery, USER_ID, roleContext)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [USER_ID, initialNeedsExplain, initialQuery, roleContext])

  const statusLabel = loading ? "正在编排" : result ? "讲解已就绪" : "等待输入"
  const conceptTitle = result?.title || result?.script?.concept || lastQuery

  return (
    <main className="app-page paper-theme concept-studio-page min-h-dvh pb-10">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar
          className="rounded-none border-x-0 shadow-none"
          current="concept"
          appearance="paper"
          labelOverride="可视讲解中心"
          groupOverride="知识模型演示"
          selectionLabel={targetRole?.name || "概念探索"}
        />

        <section className="concept-studio-command" aria-labelledby="concept-studio-title">
          <div className="concept-studio-command-heading">
            <div className="concept-studio-command-copy">
              <span className="concept-studio-command-icon" aria-hidden="true"><BrainCircuit /></span>
              <div>
                <span className="concept-studio-kicker"><Sparkles />可控制的可视讲解</span>
                <h1 id="concept-studio-title">输入一个概念，立即看懂它怎么运作</h1>
                <p>动画、分步控制与 AI 旁白同步呈现，也可以切换到画板亲手探索。</p>
              </div>
            </div>
            <Link to="/concept/library" className="concept-studio-library-link">
              <Library />
              <span><b>动画库</b><small>{CONCEPT_ANIMS.length} 个可交互讲解</small></span>
              <ArrowRight />
            </Link>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); void ask(question) }} className="concept-studio-console">
            <label className="sr-only" htmlFor="concept-studio-query">输入要讲解的概念</label>
            <Sparkles aria-hidden="true" />
            <input
              id="concept-studio-query"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="输入技术概念、岗位任务或想弄懂的过程…"
            />
            <button type="submit" disabled={loading || !question.trim()}>
              {loading ? <Loader2 className="animate-spin" /> : <Send />}
              <span>{loading ? "正在生成" : "生成讲解"}</span>
            </button>
          </form>

          <div className="concept-studio-quick-row" aria-label="推荐讲解">
            <span>推荐</span>
            <div>
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => { setQuestion(example); void ask(example) }}>
                  {example}<ArrowRight />
                </button>
              ))}
            </div>
          </div>

          <div className="concept-studio-evidence" aria-live="polite">
            <span className={loading ? "is-loading" : result ? "is-ready" : ""}>
              {loading ? <Loader2 className="animate-spin" /> : result ? <CheckCircle2 /> : <PlayCircle />}{statusLabel}
            </span>
            <span><Film />{CONCEPT_ANIMS.length} 个动画模型</span>
            <span><BrainCircuit />{targetRole ? `已结合 ${targetRole.name}` : "开放概念探索"}</span>
          </div>
        </section>

        <section className="concept-studio-result" aria-labelledby="concept-studio-result-title">
          <header className="concept-studio-result-heading">
            <div>
              <span><Film /></span>
              <div>
                <small>{recommended ? "推荐示例" : "当前讲解"}</small>
                <h2 id="concept-studio-result-title">{lastQuery || "讲解画面与播放控制"}</h2>
              </div>
            </div>
            <span className={loading ? "is-loading" : result ? "is-ready" : ""}>{statusLabel}</span>
          </header>

          <div className="concept-studio-result-shell">
            <ConceptResultView result={result} loading={loading} lastQuery={lastQuery} showResources={false} />
            {!result && !loading && (
              <div className="concept-studio-empty">
                <PlayCircle />
                <div><h3>选择概念开始讲解</h3><p>可以从上方输入，或直接选择一个推荐主题。</p></div>
              </div>
            )}
          </div>

          {!loading && result && lastQuery && (
            <section className="concept-studio-resources" aria-label="相关学习资源">
              <button
                type="button"
                aria-expanded={resourcesOpen}
                aria-controls="concept-studio-resource-content"
                onClick={() => setResourcesOpen((open) => !open)}
              >
                <span><BookOpenText /><span><b>相关学习资源</b><small>书籍、论文、公开文档与主题视频</small></span></span>
                <ChevronDown className={resourcesOpen ? "is-open" : ""} />
              </button>
              {resourcesOpen && (
                <div id="concept-studio-resource-content" className="concept-studio-resource-content">
                  <ExternalLearningResources keyword={lastQuery} conceptTitle={conceptTitle} />
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  )
}
