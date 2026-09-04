import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CircleAlert,
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
import { CERTIFICATE_ACCURACY_THRESHOLD, evaluateRoleCertificateRounds, getOrCreateCertificateRecord } from "@/lib/certificates"
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
  doc: { title: "定制讲义", icon: FileText, detail: "建立岗位任务模型与专业边界", tone: "resource-blue", background: "/images/training-resource-doc-bg-v2.webp" },
  guide: { title: "实操指南", icon: Wrench, detail: "完成可复现、可验收的岗位交付物", tone: "resource-green", background: "/images/training-resource-guide-bg-v2.webp" },
  quiz: { title: "分阶测试", icon: BookOpenCheck, detail: "验证理解、场景判断与迁移能力", tone: "resource-gold", background: "/images/training-resource-quiz-bg-v2.webp" },
  mindmap: { title: "思维导图", icon: Network, detail: "梳理岗位任务中的概念、依赖与关系", tone: "resource-violet", background: "/images/training-resource-mindmap-bg-v2.webp" },
  code: { title: "代码案例", icon: Code2, detail: "提供适配岗位任务的可运行示例", tone: "resource-cyan", background: "/images/training-resource-code-bg-v2.webp" },
  video: { title: "可视讲解", icon: Film, detail: "将抽象知识转成可播放的岗位讲解", tone: "resource-coral", background: "/images/training-resource-video-bg-v2.webp" },
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
  const [searchParams] = useSearchParams()
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
  const requestedTopic = (searchParams.get("topic") ?? "").trim()

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
  const currentTopic = requestedTopic || workspace.topic.trim() || sampleTasks[currentTopicIndex] || sampleTasks[0] || ""
  const nextTopic = sampleTasks[nextTopicIndex] ?? sampleTasks[0] ?? currentTopic
  const roleEvaluation = useMemo(
    () => role ? evaluateRoleCertificateRounds(profile?.dims.training_rounds ?? [], role) : null,
    [profile?.dims.training_rounds, role],
  )
  const completedRoleRounds = roleEvaluation?.rounds ?? []
  const activeFeedbackIsRecorded = completedRoleRounds.some((round) => round.run_id === workspace.feedback?.run_id)
  const activeFeedbackMatchesRole = Boolean(workspace.feedback && workspace.targetRole === role?.name)
  const completedRoundCount = (roleEvaluation?.completedRoundCount ?? 0) + (activeFeedbackMatchesRole && !activeFeedbackIsRecorded ? 1 : 0)
  const requiredRoundCount = roleEvaluation?.requiredRoundCount ?? Math.max(1, sampleTasks.length)
  const latestAccuracy = activeFeedbackMatchesRole ? workspace.feedback?.accuracy ?? null : roleEvaluation?.latestAccuracy ?? null
  const certificateEligible = completedRoundCount >= requiredRoundCount && latestAccuracy !== null && latestAccuracy >= CERTIFICATE_ACCURACY_THRESHOLD
  useEffect(() => {
    if (!certificateEligible || !user || !role) return
    getOrCreateCertificateRecord({
      userId: user.user_id,
      learnerName: user.name,
      roleId: role.id,
      roleName: role.name,
      completedRounds: completedRoundCount,
    })
  }, [certificateEligible, user, role, completedRoundCount])
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
  useEffect(() => {
    if (!requestedTopic) return
    const matched = reportCapabilities.find((node) => node.name === requestedTopic || node.name.includes(requestedTopic) || requestedTopic.includes(node.name))
    if (matched) setSelectedPathId(matched.id)
  }, [reportCapabilities, requestedTopic])
  if (!role || !capabilityMap) return <RoleRequired />
  const pathCapabilities = reportCapabilities.length ? reportCapabilities : [{ id: "start", name: "建立目标岗位路径", level: 0, state: "ready" as const, task: "完成岗位画像后生成能力节点与训练路线。", prerequisites: [] }]
  const agentDone = workspace.agents.filter((agent) => agent.status === "done").length
  const agentProgress = workspace.agents.length ? Math.round(agentDone / workspace.agents.length * 100) : 0
  const stageStep = workspace.stage === "generation" ? 1
    : ["review", "rework"].includes(workspace.stage) ? 2
      : ["decision", "publishing", "published"].includes(workspace.stage) ? 3
        : 0
  const roleTitleLines = splitRoleTitle(role.name)

  const startRoundForTopic = (topic: string) => {
    if (!user?.user_id || !course || workspace.status === "running") return
    if (!theoryCompleted) {
      setTheoryPromptSignal((value) => value + 1)
      return
    }
    void workspaceStore.start(topic, user.user_id, course.id, course.name)
  }

  const startRound = () => startRoundForTopic(requestedTopic || (workspace.feedback ? nextTopic : currentTopic))

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
    <main className="app-page paper-theme competency-studio min-h-dvh pb-12">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位胜任力闭环" selectionLabel={role.name} iconImage="/images/training-navigation-instrument-v1.png" showRocketFormation />
        {user?.user_id && course && <TheoryAssessmentModal enabled={profileLoaded} userId={user.user_id} roleId={role.id} roleName={role.name} courseId={course.id} competencies={capabilityMap.nodes.map((node) => node.name)} reopenSignal={theoryPromptSignal} onGateChange={setTheoryGate} onCompleted={(assessment: TheoryAssessment) => { setTheoryGate({ loading: false, completed: true, required: false, assessment, error: "" }); void apiGet<ProfileResponse>(`/profile/${user.user_id}`).then(setProfile).catch(() => undefined) }} />}

        <motion.section id="training-focus" className={cn("competency-hero relative scroll-mt-24 overflow-hidden border-y px-3 pb-5 pt-5 sm:px-5 lg:px-6", workspace.status === "running" && "is-running")} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .72, ease: [0.22, 1, 0.36, 1] }}>
          <div className="competency-hero-spine" aria-hidden="true" />
          <div className="competency-live-row relative mb-5 flex items-center justify-between border-b border-[#D9E0E8] pb-4">
            <div className="flex items-center gap-3"><span className="competency-live-dot size-2 rounded-full" /><span className="text-[13px] font-black tracking-[.16em] text-[#294E73]">LIVE TRAINING</span><span className="text-[13px] font-bold text-[#778596]">ROUND {String(cycle).padStart(2, "0")}</span></div>
            <span className="hidden text-[12px] font-bold text-[#64758A] sm:block">{workspace.status === "running" ? "协作运行中" : released ? "已通过发布门禁" : "等待启动"}</span>
          </div>
          <div className="relative grid gap-5 xl:grid-cols-[minmax(248px,288px)_minmax(0,1fr)_224px] xl:items-center">
            <motion.div className="competency-role-summary min-w-0" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .12, duration: .58 }}>
              <div className="competency-role-index"><strong>01</strong><span>岗位训练中心</span><i>ROLE TRAINING</i></div>
              <h1 className="competency-role-title mt-5">{roleTitleLines.map((line, index) => <span className={index === roleTitleLines.length - 1 ? "is-accent" : undefined} key={`${line}-${index}`}>{line}</span>)}</h1>
              <div className="competency-role-accent mt-5" aria-hidden="true" />
              <div className="competency-topic mt-5"><span className="block text-[11px] font-black tracking-[.14em] text-[#708297]">本轮任务 / MISSION</span><p className="mt-2 line-clamp-2 text-[15px] font-semibold leading-6 text-[#3E566D]">{requestedTopic || currentTopic}</p></div>
              {requestedTopic && <div className="mt-3 inline-flex items-center gap-2 text-[13px] font-bold text-[#A04D38]" aria-live="polite"><CircleAlert className="size-4 shrink-0" />知识盲区已加入本轮</div>}
              <div className="competency-status-cluster mt-6">
                <div className="competency-progress-figure"><div><b>{agentProgress}%</b><span>协作进度 / PROGRESS</span></div><div className="competency-progress-rule"><i style={{ width: `${Math.max(6, agentProgress)}%` }} /></div></div>
                <div className="competency-status-list"><span><small>能力节点</small><strong>{String(reportCapabilities.length).padStart(2, "0")}</strong></span><span><small>理论测评</small><strong>{theoryEvidence?.score ?? "—"}</strong></span><span><small>发布门禁</small><strong>{released ? "PASS" : "WAIT"}</strong></span></div>
              </div>
            </motion.div>
            <motion.div className="competency-map w-full min-w-0" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .18, duration: .62 }}><ReportPathMap capabilities={pathCapabilities} targetRoleName={role.name} selectedId={selectedPathId || pathCapabilities[0]?.id} onSelect={setSelectedPathId} /><ReportPathProgress capabilities={pathCapabilities} targetRoleName={role.name} /></motion.div>
            <motion.button type="button" onClick={startRound} disabled={!course || workspace.status === "running"} className="competency-primary-cta group inline-flex min-h-24 w-full shrink-0 items-end justify-between gap-2 rounded-[26px] border px-4 py-4 text-left text-[14px] font-black disabled:cursor-not-allowed disabled:opacity-55 xl:min-h-28" whileHover={{ y: -4 }} whileTap={{ scale: .98 }}><span className="relative z-10 flex min-w-0 flex-1 items-center gap-2"><span className="competency-cta-icon grid size-10 shrink-0 place-items-center rounded-full"><Rocket className="size-5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" /></span><span className="competency-cta-copy min-w-0"><span className="block text-[15px]">{workspace.status === "running" ? "训练进行中" : workspace.feedback ? `进入第 ${cycle + 1} 轮` : "启动本轮"}</span><span className="mt-1 block text-[12px] font-semibold text-white/75">{theoryCompleted ? "协作生成" : "先完成测评"}</span></span></span><span className="competency-cta-arrow relative z-10 grid size-9 shrink-0 place-items-center rounded-full"><ArrowRight className="size-4" /></span></motion.button>
          </div>
          <div className="competency-stage-rail relative mt-5 grid grid-cols-4 overflow-hidden rounded-[14px] border border-[#D7DEE7] bg-[#F7F8FA]">
            <span className="competency-route-signal" aria-hidden="true" />
            {["诊断", "生成", "校验", "发布"].map((label, index) => <div key={label} className={cn("relative z-10 flex min-h-14 items-center justify-center gap-2 border-r border-[#DDE3EA] text-[13px] font-black last:border-r-0", index < stageStep && "is-done", index === stageStep && "is-current")}><i>{String(index + 1).padStart(2, "0")}</i>{label}</div>)}
          </div>
        </motion.section>

        <div className="competency-longform">
          <motion.section className="competency-section border-b border-[#D8E0E8] px-1 py-10 sm:px-3" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }}><SectionTitle icon={Network} imageSrc="/images/collaboration-network-icon-v1.png" flightAccent eyebrow="01 · 协作网络" title="从诊断到发布，一屏看清" description="诊断 → 生成 → 三重校验 → 发布" /><AgentCollaborationFlow workspace={workspace} /></motion.section>
          <motion.div className="border-b border-[#D8E0E8] py-8" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }}><DebateQualityPanel workspace={workspace} /></motion.div>
          <motion.section id="training-resources" className="competency-section scroll-mt-6 border-b border-[#D8E0E8] px-1 py-10 sm:px-3" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }}><div className="competency-resource-heading flex flex-wrap items-end justify-between gap-3"><SectionTitle icon={Layers3} imageSrc="/images/training-resource-capsule-v1.png" orbitAccent eyebrow="03 · 训练资源" title="本轮交付物" description={currentTopic} /><span className={cn("competency-resource-state rounded-full px-3 py-1.5 text-[12px] font-bold", released ? "is-released" : workspace.status === "running" ? "is-running" : "is-pending")}>{released ? `已发布 · ${workspace.decision?.quality_score ?? 0} 分` : workspace.status === "running" ? "生成中" : "待生成"}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(Object.keys(RESOURCE_META) as ResourceId[]).map((id, index) => <ResourceCard key={id} id={id} index={index} plan={plan} ready={Boolean(workspace.outputs[id])} released={released} reviewScore={reviewScoreFor(workspace.reviews, id)} videoStatus={id === "video" ? workspace.outputs.video?.status : undefined} />)}</div></motion.section>
          <motion.div className="py-8" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }}><AcceptancePanel workspace={workspace} feedbackBusy={feedbackBusy} feedbackError={feedbackError} completedRoundCount={completedRoundCount} requiredRoundCount={requiredRoundCount} certificateEligible={certificateEligible} onSimplify={startSimplifiedRound} onChallenge={startAdvancedChallenge} onNext={startNextKnowledgeRound} onOpenCertificate={() => setCertificateOpen(true)} /></motion.div>
        </div>
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

