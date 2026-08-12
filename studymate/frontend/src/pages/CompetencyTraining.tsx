import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Gauge,
  Layers3,
  PencilLine,
  Play,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import type { CareerRole } from "@/lib/domainCareerCatalog"
import { useTrackPage } from "@/lib/useTrackPage"
import { cn } from "@/lib/utils"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"

type CompetencyLevel = 0 | 1 | 2 | 3
type ExperienceLevel = "zero" | "basic" | "project"
type TaskStatus = "todo" | "in-progress" | "completed"

interface CompetencyItem {
  id: string
  name: string
  description: string
  task: string
  standards: [string, string, string]
}

interface TrainingTask {
  id: string
  title: string
  competencyId: string
  competencyName: string
  output: string
  acceptance: string[]
  estimatedHours: number
}

interface TaskProgress {
  status: TaskStatus
  evidence: string
  completedAt?: string
}

interface TrainingState {
  version: 1
  diagnosedAt: string | null
  weeks: 4 | 8 | 12
  weeklyHours: 3 | 5 | 8
  experience: ExperienceLevel
  ratings: Record<string, CompetencyLevel>
  tasks: Record<string, TaskProgress>
}

const LEVEL_NAMES = ["待建立基线", "理解与跟做", "独立完成", "复杂场景交付"] as const
const LEVEL_SHORT_NAMES = ["未评估", "L1", "L2", "L3"] as const

function buildFramework(role: CareerRole) {
  const competencies: CompetencyItem[] = role.skills.map((skill, index) => {
    const task = role.sampleTasks[index % role.sampleTasks.length]
    return {
      id: `${role.id}-competency-${index}`,
      name: skill,
      task,
      description: `能在${role.name}的真实任务中运用${skill}，并对交付结果负责。`,
      standards: [
        `能说明${skill}在岗位任务中的作用、输入输出和主要风险`,
        `能在明确约束下独立完成“${task}”并记录过程`,
        `能处理异常变化、权衡方案，并沉淀可复用的交付方法`,
      ],
    }
  })

  const tasks: TrainingTask[] = role.sampleTasks.map((title, index) => {
    const competency = competencies[index % competencies.length]
    return {
      id: `${role.id}-task-${index}`,
      title,
      competencyId: competency.id,
      competencyName: competency.name,
      output: index === role.sampleTasks.length - 1
        ? `《${role.name}场景复盘与改进报告》`
        : `《${title}实施与验证记录》`,
      acceptance: [
        "目标、约束与验收口径清晰",
        "关键过程和判断依据可复现",
        "结果、风险与下一步行动可追溯",
      ],
      estimatedHours: index === role.sampleTasks.length - 1 ? 3 : 2,
    }
  })

  return { competencies, tasks }
}

function createInitialState(role: CareerRole): TrainingState {
  const framework = buildFramework(role)
  return {
    version: 1,
    diagnosedAt: null,
    weeks: 8,
    weeklyHours: 5,
    experience: "zero",
    ratings: Object.fromEntries(framework.competencies.map((item) => [item.id, 0])) as Record<string, CompetencyLevel>,
    tasks: Object.fromEntries(framework.tasks.map((task) => [task.id, { status: "todo", evidence: "" }])) as Record<string, TaskProgress>,
  }
}

function storageKey(userId: number | undefined, roleId: string) {
  return `sm:competency-training:${userId ?? "guest"}:${roleId}`
}

function loadTrainingState(userId: number | undefined, role: CareerRole): TrainingState {
  const initial = createInitialState(role)
  try {
    const raw = localStorage.getItem(storageKey(userId, role.id))
    if (!raw) return initial
    const saved = JSON.parse(raw) as Partial<TrainingState>
    if (saved.version !== 1) return initial
    return {
      ...initial,
      ...saved,
      ratings: { ...initial.ratings, ...saved.ratings },
      tasks: { ...initial.tasks, ...saved.tasks },
    }
  } catch {
    return initial
  }
}

function persistTrainingState(userId: number | undefined, roleId: string, state: TrainingState) {
  try {
    localStorage.setItem(storageKey(userId, roleId), JSON.stringify(state))
  } catch {
    /* local persistence is optional */
  }
}

