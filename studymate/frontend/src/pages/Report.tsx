/**
 * 学习报告页 `/report`
 *
 * 数据流：
 *   workspaceStore (主题/答题/资源消耗/学习时长) ─┐
 *   POST /api/eval/run ──────────────────────── ├─→ 渲染报告
 *   GET /api/profile/snapshots/:uid ─────────── ┘
 *
 * 用户在「应用到画像」时调 POST /api/profile/apply-delta，version+1，
 * 形成「资源生成 → 答题 → 评估 → 画像回写」闭环。
 *
 * 导出 PDF 用 html2canvas + jsPDF（纯前端，无后端依赖）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart3, Sparkles, Loader2, Download, CheckCircle2, AlertTriangle,
  Clock, Target, TrendingUp, TrendingDown, RefreshCw, BookOpen, ArrowRight,
  LineChart as LineChartIcon, History, ArrowLeft, X, ShieldCheck, Layers3,
} from "lucide-react"
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  LineChart, Line,
} from "recharts"
import { AppTopbar } from "@/components/AppTopbar"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/Markdown"
import { ProfileMiniCard, type ProfileMiniData } from "@/components/ProfileMiniCard"
import { CareerRecommendations } from "@/components/CareerRecommendations"
import { apiGet, apiPost } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useWorkspaceStore } from "@/store/workspace"
import { useCurrentUser } from "@/store/user"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

interface EvalScores {
  overall_correct_rate: number
  by_topic: Record<string, { correct: number; total: number; rate: number }>
  by_topic_difficulty?: Record<string, Record<string, { correct: number; total: number; rate: number }>>
  total_attempts: number
  total_correct: number
  engagement_score: number
  answer_completion?: { answered: number; total: number; rate: number | null }
  resource_coverage?: { consumed: number; available: number; rate: number | null }
  engagement_breakdown?: {
    time_spent_min: number
    time_score: number
    resource_types: number
    resource_variety_score: number
  }
}

interface ProfileDelta {
  knowledge_base?: Record<string, number>
  preference?: Record<string, number>
  employment_skills?: Record<string, number>
  weak_points?: { topics: string[]; error_types: string[] }
}

interface EvalReport {
  user_id: number
  profile_version: number
  current_dims: ProfileMiniData["dims"]
  projected_dims?: ProfileMiniData["dims"]
  scores: EvalScores
  profile_delta: ProfileDelta
  suggestions: string[]
  next_topics: string[]
  summary_markdown: string
  generated_at?: string
  evidence?: EvalEvidence
}

interface EvalEvidence {
  course_id: number | null
  course_name: string | null
  topic: string
  quiz_count: number
  time_spent_min: number
  resources_consumed: string[]
  resources_available?: string[]
  topics_studied: string[]
}

interface Snapshot {
  id: number
  snapshot: ProfileMiniData["dims"]
  trigger_event: string | null
  created_at: string | null
}

interface EvalHistoryItem {
  id: number
  scores: EvalScores
  suggestions: string[]
  created_at: string | null
}

interface AppliedKeys {
  knowledge_base: string[]
  preference: string[]
  employment_skills: string[]
  weak_points: boolean
}

type ReportErrorAction = "initial" | "eval" | "apply" | "export"
type ReportNotice = { tone: "success" | "info"; message: string }

interface EvalRequestBody {
  user_id: number
  course_id: number | null
  quiz_results: Array<{
    question: string
    user_answer: string
    correct_answer: string
    is_correct: boolean
    topic: string
    difficulty: number
  }>
  engagement: {
    topics_studied: string[]
    time_spent_min: number
    resources_consumed: string[]
    resources_available: string[]
  }
  persist: boolean
}

// 模块级任务不会随 Report 页面卸载而销毁，保证切换路由后评估仍继续。
const activeEvalTasks = new Map<number, Promise<EvalReport>>()
const activeEvalStartedAt = new Map<number, number>()
const completedEvalReports = new Map<number, EvalReport>()
const EVAL_CACHE_PREFIX = "sm:eval-report:"

function readCachedReport(userId: number): EvalReport | null {
  if (!userId || typeof window === "undefined") return null
  const memoryReport = completedEvalReports.get(userId)
  if (memoryReport) return memoryReport
  try {
    const raw = window.localStorage.getItem(`${EVAL_CACHE_PREFIX}${userId}`)
    return raw ? JSON.parse(raw) as EvalReport : null
  } catch {
    return null
  }
}

function cacheReport(report: EvalReport) {
  completedEvalReports.set(report.user_id, report)
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${EVAL_CACHE_PREFIX}${report.user_id}`, JSON.stringify(report))
  } catch {
    // 存储空间受限时仍保留当前内存中的报告，不影响本次使用。
  }
}

function runPersistentEval(
  userId: number,
  body: EvalRequestBody,
  context: { courseName: string | null; topic: string },
): Promise<EvalReport> {
  const running = activeEvalTasks.get(userId)
  if (running) return running

  activeEvalStartedAt.set(userId, Date.now())
  const task = apiPost<EvalReport>("/eval/run", body)
    .then((nextReport) => {
      const enrichedReport: EvalReport = {
        ...nextReport,
        generated_at: new Date().toISOString(),
        evidence: {
          course_id: body.course_id,
          course_name: context.courseName,
          topic: context.topic,
          quiz_count: body.quiz_results.length,
          time_spent_min: body.engagement.time_spent_min,
          resources_consumed: [...body.engagement.resources_consumed],
          resources_available: [...body.engagement.resources_available],
          topics_studied: [...body.engagement.topics_studied],
        },
      }
      cacheReport(enrichedReport)
      return enrichedReport
    })
    .finally(() => {
      activeEvalTasks.delete(userId)
      activeEvalStartedAt.delete(userId)
    })
  activeEvalTasks.set(userId, task)
  return task
}

const DIM_LABEL: Record<string, string> = {
  math: "数学", programming: "编程", cs_foundation: "计算机基础", data_sql: "数据与SQL",
  subject_prior: "领域先验", ml_prior: "ML 先验",  // ml_prior 兼容旧画像
  statistics: "统计", english: "英语",  // 旧维度，兼容历史快照
  practice_first: "实践优先", stepwise: "循序渐进", challenge_seeking: "挑战导向", reflective: "复盘总结",
  visual: "视觉", hands_on: "实操", auditory: "听觉",  // 旧维度，兼容历史快照
  document: "文档", mindmap: "导图", quiz: "题目", code: "代码", video: "视频", reading: "阅读",
  algorithms: "算法建模", data_ai: "数据AI", systems: "系统网络", engineering: "工程实践", professional: "职业素养",
}

const RESOURCE_LABEL: Record<string, string> = {
  doc: "讲解文档", mindmap: "思维导图", quiz: "智能题目", reading: "拓展阅读",
  code: "代码案例", path: "学习路径", concept: "可视讲解", note: "学习笔记", video: "视频",
}

function formatReportTime(value?: string | number | null) {
  if (!value) return "时间未记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "时间未记录"
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function Report() {
  useTrackPage("report")
  const ws = useWorkspaceStore()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const USER_ID = user?.user_id ?? 0
  const reportRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const autoEvalMilestoneRef = useRef("")

  const [profile, setProfile] = useState<ProfileMiniData | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [evalHistory, setEvalHistory] = useState<EvalHistoryItem[]>([])
  const [report, setReport] = useState<EvalReport | null>(() => readCachedReport(USER_ID))
  const [loading, setLoading] = useState(() => activeEvalTasks.has(USER_ID))
  const [applying, setApplying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [applied, setApplied] = useState(false)
  const [appliedChanged, setAppliedChanged] = useState<boolean | null>(null)
  const [appliedKeys, setAppliedKeys] = useState<AppliedKeys | null>(null)
  const [highlightProfile, setHighlightProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<ReportErrorAction | null>(null)
  const [notice, setNotice] = useState<ReportNotice | null>(null)
  const [evalStartedAt, setEvalStartedAt] = useState<number | null>(() => activeEvalStartedAt.get(USER_ID) ?? null)

  const showNotice = useCallback((message: string, tone: ReportNotice["tone"] = "success") => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    setNotice({ message, tone })
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 4200)
  }, [])

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [])

  const quizAttempts = useMemo(() => Object.values(ws.quizAttempts), [ws.quizAttempts])

  useTutorContext({
    page: "report",
    title: `学习报告${report?.scores ? ` · 正确率 ${Math.round((report.scores.overall_correct_rate ?? 0) * 100)}%` : ""}`,
    snippet: report?.summary_markdown?.slice(0, 600),
  })
  const resourcesConsumed = useMemo(() => {
    return Object.entries(ws.resourcesConsumed)
      .sort((a, b) => a[1] - b[1])
      .map(([resource]) => resource)
  }, [ws.resourcesConsumed])

  const generatedResourceCount = useMemo(() => [
    Boolean(ws.outputs.doc?.content),
    Boolean(ws.outputs.mindmap?.content),
    Boolean(ws.outputs.quiz?.items?.length),
    Boolean(ws.outputs.reading?.items?.length),
    Boolean(ws.outputs.code?.code),
    Boolean(ws.outputs.guide?.content),
    Boolean(ws.outputs.video?.script),
  ].filter(Boolean).length, [ws.outputs])

  const availableResources = useMemo(() => [
    ws.outputs.doc?.content ? "doc" : null,
    ws.outputs.mindmap?.content ? "mindmap" : null,
    ws.outputs.quiz?.items?.length ? "quiz" : null,
    ws.outputs.reading?.items?.length ? "reading" : null,
    ws.outputs.code?.code ? "code" : null,
    ws.outputs.guide?.content ? "guide" : null,
    ws.outputs.video?.script ? "video" : null,
    ws.topic ? "concept" : null,
  ].filter((resource): resource is string => Boolean(resource)), [ws.outputs, ws.topic])

  const topicsStudied = useMemo(() => [...new Set([
    ws.topic,
    ...quizAttempts.map((attempt) => attempt.topic),
  ].filter(Boolean))], [quizAttempts, ws.topic])

  const evidenceCourseId = ws.courseId ?? course?.id ?? null
  const evidenceCourseName = ws.targetRole || targetRole?.name || ws.courseName || course?.name || null

  const timeSpentMin = useMemo(() => {
    if (!resourcesConsumed.length && !quizAttempts.length) return 0
    return Math.max(1, Math.round(ws.learningDurationMs / 60000))
  }, [quizAttempts.length, resourcesConsumed.length, ws.learningDurationMs])

  const fetchInitial = useCallback(async () => {
    if (!USER_ID) return
    const [profileResult, snapshotsResult, historyResult] = await Promise.allSettled([
      apiGet<ProfileMiniData>(`/profile/${USER_ID}`),
      apiGet<{ items: Snapshot[] }>(`/profile/snapshots/${USER_ID}?limit=5`),
      apiGet<{ items: EvalHistoryItem[] }>(`/eval/history/${USER_ID}?limit=10`),
    ])
    const failed: string[] = []
    if (profileResult.status === "fulfilled") setProfile(profileResult.value)
    else failed.push("当前画像")
    if (snapshotsResult.status === "fulfilled") setSnapshots(snapshotsResult.value.items || [])
    else failed.push("画像快照")
    if (historyResult.status === "fulfilled") setEvalHistory(historyResult.value.items || [])
    else failed.push("评估历史")

    setReport((current) => {
      const cached = current ?? readCachedReport(USER_ID)
      if (cached) return cached
      if (profileResult.status !== "fulfilled" || historyResult.status !== "fulfilled") return null
      const latest = historyResult.value.items?.[0]
      if (!latest) return null
      return {
        user_id: USER_ID,
        profile_version: profileResult.value.version,
        current_dims: profileResult.value.dims,
        projected_dims: profileResult.value.dims,
        scores: latest.scores,
        profile_delta: {},
        suggestions: latest.suggestions || [],
        next_topics: [],
        summary_markdown: "这是最近一次阶段评估的实时数据快照。完成新的测验或一轮资源学习后，因材智训会在关键里程碑更新阶段总结。",
        generated_at: latest.created_at || undefined,
        evidence: {
          course_id: evidenceCourseId,
          course_name: evidenceCourseName,
          topic: ws.topic,
          quiz_count: latest.scores?.total_attempts || 0,
          time_spent_min: timeSpentMin,
          resources_consumed: [...resourcesConsumed],
          resources_available: [...availableResources],
          topics_studied: [...topicsStudied],
        },
      }
    })
    if (failed.length > 0) {
      setError(`${failed.join("、")}加载失败，其他报告内容仍可继续使用。`)
      setErrorAction("initial")
    } else {
      setError(null)
      setErrorAction(null)
    }
  }, [USER_ID, availableResources, evidenceCourseId, evidenceCourseName, resourcesConsumed, timeSpentMin, topicsStudied, ws.topic])

  useEffect(() => {
    // 页面进入时同步远端画像与历史；函数内部的状态更新均发生在请求完成后。
    void fetchInitial()
  }, [fetchInitial])

  // 报告主体短轮询刷新真实事件、画像和历史；不会因此重复调用 AI 阶段总结。
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchInitial()
    }, 25_000)
    return () => window.clearInterval(timer)
  }, [fetchInitial])

  // 用户在生成期间离开再返回时，重新订阅同一个模块级任务，而不是重新发起评估。
  useEffect(() => {
    const task = activeEvalTasks.get(USER_ID)
    if (!task) return
    let active = true
    task
      .then((nextReport) => {
        if (!active) return
        setReport(nextReport)
        setError(null)
      })
      .catch((e) => {
        if (active) {
          setError(`评估失败：${String(e)}`)
          setErrorAction("eval")
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [USER_ID])

  const runEval = useCallback(async () => {
    if (!USER_ID || ws.status === "running") return
    setLoading(true)
    setError(null)
    setErrorAction(null)
    setApplied(false)
    setAppliedChanged(null)
    setAppliedKeys(null)
    setHighlightProfile(false)
    try {
      const body: EvalRequestBody = {
        user_id: USER_ID,
        course_id: evidenceCourseId,
        quiz_results: quizAttempts.map((q) => ({
          question: q.question,
          user_answer: q.user_answer,
          correct_answer: q.correct_answer,
          is_correct: q.is_correct,
          topic: q.topic,
          difficulty: q.difficulty,
        })),
        engagement: {
          topics_studied: topicsStudied,
          time_spent_min: timeSpentMin,
          resources_consumed: resourcesConsumed,
          resources_available: availableResources,
        },
        persist: true,
      }
      const task = runPersistentEval(USER_ID, body, {
        courseName: evidenceCourseName,
        topic: ws.topic,
      })
      setEvalStartedAt(activeEvalStartedAt.get(USER_ID) ?? null)
      const r = await task
      setReport(r)
      showNotice("新的学习报告已生成，证据与画像建议已经更新")
      // 把刚刚 persist 的新评估带进折线图
      try {
        const hist = await apiGet<{ items: EvalHistoryItem[] }>(`/eval/history/${USER_ID}?limit=10`)
        setEvalHistory(hist.items || [])
      } catch { /* 折线图非阻塞，失败忽略 */ }
    } catch (e) {
      setError(`评估失败：${String(e)}`)
      setErrorAction("eval")
    } finally {
      setLoading(false)
    }
  }, [quizAttempts, ws.topic, ws.status, timeSpentMin, resourcesConsumed, availableResources, topicsStudied, USER_ID, evidenceCourseId, evidenceCourseName, showNotice])

  const applyToProfile = useCallback(async () => {
    if (!report?.profile_delta) return
    if (profile && profile.version !== report.profile_version) {
      setError(`该报告基于画像 v${report.profile_version}，当前已是 v${profile.version}。请重新评估后再回写，避免重复覆盖。`)
      setErrorAction("apply")
      return
    }
    setApplying(true)
    setError(null)
    setErrorAction(null)
    try {
      const result = await apiPost<{
        version: number
        changed: boolean
        changed_fields: string[]
        applied_delta: ProfileDelta
      }>("/profile/apply-delta", {
        user_id: USER_ID,
        profile_delta: report.profile_delta,
        trigger: "eval_apply",
        source_version: report.profile_version,
      })
      const fields = new Set(result.changed_fields || [])
      const keys: AppliedKeys = {
        knowledge_base: [...fields].filter((field) => field.startsWith("knowledge_base.")).map((field) => field.split(".")[1]),
        preference: [...fields].filter((field) => field.startsWith("preference.")).map((field) => field.split(".")[1]),
        employment_skills: [...fields].filter((field) => field.startsWith("employment_skills.")).map((field) => field.split(".")[1]),
        weak_points: [...fields].some((field) => field.startsWith("weak_points.")),
      }
      // 重新拉画像和快照
      await fetchInitial()
      setApplied(true)
      setAppliedChanged(result.changed)
      setAppliedKeys(keys)
      if (result.changed) {
        setHighlightProfile(true)
        showNotice(`画像已安全更新到 v${result.version}，旧版本快照已保留`)
        // 2.4s 后撤掉画像 ring，但 DeltaBlock 上的 ✓ 保持
        window.setTimeout(() => setHighlightProfile(false), 2400)
      } else {
        showNotice(`建议未造成实际变化，画像仍为 v${result.version}`, "info")
      }
    } catch (e) {
      setError(`应用 delta 失败：${String(e)}`)
      setErrorAction("apply")
    } finally {
      setApplying(false)
    }
  }, [report, profile, fetchInitial, USER_ID, showNotice])

  const exportPDF = useCallback(async () => {
    if (!reportRef.current) return
    setExporting(true)
    setError(null)
    setErrorAction(null)
    try {
      // 仅在用户真正导出时下载截图与 PDF 引擎，避免打开报告页就阻塞大体积依赖。
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ])
      // html2canvas 抓 DOM 截图（背景白色，避免暗色主题黑底 PDF）
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW - 20  // 10mm 边距
      const imgH = (canvas.height * imgW) / canvas.width
      let heightLeft = imgH
      let position = 10
      pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
      heightLeft -= pageH - 20
      while (heightLeft > 0) {
        position = heightLeft - imgH + 10
        pdf.addPage()
        pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
        heightLeft -= pageH - 20
      }
      const fname = `因材智训-学习报告-${ws.topic || "未命名"}-${new Date().toISOString().slice(0, 10)}.pdf`
      pdf.save(fname)
      showNotice("学习报告 PDF 已导出")
    } catch (e) {
      setError(`导出 PDF 失败：${String(e)}`)
      setErrorAction("export")
    } finally {
      setExporting(false)
    }
  }, [ws.topic, showNotice])

  // 雷达对比数据：报告生成时的画像 vs 使用同一后端规则算出的建议应用后画像。
  const radarData = useMemo(() => {
    if (!report) return null
    const before = report.current_dims
    const projected = report.projected_dims || report.current_dims
    const build = (dimKey: "knowledge_base" | "preference" | "employment_skills") => {
      const beforeValues = (before[dimKey] || {}) as Record<string, number>
      const projectedValues = (projected[dimKey] || {}) as Record<string, number>
      const keys = [...new Set([...Object.keys(beforeValues), ...Object.keys(projectedValues)])]
      return keys.map((k) => ({
        dim: DIM_LABEL[k] || k,
        before: beforeValues[k] ?? 0,
        projected: projectedValues[k] ?? beforeValues[k] ?? 0,
      }))
    }
    return {
      knowledge: build("knowledge_base"),
      preference: build("preference"),
      employment: build("employment_skills"),
      hasProjection: Boolean(report.projected_dims),
    }
  }, [report])

  // 评估趋势折线（多次评估对比）：oldest → newest
  const trendData = useMemo(() => {
    if (evalHistory.length === 0) return []
    return [...evalHistory].reverse().map((it, idx) => {
      const ts = it.created_at ? new Date(it.created_at) : null
      const label = ts
        ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`
        : `#${idx + 1}`
      return {
        label,
        idx: idx + 1,
        correctRate: (it.scores?.total_attempts ?? 0) > 0
          ? Math.round((it.scores?.overall_correct_rate ?? 0) * 100)
          : null,
        engagement: Math.round(it.scores?.engagement_score ?? 0),
        attempts: it.scores?.total_attempts ?? 0,
      }
    })
  }, [evalHistory])

  // 主题正确率柱状图
  const topicBarData = useMemo(() => {
    if (!report?.scores?.by_topic) return []
    return Object.entries(report.scores.by_topic).map(([topic, v]) => ({
      topic: topic.length > 8 ? topic.slice(0, 8) + "…" : topic,
      rate: Math.round((v.rate || 0) * 100),
      correct: v.correct,
      total: v.total,
    }))
  }, [report])

  const topicDifficultyData = useMemo(() => report?.scores?.by_topic_difficulty || {}, [report])
  const hasTopicDifficultyData = Object.values(topicDifficultyData).some((difficultyMap) => Object.keys(difficultyMap).length > 0)

  const correctTotal = report?.scores
    ? { correct: report.scores.total_correct, total: report.scores.total_attempts }
    : { correct: quizAttempts.filter((q) => q.is_correct).length, total: quizAttempts.length }

  const hasEvalData = quizAttempts.length > 0 || resourcesConsumed.length > 0
  const workspaceGenerating = ws.status === "running"
  const canRunEval = hasEvalData && !workspaceGenerating
  const reportStale = Boolean(report && profile && profile.version !== report.profile_version)
  const reportEvidence = report?.evidence
  const reportAttemptCount = report?.scores?.total_attempts ?? 0

  // 仅在“完成测验 / 完成一轮资源学习”这一关键里程碑自动评估一次。
  useEffect(() => {
    if (!canRunEval || report || loading) return
    const milestone = `${USER_ID}:${quizAttempts.length}:${resourcesConsumed.length}:${ws.finishedAt}`
    if (autoEvalMilestoneRef.current === milestone) return
    autoEvalMilestoneRef.current = milestone
    void runEval()
  }, [USER_ID, canRunEval, loading, quizAttempts.length, report, resourcesConsumed.length, runEval, ws.finishedAt])

  const retryError = () => {
    const action = errorAction
    setError(null)
    if (action === "initial") void fetchInitial()
    else if (action === "eval") void runEval()
    else if (action === "apply" && !reportStale) void applyToProfile()
    else if (action === "export") void exportPDF()
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="report" appearance="paper" />
        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><BarChart3 className="size-4" /></span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-[#18232D]">因材智训学习报告</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">{ws.topic ? `围绕《${ws.topic}》分析掌握程度、训练投入与下一轮路径` : "汇总答题、资源使用与岗位能力画像，形成可以行动的胜任力反馈"}</p>
              </div>
            </div>
            <div className="nav-scroll flex w-full items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto sm:overflow-visible sm:pb-0">
              <button type="button" aria-label="重新生成阶段总结" title={workspaceGenerating ? "资源包仍在生成，完成后将自动开放评估" : !hasEvalData ? "完成资源学习或测验后即可评估" : undefined} onClick={runEval} disabled={loading || !canRunEval} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#59636B] transition-colors hover:bg-[#E9EEE6] hover:text-[#315E83] disabled:cursor-not-allowed disabled:opacity-45">
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{loading ? "阶段总结更新中" : "重新生成阶段总结"}
              </button>
              <button type="button" aria-label="导出学习报告 PDF" onClick={exportPDF} disabled={!report || exporting} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[11px] font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50] disabled:cursor-not-allowed disabled:opacity-40">
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}导出 PDF
              </button>
            </div>
          </header>
          <div className="p-4 sm:p-5">

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] p-3 text-sm text-[#9A4E35]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1 leading-5">{error}</span>
            {errorAction && !(errorAction === "apply" && reportStale) && (
              <button type="button" onClick={retryError} className="h-7 shrink-0 rounded-lg border border-[#D6BBAF] bg-[#FFFEFA] px-2.5 text-[11px] font-bold transition-colors hover:bg-[#F8F1EC]">重试</button>
            )}
            <button type="button" aria-label="关闭错误提示" onClick={() => { setError(null); setErrorAction(null) }} className="grid size-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[#EBDAD1]"><X className="size-3.5" /></button>
          </div>
        )}

        <AnimatePresence>
          {notice && (
            <motion.div role="status" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${notice.tone === "success" ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"}`}>
              {notice.tone === "success" ? <CheckCircle2 className="size-3.5 shrink-0" /> : <ShieldCheck className="size-3.5 shrink-0" />}
              <span className="min-w-0 flex-1">{notice.message}</span>
              <button type="button" aria-label="关闭操作提示" onClick={() => setNotice(null)} className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5"><X className="size-3.5" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {workspaceGenerating && !report && (
          <WorkspaceGenerationState resourceCount={generatedResourceCount} />
        )}

        {!workspaceGenerating && !hasEvalData && !report && (
          evalHistory.length > 0 ? (
            <div className="space-y-4">
              <ReportHistoryLanding items={evalHistory} />
              {trendData.length >= 2 && <TrendLineCard data={trendData} />}
            </div>
          ) : <EmptyState courseName={targetRole?.name || course?.name} />
        )}

        {canRunEval && !report && !loading && (
          <div className="rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] p-8 text-center shadow-[0_10px_28px_rgba(24,35,45,.045)]">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><Sparkles className="size-5" /></span>
            <h2 className="mb-1 text-lg font-bold text-[#18232D]">学习数据已就绪，可以生成本次报告</h2>
            <p className="mb-4 text-sm text-[#66717B]">
              {quizAttempts.length} 题已答 · {resourcesConsumed.length} 类真实学习证据 · 本次有效学习约 {timeSpentMin} 分钟
            </p>
            <Button onClick={runEval} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              开始评估
            </Button>
          </div>
        )}

        {loading && !report && (
          <ReportGeneratingState
            startedAt={evalStartedAt}
            quizCount={quizAttempts.length}
            resourceCount={resourcesConsumed.length}
          />
        )}

        {loading && report && (
          <ReportRefreshBanner startedAt={evalStartedAt} />
        )}

        {workspaceGenerating && report && (
          <WorkspaceGenerationBanner resourceCount={generatedResourceCount} />
        )}

        {report && (
          <div ref={reportRef} className="space-y-4 bg-[#FFFEFA] pb-2">
            <ReportEvidenceStrip
              evidence={reportEvidence}
              generatedAt={report.generated_at}
              profileVersion={report.profile_version}
              currentProfileVersion={profile?.version ?? null}
            />

            {/* 顶部统计卡 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<Target className="size-4" />}
                color="emerald"
                label="掌握度证据"
                value={reportAttemptCount > 0 ? `${Math.round(report.scores.overall_correct_rate * 100)}%` : "待测验"}
                hint={reportAttemptCount > 0 ? `${correctTotal.correct} / ${correctTotal.total} 题` : "本报告未包含答题，不计为 0%"}
              />
              <StatCard
                icon={<TrendingUp className="size-4" />}
                color="indigo"
                label="参与度"
                value={`${report.scores.engagement_score}`}
                hint="满分 100"
              />
              <StatCard
                icon={<Clock className="size-4" />}
                color="amber"
                label="学习证据"
                value={reportEvidence ? `${reportEvidence.quiz_count + reportEvidence.resources_consumed.length} 项` : "已归档"}
                hint={reportEvidence ? `${reportEvidence.time_spent_min} 分钟 · ${reportEvidence.resources_consumed.length} 类资源` : "旧版报告未记录投入快照"}
              />
              <StatCard
                icon={<BookOpen className="size-4" />}
                color="rose"
                label="画像依据"
                value={`v${report.profile_version}`}
                hint={reportStale ? `当前已更新至 v${profile?.version}` : snapshots.length > 0 ? `历史 ${snapshots.length} 版` : "当前版本"}
              />
            </div>

            <AchievementBreakdownCard scores={report.scores} evidence={reportEvidence} />

            {/* 双雷达对比 */}
            {radarData && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <RadarCompareCard
                  title="知识基础对比"
                  data={radarData.knowledge}
                  color="#315E83"
                  hasProjection={radarData.hasProjection}
                />
                <RadarCompareCard
                  title="资源偏好对比"
                  data={radarData.preference}
                  color="#6F8A69"
                  hasProjection={radarData.hasProjection}
                />
                <RadarCompareCard
                  title="就业技能对比"
                  data={radarData.employment}
                  color="#7E6B83"
                  hasProjection={radarData.hasProjection}
                />
              </div>
            )}

            {/* 新报告显示主题×难度热力图；旧报告继续使用原柱状图。 */}
            {hasTopicDifficultyData ? (
              <TopicDifficultyHeatmap data={topicDifficultyData} overall={report.scores.by_topic} />
            ) : topicBarData.length > 0 ? (
              <div className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-5">
                <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <BarChart3 className="size-4 text-[#B85C3E]" /> 按主题正确率
                </div>
                <ResponsiveContainer width="100%" height={200} minWidth={0}>
                  <BarChart data={topicBarData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="topic" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={((v: unknown, _n: unknown, p: unknown) => {
                        const payload = (p as { payload?: { correct: number; total: number } })?.payload
                        const c = payload?.correct ?? 0
                        const t = payload?.total ?? 0
                        return [`${v}% (${c}/${t})`, "正确率"]
                      }) as never}
                    />
                    <Bar dataKey="rate" fill="#B85C3E" radius={[6, 6, 0, 0]} minPointSize={8} maxBarSize={72} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* 评估趋势折线（≥2 次评估才显示） */}
            {trendData.length >= 2 && (
              <TrendLineCard data={trendData} />
            )}

            {/* profile_delta 解释卡 + 应用按钮 */}
            <ProfileDeltaCard
              delta={report.profile_delta}
              applied={applied}
              appliedChanged={appliedChanged}
              applying={applying}
              appliedKeys={appliedKeys}
              sourceVersion={report.profile_version}
              currentVersion={profile?.version ?? null}
              stale={reportStale}
              onApply={applyToProfile}
            />

            {/* 评估总结 markdown */}
            {report.summary_markdown && (
              <div className="rounded-[22px] border border-[#D7D1C4] bg-[#F8F6F0] p-5">
                <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Sparkles className="size-4 text-[#315E83]" /> 评估总结
                </div>
                <Markdown content={report.summary_markdown} />
              </div>
            )}

            {/* 学习建议 + 下一步主题 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.suggestions?.length > 0 && (
                <div className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-5">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="size-4 text-[#B1842C]" /> 学习建议
                  </div>
                  <ul className="space-y-2 text-sm">
                    {report.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-[#B1842C]">·</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.next_topics?.length > 0 && (
                <div className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-5">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <ArrowRight className="size-4 text-[#6F8A69]" /> 下一步建议主题
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {report.next_topics.map((t, i) => (
                      <Link
                        key={i}
                        to={`/workspace?topic=${encodeURIComponent(t)}`}
                        aria-label={`围绕「${t}」进入岗位训练中心`}
                        className="rounded-full border border-[#C9D1CB] bg-[#E9EEE6] px-2.5 py-1 text-xs text-[#557052] transition-colors hover:bg-[#DDE7DA]"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-2">点击主题 → 回工作台生成对应资源</div>
                </div>
              )}
            </div>

            {/* 当前画像（小卡片，给 PDF 留底） */}
            {profile && (
              <div className="mt-4">
                <div className="text-xs text-[var(--muted-foreground)] mb-1.5 flex items-center gap-2">
                  <span>当前画像快照</span>
                  <AnimatePresence>
                    {highlightProfile && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        className="inline-flex items-center gap-1 rounded-full bg-[#E9EEE6] px-1.5 py-0.5 text-[10px] font-medium text-[#557052]"
                      >
                        <CheckCircle2 className="size-3" /> 已更新到 v{profile.version}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <motion.div
                  animate={highlightProfile ? {
                    boxShadow: [
                      "0 0 0 0 rgba(16,185,129,0)",
                      "0 0 0 6px rgba(16,185,129,0.35)",
                      "0 0 0 0 rgba(16,185,129,0)",
                    ],
                  } : {}}
                  transition={{ duration: 2.0 }}
                  className="rounded-2xl"
                >
                  <ProfileMiniCard profile={profile} variant="compact" />
                </motion.div>
              </div>
            )}

            <CareerRecommendations profileVersion={profile?.version || 0} />

            <div className="text-center text-[10px] text-[var(--muted-foreground)] pt-2">
              本报告由因材智训评估智能体根据答题数据与学习行为生成 · {formatReportTime(report.generated_at)}
            </div>
          </div>
        )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ReportEvidenceStrip({
  evidence, generatedAt, profileVersion, currentProfileVersion,
}: {
  evidence?: EvalEvidence
  generatedAt?: string
  profileVersion: number
  currentProfileVersion: number | null
}) {
  const stale = currentProfileVersion != null && currentProfileVersion !== profileVersion
  const resourceLabel = evidence?.resources_consumed.length
    ? evidence.resources_consumed.map((key) => RESOURCE_LABEL[key] || key).slice(0, 3).join("、")
    : "未记录资源"
  const cells = [
    { label: "目标岗位上下文", value: evidence?.course_name || "旧版报告未记录", icon: BookOpen },
    { label: "岗位训练任务", value: evidence?.topic || evidence?.topics_studied?.[0] || "历史训练", icon: Target },
    { label: "输入证据", value: evidence ? `${evidence.quiz_count} 题 · ${evidence.resources_consumed.length} 类资源` : "已归档", icon: Layers3 },
    { label: "生成时间", value: formatReportTime(generatedAt), icon: Clock },
  ]
  return (
    <section aria-label="报告生成依据" className="rounded-[22px] border border-[#C7D2D8] bg-[#F3F6F7] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#315E83]"><ShieldCheck className="size-3.5" />报告生成依据</div>
          <p className="mt-1 text-[11px] leading-5 text-[#66717B]">{evidence ? `已冻结本次输入快照：${resourceLabel}` : "这是兼容保留的旧版报告；未记录的证据不会用当前会话数据冒充。"}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${stale ? "border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]" : "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]"}`}>
          {stale ? <History className="size-3" /> : <CheckCircle2 className="size-3" />}
          {stale ? `基于画像 v${profileVersion} · 当前 v${currentProfileVersion}` : `画像 v${profileVersion} 已核对`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cells.map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2.5">
            <span className="flex items-center gap-1 text-[9px] font-bold tracking-[0.08em] text-[#8A8172]"><Icon className="size-3" />{label}</span>
            <strong className="mt-1 block truncate text-[11px] text-[#27343D]" title={value}>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function AchievementBreakdownCard({ scores, evidence }: { scores: EvalScores; evidence?: EvalEvidence }) {
  const completion = scores.answer_completion
  const coverage = scores.resource_coverage
  const breakdown = scores.engagement_breakdown
  const metrics = [
    {
      label: "作答完成率",
      rate: completion?.rate ?? null,
      value: completion?.rate == null ? "未记录" : `${Math.round(completion.rate * 100)}%`,
      detail: completion ? `${completion.answered} / ${completion.total} 题已作答` : "旧版报告未保存空答案统计",
      tone: "bg-[#315E83]",
    },
    {
      label: "资源覆盖率",
      rate: coverage?.rate ?? null,
      value: coverage?.rate == null ? "未记录" : `${Math.round(coverage.rate * 100)}%`,
      detail: coverage
        ? `${coverage.consumed} / ${coverage.available} 类可用资源已查看`
        : evidence?.resources_available?.length
          ? `${evidence.resources_consumed.length} / ${evidence.resources_available.length} 类资源`
          : "旧版报告未保存可用资源范围",
      tone: "bg-[#6F8A69]",
    },
    {
      label: "参与度组成",
      rate: scores.engagement_score / 100,
      value: `${Math.round(scores.engagement_score)} / 100`,
      detail: breakdown
        ? `学习时长 ${breakdown.time_score}/60 + 资源多样性 ${breakdown.resource_variety_score}/40`
        : "沿用原有参与度评分，旧报告未保存分项",
      tone: "bg-[#B1842C]",
    },
  ]
  return (
    <section aria-label="学习达成率拆解" className="rounded-[22px] border border-[#D7D1C4] bg-[#F8F6F0] p-4 sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#18232D]"><Target className="size-4 text-[#315E83]" />学习达成率拆解</div>
        <p className="mt-1 text-[11px] leading-5 text-[#66717B]">分别展示作答、资源覆盖和学习投入</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map((metric) => {
          const width = metric.rate == null ? 0 : Math.max(0, Math.min(100, Math.round(metric.rate * 100)))
          return (
            <article key={metric.label} className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold text-[#59636B]">{metric.label}</span>
                <strong className="text-sm text-[#18232D]">{metric.value}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8E3D9]" role="progressbar" aria-label={metric.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metric.rate == null ? undefined : width}>
                <motion.div initial={false} animate={{ width: `${width}%` }} className={`h-full rounded-full ${metric.tone}`} />
              </div>
              <p className="mt-2 text-[10px] leading-4 text-[#7A817F]">{metric.detail}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function heatmapTone(rate: number | null) {
  if (rate == null) return "border-[#DED8CC] bg-[#F1EDE4] text-[#8A8172]"
  if (rate < 0.4) return "border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"
  if (rate < 0.6) return "border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"
  if (rate < 0.8) return "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"
  return "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]"
}

function HeatmapCell({ bucket, label }: { bucket?: { correct: number; total: number; rate: number }; label: string }) {
  const rate = bucket?.rate ?? null
  const percent = rate == null ? "—" : `${Math.round(rate * 100)}%`
  return (
    <td className="p-1.5">
      <div
        className={`min-w-[92px] rounded-xl border px-2 py-2 text-center ${heatmapTone(rate)}`}
        title={bucket ? `${label}：${bucket.correct}/${bucket.total}，正确率 ${percent}` : `${label}：暂无答题`}
      >
        <strong className="block text-xs">{percent}</strong>
        <span className="mt-0.5 block text-[9px] opacity-75">{bucket ? `${bucket.correct}/${bucket.total} 题` : "暂无数据"}</span>
      </div>
    </td>
  )
}

function TopicDifficultyHeatmap({
  data,
  overall,
}: {
  data: Record<string, Record<string, { correct: number; total: number; rate: number }>>
  overall: Record<string, { correct: number; total: number; rate: number }>
}) {
  const difficulties = [1, 2, 3, 4]
  const topics = Object.keys(data)
  return (
    <section className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#18232D]"><BarChart3 className="size-4 text-[#B85C3E]" />主题 × 难度掌握热力图</div>
          <p className="mt-1 text-[11px] leading-5 text-[#66717B]">颜色代表正确率，格内同时保留正确题数与总题数，避免小样本被误读。</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[9px] font-semibold text-[#7A817F]" aria-label="热力图图例">
          <span>低</span>
          {[0.2, 0.5, 0.7, 0.9].map((rate) => <span key={rate} className={`size-4 rounded border ${heatmapTone(rate)}`} />)}
          <span>高</span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[10px] font-bold text-[#7A817F]">
              <th className="px-2 py-2">岗位训练任务</th>
              {difficulties.map((difficulty) => <th key={difficulty} className="px-2 py-2 text-center">难度 {difficulty}</th>)}
              <th className="px-2 py-2 text-center">主题总体</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic} className="border-t border-[#E3DED3]">
                <th className="max-w-[220px] px-2 py-2 text-xs font-semibold text-[#27343D]" title={topic}>{topic}</th>
                {difficulties.map((difficulty) => <HeatmapCell key={difficulty} bucket={data[topic]?.[String(difficulty)]} label={`${topic} · 难度 ${difficulty}`} />)}
                <HeatmapCell bucket={overall[topic]} label={`${topic} · 总体`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReportHistoryLanding({ items }: { items: EvalHistoryItem[] }) {
  const recent = items.slice(0, 3)
  const masteryCount = items.filter((item) => (item.scores?.total_attempts ?? 0) > 0).length
  return (
    <div className="rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] text-[#8E6925]"><History className="size-3.5" />历史学习证据</span>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D]">已有 {items.length} 次学习评估留档</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#66717B]">历史成绩与建议已保留。其中 {masteryCount} 次包含答题依据；未答题的记录只展示学习投入，不再误算为 0% 正确率。</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/competency" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] px-4 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#DBE6EE]"><Sparkles className="size-3.5" />开始本轮训练</Link>
          <Link to="/quiz" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-xs font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50]">继续测验<ArrowRight className="size-3.5" /></Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {recent.map((item, index) => {
          const attempts = item.scores?.total_attempts ?? 0
          const correctRate = attempts > 0 ? Math.round((item.scores?.overall_correct_rate ?? 0) * 100) : null
          const engagement = Math.round(item.scores?.engagement_score ?? 0)
          const createdAt = item.created_at ? new Date(item.created_at) : null
          const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "时间未记录"
          return (
            <article key={item.id} className="paper-lift rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 shadow-[0_8px_20px_rgba(24,35,45,.035)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold tracking-[0.12em] text-[#B1842C]">报告 {String(items.length - index).padStart(2, "0")} · {attempts > 0 ? "掌握评估" : "行为评估"}</span>
                <time className="text-[10px] font-medium text-[#8A8172]">{dateLabel}</time>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <HistoryMetric label="正确率" value={correctRate == null ? "暂无" : `${correctRate}%`} tone="blue" />
                <HistoryMetric label="答题" value={`${attempts} 题`} tone="green" />
                <HistoryMetric label="投入度" value={`${engagement}`} tone="gold" />
              </div>
              <p className="mt-3 line-clamp-2 min-h-10 text-[11px] leading-5 text-[#66717B]">{item.suggestions?.[0] || "本次评估已完成，学习表现与画像变化均已记录。"}</p>
            </article>
          )
        })}
      </div>

      {items.length > recent.length && <p className="mt-4 text-center text-[11px] font-medium text-[#7A817F]">另有 {items.length - recent.length} 次更早评估已计入趋势数据</p>}
    </div>
  )
}

function HistoryMetric({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "gold" }) {
  const colors = {
    blue: "bg-[#E7EDF3] text-[#315E83]",
    green: "bg-[#E9EEE6] text-[#557052]",
    gold: "bg-[#F4ECD8] text-[#8E6925]",
  }
  return (
    <div className={`rounded-xl px-2 py-2 text-center ${colors[tone]}`}>
      <strong className="block text-sm leading-4">{value}</strong>
      <span className="mt-1 block text-[9px] font-bold opacity-75">{label}</span>
    </div>
  )
}

function EmptyState({ courseName }: { courseName?: string }) {
  const steps = [
    { step: "01", title: "学习资源", desc: "阅读讲解、笔记或可视动画", icon: BookOpen, tone: "bg-[#E7EDF3] text-[#315E83]" },
    { step: "02", title: "完成测验", desc: "留下真实的掌握度证据", icon: CheckCircle2, tone: "bg-[#E9EEE6] text-[#557052]" },
    { step: "03", title: "生成报告", desc: "获得建议并更新岗位能力画像", icon: BarChart3, tone: "bg-[#F4ECD8] text-[#8E6925]" },
  ]
  return (
    <div className="grid min-h-[520px] place-items-center rounded-[24px] border border-dashed border-[#CFC8B9] bg-[#F8F6F0] px-5 py-12">
      <div className="max-w-2xl text-center">
        <div className="relative mx-auto grid size-20 place-items-center">
          <span className="absolute inset-0 rounded-full border border-dashed border-[#D9CFB7]" />
          <span className="absolute inset-2 rounded-full border border-[#E3DED3]" />
          <span className="relative grid size-12 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925] shadow-[0_10px_24px_rgba(142,105,37,.12)]"><BarChart3 className="size-5" /></span>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-[-0.03em] text-[#18232D]">完成一次学习闭环，报告就会在这里生长</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#66717B]">学习报告会结合资源训练、测验结果和画像变化，告诉你已经掌握哪些岗位能力、薄弱能力在哪里，以及下一步最值得训练什么。</p>
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
          {steps.map(({ step, title, desc, icon: Icon, tone }) => (
            <div key={step} className="paper-lift rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-4">
              <div className="flex items-center justify-between">
                <span className={`grid size-8 place-items-center rounded-xl ${tone}`}><Icon className="size-4" /></span>
                <span className="text-[10px] font-bold tracking-[0.14em] text-[#B1842C]">{step}</span>
              </div>
              <div className="mt-3 text-sm font-bold text-[#18232D]">{title}</div>
              <div className="mt-1 text-[11px] leading-5 text-[#6F787A]">{desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to={courseName ? "/workspace" : "/courses"} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50]">
            <Sparkles className="size-4" /> {courseName ? "生成第一套岗位训练资源" : "先选择目标岗位"}
          </Link>
          {courseName && (
            <Link to="/quiz" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#C9C2B4] bg-[#FFFEFA] px-5 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#EEE9DF]">
              <CheckCircle2 className="size-4" /> 直接完成一次测验
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkspaceGenerationState({ resourceCount }: { resourceCount: number }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[400px] place-items-center rounded-[24px] border border-[#C7D2D8] bg-[#F3F6F7] px-5 py-10">
      <div className="w-full max-w-xl text-center">
        <span className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#FFFEFA] text-[#315E83] shadow-[0_10px_24px_rgba(49,94,131,.1)]">
          <Layers3 className="size-5" />
          <span className="absolute -right-1 -top-1 size-3 animate-pulse rounded-full border-2 border-[#FFFEFA] bg-[#B85C3E]" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-[#18232D]">学习资源包仍在后台生成</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66717B]">当前已有 {resourceCount} / 7 类 Agent 资源返回。为保证报告证据完整，资源全部生成后才开放评估。</p>
        <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden rounded-full bg-[#DCE4E8]">
          <motion.div initial={false} animate={{ width: `${Math.min(100, (resourceCount / 7) * 100)}%` }} className="h-full rounded-full bg-[#315E83]" />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/competency" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-xs font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50]">查看训练进度<ArrowRight className="size-3.5" /></Link>
          <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] px-4 text-xs font-bold text-[#557052]"><ShieldCheck className="size-3.5" />离开页面不会中断</span>
        </div>
      </div>
    </div>
  )
}

function WorkspaceGenerationBanner({ resourceCount }: { resourceCount: number }) {
  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-[20px] border border-[#D9CFB7] bg-[#F4ECD8] p-4 text-[#72551F] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D9CFB7] bg-[#FFFEFA]"><Layers3 className="size-4" /></span>
        <div><strong className="block text-sm">新资源仍在生成，暂不重新评估</strong><p className="mt-0.5 text-[11px] leading-5 text-[#816A3D]">已返回 {resourceCount} / 7 类资源；下方旧报告保持可读，完整后再生成新版。</p></div>
      </div>
      <Link to="/competency" className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-[#CDBF9E] bg-[#FFFEFA] px-3 text-[11px] font-bold transition-colors hover:bg-[#F8F1E2]">查看进度<ArrowRight className="size-3" /></Link>
    </div>
  )
}

function ReportGeneratingState({
  startedAt, quizCount, resourceCount,
}: {
  startedAt: number | null
  quizCount: number
  resourceCount: number
}) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[420px] place-items-center rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] px-5 py-12">
      <div className="w-full max-w-xl text-center">
        <div className="relative mx-auto grid size-16 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#E7EDF3] opacity-65" />
          <span className="relative grid size-12 place-items-center rounded-2xl border border-[#C7D2D8] bg-[#FFFEFA] text-[#315E83] shadow-[0_10px_24px_rgba(49,94,131,.12)]">
            <Loader2 className="size-5 animate-spin" />
          </span>
        </div>
        <h2 className="mt-5 text-lg font-bold text-[#18232D]">正在把本次学习整理成成长报告</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66717B]">评估智能体正在核对 {quizCount} 道答题与 {resourceCount} 类资源。任务已交给全局队列，切换到其他页面也不会中断。</p>
        <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 text-[11px] font-medium text-[#66717B]">
          {["汇总学习证据", "分析掌握变化", "生成行动建议"].map((label, index) => (
            <div key={label} className="rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-2 py-3">
              <span className="mb-2 block text-[10px] font-bold tracking-[0.12em] text-[#B1842C]">0{index + 1}</span>{label}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#C9D1CB] bg-[#E9EEE6] px-3 py-1.5 text-[10px] font-bold text-[#557052]">
          <ShieldCheck className="size-3" />后台任务已托管{startedAt ? ` · ${formatReportTime(startedAt)} 启动` : ""}
        </div>
      </div>
    </div>
  )
}

function ReportRefreshBanner({ startedAt }: { startedAt: number | null }) {
  return (
    <div role="status" aria-live="polite" className="mb-4 flex flex-col gap-3 rounded-[20px] border border-[#C7D2D8] bg-[#E7EDF3] p-4 text-[#315E83] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#B9C9D3] bg-[#FFFEFA]"><Loader2 className="size-4 animate-spin" /></span>
        <div>
          <strong className="block text-sm">新一轮评估正在后台生成</strong>
          <p className="mt-0.5 text-[11px] leading-5 text-[#596F7E]">下方旧报告继续可读；新结果完成后会自动替换，不需要停留等待。</p>
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-bold">{startedAt ? `${formatReportTime(startedAt)} 启动` : "任务已托管"}</span>
    </div>
  )
}

function StatCard({
  icon, color, label, value, hint,
}: {
  icon: React.ReactNode
  color: "emerald" | "indigo" | "amber" | "rose"
  label: string
  value: string
  hint?: string
}) {
  const cmap = {
    emerald: "bg-[#E9EEE6] text-[#557052] border-[#C9D1CB]",
    indigo: "bg-[#E7EDF3] text-[#315E83] border-[#C7D2D8]",
    amber: "bg-[#F4ECD8] text-[#8E6925] border-[#DDD4BF]",
    rose: "bg-[#F4E8E2] text-[#9A4E35] border-[#DFC8BE]",
  }[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`paper-lift rounded-[18px] border p-4 ${cmap}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon} {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] opacity-70 mt-0.5">{hint}</div>}
    </motion.div>
  )
}

function RadarCompareCard({
  title, data, color, hasProjection,
}: {
  title: string
  data: Array<{ dim: string; before: number; projected: number }>
  color: string
  hasProjection: boolean
}) {
  return (
    <div data-testid="radar-compare-card" className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-4">
      <div className="text-sm font-semibold mb-2 flex items-center justify-between">
        <span>{title}</span>
        {!hasProjection && <span className="text-[10px] font-normal text-[var(--muted-foreground)]">旧版报告暂无建议预览</span>}
      </div>
      <ResponsiveContainer width="100%" height={220} minWidth={0} initialDimension={{ width: 800, height: 220 }}>
        <RadarChart
          data={data}
          margin={{ top: 14, right: 36, bottom: 28, left: 36 }}
          outerRadius="72%"
        >
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
          <Radar
            name="评估前"
            dataKey="before"
            stroke="#94a3b8"
            fill="#94a3b8"
            fillOpacity={0.15}
            strokeDasharray="4 4"
            animationDuration={300}
          />
          {hasProjection && <Radar
            name="建议应用后"
            dataKey="projected"
            stroke={color}
            fill={color}
            fillOpacity={0.35}
            animationDuration={500}
          />}
        </RadarChart>
      </ResponsiveContainer>
      <div
        data-testid="radar-compare-legend"
        className="mt-1 flex min-h-5 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted-foreground)]"
      >
        {hasProjection && (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-2.5 shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
            建议应用后
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2.5 shrink-0 bg-[#94a3b8]" aria-hidden="true" />
          评估前
        </span>
      </div>
    </div>
  )
}

function ProfileDeltaCard({
  delta, applied, appliedChanged, applying, appliedKeys, sourceVersion, currentVersion, stale, onApply,
}: {
  delta: ProfileDelta
  applied: boolean
  appliedChanged: boolean | null
  applying: boolean
  appliedKeys: AppliedKeys | null
  sourceVersion: number
  currentVersion: number | null
  stale: boolean
  onApply: () => void
}) {
  const kb = delta.knowledge_base || {}
  const pref = delta.preference || {}
  const employment = delta.employment_skills || {}
  const kbEntries = Object.entries(kb).filter(([, value]) => Math.abs(value) > 0.001)
  const prefEntries = Object.entries(pref).filter(([, value]) => Math.abs(value) > 0.001)
  const employmentEntries = Object.entries(employment).filter(([, value]) => Math.abs(value) > 0.001)
  const wp = delta.weak_points
  const hasAny = kbEntries.length > 0 || prefEntries.length > 0 || employmentEntries.length > 0 || Boolean(wp?.topics?.length || wp?.error_types?.length)
  const wpApplied = applied && !!appliedKeys?.weak_points

  return (
    <div className="rounded-[22px] border border-[#D7D1C4] bg-[#F8F6F0] p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="size-4 text-[#315E83]" /> 画像回写建议
          </div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {applied
              ? appliedChanged
                ? `本建议已应用，画像由 v${sourceVersion} 更新至 v${currentVersion}；旧版本快照已保留。`
                : `本建议已核对，但没有造成实际字段变化；画像仍为 v${currentVersion}，未创建多余快照。`
              : stale
              ? `本建议基于画像 v${sourceVersion}，当前已更新至 v${currentVersion}。为避免旧建议重复覆盖，需重新评估后再回写。`
              : "评估智能体根据本次学习表现提出画像调整。应用后将生成新的画像版本，并保留历史记录以便追溯。"}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onApply}
          disabled={!hasAny || applying || applied || stale}
          variant={applied ? "outline" : "default"}
        >
          {applied ? (
            <><CheckCircle2 className="size-4 text-[#557052]" /> 已应用</>
          ) : stale ? (
            <><ShieldCheck className="size-4 text-[#8E6925]" /> 已保护</>
          ) : applying ? (
            <><Loader2 className="size-4 animate-spin" /> 应用中</>
          ) : (
            <><CheckCircle2 className="size-4" /> 应用到画像</>
          )}
        </Button>
      </div>

      {!hasAny ? (
        <div className="text-xs text-[var(--muted-foreground)] italic">本次评估未产生画像调整建议</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DeltaBlock
            title="📚 知识基础"
            entries={kbEntries}
            appliedKeys={applied ? appliedKeys?.knowledge_base : undefined}
          />
          <DeltaBlock
            title="🎯 资源偏好"
            entries={prefEntries}
            appliedKeys={applied ? appliedKeys?.preference : undefined}
          />
          <DeltaBlock
            title="💼 就业技能"
            entries={employmentEntries}
            appliedKeys={applied ? appliedKeys?.employment_skills : undefined}
          />
          <motion.div
            animate={wpApplied ? { boxShadow: ["0 0 0 0 rgba(16,185,129,0)", "0 0 0 4px rgba(16,185,129,0.35)", "0 0 0 0 rgba(16,185,129,0)"] } : {}}
            transition={{ duration: 1.2 }}
            className={`rounded-xl border bg-[#FFFEFA] p-3 ${wpApplied ? "border-[#6F8A69]" : "border-[#D7D1C4]"}`}
          >
            <div className="text-xs font-semibold mb-1.5 flex items-center gap-1">
              <span>⚠️ 薄弱能力点（替换）</span>
              {wpApplied && <CheckCircle2 className="size-3 text-[#557052]" />}
            </div>
            {wp?.topics?.length || wp?.error_types?.length ? (
              <>
                {wp.topics?.length ? (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {wp.topics.map((t, i) => (
                      <span key={i} className="rounded bg-[#F4E8E2] px-1.5 py-0.5 text-[11px] text-[#9A4E35]">{t}</span>
                    ))}
                  </div>
                ) : null}
                {wp.error_types?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {wp.error_types.map((t, i) => (
                      <span key={i} className="rounded bg-[#F4ECD8] px-1.5 py-0.5 text-[11px] text-[#8E6925]">{t}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-xs text-[var(--muted-foreground)] italic">无调整</div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  )
}

function DeltaBlock({
  title, entries, appliedKeys,
}: {
  title: string
  entries: Array<[string, number]>
  /** undefined = 未应用；string[] = 已应用的字段名集合（条目命中后 ✓ + pulse） */
  appliedKeys?: string[]
}) {
  const applied = appliedKeys !== undefined
  const cardAnim = applied && entries.length > 0
    ? { boxShadow: ["0 0 0 0 rgba(16,185,129,0)", "0 0 0 4px rgba(16,185,129,0.35)", "0 0 0 0 rgba(16,185,129,0)"] }
    : {}
  return (
    <motion.div
      animate={cardAnim}
      transition={{ duration: 1.2 }}
      className={`rounded-xl border bg-[#FFFEFA] p-3 ${applied && entries.length > 0 ? "border-[#6F8A69]" : "border-[#D7D1C4]"}`}
    >
      <div className="text-xs font-semibold mb-1.5 flex items-center gap-1">
        <span>{title}</span>
        {applied && entries.length > 0 && <CheckCircle2 className="size-3 text-[#557052]" />}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-[var(--muted-foreground)] italic">无调整</div>
      ) : (
        <ul className="space-y-1">
          {entries.map(([k, v], i) => {
            const positive = v > 0
            const isApplied = applied && (appliedKeys?.includes(k) ?? false)
            return (
              <motion.li
                key={k}
                initial={false}
                animate={isApplied ? { backgroundColor: ["rgba(16,185,129,0)", "rgba(16,185,129,0.18)", "rgba(16,185,129,0)"] } : {}}
                transition={{ duration: 0.9, delay: i * 0.08 }}
                className="text-xs flex items-center justify-between rounded px-1 -mx-1"
              >
                <span className="text-[var(--foreground)] inline-flex items-center gap-1">
                  {isApplied && <CheckCircle2 className="size-3 text-[#557052]" />}
                  {DIM_LABEL[k] || k}
                </span>
                <span className={`inline-flex items-center gap-0.5 font-mono ${positive ? "text-[#557052]" : "text-[#9A4E35]"}`}>
                  {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {positive ? "+" : ""}{v.toFixed(1)}
                </span>
              </motion.li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}

function TrendLineCard({
  data,
}: {
  data: Array<{ label: string; idx: number; correctRate: number | null; engagement: number; attempts: number }>
}) {
  return (
    <div className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-5">
      <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
        <LineChartIcon className="size-4 text-[#315E83]" /> 评估趋势（最近 {data.length} 次）
      </div>
      <div className="text-[11px] text-[var(--muted-foreground)] mb-3 flex items-center gap-1">
        <History className="size-3" /> 历次正确率 vs. 参与度，看学习曲线
      </div>
      <ResponsiveContainer width="100%" height={220} minWidth={0} initialDimension={{ width: 800, height: 220 }}>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={((v: unknown, name: string, p: unknown) => {
              const payload = (p as { payload?: { attempts: number } })?.payload
              const suffix = name === "正确率" ? `% (${payload?.attempts ?? 0} 题)` : ""
              return [`${v}${suffix || ""}`, name]
            }) as never}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="correctRate"
            name="正确率"
            connectNulls={false}
            stroke="#6F8A69"
            strokeWidth={2}
            dot={{ r: 3, fill: "#6F8A69" }}
            activeDot={{ r: 5 }}
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="engagement"
            name="参与度"
            stroke="#315E83"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: "#315E83" }}
            activeDot={{ r: 5 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
