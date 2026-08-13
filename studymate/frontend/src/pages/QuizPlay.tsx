/**
 * /quiz/:id · 题库答题页
 * - 拉 session 详情；status="ready" 进入答题模式；"submitted" 进入结果模式
 * - 答题模式：mode="exam" 一次渲染全部题；mode="quest" 一题一屏 + 上下题按钮
 * - 提交：调 POST /quiz-sessions/:id/submit 一次性带所有答案
 * - 结果模式：每题显示对错 + 解析 + 错题加入笔记本按钮（复用 SaveToNotebookModal）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  Trophy,
  Clock,
  RotateCcw,
  NotebookText,
  Check,
  Loader2,
  AlertCircle,
  Sparkles,
  Maximize2,
  BarChart3,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppTopbar } from "@/components/AppTopbar"
import { Markdown } from "@/components/Markdown"
import { SaveToNotebookModal } from "@/components/SaveToNotebookModal"
import { CodeEditor } from "@/components/CodeEditor"
import { CodeRunner, type RunLang } from "@/components/CodeRunner"
import { QuizFocusModal } from "@/components/QuizFocusModal"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { apiPost } from "@/lib/api"
import { effectiveQuizErrorTags } from "@/lib/quizError"
import { useCurrentUser } from "@/store/user"
import { useCourseConfig, useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { workspaceStore, type QuizAttempt } from "@/store/workspace"
import {
  getQuizSession,
  submitQuizSession,
  type QuizSession,
  type QuizSessionItem,
} from "@/lib/quizSession"

type AnswerMap = Record<number, { value: string | number | null; selfCorrect?: boolean }>

function answerText(item: QuizSessionItem, value: number | string | null) {
  if (value == null || value === "") return "未作答"
  if (item.type === "mcq") {
    const index = typeof value === "number" ? value : Number(value)
    if (Number.isInteger(index) && item.options[index]) {
      return `${String.fromCharCode(65 + index)}. ${item.options[index]}`
    }
  }
  return String(value)
}

function syncQuizEvidence(session: QuizSession, courseName: string) {
  if (session.status !== "submitted" || !session.items.length) return
  const attempts: QuizAttempt[] = session.items.map((item) => ({
    id: `quiz-session:${session.id}:${item.id}`,
    question: item.question,
    type: item.type,
    user_answer: answerText(item, item.user_answer),
    correct_answer: answerText(item, item.answer_key),
    is_correct: item.is_correct,
    topic: session.topic,
    difficulty: item.difficulty,
  }))
  workspaceStore.recordQuizSessionAttempts({
    sessionId: session.id,
    attempts,
    durationMs: session.duration_ms,
    topic: session.topic,
    courseId: session.course_id,
    courseName,
  })
}

export function QuizPlay() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const courseName = targetRole?.name || course?.name || ""
  const courseCfg = useCourseConfig()
  const defaultRunLang: RunLang = courseCfg?.code_style === "algorithm" ? "cpp" : "python"
  useTrackPage("quiz_play", { session: sessionId })

  const [session, setSession] = useState<QuizSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [focusItemId, setFocusItemId] = useState<number | null>(null)
  const startTsRef = useRef<number | null>(null)

  // 默认聚焦第一题；session 刷新或题列表变化时复位
  useEffect(() => {
    if (!session || session.items.length === 0 || focusItemId != null) return
    const frame = window.requestAnimationFrame(() => setFocusItemId(session.items[0].id))
    return () => window.cancelAnimationFrame(frame)
  }, [session, focusItemId])

  // 闯关模式：focus 跟随 stepIdx
  useEffect(() => {
    if (session?.mode !== "quest" || !session.items[stepIdx]) return
    const frame = window.requestAnimationFrame(() => setFocusItemId(session.items[stepIdx].id))
    return () => window.cancelAnimationFrame(frame)
  }, [stepIdx, session])

  // 试卷 / 回顾模式：IntersectionObserver 自动追踪视口内最显眼的题
  useEffect(() => {
    if (!session) return
    if (session.mode === "quest" && session.status === "ready") return // 闯关模式只有 1 题，stepIdx 已覆盖
    let io: IntersectionObserver | null = null
    const t = window.setTimeout(() => {
      const els = document.querySelectorAll<HTMLElement>("[data-quiz-item-id]")
      if (els.length === 0) return
      const ratios = new Map<number, number>()
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = Number((e.target as HTMLElement).dataset.quizItemId)
            if (!id) continue
            if (e.isIntersecting) ratios.set(id, e.intersectionRatio)
            else ratios.delete(id)
          }
          let bestId: number | null = null
          let bestRatio = 0
          ratios.forEach((r, id) => {
            if (r > bestRatio) {
              bestRatio = r
              bestId = id
            }
          })
          if (bestId != null && bestRatio > 0.3) setFocusItemId(bestId)
        },
        { threshold: [0.2, 0.4, 0.6, 0.8] },
      )
      els.forEach((el) => io!.observe(el))
    }, 50)
    return () => {
      window.clearTimeout(t)
      io?.disconnect()
    }
  }, [session])

  // 拼 snippet 给助教读：按 status 分两态，未提交不泄答案
  const tutorSnippet = useMemo(() => {
    if (!session || focusItemId == null) return undefined
    const idx = session.items.findIndex((it) => it.id === focusItemId)
    if (idx < 0) return undefined
    const it = session.items[idx]
    const lines: string[] = []
    lines.push(`【当前聚焦：第 ${idx + 1} / ${session.items.length} 题 · ${it.type} · 难度 ${it.difficulty}/4】`)
    lines.push(`题面：${it.question}`)
    if (it.type === "mcq" && it.options.length) {
      lines.push("选项：")
      it.options.forEach((opt, i) => lines.push(`  ${String.fromCharCode(65 + i)}. ${opt}`))
    }
    if (it.type === "code" && it.starter) {
      lines.push(`起步代码：\n${String(it.starter).slice(0, 240)}`)
    }
    const userAns = formatUserAnswerForSnippet(it, answers)
    if (userAns) lines.push(`用户当前作答：${userAns}`)

    if (session.status === "submitted") {
      // 提交后：把标答、是否答对、解析都给助教，便于精准讲错因
      lines.push(`正确答案：${formatCorrectAnswer(it)}`)
      lines.push(`本题是否答对：${it.is_correct ? "对" : "错"}（${it.score} 分）`)
      if (it.explanation) lines.push(`解析：${it.explanation}`)
      if (!it.is_correct && it.error_tags?.length) lines.push(`错题标签：${it.error_tags.join("、")}`)
      if (it.type === "code" && it.answer_key) {
        lines.push(`标答代码：\n${String(it.answer_key).slice(0, 240)}`)
      }
    } else {
      // 答题中：禁止泄答案，引导助教启发式回答
      lines.push("（用户尚未提交，请勿直接给出答案，引导其思考即可。）")
    }
    return lines.join("\n").slice(0, 1400)
  }, [session, focusItemId, answers])

  const focusedItem = useMemo(
    () => session?.items.find((item) => item.id === focusItemId) ?? null,
    [session, focusItemId],
  )
  const focusedAnswer = focusedItem ? formatUserAnswerForSnippet(focusedItem, answers) : ""
  const quizState = session?.status === "submitted"
    ? "answered" as const
    : focusedAnswer
      ? "attempted" as const
      : "unanswered" as const

  useTutorContext({
    page: "quiz",
    title: session
      ? `题库测验 · ${session.topic}（${session.status === "submitted" ? "查看回顾" : "答题中"}）`
      : "题库测验",
    topic: session?.topic,
    snippet: tutorSnippet,
    quiz_state: quizState,
    question_type: focusedItem?.type,
    quick_actions: session?.status === "submitted"
      ? ["分析这题的错因", "换一种方法讲解", "给我一道相似题"]
      : ["给我一个方向提示", "帮我检查当前思路", "逐步引导我完成"],
  })

  const refresh = useCallback(async () => {
    if (!sessionId || isNaN(sessionId)) {
      setError("无效的 session id")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const s = await getQuizSession(sessionId)
      setSession(s)
      syncQuizEvidence(s, courseName)
      // 答题模式下初始化用户答案
      if (s.status === "ready") {
        const init: AnswerMap = {}
        for (const it of s.items) {
          init[it.id] = {
            value: it.type === "mcq" ? -1 : it.type === "code" ? (it.starter ?? "") : "",
          }
        }
        setAnswers(init)
        if (!startTsRef.current) startTsRef.current = Date.now()
      }
    } catch (e) {
      setError(`加载失败：${String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId, courseName])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh())
    return () => window.cancelAnimationFrame(frame)
  }, [refresh])

  const isSubmitted = session?.status === "submitted"
  const isReady = session?.status === "ready"
  const items = useMemo(() => session?.items || [], [session?.items])
  const total = items.length

  const stats = useMemo(() => {
    if (!isSubmitted) return null
    const correct = items.filter((i) => i.is_correct).length
    return {
      correct,
      wrong: total - correct,
      rate: total ? Math.round((correct / total) * 100) : 0,
    }
  }, [isSubmitted, items, total])

  const setAnswer = (itemId: number, value: string | number | null) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { ...prev[itemId], value } }))
  }

  const setSelfCorrect = (itemId: number, ok: boolean) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { ...prev[itemId], selfCorrect: ok } }))
  }

  const handleSubmit = async () => {
    if (!session) return
    const duration_ms = startTsRef.current ? Date.now() - startTsRef.current : 0
    const payload = {
      answers: items.map((it) => ({
        item_id: it.id,
        answer: answers[it.id]?.value ?? null,
        self_correct: answers[it.id]?.selfCorrect,
      })),
      duration_ms,
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await submitQuizSession(session.id, payload)
      setSession(updated)
      syncQuizEvidence(updated, courseName)
      setStepIdx(0)
    } catch (e) {
      setError(`提交失败：${String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
          <Loader2 className="size-5 animate-spin mr-2" /> 加载中...
        </div>
      </PageShell>
    )
  }

  if (error || !session) {
    return (
      <PageShell>
        <div className="py-20 text-center text-[#9A4E35]">
          <AlertCircle className="size-8 mx-auto mb-2" />
          {error || "未找到测验"}
        </div>
        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/quiz")}>
            <ChevronLeft className="size-3.5" /> 返回题库
          </Button>
        </div>
      </PageShell>
    )
  }

  const subtitle = isSubmitted
    ? `已提交 · 得分 ${session.score} · 用时 ${fmtDur(session.duration_ms)}`
    : `${total} 道题 · 难度 ${session.difficulty}/4 · ${session.mode === "exam" ? "试卷模式" : "闯关模式"}`

  return (
    <PageShell>
      <section className="overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
        <header className="flex flex-col items-stretch justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/quiz" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
              <ChevronLeft className="size-3.5" /><span className="hidden sm:inline">返回题库</span>
            </Link>
            <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><BookOpen className="size-4" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-bold text-[#18232D]">{isSubmitted ? `测验回顾 · ${session.topic}` : session.topic}</h1>
              <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">{subtitle}</p>
            </div>
          </div>
          {isSubmitted && (
            <div className="nav-scroll flex items-center gap-2 overflow-x-auto pb-0.5 sm:overflow-visible sm:pb-0">
              <button type="button" onClick={() => navigate("/quiz")} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#F1EDE4]">
                <RotateCcw className="size-3.5" />返回测验中心
              </button>
              <Link to="/report" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[11px] font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50]">
                <BarChart3 className="size-3.5" />生成学习报告
              </Link>
            </div>
          )}
        </header>

        <div className="mx-auto max-w-5xl p-4 sm:p-6">

      {/* 提交后结果统计 */}
      {isSubmitted && stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ResultStat label="总分" value={String(session.score)} icon={Trophy} tone="amber" />
          <ResultStat label="答对" value={`${stats.correct}/${total}`} icon={CheckCircle2} tone="emerald" />
          <ResultStat label="正确率" value={`${stats.rate}%`} icon={Trophy} tone="indigo" />
          <ResultStat label="用时" value={fmtDur(session.duration_ms)} icon={Clock} tone="sky" />
        </div>
      )}

      {isSubmitted && (
        <section role="status" className="mb-5 flex flex-col gap-3 rounded-[20px] border border-[#C9D1CB] bg-[#E9EEE6] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#C9D1CB] bg-[#FFFEFA] text-[#557052]"><CheckCircle2 className="size-4" /></span>
            <div>
              <strong className="block text-sm text-[#24372E]">本次答题已进入学习证据</strong>
              <p className="mt-0.5 text-[11px] leading-5 text-[#66736A]">{total} 道作答、正确情况与 {fmtDur(session.duration_ms)} 有效用时已同步；可先查看报告，再返回资源工坊提交反馈，更新下一轮岗位训练策略。</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/report" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#557052] px-4 text-[11px] font-bold text-[#FFFEFA] transition-colors hover:bg-[#465F45]">查看学习报告 <ArrowRight className="size-3.5" /></Link>
            <Link to="/competency" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#BFCABE] bg-[#FFFEFA] px-4 text-[11px] font-bold text-[#557052] hover:bg-[#F5F8F3]">回写训练闭环</Link>
          </div>
        </section>
      )}

      {/* 答题主体 */}
      {isReady && session.mode === "exam" && (
        <ExamView
          items={items}
          answers={answers}
          setAnswer={setAnswer}
          onFocusItem={setFocusItemId}
          focusItemId={focusItemId}
          codeLanguage={defaultRunLang}
        />
      )}
      {isReady && session.mode === "quest" && (
        <QuestView
          items={items}
          stepIdx={stepIdx}
          setStepIdx={setStepIdx}
          answers={answers}
          setAnswer={setAnswer}
          codeLanguage={defaultRunLang}
        />
      )}
      {isSubmitted && (
        <ReviewView
          items={items}
          session={session}
          setSelfCorrect={setSelfCorrect}
          answersDraft={answers}
          courseName={courseName}
          onFocusItem={setFocusItemId}
          focusItemId={focusItemId}
        />
      )}

      {/* 答题模式底部操作栏 */}
      {isReady && (
        <div className="sticky bottom-4 z-10 mt-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[18px] border border-[#CFC8B9] bg-[#FFFEFA]/95 px-4 py-3 shadow-[0_14px_34px_rgba(24,35,45,.14)] backdrop-blur">
            <div className="text-xs font-semibold text-[#66717B]">
              已作答 {countAnswered(items, answers)} / {total}
            </div>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50] disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> 评分中...
                </>
              ) : (
                <>
                  <Send className="size-3.5" /> 提交并评分
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2 text-sm text-[#9A4E35]">
          {error}
        </div>
      )}
        </div>
      </section>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="quiz" appearance="paper" />
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function ExamView({
  items,
  answers,
  setAnswer,
  onFocusItem,
  focusItemId,
  codeLanguage,
}: {
  items: QuizSessionItem[]
  answers: AnswerMap
  setAnswer: (id: number, v: string | number | null) => void
  onFocusItem: (id: number) => void
  focusItemId: number | null
  codeLanguage: RunLang
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <PlayItem
          key={it.id}
          item={it}
          index={i}
          total={items.length}
          value={answers[it.id]?.value}
          onChange={(v) => setAnswer(it.id, v)}
          onFocus={() => onFocusItem(it.id)}
          isFocused={focusItemId === it.id}
          codeLanguage={codeLanguage}
        />
      ))}
    </div>
  )
}

