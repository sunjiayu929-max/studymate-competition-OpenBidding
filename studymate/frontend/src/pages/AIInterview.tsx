import { useEffect, useState } from "react"
import { ExternalLink, FileCheck2, LoaderCircle, ShieldCheck, Target } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet, apiPost } from "@/lib/api"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

interface InterviewAttempt {
  id: string
  role_name: string
  status: string
  created_at?: string | null
  score_summary?: { overall_score?: number; role_match_score?: number; general_score?: number }
}

interface InterviewAttemptList { items: InterviewAttempt[] }
interface InterviewLaunchResponse { launch_url: string }

const statusLabels: Record<string, string> = {
  launch_ready: "待开始",
  launched: "已进入",
  in_progress: "进行中",
  completed: "已完成",
  report_failed: "报告待重试",
  failed: "需重试",
  abandoned: "已结束",
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

  async function startInterview() {
    if (!role) {
      setError("请先选择目标岗位")
      return
    }
    setLaunching(true)
    setError("")
    try {
      const payload = await apiPost<InterviewLaunchResponse>("/interviews/attempts", {
        role_id: role.id,
        course_id: course?.id ?? null,
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
                <p className="text-[10px] font-bold tracking-[.14em] text-[#8E6925]">ROLE-ALIGNED INTERVIEW</p>
                <h1 className="mt-1 text-2xl font-bold tracking-[-.035em] text-[#18232D]">围绕目标岗位，开始一次真实面试</h1>
                <p className="mt-2 text-sm leading-6 text-[#66717B]">面试服务独立部署，岗位要求通过接口传入；StudyMate 不读取面试服务数据库。</p>
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
                <button type="button" onClick={() => void startInterview()} disabled={launching || !role} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#1D4058] disabled:cursor-wait disabled:opacity-60">{launching ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}{launching ? "正在建立安全会话" : "进入独立 AI 面试"}</button>
                <span className="text-[10px] leading-4 text-[#8A8172]">岗位和用户身份由后端验证后通过一次性会话传入。</span>
              </div>
              {error && <p className="mt-3 text-xs font-semibold text-[#9A4E35]" role="alert">{error}</p>}
            </section>

            <aside className="space-y-3" aria-label="面试服务边界">
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><ShieldCheck className="size-5 text-[#6F8A69]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">独立服务边界</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">独立容器、独立 MySQL、独立密钥；主系统仅通过 API 和面试服务交换必要数据。</p></div>
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><FileCheck2 className="size-5 text-[#B1842C]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">结果回到岗位画像</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">完成并同步后，面试评分会作为岗位能力证据，参与 StudyMate 的训练建议和差距分析。</p></div>
            </aside>
          </div>
          <section className="border-t border-[#D7D1C4] bg-[#FFFEFA] px-5 py-5 sm:px-8" aria-labelledby="interview-history">
            <div className="flex items-center justify-between gap-3"><h2 id="interview-history" className="text-sm font-bold text-[#18232D]">最近面试</h2><span className="text-[10px] text-[#8A8172]">仅显示当前账号记录</span></div>
            {attempts.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{attempts.slice(0, 6).map((attempt) => <div key={attempt.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E0DACE] bg-[#FBF9F4] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold text-[#315E83]">{attempt.role_name}</p><p className="mt-1 text-[10px] text-[#8A8172]">{attempt.created_at ? new Date(attempt.created_at).toLocaleString() : ""}</p></div><div className="shrink-0 text-right"><span className="text-[10px] font-bold text-[#557052]">{statusLabels[attempt.status] || attempt.status}</span>{attempt.score_summary?.overall_score != null && <p className="mt-1 text-sm font-extrabold text-[#18232D]">{attempt.score_summary.overall_score.toFixed(1)}</p>}</div></div>)}</div> : <p className="mt-3 text-xs text-[#7A817F]">完成第一次模拟面试后，报告会出现在这里。</p>}
          </section>
        </section>
      </div>
    </main>
  )
}