function formatDate(value?: string | null) {
  if (!value) return "尚未完成"
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value))
}

export function CompetencyTraining() {
  useTrackPage("competency_training")
  const role = useTargetRole()
  const user = useCurrentUser()

  if (!role) return <RoleRequired />
  return <RoleTraining key={`${user?.user_id ?? "guest"}-${role.id}`} role={role} userId={user?.user_id} />
}

function RoleRequired() {
  return (
    <main className="app-page paper-theme min-h-dvh">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位胜任力训练" groupOverride="岗位训练中心" selectionLabel="尚未选择目标岗位" />
        <section className="mt-4 grid min-h-[62vh] place-items-center rounded-[28px] border border-[#DCE5F1] bg-white px-5 text-center shadow-[0_18px_48px_rgba(41,67,112,.08)]">
          <div className="max-w-lg py-16">
            <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#E8F2FF] to-[#F1EAFF] text-[#356FD1]"><BriefcaseBusiness className="size-7" /></span>
            <p className="mt-5 text-[11px] font-extrabold tracking-[.16em] text-[#6F83A2]">ROLE FIRST</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17233D]">先确定目标岗位，再建立胜任力标准</h1>
            <p className="mt-3 text-sm leading-6 text-[#66758B]">训练方案会根据岗位技能、典型任务与交付标准生成，并按岗位分别保存训练进度。</p>
            <Link to="/courses?returnTo=%2Fcompetency" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(36,104,206,.24)] hover:bg-[#1B57AF]">选择目标岗位<ArrowRight className="size-4" /></Link>
          </div>
        </section>
      </div>
    </main>
  )
}

