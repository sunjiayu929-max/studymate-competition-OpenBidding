import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  CircleAlert,
  Flag,
  Lock,
  Network,
  Route,
  Zap,
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
  prerequisites: string[]
}

export interface ReportResource {
  id: "doc" | "guide" | "quiz"
  title: string
  reviewScore: number
  ready: boolean
}

interface LearnerMatchReportProps {
  targetRoleName: string
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
  const [selectedPathId, setSelectedPathId] = useState("")
  const selectedNode = report.knowledgeNodes.find((node) => node.id === selectedNodeId) ?? report.knowledgeNodes[0]
  const pathCapabilities = props.capabilities.length ? props.capabilities : [{ id: "report-start", name: "建立目标岗位路径", level: 0, state: "ready" as const, task: "选择目标岗位后，系统会生成对应的能力节点与训练路线。", prerequisites: [] }]
  const selectedPath = pathCapabilities.find((node) => node.id === selectedPathId) ?? pathCapabilities.find((node) => node.state === "current") ?? pathCapabilities[0]
  return (
    <section id="learner-match-report" className="mb-4 mt-4 scroll-mt-24 rounded-[24px] border border-[#CBD6E1] bg-[#F6F8FA] shadow-[0_14px_38px_rgba(41,67,112,.09)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7E0E8] bg-white px-5 py-5 sm:px-7">
        <div>
          <h2 className="text-xl font-bold tracking-[-.025em] text-[#23364B]">个人学情与资源匹配度报告</h2>
          <p className="mt-1 text-xs leading-5 text-[#748291]">综合当前画像、测评和训练记录，呈现知识盲区、资源难度与学习路径。</p>
        </div>
        <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#BFDCCF] bg-[#F3FAF7] px-3 text-[11px] font-bold text-[#286B59]"><span className="size-1.5 rounded-full bg-[#319078]" />实时更新</span>
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
                <foreignObject x="326" y="176" width="168" height="98"><div className="grid h-full place-items-center rounded-[20px] border-2 border-[#6E8CAB] bg-white px-4 text-center shadow-[0_8px_18px_rgba(48,72,98,.11)]"><div><Network className="mx-auto size-5 text-[#456A90]" /><strong className="mt-2 block text-[12px] text-[#2D435A]">当前知识结构</strong></div></div></foreignObject>
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
          <ReportHeading icon={Route} index="03" title="学习路径规划图" description="路径根据当前知识盲区、能力前置关系和已有训练计划动态生成。" />
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_188px] xl:items-center">
            <div className="min-w-0">
              <ReportPathMap
                capabilities={pathCapabilities}
                targetRoleName={props.targetRoleName}
                selectedId={selectedPath?.id}
                onSelect={setSelectedPathId}
              />
              <ReportPathProgress capabilities={props.capabilities} targetRoleName={props.targetRoleName} />
            </div>
            <Link to="/competency" className="group inline-flex min-h-24 items-center justify-center gap-2 rounded-[18px] border border-[#B9CBE4] bg-[linear-gradient(145deg,#244C80,#315E9C)] px-4 text-center text-xs font-bold text-white shadow-[0_12px_24px_rgba(36,76,128,.2)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(36,76,128,.28)]"><span><span className="grid mx-auto mb-2 size-9 place-items-center rounded-xl bg-white/15"><Route className="size-4" /></span><span className="block">开始今日学习</span><span className="mt-1 block text-[9px] font-medium text-[#CFE2FF]">进入岗位训练中心</span></span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link>
          </div>
          {selectedPath && <div className="mt-3 rounded-[16px] border border-[#D8E2EE] bg-[#FAFCFE] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[9px] font-extrabold tracking-[.12em] text-[#7185A1]">当前路径节点 · {selectedPath.level >= 3 ? "已验收" : selectedPath.state === "current" ? "本轮训练" : "待完成"}</span><strong className="text-xs text-[#294A73]">{selectedPath.name}</strong></div><p className="mt-1 text-[10px] leading-5 text-[#64758A]">{selectedPath.task}</p></div>}
        </article>

      </div>
    </section>
  )
}

const REPORT_ROUTE_META: Record<ReportCapability["state"], { fill: string; stroke: string; label: string }> = {
  mastered: { fill: "#E6F6EF", stroke: "#2A8A70", label: "已验收" },
  developing: { fill: "#FFF4E2", stroke: "#C6872E", label: "待补强" },
  current: { fill: "#EAF2FF", stroke: "#3974CA", label: "本轮训练" },
  ready: { fill: "#F4F7FB", stroke: "#8799AF", label: "可以开始" },
  locked: { fill: "#F5F6F8", stroke: "#A8B0BC", label: "前置未完成" },
}

