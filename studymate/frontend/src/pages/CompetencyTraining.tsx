import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  Code2,
  FileText,
  Film,
  Flag,
  Layers3,
  Loader2,
  Network,
  Rocket,
  ShieldCheck,
  Target,
  UserRoundSearch,
  Wrench,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { AgentCollaborationFlow } from "@/components/AgentCollaborationFlow"
import { DebateQualityPanel } from "@/components/DebateQualityPanel"
import { ReportPathMap, ReportPathProgress, type ReportCapability } from "@/components/LearnerMatchReport"
import { RoleCertificateModal } from "@/components/RoleCertificateModal"
import { TheoryAssessmentModal, type TheoryAssessment, type TheoryGateState } from "@/components/TheoryAssessmentModal"
import { apiGet } from "@/lib/api"
import { buildRoleCompetencyMap, type CompetencyLevel } from "@/lib/roleCompetencyMap"
import { useTrackPage } from "@/lib/useTrackPage"
import { cn } from "@/lib/utils"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { workspaceStore, useWorkspaceStore, type PersonalizedTrainingPlan } from "@/store/workspace"

interface ProfileResponse {
  user_id: number
  version: number
  intake_complete: boolean
  dims: {
    goals: { primary: string; deadline: string; target_topics: string[] }
    weak_points: { topics: string[]; error_types: string[] }
    pace: { hours_per_week: number; intensity: string }
    employment_skills: Record<string, number>
    theory_assessments?: Record<string, { score?: number; knowledge_level?: string; weak_topics?: string[] }>
    training_rounds?: Array<{
      run_id: string
      target_role: string
      accuracy: number | null
      completed_at: string
    }>
  }
}

const RESOURCE_META = {
  doc: { title: "定制讲义", icon: FileText, detail: "建立岗位任务模型与专业边界" },
  guide: { title: "实操指南", icon: Wrench, detail: "完成可复现、可验收的岗位交付物" },
  quiz: { title: "分阶测试", icon: BookOpenCheck, detail: "验证理解、场景判断与迁移能力" },
  mindmap: { title: "思维导图", icon: Network, detail: "梳理岗位任务中的概念、依赖与关系" },
  code: { title: "代码案例", icon: Code2, detail: "提供适配岗位任务的可运行示例" },
  video: { title: "可视讲解", icon: Film, detail: "将抽象知识转成可播放的岗位讲解" },
} as const

type ResourceId = keyof typeof RESOURCE_META
type CapabilityState = ReportCapability["state"]

const ADVANCED_CHALLENGE_THRESHOLD = 0.666

const capabilityStorageKey = (userId: number, roleId: string) => `sm:role-capability-evidence:${userId}:${roleId}`

function readEvidence(userId: number | undefined, roleId: string) {
  if (!userId) return {} as Record<string, { level?: number; score?: number }>
  try {
    const raw = localStorage.getItem(capabilityStorageKey(userId, roleId))
    return raw ? JSON.parse(raw) as Record<string, { level?: number; score?: number }> : {}
  } catch {
    return {}
  }
}