function QuestView({
  items,
  stepIdx,
  setStepIdx,
  answers,
  setAnswer,
  codeLanguage,
}: {
  items: QuizSessionItem[]
  stepIdx: number
  setStepIdx: (i: number) => void
  answers: AnswerMap
  setAnswer: (id: number, v: string | number | null) => void
  codeLanguage: RunLang
}) {
  const it = items[stepIdx]
  if (!it) return null
  return (
    <div>
      {/* 进度条 */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E5E0D6]">
          <motion.div
            className="h-full bg-[#315E83]"
            initial={false}
            animate={{ width: `${((stepIdx + 1) / items.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          />
        </div>
        <div className="text-xs text-[var(--muted-foreground)] tabular-nums shrink-0">
          {stepIdx + 1} / {items.length}
        </div>
      </div>

      <motion.div
        key={it.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "tween", duration: 0.2 }}
      >
        <PlayItem
          item={it}
          index={stepIdx}
          total={items.length}
          value={answers[it.id]?.value}
          onChange={(v) => setAnswer(it.id, v)}
          codeLanguage={codeLanguage}
        />
      </motion.div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStepIdx(stepIdx - 1)}
          disabled={stepIdx === 0}
        >
          <ChevronLeft className="size-3.5" /> 上一题
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStepIdx(stepIdx + 1)}
          disabled={stepIdx >= items.length - 1}
        >
          下一题 <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function PlayItem({
  item,
  index,
  total,
  value,
  onChange,
  onFocus,
  isFocused,
  codeLanguage,
}: {
  item: QuizSessionItem
  index: number
  total: number
  value: string | number | null | undefined
  onChange: (v: string | number | null) => void
  onFocus?: () => void
  isFocused?: boolean
  codeLanguage: RunLang
}) {
  const [focusOpen, setFocusOpen] = useState(false)
  const focusItem = {
    id: String(item.id),
    type: item.type,
    question: item.question,
    options: item.options,
    starter: item.type === "code" ? String(value ?? item.starter ?? "") : item.starter,
    answer: item.answer_key ?? "",
    explanation: item.explanation,
    difficulty: item.difficulty,
  }

  return (
    <>
      <div
        data-quiz-item-id={item.id}
        className={`relative rounded-[22px] border bg-[#FFFEFA] p-5 shadow-[0_9px_24px_rgba(24,35,45,.04)] transition-all duration-300 ${
          isFocused
            ? "border-[#7F9AAA] ring-2 ring-[#315E83]/18 ring-offset-2 ring-offset-[#F3F0E7]"
            : "border-[#CFC8B9]"
        }`}
        onMouseDown={onFocus}
        onFocusCapture={onFocus}
      >
      {isFocused && <FocusBadge />}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] tabular-nums">
          {index + 1}/{total}
        </span>
        <span className="rounded bg-[#E7EDF3] px-1.5 py-0.5 text-[10px] uppercase text-[#315E83]">
          {item.type}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)]">难度 {item.difficulty}/4</span>
        {item.type === "code" && (
          <button
            type="button"
            onClick={() => setFocusOpen(true)}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CFC8B9] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#244C66] transition-colors hover:border-[#7F9AAA] hover:bg-[#E7EDF3]"
          >
            <Maximize2 className="size-3.5" /> 放大编程
          </button>
        )}
      </div>

      <div className="text-sm font-medium mb-3 leading-relaxed">
        <Markdown content={item.question} />
      </div>

      {item.type === "mcq" && (
        <div className="space-y-1.5">
          {item.options.map((opt, i) => (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all ${
                value === i
                  ? "border-[#7F9AAA] bg-[#E7EDF3] text-[#244C66]"
                  : "border-[#D7D1C4] bg-[#FFFEFA] hover:border-[#AEBAB5] hover:bg-[#F8F6F0]"
              }`}
            >
              <input
                type="radio"
                name={`mcq-${item.id}`}
                checked={value === i}
                onChange={() => onChange(i)}
                className="mt-0.5 accent-[#315E83]"
              />
              <span className="text-sm flex-1">
                <span className="opacity-50 mr-1.5">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </span>
            </label>
          ))}
        </div>
      )}

      {item.type === "fill" && (
        <input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder="在此填写答案..."
          className="h-11 w-full rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-sm outline-none focus:border-[#9FB1BC] focus:ring-2 focus:ring-[#315E83]/10"
        />
      )}

      {item.type === "code" && (
        <div className="space-y-2.5">
          <CodeEditor
            value={String(value ?? "")}
            onChange={onChange}
            language={codeLanguage}
            height="300px"
            className="rounded-xl"
          />
          <CodeRunner
            source={String(value ?? "")}
            defaultLanguage={codeLanguage}
            allowLanguageSwitch
            allowStdin
            compact
            className="rounded-xl"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onChange(item.starter ?? "")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-semibold text-[#58636B] transition-colors hover:bg-[#F3F0E7] hover:text-[#244C66]"
            >
              <RotateCcw className="size-3.5" /> 恢复起步代码
            </button>
          </div>
        </div>
      )}
      </div>

      {item.type === "code" && (
        <QuizFocusModal
          open={focusOpen}
          items={[focusItem]}
          defaultLanguage={codeLanguage}
          onClose={() => setFocusOpen(false)}
          onSubmit={(result) => {
            onChange(result.user_answer)
            setFocusOpen(false)
          }}
        />
      )}
    </>
  )
}