export function ReportPathMap({ capabilities, targetRoleName, selectedId, onSelect }: { capabilities: ReportCapability[]; targetRoleName: string; selectedId?: string; onSelect: (id: string) => void }) {
  const nodes = capabilities.slice(0, 7)
  const positions = nodes.map((_, index) => ({ x: 122 + (index % 3) * 258, y: 104 + Math.floor(index / 3) * 142 }))
  const nodeById = new Map(nodes.map((node, index) => [node.id, { node, point: positions[index] }]))
  const finalPoint = { x: 890, y: 246 }
  const finalReady = nodes.length > 0 && nodes.every((node) => node.level >= 3)
  const prerequisiteIds = new Set(nodes.flatMap((node) => node.prerequisites))
  const terminalNodes = nodes.filter((node) => !prerequisiteIds.has(node.id))

  return <div className="overflow-x-auto rounded-[18px] border border-[#DCE5F0] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)]">
    <svg viewBox="0 0 1020 390" role="img" aria-label={`${targetRoleName || "目标岗位"}路径地图`} className="min-w-[780px]">
      <defs>
        <pattern id="learner-report-route-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#DDE7F2" strokeWidth="1" opacity=".55" /></pattern>
        <marker id="learner-report-route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9AAFC7" /></marker>
      </defs>
      <rect width="1020" height="390" fill="url(#learner-report-route-grid)" />
      {nodes.flatMap((node, targetIndex) => node.prerequisites.map((sourceId) => {
        const source = nodeById.get(sourceId)
        const target = positions[targetIndex]
        if (!source || !target) return null
        const midX = (source.point.x + target.x) / 2
        return <path key={`${sourceId}-${node.id}`} d={`M ${source.point.x + 78} ${source.point.y} C ${midX} ${source.point.y}, ${midX} ${target.y}, ${target.x - 78} ${target.y}`} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={node.level === 0 ? "7 7" : undefined} markerEnd="url(#learner-report-route-arrow)" />
      }))}
      {terminalNodes.map((node) => {
        const source = nodeById.get(node.id)
        if (!source) return null
        const midX = (source.point.x + finalPoint.x) / 2
        return <path key={`${node.id}-final`} d={`M ${source.point.x + 78} ${source.point.y} C ${midX} ${source.point.y}, ${midX} ${finalPoint.y}, ${finalPoint.x - 78} ${finalPoint.y}`} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={finalReady ? undefined : "7 7"} markerEnd="url(#learner-report-route-arrow)" />
      })}
      {nodes.map((node, index) => {
        const point = positions[index]
        if (!point) return null
        const meta = REPORT_ROUTE_META[node.state]
        return <foreignObject key={node.id} x={point.x - 78} y={point.y - 42} width="156" height="84"><button type="button" onClick={() => onSelect(node.id)} className="h-full w-full rounded-[16px] border-2 px-3 py-2 text-left shadow-[0_8px_20px_rgba(50,77,110,.1)] transition hover:-translate-y-0.5" style={{ backgroundColor: meta.fill, borderColor: selectedId === node.id ? "#7654DC" : meta.stroke }}><span className="block text-[8px] font-black" style={{ color: meta.stroke }}>{meta.label} · L{node.level}/L3</span><strong className="mt-1 block truncate text-[11px] text-[#233A57]">{node.name}</strong><small className="mt-1 block truncate text-[8px] text-[#718096]">{node.task}</small></button></foreignObject>
      })}
      <foreignObject x={finalPoint.x - 78} y={finalPoint.y - 46} width="156" height="92"><div className={cn("grid h-full place-items-center rounded-[16px] border-2 px-3 text-center shadow-[0_8px_20px_rgba(50,77,110,.1)]", finalReady ? "border-[#2A8A70] bg-[#E6F6EF]" : "border-[#A8B0BC] bg-[#F5F6F8]")}><div>{finalReady ? <Flag className="mx-auto size-4 text-[#2A8A70]" /> : <Lock className="mx-auto size-4 text-[#8A95A4]" />}<strong className="mt-1 block truncate text-[11px] text-[#33475F]">{targetRoleName || "目标岗位"}</strong><small className="mt-1 block text-[8px] text-[#758399]">{finalReady ? "可以进入岗位验收" : `还需完成 ${nodes.filter((node) => node.level < 3).length} 项能力`}</small></div></div></foreignObject>
    </svg>
  </div>
}

export function ReportPathProgress({ capabilities, targetRoleName }: { capabilities: ReportCapability[]; targetRoleName: string }) {
  const capabilityProgress = capabilities.length
    ? Math.round(capabilities.reduce((sum, node) => sum + Math.min(3, Math.max(0, node.level)), 0) / (capabilities.length * 3) * 100)
    : 0

  return <div className="mt-4 rounded-[18px] border border-[#D8E2EE] bg-[#F7FAFD] p-4" role="progressbar" aria-label="岗位学习路径进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={capabilityProgress}>
    <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-[#63758D]"><span className="inline-flex items-center gap-1.5"><Zap className="size-3.5 text-[#C6872E]" />岗位学习路径进度</span><strong className="text-[#285FAF]">{capabilityProgress}%</strong></div>
    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-[#DCE5F0] shadow-inner"><div className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#2E6EC8_0%,#6C5CE7_48%,#22A38A_100%)] shadow-[0_0_14px_rgba(68,111,218,.7)] transition-[width] duration-700" style={{ width: `${capabilityProgress}%` }} /><div className="absolute inset-y-0 w-16 animate-[route-progress-shimmer_2.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ left: `calc(${Math.max(0, capabilityProgress - 8)}% - 32px)` }} /></div>
    <div className="mt-2 flex items-center justify-between text-[9px] text-[#8090A1]"><span>{capabilities.filter((node) => node.level > 0).length} 项已有学习证据</span><span>目标：{targetRoleName || "目标岗位"}</span></div>
  </div>
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
  const finalNode = props.diagnosis?.training_goal ?? "完善个人学习路径"
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
