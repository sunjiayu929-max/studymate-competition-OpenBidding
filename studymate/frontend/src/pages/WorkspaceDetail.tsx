import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { FileText, BookOpen, Hash, ExternalLink, Network as MindMapIcon, Map as RouteIcon, Library, Code2, Sparkles, NotebookText, Check, Plus, Loader2, Film, Target, Database, ShieldCheck, UserRoundSearch, CheckCircle2, CircleHelp, ArrowLeft, ArrowRight, BarChart3 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import type { ProfileMiniData } from "@/components/ProfileMiniCard"
import { Button } from "@/components/ui/button"
import { useWorkspaceStore, workspaceStore, type Citation } from "@/store/workspace"
import { apiGet, apiPost } from "@/lib/api"
import { formatSourceLabel, sourceLink } from "@/lib/ragSource"
import type { QuizItem } from "@/components/QuizCard"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentCourse } from "@/store/course"
import { useCurrentUser } from "@/store/user"
import { SaveToNotebookModal } from "@/components/SaveToNotebookModal"
import { FeedbackThumb } from "@/components/FeedbackThumb"
import type { ConceptAnim } from "@/components/concepts/registry"
import { ConceptAnimationBoundary, ConceptAnimationLoading } from "@/components/concepts/ConceptAnimationState"

// 资源详情共用一条路由，但每次只展示一种资源；重组件按实际分支加载，避免一次下载全部渲染器。
const Markdown = lazy(() => import("@/components/Markdown").then((module) => ({ default: module.Markdown })))
const MindMapView = lazy(() => import("@/components/MindMapView").then((module) => ({ default: module.MindMapView })))
const QuizCard = lazy(() => import("@/components/QuizCard").then((module) => ({ default: module.QuizCard })))
const PathView = lazy(() => import("@/components/PathView").then((module) => ({ default: module.PathView })))
const ReadingList = lazy(() => import("@/components/ReadingList").then((module) => ({ default: module.ReadingList })))
const CodeBlock = lazy(() => import("@/components/CodeBlock").then((module) => ({ default: module.CodeBlock })))
const ConceptPlayer = lazy(() => import("@/components/concepts/ConceptPlayer").then((module) => ({ default: module.ConceptPlayer })))
const ExternalLearningResources = lazy(() => import("@/components/ExternalLearningResources").then((module) => ({ default: module.ExternalLearningResources })))
const ConceptAutoExplain = lazy(() => import("@/components/concepts/ConceptAutoExplain").then((module) => ({ default: module.ConceptAutoExplain })))

// concept = 可视讲解，前端合成（不走 orchestrator），与其余 6 个 orchestrator agent 并列展示
type AgentKey = "doc" | "mindmap" | "quiz" | "reading" | "code" | "path" | "concept"

const META: Record<AgentKey, { title: string; icon: LucideIcon; color: string }> = {
  doc:     { title: "讲解文档",   icon: FileText,    color: "text-[#355C8A]" },
  mindmap: { title: "思维导图",   icon: MindMapIcon, color: "text-[#B85C3E]" },
  quiz:    { title: "检测题",     icon: BookOpen,    color: "text-[#3E7774]" },
  reading: { title: "拓展阅读",   icon: Library,     color: "text-[#6F8A69]" },
  code:    { title: "代码案例",   icon: Code2,       color: "text-[#7E6B83]" },
  path:    { title: "学习路径",   icon: RouteIcon,   color: "text-[#B1842C]" },
  concept: { title: "可视讲解",   icon: Film,        color: "text-[#9B7429]" },
}

const ORDER: AgentKey[] = ["doc", "mindmap", "quiz", "reading", "code", "path", "concept"]

function ResourcePager({
  current,
  prev,
  next,
  variant,
}: {
  current: AgentKey
  prev: AgentKey | null
  next: AgentKey | null
  variant: "header" | "footer"
}) {
  if (variant === "header") {
    return (
      <>
        {prev && (
          <Link to={`/workspace/r/${prev}`}>
            <Button size="sm" variant="ghost">← {META[prev].title}</Button>
          </Link>
        )}
        {next && (
          <Link to={`/workspace/r/${next}`}>
            <Button size="sm" variant="ghost">{META[next].title} →</Button>
          </Link>
        )}
      </>
    )
  }

  const position = ORDER.indexOf(current) + 1
  const linkClass = "inline-flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[#D1C9BA] bg-[#FFFEFA] px-4 py-2.5 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#E7EDF3] sm:flex-none"
  return (
    <nav aria-label="资源顺序导航" className="mt-5 rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-3.5 shadow-[0_8px_22px_rgba(24,35,45,.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1">
          {prev ? (
            <Link to={`/workspace/r/${prev}`} className={linkClass}><ArrowLeft className="size-3.5" /><span><span className="block text-[9px] font-semibold text-[#8A8172]">上一资源</span>{META[prev].title}</span></Link>
          ) : <span className="hidden sm:block" />}
        </div>
        <div className="shrink-0 text-center">
          <span className="block text-[9px] font-bold tracking-[0.12em] text-[#B1842C]">资源 {position} / {ORDER.length}</span>
          <strong className="mt-0.5 block text-xs text-[#27343D]">{META[current].title}</strong>
        </div>
        <div className="flex min-w-0 flex-1 justify-end">
          {next ? (
            <Link to={`/workspace/r/${next}`} className={`${linkClass} justify-end text-right`}><span><span className="block text-[9px] font-semibold text-[#8A8172]">下一资源</span>{META[next].title}</span><ArrowRight className="size-3.5" /></Link>
          ) : <span className="hidden sm:block" />}
        </div>
      </div>
    </nav>
  )
}

