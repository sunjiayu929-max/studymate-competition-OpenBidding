import { useEffect, useState } from "react"
import { BarChart3, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import { LearnerMatchReport } from "@/components/LearnerMatchReport"
import { useRoleCapabilityData } from "@/hooks/useRoleCapabilityData"
import { useTrackPage } from "@/lib/useTrackPage"
import { apiGet } from "@/lib/api"
import { useWorkspaceStore } from "@/store/workspace"
import "./LearnerMatchReportPage.css"

export function LearnerMatchReportPage() {
  useTrackPage("learner_match_report")
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
  const [history, setHistory] = useState<{
    resource_types: Record<string, number>
    latest_run: null | {
      diagnosis?: typeof workspace.diagnosis
      reviews?: Record<string, { score?: number }>
      feedback?: { accuracy?: number | null }
    }
  } | null>(null)

  useEffect(() => {
    let active = true
    void apiGet<NonNullable<typeof history>>("/workspace/history")
      .then((value) => { if (active) setHistory(value) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const persistedReviews = history?.latest_run?.reviews ?? {}
  const persistedTypes = history?.resource_types ?? {}

  const resources = [
    { id: "doc" as const, title: "定制讲义", reviewScore: workspace.reviews.evidence_review?.score ?? persistedReviews.evidence_review?.score ?? 0, ready: Boolean(workspace.outputs.doc) || (persistedTypes.doc ?? 0) > 0 },
    { id: "guide" as const, title: "实操指南", reviewScore: workspace.reviews.practice_review?.score ?? persistedReviews.practice_review?.score ?? 0, ready: Boolean(workspace.outputs.guide) || (persistedTypes.guide ?? 0) > 0 },
    { id: "quiz" as const, title: "分阶测试", reviewScore: workspace.reviews.difficulty_review?.score ?? persistedReviews.difficulty_review?.score ?? 0, ready: Boolean(workspace.outputs.quiz) || (persistedTypes.quiz ?? 0) > 0 },
  ]

  return (
    <main className="learner-signal-page app-page paper-theme min-h-dvh pb-20">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="learnerReport" appearance="paper" iconImage="/images/learner-resource-matching-coupler-v1.png" showRocketFormation rocketVariant="honor" />
        <section className="learner-signal-shell mt-5 overflow-hidden rounded-[30px] border border-[#9DB9CB]/70">
          {loading && <div className="learner-signal-loading" role="status"><Loader2 className="size-3.5 animate-spin" />正在同步画像与训练记录</div>}

          {role ? (
            <LearnerMatchReport
              targetRoleName={targetRoleName}
              diagnosis={workspace.diagnosis ?? history?.latest_run?.diagnosis ?? null}
              plan={workspace.outputs.training_plan}
              theoryScore={theoryEvidence?.score}
              theoryWeakTopics={theoryEvidence?.weak_topics ?? []}
              profileWeakTopics={profileWeakTopics}
              feedbackAccuracy={workspace.feedback?.accuracy ?? history?.latest_run?.feedback?.accuracy}
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
      </div>
    </main>
  )
}
