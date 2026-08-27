import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ExternalLink, FileCheck2, LoaderCircle, ShieldCheck, Target } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet, apiPost } from "@/lib/api"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

interface InterviewAttempt {
  id: string
  role_id: string
  role_name: string
  status: string
  created_at?: string | null
  score_summary?: { overall_score?: number; role_match_score?: number; general_score?: number }
  report?: InterviewReport
}

interface InterviewAttemptList { items: InterviewAttempt[] }
interface InterviewLaunchResponse { launch_url: string }

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
    <details className="mt-3 border-t border-[#E0DACE] pt-2">
      <summary className="cursor-pointer text-[10px] font-bold text-[#315E83]">查看评估报告</summary>
      <div className="mt-3 space-y-3 text-[11px] leading-5 text-[#66717B]">
        {report.summary && <p>{report.summary}</p>}
        {report.competency_scores?.length ? <div className="grid gap-2 sm:grid-cols-2">
          {report.competency_scores.map((item) => <article key={item.competency} className="rounded-lg border border-[#E0DACE] bg-[#FFFEFA] p-2.5">
            <div className="flex items-center justify-between gap-2"><strong className="text-[#315E83]">{item.competency}</strong><span className="font-extrabold text-[#18232D]">{scoreText(item.score)}</span></div>
            {item.evidence && <p className="mt-1.5"><span className="font-semibold text-[#59636B]">证据：</span>{item.evidence}</p>}
            {item.improvement && <p className="mt-1"><span className="font-semibold text-[#59636B]">建议：</span>{item.improvement}</p>}
          </article>)}
        </div> : null}
        {report.strengths?.length ? <div><p className="font-bold text-[#59636B]">优势</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        {report.improvements?.length ? <div><p className="font-bold text-[#59636B]">改进建议</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{report.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      </div>
    </details>
  )
}

export function AIInterview() {
  const role = useTargetRole()
  const course = useCurrentCourse()
  const [launching, setLaunching] = useState(false)
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
    <main className="app-page paper-theme min-h-dvh">
      <div className="mx-auto max-w-[1240px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="interview" appearance="paper" labelOverride="AI 面试" groupOverride="求职准备" selectionLabel={role?.name || "选择目标岗位"} />
        <section className="mt-4 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <div className="border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-6 sm:px-8">
            <div className="flex max-w-3xl items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#E7EDF3] text-[#315E83]"><Target className="size-5" /></span>
              <div>
                <p className="text-[10px] font-bold tracking-[.14em] text-[#8E6925]">岗位模拟面试</p>
                <h1 className="mt-1 text-2xl font-bold tracking-[-.035em] text-[#18232D]">开始一场岗位模拟面试</h1>
                <p className="mt-2 text-sm leading-6 text-[#66717B]">题目会结合当前岗位生成。完成后可查看成绩和改进建议。</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-[#D7D1C4] bg-[#FBF9F4] p-5" aria-labelledby="interview-context">
              <h2 id="interview-context" className="text-sm font-bold text-[#18232D]">本次面试上下文</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#E0DACE] bg-[#FFFEFA] p-3"><dt className="text-[10px] font-bold text-[#8A8172]">目标岗位</dt><dd className="mt-1 text-sm font-bold text-[#315E83]">{role?.name || "尚未选择"}</dd></div>
                <div className="rounded-xl border border-[#E0DACE] bg-[#FFFEFA] p-3"><dt className="text-[10px] font-bold text-[#8A8172]">岗位知识库</dt><dd className="mt-1 text-sm font-bold text-[#315E83]">{course?.name || "待绑定"}</dd></div>
              </dl>
              <div className="mt-4 rounded-xl border border-[#E0DACE] bg-[#FFFEFA] p-3">
                <p className="text-[10px] font-bold text-[#8A8172]">岗位能力要求</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(role?.skills || []).map((skill) => <span key={skill} className="rounded-full bg-[#E7EDF3] px-2.5 py-1 text-[10px] font-semibold text-[#315E83]">{skill}</span>)}
                  {!role && <span className="text-xs text-[#7A817F]">请先选择目标岗位，面试题才能按岗位能力生成。</span>}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                {role ? <button type="button" onClick={() => void startInterview()} disabled={launching} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#1D4058] disabled:cursor-wait disabled:opacity-60">{launching ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}{launching ? "正在建立安全会话" : "进入独立 AI 面试"}</button> : <Link to="/courses?returnTo=%2Fai-interview" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#1D4058]"><Target className="size-4" />选择目标岗位</Link>}
                <span className="text-[10px] leading-4 text-[#8A8172]">将带入当前 StudyMate 账号打开独立面试页面，无需再次注册或登录。</span>
              </div>
              {error && <p className="mt-3 text-xs font-semibold text-[#9A4E35]" role="alert">{error}</p>}
            </section>

            <aside className="space-y-3" aria-label="面试说明">
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><ShieldCheck className="size-5 text-[#6F8A69]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">账号说明</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">使用当前 StudyMate 账号进入 AI 面试，不需要创建第二套普通用户账号。</p></div>
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><FileCheck2 className="size-5 text-[#B1842C]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">成绩用途</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">同步成绩后，训练建议会结合本次面试表现更新。</p></div>
            </aside>
          </div>
          <section className="border-t border-[#D7D1C4] bg-[#FFFEFA] px-5 py-5 sm:px-8" aria-labelledby="interview-history">
            <div className="flex items-center justify-between gap-3"><h2 id="interview-history" className="text-sm font-bold text-[#18232D]">最近面试</h2><span className="text-[10px] text-[#8A8172]">仅显示当前账号记录</span></div>
            {attempts.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{attempts.slice(0, 6).map((attempt) => <article key={attempt.id} className="rounded-xl border border-[#E0DACE] bg-[#FBF9F4] px-3 py-2.5"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-[#315E83]">{attempt.role_name}</p><p className="mt-1 text-[10px] text-[#8A8172]">{attempt.created_at ? new Date(attempt.created_at).toLocaleString() : ""}</p></div><div className="shrink-0 text-right"><span className="text-[10px] font-bold text-[#557052]">{statusLabels[attempt.status] || attempt.status}</span>{attempt.score_summary?.overall_score != null && <p className="mt-1 text-sm font-extrabold text-[#18232D]">{scoreText(attempt.score_summary.overall_score)}</p>}</div></div>{resumableStatuses.has(attempt.status) && <button type="button" onClick={() => void resumeInterview(attempt.id)} disabled={launching} className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#B8C7D4] px-3 text-[10px] font-bold text-[#315E83] hover:bg-[#E7EDF3] disabled:cursor-wait disabled:opacity-60">继续面试</button>}<ReportPreview report={attempt.report} /></article>)}</div> : <p className="mt-3 text-xs text-[#7A817F]">完成第一次模拟面试后，报告会出现在这里。</p>}
          </section>
        </section>
      </div>
    </main>
  )
}
