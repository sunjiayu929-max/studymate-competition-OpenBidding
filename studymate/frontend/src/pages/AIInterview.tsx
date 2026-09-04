import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ExternalLink, LoaderCircle, Radio, Target } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet, apiPost } from "@/lib/api"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

import "./AIInterview.css"

interface InterviewAttempt {
  id: string
  role_id: string
  role_name: string
  status: string
  created_at?: string | null
  completed_at?: string | null
  score_summary?: { overall_score?: number; role_match_score?: number; general_score?: number }
  report?: InterviewReport
}

interface InterviewAttemptList { items: InterviewAttempt[] }
interface InterviewLaunchResponse { launch_url: string }
interface InterviewAbandonResponse { attempt: InterviewAttempt }

const resumableStatuses = new Set(["launch_ready", "launched", "in_progress"])

interface InterviewCompetencyReport {
  competency: string
  score: number
  evidence?: string
  improvement?: string
}

interface InterviewReport {
  summary?: string
  strengths?: string[]
  improvements?: string[]
  competency_scores?: InterviewCompetencyReport[]
}

const statusLabels: Record<string, string> = {
  launch_ready: "待开始",
  launched: "已进入",
  in_progress: "进行中",
  completed: "已完成",
  report_failed: "报告待重试",
  failed: "需重试",
  abandoned: "已结束",
}

function scoreText(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-"
}