function RoleTraining({ role, userId }: { role: CareerRole; userId?: number }) {
  const framework = useMemo(() => buildFramework(role), [role])
  const [state, setState] = useState<TrainingState>(() => loadTrainingState(userId, role))
  const [diagnosticOpen, setDiagnosticOpen] = useState(!state.diagnosedAt)
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null)
  const [evidenceDraft, setEvidenceDraft] = useState("")
  const [evidenceError, setEvidenceError] = useState("")

  const updateState = (updater: (current: TrainingState) => TrainingState) => {
    setState((current) => {
      const next = updater(current)
      persistTrainingState(userId, role.id, next)
      return next
    })
  }

  const completedTasks = framework.tasks.filter((task) => state.tasks[task.id]?.status === "completed")
  const activeTasks = framework.tasks.filter((task) => state.tasks[task.id]?.status === "in-progress")
  const ratingTotal = framework.competencies.reduce((sum, item) => sum + (state.ratings[item.id] ?? 0), 0)
  const selfScore = framework.competencies.length ? ratingTotal / (framework.competencies.length * 3) : 0
  const evidenceScore = framework.tasks.length ? completedTasks.length / framework.tasks.length : 0
  const readiness = state.diagnosedAt ? Math.round(selfScore * 40 + evidenceScore * 60) : 0
  const nextTask = framework.tasks.find((task) => state.tasks[task.id]?.status === "in-progress")
    ?? framework.tasks.find((task) => state.tasks[task.id]?.status !== "completed")
  const readinessLabel = !state.diagnosedAt ? "等待诊断" : readiness >= 80 ? "达到岗位候选标准" : readiness >= 50 ? "进入综合实战" : "处于专项训练期"
  const totalHours = state.weeks * state.weeklyHours

  const startTask = (taskId: string) => {
    updateState((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [taskId]: { ...current.tasks[taskId], status: "in-progress" },
      },
    }))
  }

  const startNextTask = () => {
    if (!nextTask) return
    if (state.tasks[nextTask.id]?.status === "todo") startTask(nextTask.id)
    window.requestAnimationFrame(() => document.getElementById(nextTask.id)?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  const openEvidence = (task: TrainingTask) => {
    setEvidenceTaskId(task.id)
    setEvidenceDraft(state.tasks[task.id]?.evidence ?? "")
    setEvidenceError("")
  }

  const submitEvidence = () => {
    if (!evidenceTaskId) return
    const value = evidenceDraft.trim()
    if (value.length < 8) {
      setEvidenceError("请至少用 8 个字说明成果内容、存放位置或验证结论。")
      return
    }
    updateState((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [evidenceTaskId]: {
          status: "completed",
          evidence: value,
          completedAt: new Date().toISOString(),
        },
      },
    }))
    setEvidenceTaskId(null)
    setEvidenceDraft("")
  }

  const submitDiagnostic = () => {
    updateState((current) => ({ ...current, diagnosedAt: new Date().toISOString() }))
    setDiagnosticOpen(false)
  }

  return (
    <main className="app-page paper-theme min-h-dvh pb-12">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位胜任力训练" groupOverride="岗位训练中心" selectionLabel={role.name} />

        <section className="relative mt-4 overflow-hidden rounded-[30px] border border-[#C9D9ED] bg-[#122C4D] px-5 py-6 text-white shadow-[0_24px_64px_rgba(32,73,130,.18)] sm:px-7 sm:py-8 lg:px-10">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-[#8056E8]/25 blur-2xl" />
          <div className="pointer-events-none absolute bottom-[-9rem] left-[28%] size-80 rounded-full bg-[#16A6A1]/20 blur-3xl" />
          <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-[#CFE2FF]"><Sparkles className="size-3.5 text-[#F1D47D]" />岗位胜任力训练系统</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9F3E7]/12 px-3 py-1.5 text-[10px] font-bold text-[#BFECDD]"><span className="size-1.5 rounded-full bg-[#5ED5B5]" />训练进度已按岗位保存</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl lg:text-[38px]">从“知道知识”走向“能够完成岗位任务”</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#C2D2E6] sm:text-[15px]">目标岗位：<strong className="text-white">{role.name}</strong>。系统依据能力标准识别差距，用真实任务组织训练，并以可追溯成果作为胜任证据。</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={state.diagnosedAt ? startNextTask : () => setDiagnosticOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#163A69] shadow-[0_10px_26px_rgba(0,0,0,.15)] transition hover:-translate-y-0.5 hover:bg-[#F2F7FF]">
                  {state.diagnosedAt ? <Play className="size-4 fill-current" /> : <Gauge className="size-4" />}
                  {state.diagnosedAt ? nextTask ? "继续下一项训练" : "查看岗位验收结果" : "开始能力诊断"}
                </button>
                <Link to="/courses?returnTo=%2Fcompetency" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/8 px-4 text-sm font-bold text-white transition hover:bg-white/14">切换目标岗位<ChevronRight className="size-4" /></Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard value={`${readiness}%`} label="当前准备度（估算）" detail={readinessLabel} accent />
              <MetricCard value={`${completedTasks.length}/${framework.tasks.length}`} label="岗位成果证据" detail={activeTasks.length ? `${activeTasks.length} 项进行中` : "尚无进行中任务"} />
              <MetricCard value={`${state.weeks} 周`} label="目标训练周期" detail={`每周 ${state.weeklyHours} 小时`} />
              <MetricCard value={`${totalHours}h`} label="计划总投入" detail="可随诊断重新调整" />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white shadow-[0_12px_34px_rgba(41,67,112,.07)]" aria-labelledby="diagnostic-heading">
          <button type="button" onClick={() => setDiagnosticOpen((value) => !value)} className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", state.diagnosedAt ? "bg-[#E5F6F0] text-[#168268]" : "bg-[#EAF2FF] text-[#286CCB]")}>{state.diagnosedAt ? <CheckCircle2 className="size-5" /> : <ClipboardCheck className="size-5" />}</span>
            <span className="min-w-0 flex-1"><span className="block text-[10px] font-extrabold tracking-[.12em] text-[#7486A1]">STEP 01 · 能力基线</span><strong id="diagnostic-heading" className="mt-0.5 block text-sm text-[#17233D]">{state.diagnosedAt ? `已于 ${formatDate(state.diagnosedAt)} 完成诊断，可随时校准` : "完成 3 分钟诊断，生成你的岗位差距"}</strong></span>
            <span className="hidden items-center gap-1 text-xs font-bold text-[#346DC2] sm:inline-flex">{diagnosticOpen ? "收起" : state.diagnosedAt ? "重新诊断" : "开始诊断"}<ChevronRight className={cn("size-4 transition-transform", diagnosticOpen && "rotate-90")} /></span>
          </button>
          {diagnosticOpen && (
            <div className="border-t border-[#E7EDF5] px-5 py-5 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
                <div>
                  <h2 className="text-sm font-bold text-[#17233D]">训练约束</h2>
                  <p className="mt-1 text-xs leading-5 text-[#718096]">用于控制任务密度和训练节奏，不影响岗位能力标准。</p>
                  <FieldLabel label="相关经验">
                    <SegmentedOptions value={state.experience} options={[{ value: "zero", label: "零基础" }, { value: "basic", label: "有基础" }, { value: "project", label: "有项目" }]} onChange={(experience) => updateState((current) => ({ ...current, experience }))} />
                  </FieldLabel>
                  <FieldLabel label="目标周期">
                    <SegmentedOptions value={String(state.weeks)} options={[{ value: "4", label: "4 周" }, { value: "8", label: "8 周" }, { value: "12", label: "12 周" }]} onChange={(value) => updateState((current) => ({ ...current, weeks: Number(value) as 4 | 8 | 12 }))} />
                  </FieldLabel>
                  <FieldLabel label="每周可投入">
                    <SegmentedOptions value={String(state.weeklyHours)} options={[{ value: "3", label: "3 小时" }, { value: "5", label: "5 小时" }, { value: "8", label: "8 小时" }]} onChange={(value) => updateState((current) => ({ ...current, weeklyHours: Number(value) as 3 | 5 | 8 }))} />
                  </FieldLabel>
                </div>
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-sm font-bold text-[#17233D]">逐项判断当前能力</h2><p className="mt-1 text-xs text-[#718096]">请选择你能稳定做到的最高等级；不确定时选择较低等级。</p></div><span className="text-[10px] font-bold text-[#7A8CA6]">目标标准均为 L3</span></div>
                  <div className="mt-3 space-y-2.5">
                    {framework.competencies.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[#E2E9F2] bg-[#FAFCFF] p-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-xs text-[#17233D]">{item.name}</strong><p className="mt-1 text-[11px] leading-4 text-[#718096]">{item.description}</p></div><span className="rounded-full bg-[#EDF3FC] px-2 py-1 text-[10px] font-bold text-[#49688E]">{LEVEL_NAMES[state.ratings[item.id] ?? 0]}</span></div>
                        <div className="mt-3 grid grid-cols-4 gap-1.5">
                          {([0, 1, 2, 3] as CompetencyLevel[]).map((level) => <button key={level} type="button" onClick={() => updateState((current) => ({ ...current, ratings: { ...current.ratings, [item.id]: level } }))} className={cn("h-8 rounded-lg border text-[10px] font-bold transition", state.ratings[item.id] === level ? "border-[#3376D4] bg-[#3376D4] text-white shadow-sm" : "border-[#DDE6F1] bg-white text-[#6F7F96] hover:border-[#9DB8DA] hover:bg-[#F1F6FD]")}>{LEVEL_SHORT_NAMES[level]}</button>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E7EDF5] pt-4"><p className="text-[11px] leading-5 text-[#718096]">准备度为训练辅助估算：能力基线占 40%，已提交的岗位成果证据占 60%。</p><button type="button" onClick={submitDiagnostic} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-xs font-bold text-white hover:bg-[#1D58AD]"><Sparkles className="size-4" />生成训练方案</button></div>
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6" aria-labelledby="matrix-heading">
            <SectionHeading eyebrow="STEP 02 · 差距分析" title="岗位能力矩阵" description="每项能力都对应可观察的岗位行为与交付标准。" icon={<Target className="size-4" />} />
            <div className="mt-5 space-y-3">
              {framework.competencies.map((item) => {
                const level = state.ratings[item.id] ?? 0
                return (
                  <article key={item.id} className="rounded-2xl border border-[#E1E8F1] bg-[#FBFCFE] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EAF2FF] text-xs font-extrabold text-[#2D6CC7]">{LEVEL_SHORT_NAMES[level]}</span>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-[#17233D]">{item.name}</h3><span className="text-[10px] font-bold text-[#A05D38]">距目标 {3 - level} 级</span></div><p className="mt-1 text-[11px] leading-5 text-[#718096]">下一等级标准：{item.standards[Math.min(level, 2)]}</p></div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label={`${item.name}能力等级`}>
                      {[1, 2, 3].map((step) => <span key={step} className={cn("h-1.5 rounded-full", step <= level ? "bg-[#3376D4]" : "bg-[#E3EAF3]")} />)}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6" aria-labelledby="plan-heading">
            <SectionHeading eyebrow="STEP 03 · 训练路径" title={`${state.weeks} 周岗位训练计划`} description={`按每周 ${state.weeklyHours} 小时安排，共 ${totalHours} 小时。`} icon={<CalendarDays className="size-4" />} />
            <div className="relative mt-5 space-y-0 pl-4 before:absolute before:bottom-5 before:left-[27px] before:top-5 before:w-px before:bg-[#DCE5F1]">
              <PlanStage number="01" range="第 1 周" title="能力基线与岗位标准" detail={`完成 ${framework.competencies.length} 项能力诊断，明确证据要求`} active={!state.diagnosedAt} done={Boolean(state.diagnosedAt)} />
              <PlanStage number="02" range={`第 2–${Math.max(2, state.weeks - 2)} 周`} title="专项任务跟练" detail={`围绕 ${framework.competencies.map((item) => item.name).slice(0, 3).join("、")} 补齐能力差距`} active={Boolean(state.diagnosedAt && completedTasks.length < Math.ceil(framework.tasks.length / 2))} done={completedTasks.length >= Math.ceil(framework.tasks.length / 2)} />
              <PlanStage number="03" range={`第 ${Math.max(3, state.weeks - 1)} 周`} title="综合场景实战" detail={`串联“${(role.knowledgeBase?.workflow ?? ["目标拆解", "方案实施", "成果验证"]).join(" → ")}”`} active={completedTasks.length >= Math.ceil(framework.tasks.length / 2) && completedTasks.length < framework.tasks.length} done={completedTasks.length === framework.tasks.length} />
              <PlanStage number="04" range={`第 ${state.weeks} 周`} title="成果验收与复盘" detail="核对交付物、验证结论与改进行动，形成岗位证据包" active={completedTasks.length === framework.tasks.length} done={readiness >= 80} />
            </div>
            <div className="mt-4 rounded-2xl border border-[#D8E5F5] bg-[#F2F7FD] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#254F86]"><Clock3 className="size-4" />动态节奏建议</div><p className="mt-2 text-[11px] leading-5 text-[#5F7390]">{state.experience === "zero" ? "前两周优先理解工作流并跟做样例，再进入独立任务。" : state.experience === "basic" ? "用短周期任务快速暴露差距，重点补齐过程记录和验收意识。" : "直接从综合场景入手，用证据反推薄弱能力并专项补强。"}</p></div>
          </section>
        </div>

        <section className="mt-4 rounded-[24px] border border-[#DCE5F1] bg-white p-5 shadow-[0_12px_34px_rgba(41,67,112,.07)] sm:p-6" aria-labelledby="tasks-heading">
          <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeading eyebrow="STEP 04 · 任务实践" title="岗位任务训练场" description="每项任务必须形成交付物，并通过统一标准完成自验收。" icon={<Layers3 className="size-4" />} /><div className="rounded-full bg-[#EFF4FA] px-3 py-1.5 text-[10px] font-bold text-[#5F7390]">{completedTasks.length} 项已验收 · {framework.tasks.length - completedTasks.length} 项待完成</div></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {framework.tasks.map((task, index) => {
              const progress = state.tasks[task.id] ?? { status: "todo", evidence: "" }
              const completed = progress.status === "completed"
              const inProgress = progress.status === "in-progress"
              return (
                <article id={task.id} key={task.id} className={cn("scroll-mt-8 rounded-[20px] border p-4 transition", completed ? "border-[#BFDCCF] bg-[#F5FBF8]" : inProgress ? "border-[#AFC9EA] bg-[#F7FAFF] shadow-[0_8px_24px_rgba(45,108,199,.08)]" : "border-[#E0E7F0] bg-[#FBFCFE]")}>
                  <div className="flex items-start gap-3"><span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold", completed ? "bg-[#DDF2E9] text-[#18745E]" : inProgress ? "bg-[#DDEBFF] text-[#2468CE]" : "bg-[#EDF1F6] text-[#718096]")}>{completed ? <Check className="size-4" /> : String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#677A95] shadow-sm">{task.competencyName}</span><span className="text-[9px] font-bold text-[#8795A9]">预计 {task.estimatedHours} 小时</span></div><h3 className="mt-2 text-sm font-bold leading-5 text-[#17233D]">{task.title}</h3></div></div>
                  <div className="mt-4 rounded-xl border border-[#E2E9F2] bg-white/80 p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold text-[#547096]"><FileCheck2 className="size-3.5" />应交付成果</p><p className="mt-1 text-xs font-semibold text-[#273A54]">{task.output}</p><div className="mt-2 flex flex-wrap gap-1.5">{task.acceptance.map((item) => <span key={item} className="rounded-md bg-[#F0F4F8] px-2 py-1 text-[9px] font-medium text-[#66758B]">{item}</span>)}</div></div>
                  {completed && <div className="mt-3 rounded-xl bg-[#EAF6F1] px-3 py-2.5"><div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#27725F]"><span className="inline-flex items-center gap-1"><BadgeCheck className="size-3.5" />成果已留痕</span><span>{formatDate(progress.completedAt)}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#52776B]">{progress.evidence}</p></div>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {progress.status === "todo" && <button type="button" onClick={() => startTask(task.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white hover:bg-[#1D58AD]"><Play className="size-3.5 fill-current" />开始任务</button>}
                    {inProgress && <button type="button" onClick={() => openEvidence(task)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2468CE] px-3 text-[11px] font-bold text-white hover:bg-[#1D58AD]"><FileCheck2 className="size-3.5" />提交成果</button>}
                    {completed && <button type="button" onClick={() => openEvidence(task)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#BDD9CD] bg-white px-3 text-[11px] font-bold text-[#27725F] hover:bg-[#F0F9F5]"><PencilLine className="size-3.5" />更新成果</button>}
                    {!completed && <Link to={`/workspace?topic=${encodeURIComponent(task.title)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DCE5F1] bg-white px-3 text-[11px] font-bold text-[#58708F] hover:bg-[#F1F6FD]">进入资源工坊<ArrowRight className="size-3.5" /></Link>}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-[#D7E3EF] bg-gradient-to-r from-[#F7FAFE] to-[#F3F0FC] p-5 shadow-[0_12px_34px_rgba(41,67,112,.06)] sm:p-6" aria-labelledby="result-heading">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex items-start gap-4"><span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", readiness >= 80 ? "bg-[#DDF2E9] text-[#18745E]" : "bg-[#E8EEFA] text-[#496DA7]")}><Trophy className="size-5" /></span><div><span className="text-[10px] font-extrabold tracking-[.12em] text-[#7286A2]">STEP 05 · 岗位验收</span><h2 id="result-heading" className="mt-1 text-lg font-bold text-[#17233D]">{readiness >= 80 ? "已形成岗位候选能力证据包" : "完成训练任务，形成可验证的岗位成果"}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[#65758C]">达标条件：准备度达到 80%，且每项核心任务均有成果留痕。当前已完成 {completedTasks.length}/{framework.tasks.length} 项，能力基线平均为 {ratingTotal}/{framework.competencies.length * 3}。</p></div></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/80 px-5 py-3 shadow-sm"><span className="text-3xl font-black tracking-[-.05em] text-[#245FBA]">{readiness}</span><span className="text-[10px] font-bold leading-4 text-[#718096]">岗位准备度<br />满分 100</span></div>
          </div>
        </section>
      </div>

      {evidenceTaskId && (
        <EvidenceDialog
          task={framework.tasks.find((item) => item.id === evidenceTaskId)!}
          value={evidenceDraft}
          error={evidenceError}
          onChange={(value) => { setEvidenceDraft(value); setEvidenceError("") }}
          onClose={() => setEvidenceTaskId(null)}
          onSubmit={submitEvidence}
        />
      )}
    </main>
  )
}

function MetricCard({ value, label, detail, accent = false }: { value: string; label: string; detail: string; accent?: boolean }) {
  return <div className={cn("rounded-2xl border p-4 backdrop-blur", accent ? "border-[#76A8E5]/35 bg-[#5D91D6]/18" : "border-white/12 bg-white/[.07]")}><strong className="block text-2xl font-black tracking-[-.04em] text-white">{value}</strong><span className="mt-1 block text-[10px] font-bold text-[#D8E5F5]">{label}</span><small className="mt-1 block truncate text-[9px] text-[#9FB5D0]">{detail}</small></div>
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-4"><span className="mb-2 block text-[10px] font-bold text-[#65758C]">{label}</span>{children}</div>
}

function SegmentedOptions<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <span className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#F0F4F8] p-1">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("h-8 rounded-lg text-[10px] font-bold transition", value === option.value ? "bg-white text-[#286CCB] shadow-sm" : "text-[#718096] hover:bg-white/60")}>{option.label}</button>)}</span>
}

function SectionHeading({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon: React.ReactNode }) {
  return <div><div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.12em] text-[#6E83A2]">{icon}{eyebrow}</div><h2 className="mt-1.5 text-lg font-bold tracking-[-.025em] text-[#17233D]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#718096]">{description}</p></div>
}

function PlanStage({ number, range, title, detail, active, done }: { number: string; range: string; title: string; detail: string; active: boolean; done: boolean }) {
  return <div className="relative flex gap-3 pb-5"><span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-[9px] font-extrabold", done ? "border-[#77B59F] bg-[#DDF2E9] text-[#18745E]" : active ? "border-[#3376D4] bg-[#3376D4] text-white shadow-[0_0_0_5px_#EAF2FF]" : "border-[#D7E0EA] bg-white text-[#8391A4]")}>{done ? <Check className="size-3.5" /> : number}</span><div className="min-w-0 flex-1 pt-0.5"><div className="flex flex-wrap items-center justify-between gap-1"><h3 className="text-xs font-bold text-[#24364E]">{title}</h3><span className="text-[9px] font-bold text-[#8290A4]">{range}</span></div><p className="mt-1 text-[10px] leading-4 text-[#718096]">{detail}</p>{active && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#EAF2FF] px-2 py-1 text-[9px] font-bold text-[#286CCB]"><CircleDashed className="size-3" />当前阶段</span>}</div></div>
}

function EvidenceDialog({ task, value, error, onChange, onClose, onSubmit }: { task: TrainingTask; value: string; error: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#10233E]/45 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="evidence-title" className="w-full max-w-xl rounded-[24px] border border-[#D9E3EF] bg-white p-5 shadow-[0_28px_80px_rgba(18,44,77,.25)] sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#E7F2FF] text-[#286CCB]"><FileCheck2 className="size-5" /></span><div className="min-w-0 flex-1"><span className="text-[10px] font-extrabold tracking-[.12em] text-[#7186A5]">成果留痕</span><h2 id="evidence-title" className="mt-1 text-lg font-bold text-[#17233D]">提交岗位任务成果</h2></div><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-[#718096] hover:bg-[#EFF3F8]" aria-label="关闭"><X className="size-4" /></button></div>
        <div className="mt-4 rounded-xl border border-[#E0E8F2] bg-[#F7FAFE] p-3"><p className="text-xs font-bold text-[#273A54]">{task.title}</p><p className="mt-1 text-[10px] text-[#718096]">应交付：{task.output}</p></div>
        <label className="mt-4 block"><span className="text-xs font-bold text-[#394D68]">成果说明或存放位置</span><textarea autoFocus value={value} onChange={(event) => onChange(event.target.value)} rows={5} placeholder="例如：已完成实施记录，包含需求口径、关键步骤、测试截图和复盘结论；文件保存在……" className="mt-2 w-full resize-y rounded-xl border border-[#D5E0EC] bg-white px-3 py-3 text-xs leading-5 text-[#273A54] outline-none transition placeholder:text-[#A0ACBA] focus:border-[#4B86D8] focus:ring-4 focus:ring-[#DCEAFF]" /></label>
        {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-[#B05B3C]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-[#DCE5F1] px-4 text-xs font-bold text-[#66758B] hover:bg-[#F3F6FA]">暂不提交</button><button type="button" onClick={onSubmit} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2468CE] px-5 text-xs font-bold text-white hover:bg-[#1D58AD]"><BadgeCheck className="size-4" />确认成果并完成任务</button></div>
      </section>
    </div>
  )
}