function splitRoleTitle(name: string) {
  const normalized = name.trim()
  if (!normalized) return ["岗位训练"]
  const qualification = normalized.match(/^(.*?)([（(][^）)]*[）)])$/u)
  if (qualification?.[1] && qualification[2]) {
    const roleBase = qualification[1].trim()
    if (roleBase) return [roleBase, qualification[2]]
  }
  const latinPrefix = normalized.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*(.+)$/u)
  if (latinPrefix?.[1] && latinPrefix[2]) return [latinPrefix[1], latinPrefix[2]]
  const suffixBreak = normalized.match(/^(.*?)(工程师|经理|主管|总监|总经理|主任|专家|讲师|科学家)$/u)
  if (suffixBreak?.[1] && suffixBreak[2]) return [suffixBreak[1], suffixBreak[2]]
  if (normalized.length > 11) {
    const half = Math.ceil(normalized.length / 2)
    return [normalized.slice(0, half), normalized.slice(half)]
  }
  return [normalized]
}

function SectionTitle({ icon: Icon, imageSrc, flightAccent = false, orbitAccent = false, landingAccent = false, eyebrow, title, description }: { icon: typeof Target; imageSrc?: string; flightAccent?: boolean; orbitAccent?: boolean; landingAccent?: boolean; eyebrow: string; title: string; description: string }) {
  return <div className={cn("competency-section-title flex items-start gap-4", flightAccent && "has-flight", orbitAccent && "has-orbit", landingAccent && "has-landing")}><span className={cn("grid size-11 shrink-0 place-items-center rounded-[14px]", imageSrc && "is-real-icon")}>{imageSrc ? <img src={imageSrc} alt="" aria-hidden="true" /> : <Icon className="size-5" />}</span><div><span className="text-[12px] font-extrabold tracking-[.14em]">{eyebrow}</span><h2 className="mt-1 text-[24px] font-black tracking-[-.035em] text-[#172E49]">{title}</h2><p className="mt-1 text-[14px] font-medium leading-6 text-[#62748A]">{description}</p></div>{flightAccent && <i className="competency-section-flight" aria-hidden="true"><img className="is-eastbound" src="/images/section-aircraft-v1.png" alt="" /><img className="is-westbound" src="/images/section-aircraft-v1.png" alt="" /></i>}{orbitAccent && <i className="competency-section-orbit" aria-hidden="true"><span className="is-orbit-upper"><img src="/images/section-satellite-v1.png" alt="" /></span><span className="is-orbit-lower"><img src="/images/section-satellite-v1.png" alt="" /></span><b className="is-data-one" /><b className="is-data-two" /><b className="is-data-three" /></i>}{landingAccent && <i className="competency-section-landing" aria-hidden="true"><span className="is-drop-one"><img src="/images/section-parachute-capsule-v1.png" alt="" /></span><span className="is-drop-two"><img src="/images/section-parachute-capsule-v1.png" alt="" /></span><span className="is-drop-three"><img src="/images/section-parachute-capsule-v1.png" alt="" /></span><b className="is-zone-one" /><b className="is-zone-two" /><b className="is-zone-three" /></i>}</div>
}