function ReportPreview({ report }: { report?: InterviewReport }) {
  if (!report) return null
  const hasDetails = Boolean(
    report.summary || report.competency_scores?.length || report.strengths?.length || report.improvements?.length,
  )
  if (!hasDetails) return null

  return (
    <details className="interview-prep-report mt-3 pt-2">
      <summary className="cursor-pointer text-[13px] font-black">查看评估报告</summary>
      <div className="mt-3 space-y-3 text-[13px] leading-6">
        {report.summary && <p>{report.summary}</p>}
        {report.competency_scores?.length ? <div className="grid gap-2 sm:grid-cols-2">
          {report.competency_scores.map((item) => <article key={item.competency} className="interview-prep-report-card rounded-xl p-3">
            <div className="flex items-center justify-between gap-2"><strong>{item.competency}</strong><span className="font-extrabold">{scoreText(item.score)}</span></div>
            {item.evidence && <p className="mt-1.5"><span className="font-semibold">证据：</span>{item.evidence}</p>}
            {item.improvement && <p className="mt-1"><span className="font-semibold">建议：</span>{item.improvement}</p>}
          </article>)}
        </div> : null}
        {report.strengths?.length ? <div><p className="font-bold">优势</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {report.improvements?.length ? <div><p className="font-bold">改进建议</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{report.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      </div>
    </details>
  )
}

interface AttemptCardProps {
  attempt: InterviewAttempt
  featured?: boolean
  launching: boolean
  endingAttemptId: string
  onResume: (attemptId: string) => void
  onAbandon: (attemptId: string) => void
}

function AttemptCard({ attempt, featured = false, launching, endingAttemptId, onResume, onAbandon }: AttemptCardProps) {
  const isResumable = resumableStatuses.has(attempt.status)
  const stateClass = isResumable ? "is-active" : attempt.status === "completed" ? "is-complete" : "is-idle"

  return (
    <article className={`interview-prep-attempt ${stateClass}${featured ? " is-featured" : ""} rounded-[16px] px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-[#245D88]">{attempt.role_name}</p>
          <p className="mt-1 text-xs font-semibold text-[#617990]">{attempt.created_at ? new Date(attempt.created_at).toLocaleString() : "时间待同步"}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="interview-prep-status text-xs font-black">{statusLabels[attempt.status] || attempt.status}</span>
          {attempt.score_summary?.overall_score != null && <p className="mt-1 text-sm font-extrabold text-[#16324C]">{scoreText(attempt.score_summary.overall_score)}</p>}
        </div>
      </div>
      {isResumable && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onResume(attempt.id)} disabled={launching || Boolean(endingAttemptId)} className="interview-prep-secondary inline-flex h-9 items-center rounded-lg px-3 text-xs font-black disabled:cursor-wait disabled:opacity-60">继续面试</button>
        <button type="button" onClick={() => onAbandon(attempt.id)} disabled={launching || Boolean(endingAttemptId)} className="interview-prep-danger inline-flex h-9 items-center rounded-lg px-3 text-xs font-black disabled:cursor-wait disabled:opacity-60">{endingAttemptId === attempt.id ? "正在结束" : "结束记录"}</button>
      </div>}
      <ReportPreview report={attempt.report} />
    </article>
  )
}

export function AIInterview() {
  const role = useTargetRole()
  const course = useCurrentCourse()
  const [launching, setLaunching] = useState(false)
  const [loadingAttempts, setLoadingAttempts] = useState(true)
  const [endingAttemptId, setEndingAttemptId] = useState("")
  const [error, setError] = useState("")
  const [attempts, setAttempts] = useState<InterviewAttempt[]>([])

  useEffect(() => {
    apiGet<InterviewAttemptList>("/interviews/attempts")
      .then((payload) => setAttempts(payload.items || []))
      .catch(() => setAttempts([]))
      .finally(() => setLoadingAttempts(false))
  }, [])

  async function resumeInterview(attemptId: string) {
    setLaunching(true)
    setError("")
    try {
      const payload = await apiPost<InterviewLaunchResponse>(`/interviews/attempts/${encodeURIComponent(attemptId)}/launch`)
      if (!payload.launch_url) throw new Error("面试服务未返回启动地址")
      window.location.assign(payload.launch_url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "面试服务暂时不可用，请稍后重试")
      setLaunching(false)
    }
  }

  async function abandonInterview(attemptId: string) {
    if (!window.confirm("这会将该面试标记为已结束，之后不能从该记录继续，确认结束吗？")) return
    setEndingAttemptId(attemptId)
    setError("")
    try {
      const payload = await apiPost<InterviewAbandonResponse>(`/interviews/attempts/${encodeURIComponent(attemptId)}/abandon`)
      setAttempts((current) => current.map((item) => item.id === attemptId ? payload.attempt : item))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "结束面试记录失败，请稍后重试")
    } finally {
      setEndingAttemptId("")
    }
  }

  async function startInterview() {
    if (!role) {
      setError("请先选择目标岗位")
      return
    }
    setLaunching(true)
    setError("")
    try {
      const activeAttempt = attempts.find((item) => item.role_id === role.id && resumableStatuses.has(item.status))
      if (activeAttempt) {
        await resumeInterview(activeAttempt.id)
        return
      }
      const payload = await apiPost<InterviewLaunchResponse>("/interviews/attempts", {
        role_id: role.id,
        course_id: course?.name === role.courseName ? course.id : null,
      })
      if (!payload.launch_url) throw new Error("面试服务未返回启动地址")
      window.location.assign(payload.launch_url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "面试服务暂时不可用，请稍后重试")
      setLaunching(false)
    }
  }

  const activeRoleAttempt = role
    ? attempts.find((item) => item.role_id === role.id && resumableStatuses.has(item.status))
    : undefined
  const latestAttempt = attempts[0]
  const previousAttempts = attempts.slice(1, 6)

  return (
    <main className="app-page paper-theme interview-prep-studio min-h-dvh">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="interview" appearance="paper" labelOverride="面试备战中心" groupOverride="岗位胜任力闭环" selectionLabel={role?.name || "选择目标岗位"} />

        <section className="interview-prep-shell mt-4 overflow-hidden" aria-label="AI 面试准备与反馈">
          <div className="interview-prep-overview grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,.88fr)] lg:items-start">
            <section className="interview-prep-context rounded-[20px] p-5 sm:p-6" aria-labelledby="interview-context">
              <div className="interview-prep-section-title">
                <p>本次面试</p>
                <h2 id="interview-context">确认岗位上下文</h2>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="interview-prep-data-cell is-role rounded-xl p-3"><dt>目标岗位</dt><dd>{role?.name || "尚未选择"}</dd></div>
                <div className="interview-prep-data-cell is-course rounded-xl p-3"><dt>岗位知识库</dt><dd>{course?.name || role?.courseName || "待绑定"}</dd></div>
              </dl>

              <div className="interview-prep-skill-line mt-3 flex flex-wrap items-center gap-1.5">
                <p className="interview-prep-label mr-1">面试能力</p>
                {(role?.skills || []).map((skill) => <span key={skill} className="interview-prep-skill rounded-full px-2.5 py-1 text-xs font-bold">{skill}</span>)}
                {!role && <span className="text-xs font-semibold text-[#526D87]">选择岗位后生成对应题目</span>}
              </div>

              <div className="interview-prep-loop mt-3" aria-label="岗位面试反馈闭环">
                <span>岗位与课程上下文</span><ArrowRight aria-hidden="true" /><span>AI 实战</span><ArrowRight aria-hidden="true" /><strong>证据回流训练</strong>
              </div>

              <div className="interview-prep-launch-row mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                {role ? <button type="button" onClick={() => void startInterview()} disabled={launching || loadingAttempts} className="interview-prep-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60">{launching || loadingAttempts ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}{loadingAttempts ? "正在确认面试记录" : launching ? "正在建立安全会话" : activeRoleAttempt ? "继续本岗位面试" : "开始 AI 面试"}</button> : <Link to="/courses?returnTo=%2Fai-interview" className="interview-prep-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-xs font-black text-white"><Target className="size-4" />选择目标岗位</Link>}
                <span className="interview-prep-note text-xs font-semibold leading-5">沿用当前账号，无需二次注册。</span>
              </div>
              {error && <p className="interview-prep-error mt-3 text-xs font-semibold" role="alert">{error}</p>}
            </section>

            <section className="interview-prep-latest rounded-[20px] p-5 sm:p-6" aria-labelledby="interview-latest">
              <div className="interview-prep-section-title flex items-center justify-between gap-3">
                <div><p>面试结果</p><h2 id="interview-latest">最近一次面试</h2></div>
                <Radio className="size-5" aria-hidden="true" />
              </div>
              {loadingAttempts ? <div className="interview-prep-empty mt-4 flex items-center gap-2 text-xs font-semibold"><LoaderCircle className="size-4 animate-spin" />正在加载面试记录…</div> : latestAttempt ? <div className="mt-4"><AttemptCard attempt={latestAttempt} featured launching={launching} endingAttemptId={endingAttemptId} onResume={(attemptId) => void resumeInterview(attemptId)} onAbandon={(attemptId) => void abandonInterview(attemptId)} /></div> : <p className="interview-prep-empty mt-4 text-xs font-semibold">还没有面试记录。完成首次模拟后，状态、分数和反馈会出现在这里。</p>}
            </section>
          </div>

          <section className="interview-prep-path flex-1 px-4 py-5 sm:px-5 sm:py-6" aria-labelledby="interview-path">
            <div className="interview-prep-path-heading flex flex-wrap items-end justify-between gap-2">
              <div className="interview-prep-section-title">
                <p>面试闭环</p>
                <h2 id="interview-path">从岗位问题到可复用反馈</h2>
              </div>
              <span className="interview-prep-note text-xs font-semibold">一次面试，沉淀下一轮训练重点</span>
            </div>
            <div className="interview-prep-path-grid mt-4 grid gap-3 md:grid-cols-3">
              <article className="interview-prep-path-card rounded-[18px] p-4">
                <span>01</span>
                <div><h3>岗位校准</h3><p>{role ? `围绕 ${role.name} 的 ${role.skills.length} 项能力生成针对性问题。` : "选择目标岗位后，自动带入岗位与课程上下文。"}</p></div>
              </article>
              <article className="interview-prep-path-card rounded-[18px] p-4">
                <span>02</span>
                <div><h3>AI 模拟问答</h3><p>进入独立会话完成结构化问答，进行中的记录可以随时继续。</p></div>
              </article>
              <article className="interview-prep-path-card rounded-[18px] p-4">
                <span>03</span>
                <div><h3>证据回流</h3><p>完成后回到最近面试，查看分数、回答证据与改进建议。</p></div>
              </article>
            </div>
          </section>

          {previousAttempts.length > 0 && <section className="interview-prep-history px-4 pb-5 sm:px-5 sm:pb-6" aria-labelledby="interview-history">
            <div className="interview-prep-history-heading flex items-end justify-between gap-3 border-t pt-5">
              <div className="interview-prep-section-title"><p>历史记录</p><h2 id="interview-history">其他最近面试</h2></div>
              <span className="interview-prep-note text-xs font-semibold">仅显示当前账号记录</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {previousAttempts.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} launching={launching} endingAttemptId={endingAttemptId} onResume={(attemptId) => void resumeInterview(attemptId)} onAbandon={(attemptId) => void abandonInterview(attemptId)} />)}
            </div>
          </section>}
        </section>
      </div>
    </main>
  )
}
