import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  CircleAlert,
  LockKeyhole,
  Network,
  RefreshCw,
  Route,
  Sparkles,
} from "lucide-react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"
import type { PersonalizedTrainingPlan, TrainingDiagnosis } from "@/store/workspace"

export interface ReportCapability {
  id: string
  name: string
  level: number
  state: "mastered" | "developing" | "current" | "ready" | "locked"
  task: string
}

export interface ReportResource {
  id: "doc" | "guide" | "quiz"
  title: string
  reviewScore: number
  ready: boolean
}

interface LearnerMatchReportProps {
  released: boolean
  generated: boolean
  onGenerate: () => void
  onRegenerate: () => void
  diagnosis: TrainingDiagnosis | null
  plan?: PersonalizedTrainingPlan
  theoryScore?: number
  theoryWeakTopics: string[]
  profileWeakTopics: string[]
  capabilities: ReportCapability[]
  resources: ReportResource[]
  feedbackAccuracy?: number | null
}

type KnowledgeNodeStatus = "gap" | "verify" | "supported"

interface KnowledgeNode {
  id: string
  name: string
  status: KnowledgeNodeStatus
  evidence: string
  nextStep: string
}

const NODE_POSITIONS = [
  { x: 72, y: 66 },
  { x: 328, y: 32 },
  { x: 584, y: 66 },
  { x: 72, y: 292 },
  { x: 328, y: 326 },
  { x: 584, y: 292 },
] as const

const STATUS_META: Record<KnowledgeNodeStatus, { label: string; card: string; dot: string }> = {
  gap: { label: "已定位盲区", card: "border-[#DFAFA1] bg-[#FFF7F4] text-[#8E432F]", dot: "bg-[#C76045]" },
  verify: { label: "需要验证", card: "border-[#E2C78F] bg-[#FFF9ED] text-[#85601E]", dot: "bg-[#D19936]" },
  supported: { label: "已有支撑", card: "border-[#AFCFC3] bg-[#F3FAF7] text-[#286B59]", dot: "bg-[#319078]" },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function unique(items: Array<string | undefined>) {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))]
}

