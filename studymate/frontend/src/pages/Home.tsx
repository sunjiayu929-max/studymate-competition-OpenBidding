import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
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
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { useTutorContext } from "@/hooks/useTutorContext"
import { apiGet } from "@/lib/api"
import { listQuizSessions, type QuizSession } from "@/lib/quizSession"
import { useTrackPage } from "@/lib/useTrackPage"
import { fallbackSamplesFor, useCurrentCourse } from "@/store/course"
import { useCurrentUser } from "@/store/user"
import { useWorkspaceStore, type RunStatus } from "@/store/workspace"

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
  goals?: { primary?: string; deadline?: string; target_topics?: string[] }
  weak_points?: { topics?: string[]; error_types?: string[] }
  pace?: { hours_per_week?: number; intensity?: string }
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
}

const EMPTY_HOME_DATA: HomeData = {
  profile: null,
  notes: { count: 0, items: [] },
  quizzes: [],
  evaluations: [],
}

const MODULES = [
  { to: "/profile", label: "学习画像", short: "画像", detail: "理解你的目标与节奏", icon: UserRoundSearch, color: "#355C8A", wash: "#E7EDF3" },
  { to: "/tutor", label: "AI 助教", short: "助教", detail: "围绕难点继续追问", icon: MessageCircleMore, color: "#B85C3E", wash: "#F4E8E2" },
  { to: "/courses", label: "课程空间", short: "课程", detail: "切换你的学习场景", icon: Library, color: "#B1842C", wash: "#F4ECD8" },
  { to: "/notes", label: "智能笔记", short: "笔记", detail: "沉淀讲解与思考", icon: NotebookPen, color: "#6F8A69", wash: "#E8EDE5" },
  { to: "/quiz", label: "智能测验", short: "测验", detail: "用练习确认真正掌握", icon: BookOpenCheck, color: "#3E7774", wash: "#E2EEEB" },
  { to: "/workspace", label: "学习路径", short: "路径", detail: "组织今天的学习步骤", icon: Route, color: "#7E6B83", wash: "#EEE9EF" },
  { to: "/report", label: "学习报告", short: "报告", detail: "查看成长变化与阶段反馈", icon: BarChart3, color: "#6D748B", wash: "#EAEBF0" },
] as const