function ReviewView({
  items,
  session,
  setSelfCorrect,
  answersDraft,
  courseName,
  onFocusItem,
  focusItemId,
}: {
  items: QuizSessionItem[]
  session: QuizSession
  setSelfCorrect: (id: number, ok: boolean) => void
  answersDraft: AnswerMap
  courseName: string
  onFocusItem: (id: number) => void
  focusItemId: number | null
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <ReviewItem
          key={it.id}
          item={it}
          index={i}
          total={items.length}
          session={session}
          courseName={courseName}
          selfCorrectDraft={answersDraft[it.id]?.selfCorrect}
          onSetSelf={(ok) => setSelfCorrect(it.id, ok)}
          onFocus={() => onFocusItem(it.id)}
          isFocused={focusItemId === it.id}
        />
      ))}
    </div>
  )
}

function ReviewItem({
  item,
  index,
  total,
  session,
  courseName,
  selfCorrectDraft,
  onSetSelf,
  onFocus,
  isFocused,
}: {
  item: QuizSessionItem
  index: number
  total: number
  session: QuizSession
  courseName: string
  selfCorrectDraft: boolean | undefined
  onSetSelf: (ok: boolean) => void
  onFocus?: () => void
  isFocused?: boolean
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0

  const isCorrect = item.is_correct
  const showCorrect = isCorrect ? "对" : "错"
  const tone = isCorrect
    ? "border-[#C9D1CB] bg-[#F5F8F3]"
    : "border-[#DFC8BE] bg-[#FCF7F4]"

  const correctAnsStr = formatCorrectAnswer(item)
  const userAnsStr = formatUserAnswer(item)
  const errorTags = isCorrect
    ? []
    : effectiveQuizErrorTags(item.question, item.type, item.user_answer, item.judge_reason, item.error_tags)

  const handleSaveWrong = async ({ folder, title }: { folder: string; title: string }) => {
    const tags = [courseName, session.topic, "错题", item.type, ...errorTags.map((tag) => `错误类型:${tag}`)].filter(Boolean)
    const body =
      `**题目**：\n${item.question}\n\n` +
      (item.type === "mcq" && item.options.length
        ? `**选项**：\n${item.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}\n\n`
        : "") +
      `**我的答案**：${userAnsStr || "（未答）"}\n\n` +
      `**正确答案**：${correctAnsStr}\n\n` +
      `**错误类型**：${errorTags.join("、") || "待复盘"}\n\n` +
      `## 解析\n${item.explanation}\n` +
      (item.type === "code"
        ? `\n## 标答\n\`\`\`python\n${item.answer_key ?? ""}\n\`\`\`\n`
        : "")
    await apiPost("/notes", {
      user_id: USER_ID,
      course_id: session.course_id,
      title,
      content_md: body,
      tags,
      folder,
      source: "quiz",
    })
    workspaceStore.recordResourceConsumed("note")
    setSavedFlash(true)
  }

  return (
    <div
      data-quiz-item-id={item.id}
      className={`relative rounded-[18px] border p-4 transition-all duration-300 ${tone} ${
        isFocused
          ? "ring-2 ring-[#315E83]/45 ring-offset-2 ring-offset-[#FFFEFA] shadow-[0_12px_30px_rgba(49,94,131,.12)]"
          : ""
      }`}
      onMouseDown={onFocus}
      onFocusCapture={onFocus}
    >
      {isFocused && <FocusBadge />}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#F1EDE4] px-1.5 py-0.5 text-xs tabular-nums text-[#66717B]">
            {index + 1}/{total}
          </span>
          <span className="rounded-md bg-[#E7EDF3] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#315E83]">
            {item.type}
          </span>
          {isCorrect ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#557052]">
              <CheckCircle2 className="size-3.5" /> {showCorrect} · {item.score} 分
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#9A4E35]">
              <XCircle className="size-3.5" /> {showCorrect} · {item.score} 分
            </span>
          )}
        </div>
        {!isCorrect && (
          <button
            onClick={() => setSaveOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#66717B] transition-colors hover:text-[#557052]"
          >
            {savedFlash ? (
              <>
                <Check className="size-3" /> 已存入错题本
              </>
            ) : (
              <>
                <NotebookText className="size-3" /> 加入错题本
              </>
            )}
          </button>
        )}
      </div>

      <div className="text-sm mb-2 leading-relaxed">
        <Markdown content={item.question} />
      </div>

      {!isCorrect && errorTags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#DFC8BE] bg-[#FFFEFA] px-3 py-2">
          <span className="text-[10px] font-bold text-[#9A4E35]">错误类型</span>
          {errorTags.map((tag) => <span key={tag} className="rounded-full bg-[#F4E8E2] px-2 py-0.5 text-[10px] font-semibold text-[#9A4E35]">{tag}</span>)}
          <span className="ml-auto text-[9px] text-[#7A817F]">后续测验将优先安排同类变式</span>
        </div>
      )}

      {/* 答案对比 */}
      <div className="mb-2 space-y-1 rounded-xl border border-[#DDD7CB] bg-[#FFFEFA] px-3 py-2 text-xs">
        <div>
          <span className="text-[var(--muted-foreground)]">我的答案：</span>
          <span className={isCorrect ? "font-semibold text-[#557052]" : "font-semibold text-[#9A4E35]"}>
            {userAnsStr || "（未答）"}
          </span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">正确答案：</span>
          <span className="font-semibold text-[#557052]">{correctAnsStr}</span>
        </div>
        {item.type === "code" && item.judge_reason && (
          <div className="text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)] mt-1">
            <span className="opacity-70">评分理由：</span>{item.judge_reason}
          </div>
        )}
      </div>

      {/* 解析 */}
      {item.explanation && (
        <div className="mt-2 rounded-xl border border-[#D9CFB7] bg-[#FBF7ED] p-3 text-xs leading-5 text-[#59636B]">
          <strong className="text-[#8E6925]">解析：</strong>
          {item.explanation}
          {item.type === "code" && item.answer_key && (
            <details className="mt-1.5">
              <summary className="cursor-pointer font-semibold text-[#66717B] hover:text-[#8E6925]">
                查看标答代码
              </summary>
              <pre className="mt-1 p-2 rounded bg-zinc-950 text-zinc-100 text-[11px] overflow-x-auto">
                {String(item.answer_key)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* self 评分（code 题且 session.code_grading === self 且未自评） */}
      {item.type === "code" && session.code_grading === "self" && !isCorrect && (
        <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          自评提示：对比标答觉得自己写对了？
          <button
            onClick={() => onSetSelf(true)}
            className={`ml-2 rounded-lg border px-2 py-0.5 ${selfCorrectDraft === true ? "border-[#557052] bg-[#557052] text-white" : "border-[#D7D1C4] bg-[#FFFEFA]"}`}
          >
            写对了
          </button>
          <button
            onClick={() => onSetSelf(false)}
            className={`ml-1.5 rounded-lg border px-2 py-0.5 ${selfCorrectDraft === false ? "border-[#9A4E35] bg-[#9A4E35] text-white" : "border-[#D7D1C4] bg-[#FFFEFA]"}`}
          >
            写错了
          </button>
        </div>
      )}

      <SaveToNotebookModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onConfirm={handleSaveWrong}
        defaultTitle={`错题 · ${session.topic} · 第${index + 1}题`}
        defaultFolder={courseName || ""}
        description={`将这道错题保存到笔记本（自动记录 ${errorTags.join("、") || item.type} 标签）`}
      />
    </div>
  )
}

function FocusBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="absolute -top-2.5 right-3 z-10 flex items-center gap-1 rounded-full bg-[#315E83] px-2 py-0.5 text-[10px] font-medium text-white shadow-lg shadow-[#315E83]/20"
    >
      <Sparkles className="size-3" />
      <span>助教已锁定</span>
    </motion.div>
  )
}

function ResultStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: typeof Trophy
  tone: "indigo" | "emerald" | "amber" | "sky"
}) {
  const palette = {
    indigo: "text-[#315E83] bg-[#E7EDF3] border-[#C7D2D8]",
    emerald: "text-[#557052] bg-[#E9EEE6] border-[#C9D1CB]",
    amber: "text-[#8E6925] bg-[#F4ECD8] border-[#DDD4BF]",
    sky: "text-[#3E7774] bg-[#E5EFEC] border-[#C8D8D2]",
  }[tone]
  return (
    <div className={`rounded-lg border p-3 ${palette}`}>
      <div className="flex items-center gap-2 text-[11px] opacity-80">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  )
}