export function WorkspaceDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  useTrackPage(`workspace_detail:${agentId || "unknown"}`, { agent: agentId })
  const navigate = useNavigate()
  const state = useWorkspaceStore()
  const course = useCurrentCourse()
  const user = useCurrentUser()
  const docRef = useRef<HTMLDivElement>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [appendingQuiz, setAppendingQuiz] = useState(false)
  const [appendErr, setAppendErr] = useState<string>("")
  const [profile, setProfile] = useState<ProfileMiniData | null>(null)
  const [conceptMatch, setConceptMatch] = useState<ConceptAnim | null>(null)

  useEffect(() => {
    if (!user?.user_id) return
    let active = true
    apiGet<ProfileMiniData>(`/profile/${user.user_id}`)
      .then((value) => {
        if (active) setProfile(value)
      })
      .catch(() => {
        // 画像不是资源详情的硬依赖，拉取失败时保留课程默认策略说明。
      })
    return () => {
      active = false
    }
  }, [user?.user_id])

  const isValidAgent = agentId && ORDER.includes(agentId as AgentKey)
  const meta = isValidAgent ? META[agentId as AgentKey] : null
  const Icon = meta?.icon

  // 上一个 / 下一个
  const { prev, next } = useMemo(() => {
    if (!isValidAgent) return { prev: null, next: null }
    const i = ORDER.indexOf(agentId as AgentKey)
    return {
      prev: i > 0 ? ORDER[i - 1] : null,
      next: i < ORDER.length - 1 ? ORDER[i + 1] : null,
    }
  }, [agentId, isValidAgent])

  const { outputs, stream, topic } = state
  const hasAnyData = state.agents.length > 0 || Object.keys(outputs).length > 0
  const evidenceCourseId = state.courseId ?? course?.id ?? null
  const evidenceCourseName = state.courseName || course?.name || "当前课程"
  const quizHref = topic ? `/quiz?create=1&topic=${encodeURIComponent(topic)}` : "/quiz"
  const answeredCount = Object.keys(state.quizAttempts).length

  const resourceAvailable = useMemo(() => {
    if (!isValidAgent) return false
    switch (agentId) {
      case "doc": return Boolean(outputs.doc?.content || stream.doc)
      case "mindmap": return Boolean(outputs.mindmap?.content || stream.mindmap)
      case "quiz": return Boolean(outputs.quiz?.items?.length || stream.quiz)
      case "reading": return Boolean(outputs.reading?.items?.length || stream.reading)
      case "code": return Boolean(outputs.code?.code || stream.code)
      case "path": return Boolean(outputs.path?.nodes?.length || stream.path)
      case "concept": return Boolean(topic)
      default: return false
    }
  }, [agentId, isValidAgent, outputs, stream, topic])

  // 资源停留超过 1.2 秒才记录为“已查看”；页面隐藏时不累计学习时长。
  useEffect(() => {
    if (!isValidAgent || !agentId || !resourceAvailable) return
    let consumed = false
    let activeSince = document.visibilityState === "visible" ? Date.now() : 0
    let activeDuration = 0
    let consumeTimer: number | null = null

    const scheduleConsume = () => {
      if (consumed || consumeTimer != null || document.visibilityState !== "visible") return
      consumeTimer = window.setTimeout(() => {
        workspaceStore.recordResourceConsumed(agentId)
        consumed = true
        consumeTimer = null
      }, 1200)
    }
    const pause = () => {
      if (activeSince) activeDuration += Date.now() - activeSince
      activeSince = 0
      if (consumeTimer != null) {
        window.clearTimeout(consumeTimer)
        consumeTimer = null
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        pause()
      } else {
        activeSince = Date.now()
        scheduleConsume()
      }
    }

    scheduleConsume()
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      pause()
      document.removeEventListener("visibilitychange", handleVisibility)
      if (consumed && activeDuration > 0) workspaceStore.recordLearningDuration(activeDuration)
    }
  }, [agentId, isValidAgent, resourceAvailable])

  // 仅讲解文档需要检索配套动画；注册表包含大量动画，延迟到正文已可展示后再加载。
  useEffect(() => {
    let active = true
    let registryTimer: number | null = null
    const frame = window.requestAnimationFrame(() => {
      setConceptMatch(null)
      if (agentId !== "doc" || !topic) return
      // 先让 Markdown 正文拿到网络与主线程，再补充体积更大的动画库。
      registryTimer = window.setTimeout(() => {
        void import("@/components/concepts/registry").then(({ matchConcept }) => {
          if (active) setConceptMatch(matchConcept(topic))
        })
      }, 650)
    })
    return () => {
      active = false
      if (registryTimer != null) window.clearTimeout(registryTimer)
      window.cancelAnimationFrame(frame)
    }
  }, [agentId, topic])

  // 主题命中动画库 → doc 页内嵌「动画讲解」
  const ConceptComp = conceptMatch?.component

  // 把当前资源的核心文本作为 page_context.snippet 让助教读到
  const tutorSnippet = useMemo(() => {
    if (!isValidAgent) return undefined
    switch (agentId) {
      case "doc": {
        const d = outputs.doc
        if (!d?.content) return undefined
        const lines = [d.content.slice(0, 1000)]
        if (d.citations?.length) {
          lines.push("\n【引用来源】")
          d.citations.slice(0, 8).forEach((c) => {
            lines.push(
              `[${c.index}] ${formatSourceLabel(c.source)}${c.page != null ? ` p.${c.page}` : ""}: ${String(c.snippet || "").slice(0, 80)}`,
            )
          })
        }
        return lines.join("\n").slice(0, 1400)
      }
      case "mindmap":
        return outputs.mindmap?.content?.slice(0, 1200)
      case "code": {
        const c = outputs.code
        if (!c?.code) return undefined
        const lines: string[] = []
        lines.push(`【文件：${c.filename || "example"} · 语言：${c.language || "python"}】`)
        if (c.explanation) lines.push(`说明：${c.explanation}`)
        if (c.expected_output) lines.push(`预期输出：${c.expected_output}`)
        lines.push("代码：\n```\n" + String(c.code).slice(0, 900) + "\n```")
        return lines.join("\n").slice(0, 1400)
      }
      case "reading": {
        const items = outputs.reading?.items
        if (!items?.length) return undefined
        return items
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}（${r.type} · ${r.difficulty}${r.source ? ` · ${r.source}` : ""}）\n   ${String(r.summary || "").slice(0, 80)}`,
          )
          .join("\n")
          .slice(0, 1400)
      }
      case "path": {
        const nodes = outputs.path?.nodes
        if (!nodes?.length) return undefined
        return nodes
          .map((n, i) => {
            const title = n.data?.title || n.id
            const desc = n.data?.desc ? ` — ${String(n.data.desc).slice(0, 60)}` : ""
            return `第 ${i + 1} 阶段 · ${title}${desc}`
          })
          .join("\n")
          .slice(0, 1400)
      }
      case "quiz": {
        const items = outputs.quiz?.items
        if (!items?.length) return undefined
        const lines: string[] = [
          `【工作台检测题 · 共 ${items.length} 道（用户尚未提交，禁止直接给答案，引导思考即可）】`,
        ]
        items.forEach((q, i) => {
          lines.push(`第 ${i + 1} 题（${q.type}）：${String(q.question).slice(0, 120)}`)
          if (q.type === "mcq" && Array.isArray(q.options) && q.options.length) {
            q.options.forEach((opt, j) => {
              lines.push(`  ${String.fromCharCode(65 + j)}. ${String(opt).slice(0, 60)}`)
            })
          } else if (q.type === "code" && q.starter) {
            lines.push(`  起步代码：${String(q.starter).slice(0, 120)}`)
          }
        })
        return lines.join("\n").slice(0, 1400)
      }
      default:
        return undefined
    }
  }, [agentId, isValidAgent, outputs])
  useTutorContext({
    page: "workspace_detail",
    title: `${meta?.title || "未知资源"}${topic ? ` · ${topic}` : ""}`,
    topic: topic || undefined,
    snippet: tutorSnippet,
  })

  if (!isValidAgent || !meta) {
    return (
      <div className="app-page paper-theme">
        <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
          <PageHeader
            current="workspace"
            title="未知资源"
            backTo="/workspace"
            backLabel="返回工作台"
            icon={Sparkles}
            appearance="paper"
          />
          <div className="grid min-h-[calc(100dvh-190px)] place-items-center py-6 sm:py-10">
            <section className="w-full max-w-[720px] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] text-center shadow-[0_16px_42px_rgba(24,35,45,.07)]">
              <div className="border-b border-[#DDD7CB] bg-[#F8F6F0] px-5 py-7 sm:px-8">
                <span className="mx-auto grid size-12 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><CircleHelp className="size-5" /></span>
                <p className="mt-3 text-[11px] font-bold tracking-[0.12em] text-[#B1842C]">资源地址有误 · 已保护当前任务</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">这个资源入口不存在</h2>
                <p className="mx-auto mt-2 max-w-[520px] text-xs leading-5 text-[#6F787A]">StudyMate 的资源详情只对应以下 7 类学习成果。返回工作台后可以继续当前任务，已有生成内容不会被修改。</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 px-5 py-5" aria-label="支持的资源类型">
                {ORDER.map((key) => {
                  const ResourceIcon = META[key].icon
                  return <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-[#D7D1C4] bg-[#FBF9F4] px-3 py-1.5 text-[11px] font-semibold text-[#59666E]"><ResourceIcon className={`size-3.5 ${META[key].color}`} />{META[key].title}</span>
                })}
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-[#E0DACE] bg-[#FCFAF5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/concept/library" className="text-xs font-semibold text-[#66717B] transition-colors hover:text-[#8E6925]">查看 300 个可视讲解</Link>
                <Link to="/workspace" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white transition-colors hover:bg-[#1D4058]"><Sparkles className="size-4" />返回智能生成工作台</Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    )
  }

  // 把当前资源序列化成 Markdown 笔记内容
  const buildNoteContent = (): { title: string; content: string; tags: string[] } | null => {
    if (!isValidAgent || !meta) return null
    const baseTags = [evidenceCourseName, topic, meta.title].filter(Boolean) as string[]
    switch (agentId) {
      case "doc": {
        const d = outputs.doc
        if (!d?.content) return null
        let content = d.content
        if (d.citations?.length) {
          content += "\n\n---\n\n### 📚 引用来源\n"
          for (const c of d.citations) {
            content += `- **[${c.index}]** ${formatSourceLabel(c.source)}${c.page != null ? ` · p.${c.page}` : ""}\n  > ${c.snippet}\n`
          }
        }
        return { title: `《${topic}》讲解摘录`, content, tags: baseTags }
      }
      case "mindmap": {
        if (!outputs.mindmap?.content) return null
        return { title: `《${topic}》思维导图`, content: outputs.mindmap.content, tags: baseTags }
      }
      case "code": {
        const c = outputs.code
        if (!c?.code) return null
        const lang = c.language || "text"
        const content =
          (c.explanation ? `> ${c.explanation}\n\n` : "") +
          "```" + lang + "\n" + c.code + "\n```\n" +
          (c.expected_output ? `\n**预期输出**：${c.expected_output}\n` : "")
        return { title: `《${topic}》代码 ${c.filename || ""}`, content, tags: baseTags }
      }
      case "reading": {
        const items = outputs.reading?.items
        if (!items?.length) return null
        const content = items
          .map((r) => `- **${r.title}**（${r.type} · ${r.difficulty} · ${r.source}）\n  ${r.summary}${r.url ? `\n  ${r.url}` : ""}`)
          .join("\n")
        return { title: `《${topic}》拓展阅读清单`, content, tags: baseTags }
      }
      case "path": {
        const nodes = outputs.path?.nodes
        if (!nodes?.length) return null
        const content = nodes
          .map((n, i) => `${i + 1}. **${n.data?.title || n.id}**${n.data?.desc ? ` — ${n.data.desc}` : ""}`)
          .join("\n")
        return { title: `《${topic}》学习路径`, content, tags: baseTags }
      }
      default:
        return null
    }
  }

  const noteData = buildNoteContent()
  const canSave = !!noteData

  const confirmSave = async ({ folder, title }: { folder: string; title: string }) => {
    if (!noteData || !user) return
    await apiPost("/notes", {
      user_id: user.user_id,
      course_id: evidenceCourseId,
      folder,
      title,
      content_md: noteData.content,
      tags: noteData.tags,
      source: "doc",
    })
    workspaceStore.recordResourceConsumed("note")
    setSavedFlash(true)
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <PageHeader
          current="workspace"
          title={meta.title}
          subtitle={topic ? `主题：${topic}` : "未选择主题"}
          icon={meta.icon}
          iconColor={meta.color}
          backTo="/workspace"
          backLabel="返回工作台"
          appearance="paper"
          rightExtra={
            <div className="nav-scroll flex max-w-full items-center gap-1 overflow-x-auto">
              {canSave && (
                <Button
                  size="sm"
                  variant={savedFlash ? "ghost" : "outline"}
                  onClick={() => setSaveOpen(true)}
                  className={savedFlash ? "text-[#557052]" : ""}
                >
                  {savedFlash ? (
                    <><Check className="size-3.5" /> 已存笔记</>
                  ) : (
                    <><NotebookText className="size-3.5" /> 保存到笔记</>
                  )}
                </Button>
              )}
              <ResourcePager current={agentId as AgentKey} prev={prev} next={next} variant="header" />
            </div>
          }
        />

        {savedFlash && (
          <section role="status" aria-live="polite" className="mb-4 flex flex-col gap-3 rounded-[20px] border border-[#C9D1CB] bg-[#E9EEE6] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#C9D1CB] bg-[#FFFEFA] text-[#557052]"><CheckCircle2 className="size-4" /></span>
              <div><strong className="block text-sm text-[#24372E]">已保存为可编辑的 Markdown 笔记</strong><p className="mt-0.5 text-[11px] leading-5 text-[#66736A]">这次沉淀已进入学习证据；可以继续整理笔记，或直接用《{topic}》生成完整测验。</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/notes" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#BFCABE] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#557052] hover:bg-[#F5F8F3]"><NotebookText className="size-3.5" />查看笔记</Link>
              <Link to={quizHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#557052] px-3.5 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#465F45]">生成同主题测验 <ArrowRight className="size-3.5" /></Link>
            </div>
          </section>
        )}

        {!hasAnyData && (
          <NoData resourceTitle={meta.title} onBack={() => navigate("/workspace")} />
        )}

        {hasAnyData && (
          <ResourceEvidenceBar
            resource={agentId as AgentKey}
            profile={profile}
            courseName={evidenceCourseName}
            topic={topic}
            retrievedCount={outputs.retriever?.chunks?.length || 0}
            citationCount={outputs.doc?.citations?.length || 0}
          />
        )}

        {hasAnyData && (
          <div className="rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_12px_30px_rgba(24,35,45,.055)] sm:p-6">
            <ResourceErrorBoundary key={`${agentId}:${topic}`} resourceTitle={meta.title}>
            <Suspense fallback={<ResourceLoading label={`正在准备${meta.title}`} />}>
            {agentId === "doc" && (
              <div ref={docRef}>
                {/* 顺序：1.文字正文 → 2.模型/动画(紧贴正文便于对照) → 引用脚注 → 3.视频 */}
                {/* 顶部锚点：有配套动画时一键直达，长文档也能随时跳去和文字对照 */}
                {conceptMatch && ConceptComp && (
                  <button
                    type="button"
                    onClick={() =>
                      docRef.current
                        ?.querySelector("#doc-concept-anim")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-[#D9CFB7] bg-[#F4ECD8] px-3 py-2 text-xs font-semibold text-[#8E6925] transition-colors hover:bg-[#EEE2C7]"
                  >
                    <Film className="size-3.5" /> 本主题有配套动画，点我直达对照
                  </button>
                )}

                {/* 1. 文字讲解正文（含内联引用 [n]） */}
                {outputs.doc?.content || stream.doc ? (
                  <Markdown
                    content={outputs.doc?.content || stream.doc}
                    citations={outputs.doc?.citations}
                    onCitationClick={(idx) => {
                      const citation = outputs.doc?.citations?.find((item) => item.index === idx)
                      if (citation?.chunk_id) {
                        const target = sourceLink(citation.chunk_id, citation.url)
                        if (target.external) {
                          window.open(target.href, "_blank", "noopener,noreferrer")
                        } else {
                          navigate(target.href)
                        }
                        return
                      }
                      const el = docRef.current?.querySelector(`#citation-${idx}`) as HTMLElement | null
                      el?.scrollIntoView({ behavior: "smooth", block: "center" })
                      el?.classList.add("ring-2", "ring-[#315E83]", "rounded")
                      setTimeout(() => el?.classList.remove("ring-2", "ring-[#315E83]", "rounded"), 1500)
                    }}
                  />
                ) : (
                  <EmptyHint icon={Icon} label="文档 Agent 还未输出" />
                )}

                {/* 2. 模型/动画讲解 —— 紧贴正文，方便边读边对照（仅当该主题有配套动画时） */}
                {conceptMatch && ConceptComp && (
                  <div id="doc-concept-anim" className="mt-6 scroll-mt-4">
                    <ConceptAnimationBoundary key={conceptMatch.key} title={conceptMatch.title}>
                      <Suspense fallback={<ConceptAnimationLoading title={conceptMatch.title} />}>
                        <ConceptPlayer
                          title={conceptMatch.title}
                          course={conceptMatch.course}
                          badgeClass={conceptMatch.badgeClass}
                          intro={`对照上面的讲解，用动画再过一遍《${topic}》👇`}
                          lectureReady={conceptMatch.lectureReady}
                          disablePanZoom={!conceptMatch.cssZoom}
                        >
                          <ConceptComp />
                        </ConceptPlayer>
                      </Suspense>
                    </ConceptAnimationBoundary>
                  </div>
                )}

                {/* 引用来源 —— 正文脚注，放对照内容之后 */}
                {outputs.doc?.citations && outputs.doc.citations.length > 0 && (
                  <CitationsBlock citations={outputs.doc.citations} />
                )}

                {/* 3. B 站 + 讯飞人才呀 —— 最后补充外部学习资源 */}
                {topic && <ExternalLearningResources keyword={topic} />}
              </div>
            )}

            {agentId === "mindmap" && (
              outputs.mindmap?.content || stream.mindmap ? (
                <MindMapView markdown={outputs.mindmap?.content || stream.mindmap} height="calc(100vh - 280px)" />
              ) : (
                <EmptyHint icon={Icon} label="思维导图 Agent 还未输出" />
              )
            )}

            {agentId === "quiz" && (
              outputs.quiz?.items?.length ? (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <div className="text-sm text-[var(--muted-foreground)]">
                      共 <span className="font-semibold text-[var(--foreground)]">{outputs.quiz.items.length}</span> 道题
                    </div>
                  </div>
                  {outputs.quiz.items.map((q, i) => (
                    <QuizCard
                      key={q.id}
                      item={q}
                      index={i}
                      topic={topic}
                      allItems={outputs.quiz?.items as QuizItem[]}
                      onSubmit={(r) => workspaceStore.recordQuizAttempt(r)}
                    />
                  ))}
                  <div className="pt-2 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      disabled={appendingQuiz || !topic}
                      onClick={async () => {
                        setAppendingQuiz(true)
                        setAppendErr("")
                        try {
                          const res = await apiPost<{ items: QuizItem[]; count: number }>(
                            "/workspace/append-quiz",
                            {
                              user_id: user?.user_id ?? 1,
                              topic,
                              course_id: course?.id ?? null,
                              mcq: 3,
                              fill: 1,
                              code: 1,
                              difficulty: 2,
                            }
                          )
                          workspaceStore.appendQuizItems(res.items)
                        } catch (e) {
                          setAppendErr(e instanceof Error ? e.message : String(e))
                        } finally {
                          setAppendingQuiz(false)
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-[#C9C2B4] bg-[#FBF9F4] px-5 py-2.5 text-sm font-semibold text-[#66717B] transition-colors hover:border-[#8FA58C] hover:bg-[#E9EEE6] hover:text-[#557052] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {appendingQuiz ? (
                        <><Loader2 className="size-4 animate-spin" /> 出题中...</>
                      ) : (
                        <><Plus className="size-4" /> 再出 5 题</>
                      )}
                    </button>
                    {appendErr && (
                      <div role="alert" className="rounded-lg border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2 text-xs text-[#9A4E35]">追加失败：{appendErr}</div>
                    )}
                  </div>
                </div>
              ) : (
                <StreamFallback text={stream.quiz} icon={Icon} label="题库 Agent 还未输出" />
              )
            )}

            {agentId === "reading" && (
              outputs.reading?.items?.length ? (
                <ReadingList items={outputs.reading.items} topic={topic} />
              ) : (
                <StreamFallback text={stream.reading} icon={Icon} label="阅读 Agent 还未输出" />
              )
            )}

            {agentId === "code" && (
              outputs.code?.code ? (
                <CodeBlock data={outputs.code} />
              ) : stream.code ? (
                <pre className="text-xs font-mono p-4 bg-zinc-950 text-zinc-300 rounded-lg overflow-x-auto"><code>{stream.code}</code></pre>
              ) : (
                <EmptyHint icon={Icon} label="代码 Agent 还未输出" />
              )
            )}

            {agentId === "path" && (
              outputs.path?.nodes?.length ? (
                <PathView nodes={outputs.path.nodes} edges={outputs.path.edges} />
              ) : (
                <StreamFallback text={stream.path} icon={Icon} label="路径 Agent 还未输出" />
              )
            )}

            {/* 可视讲解：前端合成，按当前主题自动出 AI 动画/黑板 + B 站视频（不走 orchestrator） */}
            {agentId === "concept" && (
              <ConceptAutoExplain topic={topic} userId={user?.user_id ?? 0} />
            )}
            </Suspense>
            </ResourceErrorBoundary>

            {topic && (
              <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-start justify-end">
                <FeedbackThumb
                  targetType="resource"
                  targetId={`${agentId}:${topic}`}
                />
              </div>
            )}
          </div>
        )}

        {hasAnyData && resourceAvailable && (
          <ResourcePager current={agentId as AgentKey} prev={prev} next={next} variant="footer" />
        )}

        {hasAnyData && resourceAvailable && (
          <section className="mt-4 overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] shadow-[0_10px_26px_rgba(24,35,45,.05)]">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><CheckCircle2 className="size-4" /></span>
                <div>
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[#315E83]">本次学习下一步</p>
                  <h2 className="mt-0.5 text-sm font-bold text-[#18232D]">把“看过资源”继续变成可验证的学习成果</h2>
                  <p className="mt-1 text-[11px] leading-5 text-[#66717B]">当前{meta.title}将在有效停留后记为已查看{answeredCount ? `，另有 ${answeredCount} 道答题证据可用于评估` : ""}。</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canSave && (
                  <button type="button" onClick={() => setSaveOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#59636B] hover:bg-[#F1EDE4]"><NotebookText className="size-3.5" />{savedFlash ? "再次保存" : "沉淀到笔记"}</button>
                )}
                <Link to={quizHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#BFCABE] bg-[#E9EEE6] px-3 text-[11px] font-bold text-[#557052] hover:bg-[#DFE8DC]"><BookOpen className="size-3.5" />同主题测验</Link>
                <Link to="/report" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]"><BarChart3 className="size-3.5" />查看学习报告</Link>
              </div>
            </div>
          </section>
        )}

        {/* 保存到笔记本弹窗 */}
        {noteData && (
          <SaveToNotebookModal
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            onConfirm={confirmSave}
            defaultTitle={noteData.title}
            defaultFolder={course?.name || ""}
            description={`将《${topic}》${meta.title}保存为 Markdown 笔记`}
          />
        )}
      </div>
    </div>
  )
}

