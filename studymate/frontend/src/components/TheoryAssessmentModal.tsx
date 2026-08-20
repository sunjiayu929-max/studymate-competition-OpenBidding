import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TimerReset,
} from "lucide-react"

import { apiGet, apiPost } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface TheoryAssessmentItem {
  id: string
  index: number
  type: "mcq" | "fill"
  question: string
  options: string[]
  difficulty: number
  competency: string
  source: string
  user_answer?: number | string | null
  correct_answer?: number | string
  is_correct?: boolean
  explanation?: string
}

export interface TheoryAssessment {
  id: number
  role_id: string
  role_name: string
  course_id: number
  status: "generating" | "ready" | "submitted" | "error"
  score: number | null
  items: TheoryAssessmentItem[]
  result: {
    knowledge_level?: string
    correct_count?: number
    total_count?: number
    competency_scores?: Record<string, number>
    weak_topics?: string[]
    source_count?: number
  }
}

export interface TheoryGateState {
  loading: boolean
  completed: boolean
  required: boolean
  assessment: TheoryAssessment | null
  error: string
}

interface StatusResponse {
  profile_ready: boolean
  profile_score: number
  required: boolean
  assessment: TheoryAssessment | null
}

interface TheoryAssessmentModalProps {
  enabled: boolean
  userId: number
  roleId: string
  roleName: string
  courseId: number
  competencies: string[]
  reopenSignal: number
  onGateChange: (state: TheoryGateState) => void
  onCompleted: (assessment: TheoryAssessment) => void
}

