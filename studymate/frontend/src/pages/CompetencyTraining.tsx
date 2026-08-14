import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
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
  Flag,
  Gauge,
  GitCompareArrows,
  Layers3,
  ListTree,
  Lock,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Route,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
  Wrench,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { AgentCollaborationFlow } from "@/components/AgentCollaborationFlow"
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
} as const

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
  const role = useTargetRole()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const workspace = useWorkspaceStore()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(Boolean(user?.user_id))
  const [profileError, setProfileError] = useState("")
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackError, setFeedbackError] = useState("")
  const [mapMode, setMapMode] = useState<"tree" | "route">("tree")
  const [selectedCapabilityId, setSelectedCapabilityId] = useState("")
  const [capabilityEvidence, setCapabilityEvidence] = useState<Record<string, CapabilityEvidence>>({})
  const [theoryGate, setTheoryGate] = useState<TheoryGateState>({ loading: false, completed: false, required: false, assessment: null, error: "" })
  const [theoryPromptSignal, setTheoryPromptSignal] = useState(0)
  const capabilityMap = useMemo(() => role ? buildRoleCompetencyMap(role) : null, [role])

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
  const resourceCount = (["doc", "guide", "quiz"] as ResourceId[]).filter((id) => Boolean(workspace.outputs[id])).length
  const completedSteps = [Boolean(role), diagnosisReady, Boolean(plan), released, Boolean(workspace.feedback)].filter(Boolean).length
  const agentDone = workspace.agents.filter((agent) => agent.status === "done").length
  const agentProgress = workspace.agents.length ? Math.round(agentDone / workspace.agents.length * 100) : 0
  const cycle = plan?.cycle ?? workspace.diagnosis?.training_cycle ?? 1
  const nextTopicIndex = workspace.feedback ? cycle % role.sampleTasks.length : (cycle - 1) % role.sampleTasks.length
  const nextTopic = role.sampleTasks[nextTopicIndex] ?? role.sampleTasks[0]
  const capabilityNodes = resolveCapabilityNodes(capabilityMap, capabilityEvidence, plan)
  const verifiedCapabilityCount = capabilityNodes.filter((node) => node.level === 3).length
  const capabilityProgress = capabilityNodes.length
    ? Math.round(capabilityNodes.reduce((sum, node) => sum + node.level, 0) / (capabilityNodes.length * 3) * 100)
    : 0
  const selectedCapability = capabilityNodes.find((node) => node.id === selectedCapabilityId)
    ?? capabilityNodes.find((node) => node.state === "current")
    ?? capabilityNodes.find((node) => node.state === "ready")
    ?? capabilityNodes[0]

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
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位胜任力闭环" selectionLabel={role.name} />

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
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-[#CFE2FF]"><Sparkles className="size-3.5 text-[#F1D47D]" />第 {cycle} 轮岗位胜任力训练</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F3E7]/12 px-3 py-1.5 text-[10px] font-bold text-[#BFECDD]"><span className="size-1.5 rounded-full bg-[#5ED5B5]" />选择—诊断—协商—训练—验收—迭代</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl lg:text-[38px]">把“想学这个岗位”变成<br className="hidden sm:block" />一条可解释、可验证的胜任路径</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#C2D2E6]">当前目标：<strong className="text-white">{role.name}</strong>。画像决定起点，岗位标准决定终点，多 Agent 负责协商路径，测试结果决定下一轮。</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {!profileReady ? (
                  <Link to="/profile" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] hover:bg-[#F2F7FF]"><UserRoundSearch className="size-4" />完善岗位画像<ArrowRight className="size-4" /></Link>
                ) : !theoryCompleted ? (
                  <button type="button" onClick={() => setTheoryPromptSignal((value) => value + 1)} disabled={!course || theoryGate.loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] disabled:cursor-not-allowed disabled:opacity-50">{theoryGate.loading ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}{theoryGate.loading ? "正在组织岗位试卷" : "完成理论基线测评"}</button>
                ) : workspace.status === "running" ? (
                  <a href="#agent-collaboration" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><Loader2 className="size-4 animate-spin" />查看 Agent 实时协作</a>
                ) : workspace.feedback ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] disabled:opacity-50"><RefreshCw className="size-4" />启动第 {cycle + 1} 轮训练</button>
                ) : workspace.decision?.decision === "rework" ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] disabled:opacity-50"><RefreshCw className="size-4" />重新启动自动返工闭环</button>
                ) : !plan ? (
                  <button type="button" onClick={startRound} disabled={!course} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] disabled:cursor-not-allowed disabled:opacity-50"><Rocket className="size-4" />启动多 Agent 协同决策</button>
                ) : released ? (
                  <Link to="/workspace/r/doc" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><FileText className="size-4" />开始本轮训练<ArrowRight className="size-4" /></Link>
                ) : (
                  <a href="#agent-collaboration" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69]"><ShieldCheck className="size-4" />查看裁决结果</a>
                )}
                <Link to="/courses?returnTo=%2Fcompetency" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/8 px-4 text-sm font-bold text-white hover:bg-white/14">切换目标岗位<ChevronRight className="size-4" /></Link>
              </div>
              {!course && <p className="mt-3 text-[11px] text-[#F5D9A0]">该岗位专属知识库尚未接入，当前可先完成画像；资源生成需选择已开放的 FDE 岗位。</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric value={`${completedSteps}/5`} label="闭环阶段" detail="每一步均保留证据" accent />
              <Metric value={`${profileScore}%`} label="画像完整度" detail={profileReady ? `画像 v${profile?.version ?? 1} 已参与决策` : "还需补充目标与实践证据"} />
              <Metric value={workspace.agents.length ? `${agentDone}/${workspace.agents.length}` : "11"} label="协同 Agent" detail={workspace.status === "running" ? `协作进度 ${agentProgress}%` : "分工、交叉审核与仲裁"} />
              <Metric value={`${resourceCount}/3`} label="核心训练资源" detail={released ? "已越过发布门禁" : "裁决通过后开放"} />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-4 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-5">
          <div className="grid gap-2 md:grid-cols-5">
            <FlowStep index="01" label="选择岗位" detail={role.name} status="done" />
            <FlowStep index="02" label="画像诊断" detail={!profileReady ? "等待补充画像证据" : theoryCompleted ? `理论基线 ${theoryGate.assessment?.score ?? theoryEvidence?.score ?? "—"} 分` : "等待首次理论测评"} status={diagnosisReady ? "done" : "active"} />
            <FlowStep index="03" label="协同决策" detail={plan ? `第 ${plan.cycle} 轮计划已形成` : workspace.status === "running" ? "Agent 协商中" : "等待启动"} status={plan ? "done" : diagnosisReady ? "active" : "idle"} />
            <FlowStep index="04" label="资源训练" detail={released ? "3 类资源已发布" : "等待质量门禁"} status={released ? "done" : plan ? "active" : "idle"} />
            <FlowStep index="05" label="成果验收" detail={workspace.feedback ? "结果已进入下一轮" : attempts.length ? `已完成 ${attempts.length} 项验证` : "等待测试证据"} status={workspace.feedback ? "done" : released ? "active" : "idle"} last />
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionTitle icon={MapIcon} eyebrow="岗位全景 · 两种可视化对比" title={`${role.name}要学什么、学多少、学到哪里`} description="能力树强调岗位范围与层级，训练路径地图强调先后依赖与当前位置；切换视图不会改变训练数据。" />
            <div className="inline-flex w-fit rounded-xl border border-[#D8E2EE] bg-[#F3F6FA] p-1">
              <button type="button" aria-pressed={mapMode === "tree"} onClick={() => setMapMode("tree")} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition", mapMode === "tree" ? "bg-white text-[#285FAF] shadow-sm" : "text-[#718097]")}><ListTree className="size-3.5" />视图 A · 能力树</button>
              <button type="button" aria-pressed={mapMode === "route"} onClick={() => setMapMode("route")} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition", mapMode === "route" ? "bg-white text-[#285FAF] shadow-sm" : "text-[#718097]")}><Route className="size-3.5" />视图 B · 路径地图</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ResultMetric label="岗位必修范围" value={`${capabilityNodes.length} 项`} detail="范围由当前目标岗位决定" />
            <ResultMetric label="已独立胜任" value={`${verifiedCapabilityCount}/${capabilityNodes.length}`} detail="仅 L3 验收节点计为完成" />
            <ResultMetric label="当前能力进度" value={`${capabilityProgress}%`} detail="由真实分阶测试结果回写" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EEF5]" aria-label={`当前能力进度 ${capabilityProgress}%`}><div className="h-full rounded-full bg-gradient-to-r from-[#2E6EC8] to-[#22A38A] transition-[width] duration-500" style={{ width: `${capabilityProgress}%` }} /></div>
          <p className="mt-2 text-[10px] leading-5 text-[#718096]">进度规则：完成测试并提交本轮验收后才更新能力等级；浏览讲义或实操指南不会自动增加进度。</p>

          <div className="mt-5">
            {mapMode === "tree"
              ? <CompetencyTree map={capabilityMap} nodes={capabilityNodes} selectedId={selectedCapability?.id} onSelect={setSelectedCapabilityId} />
              : <TrainingRouteMap map={capabilityMap} nodes={capabilityNodes} selectedId={selectedCapability?.id} onSelect={setSelectedCapabilityId} />}
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
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]">
          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
            <SectionTitle icon={UserRoundSearch} eyebrow="01 · 岗位画像" title="系统如何判断你的训练起点" description="画像区分学习意愿与已有能力：只有明确项目、实习或作品经历才计入就业技能证据。" />
            {profileLoading ? <LoadingBlock text="正在读取画像证据…" /> : profileError ? <Notice text={profileError} tone="error" /> : profile ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <EvidenceCard icon={Target} label="岗位目标" value={profile.dims.goals.primary || role.name} detail={profile.dims.goals.target_topics.join("、") || "等待补充具体能力目标"} />
                <EvidenceCard icon={Clock3} label="训练约束" value={profile.dims.pace.hours_per_week ? `每周 ${profile.dims.pace.hours_per_week} 小时` : "时间预算未确认"} detail={profile.dims.goals.deadline || "完成期限未确认"} />
                <EvidenceCard icon={Gauge} label="优先差距" value={profile.dims.weak_points.topics.slice(0, 2).join("、") || "等待场景追问"} detail={workspace.diagnosis ? `${workspace.diagnosis.current_level} · 置信度 ${Math.round(workspace.diagnosis.evidence_confidence * 100)}%` : "生成训练计划时由诊断 Agent 复核"} />
                <EvidenceCard icon={BadgeCheck} label="实践证据" value={employmentEvidence.length ? employmentEvidence.slice(0, 2).map(([key, score]) => `${SKILL_LABELS[key] ?? key} L${score}`).join("、") : "尚无可信实践证据"} detail={employmentEvidence.length ? `共 ${employmentEvidence.length} 个能力维度有证据` : "不等于能力为零，需要通过岗位任务验证"} />
                <EvidenceCard icon={BookOpenCheck} label="理论测试结果" value={theoryEvidence ? `${theoryEvidence.score} 分 · ${theoryEvidence.knowledge_level}` : theoryGate.loading ? "正在从岗位知识库组卷" : "等待完成首次测评"} detail={theoryEvidence ? (theoryEvidence.weak_topics.length ? `待补强：${theoryEvidence.weak_topics.slice(0, 2).join("、")}` : "理论基础已达到岗位训练起点") : "提交后自动写入学情诊断证据"} />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end"><Link to="/profile" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D8E3EF] px-3 text-[11px] font-bold text-[#3368B4] hover:bg-[#F1F6FD]">通过动态追问校准画像<ArrowRight className="size-3.5" /></Link></div>
          </section>

          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
            <SectionTitle icon={GitCompareArrows} eyebrow="02 · 多 Agent 协同决策" title="不是投票，而是带约束的提案与仲裁" description="领域专家负责专业覆盖，教学策略负责时间与认知负荷，计划仲裁负责解释最终取舍。" />
            {plan ? <DebatePanel plan={plan} /> : workspace.status === "running" ? <LoadingBlock text={`正在执行：${workspace.logs.at(-1) || "画像诊断与岗位知识检索"}`} /> : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#CBD8E8] bg-[#F8FBFF] p-5 text-center"><BrainCircuit className="mx-auto size-6 text-[#5D7FAA]" /><p className="mt-3 text-xs font-bold text-[#334B69]">等待画像完成后启动协同决策</p><p className="mt-1 text-[10px] leading-5 text-[#718096]">启动后会展示双方立场、冲突点、仲裁结果和训练依据。</p></div>
            )}
          </section>
        </div>

        <section id="agent-collaboration" className="mt-4 scroll-mt-24 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle icon={BrainCircuit} eyebrow="协作审计链" title="多 Agent 实时协作与发布门禁" description="训练任务由能力地图与画像共同决定，系统直接展示协作过程、审核分数与裁决依据。" />
            {workspace.status === "running" && <button type="button" onClick={() => workspaceStore.cancel()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E1C9C2] bg-[#FFF8F5] px-3 text-[11px] font-bold text-[#A5523A]">停止本轮协作</button>}
          </div>
          <AgentAudit workspace={workspace} progress={agentProgress} />
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><SectionTitle icon={Layers3} eyebrow="03 · 个性化资源" title="三类资源围绕同一个岗位任务呼应" description={plan?.rationale || `本轮候选任务：${nextTopic}`} /><span className={cn("rounded-full px-3 py-1.5 text-[10px] font-bold", released ? "bg-[#E5F6F0] text-[#18745E]" : "bg-[#EEF3FA] text-[#61738D]")}>{released ? `质量门禁通过 · ${workspace.decision?.quality_score ?? 0} 分` : workspace.status === "running" ? "生成与审核进行中" : "等待协同计划"}</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {(["doc", "guide", "quiz"] as ResourceId[]).map((id, index) => <ResourceCard key={id} id={id} index={index} plan={plan} ready={Boolean(workspace.outputs[id])} released={released} reviewScore={id === "doc" ? workspace.reviews.evidence_review?.score : id === "guide" ? workspace.reviews.practice_review?.score : workspace.reviews.difficulty_review?.score} />)}
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
            <div>
              <SectionTitle icon={FileCheck2} eyebrow="04 · 成果验收与下一轮" title="测试结果不是终点，而是下一轮的评判标准" description="本轮答题证据会写回训练记录；下一次诊断将据此降阶补强、保持难度或进入更复杂岗位场景。" />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ResultMetric label="已验证题目" value={`${attempts.length}`} detail="来自本轮分阶测试" />
                <ResultMetric label="当前正确率" value={attempts.length ? `${Math.round(correctCount / attempts.length * 100)}%` : "—"} detail={attempts.length ? `${correctCount} 对 / ${attempts.length - correctCount} 错` : "等待真实作答"} />
                <ResultMetric label="闭环状态" value={workspace.feedback ? "已回写" : "待回写"} detail={workspace.feedback ? "下一轮将读取本次结果" : "完成测试后提交验收"} />
              </div>
            </div>
            <div className={cn("rounded-2xl border p-4", workspace.feedback ? "border-[#BFDCCF] bg-[#F3FAF7]" : "border-[#D9E3EF] bg-[#F8FBFF]")}>
              <div className="flex items-center gap-2 text-xs font-bold text-[#294A73]">{workspace.feedback ? <CheckCircle2 className="size-4 text-[#1A8067]" /> : <CircleDashed className="size-4" />}{workspace.feedback ? "下一轮决策已生成" : "等待验收证据"}</div>
              <p className="mt-2 text-[11px] leading-5 text-[#65758C]">{workspace.feedback?.message || (released ? attempts.length ? "已有真实作答证据，可以提交本轮验收并生成下一轮策略。" : "先进入分阶测试完成真实作答，系统不会用自填说明替代能力证据。" : "资源通过审核并发布后，才能进入测试验收。")}</p>
              {workspace.feedback && <div className="mt-3 rounded-xl bg-white px-3 py-2 text-[10px] text-[#557567]">决策：{workspace.feedback.next_action} · 画像置信度调整 +{Math.round(workspace.feedback.profile_update.confidence_delta * 100)}%</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {released && !attempts.length && <Link to="/workspace/r/quiz" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white">进入分阶测试<ArrowRight className="size-3.5" /></Link>}
                {released && attempts.length > 0 && !workspace.feedback && <button type="button" onClick={() => void submitFeedback()} disabled={feedbackBusy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white disabled:opacity-50">{feedbackBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}提交本轮验收</button>}
                {workspace.feedback && <button type="button" onClick={startRound} disabled={!course || workspace.status === "running"} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white disabled:opacity-50"><RefreshCw className="size-3.5" />启动下一轮</button>}
                <a href="#agent-collaboration" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D4DFEB] bg-white px-3 text-[11px] font-bold text-[#5D718D]">查看完整审计链</a>
              </div>
              {feedbackError && <p role="alert" className="mt-2 text-[10px] text-[#A85138]">{feedbackError}</p>}
            </div>
          </div>
        </section>
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
    else if (level > 0) state = "developing"
    else if (currentNames.has(node.name)) state = "current"
    else if (node.prerequisites.every((id) => evidence[id]?.level === 3)) state = "ready"
    else state = "locked"
    return { ...node, level, state, score: record?.score }
  })
}

function CompetencyTree({ map, nodes, selectedId, onSelect }: { map: RoleCompetencyMap; nodes: CapabilityViewNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  const finalReady = nodes.every((node) => node.level === 3)
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#DCE5F0] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto w-fit rounded-2xl border border-[#BFD4ED] bg-[#EAF3FF] px-5 py-3 text-center shadow-sm">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#234E84]"><BriefcaseBusiness className="size-4" />{map.roleName}</div>
          <p className="mt-1 text-[9px] text-[#66809F]">岗位目标 · {nodes.length} 项必修能力</p>
        </div>
        <div className="mx-auto h-6 w-px bg-[#B9CAE0]" />
        <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-0 hidden h-px bg-[#B9CAE0] xl:block" />
          {nodes.map((node) => {
            const meta = CAPABILITY_STATE_META[node.state]
            return <div key={node.id} className="relative pt-0 xl:pt-5"><span className="pointer-events-none absolute left-1/2 top-0 hidden h-5 w-px -translate-x-1/2 bg-[#B9CAE0] xl:block" /><button type="button" onClick={() => onSelect(node.id)} className={cn("h-full w-full rounded-2xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md", selectedId === node.id ? "border-[#4E84CE] ring-2 ring-[#4E84CE]/15" : "border-[#DBE4EF]")}><div className="flex items-start justify-between gap-2"><span className="grid size-8 place-items-center rounded-xl text-[11px] font-black" style={{ backgroundColor: meta.fill, color: meta.stroke }}>L{node.level}</span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", meta.badge)}>{meta.label}</span></div><strong className="mt-3 block text-xs text-[#233A57]">{node.name}</strong><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#75859A]">{node.description}</p></button></div>
          })}
        </div>
        <div className="mx-auto h-6 w-px bg-[#B9CAE0]" />
        <div className={cn("mx-auto max-w-sm rounded-2xl border px-5 py-3 text-center", finalReady ? "border-[#A8D6C6] bg-[#EAF8F3]" : "border-[#D9DDE5] bg-[#F5F6F8]")}>
          <div className={cn("flex items-center justify-center gap-2 text-xs font-bold", finalReady ? "text-[#1D745E]" : "text-[#6F7988]")}>{finalReady ? <Flag className="size-4" /> : <Lock className="size-4" />}{map.finalAssessment.name}</div>
          <p className="mt-1 text-[9px] text-[#7B8797]">{finalReady ? "全部前置能力已达 L3，可以进入最终验收" : `还需 ${nodes.filter((node) => node.level < 3).length} 项能力达到 L3`}</p>
        </div>
      </div>
    </div>
  )
}

const ROUTE_COORDINATES = [
  { x: 130, y: 130 },
  { x: 130, y: 390 },
  { x: 430, y: 260 },
  { x: 700, y: 130 },
  { x: 700, y: 390 },
]

function TrainingRouteMap({ map, nodes, selectedId, onSelect }: { map: RoleCompetencyMap; nodes: CapabilityViewNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  const coordinates = nodes.map((_, index) => ROUTE_COORDINATES[index] ?? { x: 700, y: 130 + index * 70 })
  const finalPoint = { x: 930, y: 260 }
  const nodeById = new Map(nodes.map((node, index) => [node.id, { node, point: coordinates[index] }]))
  const finalReady = nodes.every((node) => node.level === 3)
  return (
    <div className="overflow-x-auto rounded-[22px] border border-[#DCE5F0] bg-[#F8FBFF]">
      <svg viewBox="0 0 1040 520" role="img" aria-label={`${map.roleName}训练路径地图`} className="min-w-[900px]">
        <defs>
          <pattern id="route-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#DDE7F2" strokeWidth="1" opacity=".45" /></pattern>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9AAFC7" /></marker>
        </defs>
        <rect width="1040" height="520" fill="url(#route-grid)" />
        {nodes.flatMap((node, targetIndex) => node.prerequisites.map((sourceId) => {
          const source = nodeById.get(sourceId)
          const target = coordinates[targetIndex]
          if (!source) return null
          const midX = (source.point.x + target.x) / 2
          return <path key={`${sourceId}-${node.id}`} d={`M ${source.point.x + 86} ${source.point.y} C ${midX} ${source.point.y}, ${midX} ${target.y}, ${target.x - 91} ${target.y}`} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={node.state === "locked" ? "7 7" : undefined} markerEnd="url(#route-arrow)" />
        }))}
        {map.finalAssessment.prerequisites.map((sourceId) => {
          const source = nodeById.get(sourceId)
          if (!source) return null
          const midX = (source.point.x + finalPoint.x) / 2
          return <path key={`${sourceId}-final`} d={`M ${source.point.x + 86} ${source.point.y} C ${midX} ${source.point.y}, ${midX} ${finalPoint.y}, ${finalPoint.x - 91} ${finalPoint.y}`} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={finalReady ? undefined : "7 7"} markerEnd="url(#route-arrow)" />
        })}
        {nodes.map((node, index) => {
          const point = coordinates[index]
          const meta = CAPABILITY_STATE_META[node.state]
          return <foreignObject key={node.id} x={point.x - 86} y={point.y - 50} width="172" height="100"><button type="button" onClick={() => onSelect(node.id)} className="h-full w-full rounded-2xl border-2 px-3 py-2 text-left shadow-[0_8px_20px_rgba(50,77,110,.10)] transition hover:-translate-y-0.5" style={{ backgroundColor: meta.fill, borderColor: selectedId === node.id ? "#7654DC" : meta.stroke }}><span className="block text-[9px] font-black" style={{ color: meta.stroke }}>{meta.short} · L{node.level}/L3</span><strong className="mt-1 block truncate text-[12px] text-[#233A57]">{node.name}</strong><small className="mt-1 block truncate text-[9px] text-[#718096]">{node.task}</small></button></foreignObject>
        })}
        <foreignObject x={finalPoint.x - 86} y={finalPoint.y - 50} width="172" height="100"><div className={cn("grid h-full place-items-center rounded-2xl border-2 px-3 text-center shadow-[0_8px_20px_rgba(50,77,110,.10)]", finalReady ? "border-[#2A8A70] bg-[#E6F6EF]" : "border-[#A8B0BC] bg-[#F5F6F8]")}><div>{finalReady ? <Flag className="mx-auto size-4 text-[#2A8A70]" /> : <Lock className="mx-auto size-4 text-[#8A95A4]" />}<strong className="mt-1 block text-[11px] text-[#33475F]">岗位综合验收</strong><small className="mt-1 block text-[8px] text-[#758399]">{finalReady ? "可以挑战" : "完成全部前置节点"}</small></div></div></foreignObject>
      </svg>
      <div className="border-t border-[#DFE7F0] bg-white px-4 py-3 text-[9px] leading-4 text-[#718096]">实线表示已解锁的前置关系，虚线表示尚待完成；地图可横向滚动查看完整终点。</div>
    </div>
  )
}

function CapabilityDetail({ node }: { node: CapabilityViewNode }) {
  const meta = CAPABILITY_STATE_META[node.state]
  return <article className="rounded-2xl border border-[#DCE4EE] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-[9px] font-extrabold tracking-[.12em] text-[#7185A1]">当前选中能力</span><h3 className="mt-1 text-base font-bold text-[#213550]">{node.name}</h3></div><span className={cn("rounded-full px-2.5 py-1 text-[9px] font-bold", meta.badge)}>{meta.label}</span></div><p className="mt-3 text-[11px] leading-5 text-[#66778E]">{node.description}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5"><span className="text-[9px] font-bold text-[#71839A]">训练任务</span><p className="mt-1 text-[10px] leading-4 text-[#40546E]">{node.task}</p></div><div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5"><span className="text-[9px] font-bold text-[#71839A]">验收成果</span><p className="mt-1 text-[10px] leading-4 text-[#40546E]">{node.deliverable}</p></div></div><div className="mt-3 flex items-center justify-between text-[10px] text-[#708198]"><span>当前 L{node.level} / 目标 L3</span><span>{node.score === undefined ? "尚无测试证据" : `最近验收 ${node.score} 分`}</span></div></article>
}

function AgentAudit({ workspace, progress }: { workspace: WorkspaceState; progress: number }) {
  const reviews = Object.entries(workspace.reviews)
  return <div className="mt-5"><div className="flex items-center justify-between text-[10px] font-bold text-[#63758D]"><span>协作进度 · {stageLabel(workspace.stage)} · 第 {workspace.generationRound} 轮</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEF5]"><div className="h-full rounded-full bg-gradient-to-r from-[#3976D0] to-[#20A080] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div><AgentCollaborationFlow workspace={workspace} /><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[#DFE6EF] bg-[#F8FAFD] p-4"><strong className="text-[11px] text-[#334B68]">三项交叉审核</strong>{reviews.length ? <div className="mt-3 space-y-2">{reviews.map(([key, review]) => <div key={key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[10px]"><span className="text-[#62748B]">{review.reviewer || key}</span><span className={cn("font-black", review.status === "pass" ? "text-[#1A8067]" : review.status === "fail" ? "text-[#B4523B]" : "text-[#A06C24]")}>{review.score} 分 · {reviewStatusLabel(review.status)}</span></div>)}</div> : <p className="mt-2 text-[10px] leading-5 text-[#7A899D]">等待事实来源、实操规范与难度覆盖审核。</p>}</div><div className={cn("rounded-2xl border p-4", workspace.decision?.decision === "publish" ? "border-[#BFDCCF] bg-[#F3FAF7]" : workspace.decision?.decision === "rework" ? "border-[#E8CDBE] bg-[#FFF7F2]" : "border-[#DFE6EF] bg-[#F8FAFD]")}><strong className="flex items-center gap-2 text-[11px] text-[#334B68]"><ShieldCheck className="size-3.5" />总裁决结论</strong><p className="mt-2 text-[10px] leading-5 text-[#687991]">{workspace.decision?.summary || "等待全部交叉审核完成后决定发布或自动返工。"}</p>{workspace.decision && <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#426384]">{workspace.decision.decision === "publish" ? "批准发布" : "自动返工"} · 质量分 {workspace.decision.quality_score}</span>}</div></div><ReworkTimeline workspace={workspace} />{workspace.logs.length > 0 && <details className="mt-3 rounded-2xl border border-[#E0E7F0] bg-[#FAFCFF] p-3"><summary className="cursor-pointer text-[10px] font-bold text-[#526982]">查看最近协作日志</summary><div className="mt-2 space-y-1.5">{workspace.logs.slice(-8).reverse().map((log, index) => <p key={`${log}-${index}`} className="text-[9px] leading-4 text-[#748399]">{log}</p>)}</div></details>}</div>
}

function ReworkTimeline({ workspace }: { workspace: WorkspaceState }) {
  if (!workspace.reworkHistory.length) return <div className="mt-3 rounded-2xl border border-dashed border-[#D8E2ED] bg-[#FBFCFE] px-4 py-3 text-[10px] text-[#748399]">当前尚未发生返工。若审核发现问题，这里会按轮次展示返工目标与修改要求。</div>
  const labels: Record<string, string> = { doc: "定制讲义", guide: "实操指南", quiz: "分阶测试" }
  return <div className="mt-3 rounded-2xl border border-[#E7D2C3] bg-[#FFF9F5] p-4"><div className="flex items-center gap-2 text-[11px] font-bold text-[#9A5B35]"><RefreshCw className={cn("size-3.5", workspace.status === "running" && "animate-spin")} />自动返工记录 · 已发生 {workspace.reworkHistory.length} 次</div><div className="mt-3 grid gap-2 md:grid-cols-2">{workspace.reworkHistory.slice(-4).reverse().map((record) => <div key={`${record.generationRound}-${record.createdAt}`} className="rounded-xl border border-[#ECDDD2] bg-white px-3 py-2.5"><div className="flex items-center justify-between text-[9px] font-bold"><span className="text-[#9A5B35]">第 {record.generationRound} 轮退回</span><span className="text-[#7B8797]">{record.targets.map((id) => labels[id] || id).join("、")}</span></div><p className="mt-1.5 line-clamp-2 text-[9px] leading-4 text-[#6F7886]">{record.requiredFixes.join("；") || "依据交叉审核结果重新生成并再次送审"}</p></div>)}</div></div>
}

function stageLabel(stage: string) {
  return ({ idle: "等待启动", diagnosis: "学情诊断", retrieval: "知识检索", planning: "训练规划", plan_decision: "计划仲裁", generation: "资源生成", rework: "自动返工", review: "交叉审核", decision: "总裁决", publishing: "准备发布", published: "已发布" } as Record<string, string>)[stage] || stage
}

function reviewStatusLabel(status: string) {
  return ({ pass: "通过", warn: "有建议", fail: "未通过" } as Record<string, string>)[status] || status
}

function RoleRequired() {
  return <main className="app-page paper-theme min-h-dvh"><div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><AppTopbar current="courses" appearance="paper" labelOverride="岗位训练中心" groupOverride="岗位胜任力闭环" selectionLabel="尚未选择目标岗位" /><section className="mt-4 grid min-h-[64vh] place-items-center rounded-[28px] border border-[#DCE5F1] bg-white px-5 text-center shadow-[0_18px_48px_rgba(41,67,112,.08)]"><div className="max-w-lg py-16"><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#E8F2FF] to-[#F1EAFF] text-[#356FD1]"><BriefcaseBusiness className="size-7" /></span><p className="mt-5 text-[11px] font-extrabold tracking-[.16em] text-[#6F83A2]">ROLE FIRST</p><h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17233D]">先选择领域岗位，再建立岗位画像</h1><p className="mt-3 text-sm leading-6 text-[#66758B]">岗位标准决定训练终点，画像证据决定训练起点。</p><Link to="/courses?returnTo=%2Fprofile" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-sm font-bold text-white">选择领域岗位<ArrowRight className="size-4" /></Link></div></section></div></main>
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
  return <div className="mt-5 space-y-2.5"><Position label="领域专家立场" text={plan.debate.expert_position} tone="blue" /><Position label="教学策略立场" text={plan.debate.strategy_position} tone="teal" /><div className="rounded-2xl border border-[#E4D9F2] bg-[#F7F3FC] p-4"><div className="flex items-center gap-2 text-[10px] font-extrabold text-[#74549E]"><GitCompareArrows className="size-3.5" />冲突与仲裁</div><p className="mt-2 text-[11px] leading-5 text-[#5F5270]">{plan.debate.conflict}</p><div className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#493B5B]">{plan.debate.resolution}</div></div><div className="flex flex-wrap gap-1.5">{plan.priority_competencies.map((item) => <span key={item} className="rounded-full bg-[#EAF2FF] px-2.5 py-1 text-[10px] font-bold text-[#3169B9]">本轮 · {item}</span>)}{plan.deferred_competencies.map((item) => <span key={item} className="rounded-full bg-[#F0F2F5] px-2.5 py-1 text-[10px] font-bold text-[#788598]">后续 · {item}</span>)}</div></div>
}

function Position({ label, text, tone }: { label: string; text: string; tone: "blue" | "teal" }) {
  return <div className={cn("rounded-2xl border p-3.5", tone === "blue" ? "border-[#D4E2F4] bg-[#F4F8FE]" : "border-[#CFE8E4] bg-[#F3FAF8]")}><strong className={cn("text-[10px]", tone === "blue" ? "text-[#376CA9]" : "text-[#237768]")}>{label}</strong><p className="mt-1 text-[11px] leading-5 text-[#5F7087]">{text}</p></div>
}

function ResourceCard({ id, index, plan, ready, released, reviewScore }: { id: ResourceId; index: number; plan?: PersonalizedTrainingPlan; ready: boolean; released: boolean; reviewScore?: number }) {
  const meta = RESOURCE_META[id]
  const Icon = meta.icon
  const stage = plan?.stages[index]
  return <article className={cn("rounded-[20px] border p-4", released && ready ? "border-[#BFDCCF] bg-[#F7FCFA]" : ready ? "border-[#C8D9ED] bg-[#F8FBFF]" : "border-[#E0E7F0] bg-[#FBFCFE]")}><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white text-[#3369B4] shadow-sm"><Icon className="size-4.5" /></span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", released && ready ? "bg-[#DDF2E9] text-[#18745E]" : ready ? "bg-[#E6F0FD] text-[#3568A9]" : "bg-[#EDF1F6] text-[#7B899B]")}>{released && ready ? `审核 ${reviewScore ?? "—"} 分` : ready ? "等待发布门禁" : "等待生成"}</span></div><h3 className="mt-3 text-sm font-bold text-[#20344E]">{meta.title}</h3><p className="mt-1 text-[10px] leading-4 text-[#738298]">{stage?.goal || meta.detail}</p><div className="mt-3 rounded-xl bg-white/90 px-3 py-2 text-[9px] leading-4 text-[#63758D]">成果证据：{stage?.evidence || "由训练计划确定"}</div>{released && ready ? <Link to={`/workspace/r/${id}`} className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#2864BA]">打开资源<ArrowRight className="size-3" /></Link> : <span className="mt-3 inline-flex h-8 items-center gap-1 text-[10px] font-bold text-[#8794A5]"><ShieldCheck className="size-3" />裁决通过后开放</span>}</article>
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
