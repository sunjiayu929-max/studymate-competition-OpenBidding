import { ArrowLeft, BarChart3, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import { LearnerMatchReport } from "@/components/LearnerMatchReport"
import { useRoleCapabilityData } from "@/hooks/useRoleCapabilityData"
import { useTrackPage } from "@/lib/useTrackPage"
import { useWorkspaceStore } from "@/store/workspace"
import { useCurrentUser } from "@/store/user"

export function LearnerMatchReportPage() {
  useTrackPage("learner_match_report")
  const user = useCurrentUser()
  const workspace = useWorkspaceStore()
  const {
    role,
    targetRoleName,
    capabilities,
    profile,
    theoryEvidence,
    profileWeakTopics,
    loading,
  } = useRoleCapabilityData()

  const resources = [
    { id: "doc" as const, title: "定制讲义", reviewScore: workspace.reviews.evidence_review?.score ?? 0, ready: Boolean(workspace.outputs.doc) },
    { id: "guide" as const, title: "实操指南", reviewScore: workspace.reviews.practice_review?.score ?? 0, ready: Boolean(workspace.outputs.guide) },
    { id: "quiz" as const, title: "分阶测试", reviewScore: workspace.reviews.difficulty_review?.score ?? 0, ready: Boolean(workspace.outputs.quiz) },
  ]

  return (
    <main className="app-page paper-theme min-h-dvh pb-14">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="learnerReport" appearance="paper" />
        <section className="mt-4 overflow-hidden rounded-[28px] border border-[#C9D9ED] bg-[#F6F8FA] shadow-[0_16px_42px_rgba(41,67,112,.08)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7E0E8] bg-white px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回个人中心</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7E0E8]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#BFD0E3] bg-[#EAF2FF] text-[#315E83]"><BarChart3 className="size-4" /></span>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold text-[#18232D]">个人学情与资源匹配度报告</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">围绕{targetRoleName || "目标岗位"}，查看知识盲区、资源难度与下一步学习路径。</p>
              </div>
            </div>
            {loading && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D7E0E8] bg-[#F8FBFF] px-3 py-1.5 text-[10px] font-bold text-[#6F7E8F]"><Loader2 className="size-3 animate-spin" />正在同步画像</span>}
          </header>

          {role ? (
            <LearnerMatchReport
              targetRoleName={targetRoleName}
              diagnosis={workspace.diagnosis}
              plan={workspace.outputs.training_plan}
              theoryScore={theoryEvidence?.score}
              theoryWeakTopics={theoryEvidence?.weak_topics ?? []}
              profileWeakTopics={profileWeakTopics}
              feedbackAccuracy={workspace.feedback?.accuracy}
              capabilities={capabilities}
              resources={resources}
            />
          ) : (
            <section className="grid min-h-[420px] place-items-center px-5 py-14 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#C7D2D8] bg-white text-[#315E83]"><BarChart3 className="size-6" /></span>
                <h2 className="mt-4 text-xl font-bold text-[#23364B]">先选择目标岗位</h2>
                <p className="mt-2 text-sm leading-6 text-[#748291]">选择岗位后，系统会结合你的画像和训练记录生成个人学情与资源匹配度报告。</p>
                <Link to="/courses" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#244C66] px-4 text-xs font-bold text-white">选择目标岗位</Link>
              </div>
            </section>
          )}
        </section>
        {profile && <span className="sr-only">当前画像版本 v{profile.version}</span>}
        {user && <span className="sr-only">账号 {user.name}</span>}
      </div>
    </main>
  )
}
