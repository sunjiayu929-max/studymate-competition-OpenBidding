import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  GraduationCap,
  Library,
  MessageCircleMore,
  NotebookPen,
  Orbit,
  Rocket,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { LearnerMatchReport, type ReportCapability } from "@/components/LearnerMatchReport"
import { useTutorContext } from "@/hooks/useTutorContext"
import { apiGet } from "@/lib/api"
import { listQuizSessions, type QuizSession } from "@/lib/quizSession"
import { buildRoleCompetencyMap } from "@/lib/roleCompetencyMap"
import { useTrackPage } from "@/lib/useTrackPage"
import { fallbackSamplesFor, isShowcaseCourse, useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { useWorkspaceStore, type RunStatus, type WorkspaceState } from "@/store/workspace"

type NoteSource = "manual" | "doc" | "quiz" | "tutor"

interface NoteItem {
  id: number
  course_id: number | null
  title: string
  source: NoteSource
  created_at: string | null
  updated_at: string | null
}

interface NotesResponse {
  count: number
  items: NoteItem[]
}

interface ProfileDims {
  knowledge_base?: Record<string, unknown>
  cognitive_style?: Record<string, unknown>
  goals?: { primary?: string; deadline?: string; target_topics?: string[] }
  weak_points?: { topics?: string[]; error_types?: string[] }
  pace?: { hours_per_week?: number; intensity?: string }
  preference?: Record<string, unknown>
  employment_skills?: Record<string, unknown>
  theory_assessments?: Record<string, {
    score?: number
    weak_topics?: string[]
  }>
}

interface ProfileResponse {
  user_id: number
  version: number
  dims: ProfileDims
  updated_at?: string | null
}

interface EvalHistoryItem {
  id: number
  suggestions: string[]
  created_at: string | null
}

interface EvalHistoryResponse {
  count: number
  items: EvalHistoryItem[]
}

interface HomeData {
  profile: ProfileResponse | null
  notes: NotesResponse
  quizzes: QuizSession[]
  evaluations: EvalHistoryItem[]
  platform: {
    courseCount: number
    chunkCount: number
    source: "live" | "baseline"
  }
  sources: Record<"profile" | "notes" | "quizzes" | "evaluations" | "courses" | "rag", "loading" | "ok" | "error">
  lastSyncedAt: number
}

const EMPTY_HOME_DATA: HomeData = {
  profile: null,
  notes: { count: 0, items: [] },
  quizzes: [],
  evaluations: [],
  platform: { courseCount: 15, chunkCount: 10000, source: "baseline" },
  sources: {
    profile: "loading",
    notes: "loading",
    quizzes: "loading",
    evaluations: "loading",
    courses: "loading",
    rag: "loading",
  },
  lastSyncedAt: 0,
}

const MODULES = [
  { to: "/profile", label: "岗位能力画像", short: "画像", detail: "识别岗位能力证据与差距", icon: UserRoundSearch, color: "#355C8A", wash: "#E7EDF3" },
  { to: "/tutor", label: "AI 助教", short: "助教", detail: "围绕难点继续追问", icon: MessageCircleMore, color: "#B85C3E", wash: "#F4E8E2" },
  { to: "/courses", label: "岗位空间", short: "岗位", detail: "选择领域与目标岗位", icon: Library, color: "#B1842C", wash: "#F4ECD8" },
  { to: "/notes", label: "智能笔记", short: "笔记", detail: "沉淀讲解与思考", icon: NotebookPen, color: "#6F8A69", wash: "#E8EDE5" },
  { to: "/quiz", label: "智能测验", short: "测验", detail: "用练习确认真正掌握", icon: BookOpenCheck, color: "#3E7774", wash: "#E2EEEB" },
  { to: "/competency", label: "岗位训练中心", short: "训练", detail: "查看能力范围与当前进度", icon: Route, color: "#7E6B83", wash: "#EEE9EF" },
  { to: "/report", label: "学习报告", short: "报告", detail: "查看成长变化与阶段反馈", icon: BarChart3, color: "#6D748B", wash: "#EAEBF0" },
] as const

const SOURCE_LABEL: Record<NoteSource, string> = {
  manual: "手动笔记",
  doc: "讲解摘录",
  quiz: "错题笔记",
  tutor: "助教摘录",
}

const AGENT_DEFINITIONS = [
  { id: "retriever", name: "Retriever", role: "知识检索" },
  { id: "doc", name: "Doc", role: "讲解文档" },
  { id: "guide", name: "Guide", role: "实操指南" },
  { id: "mindmap", name: "MindMap", role: "思维导图" },
  { id: "quiz", name: "Quiz", role: "智能测验" },
  { id: "reading", name: "Reading", role: "拓展阅读" },
  { id: "code", name: "Code", role: "代码案例" },
] as const

interface UniverseMetric {
  label: string
  value: string
  detail: string
  source: "ok" | "error"
}

interface UniverseActivity {
  key: string
  to: string
  title: string
  detail: string
  timestamp: number
  tone: string
}

interface UniverseTrendPoint {
  key: string
  label: string
  value: number
}

interface LearningUniverseProps {
  learnerName: string
  courseName: string
  courseSelected: boolean
  courseChunkCount: number
  metrics: UniverseMetric[]
  platform: HomeData["platform"]
  profileCompleteness: number
  profileVersion: number
  generatedResourceCount: number
  quizCount: number
  noteCount: number
  reportCount: number
  todayProgress: number
  activities: UniverseActivity[]
  trend: UniverseTrendPoint[]
  sources: HomeData["sources"]
  lastSyncedAt: number
  workspace: WorkspaceState
}

const UNIVERSE_PLANETS = [
  { id: "profile", to: "/profile", label: "岗位能力画像", position: "planet-profile", orbit: "inner", size: "lg", icon: UserRoundSearch, tone: "#6EC8ED" },
  { id: "knowledge", to: "/knowledge", label: "知识库", position: "planet-knowledge", orbit: "middle", size: "md", icon: Library, tone: "#62C6B6" },
  { id: "quiz", to: "/quiz", label: "智能测验", position: "planet-quiz", orbit: "outer", size: "lg", icon: BookOpenCheck, tone: "#E2BC66" },
  { id: "notes", to: "/notes", label: "智能笔记", position: "planet-notes", orbit: "inner", size: "sm", icon: NotebookPen, tone: "#78BE8B" },
  { id: "workspace", to: "/competency", label: "Agent 成果", position: "planet-workspace", orbit: "middle", size: "xl", icon: Sparkles, tone: "#DE9564" },
  { id: "report", to: "/report", label: "学习报告", position: "planet-report", orbit: "outer", size: "md", icon: BarChart3, tone: "#A99BE0" },
  { id: "course", to: "/courses", label: "岗位路径", position: "planet-course", orbit: "outer", size: "sm", icon: Route, tone: "#79AEE8" },
] as const

function UniversePulseFrame({ className }: { className: string }) {
  return (
    <svg className={`universe-module-pulse-frame ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0.7" y="0.7" width="98.6" height="98.6" rx="3.2" ry="3.2" pathLength="100" />
    </svg>
  )
}

function agentStatusCopy(status: string, workspaceStatus: RunStatus) {
  if (status === "running") return "执行中"
  if (status === "streaming") return "生成中"
  if (status === "done") return "已完成"
  if (status === "error") return workspaceStatus === "interrupted" ? "已降级" : "异常"
  return "待命"
}

function formatPlatformChunkCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, count))
}

function formatBeijingTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value)
}

function formatBeijingDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(value)
}

function LearningUniverse(props: LearningUniverseProps) {
  const {
    learnerName,
    courseName,
    courseSelected,
    courseChunkCount,
    metrics,
    platform,
    profileCompleteness,
    profileVersion,
    generatedResourceCount,
    quizCount,
    noteCount,
    reportCount,
    todayProgress,
    activities,
    trend,
    sources,
    lastSyncedAt,
    workspace,
  } = props
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLElement>(null)
  const farLayerRef = useRef<HTMLDivElement>(null)
  const midLayerRef = useRef<HTMLDivElement>(null)
  const nearLayerRef = useRef<HTMLDivElement>(null)
  const stageLayerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [firstEntrance] = useState(() => {
    try {
      return sessionStorage.getItem("sm:learning-universe-entered") !== "1"
    } catch {
      return true
    }
  })

  const enterDesk = () => {
    document.getElementById("learning-desk")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }

  const moveParallax = (clientX?: number, clientY?: number) => {
    if (reduceMotion) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const x = clientX === undefined ? 0 : ((clientX - rect.left) / rect.width - 0.5) * 2
    const y = clientY === undefined ? 0 : ((clientY - rect.top) / rect.height - 0.5) * 2
    if (farLayerRef.current) farLayerRef.current.style.transform = `translate3d(${x * 5}px, ${y * 4}px, 0)`
    if (midLayerRef.current) midLayerRef.current.style.transform = `translate3d(${x * 8}px, ${y * 6}px, 0)`
    if (nearLayerRef.current) nearLayerRef.current.style.transform = `translate3d(${x * 10}px, ${y * 8}px, 0)`
    if (stageLayerRef.current) stageLayerRef.current.style.transform = `translate3d(${x * -4}px, ${y * -3}px, 0)`
  }

  useEffect(() => {
    try {
      sessionStorage.setItem("sm:learning-universe-entered", "1")
    } catch {
      /* entrance remains non-persistent */
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const updateVisibility = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (document.hidden) {
          setActive(false)
          window.dispatchEvent(new CustomEvent("studymate:home-universe-visibility", {
            detail: { visible: false },
          }))
          return
        }
        const rect = root.getBoundingClientRect()
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0
        setActive(visibleRatio > 0.12)
        window.dispatchEvent(new CustomEvent("studymate:home-universe-visibility", {
          detail: { visible: visibleRatio > 0.48 },
        }))
      })
    }
    const observer = new IntersectionObserver(updateVisibility, { threshold: [0, 0.12, 0.48, 0.72] })
    observer.observe(root)
    window.addEventListener("scroll", updateVisibility, { passive: true })
    window.addEventListener("resize", updateVisibility)
    document.addEventListener("visibilitychange", updateVisibility)
    updateVisibility()
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", updateVisibility)
      window.removeEventListener("resize", updateVisibility)
      document.removeEventListener("visibilitychange", updateVisibility)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const sourceValues = Object.values(sources)
  const okCount = sourceValues.filter((status) => status === "ok").length
  const errorCount = sourceValues.filter((status) => status === "error").length
  const syncState = errorCount === 0 && okCount === sourceValues.length
    ? "live"
    : okCount > 0
      ? "partial"
      : "waiting"
  const syncLabel = syncState === "live" ? "实时同步" : syncState === "partial" ? "部分降级" : "待连接"
  const syncDetail = lastSyncedAt
    ? `最近同步 ${new Date(lastSyncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : "正在读取真实数据"

  const planetValues: Record<(typeof UNIVERSE_PLANETS)[number]["id"], { value: string; detail: string }> = {
    profile: { value: `${profileCompleteness}%`, detail: profileCompleteness ? `画像 v${profileVersion}` : "等待建立画像" },
    knowledge: { value: formatPlatformChunkCount(platform.chunkCount), detail: "平台知识片段" },
    quiz: { value: String(quizCount), detail: "个人测验记录" },
    notes: { value: String(noteCount), detail: "个人笔记" },
    workspace: { value: `${generatedResourceCount}/6`, detail: workspace.status === "running" ? "正在生成" : "资源类型" },
    report: { value: String(reportCount), detail: "阶段评估" },
    course: { value: courseSelected ? (courseChunkCount ? String(courseChunkCount) : "目录") : "待选", detail: courseSelected ? (courseChunkCount ? "当前岗位知识片段" : "前端岗位目录预览") : "选择目标岗位" },
  }

  const visibleAgents = AGENT_DEFINITIONS.map((definition) => {
    const live = workspace.agents.find((agent) => agent.meta.id === definition.id)
    const status = live?.status || workspace.agentStatus[definition.id] || "pending"
    const outputCount = definition.id === "retriever" ? workspace.outputs.retriever?.chunks?.length : undefined
    return {
      ...definition,
      status,
      message: live?.message || (outputCount ? `找到 ${outputCount} 条岗位依据` : definition.role),
    }
  })
  const activeAgentCount = visibleAgents.filter((agent) => agent.status === "running" || agent.status === "streaming").length
  const doneAgentCount = visibleAgents.filter((agent) => agent.status === "done").length
  const maxTrend = Math.max(1, ...trend.map((item) => item.value))

  return (
    <section
      ref={rootRef}
      onPointerMove={(event) => moveParallax(event.clientX, event.clientY)}
      onPointerLeave={() => moveParallax()}
      className="learning-universe relative isolate min-h-[100svh] overflow-hidden bg-[#090D14] text-white"
      data-active={active ? "true" : "false"}
      data-intro={firstEntrance && !reduceMotion ? "true" : "false"}
      data-testid="learning-universe-command-center"
      aria-label="StudyMate 学习总览"
    >
      <div ref={farLayerRef} className="pointer-events-none absolute inset-0 transition-transform duration-300 ease-out" aria-hidden="true"><div className="universe-stars universe-stars-far" /></div>
      <div ref={midLayerRef} className="pointer-events-none absolute inset-0 transition-transform duration-300 ease-out" aria-hidden="true"><div className="universe-stars universe-stars-mid" /></div>
      <div ref={nearLayerRef} className="pointer-events-none absolute inset-0 transition-transform duration-200 ease-out" aria-hidden="true"><div className="universe-stars universe-stars-near" /></div>
      {!reduceMotion && active && (
        <>
          <span className="universe-comet" aria-hidden="true" />
          <span className="universe-meteor-field" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
          </span>
          <span className="universe-solo-meteor" aria-hidden="true" />
          <span className="universe-flyby-ship" aria-hidden="true"><i /><b /></span>
        </>
      )}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span className="universe-distant-planet universe-distant-planet-a" />
        <span className="universe-distant-planet universe-distant-planet-b" />
        <span className="universe-nebula universe-nebula-a" />
        <span className="universe-nebula universe-nebula-b" />
        <span className="universe-galaxy-band" />
        <span className="universe-horizon-glow" />
      </div>
      <div className="universe-color-grade pointer-events-none absolute inset-0" />

      <motion.div
        className="universe-command-shell relative z-10"
        initial={reduceMotion || !firstEntrance ? false : { opacity: 0, scale: 1.045, y: 10, filter: "blur(3px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="universe-command-topbar universe-glass-panel">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.16em] text-[#C9B581]">
              <Orbit className="size-3.5" />
              STUDYMATE
            </div>
            <h1 className="mt-0.5 text-[clamp(16px,1.55vw,23px)] font-semibold tracking-[-.035em] text-[#F1EFE9]">
              学习总览
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden text-right sm:block">
              <span className="block text-[9px] tracking-[.12em] text-[#7F8A98]">当前岗位</span>
              <strong className={`mt-0.5 block max-w-52 truncate text-[11px] ${courseSelected ? "text-[#DDE5E8]" : "text-[#D2B36D]"}`}>{courseName}</strong>
            </div>
            <div className="h-7 w-px bg-white/10" />
            <div className="text-right" aria-label="北京时间" data-testid="beijing-clock">
              <span className="block text-[9px] tracking-[.12em] text-[#7F8A98]">北京时间 · {formatBeijingDate(now)}</span>
              <strong className="mt-0.5 block font-mono text-[clamp(15px,1.35vw,20px)] tabular-nums tracking-[.06em] text-[#E8E4DA]">{formatBeijingTime(now)}</strong>
            </div>
            <div className={`universe-sync-badge universe-sync-${syncState}`} title={syncDetail} aria-live="polite">
              <span className="universe-sync-dot" />
              <span>{syncLabel}</span>
            </div>
          </div>
        </header>

        <div className="universe-command-grid">
          <aside className="universe-glass-panel universe-status-panel" data-testid="personal-live-data" aria-label="今日学习状态与平台基础能力">
            <UniversePulseFrame className="universe-module-pulse-left" />
            <div className="universe-panel-heading">
              <div>
                <span>PERSONAL · REAL DATA</span>
                <h2>今日学习状态</h2>
              </div>
              <Activity className="size-4 text-[#86A9B2]" />
            </div>
            <div className="universe-metric-grid">
              {metrics.map((metric) => (
                <div key={metric.label} className={`universe-metric ${metric.source === "error" ? "is-degraded" : ""}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.source === "error" ? "数据源暂不可用" : metric.detail}</small>
                </div>
              ))}
            </div>
            <div className="universe-panel-divider" />
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="universe-kicker">平台内容</span>
                <h3 className="mt-0.5 text-[12px] font-semibold text-[#E5E3DD]">可用学习内容</h3>
              </div>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-[#8D98A6]">
                {platform.source === "live" ? "实时汇总" : "产品基线"}
              </span>
            </div>
            <div className="universe-capability-grid" data-testid="platform-capabilities">
              <div><strong>{platform.courseCount}</strong><span>个岗位知识库</span></div>
              <div><strong>{formatPlatformChunkCount(platform.chunkCount)}</strong><span>知识片段</span></div>
              <div><strong>300</strong><span>可视主题</span></div>
              <div><strong>7</strong><span>协作 Agent</span></div>
            </div>
            {!courseSelected && (
              <Link to="/courses" className="universe-secondary-cta">
                选择目标岗位 <ArrowRight className="size-3.5" />
              </Link>
            )}
          </aside>

          <main ref={stageLayerRef} className="universe-glass-panel universe-core-panel transition-transform duration-300 ease-out" aria-label="学习入口">
            <UniversePulseFrame className="universe-module-pulse-core" />
            <div className="universe-core-heading">
              <div>
                <span className="universe-kicker">学习入口</span>
                <h2>从这里开始</h2>
              </div>
              <span className="text-right text-[9px] leading-4 text-[#7F8A98]">点击入口<br />进入对应页面</span>
            </div>
            <div className="universe-orbit-stage">
              <span className="universe-radar-scan" aria-hidden="true" />
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={`universe-orbit universe-orbit-${index + 1}`}
                  style={{ "--orbit-delay": `${index * 1.8}s` } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
              <span
                key={`${lastSyncedAt}:${workspace.status}:${profileVersion}:${activities[0]?.timestamp || 0}`}
                className="universe-system-pulse"
                aria-hidden="true"
              >
                <i className="universe-system-pulse-core" />
                <i className="universe-system-pulse-track universe-system-pulse-track-a" />
                <i className="universe-system-pulse-track universe-system-pulse-track-b" />
              </span>

              <button type="button" onClick={enterDesk} className="universe-learner-core group" aria-label="进入今日学习桌面">
                <svg viewBox="0 0 240 240" className="universe-progress-ring" aria-hidden="true">
                  <circle cx="120" cy="120" r="111" pathLength="100" />
                  <circle cx="120" cy="120" r="111" pathLength="100" style={{ strokeDasharray: `${todayProgress} 100` }} />
                </svg>
                <span className="relative z-10 text-center">
                  <span className="block text-[9px] font-bold tracking-[.2em] text-[#D0BC89]">LEARNER CORE</span>
                  <strong className="mt-1 block max-w-[150px] truncate text-[18px] text-[#F6F2E8]">{learnerName}</strong>
                  <span className="mx-auto mt-1 block max-w-[150px] truncate text-[10px] text-[#B4BDC5]">{courseName}</span>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[9px] font-bold text-[#D7C59A]">
                    今日闭环 {todayProgress}%
                  </span>
                </span>
              </button>

              {UNIVERSE_PLANETS.map(({ id, to, label, position, orbit, size, icon: Icon, tone }, index) => {
                const planet = planetValues[id]
                return (
                  <motion.div
                    key={id}
                    className={`universe-planet-wrap universe-planet-orbit-${orbit} ${position}`}
                    initial={false}
                  >
                    <Link
                      to={to}
                      className={`universe-planet universe-planet-${size} universe-planet-material-${id}`}
                      style={{ "--planet-tone": tone, "--planet-delay": `${index * -1.7}s` } as CSSProperties}
                      data-planet={id}
                      aria-label={`${label}：${planet.value}，${planet.detail}`}
                    >
                      <span className="universe-planet-surface"><Icon /></span>
                      <span className="universe-planet-caption">
                        <strong>{label}</strong>
                        <small>{planet.value}</small>
                      </span>
                      <span className="universe-planet-summary">{planet.detail}</span>
                      {!reduceMotion && <span className="universe-node-signal" aria-hidden="true" />}
                    </Link>
                  </motion.div>
                )
              })}

              {!reduceMotion && active && (
                <span className={`universe-task-ship ${workspace.status === "running" ? "is-active" : "is-cruising"}`} aria-label={workspace.status === "running" ? `${activeAgentCount} 个 Agent 正在执行任务` : "Agent 装饰巡航"}>
                  <Rocket />
                  {workspace.status === "running" && <i />}
                </span>
              )}
            </div>
            <div className="universe-core-actions">
              <button type="button" onClick={enterDesk} className="universe-primary-cta" data-testid="universe-primary-cta">
                进入今日学习 <ArrowDown className="size-3.5" />
              </button>
              {!courseSelected && <Link to="/courses" className="universe-course-cta">选择目标岗位 <ArrowRight className="size-3.5" /></Link>}
            </div>
          </main>

          <aside className="universe-glass-panel universe-agents-panel" data-testid="agents-live" aria-label="7 Agents 实时协作">
            <UniversePulseFrame className="universe-module-pulse-agents" />
            <div className="universe-panel-heading">
              <div>
                <span>WORKSPACE · LIVE STORE</span>
                <h2>7 Agents 实时协作</h2>
              </div>
              <span className={`universe-agent-summary ${workspace.status}`}>
                {workspace.status === "running" ? `${activeAgentCount} 运行中` : workspace.status === "done" ? `${doneAgentCount} 已完成` : workspace.status === "error" || workspace.status === "interrupted" ? "需要关注" : "全部待命"}
              </span>
            </div>
            <div className="universe-agent-list">
              {visibleAgents.map((agent, index) => {
                const state = agentStatusCopy(agent.status, workspace.status)
                const live = agent.status === "running" || agent.status === "streaming"
                return (
                  <Link key={agent.id} to="/competency" className={`universe-agent-row status-${agent.status}`}>
                    <span className="universe-agent-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <strong>{agent.name}</strong>
                      <small>{agent.message}</small>
                    </span>
                    <span className="universe-agent-state">
                      <i className={live && !reduceMotion ? "is-live" : ""} />
                      {state}
                    </span>
                  </Link>
                )
              })}
            </div>
            <div className="universe-agent-footer">
              <Search className="size-3.5" />
              <span>{workspace.topic ? `当前主题 · ${compactTopic(workspace.topic, 18)}` : "无运行任务时仅显示真实待命"}</span>
            </div>
          </aside>
        </div>

        <section className="universe-glass-panel universe-pulse-panel" aria-label="实时学习脉冲与近七日趋势">
          <UniversePulseFrame className="universe-module-pulse-bottom" />
          <div className="universe-pulse-flow">
            <span className="universe-kicker">实时学习脉冲</span>
            <div className="universe-flow-steps" aria-label="学习闭环">
              {["知识检索", "资源生成", "讲解", "测验", "画像更新"].map((item, index) => (
                <span key={item} className={(workspace.status === "running" && index <= 1) || (todayProgress > index * 20) ? "is-active" : ""}>
                  <i />{item}{index < 4 && <ArrowRight />}
                </span>
              ))}
            </div>
          </div>
          <div className="universe-pulse-content">
            <div className="universe-event-stream">
              <div className="flex items-center justify-between gap-3">
                <h2>最近学习动态 / 实时事件</h2>
                <span>{syncDetail}</span>
              </div>
              {activities.length ? (
                <div className="universe-event-grid">
                  {activities.slice(0, 3).map((event) => (
                    <Link key={event.key} to={event.to} className="universe-event-item">
                      <i style={{ backgroundColor: event.tone }} />
                      <span className="min-w-0 flex-1"><strong>{event.title}</strong><small>{event.detail}</small></span>
                      <time>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="universe-empty-pulse" data-testid="universe-empty-state">
                  <span>尚无个人学习事件。完成一次笔记、测验或 Agent 任务后，这里会出现真实脉冲。</span>
                  <Link to={courseSelected ? "/workspace" : "/courses"}>{courseSelected ? "生成第一次岗位任务" : "先选择目标岗位"}<ArrowRight className="size-3" /></Link>
                </div>
              )}
            </div>
            <div className="universe-trend" data-testid="universe-seven-day-trend">
              <div className="flex items-center justify-between gap-3">
                <h2>近 7 日学习趋势</h2>
                <span>笔记 · 测验 · 画像版本</span>
              </div>
              <div className="universe-trend-bars" aria-label="近七日真实学习事件数">
                {trend.map((point) => (
                  <div key={point.key}>
                    <span className="universe-trend-value">{point.value || ""}</span>
                    <i style={{ height: point.value ? `${Math.max(12, (point.value / maxTrend) * 100)}%` : "3px" }} />
                    <small>{point.label}</small>
                  </div>
                ))}
              </div>
              {trend.every((point) => point.value === 0) && <span className="universe-trend-empty">暂无历史，不绘制虚假曲线</span>}
            </div>
          </div>
        </section>
      </motion.div>
    </section>
  )
}

function greetingForNow() {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 11) return "早上好"
  if (hour < 14) return "中午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date())
}

function shortDate(value: string | null | undefined) {
  if (!value) return "时间未记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "时间未记录"
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}

function compactTopic(value: string | null | undefined, maxLength = 30) {
  let clean = (value || "")
    .replace(/^错题\s*[：:]\s*/u, "")
    .replace(/（[A-Za-z][^）]{0,40}）/gu, "")
    .replace(/\([A-Za-z][^)]{0,40}\)/gu, "")
    .replace(/\.{2,}/g, "…")
    .replace(/\s+/g, " ")
    .trim()

  const scopedQuestion = clean.match(/^在(.{2,18}?)中[，,]\s*([^，。？?（(]{2,14})/u)
  if (scopedQuestion) {
    const subject = scopedQuestion[2]
      .replace(/[.…]+$/u, "")
      .replace(/(?:设置|设|是|为|的)$/u, "")
      .trim()
    if (subject) clean = `${scopedQuestion[1]}中的${subject}`
  }

  clean = clean.replace(/[.…]+$/u, "")
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength).replace(/[.…]+$/u, "")}…`
}

function shanghaiDayKey(value: string | number | Date | null | undefined) {
  if (value == null) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  return year && month && day ? `${year}-${month}-${day}` : ""
}

function calculateProfileCompleteness(profile: ProfileResponse | null) {
  if (!profile) return 0
  const defaults: Required<ProfileDims> = {
    knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 3 },
    cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
    goals: { primary: "", deadline: "", target_topics: [] },
    weak_points: { topics: [], error_types: [] },
    pace: { hours_per_week: 0, intensity: "" },
    preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
    employment_skills: { programming: 0, algorithms: 0, data_ai: 0, systems: 0, engineering: 0, professional: 0 },
    theory_assessments: {},
  }
  const groups: Array<keyof ProfileDims> = [
    "knowledge_base",
    "cognitive_style",
    "goals",
    "weak_points",
    "pace",
    "preference",
    "employment_skills",
  ]
  const complete = groups.filter((group) => JSON.stringify(profile.dims[group] ?? defaults[group]) !== JSON.stringify(defaults[group])).length
  return Math.round((complete / groups.length) * 100)
}

function formatTrackedDuration(minutes: number) {
  if (minutes <= 0) return "0 分钟"
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

function readReportCapabilityEvidence(userId: number | undefined, roleId: string) {
  if (!userId) return {} as Record<string, { level?: number }>
  try {
    const raw = window.localStorage.getItem(`sm:role-capability-evidence:${userId}:${roleId}`)
    return raw ? JSON.parse(raw) as Record<string, { level?: number }> : {}
  } catch {
    return {} as Record<string, { level?: number }>
  }
}

function OrbitMap({ learnerName }: { learnerName: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[292px]" aria-label="常用学习能力围绕学习者组织">
      <div className="absolute inset-[14%] rounded-full border border-[#C9D1CB]" />
      <div className="absolute inset-[25%] rounded-full border border-dashed border-[#D7D1C4]" />
      <Link
        to="/profile"
        aria-label="打开岗位能力画像对话"
        title="继续通过对话完善岗位能力画像"
        className="group absolute left-1/2 top-1/2 z-20 size-[43%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#B7B0A2] bg-[#F7F2E7] p-[7%] shadow-[0_12px_26px_rgba(24,35,45,.12)] transition-transform duration-300 hover:scale-[1.045] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#315E83]"
      >
        <span className="pointer-events-none absolute -inset-2 rounded-full border border-[#315E83]/25 opacity-0 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100" />
        <motion.span
          className="relative grid size-full place-items-center overflow-hidden rounded-full bg-[#244C66] text-center text-[#FFFEFA]"
          animate={reduceMotion ? undefined : { y: [0, -2, 0], scale: [1, 1.025, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="absolute -left-[14%] top-[30%] h-[42%] w-[128%] -rotate-12 rounded-[50%] border border-[#D1B669]/65 transition-transform duration-500 group-hover:-rotate-[8deg]" />
          <span className="absolute left-[18%] top-[-15%] h-[130%] w-[64%] rotate-[22deg] rounded-[50%] border border-[#9AB0B5]/55 transition-transform duration-500 group-hover:rotate-[28deg]" />
          <span className="relative z-10">
            <span className="block text-[10px] font-semibold tracking-[0.2em] text-[#F0D6A4]">LEARNER</span>
            <span className="mt-1 block max-w-20 truncate px-1 text-[13px] font-bold">{learnerName}</span>
          </span>
        </motion.span>
      </Link>

      <motion.div
        data-testid="agent-orbit"
        className="absolute inset-[8%] z-10"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
      >
        {MODULES.map(({ to, label, icon: Icon, color, wash }, index) => {
          const angle = (index * Math.PI * 2) / MODULES.length - Math.PI / 2
          const left = 50 + Math.cos(angle) * 46
          const top = 50 + Math.sin(angle) * 46
          return (
            <div
              key={to}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <motion.div
                animate={reduceMotion ? undefined : { rotate: -360 }}
                transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
              >
                <Link
                  to={to}
                  title={label}
                  aria-label={label}
                  className="group grid size-10 place-items-center rounded-full border-2 border-[#FFFEFA] shadow-[0_4px_10px_rgba(24,35,45,.14)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color, backgroundColor: wash, outlineColor: color }}
                >
                  <Icon className="size-[17px] transition-transform group-hover:scale-110" />
                </Link>
              </motion.div>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}

export function Home() {
  useTrackPage("home")
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const user = useCurrentUser()
  const reduceMotion = useReducedMotion()
  const workspace = useWorkspaceStore()
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA)
  const [loading, setLoading] = useState(true)
  const courseId = course?.id
  const showcaseCourse = isShowcaseCourse(course)
  const targetRoleName = targetRole?.name || course?.name || ""
  const hasTargetRole = Boolean(targetRole || course)

  useTutorContext({ page: "home", title: `今日学习 · 当前岗位：${targetRoleName || "未选"}` })

  useEffect(() => {
    const userId = user?.user_id
    if (!userId || showcaseCourse) {
      setData(EMPTY_HOME_DATA)
      setLoading(false)
      return
    }

    let cancelled = false
    const courseFilter = courseId ? `&course_id=${courseId}` : ""

    const refresh = async () => {
      const [profileResult, notesResult, quizResult, evalResult, coursesResult, ragResult] = await Promise.allSettled([
        apiGet<ProfileResponse>(`/profile/${userId}`),
        apiGet<NotesResponse>(`/notes?user_id=${userId}${courseFilter}`),
        listQuizSessions({ user_id: userId, course_id: courseId, limit: 30 }),
        apiGet<EvalHistoryResponse>(`/eval/history/${userId}?limit=14`),
        apiGet<{ count: number; items: Array<{ chunk_count?: number }> }>("/courses"),
        apiGet<{ count: number; vectorized?: number }>("/rag/stats"),
      ])
      if (cancelled) return

      const liveCourseCount = coursesResult.status === "fulfilled" ? Math.max(coursesResult.value.count, 15) : 15
      const courseChunkTotal = coursesResult.status === "fulfilled"
        ? coursesResult.value.items.reduce((sum, item) => sum + (item.chunk_count || 0), 0)
        : 0
      const liveChunkCount = ragResult.status === "fulfilled"
        ? ragResult.value.count
        : courseChunkTotal || 10000

      setData({
        profile: profileResult.status === "fulfilled" ? profileResult.value : null,
        notes: notesResult.status === "fulfilled" ? notesResult.value : { count: 0, items: [] },
        quizzes: quizResult.status === "fulfilled" ? quizResult.value : [],
        evaluations: evalResult.status === "fulfilled" ? evalResult.value.items : [],
        platform: {
          courseCount: liveCourseCount,
          chunkCount: liveChunkCount,
          source: coursesResult.status === "fulfilled" && ragResult.status === "fulfilled" ? "live" : "baseline",
        },
        sources: {
          profile: profileResult.status === "fulfilled" ? "ok" : "error",
          notes: notesResult.status === "fulfilled" ? "ok" : "error",
          quizzes: quizResult.status === "fulfilled" ? "ok" : "error",
          evaluations: evalResult.status === "fulfilled" ? "ok" : "error",
          courses: coursesResult.status === "fulfilled" ? "ok" : "error",
          rag: ragResult.status === "fulfilled" ? "ok" : "error",
        },
        lastSyncedAt: Date.now(),
      })
      setLoading(false)
    }

    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [courseId, showcaseCourse, user?.user_id])

  const weakTopics = data.profile?.dims.weak_points?.topics?.filter(Boolean) || []
  const targetTopics = data.profile?.dims.goals?.target_topics?.filter(Boolean) || []
  const readyQuizzes = data.quizzes.filter((quiz) => quiz.status === "ready")
  const readyQuiz = readyQuizzes[0]
  const submittedQuizzes = data.quizzes.filter((quiz) => quiz.status === "submitted")
  const fallbackTopic = targetRole?.sampleTasks?.[0] || (course ? fallbackSamplesFor(course.name).topics[0] : "")
  const focusTopic = compactTopic(readyQuiz?.topic || weakTopics[0] || targetTopics[0] || fallbackTopic)
  const latestNote = data.notes.items[0]
  const latestSuggestion = data.evaluations[0]?.suggestions?.[0]

  const primaryAction = showcaseCourse
    ? { to: "/courses", label: "查看岗位目录" }
    : readyQuiz
    ? { to: `/quiz/${readyQuiz.id}`, label: "继续这份测验" }
    : hasTargetRole
      ? { to: "/competency", label: "开始今日岗位训练" }
      : { to: "/courses", label: "先选择目标岗位" }

  const focusReason = showcaseCourse
    ? `《${course?.name}》已加入岗位目录，目前展示岗位方向与训练资料；接入专属知识库后即可开启完整训练闭环。`
    : readyQuiz
    ? `你有一份关于「${compactTopic(readyQuiz.topic, 36)}」的测验尚未完成，先把这次学习闭环续上。`
    : weakTopics[0]
      ? `「${weakTopics[0]}」来自你的薄弱岗位能力画像，适合作为今天的第一站。`
      : targetTopics[0]
        ? `这个任务来自你的岗位目标，StudyMate 已把它放到今日路线的中心。`
        : hasTargetRole
          ? `围绕当前岗位「${targetRoleName}」给出一条清晰起点，完成后再依据表现调整下一步。`
          : "选定目标岗位后，笔记、测验与画像会汇成一条只属于你的训练路线。"

  const routeSteps = [
    {
      number: "01",
      label: "回看",
      title: latestNote?.title || "建立第一条笔记",
      hint: latestNote ? SOURCE_LABEL[latestNote.source] : "把零散内容沉淀下来",
      to: "/notes",
      icon: NotebookPen,
      color: "#355C8A",
    },
    {
      number: "02",
      label: "理解",
      title: focusTopic || "选择今日岗位任务",
      hint: focusTopic ? "建议从这里开始" : "先确定目标岗位",
      to: focusTopic ? "/tutor" : "/courses",
      icon: MessageCircleMore,
      color: "#B85C3E",
      active: !readyQuiz,
    },
    {
      number: "03",
      label: "检测",
      title: compactTopic(readyQuiz?.topic, 22) || "生成针对练习",
      hint: readyQuiz ? `${readyQuiz.total_count} 道题等待完成` : "确认是否真正掌握",
      to: readyQuiz ? `/quiz/${readyQuiz.id}` : "/quiz",
      icon: BookOpenCheck,
      color: "#3E7774",
      active: Boolean(readyQuiz),
    },
    {
      number: "04",
      label: "调整",
      title: "更新下一步",
      hint: course ? "完成后回写当前岗位能力画像" : latestSuggestion || "依据训练表现修正路线",
      to: "/report",
      icon: BarChart3,
      color: "#7E6B83",
    },
  ]

  const activities = useMemo(() => {
    const noteActivities = data.notes.items.slice(0, 4).map((note) => ({
      key: `note-${note.id}`,
      to: "/notes",
      title: note.title || "未命名笔记",
      meta: SOURCE_LABEL[note.source],
      date: note.updated_at || note.created_at,
      icon: FileText,
      color: "#355C8A",
      wash: "#E7EDF3",
    }))

    const quizActivities = data.quizzes.slice(0, 5).map((quiz) => ({
      key: `quiz-${quiz.id}`,
      to: quiz.status === "ready" || quiz.status === "submitted" ? `/quiz/${quiz.id}` : "/quiz",
      title: quiz.topic || "未命名测验",
      meta: quiz.status === "submitted"
        ? `测验完成 · ${Math.round(quiz.score)} 分`
        : quiz.status === "ready"
          ? `${quiz.total_count} 道题待完成`
          : quiz.status === "generating"
            ? "题目生成中"
            : "生成遇到问题",
      date: quiz.submitted_at || quiz.created_at,
      icon: BookOpenCheck,
      color: "#3E7774",
      wash: "#E2EEEB",
    }))

    return [...noteActivities, ...quizActivities]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 4)
  }, [data.notes.items, data.quizzes])

  const profileGoal = data.profile?.dims.goals?.primary?.trim() || ""
  const profileSummary = weakTopics.length
    ? `当前重点：${weakTopics.slice(0, 2).join("、")}`
    : profileGoal
      ? `当前目标：${profileGoal}`
      : targetTopics.length
        ? `目标主题：${targetTopics.slice(0, 2).join("、")}`
        : "通过对话补充岗位目标、训练节奏与薄弱能力点"
  const hoursPerWeek = data.profile?.dims.pace?.hours_per_week || 0
  const hasProfileContent = Boolean(profileGoal || weakTopics.length || targetTopics.length || hoursPerWeek)
  const generatedResourceCount = [
    Boolean(workspace.outputs.doc?.content),
    Boolean(workspace.outputs.mindmap?.content),
    Boolean(workspace.outputs.quiz?.items?.length),
    Boolean(workspace.outputs.reading?.items?.length),
    Boolean(workspace.outputs.code?.code),
    Boolean(workspace.outputs.guide?.content),
    Boolean(workspace.outputs.video?.script),
  ].filter(Boolean).length
  const reportCapabilityMap = useMemo(() => targetRole ? buildRoleCompetencyMap(targetRole) : null, [targetRole])
  const reportCapabilities = useMemo<ReportCapability[]>(() => {
    if (!reportCapabilityMap) return []
    const storedEvidence = readReportCapabilityEvidence(user?.user_id, reportCapabilityMap.roleId)
    const currentNames = new Set(workspace.outputs.training_plan?.priority_competencies ?? [])
    const feedbackLevel = workspace.feedback?.accuracy == null
      ? 0
      : workspace.feedback.accuracy >= 85
        ? 3
        : workspace.feedback.accuracy >= 60
          ? 2
          : 1
    const levels = new Map(reportCapabilityMap.nodes.map((node) => [
      node.id,
      Math.max(storedEvidence[node.id]?.level ?? 0, currentNames.has(node.name) ? feedbackLevel : 0),
    ]))

    return reportCapabilityMap.nodes.map((node) => {
      const level = levels.get(node.id) ?? 0
      let state: ReportCapability["state"]
      if (level >= 3) state = "mastered"
      else if (currentNames.has(node.name)) state = "current"
      else if (level > 0) state = "developing"
      else if (node.prerequisites.every((id) => (levels.get(id) ?? 0) >= 3)) state = "ready"
      else state = "locked"
      return { id: node.id, name: node.name, level, state, task: node.task, prerequisites: node.prerequisites }
    })
  }, [reportCapabilityMap, user?.user_id, workspace.feedback?.accuracy, workspace.outputs.training_plan])
  const theoryEvidence = targetRole ? data.profile?.dims.theory_assessments?.[targetRole.id] : undefined
  const todayKey = shanghaiDayKey(new Date())
  const todaySubmittedQuizzes = submittedQuizzes.filter((quiz) => shanghaiDayKey(quiz.submitted_at) === todayKey)
  const todayNotes = data.notes.items.filter((note) => shanghaiDayKey(note.updated_at || note.created_at) === todayKey)
  const todayEvaluations = data.evaluations.filter((evaluation) => shanghaiDayKey(evaluation.created_at) === todayKey)
  const workspaceStartedToday = shanghaiDayKey(workspace.learningStartedAt || workspace.startedAt) === todayKey
  const workspaceFinishedToday = workspace.status === "done" && shanghaiDayKey(workspace.finishedAt) === todayKey
  const workspaceMinutes = workspaceStartedToday ? Math.round(workspace.learningDurationMs / 60_000) : 0
  const quizMinutes = todaySubmittedQuizzes.reduce((sum, quiz) => sum + Math.max(0, quiz.duration_ms || 0), 0) / 60_000
  const todayMinutes = Math.max(workspaceMinutes, Math.round(quizMinutes))
  const completedTasks = todaySubmittedQuizzes.length + (workspaceFinishedToday ? 1 : 0)
  const touchedTopics = new Set([
    ...todaySubmittedQuizzes.map((quiz) => quiz.topic).filter(Boolean),
    ...(workspaceStartedToday && workspace.topic ? [workspace.topic] : []),
  ])
  const profileCompleteness = calculateProfileCompleteness(data.profile)
  const effectiveProfileVersion = profileCompleteness ? data.profile?.version || 0 : 0
  const todayProgress = [todayNotes.length > 0, todaySubmittedQuizzes.length > 0, workspaceFinishedToday, todayEvaluations.length > 0]
    .filter(Boolean).length * 25
  const personalMetrics: UniverseMetric[] = [
    {
      label: "今日学习时长",
      value: formatTrackedDuration(todayMinutes),
      detail: todayMinutes ? "前台学习与测验的已记录时长" : "尚未开始记录",
      source: data.sources.quizzes === "error" && !workspaceStartedToday ? "error" : "ok",
    },
    {
      label: "已完成任务",
      value: completedTasks ? `${completedTasks} 项` : "尚未开始",
      detail: completedTasks ? "今日测验与完整 Agent 任务" : "等待首个任务",
      source: data.sources.quizzes === "error" && !workspaceFinishedToday ? "error" : "ok",
    },
    {
      label: "训练能力点",
      value: touchedTopics.size ? `${touchedTopics.size} 个` : "等待学习",
      detail: touchedTopics.size ? "来自今日测验与岗位训练任务" : "等待首次训练",
      source: data.sources.quizzes === "error" && !workspaceStartedToday ? "error" : "ok",
    },
    {
      label: "画像完整度",
      value: data.sources.profile === "error" ? "暂不可用" : `${profileCompleteness}%`,
      detail: profileCompleteness ? `7 组画像 · 当前 v${data.profile?.version}` : "完成对话后形成画像",
      source: data.sources.profile === "error" ? "error" : "ok",
    },
  ]

  const universeActivities = useMemo<UniverseActivity[]>(() => {
    const rows: UniverseActivity[] = []
    data.notes.items.slice(0, 5).forEach((note) => {
      const timestamp = new Date(note.updated_at || note.created_at || 0).getTime()
      if (timestamp > 0) rows.push({
        key: `pulse-note-${note.id}`,
        to: "/notes",
        title: "笔记已更新",
        detail: compactTopic(note.title || "未命名笔记", 24),
        timestamp,
        tone: "#86A9B2",
      })
    })
    data.quizzes.slice(0, 8).forEach((quiz) => {
      const timestamp = new Date(quiz.submitted_at || quiz.created_at || 0).getTime()
      if (timestamp > 0) rows.push({
        key: `pulse-quiz-${quiz.id}`,
        to: quiz.status === "ready" || quiz.status === "submitted" ? `/quiz/${quiz.id}` : "/quiz",
        title: quiz.status === "submitted" ? "测验已完成" : quiz.status === "ready" ? "测验等待作答" : quiz.status === "generating" ? "测验正在生成" : "测验生成异常",
        detail: compactTopic(quiz.topic || "未命名测验", 24),
        timestamp,
        tone: quiz.status === "error" ? "#B97B65" : "#C8A767",
      })
    })
    data.evaluations.slice(0, 5).forEach((evaluation) => {
      const timestamp = new Date(evaluation.created_at || 0).getTime()
      if (timestamp > 0) rows.push({
        key: `pulse-eval-${evaluation.id}`,
        to: "/report",
        title: "画像评估已归档",
        detail: evaluation.suggestions?.[0] ? compactTopic(evaluation.suggestions[0], 24) : "阶段学习建议已更新",
        timestamp,
        tone: "#A59AB4",
      })
    })
    const workspaceTimestamp = workspace.updatedAt || workspace.finishedAt || workspace.startedAt
    if (workspaceTimestamp > 0 && workspace.topic) {
      rows.push({
        key: `pulse-workspace-${workspaceTimestamp}`,
        to: "/competency",
        title: workspace.status === "running" ? "14 个协作节点正在协作" : workspace.status === "done" ? "Agent 训练资源已完成" : workspace.status === "error" || workspace.status === "interrupted" ? "Agent 任务需要关注" : "岗位训练中心已更新",
        detail: compactTopic(workspace.logs.at(-1) || workspace.topic, 26),
        timestamp: workspaceTimestamp,
        tone: workspace.status === "error" || workspace.status === "interrupted" ? "#B97B65" : "#91A98C",
      })
    }
    return rows.sort((a, b) => b.timestamp - a.timestamp)
  }, [data.evaluations, data.notes.items, data.quizzes, workspace.finishedAt, workspace.logs, workspace.startedAt, workspace.status, workspace.topic, workspace.updatedAt])

  const universeTrend = useMemo<UniverseTrendPoint[]>(() => {
    const now = new Date()
    const points = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * 86_400_000)
      const key = shanghaiDayKey(date)
      return {
        key,
        label: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(date).replace("周", ""),
        value: 0,
      }
    })
    const byKey = new Map(points.map((point) => [point.key, point]))
    const increment = (value: string | null | undefined) => {
      const point = byKey.get(shanghaiDayKey(value))
      if (point) point.value += 1
    }
    data.notes.items.forEach((note) => increment(note.updated_at || note.created_at))
    data.quizzes.filter((quiz) => quiz.status === "submitted").forEach((quiz) => increment(quiz.submitted_at))
    data.evaluations.forEach((evaluation) => increment(evaluation.created_at))
    if (workspaceFinishedToday) {
      const point = byKey.get(todayKey)
      if (point) point.value += 1
    }
    return points
  }, [data.evaluations, data.notes.items, data.quizzes, todayKey, workspaceFinishedToday])

  return (
    <div className="app-page paper-theme">
      <LearningUniverse
        learnerName={user?.name || "学习者"}
        courseName={targetRoleName || "尚未选择目标岗位"}
        courseSelected={hasTargetRole}
        courseChunkCount={course?.chunk_count || 0}
        metrics={personalMetrics}
        platform={data.platform}
        profileCompleteness={profileCompleteness}
        profileVersion={effectiveProfileVersion}
        generatedResourceCount={generatedResourceCount}
        quizCount={submittedQuizzes.length + readyQuizzes.length}
        noteCount={data.notes.count}
        reportCount={data.evaluations.length}
        todayProgress={todayProgress}
        activities={universeActivities}
        trend={universeTrend}
        sources={data.sources}
        lastSyncedAt={data.lastSyncedAt}
        workspace={workspace}
      />
      <div id="learning-desk" className="w-full scroll-mt-2 p-3 sm:p-4">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#59636B] shadow-sm hover:bg-[#ECE8DE]"
          >
            <Orbit className="size-3.5 text-[#315E83]" />返回学习宇宙
          </button>
        </div>
        <AppTopbar current="home" appearance="paper" />

        <main className="pb-14 pt-6 sm:pt-8">
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42 }}
            className="mb-5 flex flex-col gap-4 px-1 sm:mb-6 lg:flex-row lg:items-end lg:justify-between"
          >
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[#315E83]">
                <span className="size-1.5 rounded-full bg-[#B85C3E]" />
                学习工作台 · 今日安排
              </div>
              <h1 className="text-balance text-[28px] font-bold leading-[1.18] tracking-[-0.045em] text-[#18232D] sm:text-[36px]">
                {greetingForNow()}，{user?.name || "同学"}。<span className="text-[#315E83]">把今天学什么安排清楚。</span>
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-4 text-xs font-semibold text-[#66717B] shadow-[0_4px_12px_rgba(24,35,45,.04)]">
                <CalendarDays className="size-4 text-[#6F8A69]" /> {todayLabel()}
              </span>
              <Link to="/courses" className="inline-flex h-10 max-w-[260px] items-center gap-2 rounded-full border border-[#C6BFAF] bg-[#F7F2E7] px-4 text-xs font-semibold text-[#244C66] transition-colors hover:bg-[#EEE8DB]">
                <Library className="size-4 shrink-0" />
                <span className="truncate">{targetRoleName || "尚未选择目标岗位"}</span>
                <ChevronRight className="size-3.5 shrink-0" />
              </Link>
            </div>
          </motion.header>

          {showcaseCourse ? (
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.03 }}
              className="mb-4 flex flex-col gap-3 rounded-[22px] border border-[#D8C9A8] bg-[#FBF7ED] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)] sm:flex-row sm:items-center sm:justify-between sm:p-5"
              aria-label="岗位目录预览"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]"><Library className="size-[18px]" /></span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">目录展示岗位</div>
                  <h2 className="mt-1 text-[15px] font-bold text-[#18232D]">当前正在浏览《{course?.name}》</h2>
                  <p className="mt-1 text-xs leading-5 text-[#66717B]">该岗位暂时只能查看目录，训练功能尚未开放。</p>
                </div>
              </div>
              <Link to="/courses" className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]">浏览岗位目录<ArrowRight className="size-3.5" /></Link>
            </motion.section>
          ) : !loading && (!hasTargetRole || !hasProfileContent) && (
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.03 }}
              className="mb-4 flex flex-col gap-4 rounded-[22px] border border-[#D8C9A8] bg-[#FBF7ED] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)] sm:flex-row sm:items-center sm:justify-between sm:p-5"
              aria-label="首次学习准备"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]"><GraduationCap className="size-[18px]" /></span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">开始第一次学习</div>
                  <h2 className="mt-1 text-[15px] font-bold text-[#18232D]">完成两步准备，开始个性化学习</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${hasTargetRole ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D8C9A8] bg-[#FFFEFA] text-[#8E6925]"}`}>
                      {hasTargetRole ? <CheckCircle2 className="size-3" /> : <span className="size-1.5 rounded-full bg-[#B1842C]" />}
                      {hasTargetRole ? `岗位已选 · ${targetRoleName}` : "第 1 步 · 选择目标岗位"}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${hasProfileContent ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#C7D2D8] bg-[#FFFEFA] text-[#315E83]"}`}>
                      {hasProfileContent ? <CheckCircle2 className="size-3" /> : <span className="size-1.5 rounded-full bg-[#315E83]" />}
                      {hasProfileContent ? `画像已建立 · v${data.profile?.version}` : "第 2 步 · 告诉系统你的目标"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Link to="/guide" className="inline-flex h-9 items-center rounded-xl px-3 text-[10px] font-bold text-[#66717B] hover:bg-[#F1EDE4] hover:text-[#244C66]">查看使用手册</Link>
                <Link to={hasTargetRole ? "/profile" : "/courses"} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.16)] hover:bg-[#193B50]">
                  {hasTargetRole ? "继续建立画像" : "先选择目标岗位"}<ArrowRight className="size-3.5" />
                </Link>
              </div>
            </motion.section>
          )}

          <LearnerMatchReport
            targetRoleName={targetRoleName || "目标岗位"}
            diagnosis={workspace.diagnosis}
            plan={workspace.outputs.training_plan}
            theoryScore={theoryEvidence?.score}
            theoryWeakTopics={theoryEvidence?.weak_topics ?? []}
            profileWeakTopics={weakTopics}
            feedbackAccuracy={workspace.feedback?.accuracy ?? submittedQuizzes[0]?.score}
            capabilities={reportCapabilities}
            resources={[
              { id: "doc", title: "定制讲义", reviewScore: workspace.reviews.evidence_review?.score ?? 0, ready: Boolean(workspace.outputs.doc) },
              { id: "guide", title: "实操指南", reviewScore: workspace.reviews.practice_review?.score ?? 0, ready: Boolean(workspace.outputs.guide) },
              { id: "quiz", title: "分阶测试", reviewScore: workspace.reviews.difficulty_review?.score ?? 0, ready: Boolean(workspace.outputs.quiz) },
            ]}
          />

          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,.75fr)]">
            <motion.article
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="relative min-w-0 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_16px_42px_rgba(24,35,45,.08)] sm:p-7 lg:p-8"
            >
              <div className="pointer-events-none absolute -right-20 -top-20 size-72 rotate-12 rounded-[54px] bg-[#EEF0EF]" />
              <div className="pointer-events-none absolute -bottom-28 left-[38%] h-48 w-[72%] -rotate-6 bg-[#E9EEE6]" />

              <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#F7F2E7] px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-[#244C66]">
                    <Route className="size-3.5" /> 今日学习航线
                  </span>
                  <h2 className="mt-4 text-balance text-[26px] font-bold leading-[1.22] tracking-[-0.045em] text-[#18232D] sm:text-[34px]">
                    {focusTopic ? <>从「<span className="text-[#315E83]">{focusTopic}</span>」出发</> : "先为今天选定一个学习场景"}
                  </h2>
                  <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#66717B] sm:text-sm">{focusReason}</p>
                </div>

                <Link
                  to={primaryAction.to}
                  className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-[13px] font-bold text-[#FFFEFA] shadow-[0_9px_20px_rgba(36,76,102,.2)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50]"
                >
                  {primaryAction.label}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <div className="relative z-10 mt-7 sm:mt-9">
                <div className="absolute left-[8%] right-[8%] top-5 hidden border-t border-dashed border-[#BEB7AA] sm:block" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {routeSteps.map(({ number, label, title, hint, to, icon: Icon, color, active }, index) => (
                    <motion.div
                      key={number}
                      initial={reduceMotion ? false : { opacity: 0, y: 9 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.22 + index * 0.08 }}
                    >
                      <Link
                        to={to}
                        className="group relative flex min-h-[132px] h-full flex-col rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA]/95 p-4 transition-all hover:-translate-y-1 hover:border-[#B7B0A2] hover:shadow-[0_10px_22px_rgba(24,35,45,.08)]"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span
                            className="relative grid size-10 place-items-center rounded-full border-[3px] border-[#FFFEFA] text-white shadow-[0_0_0_1px_#CFC8B9]"
                            style={{ backgroundColor: color }}
                          >
                            <Icon className="size-4" />
                            {active && !reduceMotion && <span className="absolute inset-[-7px] -z-10 animate-ping rounded-full border" style={{ borderColor: `${color}66` }} />}
                          </span>
                          <span className="text-[11px] font-bold tracking-[0.14em] text-[#8A8F8A]">{number}</span>
                        </div>
                        <span className="text-[11px] font-bold tracking-[0.1em]" style={{ color }}>{label}</span>
                        <strong className="mt-1 line-clamp-1 text-[13px] text-[#18232D]">{title}</strong>
                        <span className="mt-1 line-clamp-2 text-xs leading-[1.45] text-[#7A817F]">{hint}</span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="relative z-10 mt-5 grid gap-3 border-t border-[#DDD7CB] pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#F4ECD8] text-[#9B7429]"><CircleDot className="size-4" /></span>
                  <div>
                    <p className="text-xs font-bold text-[#18232D]">路线依据</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#66717B]">
                      {profileGoal ? `当前目标：${profileGoal}` : hasTargetRole ? `当前岗位：${targetRoleName}` : "完成画像后，路线会更贴近你的目标与节奏"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-[#D7D1C4] rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-2 py-2.5 text-center">
                  <div className="px-3"><strong className="block text-base text-[#244C66]">{loading ? "—" : data.notes.count}</strong><span className="text-[11px] text-[#7A817F]">{hasTargetRole ? "岗位笔记" : "全部笔记"}</span></div>
                  <div className="px-3"><strong className="block text-base text-[#3E7774]">{loading ? "—" : submittedQuizzes.length}</strong><span className="text-[11px] text-[#7A817F]">近期完成</span></div>
                  <div className="px-3"><strong className="block text-base text-[#B85C3E]">{loading ? "—" : readyQuizzes.length}</strong><span className="text-[11px] text-[#7A817F]">近期待办</span></div>
                </div>
              </div>

              <div className="relative z-10 mt-5 rounded-2xl border border-[#C9D1CB] bg-[#E9EEE6] p-4 sm:flex sm:items-center sm:gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[#BFCBC1] bg-[#FFFEFA] text-[#557052]">
                  <UserRoundSearch className="size-[18px]" />
                </span>
                <div className="mt-3 min-w-0 flex-1 sm:mt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-[#18232D]">画像正在参与今日路线</strong>
                    {data.profile && <span className="rounded-full bg-[#DCE7DD] px-2 py-0.5 text-[10px] font-bold text-[#557052]">画像 v{data.profile.version} · 持续更新</span>}
                  </div>
                  <p className="mt-1 truncate text-[11px] leading-5 text-[#66717B]">{loading ? "正在读取你的岗位能力画像…" : profileSummary}</p>
                </div>
                <Link to="/profile" className="group mt-3 inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#BBC8BC] bg-[#FFFEFA] px-4 text-[11px] font-bold text-[#315E83] transition-colors hover:bg-[#F5F7F2] sm:mt-0">
                  <MessageCircleMore className="size-3.5" />{data.profile ? "继续完善画像" : "开始建立画像"}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

            </motion.article>

            <motion.aside
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="relative overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_16px_42px_rgba(24,35,45,.07)] sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.12em] text-[#6F8A69]">常用学习能力</span>
                  <h2 className="mt-1.5 text-xl font-bold tracking-[-0.035em] text-[#18232D]">常用学习入口</h2>
                  <p className="mt-1.5 text-xs leading-5 text-[#66717B]">从岗位目标出发，继续完善画像、训练和测验。</p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA] text-[#244C66]"><Orbit className="size-[17px]" /></span>
              </div>

              <OrbitMap learnerName={user?.name || "学习者"} />

              <div className="grid grid-cols-3 gap-x-2 gap-y-2 border-t border-[#D7D1C4] pt-4">
                {MODULES.map(({ label, color }) => (
                  <div key={label} className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#59636B]">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>

              <Link to="/competency" className="group mt-3 flex h-10 items-center justify-between rounded-xl border border-[#C9C2B4] bg-[#FFFEFA] px-4 text-xs font-bold text-[#244C66] transition-colors hover:bg-[#F1EDE4]">
                进入岗位训练中心
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.aside>
          </section>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.46, delay: 0.18 }}
            className="mt-4 overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_9px_24px_rgba(24,35,45,.055)]"
          >
            <div className="flex flex-col gap-1 border-b border-[#DDD7CB] bg-[#F8F6F0] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-[#B1842C]" /><strong className="text-xs text-[#18232D]">常用工具，一条学习路径</strong></div>
              <span className="text-[11px] tracking-[0.05em] text-[#7A817F]">按需要进入对应工具</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[#DDD7CB] sm:grid-cols-3 xl:grid-cols-7">
              {MODULES.map(({ to, label, detail, icon: Icon, color, wash }) => (
                <Link key={to} to={to} className="group flex min-h-[104px] items-start gap-3 bg-[#FFFEFA] p-4 transition-colors hover:bg-[#F8F6F0]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}><Icon className="size-[17px]" /></span>
                  <span className="min-w-0 pt-0.5">
                    <span className="flex items-center gap-1 text-xs font-bold text-[#18232D]">{label}<ChevronRight className="size-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
                    <span className="mt-1.5 block text-[11px] leading-4 text-[#727A7E]">{detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </motion.section>

          <LearningLoopPanel
            profileVersion={effectiveProfileVersion}
            generatedResourceCount={generatedResourceCount}
            noteCount={data.notes.count}
            submittedQuizCount={submittedQuizzes.length}
            reportCount={data.evaluations.length}
            workspaceStatus={workspace.status}
            reduceMotion={Boolean(reduceMotion)}
          />

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(370px,.85fr)]">
            <article className="rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_9px_24px_rgba(24,35,45,.055)] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.12em] text-[#355C8A]">学习记录</span>
                  <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">最近在学</h2>
                </div>
                <Link to="/notes" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#315E83] hover:underline">打开学习记录 <ArrowRight className="size-3" /></Link>
              </div>

              {loading ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl bg-[#ECE8DE]" />)}
                </div>
              ) : activities.length ? (
                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {activities.map(({ key, to, title, meta, date, icon: Icon, color, wash }) => (
                    <Link key={key} to={to} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#DDD7CB] bg-[#FDFBF6] p-3.5 transition-all hover:-translate-y-0.5 hover:border-[#BDB5A6] hover:shadow-[0_8px_16px_rgba(24,35,45,.055)]">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}><Icon className="size-[18px]" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-[#18232D]">{title}</strong>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#737C80]"><span className="truncate">{meta}</span><span>·</span><span className="shrink-0">{shortDate(date)}</span></span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-[#A2A39E] transition-transform group-hover:translate-x-0.5 group-hover:text-[#244C66]" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-5 flex flex-col items-start gap-4 rounded-2xl border border-dashed border-[#C9C2B4] bg-[#F8F6F0] p-5 sm:flex-row sm:items-center">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#E7EDF3] text-[#355C8A]"><GraduationCap className="size-5" /></span>
                  <div className="flex-1"><strong className="text-sm text-[#18232D]">这里会显示最近学习记录</strong><p className="mt-1 text-xs leading-5 text-[#66717B]">完成讲解、保存笔记或参加测验后即可查看。</p></div>
                  <Link to={hasTargetRole ? "/workspace" : "/courses"} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#244C66] px-4 text-[11px] font-bold text-white">{hasTargetRole ? "开始第一次岗位训练" : "选择目标岗位"}<ArrowRight className="size-3.5" /></Link>
                </div>
              )}
            </article>

            <article className="rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_9px_24px_rgba(24,35,45,.05)] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.12em] text-[#6F8A69]">岗位能力画像</span>
                  <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">岗位能力画像速记</h2>
                </div>
                <Link to="/profile" className="grid size-9 place-items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA] text-[#244C66] transition-colors hover:bg-[#ECE8DE]" aria-label="打开岗位能力画像"><UserRoundSearch className="size-4" /></Link>
              </div>

              {loading ? (
                <div className="mt-5 h-36 animate-pulse rounded-2xl bg-[#E5E2D9]" />
              ) : hasProfileContent ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#F4ECD8] text-[#9B7429]"><Target className="size-4" /></span>
                    <div className="min-w-0"><span className="text-[11px] font-bold text-[#8A8172]">当前岗位目标</span><p className="mt-0.5 text-xs font-semibold leading-5 text-[#18232D]">{profileGoal || targetTopics[0] || "逐步完善岗位目标"}</p></div>
                    {hoursPerWeek > 0 && <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E8EDE5] px-2 py-1 text-[10px] font-bold text-[#5D7658]"><Clock3 className="size-3" />每周 {hoursPerWeek}h</span>}
                  </div>

                  <div className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
                    <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold text-[#8A8172]">优先关注</span><span className="text-[10px] text-[#8A8F8A]">来自真实画像</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {weakTopics.length ? weakTopics.slice(0, 5).map((topic) => <span key={topic} className="rounded-full border border-[#E1CFC6] bg-[#F4E8E2] px-2.5 py-1 text-[11px] font-semibold text-[#9A4E35]">{topic}</span>) : <span className="text-[11px] text-[#737C80]">暂未记录薄弱岗位能力点</span>}
                    </div>
                  </div>

                  {latestSuggestion && !course && (
                    <div className="flex items-start gap-2.5 px-1 text-[11px] leading-5 text-[#59636B]"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6F8A69]" /><span>{latestSuggestion}</span></div>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-[#C9C2B4] bg-[#FFFEFA] p-5 text-center">
                  <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#E8ECEE] text-[#315E83]"><UserRoundSearch className="size-5" /></span>
                  <strong className="mt-3 block text-sm text-[#18232D]">先让 StudyMate 认识你</strong>
                  <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#66717B]">补充岗位目标、学习时间和待提升能力，获得更合适的训练安排。</p>
                  <Link to="/profile" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#315E83] hover:underline">开始建立画像 <ArrowRight className="size-3" /></Link>
                </div>
              )}
            </article>
          </section>

          <footer className="mt-5 flex flex-col gap-3 border-t border-[#CFC8B9] px-1 pt-4 text-[11px] text-[#747C7D] sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#6F8A69]" />学习数据仅用于生成你的个性化路线</span>
            <span>StudyMate · 个性化学习工作台</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

function LearningLoopPanel({
  profileVersion,
  generatedResourceCount,
  noteCount,
  submittedQuizCount,
  reportCount,
  workspaceStatus,
  reduceMotion,
}: {
  profileVersion: number
  generatedResourceCount: number
  noteCount: number
  submittedQuizCount: number
  reportCount: number
  workspaceStatus: RunStatus
  reduceMotion: boolean
}) {
  const generationNeedsAttention = workspaceStatus === "error" || workspaceStatus === "interrupted"
  const steps = [
    {
      number: "01",
      title: "岗位能力画像",
      detail: profileVersion ? `画像 v${profileVersion} 已参与决策` : "等待建立画像",
      to: "/profile",
      icon: UserRoundSearch,
      color: "#355C8A",
      wash: "#E7EDF3",
      state: profileVersion ? "done" : "next",
    },
    {
      number: "02",
      title: "资源生成",
      detail: workspaceStatus === "running"
        ? "14 个协作节点正在协作"
        : generationNeedsAttention
          ? generatedResourceCount ? `生成已中断 · 保留 ${generatedResourceCount} 类资源` : "生成中断，点击继续处理"
          : generatedResourceCount ? `${generatedResourceCount} / 7 类岗位训练资源已就绪` : "等待生成训练资源",
      to: "/competency",
      icon: Sparkles,
      color: "#6F8A69",
      wash: "#E8EDE5",
      state: workspaceStatus === "running" ? "active" : generationNeedsAttention ? "attention" : generatedResourceCount ? "done" : profileVersion ? "next" : "pending",
    },
    {
      number: "03",
      title: "学习沉淀",
      detail: noteCount ? `${noteCount} 条岗位笔记` : "阅读并保存关键内容",
      to: "/notes",
      icon: NotebookPen,
      color: "#B85C3E",
      wash: "#F4E8E2",
      state: noteCount ? "done" : generatedResourceCount ? "next" : "pending",
    },
    {
      number: "04",
      title: "掌握验证",
      detail: submittedQuizCount ? `${submittedQuizCount} 次测验已完成` : "用真实作答留下证据",
      to: "/quiz",
      icon: BookOpenCheck,
      color: "#3E7774",
      wash: "#E2EEEB",
      state: submittedQuizCount ? "done" : noteCount ? "next" : "pending",
    },
    {
      number: "05",
      title: "评估回写",
      detail: reportCount ? `近期 ${reportCount} 份报告已生成` : "生成报告并更新画像",
      to: "/report",
      icon: BarChart3,
      color: "#7E6B83",
      wash: "#EEE9EF",
      state: reportCount ? "done" : submittedQuizCount ? "next" : "pending",
    },
  ] as const

  const doneCount = steps.filter((step) => step.state === "done").length

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46, delay: 0.2 }}
      className="mt-4 overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] shadow-[0_9px_24px_rgba(24,35,45,.055)]"
    >
      <div className="flex flex-col gap-2 border-b border-[#DDD7CB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.11em] text-[#8E6925]"><Route className="size-3.5" />学习记录</div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">查看每个学习环节的进度</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5 text-[11px] font-bold text-[#59636B]">{doneCount} / 5 个环节已有记录</span>
          <span className="hidden rounded-full bg-[#E9EEE6] px-3 py-1.5 text-[11px] font-bold text-[#557052] md:inline">完成报告后更新画像</span>
        </div>
      </div>

      <div className="relative grid gap-px bg-[#DDD7CB] sm:grid-cols-2 xl:grid-cols-5">
        {steps.map(({ number, title, detail, to, icon: Icon, color, wash, state }, index) => (
          <Link key={number} to={to} className="group relative min-h-[116px] bg-[#FFFEFA] p-4 transition-colors hover:bg-[#FDFBF6]">
            {index < steps.length - 1 && <span className="absolute -right-2 top-1/2 z-10 hidden size-4 -translate-y-1/2 place-items-center rounded-full border border-[#D7D1C4] bg-[#F8F6F0] text-[#8A8F8A] xl:grid"><ChevronRight className="size-3" /></span>}
            <div className="flex items-start justify-between gap-3">
              <span className="relative grid size-9 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}>
                <Icon className="size-4" />
                {state === "active" && !reduceMotion && <span className="absolute -inset-1 animate-ping rounded-xl border" style={{ borderColor: `${color}66` }} />}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[#96978F]">
                {state === "done" && <CheckCircle2 className="size-3.5 text-[#6F8A69]" />}
                {state === "active" && <span className="size-1.5 animate-pulse rounded-full bg-[#315E83]" />}
                {state === "attention" && <AlertCircle className="size-3.5 text-[#B85C3E]" />}
                {state === "next" ? "下一步" : number}
              </span>
            </div>
            <strong className="mt-3 block text-xs text-[#18232D]">{title}</strong>
            <span className="mt-1 block text-[11px] leading-4 text-[#737C80]">{detail}</span>
          </Link>
        ))}
      </div>
    </motion.section>
  )
}
