import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock3,
  Code2,
  Database,
  FileCheck2,
  FileText,
  Film,
  Library,
  Loader2,
  Map as RouteIcon,
  Network as MindMapIcon,
  NotebookPen,
  RotateCcw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  UserRoundSearch,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { MicButton } from "@/components/MicButton"
import { PhotoTopicButton } from "@/components/PhotoTopicButton"
import type { AgentState, AgentStatus } from "@/components/AgentTimeline"
import type { ProfileMiniData } from "@/components/ProfileMiniCard"
import { useTutorContext } from "@/hooks/useTutorContext"
import { apiGet } from "@/lib/api"
import { track } from "@/lib/track"
import { useTrackPage } from "@/lib/useTrackPage"
import { fallbackSamplesFor, DEFAULT_SAMPLE_TOPICS, useCourseConfig, useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { workspaceStore, useWorkspaceStore, type RunStatus } from "@/store/workspace"

type AgentKey = "doc" | "mindmap" | "quiz" | "reading" | "code" | "path"
type ResourceKey = AgentKey | "concept"
type CheckState = "pass" | "working" | "warn" | "idle"

interface ResourceDefinition {
  id: ResourceKey
  title: string
  detail: string
  icon: LucideIcon
  color: string
  wash: string
}

interface ResourceView {
  resource: ResourceDefinition
  status: AgentStatus | "ready"
  summary: string
  available: boolean
}

const RESOURCE_DEFS: ResourceDefinition[] = [
  { id: "doc", title: "讲解文档", detail: "带知识库引用的个性化讲解", icon: FileText, color: "#355C8A", wash: "#E7EDF3" },
  { id: "mindmap", title: "思维导图", detail: "结构化梳理概念与关系", icon: MindMapIcon, color: "#B85C3E", wash: "#F4E8E2" },
  { id: "quiz", title: "检测题", detail: "选择、填空与代码练习", icon: BookOpenCheck, color: "#3E7774", wash: "#E2EEEB" },
  { id: "reading", title: "拓展阅读", detail: "教材、论文、博客与视频", icon: Library, color: "#6F8A69", wash: "#E8EDE5" },
  { id: "code", title: "代码案例", detail: "适配课程场景的可运行示例", icon: Code2, color: "#7E6B83", wash: "#EEE9EF" },
  { id: "path", title: "学习路径", detail: "由画像驱动的阶段化路线", icon: RouteIcon, color: "#B1842C", wash: "#F4ECD8" },
  { id: "concept", title: "可视讲解", detail: "动画、黑板与真人视频对照", icon: Film, color: "#9B7429", wash: "#F7F0DA" },
]

const AGENT_TONES: Record<string, { icon: LucideIcon; color: string; wash: string }> = {
  retriever: { icon: Search, color: "#355C8A", wash: "#E7EDF3" },
  doc: { icon: FileText, color: "#315E83", wash: "#E8ECEE" },
  mindmap: { icon: MindMapIcon, color: "#B85C3E", wash: "#F4E8E2" },
  quiz: { icon: BookOpenCheck, color: "#3E7774", wash: "#E2EEEB" },
  reading: { icon: Library, color: "#6F8A69", wash: "#E8EDE5" },
  code: { icon: Code2, color: "#7E6B83", wash: "#EEE9EF" },
  path: { icon: RouteIcon, color: "#B1842C", wash: "#F4ECD8" },
}

const STANDBY_AGENTS: AgentState[] = [
  { meta: { id: "retriever", name: "知识检索", icon: "", color: "sky", description: "从课程知识库检索依据" }, status: "pending" },
  { meta: { id: "doc", name: "讲解文档", icon: "", color: "indigo", description: "生成带引用的个性化讲解" }, status: "pending" },
  { meta: { id: "mindmap", name: "思维导图", icon: "", color: "rose", description: "组织概念与知识关系" }, status: "pending" },
  { meta: { id: "quiz", name: "检测题", icon: "", color: "emerald", description: "生成多类型学习验证" }, status: "pending" },
  { meta: { id: "reading", name: "拓展阅读", icon: "", color: "sky", description: "推荐教材、论文与视频" }, status: "pending" },
  { meta: { id: "code", name: "代码案例", icon: "", color: "violet", description: "生成课程适配的示例" }, status: "pending" },
  { meta: { id: "path", name: "学习路径", icon: "", color: "amber", description: "规划个性化学习阶段" }, status: "pending" },
]

function formatDuration(startedAt: number, finishedAt: number) {
  if (!startedAt || !finishedAt || finishedAt <= startedAt) return ""
  const seconds = Math.max(1, Math.round((finishedAt - startedAt) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

export function Workspace() {
  useTrackPage("workspace")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()
  const user = useCurrentUser()
  const userId = user?.user_id ?? 0
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const courseCfg = useCourseConfig()
  const { topic, status, agents, logs, outputs, startedAt, finishedAt, lastError } = useWorkspaceStore()
  const isRunning = status === "running"

  const sampleTopics = courseCfg?.sample_topics?.length
    ? courseCfg.sample_topics
    : course
      ? fallbackSamplesFor(course.name).topics
      : DEFAULT_SAMPLE_TOPICS

  const suggestedTopic = searchParams.get("topic")?.trim() || ""
  const [topicInput, setTopicInput] = useState(suggestedTopic || topic || sampleTopics[0] || "梯度下降")
  const [profile, setProfile] = useState<ProfileMiniData | null>(null)

  useTutorContext({
    page: "workspace",
    title: `学习资源工坊${topic ? ` · ${topic}` : ""}`,
    topic: topic || undefined,
  })

  useEffect(() => {
    if (!userId) return
    let active = true
    apiGet<ProfileMiniData>(`/profile/${userId}`)
      .then((value) => {
        if (active) setProfile(value)
      })
      .catch(() => {
        // 未建立画像时保持空状态，生成仍可使用课程默认配置。
      })
    return () => {
      active = false
    }
  }, [status, userId])

  const handleGenerate = (nextTopic?: string) => {
    const value = (nextTopic ?? topicInput).trim()
    if (!value || isRunning || !userId || !course) return
    setTopicInput(value)
    track("workspace_start", "topic", value, { course_id: course?.id ?? null, course_name: course?.name ?? null })
    // 可视讲解仍使用原接口与原结果，只把请求和懒加载代码块提前到显式生成之后。
    void import("@/components/concepts/ConceptAutoExplain").catch(() => undefined)
    void import("@/lib/concept")
      .then(({ prefetchConcept }) => prefetchConcept(value, userId))
      .catch(() => undefined)
    workspaceStore.start(value, userId, course?.id ?? null, course?.name || "")
  }

  const handleRetry = () => {
    handleGenerate(topic || topicInput)
  }

  const handleCancel = () => {
    track("workspace_stop", "topic", topic, { ready_resources: readyResourceCount })
    workspaceStore.cancel()
  }

  const scrollToResources = () => {
    document.getElementById("workspace-resources")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }

  const statusOf = (id: AgentKey): AgentStatus => {
    return agents.find((agent) => agent.meta.id === id)?.status || "pending"
  }

  const hasOutput = (id: ResourceKey) => {
    switch (id) {
      case "doc": return Boolean(outputs.doc?.content)
      case "mindmap": return Boolean(outputs.mindmap?.content)
      case "quiz": return Boolean(outputs.quiz?.items?.length)
      case "reading": return Boolean(outputs.reading?.items?.length)
      case "code": return Boolean(outputs.code?.code)
      case "path": return Boolean(outputs.path?.nodes?.length)
      case "concept": return Boolean(topic)
    }
  }

  const summaryOf = (id: ResourceKey) => {
    switch (id) {
      case "doc": {
        const doc = outputs.doc
        if (!doc?.content) return "等待文档智能体"
        const characters = doc.content.replace(/\s+/g, "").length
        const citations = doc.citations?.length || 0
        return citations ? `${characters} 字 · ${citations} 条引用` : `${characters} 字 · 暂无引用`
      }
      case "mindmap": {
        const content = outputs.mindmap?.content || ""
        const branches = content.split("\n").filter((line) => /^##\s/u.test(line)).length
        return content ? `${branches || "已生成"} ${branches ? "个主分支" : "结构化导图"}` : "等待导图智能体"
      }
      case "quiz": return outputs.quiz ? `${outputs.quiz.count} 道题` : "等待题库智能体"
      case "reading": return outputs.reading ? `${outputs.reading.count} 个拓展资源` : "等待读取推荐"
      case "code": {
        const code = outputs.code
        return code?.code ? `${code.filename || code.language || "代码"} · ${code.code.split("\n").length} 行` : "等待代码智能体"
      }
      case "path": return outputs.path ? `${outputs.path.count} 个学习阶段` : "等待路径智能体"
      case "concept": return topic ? "动画 / 黑板 / 真人视频" : "生成主题后即可打开"
    }
  }

  const readyResourceCount = RESOURCE_DEFS.filter((resource) => hasOutput(resource.id)).length
  const citationsCount = outputs.doc?.citations?.length || 0
  const retrievedChunks = outputs.retriever?.chunks || []
  const sourceNames = [...new Set(retrievedChunks.map((chunk) => chunk.source).filter(Boolean))]
  const errorCount = agents.filter((agent) => agent.status === "error").length
  const settledAgentCount = agents.filter((agent) => agent.status === "done" || agent.status === "error").length
  const overallProgress = agents.length ? Math.round((settledAgentCount / agents.length) * 100) : 0
  const generationDuration = formatDuration(startedAt, finishedAt)
  const showingPreviousResults = Boolean(
    topic && topicInput.trim() && topicInput.trim() !== topic && readyResourceCount > 0 && !isRunning,
  )
  const profileGoal = profile?.dims.goals?.primary?.trim() || ""
  const weakTopics = profile?.dims.weak_points?.topics?.filter(Boolean) || []
  const trainingTarget = targetRole?.name || course?.name || "目标岗位"

  const qualityChecks: Array<{ label: string; value: string; state: CheckState }> = [
    {
      label: "知识检索",
      value: retrievedChunks.length ? `${retrievedChunks.length} 条命中` : isRunning ? "正在检索" : status === "done" ? "未命中知识片段" : status === "error" || status === "interrupted" ? "本轮未完成" : "等待执行",
      state: retrievedChunks.length ? "pass" : isRunning ? "working" : status === "done" || status === "error" || status === "interrupted" ? "warn" : "idle",
    },
    {
      label: "引用可追溯",
      value: citationsCount ? `${citationsCount} 条引用` : isRunning ? "文档生成中" : status === "done" ? "文档未返回引用" : status === "error" || status === "interrupted" ? "本轮未完成" : "等待文档生成",
      state: citationsCount ? "pass" : isRunning ? "working" : status === "done" || status === "error" || status === "interrupted" ? "warn" : "idle",
    },
    {
      label: "资源完整性",
      value: `${readyResourceCount} / 7 类`,
      state: readyResourceCount === 7 ? "pass" : isRunning ? "working" : status === "done" || status === "error" || status === "interrupted" ? "warn" : "idle",
    },
    {
      label: "运行异常",
      value: errorCount ? `${errorCount} 项异常` : status === "error" ? "连接异常" : status === "interrupted" ? "已停止生成" : status === "done" ? "未发现异常" : isRunning ? "持续监测中" : "等待完成",
      state: errorCount || status === "error" || status === "interrupted" ? "warn" : status === "done" ? "pass" : isRunning ? "working" : "idle",
    },
  ]

  const resourceItems: ResourceView[] = RESOURCE_DEFS.map((resource) => {
    const available = hasOutput(resource.id)
    const resourceStatus: AgentStatus | "ready" = resource.id === "concept"
      ? available ? "ready" : "pending"
      : available ? "done" : statusOf(resource.id)
    return { resource, status: resourceStatus, summary: summaryOf(resource.id), available }
  })

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="workspace" appearance="paper" />

        <main className="pb-14 pt-6 sm:pt-8">
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42 }}
            className="mb-5 flex flex-col gap-4 px-1 lg:flex-row lg:items-end lg:justify-between"
          >
            <div className="max-w-3xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[#315E83]">
                <span className="size-1.5 rounded-full bg-[#B85C3E]" />
                当前目标岗位 · {trainingTarget}
              </div>
              <h1 className="text-balance text-[28px] font-bold leading-[1.18] tracking-[-0.045em] text-[#18232D] sm:text-[36px]">
                围绕目标岗位，<span className="text-[#315E83]">组织可验证的训练资源。</span>
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#66717B]">先从岗位知识库检索有来源的依据，再由 7 个 Agent 协同生成讲义、实操指南、测试题和训练路径。</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link to="/rag" className="inline-flex h-10 items-center gap-2 rounded-full border border-[#C9C2B4] bg-[#FFFEFA] px-4 text-xs font-semibold text-[#244C66] hover:bg-[#F1EDE4]">
                <Database className="size-4" />{course?.name || "打开岗位知识库"}<ChevronRight className="size-3.5" />
              </Link>
              <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-full border border-[#C9C2B4] bg-[#F7F2E7] px-4 text-xs font-semibold text-[#6A5941] hover:bg-[#EEE8DB]">
                <UserRoundSearch className="size-4" />{profile ? `画像 v${profile.version}` : "建立学习画像"}<ChevronRight className="size-3.5" />
              </Link>
            </div>
          </motion.header>

          {!course && (
            <section role="alert" className="mb-4 flex flex-col gap-3 rounded-[20px] border border-[#D8C9A8] bg-[#FBF7ED] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#F4ECD8] text-[#8E6925]"><AlertCircle className="size-4" /></span>
                <div>
                  <h2 className="text-sm font-bold text-[#18232D]">生成前需要先确定目标岗位</h2>
                  <p className="mt-1 text-[11px] leading-5 text-[#66717B]">目标岗位决定 RAG 检索范围、引用来源和后续测验归档。选定后，你刚刚填写的主题仍会保留。</p>
                </div>
              </div>
              <Link to="/courses" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]">选择岗位 <ArrowRight className="size-3.5" /></Link>
            </section>
          )}

          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-4">
              <motion.article
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.46, delay: 0.05 }}
                className="relative overflow-hidden rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_12px_30px_rgba(24,35,45,.065)] sm:p-6"
              >
                <div className="pointer-events-none absolute -right-20 -top-24 size-64 rotate-12 rounded-[52px] bg-[#EEF0EF]" />
                <div className="relative z-10">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="text-[11px] font-bold tracking-[0.1em] text-[#B85C3E]">01 · 定义生成任务</span>
                      <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">这次要训练哪个岗位问题？</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-[#59636B]">
                      <span className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-2.5 py-1">先检索后生成</span>
                      <span className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-2.5 py-1">画像参与策略</span>
                      <span className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-2.5 py-1">七类资源并发输出</span>
                    </div>
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleGenerate()
                    }}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <label className="relative min-w-0 flex-1">
                      <span className="sr-only">生成主题</span>
                      <Target className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#7A817F]" />
                      <input
                        value={topicInput}
                        onChange={(event) => setTopicInput(event.target.value)}
                        disabled={isRunning}
                        placeholder="例如：现场部署前需要确认哪些依赖？"
                        className="h-13 w-full rounded-xl border border-[#CFC8B9] bg-[#FDFBF6] pl-11 pr-4 text-sm text-[#18232D] outline-none transition-shadow placeholder:text-[#929792] focus:border-[#315E83] focus:ring-3 focus:ring-[#315E83]/10 disabled:opacity-60"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <MicButton
                        size="md"
                        onTranscript={(text) => setTopicInput(text)}
                        onError={(error) => console.error("ASR 失败：", error)}
                      />
                      <PhotoTopicButton
                        size="md"
                        onResult={(value) => setTopicInput(value)}
                        onError={(error) => console.error("拍照识题失败：", error)}
                        disabled={isRunning}
                      />
                      <button
                        type="submit"
                        disabled={isRunning || !topicInput.trim() || !course}
                        className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] shadow-[0_9px_20px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
                      >
                        {isRunning ? <><Loader2 className="size-4 animate-spin" />协作生成中</> : !course ? <><Library className="size-4" />先选岗位</> : <><Rocket className="size-4" />启动协同生成</>}
                      </button>
                    </div>
                  </form>

                  {showingPreviousResults && (
                    <div role="note" className="mt-3 flex flex-col gap-2 rounded-xl border border-[#D9CFB7] bg-[#F4ECD8] px-3 py-2.5 text-[11px] leading-5 text-[#72551F] sm:flex-row sm:items-center sm:justify-between">
                      <span><strong>新主题「{topicInput.trim()}」已带入。</strong> 下方暂时保留上一轮「{topic}」的完整成果，启动后会生成并切换到新资源包。</span>
                      <span className="shrink-0 rounded-full border border-[#CDBF9E] bg-[#FFFEFA] px-2 py-0.5 text-[10px] font-bold">待启动新任务</span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-semibold text-[#7A817F]">课程示例 · 点击填入</span>
                    {sampleTopics.slice(0, 6).map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setTopicInput(sample)}
                        disabled={isRunning || !course}
                        title={!course ? "选择课程后即可填入示例" : `填入主题「${sample}」`}
                        className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-1.5 text-[11px] font-medium text-[#59636B] transition-colors hover:border-[#AFA796] hover:bg-[#EFEAE0] hover:text-[#244C66] disabled:opacity-50"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.article>

              <RunRecoveryNotice
                status={status}
                readyCount={readyResourceCount}
                errorCount={errorCount}
                message={lastError}
                onRetry={handleRetry}
                onViewResources={scrollToResources}
              />

              <AgentBoard
                agents={agents}
                logs={logs}
                status={status}
                progress={overallProgress}
                reduceMotion={Boolean(reduceMotion)}
                onCancel={handleCancel}
              />

              <ResourceShelf
                items={resourceItems}
                generatedCount={readyResourceCount}
                topic={topic}
                status={status}
                showingPrevious={showingPreviousResults}
                onOpen={(resourceId) => navigate(`/workspace/r/${resourceId}`)}
                reduceMotion={Boolean(reduceMotion)}
              />
            </div>

            <motion.aside
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.46, delay: 0.1 }}
              className="space-y-4 xl:sticky xl:top-4"
            >
              <article className="rounded-[26px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_12px_30px_rgba(24,35,45,.055)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#6F8A69]">生成依据</span>
                    <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">这次内容为什么适合你</h2>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA] text-[#315E83]"><Target className="size-4" /></span>
                </div>

                <div className="mt-4 space-y-2">
                  <EvidenceRow icon={Database} label="岗位知识库" value={targetRole?.name || course?.name || "尚未选择"} hint={course ? `${course.chunk_count ?? "已导入"} 条知识片段可检索；点击顶部知识库可查看来源` : "选择岗位后锁定检索与引用范围"} />
                  <EvidenceRow icon={UserRoundSearch} label="画像依据" value={profile ? `版本 v${profile.version}` : "尚未建立"} hint={profileGoal || "目标、节奏与资源偏好将参与生成"} />
                  <EvidenceRow icon={Target} label="当前主题" value={topic || "等待启动"} hint={weakTopics.length ? `优先关注：${weakTopics.slice(0, 2).join("、")}` : "完成画像后可匹配薄弱知识点"} />
                </div>

                {sourceNames.length > 0 && (
                  <div className="mt-4 border-t border-[#D7D1C4] pt-3">
                    <div className="mb-2 text-[11px] font-bold text-[#59636B]">本次命中来源</div>
                    <div className="flex flex-wrap gap-1.5">
                      {sourceNames.slice(0, 5).map((source) => <span key={source} className="max-w-full truncate rounded-full bg-[#E7EDF3] px-2.5 py-1 text-[11px] font-semibold text-[#315E83]">{source}</span>)}
                    </div>
                  </div>
                )}
              </article>

              <article className="rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_12px_30px_rgba(24,35,45,.055)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#B1842C]">质量与可信度</span>
                    <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">自动检查</h2>
                  </div>
                  {generationDuration && <span className="inline-flex items-center gap-1 rounded-full bg-[#F4ECD8] px-2.5 py-1 text-[11px] font-bold text-[#8E6925]"><Clock3 className="size-3" />{generationDuration}</span>}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2" aria-live="polite" aria-label="生成质量检查结果">
                  {qualityChecks.map((check) => <QualityCheck key={check.label} {...check} />)}
                </div>

                <div className="mt-3 rounded-2xl border border-[#D5D8CF] bg-[#E9EEE6] p-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-[#557052]"><ShieldCheck className="size-4" />幻觉防控原则</div>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#59636B]">只有带知识来源的讲解会标记为“可追溯”。引用可在文档详情中逐条展开；未返回依据时会明确提示，而不是伪装成已验证。</p>
                </div>
              </article>

              <article className="rounded-[22px] border border-[#CFC8B9] bg-[#F7F2E7] p-4">
                <div className="text-[11px] font-bold tracking-[0.08em] text-[#7E6B83]">生成之后 · 进入学习闭环</div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Link to="/notes" className="flex flex-col items-center gap-1 rounded-xl bg-[#FFFEFA] px-2 py-2.5 text-[11px] font-semibold text-[#59636B] hover:text-[#315E83]"><NotebookPen className="size-4" />沉淀笔记</Link>
                  <Link to="/quiz" className="flex flex-col items-center gap-1 rounded-xl bg-[#FFFEFA] px-2 py-2.5 text-[11px] font-semibold text-[#59636B] hover:text-[#3E7774]"><BookOpenCheck className="size-4" />学习验证</Link>
                  <Link to="/report" className="flex flex-col items-center gap-1 rounded-xl bg-[#FFFEFA] px-2 py-2.5 text-[11px] font-semibold text-[#59636B] hover:text-[#7E6B83]"><FileCheck2 className="size-4" />效果评估</Link>
                </div>
              </article>
            </motion.aside>
          </section>

          <footer className="mt-5 flex flex-col gap-2 border-t border-[#CFC8B9] px-1 pt-4 text-[11px] text-[#747C7D] sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#6F8A69]" />AI 生成内容保留来源、过程与异常状态，便于复核</span>
            <span>7 Agent 协作 · 七类资源统一归档 · {status === "done" ? "本轮结果已保存" : status === "interrupted" ? "中断前成果已保留" : "生成完成后自动保存"}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

function RunRecoveryNotice({
  status,
  readyCount,
  errorCount,
  message,
  onRetry,
  onViewResources,
}: {
  status: RunStatus
  readyCount: number
  errorCount: number
  message: string
  onRetry: () => void
  onViewResources: () => void
}) {
  const isInterrupted = status === "interrupted"
  const isGlobalError = status === "error"
  const isPartial = status === "done" && errorCount > 0
  if (!isInterrupted && !isGlobalError && !isPartial) return null

  const title = isInterrupted
    ? "本轮生成已停止，现有成果没有丢失"
    : isPartial
      ? `本轮已完成，但有 ${errorCount} 个节点生成异常`
      : "本轮生成未完整结束"
  const detail = message || (isPartial
    ? `目前已有 ${readyCount} / 7 类资源可继续学习；你可以先检查成果，也可以重新生成完整资源包。`
    : `目前已有 ${readyCount} / 7 类资源被保留，可先查看或重新生成。`)

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="flex flex-col gap-3 rounded-[20px] border border-[#D8C1B7] bg-[#FBF3ED] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#F4E8E2] text-[#A05137]"><AlertCircle className="size-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#18232D]">{title}</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#66717B]">{detail}</p>
          {message && isPartial && <p className="mt-0.5 text-[10px] text-[#8A8172]">已完成的内容仍可正常打开，不会因单个节点异常而被隐藏。</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {readyCount > 0 && (
          <button type="button" onClick={onViewResources} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#C9C2B4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#244C66] hover:bg-[#F1EDE4]">
            查看已完成资源 <ArrowRight className="size-3.5" />
          </button>
        )}
        <button type="button" onClick={onRetry} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.16)] hover:bg-[#193B50]">
          <RotateCcw className="size-3.5" />重新生成整套
        </button>
      </div>
    </motion.section>
  )
}

function AgentBoard({
  agents,
  logs,
  status,
  progress,
  reduceMotion,
  onCancel,
}: {
  agents: AgentState[]
  logs: string[]
  status: RunStatus
  progress: number
  reduceMotion: boolean
  onCancel: () => void
}) {
  const visibleAgents = agents.length ? agents : STANDBY_AGENTS
  const retriever = visibleAgents.find((agent) => agent.meta.id === "retriever") || STANDBY_AGENTS[0]
  const workers = visibleAgents.filter((agent) => agent.meta.id !== "retriever")
  const activeCount = visibleAgents.filter((agent) => agent.status === "running" || agent.status === "streaming").length
  const doneCount = agents.filter((agent) => agent.status === "done").length
  const errorCount = agents.filter((agent) => agent.status === "error").length
  const settledCount = doneCount + errorCount
  const latestLogs = logs.slice(-3)

  const statusCopy = status === "running"
      ? `${activeCount || 1} 个智能体正在协作`
    : status === "done"
      ? errorCount ? `已完成，${errorCount} 个节点异常` : "本轮协作已经完成"
      : status === "error"
        ? "协作过程中出现异常"
        : status === "interrupted"
          ? "本轮协作已停止"
          : "等待生成任务"

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, delay: 0.09 }}
      className="rounded-[26px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_12px_30px_rgba(24,35,45,.055)] sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-[0.1em] text-[#6F8A69]">02 · 七智能体协作</span>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">先找到依据，再并发生成</h2>
          <p className="mt-1 text-xs leading-5 text-[#66717B]">7 个学习 Agent 共享同一主题、课程依据与学习画像，按各自职责协同工作。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5 text-[11px] font-bold text-[#59636B]" aria-live="polite">
            {status === "running" ? <Loader2 className="size-3.5 animate-spin text-[#B85C3E]" /> : status === "done" ? errorCount ? <AlertCircle className="size-3.5 text-[#B1842C]" /> : <CheckCircle2 className="size-3.5 text-[#6F8A69]" /> : status === "error" || status === "interrupted" ? <AlertCircle className="size-3.5 text-[#B85C3E]" /> : <CircleDashed className="size-3.5 text-[#7A817F]" />}
            {statusCopy}
          </span>
          {status === "running" && (
            <button type="button" onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#D7B9AE] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#9A4E35] transition-colors hover:bg-[#F4E8E2]">
              <Square className="size-3 fill-current" />停止并保留
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[190px_34px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#C9D2D5] bg-[#FFFEFA] p-4">
          <div className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[#7A817F]">Agent 01 · RAG 检索课程依据</div>
          <AgentNode agent={retriever} reduceMotion={reduceMotion} prominent />
        </div>

        <div className="hidden items-center justify-center lg:flex">
          <div className="relative h-px w-full bg-[#BEB7AA]"><ArrowRight className="absolute -right-1 top-1/2 size-4 -translate-y-1/2 text-[#8B867D]" /></div>
        </div>
        <div className="flex items-center justify-center lg:hidden"><ChevronDown className="size-5 text-[#8B867D]" /></div>

        <div className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3">
          <div className="mb-2 px-1 text-[11px] font-bold tracking-[0.1em] text-[#7A817F]">Agent 02–07 · 多类学习资源并发生成</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {workers.map((agent) => <AgentNode key={agent.meta.id} agent={agent} reduceMotion={reduceMotion} />)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-[#737C80]">
          <span>协作进度</span><span>{agents.length ? `${doneCount} 完成${errorCount ? ` · ${errorCount} 异常` : ""} · 共 ${agents.length} 个节点` : "启动后显示实时状态"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#E2DED4]">
          <motion.div className={`h-full ${errorCount && settledCount === agents.length ? "bg-[#B1842C]" : "bg-[#315E83]"}`} animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#D7D1C4] bg-[#FDFBF6] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#59636B]"><Sparkles className="size-3.5 text-[#B1842C]" />实时协作记录</div>
        <div className="space-y-1.5">
          {latestLogs.length ? latestLogs.map((line, index) => (
            <motion.div key={`${line}-${index}`} initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 text-[11px] leading-4 text-[#66717B]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#6F8A69]" />{line}
            </motion.div>
          )) : <p className="text-[11px] leading-5 text-[#7A817F]">启动后，这里会依次记录知识检索、智能体启动、资源完成与异常信息。</p>}
        </div>
      </div>
    </motion.article>
  )
}

function AgentNode({ agent, reduceMotion, prominent = false }: { agent: AgentState; reduceMotion: boolean; prominent?: boolean }) {
  const tone = AGENT_TONES[agent.meta.id] || AGENT_TONES.doc
  const Icon = tone.icon
  const isActive = agent.status === "running" || agent.status === "streaming"

  return (
    <motion.div
      animate={isActive && !reduceMotion ? { y: [0, -2, 0] } : undefined}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className={`relative rounded-xl border border-[#DDD7CB] bg-[#FDFBF6] ${prominent ? "p-3" : "p-2.5"}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`${prominent ? "size-10" : "size-8"} grid shrink-0 place-items-center rounded-xl`} style={{ color: tone.color, backgroundColor: tone.wash }}><Icon className={prominent ? "size-[18px]" : "size-4"} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <strong className={`${prominent ? "text-xs" : "text-[11px]"} truncate text-[#18232D]`}>{agent.meta.name.replace(" Agent", "")}</strong>
            <AgentStatusMark status={agent.status} />
          </div>
          <p className={`mt-1 ${prominent ? "text-[11px] leading-4" : "line-clamp-2 text-[11px] leading-[1.4]"} text-[#737C80]`}>{agent.message || agent.meta.description}</p>
        </div>
      </div>
    </motion.div>
  )
}

function AgentStatusMark({ status }: { status: AgentStatus }) {
  if (status === "done") return <Check className="size-3.5 shrink-0 text-[#6F8A69]" />
  if (status === "error") return <AlertCircle className="size-3.5 shrink-0 text-[#B85C3E]" />
  if (status === "running" || status === "streaming") return <Loader2 className="size-3.5 shrink-0 animate-spin text-[#315E83]" />
  return <Clock3 className="size-3.5 shrink-0 text-[#AAA69C]" />
}

function EvidenceRow({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#E8ECEE] text-[#315E83]"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-bold text-[#8A8172]">{label}</span><strong className="max-w-[190px] truncate text-[11px] text-[#18232D]">{value}</strong></div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#737C80]">{hint}</p>
      </div>
    </div>
  )
}

function QualityCheck({ label, value, state }: { label: string; value: string; state: CheckState }) {
  const tone = {
    pass: { icon: CheckCircle2, bg: "#E8EDE5", color: "#5D7658" },
    working: { icon: Loader2, bg: "#E7EDF3", color: "#315E83" },
    warn: { icon: AlertCircle, bg: "#F4E8E2", color: "#A05137" },
    idle: { icon: CircleDashed, bg: "#ECE8DE", color: "#7A817F" },
  }[state]
  const Icon = tone.icon

  return (
    <div className="rounded-2xl border border-[#DDD7CB] bg-[#FDFBF6] p-3">
      <span className="grid size-7 place-items-center rounded-full" style={{ color: tone.color, backgroundColor: tone.bg }}><Icon className={`size-3.5 ${state === "working" ? "animate-spin" : ""}`} /></span>
      <div className="mt-2 text-[11px] font-bold text-[#8A8172]">{label}</div>
      <div className="mt-0.5 text-[11px] font-semibold leading-4 text-[#18232D]">{value}</div>
    </div>
  )
}

function ResourceShelf({
  items,
  generatedCount,
  topic,
  status: runStatus,
  showingPrevious,
  onOpen,
  reduceMotion,
}: {
  items: ResourceView[]
  generatedCount: number
  topic: string
  status: RunStatus
  showingPrevious: boolean
  onOpen: (resourceId: ResourceKey) => void
  reduceMotion: boolean
}) {
  const docReady = items.some((item) => item.resource.id === "doc" && item.available)
  const quizReady = items.some((item) => item.resource.id === "quiz" && item.available)

  return (
    <motion.section
      id="workspace-resources"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.16 }}
      className="rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_12px_30px_rgba(24,35,45,.055)] sm:p-6"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.1em] text-[#315E83]">03 · 检查生成成果</span>
            <span className="rounded-full bg-[#E9EEE6] px-2 py-0.5 text-[10px] font-bold text-[#557052]">AI 生成 · 可复核</span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#18232D]">{showingPrevious ? `上一轮《${topic}》资源包` : "本次学习资源包"}</h2>
          <p className="mt-1 text-xs text-[#66717B]">{showingPrevious ? "旧成果保持可复核；启动上方新主题后，这里会切换到新一轮生成过程。" : "每种成果都可独立打开、验证，并继续进入笔记、测验或学习报告。"}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-1.5 text-[11px] font-bold text-[#59636B]">
          <CheckCircle2 className="size-3.5 text-[#6F8A69]" />
          {generatedCount} / 7 类资源已生成
        </span>
      </div>

      {runStatus === "done" && generatedCount > 0 && !showingPrevious && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#D5D8CF] bg-[#EEF2EB] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#FFFEFA] text-[#557052]"><CheckCircle2 className="size-4" /></span>
            <div>
              <strong className="block text-xs text-[#26352E]">资源包已归档，建议现在进入真实学习</strong>
              <p className="mt-0.5 text-[11px] leading-4 text-[#66717B]">先读讲解抓住主线，再做检测题留下掌握证据，最后由学习报告回写画像。</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {docReady && <button type="button" onClick={() => onOpen("doc")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#244C66] px-3 text-[11px] font-bold text-white hover:bg-[#193B50]"><FileText className="size-3.5" />先读讲解</button>}
            {quizReady && <button type="button" onClick={() => onOpen("quiz")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#B9C9C3] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#3E7774] hover:bg-[#E2EEEB]"><BookOpenCheck className="size-3.5" />开始检测</button>}
            <Link to="/report" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#C9C2B4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#6A5941] hover:bg-[#F7F2E7]"><FileCheck2 className="size-3.5" />学习报告</Link>
          </div>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ resource, status, summary, available }, index) => (
          <ResourceTile
            key={resource.id}
            index={index + 1}
            resource={resource}
            status={status}
            summary={summary}
            available={available}
            runStatus={runStatus}
            onOpen={() => onOpen(resource.id)}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>
    </motion.section>
  )
}

function ResourceTile({
  index,
  resource,
  status,
  summary,
  available,
  runStatus,
  onOpen,
  reduceMotion,
}: {
  index: number
  resource: ResourceDefinition
  status: AgentStatus | "ready"
  summary: string
  available: boolean
  runStatus: RunStatus
  onOpen: () => void
  reduceMotion: boolean
}) {
  const Icon = resource.icon
  const isLoading = status === "running" || status === "streaming"
  const didNotFinish = !available && status === "pending" && (runStatus === "done" || runStatus === "error" || runStatus === "interrupted")
  const stateLabel = status === "done" ? "已生成" : status === "ready" ? "可打开" : status === "error" ? "生成异常" : isLoading ? "生成中" : didNotFinish ? "本轮未完成" : "等待任务"

  return (
    <motion.button
      type="button"
      disabled={!available}
      onClick={available ? onOpen : undefined}
      whileHover={available && !reduceMotion ? { y: -2 } : undefined}
      className="group min-h-[142px] rounded-2xl border border-[#D7D1C4] bg-[#FDFBF6] p-4 text-left transition-all hover:border-[#B9B1A1] hover:shadow-[0_8px_18px_rgba(24,35,45,.06)] disabled:cursor-default disabled:opacity-80"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl" style={{ color: resource.color, backgroundColor: resource.wash }}><Icon className="size-[18px]" /></span>
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#9A9C96]">{String(index).padStart(2, "0")}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <strong className="text-xs text-[#18232D]">{resource.title}</strong>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: status === "error" || didNotFinish ? "#B85C3E" : resource.color }}>
          {isLoading && <Loader2 className="size-3 animate-spin" />}{status === "done" && <CheckCircle2 className="size-3" />}{status === "ready" && <ArrowRight className="size-3" />}{stateLabel}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-[#737C80]">{available ? summary : didNotFinish ? "本轮未产出，可通过上方入口重新生成整套资源。" : resource.detail}</p>
      {available && <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#315E83] opacity-0 transition-opacity group-hover:opacity-100">查看与验证 <ArrowRight className="size-3" /></span>}
    </motion.button>
  )
}
