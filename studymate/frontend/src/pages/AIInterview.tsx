import { ExternalLink, FileCheck2, ShieldCheck, Target } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"

const interviewServiceUrl = String(import.meta.env.VITE_AI_INTERVIEW_URL || "").trim()

function buildLaunchUrl(role: ReturnType<typeof useTargetRole>, course: ReturnType<typeof useCurrentCourse>) {
  if (!interviewServiceUrl) return ""
  const url = new URL(interviewServiceUrl)
  if (role) {
    url.searchParams.set("target_role", role.name)
    url.searchParams.set("competencies", role.skills.join(","))
  }
  if (course?.id) url.searchParams.set("course_id", String(course.id))
  return url.toString()
}

export function AIInterview() {
  const role = useTargetRole()
  const course = useCurrentCourse()
  const launchUrl = buildLaunchUrl(role, course)

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
                {launchUrl ? <a href={launchUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#1D4058]"><ExternalLink className="size-4" />进入独立 AI 面试</a> : <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-4 text-xs font-bold text-[#7A817F]"><ExternalLink className="size-4" />面试服务尚未配置</span>}
                <span className="text-[10px] leading-4 text-[#8A8172]">服务地址由部署环境配置，不写入业务代码。</span>
              </div>
            </section>

            <aside className="space-y-3" aria-label="面试服务边界">
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><ShieldCheck className="size-5 text-[#6F8A69]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">独立服务边界</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">独立容器、独立 MySQL、独立密钥；主系统仅通过 API 和面试服务交换必要数据。</p></div>
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><FileCheck2 className="size-5 text-[#B1842C]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">结果回到岗位画像</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">后续接入报告回传后，面试评分可作为岗位能力证据，参与 StudyMate 的训练建议和差距分析。</p></div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}