function ResourceCard({ id, index, plan, ready, released, reviewScore, videoStatus }: { id: ResourceId; index: number; plan?: PersonalizedTrainingPlan; ready: boolean; released: boolean; reviewScore?: number; videoStatus?: string }) {
  const meta = RESOURCE_META[id]
  const Icon = meta.icon
  const stage = plan?.stages[index]
  const videoReady = videoStatus === "ready" || videoStatus === "completed" || videoStatus === "done"
  const badgeState = released && ready ? "is-published" : ready ? "is-ready" : "is-waiting"
  return <motion.article className={cn("competency-resource-card rounded-[20px] border p-5", meta.tone, released && ready && "is-released", ready && "is-ready")} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .5, delay: index * .05 }} whileHover={{ y: -4 }}><img className="competency-resource-art" src={meta.background} alt="" aria-hidden="true" loading="lazy" decoding="async" /><span className="competency-resource-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="flex items-start justify-between gap-3"><span className="competency-resource-icon grid size-12 place-items-center" aria-hidden="true"><Icon /></span><span className={cn("competency-resource-badge rounded-full px-3 py-1.5 text-[12px] font-bold", badgeState)}>{released && ready ? (id === "video" ? (videoReady ? "已发布" : "生成中") : `${reviewScore ?? "—"} 分`) : ready ? "待发布" : "待生成"}</span></div><h3 className="mt-5 text-[20px] font-black text-[#172E49]">{meta.title}</h3><p className="mt-2 line-clamp-2 text-[14px] leading-6 text-[#607287]">{stage?.goal || meta.detail}</p>{released && ready ? <Link to={`/workspace/r/${id}`} className="competency-resource-footer mt-4 inline-flex h-10 items-center gap-2 text-[13px] font-black">打开资源<ArrowRight className="size-4" /></Link> : <span className="competency-resource-footer mt-4 inline-flex h-10 items-center gap-2 text-[13px] font-bold"><ShieldCheck className="size-4" />等待发布</span>}</motion.article>
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
    <section className={cn("competency-section competency-acceptance mt-4 p-5 sm:p-6", certificateEligible && "is-complete")}>
      <SectionTitle
        icon={certificateEligible ? Award : Flag}
        imageSrc="/images/training-acceptance-beacon-v1.png"
        landingAccent
        eyebrow={certificateEligible ? "05 · 全部训练完成" : "05 · 本轮验收"}
        title={certificateEligible ? "祝贺你完成岗位学习，专属电子奖状已收入荣誉墙" : "本轮验收"}
        description={certificateEligible ? "系统已核对全部学习轮次与最终验收结果，证书已自动发放，可随时查看和下载。" : "根据本轮已完成题目的正确率选择下一步。"}
      />

      <div className="competency-acceptance-console mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="competency-acceptance-metric flex min-h-32 flex-col justify-center px-5 py-4">
          <span className="text-xs font-black">{certificateEligible ? "岗位训练进度" : "正确率"}</span>
          {certificateEligible && <strong className="mt-2 text-3xl">{requiredRoundCount} / {requiredRoundCount}</strong>}
          {!certificateEligible && <strong className="mt-2 text-3xl">{accuracyLabel}</strong>}
          <i className="competency-acceptance-gauge" aria-hidden="true" />
        </div>
        <div className="competency-acceptance-actions flex min-h-32 flex-wrap items-center gap-3 px-5 py-4">
          <i className="competency-acceptance-energy" aria-hidden="true"><b /><b /><b /></i>
          {certificateEligible ? (
            <>
              <button type="button" onClick={onOpenCertificate} className="competency-acceptance-button is-gold inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black text-white"><Award className="size-4" />查看岗位奖状</button>
              <span className="competency-acceptance-note text-xs font-bold">已完成 {completedRoundCount} 轮岗位学习</span>
            </>
          ) : (
            <>
              {!hasAttempts && <Link to="/workspace/r/quiz" className="competency-acceptance-button is-blue inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black text-white"><BookOpenCheck className="size-4" />开始分阶测试<ArrowRight className="size-4" /></Link>}
              {hasAttempts && !advancedChallengeAvailable && <button type="button" onClick={() => void onSimplify()} disabled={feedbackBusy || workspace.status === "running"} className="competency-acceptance-button is-coral inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}降维解释</button>}
              {hasAttempts && advancedChallengeAvailable && <button type="button" onClick={() => void onChallenge()} disabled={feedbackBusy} className="competency-acceptance-button is-violet inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}生成进阶挑战任务</button>}
              {hasAttempts && advancedChallengeAvailable && <button type="button" onClick={() => void onNext()} disabled={feedbackBusy || workspace.status === "running"} className="competency-acceptance-button is-ghost inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black disabled:opacity-50"><ArrowRight className="size-4" />继续生成新一轮知识</button>}
            </>
          )}
          {feedbackError && <p role="alert" className="w-full text-xs text-[#A85138]">{feedbackError}</p>}
        </div>
      </div>
    </section>
  )
}

function RoleRequired() {
  return <main className="app-page paper-theme min-h-dvh"><div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位训练" selectionLabel="尚未选择目标岗位" /><section className="mt-4 grid min-h-[64vh] place-items-center rounded-[28px] border border-[#DCE5F1] bg-white px-5 text-center shadow-[0_18px_48px_rgba(41,67,112,.08)]"><div className="max-w-lg py-16"><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[#E8F2FF] text-[#356FD1]"><UserRoundSearch className="size-7" /></span><p className="mt-5 text-[11px] font-extrabold tracking-[.16em] text-[#6F83A2]">开始前</p><h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17233D]">先选择目标岗位，再建立训练路径</h1><p className="mt-3 text-sm leading-6 text-[#66758B]">岗位决定学习范围，画像决定从哪里开始。</p><Link to="/courses?returnTo=%2Fprofile" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-sm font-bold text-white">选择目标岗位<ArrowRight className="size-4" /></Link></div></section></div></main>
}

type WorkspaceState = ReturnType<typeof useWorkspaceStore>
