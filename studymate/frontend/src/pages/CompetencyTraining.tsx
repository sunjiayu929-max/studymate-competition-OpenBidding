import { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileCheck2,
  FileText,
  Film,
  Flag,
  Gauge,
  GitCompareArrows,
  Code2,
  Library,
  Layers3,
  Lock,
  Loader2,
  Map as MapIcon,
  Network,
  RefreshCw,
  Rocket,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
  Wrench,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { AgentCollaborationFlow } from "@/components/AgentCollaborationFlow"
import { DebateQualityPanel } from "@/components/DebateQualityPanel"
import { LearnerMatchReport } from "@/components/LearnerMatchReport"
import { TheoryAssessmentModal, type TheoryAssessment, type TheoryGateState } from "@/components/TheoryAssessmentModal"
import { apiGet } from "@/lib/api"
import { buildRoleCompetencyMap, type CompetencyLevel, type RoleCompetencyMap, type RoleCompetencyNode } from "@/lib/roleCompetencyMap"
import { useTrackPage } from "@/lib/useTrackPage"
import { cn } from "@/lib/utils"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { workspaceStore, useWorkspaceStore, type PersonalizedTrainingPlan, type WorkspaceState } from "@/store/workspace"

interface ProfileDims {
  knowledge_base: Record<string, number>
  cognitive_style: Record<string, number>
  goals: { primary: string; deadline: string; target_topics: string[] }
  weak_points: { topics: string[]; error_types: string[] }
  pace: { hours_per_week: number; intensity: string }
  preference: Record<string, number>
  employment_skills: Record<string, number>
  theory_assessments: Record<string, {
    assessment_id: number
    role_id: string
    role_name: string
    score: number
    knowledge_level: string
    competency_scores: Record<string, number>
    weak_topics: string[]
    completed_at: string
  }>
}

interface ProfileResponse {
  user_id: number
  version: number
  dims: ProfileDims
  updated_at: string | null
  intake_complete: boolean
  missing_fields: string[]
}

const SKILL_LABELS: Record<string, string> = {
  programming: "编程实现",
  algorithms: "算法建模",
  data_ai: "数据与 AI",
  systems: "系统与网络",
  engineering: "工程实践",
  professional: "职业素养",
}

const RESOURCE_META = {
  doc: { title: "定制讲义", icon: FileText, detail: "建立岗位任务模型与专业边界" },
  guide: { title: "实操指南", icon: Wrench, detail: "完成可复现、可验收的岗位交付物" },
  quiz: { title: "分阶测试", icon: BookOpenCheck, detail: "验证理解、场景判断与迁移能力" },
  mindmap: { title: "思维导图", icon: Network, detail: "梳理岗位任务中的概念、依赖与关系" },
  reading: { title: "拓展阅读", icon: Library, detail: "补充岗位资料、论文、文档与视频" },
  code: { title: "代码案例", icon: Code2, detail: "提供适配岗位任务的可运行示例" },
  video: { title: "可视讲解", icon: Film, detail: "先看动画讲解，再看岗位视频" },
} as const

const ADVANCED_CHALLENGE_THRESHOLD = 0.666

type ResourceId = keyof typeof RESOURCE_META

type CapabilityState = "mastered" | "developing" | "current" | "ready" | "locked"

interface CapabilityEvidence {
  level: CompetencyLevel
  score: number
  verifiedAt: string
  runId: string
}

interface CapabilityViewNode extends RoleCompetencyNode {
  level: CompetencyLevel
  state: CapabilityState
  score?: number
}

const CAPABILITY_STATE_META: Record<CapabilityState, { label: string; short: string; badge: string; fill: string; stroke: string }> = {
  mastered: { label: "已验收 · L3", short: "L3", badge: "bg-[#DDF2E9] text-[#18745E]", fill: "#E6F6EF", stroke: "#2A8A70" },
  developing: { label: "待补强", short: "补强", badge: "bg-[#FFF0D8] text-[#9A651E]", fill: "#FFF4E2", stroke: "#C6872E" },
  current: { label: "本轮训练", short: "本轮", badge: "bg-[#E7F0FF] text-[#2D65B7]", fill: "#EAF2FF", stroke: "#3974CA" },
  ready: { label: "可以开始", short: "可开始", badge: "bg-[#EEF2F7] text-[#5F7087]", fill: "#F4F7FB", stroke: "#8799AF" },
  locked: { label: "前置未完成", short: "未解锁", badge: "bg-[#F0F1F4] text-[#8993A2]", fill: "#F5F6F8", stroke: "#A8B0BC" },
}

export function CompetencyTraining() {
  useTrackPage("competency_training")
  const { pathname } = useLocation()
  const view = pathname === "/competency/resources" ? "resources" : pathname === "/competency/audit" ? "audit" : pathname === "/competency/report" ? "report" : "overview"
  const role = useTargetRole()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const workspace = useWorkspaceStore()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(Boolean(user?.user_id))
  const [profileError, setProfileError] = useState("")
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackError, setFeedbackError] = useState("")
  const [selectedCapabilityId, setSelectedCapabilityId] = useState("")
  const [capabilityEvidence, setCapabilityEvidence] = useState<Record<string, CapabilityEvidence>>({})
  const [theoryGate, setTheoryGate] = useState<TheoryGateState>({ loading: false, completed: false, required: false, assessment: null, error: "" })
  const [theoryPromptSignal, setTheoryPromptSignal] = useState(0)
  const [reportGenerated, setReportGenerated] = useState(false)
  const capabilityMap = useMemo(() => role ? buildRoleCompetencyMap(role) : null, [role])
  const reportStorageKey = user?.user_id && role?.id && workspace.runId
    ? `sm:learner-match-report:${user.user_id}:${role.id}:${workspace.runId}`
    : ""

  useEffect(() => {
    if (!user?.user_id) return
    let active = true
    setProfileLoading(true)
    apiGet<ProfileResponse>(`/profile/${user.user_id}`)
      .then((value) => { if (active) { setProfile(value); setProfileError("") } })
      .catch(() => { if (active) setProfileError("画像暂时无法读取，请确认后端服务已启动。") })
      .finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [user?.user_id])

  useEffect(() => {
    if (!user?.user_id || !role?.id) {
      setCapabilityEvidence({})
      return
    }
    setCapabilityEvidence(readCapabilityEvidence(user.user_id, role.id))
    setSelectedCapabilityId("")
  }, [role?.id, user?.user_id])

  useEffect(() => {
    const feedback = workspace.feedback
    const trainingPlan = workspace.outputs.training_plan
    if (!user?.user_id || !role?.id || !capabilityMap || !feedback || feedback.accuracy === null || !workspace.runId || !trainingPlan) return

    const accuracy = feedback.accuracy
    const level: CompetencyLevel = accuracy >= 85 ? 3 : accuracy >= 60 ? 2 : 1
    setCapabilityEvidence((current) => {
      const next = { ...current }
      let changed = false
      for (const competencyName of trainingPlan.priority_competencies) {
        const node = capabilityMap.nodes.find((item) => item.name === competencyName)
        if (!node || next[node.id]?.runId === workspace.runId) continue
        const previous = next[node.id]
        if (!previous || level >= previous.level) {
          next[node.id] = {
            level,
            score: accuracy,
            verifiedAt: new Date().toISOString(),
            runId: workspace.runId,
          }
          changed = true
        }
      }
      if (!changed) return current
      writeCapabilityEvidence(user.user_id, role.id, next)
      return next
    })
  }, [capabilityMap, role?.id, user?.user_id, workspace.feedback, workspace.outputs.training_plan, workspace.runId])

  useEffect(() => {
    setReportGenerated(Boolean(reportStorageKey && sessionStorage.getItem(reportStorageKey) === "generated"))
  }, [reportStorageKey])

  if (!role || !capabilityMap) return <RoleRequired />

  const employmentEvidence = Object.entries(profile?.dims.employment_skills ?? {}).filter(([, score]) => score > 0)
  const profileScore = profile ? Math.min(100,
    20
    + (profile.dims.goals.primary.trim() ? 20 : 0)
    + (profile.dims.pace.hours_per_week > 0 ? 15 : 0)
    + (profile.dims.goals.target_topics.length || profile.dims.weak_points.topics.length ? 15 : 0)
    + (employmentEvidence.length ? 20 : 0)
    + (profile.version > 1 ? 10 : 0)
  ) : 0
  const profileReady = Boolean(profile?.intake_complete)
  const theoryCompleted = theoryGate.completed && theoryGate.assessment?.role_id === role.id
  const diagnosisReady = profileReady && theoryCompleted
  const theoryEvidence = profile?.dims.theory_assessments?.[role.id]
  const plan = workspace.outputs.training_plan
  const released = workspace.decision?.decision === "publish"
  const attempts = Object.values(workspace.quizAttempts)
  const correctCount = attempts.filter((item) => item.is_correct).length
  const accuracyRate = attempts.length ? correctCount / attempts.length : null
  const accuracyPercent = accuracyRate === null ? null : Math.round(accuracyRate * 100)
  const submittedAccuracyRate = workspace.feedback?.answered_count
    ? (workspace.feedback.answered_count - workspace.feedback.wrong_items.length) / workspace.feedback.answered_count
    : null
  const advancedChallengeAvailable = submittedAccuracyRate !== null && submittedAccuracyRate >= ADVANCED_CHALLENGE_THRESHOLD
  const resourceCount = (["doc", "guide", "quiz", "mindmap", "reading", "code", "video"] as ResourceId[]).filter((id) => Boolean(workspace.outputs[id])).length
  const videoReviewScores = ["evidence_review", "practice_review", "difficulty_review"]
    .map((id) => workspace.reviews[id]?.score)
    .filter((score): score is number => typeof score === "number")
  const videoReviewScore = videoReviewScores.length
    ? Math.round(videoReviewScores.reduce((sum, score) => sum + score, 0) / videoReviewScores.length)
    : undefined
  const degraded = Boolean(workspace.decision?.fallback)
  const fallbackScore = workspace.decision?.fallback?.score
  const learnable = released || degraded
  const completedSteps = [Boolean(role), diagnosisReady, Boolean(plan), released, reportGenerated, Boolean(workspace.feedback)].filter(Boolean).length
  const agentDone = workspace.agents.filter((agent) => agent.status === "done").length
  const agentProgress = workspace.agents.length ? Math.round(agentDone / workspace.agents.length * 100) : 0
  const cycle = plan?.cycle ?? workspace.diagnosis?.training_cycle ?? 1
  const nextTopicIndex = workspace.feedback ? cycle % role.sampleTasks.length : (cycle - 1) % role.sampleTasks.length
  const nextTopic = role.sampleTasks[nextTopicIndex] ?? role.sampleTasks[0]
  const challengeTopic = workspace.topic.trim() || nextTopic
  const challengeHref = `/quiz?create=1&challenge=1&topic=${encodeURIComponent(challengeTopic)}`
  const capabilityNodes = resolveCapabilityNodes(capabilityMap, capabilityEvidence, plan)
  const verifiedCapabilityCount = capabilityNodes.filter((node) => node.level === 3).length
  const currentCapabilityNodes = capabilityNodes.filter((node) => node.state === "current")
  const selectedCapability = capabilityNodes.find((node) => node.id === selectedCapabilityId)
    ?? capabilityNodes.find((node) => node.state === "current")
    ?? capabilityNodes.find((node) => node.state === "ready")
    ?? capabilityNodes[0]
  const currentFocusNodes = currentCapabilityNodes.length > 0
    ? currentCapabilityNodes
    : selectedCapability
      ? [selectedCapability]
      : []

  const generateLearnerReport = () => {
    if (!released || !reportStorageKey) return
    sessionStorage.setItem(reportStorageKey, "generated")
    setReportGenerated(true)
  }

  const resetLearnerReport = () => {
    if (reportStorageKey) sessionStorage.removeItem(reportStorageKey)
    setReportGenerated(false)
  }

  const startRound = () => {
    if (!user?.user_id || !course || workspace.status === "running") return
    if (!theoryCompleted) {
      setTheoryPromptSignal((value) => value + 1)
      return
    }
    void workspaceStore.start(nextTopic, user.user_id, course.id, course.name)
  }

  const submitFeedback = async () => {
    setFeedbackBusy(true)
    setFeedbackError("")
    try {
      await workspaceStore.submitTrainingFeedback()
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "验收结果回写失败，请稍后重试。")
    } finally {
      setFeedbackBusy(false)
    }
  }

  return (
    <main className="app-page paper-theme min-h-dvh pb-12">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" labelOverride={view === "overview" ? "岗位训练中心" : view === "resources" ? "训练资源" : view === "audit" ? "协作审计链" : "学习决策报告"} groupOverride="岗位胜任力闭环" selectionLabel={role.name} />
        {user?.user_id && course && <TheoryAssessmentModal
          enabled={profileReady}
          userId={user.user_id}
          roleId={role.id}
          roleName={role.name}
          courseId={course.id}
          competencies={capabilityMap.nodes.map((node) => node.name)}
          reopenSignal={theoryPromptSignal}
          onGateChange={setTheoryGate}
          onCompleted={(assessment: TheoryAssessment) => {
            setTheoryGate({ loading: false, completed: true, required: false, assessment, error: "" })
            void apiGet<ProfileResponse>(`/profile/${user.user_id}`).then(setProfile).catch(() => undefined)
          }}
        />}

        <section className="relative mt-4 overflow-hidden rounded-[30px] border border-[#C9D9ED] bg-[#122C4D] px-5 py-6 text-white shadow-[0_24px_64px_rgba(32,73,130,.18)] sm:px-7 sm:py-8 lg:px-10">
          <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-[#7654DC]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-[#16A6A1]/20 blur-3xl" />
          <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_430px] xl:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-[#CFE2FF]"><Sparkles className="size-3.5 text-[#F1D47D]" />第 {cycle} 轮岗位训练</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F3E7]/12 px-3 py-1.5 text-[10px] font-bold text-[#BFECDD]"><span className="size-1.5 rounded-full bg-[#5ED5B5]" />诊断—计划—训练—验收</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl lg:text-[38px]">从当前基础出发，<br className="hidden sm:block" />一步步胜任目标岗位</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#C2D2E6]">当前目标：<strong className="text-white">{role.name}</strong>。先确定起点，再按计划训练；本轮结果会用于安排下一步。</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {!profileReady ? (
                  <Link to="/profile" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] hover:bg-[#F2F7FF]"><UserRoundSearch className="size-4" />完善岗位画像<ArrowRight className="size-4" /></Link>
                ) : !theoryCompleted ? (
                  <button type="button" onClick={() => setTheoryPromptSignal((value) => value + 1)} disabled={!course || theoryGate.loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] disabled:cursor-not-allowed disabled:opacity-50">{theoryGate.loading ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}{theoryGate.loading ? "正在组织岗位试卷" : "完成理论基线测评"}</button>
                ) : workspace.status === "running" ? (
                  <Link to="/competency/audit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><Loader2 className="size-4 animate-spin" />查看计划生成进度</Link>
                ) : workspace.feedback ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] disabled:opacity-50"><RefreshCw className="size-4" />启动第 {cycle + 1} 轮训练</button>
                ) : workspace.decision?.decision === "rework" ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] disabled:opacity-50"><RefreshCw className="size-4" />重新调整本轮计划</button>
                ) : !plan ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] disabled:cursor-not-allowed disabled:opacity-50"><Rocket className="size-4" />生成本轮训练计划</button>
                ) : released && !reportGenerated ? (
                  <a href="#learner-match-report" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><FileCheck2 className="size-4" />生成个人决策报告<ArrowRight className="size-4" /></a>
                ) : released ? (
                  <Link to="/workspace/r/doc" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><FileText className="size-4" />开始本轮训练<ArrowRight className="size-4" /></Link>
                ) : learnable ? (
                  <Link to="/workspace/r/doc" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><BookOpenCheck className="size-4" />查看降级学习包<ArrowRight className="size-4" /></Link>
                ) : (
                  <Link to="/competency/audit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><ShieldCheck className="size-4" />查看审核结果</Link>
                )}
                <Link to="/courses?returnTo=%2Fcompetency" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/8 px-4 text-sm font-bold text-white hover:bg-white/14">切换目标岗位<ChevronRight className="size-4" /></Link>
              </div>
              {!course && <p className="mt-3 text-[11px] text-[#F5D9A0]">该岗位专属知识库尚未接入，当前可先完成画像；资源生成需选择已开放的 FDE 岗位。</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric value={`${completedSteps}/6`} label="闭环阶段" detail="每一步均保留证据" accent />
              <Metric value={`${profileScore}%`} label="画像完整度" detail={profileReady ? `画像 v${profile?.version ?? 1} 已参与决策` : "还需补充目标与实践证据"} />
              <Metric value={workspace.agents.length ? `${agentDone}/${workspace.agents.length}` : "11"} label="协同 Agent" detail={workspace.status === "running" ? `协作进度 ${agentProgress}%` : "分工、交叉审核与仲裁"} />
              <Metric value={`${resourceCount}/7`} label="岗位训练资源" detail={released ? "已越过发布门禁" : "裁决通过后开放"} />
            </div>
          </div>
        </section>

        <nav className="mt-3 flex flex-wrap items-center gap-2" aria-label="岗位训练中心视图">
          {[
            ["/competency", "能力路径", view === "overview"],
            ["/competency/audit", "协作审计", view === "audit"],
            ["/competency/resources", "训练资源", view === "resources"],
            ["/competency/report", "学习报告", view === "report"],
          ].map(([to, label, active]) => <Link key={to as string} to={to as string} className={cn("inline-flex h-9 items-center rounded-lg border px-3 text-[10px] font-bold transition", active ? "border-[#315E83] bg-[#E7EDF3] text-[#244C66]" : "border-[#DCE5F1] bg-white text-[#708198] hover:bg-[#F4F8FC]")}>{label as string}</Link>)}
        </nav>

        {view === "overview" && <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-4 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-5">
          <div className="grid gap-2 md:grid-cols-6">
            <FlowStep index="01" label="选择岗位" detail={role.name} status="done" />
            <FlowStep index="02" label="画像诊断" detail={!profileReady ? "等待补充画像证据" : theoryCompleted ? `理论基线 ${theoryGate.assessment?.score ?? theoryEvidence?.score ?? "—"} 分` : "等待首次理论测评"} status={diagnosisReady ? "done" : "active"} />
            <FlowStep index="03" label="协同决策" detail={plan ? `第 ${plan.cycle} 轮计划已形成` : workspace.status === "running" ? "Agent 协商中" : "等待启动"} status={plan ? "done" : diagnosisReady ? "active" : "idle"} />
            <FlowStep index="04" label="资源训练" detail={released ? "7 类资源已发布" : "等待质量门禁"} status={released ? "done" : plan ? "active" : "idle"} />
            <FlowStep index="05" label="匹配报告" detail={reportGenerated ? "学习决策已生成" : released ? "等待生成报告" : "等待资源发布"} status={reportGenerated ? "done" : released ? "active" : "idle"} />
            <FlowStep index="06" label="成果验收" detail={workspace.feedback ? "结果已进入下一轮" : attempts.length ? `已完成 ${attempts.length} 项验证` : "等待测试证据"} status={workspace.feedback ? "done" : reportGenerated ? "active" : "idle"} last />
          </div>
        </section>}

        {view === "overview" && <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <SectionTitle icon={MapIcon} eyebrow="岗位全景 · 训练路径地图" title={`${role.name}要学什么、学多少、学到哪里`} description="训练路径地图展示岗位能力之间的先后依赖、当前进度与最终验收节点。" />

            <div className="rounded-[20px] border border-[#D7CCF2] bg-[#F8F5FF] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-bold text-[#563F9E]"><Target className="size-4" />{currentCapabilityNodes.length ? "这一轮正在学习" : "下一步建议学习"}</span><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-[#7359BF]">第 {cycle} 轮重点</span></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentFocusNodes.map((node) => <button key={node.id} type="button" onClick={() => setSelectedCapabilityId(node.id)} className={cn("rounded-xl border px-3 py-2 text-left text-[10px] font-bold transition", selectedCapability?.id === node.id ? "border-[#7654DC] bg-white text-[#563F9E] shadow-sm" : "border-[#DED5F2] bg-white/65 text-[#6B5B91] hover:bg-white")}>{node.name}<span className="ml-2 text-[9px] font-medium text-[#8B7DAA]">L{node.level}/L3</span></button>)}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-[#706589]">{plan?.rationale || currentFocusNodes[0]?.task || "完成画像和理论测评后，这里会显示本轮重点。"}</p>
              {currentFocusNodes[0] && <div className="mt-3 rounded-xl border border-white bg-white/75 px-3 py-2.5"><span className="text-[9px] font-bold text-[#8977B5]">本轮成果</span><p className="mt-1 text-[10px] leading-4 text-[#554B6D]">{currentFocusNodes[0].deliverable}</p></div>}
            </div>

          <div className="mt-5">
            <TrainingRouteMap map={capabilityMap} nodes={capabilityNodes} selectedId={selectedCapability?.id} onSelect={setSelectedCapabilityId} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            {selectedCapability && <CapabilityDetail node={selectedCapability} />}
            <div className="rounded-2xl border border-[#DCE4EE] bg-[#F8FAFD] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#294A73]"><Flag className="size-4 text-[#7A5BC0]" />什么才算学完</div>
              <ul className="mt-3 space-y-2">
                {capabilityMap.completionCriteria.map((criterion, index) => <li key={criterion} className="flex gap-2 text-[10px] leading-5 text-[#62738A]"><span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold", index === 0 && verifiedCapabilityCount === capabilityNodes.length ? "bg-[#DDF2E9] text-[#18745E]" : "bg-white text-[#75849A]")}>{index + 1}</span>{criterion}</li>)}
              </ul>
            </div>
          </div>
        </section>}

        {view === "overview" && <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]">
          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
            <SectionTitle icon={UserRoundSearch} eyebrow="01 · 岗位画像" title="确认你的训练起点" description="目标决定方向，项目、实习和作品经历用于判断已有能力。" />
            {profileLoading ? <LoadingBlock text="正在读取画像证据…" /> : profileError ? <Notice text={profileError} tone="error" /> : profile ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <EvidenceCard icon={Target} label="岗位目标" value={profile.dims.goals.primary || role.name} detail={profile.dims.goals.target_topics.join("、") || "等待补充具体能力目标"} />
                <EvidenceCard icon={Clock3} label="训练约束" value={profile.dims.pace.hours_per_week ? `每周 ${profile.dims.pace.hours_per_week} 小时` : "时间预算未确认"} detail={profile.dims.goals.deadline || "完成期限未确认"} />
                <EvidenceCard icon={Gauge} label="优先差距" value={profile.dims.weak_points.topics.slice(0, 2).join("、") || "等待补充"} detail={workspace.diagnosis ? `${workspace.diagnosis.current_level} · 置信度 ${Math.round(workspace.diagnosis.evidence_confidence * 100)}%` : "生成计划时再次确认"} />
                <EvidenceCard icon={BadgeCheck} label="实践证据" value={employmentEvidence.length ? employmentEvidence.slice(0, 2).map(([key, score]) => `${SKILL_LABELS[key] ?? key} L${score}`).join("、") : "尚无可信实践证据"} detail={employmentEvidence.length ? `共 ${employmentEvidence.length} 个能力维度有证据` : "不等于能力为零，需要通过岗位任务验证"} />
                <EvidenceCard icon={BookOpenCheck} label="理论测试结果" value={theoryEvidence ? `${theoryEvidence.score} 分 · ${theoryEvidence.knowledge_level}` : theoryGate.loading ? "正在生成试卷" : "等待首次测评"} detail={theoryEvidence ? (theoryEvidence.weak_topics.length ? `待补强：${theoryEvidence.weak_topics.slice(0, 2).join("、")}` : "已达到训练起点") : "提交后用于安排首轮训练"} />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end"><Link to="/profile" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D8E3EF] px-3 text-[11px] font-bold text-[#3368B4] hover:bg-[#F1F6FD]">继续完善画像<ArrowRight className="size-3.5" /></Link></div>
          </section>

          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
            <SectionTitle icon={GitCompareArrows} eyebrow="02 · 训练计划" title="根据目标、基础和时间安排本轮训练" description="计划会兼顾岗位要求、每周时间和学习难度。" />
            {plan ? <DebatePanel plan={plan} /> : workspace.status === "running" ? <LoadingBlock text={`正在执行：${workspace.logs.at(-1) || "画像诊断与岗位知识检索"}`} /> : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#CBD8E8] bg-[#F8FBFF] p-5 text-center"><BrainCircuit className="mx-auto size-6 text-[#5D7FAA]" /><p className="mt-3 text-xs font-bold text-[#334B69]">完成画像后即可生成训练计划</p><p className="mt-1 text-[10px] leading-5 text-[#718096]">你可以查看计划依据和审核结果。</p></div>
            )}
          </section>
        </div>}

        {view === "audit" && <section id="agent-collaboration" className="mt-4 scroll-mt-24 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle icon={BrainCircuit} eyebrow="计划生成记录" title="查看本轮计划如何形成" description="这里保留建议、检查和最终结果，方便核对。" />
            {workspace.status === "running" && <button type="button" onClick={() => workspaceStore.cancel()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E1C9C2] bg-[#FFF8F5] px-3 text-[11px] font-bold text-[#A5523A]">停止本轮协作</button>}
          </div>
          <AgentAudit workspace={workspace} progress={agentProgress} />
          <DebateQualityPanel workspace={workspace} />
        </section>}

        {view === "resources" && <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><SectionTitle icon={Layers3} eyebrow="03 · 个性化资源" title="六类资源围绕同一个岗位任务呼应" description={plan?.rationale || `本轮候选任务：${nextTopic}`} /><span className={cn("rounded-full px-3 py-1.5 text-[10px] font-bold", released ? "bg-[#E5F6F0] text-[#18745E]" : "bg-[#EEF3FA] text-[#61738D]")}>{released ? `质量门禁通过 · ${workspace.decision?.quality_score ?? 0} 分` : workspace.status === "running" ? "生成与审核进行中" : "等待协同计划"}</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(["doc", "guide", "quiz", "mindmap", "code", "video"] as ResourceId[]).map((id, index) => <ResourceCard key={id} id={id} index={index} plan={plan} ready={Boolean(workspace.outputs[id])} released={released} reviewScore={id === "video" ? videoReviewScore : id === "doc" || id === "mindmap" ? workspace.reviews.evidence_review?.score : id === "guide" || id === "code" ? workspace.reviews.practice_review?.score : workspace.reviews.difficulty_review?.score} videoStatus={id === "video" ? workspace.outputs.video?.status : undefined} />)}
          </div>
          {degraded && <div className="mt-4 rounded-2xl border border-[#E8CDBE] bg-[#FFF7F2] p-4 text-[#7D513F]"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-xs">当前提供临时学习包</strong><p className="mt-1 text-[10px] leading-5">内容尚未通过正式审核，可以先学习并查看审核结果。</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold">可用性评分 {fallbackScore ?? "--"} 分</span></div></div>}
        </section>}

        {view === "report" && <LearnerMatchReport
          released={released}
          generated={reportGenerated}
          onGenerate={generateLearnerReport}
          onRegenerate={resetLearnerReport}
          diagnosis={workspace.diagnosis}
          plan={plan}
          theoryScore={theoryEvidence?.score ?? theoryGate.assessment?.score ?? undefined}
          theoryWeakTopics={theoryEvidence?.weak_topics ?? []}
          profileWeakTopics={profile?.dims.weak_points.topics ?? []}
          feedbackAccuracy={workspace.feedback?.accuracy}
          capabilities={capabilityNodes.map((node) => ({ id: node.id, name: node.name, level: node.level, state: node.state, task: node.task }))}
          resources={[
            { id: "doc", title: RESOURCE_META.doc.title, reviewScore: workspace.reviews.evidence_review?.score ?? 0, ready: Boolean(workspace.outputs.doc) },
            { id: "guide", title: RESOURCE_META.guide.title, reviewScore: workspace.reviews.practice_review?.score ?? 0, ready: Boolean(workspace.outputs.guide) },
            { id: "quiz", title: RESOURCE_META.quiz.title, reviewScore: workspace.reviews.difficulty_review?.score ?? 0, ready: Boolean(workspace.outputs.quiz) },
          ]}
        />}

        {view === "report" && <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
            <div>
              <SectionTitle icon={FileCheck2} eyebrow="05 · 本轮验收" title="查看结果并决定下一步" description="提交本轮结果后，系统会继续补强薄弱项或进入更难任务。" />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ResultMetric label="已验证题目" value={`${attempts.length}`} detail="来自本轮分阶测试" />
                <ResultMetric label="当前正确率" value={accuracyPercent === null ? "—" : `${accuracyPercent}%`} detail={attempts.length ? `${correctCount} 对 / ${attempts.length - correctCount} 错` : "等待真实作答"} />
                <ResultMetric label="闭环状态" value={workspace.feedback ? "已回写" : "待回写"} detail={workspace.feedback ? "下一轮将读取本次结果" : "完成测试后提交验收"} />
              </div>
            </div>
            <div className={cn("rounded-2xl border p-4", workspace.feedback ? "border-[#BFDCCF] bg-[#F3FAF7]" : "border-[#D9E3EF] bg-[#F8FBFF]")}>
              <div className="flex items-center gap-2 text-xs font-bold text-[#294A73]">{workspace.feedback ? <CheckCircle2 className="size-4 text-[#1A8067]" /> : <CircleDashed className="size-4" />}{workspace.feedback ? "下一轮决策已生成" : "等待验收证据"}</div>
              <p className="mt-2 text-[11px] leading-5 text-[#65758C]">{advancedChallengeAvailable ? `本轮正确率已达到进阶要求。你可以继续挑战“${challengeTopic}”，也可以进入下一轮。` : workspace.feedback?.message || (released ? attempts.length ? "作答已完成，提交验收后即可获得下一步建议。" : "先完成分阶测试，再提交本轮验收。" : "训练资源通过审核后即可开始测试。")}</p>
              {workspace.feedback && <div className="mt-3 rounded-xl bg-white px-3 py-2 text-[10px] text-[#557567]">{advancedChallengeAvailable ? "下一步：进阶挑战或下一轮训练" : `下一步：${workspace.feedback.next_action}`} · 画像置信度 +{Math.round(workspace.feedback.profile_update.confidence_delta * 100)}%</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {released && !attempts.length && <Link to="/workspace/r/quiz" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white">进入分阶测试<ArrowRight className="size-3.5" /></Link>}
                {released && attempts.length > 0 && !workspace.feedback && <button type="button" onClick={() => void submitFeedback()} disabled={feedbackBusy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}提交本轮验收</button>}
                {advancedChallengeAvailable && <Link to={challengeHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#6D50C7] px-3 text-[11px] font-bold text-white shadow-[0_7px_16px_rgba(109,80,199,.18)] hover:bg-[#5940AD]"><Rocket className="size-3.5" />进阶挑战任务<ArrowRight className="size-3.5" /></Link>}
                {workspace.feedback && <button type="button" onClick={startRound} disabled={!course || workspace.status === "running"} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold disabled:opacity-50", advancedChallengeAvailable ? "border border-[#C9D9ED] bg-white text-[#315E83] hover:bg-[#F1F6FC]" : "bg-[#2468CE] text-white")}><RefreshCw className="size-3.5" />{advancedChallengeAvailable ? "启动下一轮" : "降维解释"}</button>}
                <Link to="/competency/audit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D4DFEB] bg-white px-3 text-[11px] font-bold text-[#5D718D]">查看计划记录</Link>
              </div>
              {feedbackError && <p role="alert" className="mt-2 text-[10px] text-[#A85138]">{feedbackError}</p>}
            </div>
          </div>
        </section>}
      </div>
    </main>
  )
}

function capabilityStorageKey(userId: number, roleId: string) {
  return `sm:role-capability-evidence:${userId}:${roleId}`
}

function readCapabilityEvidence(userId: number, roleId: string): Record<string, CapabilityEvidence> {
  try {
    const raw = window.localStorage.getItem(capabilityStorageKey(userId, roleId))
    return raw ? JSON.parse(raw) as Record<string, CapabilityEvidence> : {}
  } catch {
    return {}
  }
}

function writeCapabilityEvidence(userId: number, roleId: string, evidence: Record<string, CapabilityEvidence>) {
  try {
    window.localStorage.setItem(capabilityStorageKey(userId, roleId), JSON.stringify(evidence))
  } catch {
    // 隐私模式或存储空间不可用时，本次会话内仍能正常展示。
  }
}

function resolveCapabilityNodes(map: RoleCompetencyMap, evidence: Record<string, CapabilityEvidence>, plan?: PersonalizedTrainingPlan): CapabilityViewNode[] {
  const currentNames = new Set(plan?.priority_competencies ?? [])
  return map.nodes.map((node) => {
    const record = evidence[node.id]
    const level = record?.level ?? 0
    let state: CapabilityState
    if (level === 3) state = "mastered"
    else if (currentNames.has(node.name)) state = "current"
    else if (level > 0) state = "developing"
    else if (node.prerequisites.every((id) => evidence[id]?.level === 3)) state = "ready"
    else state = "locked"
    return { ...node, level, state, score: record?.score }
  })
}

function TrainingRouteMap({ map, nodes, selectedId, onSelect }: { map: RoleCompetencyMap; nodes: CapabilityViewNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name]))
  const finalReady = nodes.every((node) => node.level === 3)
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#DCE5F0] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE6F0] bg-white/80 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#294A73]"><Route className="size-4 text-[#3974CA]" />{map.roleName} · 必修学习路线</div>
        <div className="flex flex-wrap gap-2 text-[9px] font-bold text-[#718096]"><span>顺序代表建议学习次序</span><span>·</span><span>前置能力决定是否解锁</span></div>
      </div>
      <ol className="px-3 py-4 sm:px-5">
        {nodes.map((node, index) => {
          const meta = CAPABILITY_STATE_META[node.state]
          const prerequisites = node.prerequisites.map((id) => nodeNames.get(id)).filter(Boolean)
          const isLast = index === nodes.length - 1
          return (
            <li key={node.id} className="relative grid grid-cols-[42px_minmax(0,1fr)] gap-2 sm:grid-cols-[52px_minmax(0,1fr)] sm:gap-3">
              {!isLast && <span className="absolute bottom-0 left-[20px] top-10 w-px bg-[#CBD8E8] sm:left-[25px]" />}
              <div className={cn("relative z-10 mt-3 grid size-10 place-items-center rounded-full border-2 bg-white text-[11px] font-black sm:size-12", node.state === "current" ? "border-[#7654DC] text-[#674CAE] shadow-[0_0_0_5px_rgba(118,84,220,.10)]" : node.level === 3 ? "border-[#2A8A70] text-[#1E8066]" : "border-[#B8C6D7] text-[#63758D]")}>{node.level === 3 ? <Check className="size-4" /> : index + 1}</div>
              <button type="button" aria-current={node.state === "current" ? "step" : undefined} onClick={() => onSelect(node.id)} className={cn("mb-3 w-full rounded-2xl border p-4 text-left transition sm:p-5", selectedId === node.id ? "border-[#4E84CE] bg-white shadow-[0_10px_26px_rgba(45,87,142,.10)] ring-2 ring-[#4E84CE]/10" : "border-[#DCE4EE] bg-white/75 hover:border-[#B8CBE2] hover:bg-white", node.state === "current" && "border-[#BFB0E8] bg-[#FBF9FF]")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><span className="text-[9px] font-bold text-[#7A8BA0]">第 {index + 1} 站 · 目标 L3</span><h3 className="mt-1 text-sm font-bold text-[#203650]">{node.name}</h3></div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[9px] font-bold", meta.badge)}>{meta.label}</span>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-[#65768D]">{node.description}</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px] lg:items-end">
                  <div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5"><span className="text-[9px] font-bold text-[#71839A]">学习与验证任务</span><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#40546E]">{node.task}</p></div>
                  <div>
                    <div className="flex items-center justify-between text-[9px] font-bold text-[#708198]"><span>能力等级</span><span>L{node.level}/L3</span></div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">{[1, 2, 3].map((level) => <span key={level} className={cn("h-2 rounded-full", node.level >= level ? node.level === 3 ? "bg-[#2A8A70]" : "bg-[#3974CA]" : "bg-[#E3E9F0]")} />)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] text-[#7A899B]"><span className="font-bold">前置：</span>{prerequisites.length ? prerequisites.map((name) => <span key={name} className="rounded-full bg-[#EEF3F8] px-2 py-1">{name}</span>) : <span>无，可直接开始</span>}</div>
              </button>
            </li>
          )
        })}
      </ol>
      <div className={cn("mx-4 mb-5 rounded-2xl border px-5 py-4 sm:mx-5", finalReady ? "border-[#A8D6C6] bg-[#EAF8F3]" : "border-[#D9DDE5] bg-[#F5F6F8]")}>
        <div className={cn("flex items-center gap-2 text-xs font-bold", finalReady ? "text-[#1D745E]" : "text-[#6F7988]")}>{finalReady ? <Flag className="size-4" /> : <Lock className="size-4" />}{map.finalAssessment.name}</div>
        <p className="mt-1 text-[9px] leading-4 text-[#7B8797]">{finalReady ? "全部前置能力已达 L3，可以进入最终验收" : `还需 ${nodes.filter((node) => node.level < 3).length} 项能力达到 L3；完成后解锁岗位综合情境验收。`}</p>
      </div>
    </div>
  )
}

function CapabilityDetail({ node }: { node: CapabilityViewNode }) {
  const meta = CAPABILITY_STATE_META[node.state]
  return <article className="rounded-2xl border border-[#DCE4EE] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[9px] font-extrabold tracking-[.12em] text-[#7185A1]">当前选中能力</span><h3 className="mt-1 text-base font-bold text-[#213550]">{node.name}</h3></div><span className={cn("rounded-full px-2.5 py-1 text-[9px] font-bold", meta.badge)}>{meta.label}</span></div><p className="mt-3 text-[11px] leading-5 text-[#66778E]">{node.description}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5"><span className="text-[9px] font-bold text-[#71839A]">训练任务</span><p className="mt-1 text-[10px] leading-4 text-[#40546E]">{node.task}</p></div><div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5"><span className="text-[9px] font-bold text-[#71839A]">验收成果</span><p className="mt-1 text-[10px] leading-4 text-[#40546E]">{node.deliverable}</p></div></div><div className="mt-3 flex items-center justify-between text-[10px] text-[#708198]"><span>当前 L{node.level} / 目标 L3</span><span>{node.score === undefined ? "尚无测试证据" : `最近验收 ${node.score} 分`}</span></div></article>
}

function AgentAudit({ workspace, progress }: { workspace: WorkspaceState; progress: number }) {
  const reviews = Object.entries(workspace.reviews)
  const decision = workspace.decision
  const reviewMetric = (reviewId: string, metricId: string) => {
    const value = workspace.reviews[reviewId]?.metrics?.[metricId]
    return typeof value === "number" ? value : undefined
  }
  const evidenceScore = workspace.reviews.evidence_review?.score
  const difficultyScore = workspace.reviews.difficulty_review?.score
  const hallucinationRate = decision?.hallucination_rate
    ?? decision?.quality_metrics?.hallucination_rate?.value
    ?? reviewMetric("evidence_review", "hallucination_rate")
    ?? (typeof evidenceScore === "number" ? Math.max(0, 100 - evidenceScore) : undefined)
  const profileDifficultyAccuracy = decision?.profile_difficulty_accuracy
    ?? decision?.quality_metrics?.profile_difficulty_accuracy?.value
    ?? reviewMetric("difficulty_review", "difficulty_fit")
    ?? difficultyScore
  const coreKnowledgeCoverage = decision?.core_knowledge_coverage
    ?? decision?.quality_metrics?.core_knowledge_coverage?.value
    ?? reviewMetric("difficulty_review", "core_coverage")
    ?? difficultyScore
  const decisionMetrics = decision ? [
    {
      key: "hallucination_rate",
      label: "专业知识谬误率（幻觉率）",
      value: hallucinationRate,
      rule: "< 5%",
      passed: hallucinationRate === undefined ? undefined : hallucinationRate < 5,
    },
    {
      key: "profile_difficulty_accuracy",
      label: "学习者画像-资源难度适配准确率",
      value: profileDifficultyAccuracy,
      rule: "≥ 85%",
      passed: profileDifficultyAccuracy === undefined ? undefined : profileDifficultyAccuracy >= 85,
    },
    {
      key: "core_knowledge_coverage",
      label: "核心知识点覆盖率",
      value: coreKnowledgeCoverage,
      rule: "≥ 90%",
      passed: coreKnowledgeCoverage === undefined ? undefined : coreKnowledgeCoverage >= 90,
    },
  ] : []

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[10px] font-bold text-[#63758D]"><span>计划进度 · {stageLabel(workspace.stage)} · 第 {workspace.generationRound} 轮</span><span>{progress}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEF5]"><div className="h-full rounded-full bg-gradient-to-r from-[#3976D0] to-[#20A080] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
      <AgentCollaborationFlow workspace={workspace} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#DFE6EF] bg-[#F8FAFD] p-4">
          <strong className="text-[11px] text-[#334B68]">七类资源 · 三项交叉审核</strong>
          {reviews.length ? <div className="mt-3 space-y-2">{reviews.map(([key, review]) => <div key={key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[10px]"><span className="text-[#62748B]">{review.reviewer || key}</span><span className={cn("font-black", review.status === "pass" ? "text-[#1A8067]" : review.status === "fail" ? "text-[#B4523B]" : "text-[#A06C24]")}>{review.score} 分 · {reviewStatusLabel(review.status)}</span></div>)}</div> : <p className="mt-2 text-[10px] leading-5 text-[#7A899D]">等待事实来源、实操规范与难度覆盖审核。</p>}
        </div>
        <div className={cn("rounded-2xl border p-4", decision?.decision === "publish" ? "border-[#BFDCCF] bg-[#F3FAF7]" : decision?.decision === "rework" || decision?.decision === "failed" ? "border-[#E8CDBE] bg-[#FFF7F2]" : "border-[#DFE6EF] bg-[#F8FAFD]")}>
          <strong className="flex items-center gap-2 text-[11px] text-[#334B68]"><ShieldCheck className="size-3.5" />审核结果</strong>
          <p className="mt-2 text-[10px] leading-5 text-[#687991]">{decision?.summary || "完成全部检查后，资源将开放或返回修改。"}</p>
          {decision && <>
            <div className="mt-3 space-y-1.5">
              {decisionMetrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-[9px]">
                <span className="font-semibold text-[#5D7088]">{metric.label}</span>
                <span className={cn("shrink-0 font-black", metric.passed === false ? "text-[#B4523B]" : "text-[#168069]")}>实际结果 {metric.value === undefined ? "--" : `${metric.value}%`} {metric.rule}</span>
              </div>)}
            </div>
            <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#426384]">{decision.decision === "publish" ? "可以使用" : decision.decision === "failed" ? "暂不可用" : "需要修改"} · 质量分 {decision.quality_score}</span>
          </>}
        </div>
      </div>
      <ReworkTimeline workspace={workspace} />
      {workspace.logs.length > 0 && <details className="mt-3 rounded-2xl border border-[#E0E7F0] bg-[#FAFCFF] p-3"><summary className="cursor-pointer text-[10px] font-bold text-[#526982]">查看最近处理记录</summary><div className="mt-2 space-y-1.5">{workspace.logs.slice(-8).reverse().map((log, index) => <p key={`${log}-${index}`} className="text-[9px] leading-4 text-[#748399]">{log}</p>)}</div></details>}
    </div>
  )
}

function ReworkTimeline({ workspace }: { workspace: WorkspaceState }) {
  if (!workspace.reworkHistory.length) return <div className="mt-3 rounded-2xl border border-dashed border-[#D8E2ED] bg-[#FBFCFE] px-4 py-3 text-[10px] text-[#748399]">当前尚未发生返工。若审核发现问题，这里会按轮次展示返工目标与修改要求。</div>
  const labels: Record<string, string> = { doc: "定制讲义", guide: "实操指南", quiz: "分阶测试", mindmap: "思维导图", reading: "拓展阅读", code: "代码案例", video: "可视讲解" }
  return <div className="mt-3 rounded-2xl border border-[#E7D2C3] bg-[#FFF9F5] p-4"><div className="flex items-center gap-2 text-[11px] font-bold text-[#9A5B35]"><RefreshCw className={cn("size-3.5", workspace.status === "running" && "animate-spin")} />自动返工记录 · 已发生 {workspace.reworkHistory.length} 次</div><div className="mt-3 grid gap-2 md:grid-cols-2">{workspace.reworkHistory.slice(-4).reverse().map((record) => <div key={`${record.generationRound}-${record.createdAt}`} className="rounded-xl border border-[#ECDDD2] bg-white px-3 py-2.5"><div className="flex items-center justify-between text-[9px] font-bold"><span className="text-[#9A5B35]">第 {record.generationRound} 轮退回</span><span className="text-[#7B8797]">{record.targets.map((id) => labels[id] || id).join("、")}</span></div><p className="mt-1.5 line-clamp-2 text-[9px] leading-4 text-[#6F7886]">{record.requiredFixes.join("；") || "依据交叉审核结果重新生成并再次送审"}</p></div>)}</div></div>
}

function stageLabel(stage: string) {
  return ({ idle: "等待开始", diagnosis: "分析学习基础", retrieval: "查找岗位知识", planning: "制定训练计划", plan_decision: "确认计划", generation: "生成资源", rework: "修改资源", review: "检查资源", decision: "确认结果", publishing: "准备开放", published: "已开放" } as Record<string, string>)[stage] || stage
}

function reviewStatusLabel(status: string) {
  return ({ pass: "通过", warn: "有建议", fail: "未通过" } as Record<string, string>)[status] || status
}

function RoleRequired() {
  return <main className="app-page paper-theme min-h-dvh"><div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位训练" selectionLabel="尚未选择目标岗位" /><section className="mt-4 grid min-h-[64vh] place-items-center rounded-[28px] border border-[#DCE5F1] bg-white px-5 text-center shadow-[0_18px_48px_rgba(41,67,112,.08)]"><div className="max-w-lg py-16"><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#E8F2FF] to-[#F1EAFF] text-[#356FD1]"><BriefcaseBusiness className="size-7" /></span><p className="mt-5 text-[11px] font-extrabold tracking-[.16em] text-[#6F83A2]">开始前</p><h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17233D]">先选择目标岗位，再建立画像</h1><p className="mt-3 text-sm leading-6 text-[#66758B]">岗位决定学习范围，画像决定从哪里开始。</p><Link to="/courses?returnTo=%2Fprofile" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-sm font-bold text-white">选择目标岗位<ArrowRight className="size-4" /></Link></div></section></div></main>
}

function Metric({ value, label, detail, accent = false }: { value: string; label: string; detail: string; accent?: boolean }) {
  return <div className={cn("rounded-2xl border p-4 backdrop-blur", accent ? "border-[#76A8E5]/35 bg-[#5D91D6]/18" : "border-white/12 bg-white/[.07]")}><strong className="block text-2xl font-black tracking-[-.04em] text-white">{value}</strong><span className="mt-1 block text-[10px] font-bold text-[#D8E5F5]">{label}</span><small className="mt-1 block truncate text-[9px] text-[#9FB5D0]">{detail}</small></div>
}

function FlowStep({ index, label, detail, status, last = false }: { index: string; label: string; detail: string; status: "done" | "active" | "idle"; last?: boolean }) {
  return <div className="relative flex items-center gap-2 rounded-2xl bg-[#F8FAFD] p-3"><span className={cn("grid size-8 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold", status === "done" ? "bg-[#DDF2E9] text-[#18745E]" : status === "active" ? "bg-[#3376D4] text-white" : "bg-[#E9EEF5] text-[#7C8A9D]")}>{status === "done" ? <Check className="size-4" /> : index}</span><span className="min-w-0"><strong className="block text-[11px] text-[#253750]">{label}</strong><small className="mt-0.5 block truncate text-[9px] text-[#7A899D]">{detail}</small></span>{!last && <ChevronRight className="absolute -right-3 z-10 hidden size-4 text-[#9AABBE] md:block" />}</div>
}

function SectionTitle({ icon: Icon, eyebrow, title, description }: { icon: typeof Target; eyebrow: string; title: string; description: string }) {
  return <div><div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.12em] text-[#6E83A2]"><Icon className="size-4" />{eyebrow}</div><h2 className="mt-1.5 text-lg font-bold tracking-[-.025em] text-[#17233D]">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[#718096]">{description}</p></div>
}

function EvidenceCard({ icon: Icon, label, value, detail }: { icon: typeof Target; label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-[#E1E8F1] bg-[#FBFCFE] p-4"><div className="flex items-center gap-2 text-[10px] font-bold text-[#6D82A0]"><Icon className="size-3.5" />{label}</div><strong className="mt-2 block text-sm leading-5 text-[#213550]">{value}</strong><p className="mt-1 text-[10px] leading-4 text-[#7A899D]">{detail}</p></article>
}

function DebatePanel({ plan }: { plan: PersonalizedTrainingPlan }) {
  return <div className="mt-5 space-y-2.5"><Position label="岗位要求" text={plan.debate.expert_position} tone="blue" /><Position label="学习安排" text={plan.debate.strategy_position} tone="teal" /><div className="rounded-2xl border border-[#E4D9F2] bg-[#F7F3FC] p-4"><div className="flex items-center gap-2 text-[10px] font-extrabold text-[#74549E]"><GitCompareArrows className="size-3.5" />最终安排</div><p className="mt-2 text-[11px] leading-5 text-[#5F5270]">{plan.debate.conflict}</p><div className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#493B5B]">{plan.debate.resolution}</div></div><div className="flex flex-wrap gap-1.5">{plan.priority_competencies.map((item) => <span key={item} className="rounded-full bg-[#EAF2FF] px-2.5 py-1 text-[10px] font-bold text-[#3169B9]">本轮 · {item}</span>)}{plan.deferred_competencies.map((item) => <span key={item} className="rounded-full bg-[#F0F2F5] px-2.5 py-1 text-[10px] font-bold text-[#788598]">后续 · {item}</span>)}</div></div>
}

function Position({ label, text, tone }: { label: string; text: string; tone: "blue" | "teal" }) {
  return <div className={cn("rounded-2xl border p-3.5", tone === "blue" ? "border-[#D4E2F4] bg-[#F4F8FE]" : "border-[#CFE8E4] bg-[#F3FAF8]")}><strong className={cn("text-[10px]", tone === "blue" ? "text-[#376CA9]" : "text-[#237768]")}>{label}</strong><p className="mt-1 text-[11px] leading-5 text-[#5F7087]">{text}</p></div>
}

function ResourceCard({ id, index, plan, ready, released, reviewScore, videoStatus }: { id: ResourceId; index: number; plan?: PersonalizedTrainingPlan; ready: boolean; released: boolean; reviewScore?: number; videoStatus?: string }) {
  const meta = RESOURCE_META[id]
  const Icon = meta.icon
  const stage = plan?.stages[index]
  const videoReadyLabel = videoStatus === "succeeded" ? `审核 ${reviewScore ?? "—"} 分` : videoStatus === "unconfigured" ? "脚本已审 · 待配置 Key" : videoStatus === "segments_ready" ? "片段已生成 · 待合成" : videoStatus === "failed" || videoStatus === "partial_failed" ? "生成失败 · 需返工" : `审核 ${reviewScore ?? "—"} 分`
  return <article className={cn("rounded-[20px] border p-4", released && ready ? "border-[#BFDCCF] bg-[#F7FCFA]" : ready ? "border-[#C8D9ED] bg-[#F8FBFF]" : "border-[#E0E7F0] bg-[#FBFCFE]")}><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white text-[#3369B4] shadow-sm"><Icon className="size-4.5" /></span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", released && ready ? "bg-[#DDF2E9] text-[#18745E]" : ready ? "bg-[#E6F0FD] text-[#3568A9]" : "bg-[#EDF1F6] text-[#7B899B]")}>{released && ready ? (id === "video" ? videoReadyLabel : `审核 ${reviewScore ?? "—"} 分`) : ready ? "等待发布门禁" : "等待生成"}</span></div><h3 className="mt-3 text-sm font-bold text-[#20344E]">{meta.title}</h3><p className="mt-1 text-[10px] leading-4 text-[#738298]">{stage?.goal || meta.detail}</p><div className="mt-3 rounded-xl bg-white/90 px-3 py-2 text-[9px] leading-4 text-[#63758D]">成果证据：{stage?.evidence || "由训练计划确定"}</div>{released && ready ? <Link to={`/workspace/r/${id}`} className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#2864BA]">打开资源<ArrowRight className="size-3" /></Link> : <span className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#8794A5]"><ShieldCheck className="size-3" />裁决通过后开放</span>}</article>
}

function ResultMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-[#E0E7F0] bg-[#FAFCFF] p-4"><span className="text-[10px] font-bold text-[#70829C]">{label}</span><strong className="mt-1 block text-xl font-black text-[#265EA9]">{value}</strong><small className="mt-1 block text-[9px] text-[#8390A1]">{detail}</small></div>
}

function LoadingBlock({ text }: { text: string }) {
  return <div className="mt-5 flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-[#D9E4F1] bg-[#F7FAFE] text-xs font-bold text-[#5E7594]"><Loader2 className="size-4 animate-spin" />{text}</div>
}

function Notice({ text, tone }: { text: string; tone: "error" }) {
  return <div role="alert" className={cn("mt-5 rounded-2xl border p-4 text-xs", tone === "error" && "border-[#E3C7BE] bg-[#FBF2EE] text-[#A05037]")}>{text}</div>
}