export function TheoryAssessmentModal({
  enabled,
  userId,
  roleId,
  roleName,
  courseId,
  competencies,
  reopenSignal,
  onGateChange,
  onCompleted,
}: TheoryAssessmentModalProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [assessment, setAssessment] = useState<TheoryAssessment | null>(null)
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const startedAtRef = useRef(Date.now())
  const requestRef = useRef<{ key: string; promise: Promise<TheoryAssessment> } | null>(null)
  const onGateChangeRef = useRef(onGateChange)
  const onCompletedRef = useRef(onCompleted)
  onGateChangeRef.current = onGateChange
  onCompletedRef.current = onCompleted

  const emitGate = (next: TheoryGateState) => onGateChangeRef.current(next)

  const createExam = (key: string) => {
    if (requestRef.current?.key === key) return requestRef.current.promise
    const promise = apiPost<TheoryAssessment>("/theory-assessments", {
      role_id: roleId,
      role_name: roleName,
      course_id: courseId,
      competencies,
    })
    requestRef.current = { key, promise }
    return promise
  }

  useEffect(() => {
    const key = `${userId}:${roleId}:${courseId}`
    let active = true
    setAnswers({})
    setCurrentIndex(0)
    setAssessment(null)
    setError("")
    if (!enabled) {
      setOpen(false)
      emitGate({ loading: false, completed: false, required: false, assessment: null, error: "" })
      return () => { active = false }
    }

    setLoading(true)
    emitGate({ loading: true, completed: false, required: false, assessment: null, error: "" })
    void apiGet<StatusResponse>(`/theory-assessments/status?role_id=${encodeURIComponent(roleId)}`)
      .then(async (status) => {
        if (!active) return
        if (status.assessment?.status === "submitted") {
          setAssessment(status.assessment)
          setOpen(false)
          emitGate({ loading: false, completed: true, required: false, assessment: status.assessment, error: "" })
          return
        }
        if (!status.profile_ready) {
          setOpen(false)
          emitGate({ loading: false, completed: false, required: false, assessment: null, error: "" })
          return
        }
        setOpen(true)
        let exam = status.assessment
        if (exam?.status === "generating") {
          setLoading(true)
          for (let attempt = 0; attempt < 30 && active && exam?.status === "generating"; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 800))
            const next = await apiGet<StatusResponse>(`/theory-assessments/status?role_id=${encodeURIComponent(roleId)}`)
            exam = next.assessment
          }
        }
        if (!exam || exam.status === "error") exam = await createExam(key)
        if (exam.status === "generating") throw new Error("岗位试卷仍在后台生成，请稍后重试。")
        if (!active) return
        setAssessment(exam)
        startedAtRef.current = Date.now()
        emitGate({ loading: false, completed: false, required: true, assessment: exam, error: "" })
      })
      .catch((cause) => {
        if (!active) return
        const message = cause instanceof Error ? cause.message : "理论测评加载失败，请稍后重试。"
        setError(message)
        setOpen(true)
        emitGate({ loading: false, completed: false, required: true, assessment: null, error: message })
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // 岗位或课程变化时重新校验；competencies 仅用于组卷，不作为门禁身份。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, enabled, roleId, roleName, userId])

  useEffect(() => {
    if (reopenSignal > 0 && enabled && assessment?.status !== "submitted") setOpen(true)
  }, [assessment?.status, enabled, reopenSignal])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [open])

  const hasAnswer = (itemId: string) => {
    const answer = answers[itemId]
    return typeof answer === "number" || (typeof answer === "string" && answer.trim().length > 0)
  }
  const answeredCount = assessment?.items.filter((item) => hasAnswer(item.id)).length ?? 0
  const sourceCount = useMemo(() => new Set(assessment?.items.map((item) => item.source)).size, [assessment])
  const current = assessment?.items[currentIndex]

  const retry = () => {
    const key = `${userId}:${roleId}:${courseId}:retry:${Date.now()}`
    setLoading(true)
    setError("")
    void createExam(key)
      .then((exam) => {
        setAssessment(exam)
        setAnswers({})
        setCurrentIndex(0)
        startedAtRef.current = Date.now()
        emitGate({ loading: false, completed: false, required: true, assessment: exam, error: "" })
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "重新组卷失败，请稍后重试。"
        setError(message)
        emitGate({ loading: false, completed: false, required: true, assessment: null, error: message })
      })
      .finally(() => setLoading(false))
  }

  const submit = async () => {
    if (!assessment || answeredCount !== assessment.items.length) return
    setSubmitting(true)
    setError("")
    try {
      const result = await apiPost<TheoryAssessment>(`/theory-assessments/${assessment.id}/submit`, {
        answers: assessment.items.map((item) => ({ item_id: item.id, answer: answers[item.id] })),
        duration_ms: Date.now() - startedAtRef.current,
      })
      setAssessment(result)
      setCurrentIndex(0)
      emitGate({ loading: false, completed: true, required: false, assessment: result, error: "" })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后重试。")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#08182B]/72 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="theory-assessment-title">
      <div className="flex max-h-[94dvh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-white/20 bg-[#F7F9FC] shadow-[0_32px_100px_rgba(0,0,0,.35)]">
        <header className="relative overflow-hidden bg-[#122C4D] px-5 py-5 text-white sm:px-7">
          <div className="absolute -right-16 -top-24 size-60 rounded-full bg-[#6E5AE6]/30 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.16em] text-[#AFC9EB]"><ShieldCheck className="size-4 text-[#6AD2B8]" />首次进入诊断门槛</div>
              <h2 id="theory-assessment-title" className="mt-2 text-xl font-bold tracking-[-.03em] sm:text-2xl">{roleName} · 理论基础测评</h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#BFD0E5]">试题由当前岗位知识库现场组卷。结果将与学历背景等先验画像共同交给学情诊断 Agent，用于确定训练起点。</p>
            </div>
            <div className="flex shrink-0 gap-2 text-[10px] font-bold text-[#D7E6F7]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Database className="size-3.5" />{sourceCount || "—"} 个知识来源</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><TimerReset className="size-3.5" />建议 8–12 分钟</span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[420px] place-items-center px-6 text-center">
            <div><Loader2 className="mx-auto size-8 animate-spin text-[#326CC0]" /><p className="mt-4 text-sm font-bold text-[#294A73]">正在检索岗位知识库并组织试卷</p><p className="mt-1 text-xs text-[#75849A]">命题 Agent 正在校验能力覆盖与知识来源…</p></div>
          </div>
        ) : error && !assessment ? (
          <div className="grid min-h-[420px] place-items-center px-6 text-center">
            <div className="max-w-md"><CircleAlert className="mx-auto size-9 text-[#B86342]" /><p className="mt-4 text-sm font-bold text-[#51453F]">暂时无法生成理论试卷</p><p role="alert" className="mt-2 text-xs leading-5 text-[#7D6D65]">{error}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={retry} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#245FAE] px-4 text-xs font-bold text-white"><RotateCcw className="size-4" />重新组卷</button><Link to="/courses?returnTo=%2Fcompetency" className="inline-flex h-10 items-center rounded-xl border border-[#D5DFEA] bg-white px-4 text-xs font-bold text-[#5C7089]">返回岗位选择</Link></div></div>
          </div>
        ) : assessment?.status === "submitted" ? (
          <AssessmentResult assessment={assessment} onContinue={() => { setOpen(false); onCompletedRef.current(assessment) }} />
        ) : assessment && current ? (
          <>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="border-b border-[#DCE5EF] bg-white p-4 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between text-[10px] font-bold text-[#6D7E94]"><span>答题进度</span><span>{answeredCount}/{assessment.items.length}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8EDF3]"><div className="h-full rounded-full bg-[#2F70C8] transition-[width]" style={{ width: `${answeredCount / assessment.items.length * 100}%` }} /></div>
                <div className="mt-4 grid grid-cols-8 gap-2 lg:grid-cols-4">
                  {assessment.items.map((item, index) => <button key={item.id} type="button" aria-label={`第 ${index + 1} 题${hasAnswer(item.id) ? "，已作答" : ""}`} onClick={() => setCurrentIndex(index)} className={cn("grid size-8 place-items-center rounded-lg border text-[10px] font-bold transition", currentIndex === index ? "border-[#2E6CC1] bg-[#E9F2FF] text-[#235DAF]" : hasAnswer(item.id) ? "border-[#BBDACF] bg-[#EAF7F2] text-[#1C8067]" : "border-[#D8E1EC] bg-white text-[#7D8B9E]")}>{index + 1}</button>)}
                </div>
                <div className="mt-5 hidden rounded-xl bg-[#F5F8FC] p-3 text-[10px] leading-5 text-[#718096] lg:block"><strong className="text-[#49617F]">说明</strong><br />本测评只用于定位起点，不影响课程资格。提交后不可修改。</div>
              </aside>

              <section className="min-h-0 overflow-y-auto p-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#E8F1FE] px-2.5 py-1 text-[10px] font-bold text-[#2E65B2]">第 {currentIndex + 1} 题 · {current.type === "mcq" ? "单选" : "填空"}</span><span className="rounded-full bg-[#E8F7F1] px-2.5 py-1 text-[10px] font-bold text-[#21806B]">{current.competency}</span><span className="rounded-full bg-[#F2EEFC] px-2.5 py-1 text-[10px] font-bold text-[#7256A8]">难度 L{current.difficulty}</span></div>
                <h3 className="mt-5 text-base font-bold leading-7 text-[#253F60] sm:text-lg">{current.question}</h3>
                {current.type === "mcq" ? (
                  <div className="mt-5 space-y-3">
                    {current.options.map((option, index) => {
                      const selected = answers[current.id] === index
                      return <button key={`${current.id}-${index}`} type="button" aria-pressed={selected} onClick={() => setAnswers((value) => ({ ...value, [current.id]: index }))} className={cn("flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-xs leading-6 transition", selected ? "border-[#3974C6] bg-[#EDF4FF] text-[#234E84] shadow-[0_8px_20px_rgba(52,105,178,.1)]" : "border-[#D9E3EE] bg-white text-[#52657D] hover:border-[#AEC5E2] hover:bg-[#F9FBFE]")}><span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold", selected ? "border-[#3974C6] bg-[#3974C6] text-white" : "border-[#CBD6E3] text-[#72839A]")}>{String.fromCharCode(65 + index)}</span><span>{option}</span></button>
                    })}
                  </div>
                ) : (
                  <div className="mt-5">
                    <label htmlFor={`theory-fill-${current.id}`} className="mb-2 block text-[11px] font-bold text-[#536B86]">填写关键术语或能力名称</label>
                    <input id={`theory-fill-${current.id}`} value={typeof answers[current.id] === "string" ? answers[current.id] : ""} onChange={(event) => setAnswers((value) => ({ ...value, [current.id]: event.target.value }))} placeholder="请输入答案" autoComplete="off" className="h-12 w-full rounded-2xl border border-[#D9E3EE] bg-white px-4 text-sm text-[#253F60] outline-none transition placeholder:text-[#A2AFBE] focus:border-[#3974C6] focus:ring-4 focus:ring-[#3974C6]/10" />
                    <p className="mt-2 text-[10px] leading-5 text-[#7A899C]">答案只需填写题干要求的关键词，不必抄写整段资料。</p>
                  </div>
                )}
              </section>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DCE5EF] bg-white px-5 py-4 sm:px-7">
              <Link to="/courses?returnTo=%2Fcompetency" className="text-[10px] font-bold text-[#77879A] hover:text-[#43678F]">稍后完成，返回岗位选择</Link>
              <div className="flex gap-2">
                <button type="button" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#D6E0EB] px-3 text-xs font-bold text-[#5D718B] disabled:opacity-40"><ChevronLeft className="size-4" />上一题</button>
                {currentIndex < assessment.items.length - 1 ? <button type="button" onClick={() => setCurrentIndex((value) => Math.min(assessment.items.length - 1, value + 1))} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#245FAE] px-4 text-xs font-bold text-white">下一题<ChevronRight className="size-4" /></button> : <button type="button" onClick={() => void submit()} disabled={submitting || answeredCount !== assessment.items.length} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#18836A] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}{answeredCount === assessment.items.length ? "提交并生成诊断" : `还差 ${assessment.items.length - answeredCount} 题`}</button>}
              </div>
              {error && <p role="alert" className="w-full text-right text-[10px] text-[#A85138]">{error}</p>}
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}

function AssessmentResult({ assessment, onContinue }: { assessment: TheoryAssessment; onContinue: () => void }) {
  const score = assessment.score ?? 0
  const competencyScores = Object.entries(assessment.result.competency_scores ?? {})
  const weakTopics = assessment.result.weak_topics ?? []
  return (
    <div className="min-h-0 overflow-y-auto p-5 sm:p-7">
      <div className="mx-auto max-w-3xl text-center"><CheckCircle2 className="mx-auto size-10 text-[#198168]" /><p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#5E7B71]">理论基线已写入学习者画像</p><div className="mt-2 text-5xl font-black tracking-[-.05em] text-[#173F6B]">{score}<span className="ml-1 text-base font-bold text-[#73849A]">分</span></div><p className="mt-2 text-sm font-bold text-[#345574]">知识基础：{assessment.result.knowledge_level ?? "待分析"}</p><p className="mt-1 text-xs text-[#718096]">答对 {assessment.result.correct_count ?? 0} / {assessment.result.total_count ?? assessment.items.length} 题 · 覆盖 {assessment.result.source_count ?? 0} 个知识来源</p></div>
      <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
        {competencyScores.map(([name, value]) => <div key={name} className="rounded-2xl border border-[#DCE5EF] bg-white p-4"><div className="flex justify-between text-[11px] font-bold text-[#405B7B]"><span>{name}</span><span>{value}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8EDF3]"><div className={cn("h-full rounded-full", value >= 60 ? "bg-[#25876E]" : "bg-[#D28B3D]")} style={{ width: `${value}%` }} /></div></div>)}
      </div>
      <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-[#D8E5F0] bg-[#F0F6FC] p-4 text-xs leading-6 text-[#536B86]"><strong className="text-[#294D75]">诊断 Agent 将如何使用：</strong>{weakTopics.length ? `优先补强 ${weakTopics.join("、")}，并结合你的学历背景与岗位目标调整首轮资源难度。` : "当前理论基础较完整，首轮将更快进入岗位场景应用与迁移训练。"}</div>
      <div className="mt-6 text-center"><button type="button" onClick={onContinue} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#245FAE] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(36,95,174,.2)]">进入岗位训练中心<ChevronRight className="size-4" /></button></div>
    </div>
  )
}