export function CompetencyTraining() {
  useTrackPage("competency_training")
  const navigate = useNavigate()
  const role = useTargetRole()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const workspace = useWorkspaceStore()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [theoryGate, setTheoryGate] = useState<TheoryGateState>({ loading: false, completed: false, required: false, assessment: null, error: "" })
  const [theoryPromptSignal, setTheoryPromptSignal] = useState(0)
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackError, setFeedbackError] = useState("")
  const [selectedPathId, setSelectedPathId] = useState("")
  const [certificateOpen, setCertificateOpen] = useState(false)

  const capabilityMap = useMemo(() => role ? buildRoleCompetencyMap(role) : null, [role])

  useEffect(() => {
    if (!user?.user_id) return
    let active = true
    apiGet<ProfileResponse>(`/profile/${user.user_id}`).then((value) => { if (active) setProfile(value) }).catch(() => undefined)
    return () => { active = false }
  }, [user?.user_id])

  const theoryEvidence = role ? profile?.dims.theory_assessments?.[role.id] : undefined
  const theoryCompleted = Boolean(role && theoryGate.completed && theoryGate.assessment?.role_id === role.id)
  const profileLoaded = Boolean(profile)
  const plan = workspace.outputs.training_plan
  const released = workspace.decision?.decision === "publish"
  const cycle = plan?.cycle ?? workspace.diagnosis?.training_cycle ?? 1
  const sampleTasks = role?.sampleTasks ?? []
  const currentTopicIndex = sampleTasks.length ? (cycle - 1) % sampleTasks.length : 0
  const nextTopicIndex = sampleTasks.length ? cycle % sampleTasks.length : 0
  const currentTopic = workspace.topic.trim() || sampleTasks[currentTopicIndex] || sampleTasks[0] || ""
  const nextTopic = sampleTasks[nextTopicIndex] ?? sampleTasks[0] ?? currentTopic
  const completedRoleRounds = useMemo(() => {
    if (!role) return []
    const seen = new Set<string>()
    return (profile?.dims.training_rounds ?? []).filter((round) => {
      if (round.target_role !== role.name || seen.has(round.run_id)) return false
      seen.add(round.run_id)
      return true
    })
  }, [profile?.dims.training_rounds, role])
  const activeFeedbackIsRecorded = completedRoleRounds.some((round) => round.run_id === workspace.feedback?.run_id)
  const activeFeedbackMatchesRole = Boolean(workspace.feedback && workspace.targetRole === role?.name)
  const completedRoundCount = completedRoleRounds.length + (activeFeedbackMatchesRole && !activeFeedbackIsRecorded ? 1 : 0)
  const requiredRoundCount = Math.max(1, sampleTasks.length)
  const latestAccuracy = activeFeedbackMatchesRole ? workspace.feedback?.accuracy ?? null : completedRoleRounds[0]?.accuracy ?? null
  const certificateEligible = completedRoundCount >= requiredRoundCount && latestAccuracy !== null && latestAccuracy >= 85
  const reportCapabilities = useMemo<ReportCapability[]>(() => {
    if (!role || !capabilityMap) return []
    const stored = readEvidence(user?.user_id, role.id)
    const currentNames = new Set(plan?.priority_competencies ?? [])
    return capabilityMap.nodes.map((node) => {
      const level = Math.min(3, Math.max(0, stored[node.id]?.level ?? (currentNames.has(node.name) ? 1 : 0))) as CompetencyLevel
      let state: CapabilityState = "locked"
      if (level >= 3) state = "mastered"
      else if (currentNames.has(node.name)) state = "current"
      else if (level > 0) state = "developing"
      else if (node.prerequisites.every((id) => (stored[id]?.level ?? 0) >= 3)) state = "ready"
      return { id: node.id, name: node.name, level, state, task: node.task, prerequisites: node.prerequisites }
    })
  }, [capabilityMap, plan?.priority_competencies, role, user?.user_id])
  if (!role || !capabilityMap) return <RoleRequired />
  const pathCapabilities = reportCapabilities.length ? reportCapabilities : [{ id: "start", name: "建立目标岗位路径", level: 0, state: "ready" as const, task: "完成岗位画像后生成能力节点与训练路线。", prerequisites: [] }]
  const agentDone = workspace.agents.filter((agent) => agent.status === "done").length
  const agentProgress = workspace.agents.length ? Math.round(agentDone / workspace.agents.length * 100) : 0

  const startRoundForTopic = (topic: string) => {
    if (!user?.user_id || !course || workspace.status === "running") return
    if (!theoryCompleted) {
      setTheoryPromptSignal((value) => value + 1)
      return
    }
    void workspaceStore.start(topic, user.user_id, course.id, course.name)
  }

  const startRound = () => startRoundForTopic(workspace.feedback ? nextTopic : currentTopic)

  const submitFeedback = async (): Promise<boolean> => {
    setFeedbackBusy(true)
    setFeedbackError("")
    try {
      await workspaceStore.submitTrainingFeedback()
      if (user?.user_id) setProfile(await apiGet<ProfileResponse>(`/profile/${user.user_id}`))
      return true
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "验收结果回写失败，请稍后重试。")
      return false
    } finally {
      setFeedbackBusy(false)
    }
  }

  const ensureFeedback = async () => Boolean(workspace.feedback) || submitFeedback()

  const startSimplifiedRound = async () => {
    if (!await ensureFeedback()) return
    startRoundForTopic(currentTopic)
  }

  const startAdvancedChallenge = async () => {
    if (!await ensureFeedback()) return
    navigate(`/quiz?create=1&challenge=1&topic=${encodeURIComponent(currentTopic)}`)
  }

  const startNextKnowledgeRound = async () => {
    if (!await ensureFeedback()) return
    startRoundForTopic(nextTopic)
  }

  return (
    <main className="app-page paper-theme min-h-dvh pb-12">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位胜任力闭环" selectionLabel={role.name} />
        {user?.user_id && course && <TheoryAssessmentModal enabled={profileLoaded} userId={user.user_id} roleId={role.id} roleName={role.name} courseId={course.id} competencies={capabilityMap.nodes.map((node) => node.name)} reopenSignal={theoryPromptSignal} onGateChange={setTheoryGate} onCompleted={(assessment: TheoryAssessment) => { setTheoryGate({ loading: false, completed: true, required: false, assessment, error: "" }); void apiGet<ProfileResponse>(`/profile/${user.user_id}`).then(setProfile).catch(() => undefined) }} />}

        <section className="relative mt-4 overflow-hidden rounded-[30px] border border-[#C9D9ED] bg-[#122C4D] px-4 py-5 text-white shadow-[0_24px_64px_rgba(32,73,130,.18)] sm:px-6 sm:py-7 lg:px-8">
          <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-[#7654DC]/25 blur-3xl" /><div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-[#16A6A1]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-[#CFE2FF]"><Target className="size-3.5 text-[#F1D47D]" />第 {cycle} 轮岗位训练</span><span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F3E7]/12 px-3 py-1.5 text-[10px] font-bold text-[#BFECDD]"><span className="size-1.5 rounded-full bg-[#5ED5B5]" />路径、协作与验收实时同步</span></div><h1 className="mt-4 text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl">{role.name} · 本轮学习路径</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#C2D2E6]">路径终点是当前目标岗位，能力节点会根据画像、测评结果和训练反馈持续更新。</p><div className="mt-4 flex flex-wrap gap-3 text-[10px] text-[#C2D2E6]"><span>能力节点 {reportCapabilities.length} 项</span><span>·</span><span>理论测评 {theoryEvidence?.score ?? "—"} 分</span><span>·</span><span>Agent 进度 {agentProgress}%</span><span>·</span><span>{released ? "已通过发布门禁" : "等待本轮决策"}</span></div></div><div className="w-full shrink-0 xl:w-[740px]"><ReportPathMap capabilities={pathCapabilities} targetRoleName={role.name} selectedId={selectedPathId || pathCapabilities[0]?.id} onSelect={setSelectedPathId} /><ReportPathProgress capabilities={pathCapabilities} targetRoleName={role.name} /></div><button type="button" onClick={startRound} disabled={!course || workspace.status === "running"} className="inline-flex min-h-24 shrink-0 items-center justify-center gap-2 rounded-[18px] border border-[#B9CBE4] bg-[linear-gradient(145deg,#2C65A2,#3978BC)] px-5 text-center text-xs font-bold text-white shadow-[0_12px_28px_rgba(22,61,110,.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 xl:w-[150px]"><span><Rocket className="mx-auto mb-2 size-5" /><span className="block">{workspace.status === "running" ? "本轮学习进行中" : workspace.feedback ? `启动第 ${cycle + 1} 轮学习` : "启动本轮学习"}</span><span className="mt-1 block text-[9px] font-medium text-[#D5E8FF]">{theoryCompleted ? "进入协作生成流程" : "先完成理论基线测评"}</span></span><ArrowRight className="size-4" /></button></div>
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6"><SectionTitle icon={Network} eyebrow="多智能体协作" title="从任务输入到发布门禁的一整条协作链" description="学情诊断后分为领域专家与教学策略两路，汇合到资源生成，再进入三项校验与总决策。" /><AgentCollaborationFlow workspace={workspace} /></section>

        <DebateQualityPanel workspace={workspace} />

        <section id="training-resources" className="mt-4 scroll-mt-6 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><SectionTitle icon={Layers3} eyebrow="六类资源生成" title="围绕同一岗位任务形成可执行资源包" description={plan?.rationale || `本轮候选任务：${currentTopic}`} /><span className={cn("rounded-full px-3 py-1.5 text-[10px] font-bold", released ? "bg-[#E5F6F0] text-[#18745E]" : "bg-[#EEF3FA] text-[#61738D]")}>{released ? `发布门禁通过 · ${workspace.decision?.quality_score ?? 0} 分` : workspace.status === "running" ? "生成与校验进行中" : "等待协作流程"}</span></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(Object.keys(RESOURCE_META) as ResourceId[]).map((id, index) => <ResourceCard key={id} id={id} index={index} plan={plan} ready={Boolean(workspace.outputs[id])} released={released} reviewScore={reviewScoreFor(workspace.reviews, id)} videoStatus={id === "video" ? workspace.outputs.video?.status : undefined} />)}</div></section>

        <AcceptancePanel
          workspace={workspace}
          feedbackBusy={feedbackBusy}
          feedbackError={feedbackError}
          completedRoundCount={completedRoundCount}
          requiredRoundCount={requiredRoundCount}
          certificateEligible={certificateEligible}
          onSimplify={startSimplifiedRound}
          onChallenge={startAdvancedChallenge}
          onNext={startNextKnowledgeRound}
          onOpenCertificate={() => setCertificateOpen(true)}
        />
      </div>
      {certificateOpen && user && (
        <RoleCertificateModal
          open
          learnerName={user.name}
          roleName={role.name}
          roleId={role.id}
          userId={user.user_id}
          completedRounds={completedRoundCount}
          onClose={() => setCertificateOpen(false)}
        />
      )}
    </main>
  )
}

function reviewScoreFor(reviews: WorkspaceState["reviews"], id: ResourceId) {
  if (id === "doc" || id === "mindmap") return reviews.evidence_review?.score
  if (id === "guide" || id === "code") return reviews.practice_review?.score
  return reviews.difficulty_review?.score
}

function SectionTitle({ icon: Icon, eyebrow, title, description }: { icon: typeof Target; eyebrow: string; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EDF2F6] text-[#456A8E]"><Icon className="size-4" /></span><div><span className="text-[9px] font-bold tracking-[.12em] text-[#8493A2]">{eyebrow}</span><h2 className="text-base font-bold text-[#293C51]">{title}</h2><p className="mt-1 text-[10px] leading-4 text-[#758392]">{description}</p></div></div>
}

function ResourceCard({ id, index, plan, ready, released, reviewScore, videoStatus }: { id: ResourceId; index: number; plan?: PersonalizedTrainingPlan; ready: boolean; released: boolean; reviewScore?: number; videoStatus?: string }) {
  const meta = RESOURCE_META[id]
  const Icon = meta.icon
  const stage = plan?.stages[index]
  const videoReady = videoStatus === "ready" || videoStatus === "completed" || videoStatus === "done"
  return <article className={cn("rounded-[20px] border p-4", released && ready ? "border-[#BFDCCF] bg-[#F7FCFA]" : ready ? "border-[#C8D9ED] bg-[#F8FBFF]" : "border-[#E0E7F0] bg-[#FBFCFE]")}><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white text-[#3369B4] shadow-sm"><Icon className="size-4.5" /></span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", released && ready ? "bg-[#DDF2E9] text-[#18745E]" : ready ? "bg-[#E6F0FD] text-[#3568A9]" : "bg-[#EDF1F6] text-[#7B899B]")}>{released && ready ? (id === "video" ? (videoReady ? "已发布" : "生成中") : `校验 ${reviewScore ?? "—"} 分`) : ready ? "等待发布门禁" : "等待生成"}</span></div><h3 className="mt-3 text-sm font-bold text-[#20344E]">{meta.title}</h3><p className="mt-1 text-[10px] leading-4 text-[#738298]">{stage?.goal || meta.detail}</p><div className="mt-3 rounded-xl bg-white/90 px-3 py-2 text-[9px] leading-4 text-[#63758D]">成果证据：{stage?.evidence || "由资源生成 Agent 确定"}</div>{released && ready ? <Link to={`/workspace/r/${id}`} className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#2864BA]">打开资源<ArrowRight className="size-3" /></Link> : <span className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#8794A5]"><ShieldCheck className="size-3" />通过发布门禁后开放</span>}</article>
}

function AcceptancePanel({
  workspace,
  feedbackBusy,
  feedbackError,
  completedRoundCount,
  requiredRoundCount,
  certificateEligible,
  onSimplify,
  onChallenge,
  onNext,
  onOpenCertificate,
}: {
  workspace: WorkspaceState
  feedbackBusy: boolean
  feedbackError: string
  completedRoundCount: number
  requiredRoundCount: number
  certificateEligible: boolean
  onSimplify: () => Promise<void>
  onChallenge: () => Promise<void>
  onNext: () => Promise<void>
  onOpenCertificate: () => void
}) {
  const quizItems = workspace.outputs.quiz?.items ?? []
  const attempts = quizItems.flatMap((item) => workspace.quizAttempts[item.id] ? [workspace.quizAttempts[item.id]] : [])
  const correctCount = attempts.filter((attempt) => attempt.is_correct).length
  const hasAttempts = attempts.length > 0
  const accuracyRate = hasAttempts && quizItems.length ? correctCount / quizItems.length : null
  const accuracyPercent = accuracyRate === null ? null : accuracyRate * 100
  const accuracyLabel = accuracyPercent === null
    ? "—"
    : `${Number.isInteger(accuracyPercent) ? accuracyPercent : accuracyPercent.toFixed(1)}%`
  const advancedChallengeAvailable = accuracyRate !== null && accuracyRate >= ADVANCED_CHALLENGE_THRESHOLD

  return (
    <section className={cn("mt-4 rounded-[24px] border p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6", certificateEligible ? "border-[#DFC784] bg-[#FFFCF3]" : "border-[#DCE5F1] bg-white")}>
      <SectionTitle
        icon={certificateEligible ? Award : Flag}
        eyebrow={certificateEligible ? "05 · 全部训练完成" : "05 · 本轮验收"}
        title={certificateEligible ? "祝贺你完成岗位学习，领取专属电子奖状" : "本轮验收"}
        description={certificateEligible ? "系统已核对全部学习轮次与最终验收结果，现在可以生成并下载岗位奖状。" : "根据本轮已完成题目的正确率选择下一步。"}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex min-h-32 flex-col justify-center rounded-2xl border border-[#DCE5F1] bg-[#F8FAFD] px-5 py-4">
          <span className="text-[10px] font-bold text-[#75849A]">{certificateEligible ? "岗位训练进度" : "正确率"}</span>
          {certificateEligible && <strong className="mt-2 text-3xl text-[#9B7228]">{requiredRoundCount} / {requiredRoundCount}</strong>}
          {!certificateEligible && <strong className="mt-2 text-3xl text-[#294A73]">{accuracyLabel}</strong>}
        </div>
        <div className="flex min-h-32 flex-wrap items-center gap-3 rounded-2xl border border-[#DCE5F1] bg-white px-5 py-4">
          {certificateEligible ? (
            <>
              <button type="button" onClick={onOpenCertificate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#B7872D,#D0A64C)] px-4 text-xs font-bold text-white shadow-[0_8px_18px_rgba(183,135,45,.22)]"><Award className="size-4" />生成岗位奖状</button>
              <span className="text-[10px] font-bold text-[#8A651F]">已完成 {completedRoundCount} 轮岗位学习</span>
            </>
          ) : (
            <>
              {!hasAttempts && <Link to="/workspace/r/quiz" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2468CE] px-4 text-xs font-bold text-white"><BookOpenCheck className="size-4" />开始分阶测试<ArrowRight className="size-4" /></Link>}
              {hasAttempts && !advancedChallengeAvailable && <button type="button" onClick={() => void onSimplify()} disabled={feedbackBusy || workspace.status === "running"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#A9583D] px-4 text-xs font-bold text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}降维解释</button>}
              {hasAttempts && advancedChallengeAvailable && <button type="button" onClick={() => void onChallenge()} disabled={feedbackBusy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6D50C7] px-4 text-xs font-bold text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}生成进阶挑战任务</button>}
              {hasAttempts && advancedChallengeAvailable && <button type="button" onClick={() => void onNext()} disabled={feedbackBusy || workspace.status === "running"} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#B9CBE4] bg-white px-4 text-xs font-bold text-[#315E83] disabled:opacity-50"><ArrowRight className="size-4" />继续生成新一轮知识</button>}
            </>
          )}
          {feedbackError && <p role="alert" className="w-full text-[10px] text-[#A85138]">{feedbackError}</p>}
        </div>
      </div>
    </section>
  )
}

function RoleRequired() {
  return <main className="app-page paper-theme min-h-dvh"><div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位训练" selectionLabel="尚未选择目标岗位" /><section className="mt-4 grid min-h-[64vh] place-items-center rounded-[28px] border border-[#DCE5F1] bg-white px-5 text-center shadow-[0_18px_48px_rgba(41,67,112,.08)]"><div className="max-w-lg py-16"><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[#E8F2FF] text-[#356FD1]"><UserRoundSearch className="size-7" /></span><p className="mt-5 text-[11px] font-extrabold tracking-[.16em] text-[#6F83A2]">开始前</p><h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17233D]">先选择目标岗位，再建立训练路径</h1><p className="mt-3 text-sm leading-6 text-[#66758B]">岗位决定学习范围，画像决定从哪里开始。</p><Link to="/courses?returnTo=%2Fprofile" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-sm font-bold text-white">选择目标岗位<ArrowRight className="size-4" /></Link></div></section></div></main>
}

type WorkspaceState = ReturnType<typeof useWorkspaceStore>