const PREFERENCE_LABELS: Record<string, string> = {
  document: "文档讲解",
  mindmap: "结构图示",
  quiz: "练习验证",
  code: "代码实践",
  video: "视频演示",
  reading: "深度阅读",
}

const RESOURCE_STRATEGY: Record<AgentKey, string> = {
  doc: "用课程原文建立概念主线，并针对薄弱点增加解释层次",
  mindmap: "把当前主题拆成层级关系，帮助快速建立整体结构",
  quiz: "围绕薄弱点与当前主题生成多题型掌握度验证",
  reading: "优先补充课程资料、教材章节与可继续深入的内容",
  code: "将抽象概念转换为可运行示例，强化实践理解",
  path: "依据目标、薄弱点和学习节奏安排阶段化顺序",
  concept: "通过动画、黑板推演和真人讲解进行多模态对照",
}

function ResourceEvidenceBar({
  resource,
  profile,
  courseName,
  topic,
  retrievedCount,
  citationCount,
}: {
  resource: AgentKey
  profile: ProfileMiniData | null
  courseName: string
  topic: string
  retrievedCount: number
  citationCount: number
}) {
  const weakTopics = profile?.dims.weak_points?.topics?.filter(Boolean) || []
  const primaryGoal = profile?.dims.goals?.primary?.trim() || "按当前课程目标学习"
  const preference = Object.entries(profile?.dims.preference || {})
    .filter(([, value]) => typeof value === "number")
    .sort((a, b) => b[1] - a[1])[0]?.[0]
  const preferenceLabel = preference ? PREFERENCE_LABELS[preference] || preference : "课程默认呈现方式"
  const sourceReady = retrievedCount > 0 || citationCount > 0
  const evidenceCount = [Boolean(profile), Boolean(topic), sourceReady].filter(Boolean).length

  return (
    <article className="mb-4 overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] shadow-[0_9px_24px_rgba(24,35,45,.045)]">
      <div className="flex flex-col gap-2 border-b border-[#DDD7CB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-[#6F8A69]"><Sparkles className="size-3.5" />个性化生成说明</div>
          <h2 className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-[#18232D]">为什么这份{META[resource].title}适合你</h2>
        </div>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${evidenceCount === 3 ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#DDD4BF] bg-[#F4ECD8] text-[#8E6925]"}`}>
          {evidenceCount === 3 ? <CheckCircle2 className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          生成依据 {evidenceCount} / 3 已就绪
        </span>
      </div>

      <div className="grid gap-px bg-[#DDD7CB] sm:grid-cols-2 xl:grid-cols-4">
        <EvidenceCell icon={UserRoundSearch} label="画像依据" value={profile ? `画像 v${profile.version}` : "课程默认策略"} hint={primaryGoal} color="#315E83" wash="#E7EDF3" />
        <EvidenceCell icon={Target} label="学习重点" value={topic || "当前主题"} hint={weakTopics.length ? `优先关注：${weakTopics.slice(0, 2).join("、")}` : `偏好方式：${preferenceLabel}`} color="#B85C3E" wash="#F4E8E2" />
        <EvidenceCell icon={Database} label="课程与来源" value={courseName} hint={sourceReady ? `${retrievedCount || citationCount} 条课程依据参与生成` : "返回工作台生成后显示检索依据"} color="#3E7774" wash="#E2EEEB" />
        <EvidenceCell icon={ShieldCheck} label="内容策略" value={preferenceLabel} hint={RESOURCE_STRATEGY[resource]} color="#8E6925" wash="#F4ECD8" />
      </div>
    </article>
  )
}

function EvidenceCell({
  icon: Icon,
  label,
  value,
  hint,
  color,
  wash,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  color: string
  wash: string
}) {
  return (
    <div className="group min-h-[112px] bg-[#FFFEFA] p-4 transition-colors hover:bg-[#FDFBF6]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}><Icon className="size-4" /></span>
        <div className="min-w-0">
          <span className="text-[11px] font-bold tracking-[0.06em] text-[#8A8172]">{label}</span>
          <strong className="mt-1 block truncate text-[12px] text-[#18232D]">{value}</strong>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#737C80]">{hint}</p>
    </div>
  )
}

function NoData({ resourceTitle, onBack }: { resourceTitle: string; onBack: () => void }) {
  return (
    <div className="grid min-h-[calc(100dvh-190px)] place-items-center py-6 sm:py-10">
      <section className="w-full max-w-[760px] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.07)]">
        <div className="border-b border-[#DDD7CB] bg-[#F8F6F0] px-5 py-5 text-center sm:px-8 sm:py-6">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-3 text-[11px] font-bold tracking-[0.12em] text-[#8E6925]">等待生成 · 操作可继续</p>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">这份{resourceTitle}还未生成</h2>
          <p className="mx-auto mt-2 max-w-[560px] text-xs leading-5 text-[#6F787A]">
            返回工作台输入主题后，7 个学习 Agent 会先检索课程依据，再并发生成完整资源包；完成后可在这里核对内容并进入笔记、测验或报告。
          </p>
        </div>

        <div className="grid gap-2.5 p-4 sm:grid-cols-3 sm:p-5" aria-label="生成资源的三个步骤">
          {[
            { step: "01", title: "选择课程", detail: "限定知识库与教材范围", icon: Database, color: "#355C8A", wash: "#E7EDF3" },
            { step: "02", title: "定义主题", detail: "画像参与内容生成策略", icon: Target, color: "#B85C3E", wash: "#F4E8E2" },
            { step: "03", title: "核验成果", detail: "逐类打开并继续学习", icon: ShieldCheck, color: "#6F8A69", wash: "#E8EDE5" },
          ].map(({ step, title, detail, icon: StepIcon, color, wash }) => (
            <div key={step} className="flex items-center gap-3 rounded-2xl border border-[#DDD7CB] bg-[#FBF9F4] p-3 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}>
                <StepIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-bold tracking-[0.1em] text-[#9A9285]">{step}</span>
                <strong className="block text-xs text-[#243746]">{title}</strong>
                <p className="mt-0.5 text-[10px] leading-4 text-[#7A817F]">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#E0DACE] bg-[#FCFAF5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/courses" className="text-center text-xs font-semibold text-[#66717B] transition-colors hover:text-[#244C66]">
            还没选课？先选择课程知识库
          </Link>
          <Button onClick={onBack} className="bg-[#244C66] text-white hover:bg-[#1D4058]">
            <Sparkles className="size-4" /> 返回工作台开始生成
          </Button>
        </div>
      </section>
    </div>
  )
}

function EmptyHint({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">
      {Icon && <Icon className="size-8 mx-auto mb-2 opacity-40" />}
      {label}
    </div>
  )
}

function ResourceLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[240px] place-items-center rounded-[20px] border border-dashed border-[#D7D1C4] bg-[#FBF9F4] px-5 py-10 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><Loader2 className="size-4 animate-spin" /></span>
        <strong className="mt-3 block text-sm text-[#243746]">{label}</strong>
        <p className="mt-1 text-[11px] leading-5 text-[#737C80]">只加载当前需要的资源渲染器，已生成内容不会丢失。</p>
      </div>
    </div>
  )
}

class ResourceErrorBoundary extends Component<
  { children: ReactNode; resourceTitle: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="grid min-h-[260px] place-items-center rounded-[20px] border border-[#DFC8BE] bg-[#FCF7F4] px-5 py-10 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"><CircleHelp className="size-4" /></span>
          <strong className="mt-3 block text-sm text-[#18232D]">{this.props.resourceTitle}渲染器加载失败</strong>
          <p className="mt-1 text-[11px] leading-5 text-[#66717B]">已生成内容仍保存在当前会话中。重新加载后会继续显示，不需要再次生成。</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]"><Loader2 className="size-3.5" />重新加载资源</button>
        </div>
      </div>
    )
  }
}

function StreamFallback({ text, icon, label }: { text: string; icon?: LucideIcon; label: string }) {
  if (text) {
    return <pre className="text-xs whitespace-pre-wrap font-mono text-[var(--muted-foreground)]">{text}</pre>
  }
  return <EmptyHint icon={icon} label={label} />
}

function CitationsBlock({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-4 pt-3 border-t border-[var(--border)]">
      <div className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">📚 引用来源（正文中 [n] 可悬浮预览 + 点击跳转）</div>
      <ol className="space-y-1">
        {citations.map((c) => {
          const target = sourceLink(c.chunk_id, c.url)
          const content = (
            <>
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-[#E7EDF3] px-1 font-mono text-[#315E83]">
                [{c.index}]
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[#27343D]">{formatSourceLabel(c.source)}</span>
                  {c.page != null && (
                    <span className="text-[var(--muted-foreground)]">
                      <Hash className="size-2.5 inline" /> p.{c.page}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-0.5 font-semibold text-[#315E83]">
                    {target.external ? <ExternalLink className="size-2.5" /> : <ArrowRight className="size-2.5" />}
                    {target.external ? "打开外部原文" : "查看教材原文"}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[var(--muted-foreground)]">{c.snippet}</div>
              </div>
            </>
          )
          return (
            <li key={c.index} id={`citation-${c.index}`} className="text-xs">
              {target.external ? (
                <a href={target.href} target="_blank" rel="noreferrer" className="flex items-start gap-2 rounded-lg p-1 transition-colors hover:bg-[#F1EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/30">
                  {content}
                </a>
              ) : (
                <Link to={target.href} className="flex items-start gap-2 rounded-lg p-1 transition-colors hover:bg-[#F1EDE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/30">
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