const SOURCE_LABEL: Record<NoteSource, string> = {
  manual: "手动笔记",
  doc: "讲解摘录",
  quiz: "错题笔记",
  tutor: "助教摘录",
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

function OrbitMap({ learnerName }: { learnerName: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[292px]" aria-label="常用学习能力围绕学习者组织">
      <div className="absolute inset-[14%] rounded-full border border-[#C9D1CB]" />
      <div className="absolute inset-[25%] rounded-full border border-dashed border-[#D7D1C4]" />
      <Link
        to="/profile"
        aria-label="打开学习画像对话"
        title="继续通过对话完善学习画像"
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
  const user = useCurrentUser()
  const reduceMotion = useReducedMotion()
  const workspace = useWorkspaceStore()
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA)
  const [loading, setLoading] = useState(true)
  const courseId = course?.id

  useTutorContext({ page: "home", title: `今日学习 · 当前课程：${course?.name || "未选"}` })

  useEffect(() => {
    const userId = user?.user_id
    if (!userId) return

    let cancelled = false
    const courseFilter = courseId ? `&course_id=${courseId}` : ""

    Promise.allSettled([
      apiGet<ProfileResponse>(`/profile/${userId}`),
      apiGet<NotesResponse>(`/notes?user_id=${userId}${courseFilter}`),
      listQuizSessions({ user_id: userId, course_id: courseId, limit: 12 }),
      apiGet<EvalHistoryResponse>(`/eval/history/${userId}?limit=4`),
    ]).then(([profileResult, notesResult, quizResult, evalResult]) => {
      if (cancelled) return
      setData({
        profile: profileResult.status === "fulfilled" ? profileResult.value : null,
        notes: notesResult.status === "fulfilled" ? notesResult.value : { count: 0, items: [] },
        quizzes: quizResult.status === "fulfilled" ? quizResult.value : [],
        evaluations: evalResult.status === "fulfilled" ? evalResult.value.items : [],
      })
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [courseId, user?.user_id])

  const weakTopics = data.profile?.dims.weak_points?.topics?.filter(Boolean) || []
  const targetTopics = data.profile?.dims.goals?.target_topics?.filter(Boolean) || []
  const readyQuizzes = data.quizzes.filter((quiz) => quiz.status === "ready")
  const readyQuiz = readyQuizzes[0]
  const submittedQuizzes = data.quizzes.filter((quiz) => quiz.status === "submitted")
  const fallbackTopic = course ? fallbackSamplesFor(course.name).topics[0] : ""
  const focusTopic = compactTopic(readyQuiz?.topic || weakTopics[0] || targetTopics[0] || fallbackTopic)
  const latestNote = data.notes.items[0]
  const latestSuggestion = data.evaluations[0]?.suggestions?.[0]

  const primaryAction = readyQuiz
    ? { to: `/quiz/${readyQuiz.id}`, label: "继续这份测验" }
    : course
      ? { to: "/workspace", label: "生成今日学习内容" }
      : { to: "/courses", label: "先选择一门课程" }

  const focusReason = readyQuiz
    ? `你有一份关于「${compactTopic(readyQuiz.topic, 36)}」的测验尚未完成，先把这次学习闭环续上。`
    : weakTopics[0]
      ? `「${weakTopics[0]}」来自你的薄弱知识点画像，适合作为今天的第一站。`
      : targetTopics[0]
        ? `这个主题来自你的学习目标，StudyMate 已把它放到今日路线的中心。`
        : course
          ? `围绕当前课程「${course.name}」给出一条清晰起点，完成后再依据表现调整下一步。`
          : "选定课程后，笔记、测验与画像会汇成一条只属于你的学习路线。"

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
      title: focusTopic || "选择今日主题",
      hint: focusTopic ? "建议从这里开始" : "先确定学习场景",
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
      hint: course ? "完成后回写当前学习画像" : latestSuggestion || "依据学习表现修正路线",
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
        : "通过对话补充学习目标、节奏与薄弱知识点"
  const hoursPerWeek = data.profile?.dims.pace?.hours_per_week || 0
  const hasProfileContent = Boolean(profileGoal || weakTopics.length || targetTopics.length || hoursPerWeek)
  const generatedResourceCount = [
    Boolean(workspace.outputs.doc?.content),
    Boolean(workspace.outputs.mindmap?.content),
    Boolean(workspace.outputs.quiz?.items?.length),
    Boolean(workspace.outputs.reading?.items?.length),
    Boolean(workspace.outputs.code?.code),
    Boolean(workspace.outputs.path?.nodes?.length),
    Boolean(workspace.topic),
  ].filter(Boolean).length

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
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
                <span className="truncate">{course?.name || "尚未选择课程"}</span>
                <ChevronRight className="size-3.5 shrink-0" />
              </Link>
            </div>
          </motion.header>

          {!loading && (!course || !hasProfileContent) && (
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
                  <h2 className="mt-1 text-[15px] font-bold text-[#18232D]">先完成两个准备动作，后面的内容才真正属于你</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${course ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D8C9A8] bg-[#FFFEFA] text-[#8E6925]"}`}>
                      {course ? <CheckCircle2 className="size-3" /> : <span className="size-1.5 rounded-full bg-[#B1842C]" />}
                      {course ? `课程已选 · ${course.name}` : "第 1 步 · 选择课程"}
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
                <Link to={course ? "/profile" : "/courses"} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.16)] hover:bg-[#193B50]">
                  {course ? "继续建立画像" : "先选择课程"}<ArrowRight className="size-3.5" />
                </Link>
              </div>
            </motion.section>
          )}

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
                      {profileGoal ? `当前目标：${profileGoal}` : course ? `当前课程：${course.name}` : "完成画像后，路线会更贴近你的目标与节奏"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-[#D7D1C4] rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-2 py-2.5 text-center">
                  <div className="px-3"><strong className="block text-base text-[#244C66]">{loading ? "—" : data.notes.count}</strong><span className="text-[11px] text-[#7A817F]">{course ? "课程笔记" : "全部笔记"}</span></div>
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
                  <p className="mt-1 truncate text-[11px] leading-5 text-[#66717B]">{loading ? "正在读取你的学习画像…" : profileSummary}</p>
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
                  <h2 className="mt-1.5 text-xl font-bold tracking-[-0.035em] text-[#18232D]">你的学习能力星图</h2>
                  <p className="mt-1.5 text-xs leading-5 text-[#66717B]">画像、课程与学习工具围绕同一个目标持续协作。</p>
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

              <Link to="/workspace" className="group mt-3 flex h-10 items-center justify-between rounded-xl border border-[#C9C2B4] bg-[#FFFEFA] px-4 text-xs font-bold text-[#244C66] transition-colors hover:bg-[#F1EDE4]">
                让智能体生成一次完整学习内容
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
              <span className="text-[11px] tracking-[0.05em] text-[#7A817F]">从理解到练习，所有环节保持连接</span>
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
            profileVersion={data.profile?.version || 0}
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
                  <div className="flex-1"><strong className="text-sm text-[#18232D]">你的学习记录会从这里生长</strong><p className="mt-1 text-xs leading-5 text-[#66717B]">完成一次讲解、保存一条笔记或参加测验，这里就会留下真实足迹。</p></div>
                  <Link to={course ? "/workspace" : "/courses"} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#244C66] px-4 text-[11px] font-bold text-white">{course ? "开始第一次学习" : "选择课程"}<ArrowRight className="size-3.5" /></Link>
                </div>
              )}
            </article>

            <article className="rounded-[24px] border border-[#CFC8B9] bg-[#F8F6F0] p-5 shadow-[0_9px_24px_rgba(24,35,45,.05)] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.12em] text-[#6F8A69]">学习画像</span>
                  <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">学习画像速记</h2>
                </div>
                <Link to="/profile" className="grid size-9 place-items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA] text-[#244C66] transition-colors hover:bg-[#ECE8DE]" aria-label="打开学习画像"><UserRoundSearch className="size-4" /></Link>
              </div>

              {loading ? (
                <div className="mt-5 h-36 animate-pulse rounded-2xl bg-[#E5E2D9]" />
              ) : hasProfileContent ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#F4ECD8] text-[#9B7429]"><Target className="size-4" /></span>
                    <div className="min-w-0"><span className="text-[11px] font-bold text-[#8A8172]">当前目标</span><p className="mt-0.5 text-xs font-semibold leading-5 text-[#18232D]">{profileGoal || targetTopics[0] || "逐步完善学习目标"}</p></div>
                    {hoursPerWeek > 0 && <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E8EDE5] px-2 py-1 text-[10px] font-bold text-[#5D7658]"><Clock3 className="size-3" />每周 {hoursPerWeek}h</span>}
                  </div>

                  <div className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
                    <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold text-[#8A8172]">优先关注</span><span className="text-[10px] text-[#8A8F8A]">来自真实画像</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {weakTopics.length ? weakTopics.slice(0, 5).map((topic) => <span key={topic} className="rounded-full border border-[#E1CFC6] bg-[#F4E8E2] px-2.5 py-1 text-[11px] font-semibold text-[#9A4E35]">{topic}</span>) : <span className="text-[11px] text-[#737C80]">暂未记录薄弱知识点</span>}
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
                  <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#66717B]">聊几句话补充目标、节奏和薄弱点，今日路线就会更贴合你。</p>
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
      title: "学习画像",
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
        ? "七智能体正在协作"
        : generationNeedsAttention
          ? generatedResourceCount ? `生成已中断 · 保留 ${generatedResourceCount} 类资源` : "生成中断，点击继续处理"
          : generatedResourceCount ? `${generatedResourceCount} / 7 类资源已就绪` : "等待生成学习资源",
      to: "/workspace",
      icon: Sparkles,
      color: "#6F8A69",
      wash: "#E8EDE5",
      state: workspaceStatus === "running" ? "active" : generationNeedsAttention ? "attention" : generatedResourceCount ? "done" : profileVersion ? "next" : "pending",
    },
    {
      number: "03",
      title: "学习沉淀",
      detail: noteCount ? `${noteCount} 条课程笔记` : "阅读并保存关键内容",
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
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.11em] text-[#8E6925]"><Route className="size-3.5" />学习闭环证据</div>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-[#18232D]">每一次学习，都留下可以继续使用的结果</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5 text-[11px] font-bold text-[#59636B]">{doneCount} / 5 个环节已有记录</span>
          <span className="hidden rounded-full bg-[#E9EEE6] px-3 py-1.5 text-[11px] font-bold text-[#557052] md:inline">报告完成后画像形成新版本</span>
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
