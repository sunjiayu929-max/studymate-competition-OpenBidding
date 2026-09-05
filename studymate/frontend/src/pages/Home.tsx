import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Clock3, FileText, Library, MessageCircleMore, NotebookPen, Route, ShieldCheck, Sparkles, UserRoundSearch } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { useTutorContext } from "@/hooks/useTutorContext"
import { apiGet } from "@/lib/api"
import { listQuizSessions, type QuizSession } from "@/lib/quizSession"
import { buildRoleCapabilityProfile } from "@/lib/roleCapabilityProfile"
import { useTrackPage } from "@/lib/useTrackPage"
import { fallbackSamplesFor, isShowcaseCourse, useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { useWorkspaceStore } from "@/store/workspace"
import "./Home.css"

type NoteSource = "manual" | "doc" | "quiz" | "tutor"
interface NoteItem { id: number; course_id: number | null; title: string; source: NoteSource; created_at: string | null; updated_at: string | null }
interface NotesResponse { count: number; items: NoteItem[] }
interface ProfileDims {
  knowledge_base?: Record<string, unknown>; cognitive_style?: Record<string, unknown>
  goals?: { primary?: string; deadline?: string; target_topics?: string[] }
  weak_points?: { topics?: string[]; error_types?: string[] }
  pace?: { hours_per_week?: number; intensity?: string }; preference?: Record<string, unknown>
  employment_skills?: Record<string, unknown>; theory_assessments?: Record<string, { score?: number; weak_topics?: string[] }>
}
interface ProfileResponse { user_id: number; version: number; dims: ProfileDims; updated_at?: string | null }
interface EvalHistoryItem { id: number; suggestions: string[]; created_at: string | null }
interface EvalHistoryResponse { count: number; items: EvalHistoryItem[] }
interface HomeData {
  profile: ProfileResponse | null; notes: NotesResponse; quizzes: QuizSession[]; evaluations: EvalHistoryItem[]
  sources: Record<"profile" | "notes" | "quizzes" | "evaluations" | "courses" | "rag", "loading" | "ok" | "error">
  lastSyncedAt: number
}

const EMPTY_HOME_DATA: HomeData = {
  profile: null, notes: { count: 0, items: [] }, quizzes: [], evaluations: [], lastSyncedAt: 0,
  sources: { profile: "loading", notes: "loading", quizzes: "loading", evaluations: "loading", courses: "loading", rag: "loading" },
}
const SOURCE_LABEL: Record<NoteSource, string> = { manual: "手动笔记", doc: "讲解摘录", quiz: "错题笔记", tutor: "助教摘录" }
const QUICK_LINKS = [
  { to: "/tutor", label: "问 AI 助教", detail: "继续追问当前难点", icon: MessageCircleMore },
  { to: "/notes", label: "智能笔记", detail: "回看学习沉淀", icon: NotebookPen },
  { to: "/quiz", label: "智能测验", detail: "用练习验证掌握", icon: BookOpenCheck },
  { to: "/report", label: "学习报告", detail: "查看阶段反馈", icon: BarChart3 },
] as const

function greetingForNow() {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 11) return "早上好"
  if (hour < 14) return "中午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}
function todayLabel() { return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()) }
function shortDate(value: string | null | undefined) {
  if (!value) return "时间未记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "时间未记录"
  if (date.toDateString() === new Date().toDateString()) return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}
