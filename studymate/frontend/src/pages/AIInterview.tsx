import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AudioLines, ExternalLink, FileCheck2, Headphones, LoaderCircle, Radio, ShieldCheck, Target } from "lucide-react"

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

const interviewStages = [
  { label: "岗位校准", image: "/images/interview-stage-calibration-v1.png", tone: "calibration" },
  { label: "模拟问答", image: "/images/interview-stage-dialogue-v1.png", tone: "dialogue" },
  { label: "能力评估", image: "/images/interview-stage-assessment-v1.png", tone: "assessment" },
  { label: "反馈回流", image: "/images/interview-stage-feedback-v1.png", tone: "feedback" },
] as const

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
      <summary className="cursor-pointer text-[11px] font-black">查看评估报告</summary>
      <div className="mt-3 space-y-3 text-[11px] leading-5">
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

export function AIInterview() {
  const role = useTargetRole()
  const course = useCurrentCourse()
  const [launching, setLaunching] = useState(false)
  const [endingAttemptId, setEndingAttemptId] = useState("")
  const [error, setError] = useState("")
  const [attempts, setAttempts] = useState<InterviewAttempt[]>([])

  useEffect(() => {
    apiGet<InterviewAttemptList>("/interviews/attempts")
      .then((payload) => setAttempts(payload.items || []))
      .catch(() => setAttempts([]))
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

  return (
    <main className="app-page paper-theme interview-prep-studio min-h-dvh">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="interview" appearance="paper" labelOverride="面试备战中心" groupOverride="岗位胜任力闭环" selectionLabel={role?.name || "选择目标岗位"} showRocketFormation rocketVariant="honor" />
        <section className="interview-prep-shell mt-4 overflow-hidden">
          <header className="interview-prep-hero relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
            <div className="interview-prep-signal" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="interview-prep-live-row relative flex items-center justify-between gap-3 pb-4">
              <div className="flex items-center gap-3"><span className="interview-prep-live-dot size-2 rounded-full" /><span>LIVE INTERVIEW</span><b>CHANNEL 05</b></div>
              <span className="hidden sm:block">准备配置 → 模拟对话 → 反馈复盘</span>
            </div>
            <div className="relative mt-5 grid gap-5 xl:grid-cols-[minmax(260px,.68fr)_minmax(560px,1.32fr)] xl:items-stretch">
              <div className="interview-prep-intro flex min-w-0 flex-col justify-between py-1">
                <div className="interview-prep-index"><strong>05</strong><span>面试备战中心</span><i>INTERVIEW STUDIO</i></div>
                <h1 className="interview-prep-title mt-4">让表达<br /><span>带回反馈</span></h1>
                <p className="interview-prep-lead mt-4 max-w-lg">按目标岗位生成真实问答，结束后把成绩与能力证据回流训练建议。</p>
                <div className="interview-prep-status-grid mt-5" aria-label="面试准备状态">
                  <span><small>目标岗位</small><strong>{role ? "READY" : "WAIT"}</strong></span>
                  <span><small>能力标签</small><strong>{String(role?.skills?.length || 0).padStart(2, "0")}</strong></span>
                  <span><small>历史反馈</small><strong>{String(attempts.filter((item) => item.status === "completed").length).padStart(2, "0")}</strong></span>
                </div>
              </div>
              <section className="interview-prep-cockpit relative overflow-hidden p-5 sm:p-6" aria-labelledby="interview-context">
                <div className="interview-prep-mic-stage" aria-hidden="true">
                  <span className="interview-prep-orbit is-one" /><span className="interview-prep-orbit is-two" />
                  <div className="interview-prep-mic-product"><img src="/images/interview-studio-microphone-v1.png" alt="" /><i /></div>
                  <span className="interview-prep-packet is-left"><AudioLines /></span><span className="interview-prep-packet is-right"><Radio /></span>
                  <span className="interview-prep-level-meter"><i /><i /><i /><i /><i /><i /><i /></span>
                </div>
                <div className="interview-prep-cockpit-content relative z-10">
                  <div className="interview-prep-section-title flex items-center gap-3"><span><Headphones /></span><div><p>01 · 会话配置</p><h2 id="interview-context">本次面试上下文</h2></div></div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="interview-prep-data-cell rounded-xl p-3"><dt>目标岗位</dt><dd>{role?.name || "尚未选择"}</dd></div>
                    <div className="interview-prep-data-cell rounded-xl p-3"><dt>岗位知识库</dt><dd>{course?.name || role?.courseName || "待绑定"}</dd></div>
                  </dl>
                  <div className="interview-prep-skill-line mt-3 flex flex-wrap items-center gap-1.5">
                    <p className="interview-prep-label mr-1">能力校准</p>
                    {(role?.skills || []).map((skill) => <span key={skill} className="interview-prep-skill rounded-full px-2.5 py-1 text-[10px] font-bold">{skill}</span>)}
                    {!role && <span className="text-xs font-semibold text-[#526D87]">选择岗位后生成能力题目</span>}
                  </div>
                  <div className="interview-prep-launch-row mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {role ? <button type="button" onClick={() => void startInterview()} disabled={launching} className="interview-prep-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60">{launching ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}{launching ? "正在建立安全会话" : "进入独立 AI 面试"}</button> : <Link to="/courses?returnTo=%2Fai-interview" className="interview-prep-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-xs font-black text-white"><Target className="size-4" />选择目标岗位</Link>}
                    <span className="interview-prep-note text-[10px] font-semibold leading-4">沿用当前账号进入独立面试，无需二次注册。</span>
                  </div>
                  {error && <p className="mt-3 text-xs font-semibold text-[#9A4E35]" role="alert">{error}</p>}
                </div>
              </section>
            </div>
          </header>

          <div className="interview-prep-stage-rail relative grid grid-cols-4 overflow-hidden" aria-label="面试反馈流程">
            <span className="interview-prep-route-signal" aria-hidden="true" />
            {interviewStages.map((stage, index) => <div key={stage.label} className={`interview-prep-stage is-${stage.tone}`}>
              <img src={stage.image} alt="" aria-hidden="true" decoding="async" />
              <span className="interview-prep-stage-shade" aria-hidden="true" />
              <span className="interview-prep-stage-copy"><i>{String(index + 1).padStart(2, "0")}</i><b>{stage.label}</b></span>
            </div>)}
          </div>

          <section className="interview-prep-support px-5 py-8 sm:px-8" aria-labelledby="interview-support">
            <div className="interview-prep-support-heading flex flex-wrap items-end justify-between gap-3"><div><p>02 · 准备保障</p><h2 id="interview-support">进入对话前，链路已就绪</h2></div><span>账号承接与成绩回流同步工作</span></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <article className="interview-prep-info-card is-security rounded-[20px] p-5"><span><ShieldCheck /></span><p>安全链路 · ACCOUNT</p><h3>沿用当前账号</h3><div>直接进入 AI 面试，不需要创建第二套普通用户账号；岗位与课程上下文随会话带入。</div><i aria-hidden="true" /></article>
              <article className="interview-prep-info-card is-feedback rounded-[20px] p-5"><span><FileCheck2 /></span><p>反馈闭环 · EVIDENCE</p><h3>成绩回流训练</h3><div>面试完成后同步成绩、回答证据与改进建议，用于刷新后续训练重点。</div><i aria-hidden="true" /></article>
            </div>
          </section>
          <section className="interview-prep-history px-5 py-6 sm:px-8" aria-labelledby="interview-history">
            <div className="flex items-center justify-between gap-3"><div className="interview-prep-section-title flex items-center gap-3"><span><Radio /></span><div><p>04 · 反馈记录</p><h2 id="interview-history">最近面试</h2></div></div><span className="interview-prep-note text-[10px] font-semibold">仅显示当前账号记录</span></div>
            {attempts.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{attempts.slice(0, 6).map((attempt) => <article key={attempt.id} className={`interview-prep-attempt ${resumableStatuses.has(attempt.status) ? "is-active" : attempt.status === "completed" ? "is-complete" : "is-idle"} rounded-[16px] px-4 py-3`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-[#245D88]">{attempt.role_name}</p><p className="mt-1 text-[10px] font-semibold text-[#617990]">{attempt.created_at ? new Date(attempt.created_at).toLocaleString() : ""}</p></div><div className="shrink-0 text-right"><span className="interview-prep-status text-[10px] font-black">{statusLabels[attempt.status] || attempt.status}</span>{attempt.score_summary?.overall_score != null && <p className="mt-1 text-sm font-extrabold text-[#16324C]">{scoreText(attempt.score_summary.overall_score)}</p>}</div></div>{resumableStatuses.has(attempt.status) && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void resumeInterview(attempt.id)} disabled={launching || Boolean(endingAttemptId)} className="interview-prep-secondary inline-flex h-9 items-center rounded-lg px-3 text-[10px] font-black disabled:cursor-wait disabled:opacity-60">继续面试</button><button type="button" onClick={() => void abandonInterview(attempt.id)} disabled={launching || Boolean(endingAttemptId)} className="interview-prep-danger inline-flex h-9 items-center rounded-lg px-3 text-[10px] font-black disabled:cursor-wait disabled:opacity-60">{endingAttemptId === attempt.id ? "正在结束" : "结束记录"}</button></div>}<ReportPreview report={attempt.report} /></article>)}</div> : <p className="interview-prep-empty mt-4 text-xs font-semibold">完成第一次模拟面试后，报告会出现在这里。</p>}
          </section>
        </section>
      </div>
    </main>
  )
}