function countAnswered(items: QuizSessionItem[], answers: AnswerMap): number {
  return items.filter((it) => {
    const v = answers[it.id]?.value
    if (it.type === "mcq") return typeof v === "number" && v >= 0
    if (it.type === "fill") return typeof v === "string" && v.trim().length > 0
    if (it.type === "code") {
      return typeof v === "string" && v.trim().length > 0 && v.trim() !== (it.starter ?? "").trim()
    }
    return false
  }).length
}

function formatCorrectAnswer(it: QuizSessionItem): string {
  if (it.type === "mcq") {
    const idx = typeof it.answer_key === "number" ? it.answer_key : -1
    if (idx >= 0 && it.options[idx]) {
      return `${String.fromCharCode(65 + idx)}. ${it.options[idx]}`
    }
    return String(it.answer_key ?? "")
  }
  if (it.type === "fill") return String(it.answer_key ?? "")
  return "（见标答代码）"
}

function formatUserAnswerForSnippet(it: QuizSessionItem, answers: AnswerMap): string {
  // 已提交：用 item.user_answer；未提交：用本地 answers state
  const v = it.user_answer ?? answers[it.id]?.value
  if (v == null || v === "" || v === -1) return ""
  if (it.type === "code" && String(v).trim() === (it.starter ?? "").trim()) return ""
  if (it.type === "mcq") {
    const idx = typeof v === "number" ? v : Number(v)
    if (idx >= 0 && it.options[idx]) {
      return `${String.fromCharCode(65 + idx)}. ${it.options[idx]}`
    }
    return ""
  }
  return String(v).slice(0, 200)
}

function formatUserAnswer(it: QuizSessionItem): string {
  if (it.user_answer == null) return ""
  if (it.type === "mcq") {
    const idx = typeof it.user_answer === "number" ? it.user_answer : Number(it.user_answer)
    if (idx >= 0 && it.options[idx]) {
      return `${String.fromCharCode(65 + idx)}. ${it.options[idx]}`
    }
    return ""
  }
  return String(it.user_answer)
}

function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}m${ss}s`
}