function compactTopic(value: string | null | undefined, maxLength = 30) {
  const clean = (value || "").replace(/^错题\s*[：:]\s*/u, "").replace(/（[A-Za-z][^）]{0,40}）/gu, "").replace(/\([A-Za-z][^)]{0,40}\)/gu, "").replace(/\.{2,}/g, "…").replace(/\s+/g, " ").replace(/[.…]+$/u, "").trim()
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength).replace(/[.…]+$/u, "")}…`
}
function shanghaiDayKey(value: string | number | Date | null | undefined) {
  if (value == null) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  return year && month && day ? `${year}-${month}-${day}` : ""
}
function calculateProfileCompleteness(profile: ProfileResponse | null) {
  if (!profile) return 0
  const populated = [profile.dims.goals?.primary, profile.dims.goals?.target_topics?.length, profile.dims.weak_points?.topics?.length, profile.dims.pace?.hours_per_week, profile.dims.knowledge_base && Object.keys(profile.dims.knowledge_base).length, profile.dims.cognitive_style && Object.keys(profile.dims.cognitive_style).length, profile.dims.preference && Object.keys(profile.dims.preference).length].filter(Boolean).length
  return Math.round((populated / 7) * 100)
}
function formatTrackedDuration(minutes: number) {
  if (minutes <= 0) return "0 分钟"
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60); const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

export function Home() {
  useTrackPage("home")
  const course = useCurrentCourse(); const targetRole = useTargetRole(); const user = useCurrentUser(); const workspace = useWorkspaceStore()
  const [data, setData] = useState<HomeData>(EMPTY_HOME_DATA); const [loading, setLoading] = useState(true)
  const courseId = course?.id; const showcaseCourse = isShowcaseCourse(course); const targetRoleName = targetRole?.name || course?.name || ""; const hasTargetRole = Boolean(targetRole || course)
  useTutorContext({ page: "home", title: `今日学习 · 当前岗位：${targetRoleName || "未选"}` })

  useEffect(() => {
    // The shared shell historically hid its navigation while the removed universe was visible.
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("studymate:home-universe-visibility", { detail: { visible: false } })))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const userId = user?.user_id
    if (!userId || showcaseCourse) { setData(EMPTY_HOME_DATA); setLoading(false); return }
    let cancelled = false
    const courseFilter = courseId ? `&course_id=${courseId}` : ""
    const refresh = async () => {
      const [profileResult, notesResult, quizResult, evalResult, coursesResult, ragResult] = await Promise.allSettled([
        apiGet<ProfileResponse>(`/profile/${userId}`), apiGet<NotesResponse>(`/notes?user_id=${userId}${courseFilter}`),
        listQuizSessions({ user_id: userId, course_id: courseId, limit: 30 }), apiGet<EvalHistoryResponse>(`/eval/history/${userId}?limit=14`),
        apiGet<{ count: number }>("/courses"), apiGet<{ count: number }>("/rag/stats"),
      ])
      if (cancelled) return
      setData({
        profile: profileResult.status === "fulfilled" ? profileResult.value : null,
        notes: notesResult.status === "fulfilled" ? notesResult.value : { count: 0, items: [] },
        quizzes: quizResult.status === "fulfilled" ? quizResult.value : [],
        evaluations: evalResult.status === "fulfilled" ? evalResult.value.items : [], lastSyncedAt: Date.now(),
        sources: {
          profile: profileResult.status === "fulfilled" ? "ok" : "error", notes: notesResult.status === "fulfilled" ? "ok" : "error",
          quizzes: quizResult.status === "fulfilled" ? "ok" : "error", evaluations: evalResult.status === "fulfilled" ? "ok" : "error",
          courses: coursesResult.status === "fulfilled" ? "ok" : "error", rag: ragResult.status === "fulfilled" ? "ok" : "error",
        },
      })
      setLoading(false)
    }
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 30_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [courseId, showcaseCourse, user?.user_id])

  const weakTopics = data.profile?.dims.weak_points?.topics?.filter(Boolean) || []
  const targetTopics = data.profile?.dims.goals?.target_topics?.filter(Boolean) || []
  const profileGoal = data.profile?.dims.goals?.primary?.trim() || ""
  const readyQuizzes = data.quizzes.filter((quiz) => quiz.status === "ready"); const readyQuiz = readyQuizzes[0]
  const submittedQuizzes = data.quizzes.filter((quiz) => quiz.status === "submitted")
  const fallbackTopic = targetRole?.sampleTasks?.[0] || (course ? fallbackSamplesFor(course.name).topics[0] : "")
  const focusTopic = compactTopic(readyQuiz?.topic || weakTopics[0] || targetTopics[0] || fallbackTopic)
  const latestNote = data.notes.items[0]
  const latestSuggestion = data.evaluations[0]?.suggestions?.[0]
  const profileCompleteness = calculateProfileCompleteness(data.profile)
  const reportCapabilities = useMemo(() => buildRoleCapabilityProfile(targetRole, user?.user_id, workspace.outputs.training_plan, workspace.feedback?.accuracy), [targetRole, user?.user_id, workspace.outputs.training_plan, workspace.feedback?.accuracy])

  const todayKey = shanghaiDayKey(new Date())
  const todaySubmittedQuizzes = submittedQuizzes.filter((quiz) => shanghaiDayKey(quiz.submitted_at) === todayKey)
  const todayNotes = data.notes.items.filter((note) => shanghaiDayKey(note.updated_at || note.created_at) === todayKey)
  const todayEvaluations = data.evaluations.filter((evaluation) => shanghaiDayKey(evaluation.created_at) === todayKey)
  const workspaceStartedToday = shanghaiDayKey(workspace.learningStartedAt || workspace.startedAt) === todayKey
  const workspaceFinishedToday = workspace.status === "done" && shanghaiDayKey(workspace.finishedAt) === todayKey
  const workspaceMinutes = workspaceStartedToday ? Math.round(workspace.learningDurationMs / 60_000) : 0
  const quizMinutes = Math.round(todaySubmittedQuizzes.reduce((sum, quiz) => sum + Math.max(0, quiz.duration_ms || 0), 0) / 60_000)
  const todayMinutes = Math.max(workspaceMinutes, quizMinutes); const completedTasks = todaySubmittedQuizzes.length + (workspaceFinishedToday ? 1 : 0)
  const todayProgress = [todayNotes.length > 0, todaySubmittedQuizzes.length > 0, workspaceFinishedToday, todayEvaluations.length > 0].filter(Boolean).length * 25
  const failedSourceCount = Object.values(data.sources).filter((source) => source === "error").length

  const primaryAction = showcaseCourse ? { to: "/courses", label: "查看岗位目录" } : readyQuiz ? { to: `/quiz/${readyQuiz.id}`, label: "继续这份测验" } : hasTargetRole ? { to: "/competency", label: "开始今日岗位训练" } : { to: "/courses", label: "选择目标岗位" }
  const taskTitle = showcaseCourse ? `查看「${course?.name}」岗位目录` : readyQuiz ? `完成「${compactTopic(readyQuiz.topic, 34)}」测验` : hasTargetRole ? focusTopic ? `训练「${focusTopic}」` : `开始 ${targetRoleName} 岗位训练` : "先确定你的目标岗位"
  const recommendation = showcaseCourse ? "该岗位目前为目录预览，尚未接入专属训练知识库。" : readyQuiz ? `你有一份 ${readyQuiz.total_count} 道题的未完成测验，先续上最近的学习闭环。` : weakTopics[0] ? `“${weakTopics[0]}”来自你的薄弱能力画像，因此被放在今天最前面。` : targetTopics[0] ? `“${targetTopics[0]}”来自你在个人画像中设置的目标主题。` : hasTargetRole ? `任务依据当前目标岗位“${targetRoleName}”生成；完成后会按训练结果调整。` : "选择岗位后，系统才会用你的目标、笔记和测验记录安排任务。"
  const routeSteps = [
    { number: "01", label: "回看", title: latestNote?.title || "建立第一条笔记", hint: latestNote ? SOURCE_LABEL[latestNote.source] : "沉淀关键内容", to: "/notes", icon: NotebookPen, tone: "is-blue", active: Boolean(latestNote) },
    { number: "02", label: "理解", title: focusTopic || "选择今日任务", hint: focusTopic ? "围绕当前重点追问" : "先确定目标岗位", to: focusTopic ? "/tutor" : "/courses", icon: MessageCircleMore, tone: "is-coral", active: Boolean(focusTopic && !readyQuiz) },
    { number: "03", label: "检测", title: compactTopic(readyQuiz?.topic, 22) || "生成针对练习", hint: readyQuiz ? `${readyQuiz.total_count} 道题等待完成` : "确认是否真正掌握", to: readyQuiz ? `/quiz/${readyQuiz.id}` : "/quiz", icon: BookOpenCheck, tone: "is-green", active: Boolean(readyQuiz) },
    { number: "04", label: "调整", title: "更新下一步", hint: latestSuggestion ? compactTopic(latestSuggestion, 24) : "依据表现修正路线", to: "/report", icon: BarChart3, tone: "is-purple", active: Boolean(latestSuggestion) },
  ]

  const recentActivities = useMemo(() => {
    const notes = data.notes.items.slice(0, 3).map((note) => ({ key: `note-${note.id}`, to: "/notes", title: note.title || "未命名笔记", meta: SOURCE_LABEL[note.source], date: note.updated_at || note.created_at, icon: FileText }))
    const quizzes = data.quizzes.slice(0, 3).map((quiz) => ({ key: `quiz-${quiz.id}`, to: quiz.status === "ready" || quiz.status === "submitted" ? `/quiz/${quiz.id}` : "/quiz", title: quiz.topic || "未命名测验", meta: quiz.status === "submitted" ? `已完成 · ${Math.round(quiz.score)} 分` : quiz.status === "ready" ? `${quiz.total_count} 道题待完成` : "测验记录", date: quiz.submitted_at || quiz.created_at, icon: BookOpenCheck }))
    return [...notes, ...quizzes].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 3)
  }, [data.notes.items, data.quizzes])
  const masteredCapabilities = reportCapabilities.filter((item) => item.state === "mastered").length
  const activeCapabilities = reportCapabilities.filter((item) => item.state === "current" || item.state === "developing").length
  const matchEvidence = [workspace.feedback?.accuracy != null ? `最近训练准确率 ${Math.round(workspace.feedback.accuracy)}%` : "", workspace.outputs.training_plan?.priority_competencies?.[0] ? `优先能力：${workspace.outputs.training_plan.priority_competencies[0]}` : "", latestSuggestion ? compactTopic(latestSuggestion, 42) : ""].filter(Boolean)

  return (
    <div className="app-page paper-theme home-today-page" data-testid="today-learning-home">
      <AppTopbar current="home" appearance="paper" />
      <main className="home-today-main">
        <header className="home-today-heading">
          <div><p className="home-today-eyebrow">今日学习</p><h1>{greetingForNow()}，{user?.name || "同学"}</h1><p>先完成最重要的一件事，再决定下一步。</p></div>
          <div className="home-today-context" aria-label="今天的日期"><span><CalendarDays />{todayLabel()}</span></div>
        </header>

        {showcaseCourse && <aside className="home-notice" aria-label="岗位目录预览"><Library /><span><b>当前岗位仅支持目录预览</b>，训练能力尚未开放。</span><Link to="/courses">浏览其他岗位 <ArrowRight /></Link></aside>}

        <section className="home-focus-grid" aria-label="今日核心任务">
          <article className="home-focus-card">
            <div className="home-focus-copy"><div className="home-focus-label"><span />今日最重要任务</div>
              {loading ? <div className="home-focus-loading" aria-label="正在读取今日任务"><i /><i /><i /></div> : <><p className="home-current-role">当前目标岗位 · <strong>{targetRoleName || "待选择"}</strong></p><h2>{taskTitle}</h2><div className="home-recommendation" data-testid="recommendation-reason"><Sparkles /><div><b>为什么推荐这个任务</b><p>{recommendation}</p></div></div>{hasTargetRole && !showcaseCourse && <p className="home-next-step"><Route /><b>完成后</b>：在学习报告中复盘，阶段评估会更新画像与下一项推荐。</p>}</>}
            </div>
            <div className="home-focus-action"><Link to={primaryAction.to} data-testid="home-primary-cta">{primaryAction.label}<ArrowRight /></Link><span>{readyQuiz ? "继续已有任务，不会创建重复测验" : hasTargetRole ? "进入岗位训练中心" : "约 1 分钟完成选择"}</span></div>
          </article>
          <aside className="home-progress-card" aria-label="今日实际进度">
            <div className="home-card-title"><span><Clock3 />实际进度</span><b>{todayProgress}%</b></div><div className="home-progress-track" aria-label={`今日学习进度 ${todayProgress}%`}><i style={{ width: `${todayProgress}%` }} /></div>
            <div className="home-progress-metrics"><div><strong>{loading ? "—" : formatTrackedDuration(todayMinutes)}</strong><span>已记录时长</span></div><div><strong>{loading ? "—" : `${completedTasks} 项`}</strong><span>已完成任务</span></div></div>
            <ul><li className={todayNotes.length ? "is-done" : ""}><CheckCircle2 />留下学习笔记</li><li className={todaySubmittedQuizzes.length ? "is-done" : ""}><CheckCircle2 />完成一次测验</li><li className={workspaceFinishedToday ? "is-done" : ""}><CheckCircle2 />完成岗位训练</li><li className={todayEvaluations.length ? "is-done" : ""}><CheckCircle2 />生成阶段评估</li></ul>
            {!loading && failedSourceCount > 0 && <p className="home-data-warning"><CircleAlert />{failedSourceCount} 项数据暂未同步，当前进度仅按已读取记录计算。</p>}
          </aside>
        </section>

        <section className="home-path-card" aria-label="今日学习闭环">
          <div className="home-section-heading home-path-heading">
            <div><span>今日学习闭环</span><h2>沿着上次进度继续</h2></div>
            <p>回看、理解、检测、调整，每一步都连接真实学习记录。</p>
          </div>
          <div className="home-path-list">
            {routeSteps.map(({ number, label, title, hint, to, icon: Icon, tone, active }) => (
              <Link key={number} to={to} className={`home-path-step ${tone}${active ? " is-active" : ""}`}>
                <span className="home-path-index">{active ? "下一步" : number}</span>
                <span className="home-path-icon"><Icon /></span>
                <span className="home-path-copy"><small>{label}</small><b>{title}</b><em>{hint}</em></span>
                <ArrowRight className="home-path-arrow" />
              </Link>
            ))}
          </div>
        </section>

        <section className="home-summary-grid" aria-label="个人学习摘要">
          <article className="home-summary-card is-capability"><div className="home-summary-icon"><UserRoundSearch /></div><div className="home-summary-content"><div className="home-summary-title"><span>岗位能力画像</span><Link to="/capability-profile">查看完整图谱 <ArrowRight /></Link></div>{loading ? <p>正在同步能力证据…</p> : reportCapabilities.length ? <><h3>{targetRoleName} · {reportCapabilities.length} 个能力节点</h3><div className="home-summary-stats"><span><b>{masteredCapabilities}</b> 已达标</span><span><b>{activeCapabilities}</b> 正在提升</span><span><b>{Math.max(0, reportCapabilities.length - masteredCapabilities - activeCapabilities)}</b> 待训练</span></div></> : <><h3>尚未生成岗位能力图谱</h3><p>选择目标岗位后，将根据真实训练证据更新能力状态。</p></>}</div></article>
          <article className="home-summary-card is-match"><div className="home-summary-icon is-green"><Route /></div><div className="home-summary-content"><div className="home-summary-title"><span>个人匹配报告</span><Link to="/learner-report">查看完整报告 <ArrowRight /></Link></div>{loading ? <p>正在同步画像与训练记录…</p> : <><h3>{profileGoal || (targetRoleName ? `目标：${targetRoleName}` : "等待建立个人目标")}</h3><p>{matchEvidence[0] || (profileCompleteness ? `画像完整度 ${profileCompleteness}% · 当前 v${data.profile?.version}` : "完成画像和首次训练后，会在这里显示真实匹配依据。")}</p>{matchEvidence.length > 1 && <span className="home-summary-note">{matchEvidence[1]}</span>}</>}</div></article>
        </section>

        <section className="home-lower-grid">
          <article className="home-recent-card"><div className="home-section-heading"><div><span>最近学习</span><h2>接着上次继续</h2></div><Link to="/notes">全部记录 <ArrowRight /></Link></div>{loading ? <p className="home-empty-copy">正在读取最近学习记录…</p> : recentActivities.length ? <div className="home-recent-list">{recentActivities.map(({ key, to, title, meta, date, icon: Icon }) => <Link key={key} to={to}><span><Icon /></span><div><b>{title}</b><small>{meta} · {shortDate(date)}</small></div><ChevronRight /></Link>)}</div> : <div className="home-empty-state"><BookOpenCheck /><div><b>还没有学习记录</b><p>完成第一项任务后，笔记和测验会出现在这里。</p></div></div>}</article>
          <aside className="home-quick-card"><div className="home-section-heading"><div><span>按需使用</span><h2>学习工具</h2></div></div><nav aria-label="学习工具">{QUICK_LINKS.map(({ to, label, detail, icon: Icon }) => <Link key={to} to={to}><Icon /><span><b>{label}</b><small>{detail}</small></span><ChevronRight /></Link>)}</nav></aside>
        </section>
        <footer className="home-today-footer"><span><ShieldCheck />学习数据仅用于生成你的个性化路线</span>{data.lastSyncedAt > 0 && <span>最近同步 {new Date(data.lastSyncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>}</footer>
      </main>
    </div>
  )
}