export function LearnerMatchReport(props: LearnerMatchReportProps) {
  const report = buildReport(props)
  const [selectedNodeId, setSelectedNodeId] = useState("")
  const selectedNode = report.knowledgeNodes.find((node) => node.id === selectedNodeId) ?? report.knowledgeNodes[0]

  if (!props.released) {
    return (
      <section className="mt-4 rounded-[24px] border border-[#D9E1E9] bg-white p-5 shadow-[0_10px_30px_rgba(41,67,112,.06)] sm:p-6">
        <div className="flex items-start gap-4 rounded-[18px] border border-dashed border-[#C9D3DE] bg-[#FAFBFC] p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF1F4] text-[#748291]"><LockKeyhole className="size-4.5" /></span>
          <div><h2 className="text-base font-bold text-[#28394B]">个人学情与资源匹配度报告</h2><p className="mt-1 text-xs leading-5 text-[#74808D]">三类资源通过发布门禁后，即可生成完整报告。</p></div>
        </div>
      </section>
    )
  }

  if (!props.generated) {
    return (
      <section id="learner-match-report" className="mt-4 scroll-mt-24 rounded-[24px] border border-[#C9D6E3] bg-white p-6 shadow-[0_14px_36px_rgba(41,67,112,.08)] sm:p-8">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div><div className="flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#708399]"><Sparkles className="size-4" />资源分析已就绪</div><h2 className="mt-2 text-xl font-bold tracking-[-.025em] text-[#24374C]">个人学情与资源匹配度报告</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[#748291]">生成知识盲区定位、资源难度匹配曲线和个性化学习路径规划图。</p></div>
          <button type="button" onClick={props.onGenerate} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#285F9D] px-5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(40,95,157,.18)] hover:bg-[#204F84]"><Network className="size-4" />生成可视化报告<ArrowRight className="size-4" /></button>
        </div>
      </section>
    )
  }

  return (
    <section id="learner-match-report" className="mt-4 scroll-mt-24 rounded-[24px] border border-[#CBD6E1] bg-[#F6F8FA] shadow-[0_14px_38px_rgba(41,67,112,.09)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7E0E8] bg-white px-5 py-5 sm:px-7">
        <h2 className="text-xl font-bold tracking-[-.025em] text-[#23364B]">个人学情与资源匹配度报告</h2>
        <button type="button" onClick={props.onRegenerate} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D5DEE7] bg-white px-3 text-[11px] font-bold text-[#52687F] hover:bg-[#F5F7F9]"><RefreshCw className="size-3.5" />重新生成</button>
      </header>

      <div className="space-y-4 p-4 sm:p-6">
        <article className="rounded-[20px] border border-[#D7E0E8] bg-white p-5">
          <ReportHeading icon={CircleAlert} index="01" title="知识盲区定位" description="结合测评、画像和训练诊断，区分已经确认的知识盲区、需要验证的内容和已有能力支撑。" />
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="overflow-x-auto rounded-[18px] border border-[#DFE5EB] bg-[#FAFBFC]">
              <svg viewBox="0 0 820 450" role="img" aria-label="个人知识盲区关联图" className="min-w-[760px]">
                <defs>
                  <pattern id="knowledge-report-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#D8E0E8" /></pattern>
                </defs>
                <rect width="820" height="450" fill="url(#knowledge-report-grid)" />
                {report.knowledgeNodes.map((node, index) => {
                  const point = NODE_POSITIONS[index]
                  if (!point) return null
                  const startX = point.x < 328 ? point.x + 164 : point.x
                  const startY = point.y + 43
                  return <path key={`edge-${node.id}`} d={`M 410 225 C ${(410 + startX) / 2} 225, ${(410 + startX) / 2} ${startY}, ${startX} ${startY}`} fill="none" stroke="#AAB9C8" strokeWidth="2" strokeDasharray={node.status === "verify" ? "6 6" : undefined} />
                })}
                <foreignObject x="326" y="176" width="168" height="98"><div className="grid h-full place-items-center rounded-[20px] border-2 border-[#6E8CAB] bg-white px-4 text-center shadow-[0_8px_18px_rgba(48,72,98,.11)]"><div><Network className="mx-auto size-5 text-[#456A90]" /><strong className="mt-2 block text-[12px] text-[#2D435A]">本轮知识结构</strong></div></div></foreignObject>
                {report.knowledgeNodes.map((node, index) => {
                  const point = NODE_POSITIONS[index]
                  if (!point) return null
                  const meta = STATUS_META[node.status]
                  return <foreignObject key={node.id} x={point.x} y={point.y} width="164" height="86"><button type="button" onClick={() => setSelectedNodeId(node.id)} className={cn("h-full w-full rounded-[16px] border px-3 text-left shadow-[0_5px_14px_rgba(48,72,98,.07)] transition hover:-translate-y-0.5", meta.card, selectedNode?.id === node.id && "ring-2 ring-[#577FA7]/25")}><span className="flex items-center gap-1.5 text-[8px] font-bold"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</span><strong className="mt-2 block line-clamp-2 text-[11px] leading-4">{node.name}</strong></button></foreignObject>
                })}
              </svg>
            </div>

            {selectedNode && <aside className="rounded-[18px] border border-[#DBE2E9] bg-[#FAFBFC] p-4"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", STATUS_META[selectedNode.status].dot)} /><span className="text-[9px] font-bold text-[#778697]">{STATUS_META[selectedNode.status].label}</span></div><h3 className="mt-2 text-sm font-bold text-[#2B3F55]">{selectedNode.name}</h3><div className="mt-4 rounded-xl bg-white p-3"><span className="text-[9px] font-bold text-[#7A8897]">定位依据</span><p className="mt-1 text-[10px] leading-5 text-[#53667A]">{selectedNode.evidence}</p></div><div className="mt-2 rounded-xl bg-white p-3"><span className="text-[9px] font-bold text-[#7A8897]">对应处理</span><p className="mt-1 text-[10px] leading-5 text-[#53667A]">{selectedNode.nextStep}</p></div></aside>}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[9px] text-[#718090]">{(["gap", "verify", "supported"] as KnowledgeNodeStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", STATUS_META[status].dot)} />{STATUS_META[status].label}</span>)}</div>
        </article>

        <article className="rounded-[20px] border border-[#D7E0E8] bg-white p-5">
          <ReportHeading icon={Network} index="02" title="资源难度匹配曲线" description="蓝色区域表示适宜难度范围，资源曲线随学习阶段逐步提升，并保持在合理训练负荷内。" />
          <div className="mt-5 h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={report.curve} margin={{ top: 16, right: 20, left: -8, bottom: 4 }}>
                <CartesianGrid stroke="#E2E7EC" strokeDasharray="4 5" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#68798A", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickFormatter={difficultyLabel} tick={{ fill: "#68798A", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(value, name) => name === "适宜难度范围" ? [difficultyRangeLabel(value), name] : [difficultyLabel(Number(value)), name]} contentStyle={{ borderRadius: 12, borderColor: "#D6DEE7", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="range" name="适宜难度范围" stroke="#7FA5CA" fill="#DCEAF6" fillOpacity={.8} />
                <Line type="monotone" dataKey="difficulty" name="资源难度" stroke="#C77B32" strokeWidth={3} dot={{ r: 5, fill: "#C77B32", stroke: "#FFF", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-[20px] border border-[#D7E0E8] bg-white p-5">
          <ReportHeading icon={Route} index="03" title="学习路径规划图" description="路径根据当前知识盲区、能力前置关系和本轮训练计划生成。" />
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-[820px] items-center">
              {report.path.map((node, index) => (
                <div key={`${node}-${index}`} className="contents">
                  <div className={cn("grid min-h-24 w-[180px] shrink-0 place-items-center rounded-[18px] border px-4 text-center", index === 0 ? "border-[#6D95BD] bg-[#F0F6FB] ring-2 ring-[#557FA7]/10" : index === report.path.length - 1 ? "border-[#A8C9BD] bg-[#F2F9F6]" : "border-[#D8E0E8] bg-[#FAFBFC]")}><div><span className="text-[9px] font-black text-[#8090A1]">{String(index + 1).padStart(2, "0")}</span><strong className="mt-2 block text-[11px] leading-5 text-[#2C4055]">{node}</strong></div></div>
                  {index < report.path.length - 1 && <div className="flex w-10 shrink-0 items-center"><div className="h-px flex-1 border-t-2 border-dashed border-[#9FAFBE]" /><ArrowRight className="-ml-1 size-4 text-[#879AAA]" /></div>}
                </div>
              ))}
            </div>
          </div>
        </article>

        <div className="flex justify-end"><Link to="/workspace/r/doc" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#285F9D] px-4 text-xs font-bold text-white hover:bg-[#204F84]">按照路径开始学习<ArrowRight className="size-3.5" /></Link></div>
      </div>
    </section>
  )
}

function buildReport(props: LearnerMatchReportProps) {
  const confirmedGaps = unique([
    ...(props.diagnosis?.knowledge_gaps ?? []),
    ...props.theoryWeakTopics,
    ...props.profileWeakTopics,
  ]).slice(0, 4)
  const supportedCapabilities = props.capabilities.filter((item) => item.level >= 2).map((item) => item.name)
  const verificationTopics = unique([
    ...(props.plan?.priority_competencies ?? []),
    ...props.capabilities.filter((item) => item.state === "current" || item.state === "ready").map((item) => item.name),
  ]).filter((item) => !confirmedGaps.includes(item))

  const knowledgeNodes: KnowledgeNode[] = [
    ...confirmedGaps.map((name, index) => ({
      id: `gap-${index}`,
      name,
      status: "gap" as const,
      evidence: props.theoryWeakTopics.includes(name)
        ? "理论测评中的相关题目未达到稳定掌握，已形成直接诊断证据。"
        : props.profileWeakTopics.includes(name)
          ? "该内容来自画像中明确记录的薄弱项，并被本轮诊断纳入训练范围。"
          : "学情诊断在当前岗位任务中识别出知识或场景理解缺口。",
      nextStep: index === 0 ? "在学习路径的起始阶段优先处理，并通过对应任务验证。" : "安排在本轮后续节点中巩固。",
    })),
    ...verificationTopics.slice(0, Math.max(1, 5 - confirmedGaps.length)).map((name, index) => ({
      id: `verify-${index}`,
      name,
      status: "verify" as const,
      evidence: "当前已有部分相关信息，但还缺少足够的岗位任务或测试证据。",
      nextStep: "在本轮实操或测试中完成验证，再更新掌握状态。",
    })),
    ...supportedCapabilities.filter((item) => !confirmedGaps.includes(item) && !verificationTopics.includes(item)).slice(0, 1).map((name, index) => ({
      id: `supported-${index}`,
      name,
      status: "supported" as const,
      evidence: "已有画像、测评或训练记录能够支撑当前判断。",
      nextStep: "作为本轮学习的前置基础，无需重复训练。",
    })),
  ].slice(0, 6)

  if (!knowledgeNodes.length) {
    knowledgeNodes.push({ id: "verify-default", name: "岗位核心知识", status: "verify", evidence: "当前证据不足以定位明确盲区。", nextStep: "通过本轮任务和测试继续采集证据。" })
  }

  const baseScore = props.feedbackAccuracy ?? props.diagnosis?.knowledge_score ?? props.theoryScore ?? 60
  const learnerLevel = clamp(baseScore / 20, 1.4, 4.2)
  const targetDifficulty = clamp(props.plan?.target_difficulty ?? props.diagnosis?.target_difficulty ?? learnerLevel, 1, 5)
  const stageOffsets = [0, .35, .7]
  const curve = props.resources.map((resource, index) => {
    const center = clamp(learnerLevel + stageOffsets[index], 1, 5)
    const lower = clamp(center - .45, 1, 5)
    const upper = clamp(center + .55, 1, 5)
    const proposed = targetDifficulty + (index - 1) * .4
    const difficulty = clamp(proposed * .35 + center * .65, lower + .08, upper - .08)
    return {
      name: resource.id === "doc" ? "知识理解" : resource.id === "guide" ? "场景应用" : "综合验证",
      range: [Number(lower.toFixed(2)), Number(upper.toFixed(2))],
      difficulty: Number(difficulty.toFixed(2)),
    }
  })

  const pathCandidates = unique([
    ...confirmedGaps.slice(0, 2),
    ...(props.plan?.priority_competencies ?? []),
    ...(props.plan?.stages.map((stage) => stage.goal) ?? []),
  ])
  const path = pathCandidates.slice(0, 4)
  const finalNode = props.diagnosis?.training_goal ?? "完成本轮岗位任务验收"
  if (!path.includes(finalNode)) path.push(finalNode)

  return { knowledgeNodes, curve, path: path.slice(0, 5) }
}

function difficultyLabel(value: number) {
  if (value < 1.5) return "入门"
  if (value < 2.5) return "基础"
  if (value < 3.5) return "应用"
  if (value < 4.5) return "挑战"
  return "进阶"
}

function difficultyRangeLabel(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return "适宜范围"
  return `${difficultyLabel(Number(value[0]))}—${difficultyLabel(Number(value[1]))}`
}

function ReportHeading({ icon: Icon, index, title, description }: { icon: typeof Network; index: string; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EDF2F6] text-[#456A8E]"><Icon className="size-4" /></span><div><span className="text-[9px] font-bold tracking-[.12em] text-[#8493A2]">{index}</span><h3 className="text-sm font-bold text-[#293C51]">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[#758392]">{description}</p></div></div>
}
