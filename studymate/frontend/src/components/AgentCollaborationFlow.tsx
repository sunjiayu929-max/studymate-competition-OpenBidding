import { useRef } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  FileCheck2,
  Gauge,
  Loader2,
  LockKeyhole,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { WorkspaceState } from "@/store/workspace"

type WorkspaceAgent = WorkspaceState["agents"][number]
type AgentStatus = WorkspaceAgent["status"]
type EdgeState = "pending" | "active" | "done" | "error"

interface FlowNodeDefinition {
  id: string
  x: number
  y: number
  width: number
  height: number
  group: string
  icon: LucideIcon
  fallbackName: string
  fallbackDescription: string
}

interface FlowEdgeDefinition {
  from: string
  to: string
  parallel?: boolean
}

const NODE_WIDTH = 170
const NODE_HEIGHT = 116
const CANVAS_WIDTH = 1535
const CANVAS_HEIGHT = 650

const FLOW_COLUMNS = [
  { x: 18, width: 140, step: "输入", title: "训练任务", detail: "岗位目标与当前学情", tone: { background: "#E7EEF5", border: "#C5D5E5", text: "#496682", title: "#2F4D68" } },
  { x: 205, width: 430, step: "01", title: "分析", detail: "学情诊断 · 领域专家 · 教学策略", tone: { background: "#F3D1CF", border: "#E4B0AC", text: "#9C4F56", title: "#753A43" } },
  { x: 700, width: 170, step: "02", title: "生成", detail: "六类资源统一生成", tone: { background: "#F3D7AD", border: "#E4BC80", text: "#9B6424", title: "#754816" } },
  { x: 930, width: 190, step: "03", title: "校验", detail: "三项交叉校验", tone: { background: "#F1E7AC", border: "#DFCE78", text: "#88701D", title: "#66530F" } },
  { x: 1170, width: 170, step: "04", title: "决策", detail: "汇总证据并决策", tone: { background: "#DCCDF0", border: "#C2A9DF", text: "#73539A", title: "#563A7B" } },
  { x: 1390, width: 125, step: "门禁", title: "发布门禁", detail: "通过或自动返工", tone: { background: "#E7EEF5", border: "#C5D5E5", text: "#496682", title: "#2F4D68" } },
] as const

const FLOW_NODES: FlowNodeDefinition[] = [
  { id: "diagnosis", x: 215, y: 260, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: BrainCircuit, fallbackName: "学情诊断 Agent", fallbackDescription: "定位岗位能力盲区与训练起点" },
  { id: "domain_expert", x: 430, y: 120, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: BriefcaseBusiness, fallbackName: "领域专家 Agent", fallbackDescription: "提出专业覆盖与验收要求" },
  { id: "learning_strategy", x: 430, y: 405, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: Gauge, fallbackName: "教学策略 Agent", fallbackDescription: "平衡时间预算、难度与认知负荷" },
  { id: "resource_generation", x: 700, y: 260, width: NODE_WIDTH, height: NODE_HEIGHT, group: "02 · 生成", icon: Sparkles, fallbackName: "资源生成 Agent", fallbackDescription: "统一生成六类岗位训练资源" },
  { id: "evidence_review", x: 935, y: 105, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: SearchCheck, fallbackName: "事实与来源校验 Agent", fallbackDescription: "交叉核对资源依据、引用与来源" },
  { id: "practice_review", x: 935, y: 260, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: ShieldCheck, fallbackName: "实操规范校验 Agent", fallbackDescription: "检查步骤、代码、异常与安全边界" },
  { id: "difficulty_review", x: 935, y: 415, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: FileCheck2, fallbackName: "难度与覆盖校验 Agent", fallbackDescription: "校准资源难度与岗位能力覆盖" },
  { id: "arbiter", x: 1170, y: 260, width: NODE_WIDTH, height: NODE_HEIGHT, group: "04 · 决策", icon: BadgeCheck, fallbackName: "总决策 Agent", fallbackDescription: "汇总三项校验证据并决策发布或返工" },
]

const FLOW_EDGES: FlowEdgeDefinition[] = [
  { from: "task", to: "diagnosis" },
  { from: "diagnosis", to: "domain_expert" },
  { from: "diagnosis", to: "learning_strategy" },
  { from: "domain_expert", to: "resource_generation", parallel: true },
  { from: "learning_strategy", to: "resource_generation", parallel: true },
  { from: "resource_generation", to: "evidence_review", parallel: true },
  { from: "resource_generation", to: "practice_review", parallel: true },
  { from: "resource_generation", to: "difficulty_review", parallel: true },
  { from: "evidence_review", to: "arbiter" },
  { from: "practice_review", to: "arbiter" },
  { from: "difficulty_review", to: "arbiter" },
  { from: "arbiter", to: "publish" },
]

const VIRTUAL_NODES = {
  task: { x: 18, y: 272, width: 140, height: 92 },
  publish: { x: 1390, y: 272, width: 125, height: 92 },
} as const

const RESOURCE_AGENT_IDS = ["doc", "guide", "quiz", "mindmap", "code", "video"]

const EDGE_STYLES: Record<EdgeState, { color: string; width: number; dash?: string; marker: string }> = {
  pending: { color: "#AEBCCE", width: 2, dash: "5 7", marker: "agent-flow-arrow-pending" },
  active: { color: "#2E72D2", width: 3, dash: "8 7", marker: "agent-flow-arrow-active" },
  done: { color: "#2C9677", width: 3, marker: "agent-flow-arrow-done" },
  error: { color: "#C35B43", width: 3, dash: "6 6", marker: "agent-flow-arrow-error" },
}

function isActive(status?: AgentStatus) {
  return status === "running" || status === "streaming"
}

function statusLabel(status?: AgentStatus) {
  if (status === "done") return "已完成"
  if (status === "running") return "执行中"
  if (status === "streaming") return "输出中"
  if (status === "error") return "执行异常"
  return "等待调度"
}

function edgeState(targetStatus?: AgentStatus, sourceStatus?: AgentStatus): EdgeState {
  if (targetStatus === "error" || sourceStatus === "error") return "error"
  if (isActive(targetStatus) || isActive(sourceStatus)) return "active"
  if (targetStatus === "done") return "done"
  if (sourceStatus === "done") return "active"
  return "pending"
}

function pointFor(id: string) {
  return FLOW_NODES.find((item) => item.id === id) ?? VIRTUAL_NODES[id as keyof typeof VIRTUAL_NODES]
}

function connectorPath(from: string, to: string, parallel = false) {
  const source = pointFor(from)
  const target = pointFor(to)
  if (!source || !target) return ""
  const startX = source.x + source.width
  const startY = source.y + source.height / 2
  const endX = target.x
  const endY = target.y + target.height / 2
  if (parallel) {
    const controlOffset = Math.max(28, (endX - startX) * 0.55)
    return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
  }
  const middleX = startX + (endX - startX) / 2
  return Math.abs(startY - endY) < 2
    ? `M ${startX} ${startY} H ${endX}`
    : `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`
}

function aggregateResourceStatus(agentMap: Map<string, WorkspaceAgent>): AgentStatus {
  const statuses = RESOURCE_AGENT_IDS.map((id) => agentMap.get(id)?.status).filter(Boolean) as AgentStatus[]
  if (statuses.some((status) => status === "error")) return "error"
  if (statuses.some((status) => isActive(status))) return "running"
  if (statuses.length > 0 && statuses.every((status) => status === "done")) return "done"
  return "pending"
}

function agentDescription(agent: WorkspaceAgent | undefined, definition: FlowNodeDefinition, workspace: WorkspaceState) {
  if (definition.id === "resource_generation") {
    const generated = RESOURCE_AGENT_IDS.filter((id) => Boolean(workspace.outputs[id as keyof typeof workspace.outputs])).length
    return workspace.status === "running" ? `六类资源实时生成中 · 已完成 ${generated}/6` : generated ? `已生成 ${generated}/6 类资源` : definition.fallbackDescription
  }
  const review = workspace.reviews[definition.id]
  if (review) {
    const reviewLabel = review.status === "pass" ? "通过" : review.status === "warn" ? "有建议" : "未通过"
    return `${review.score} 分 · ${reviewLabel}${review.findings.length ? ` · ${review.findings.length} 条意见` : ""}`
  }
  if (definition.id === "arbiter" && workspace.decision) {
    return workspace.decision.decision === "publish"
      ? `批准发布 · 质量分 ${workspace.decision.quality_score}`
      : `定向返工 · ${workspace.decision.rework_targets.length || 3} 个目标`
  }
  return agent?.message || agent?.meta.description || definition.fallbackDescription
}

export function AgentCollaborationFlow({ workspace }: { workspace: WorkspaceState }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const agentMap = new Map(workspace.agents.map((agent) => [agent.meta.id, agent]))
  const statusMap = new Map(FLOW_NODES.map((definition) => [definition.id, agentMap.get(definition.id)?.status ?? "pending"]))
  statusMap.set("resource_generation", aggregateResourceStatus(agentMap))
  const taskStatus: AgentStatus = workspace.agents.length || workspace.status !== "idle" ? "done" : "pending"
  const publishStatus: AgentStatus = workspace.stage === "published" || workspace.decision?.decision === "publish"
    ? "done"
    : workspace.stage === "publishing"
      ? "running"
      : workspace.decision
        ? "error"
        : "pending"
  const statusOf = (id: string): AgentStatus => id === "task" ? taskStatus : id === "publish" ? publishStatus : statusMap.get(id) ?? "pending"

  return (
    <div className="mt-5 overflow-hidden rounded-[24px] border border-[#D7E2EF] bg-[#F9FBFE] shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
      <div className="flex flex-col gap-3 border-b border-[#DFE7F1] bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-[11px] font-extrabold text-[#294B73]">多智能体协作过程</div><p className="mt-0.5 text-[9px] text-[#75859A]">输入任务后，系统依次完成分析、生成、校验、决策与发布门禁；状态会随实时事件同步。</p></div>
        <div className="flex flex-wrap items-center gap-3"><div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-semibold text-[#6F7F93]"><FlowLegend color="#AEBCCE" label="等待" dashed /><FlowLegend color="#2E72D2" label="执行中" dashed active /><FlowLegend color="#2C9677" label="已完成" /></div><div className="inline-flex rounded-lg border border-[#D6E0EC] bg-[#F6F9FC] p-0.5"><button type="button" aria-label="向左查看流程" onClick={() => scrollFlow(scrollRef.current, -520)} className="grid size-7 place-items-center rounded-md text-[#61758D] hover:bg-white hover:text-[#2F66AA]"><ArrowLeft className="size-3.5" /></button><button type="button" aria-label="向右查看流程" onClick={() => scrollFlow(scrollRef.current, 520)} className="grid size-7 place-items-center rounded-md text-[#61758D] hover:bg-white hover:text-[#2F66AA]"><ArrowRight className="size-3.5" /></button></div></div>
      </div>
      <div ref={scrollRef} className="agent-flow-scroll relative cursor-grab overflow-x-auto overscroll-x-contain active:cursor-grabbing" tabIndex={0} aria-label="多智能体实时协作流程，可横向滚动查看完整流程">
        <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}><div className="agent-flow-grid pointer-events-none absolute inset-0" />
          {FLOW_COLUMNS.map((column) => <div key={column.title} className="absolute top-4 z-[3] text-center" style={{ left: column.x, width: column.width }}><div className="mx-auto w-fit min-w-[104px] rounded-2xl border px-3 py-2 shadow-[0_5px_12px_rgba(48,72,98,.08)]" style={{ backgroundColor: column.tone.background, borderColor: column.tone.border }}><div className="text-[9px] font-black tracking-[.12em]" style={{ color: column.tone.text }}>{column.step}</div><div className="mt-0.5 text-[11px] font-extrabold" style={{ color: column.tone.title }}>{column.title}</div><div className="mt-0.5 text-[8px]" style={{ color: column.tone.text }}>{column.detail}</div></div></div>)}
          <svg className="pointer-events-none absolute inset-0 z-[2]" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
            <defs><marker id="agent-flow-arrow-pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#AEBCCE" /></marker><marker id="agent-flow-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2E72D2" /></marker><marker id="agent-flow-arrow-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2C9677" /></marker><marker id="agent-flow-arrow-error" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#C35B43" /></marker></defs>
            {FLOW_EDGES.map((edge) => { const style = EDGE_STYLES[edgeState(statusOf(edge.to), statusOf(edge.from))]; return <path key={`${edge.from}-${edge.to}`} d={connectorPath(edge.from, edge.to, edge.parallel)} fill="none" stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${style.marker})`} /> })}
          </svg>
          <VirtualNode x={VIRTUAL_NODES.task.x} y={VIRTUAL_NODES.task.y} width={VIRTUAL_NODES.task.width} height={VIRTUAL_NODES.task.height} icon={BriefcaseBusiness} eyebrow="任务输入" title={workspace.topic || "岗位训练任务"} status={taskStatus} />
          {FLOW_NODES.map((definition) => <AgentFlowNode key={definition.id} definition={definition} agent={agentMap.get(definition.id)} status={statusOf(definition.id)} description={agentDescription(agentMap.get(definition.id), definition, workspace)} />)}
          <VirtualNode x={VIRTUAL_NODES.publish.x} y={VIRTUAL_NODES.publish.y} width={VIRTUAL_NODES.publish.width} height={VIRTUAL_NODES.publish.height} icon={publishStatus === "done" ? Check : LockKeyhole} eyebrow="发布门禁" title={publishStatus === "done" ? "资源已发布" : workspace.decision?.decision === "rework" ? "携带意见返工" : "等待总决策"} status={publishStatus} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#E1E8F1] bg-white px-4 py-2.5 text-[9px] text-[#718096]"><span>流程事件、Agent 状态和校验结果会实时同步到本页</span><span className="font-bold text-[#526B88]">第 {workspace.generationRound} 轮 · 10 个流程节点</span></div>
    </div>
  )
}

function scrollFlow(container: HTMLDivElement | null, left: number) {
  if (!container) return
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  container.scrollBy({ left, behavior: reduceMotion ? "auto" : "smooth" })
}

function FlowLegend({ color, label, dashed = false, active = false }: { color: string; label: string; dashed?: boolean; active?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><i className={cn("block h-0 w-7 border-t-2", dashed && "border-dashed", active && "agent-flow-legend--active")} style={{ borderColor: color }} />{label}</span>
}

function AgentFlowNode({ definition, agent, status, description }: { definition: FlowNodeDefinition; agent?: WorkspaceAgent; status: AgentStatus; description: string }) {
  const active = isActive(status)
  const Icon = definition.icon
  return <article className={cn("absolute z-10 overflow-hidden rounded-2xl border px-3.5 pb-3 pt-3 shadow-[0_8px_22px_rgba(53,76,105,.08)] transition-[border-color,box-shadow,transform] duration-300", status === "done" && "border-[#8DCAB8] shadow-[0_8px_24px_rgba(44,150,119,.12)]", active && "agent-flow-node--active -translate-y-0.5 border-[#5B91DC] shadow-[0_12px_30px_rgba(46,114,210,.20)]", status === "error" && "border-[#D99A89]", status === "pending" && "border-[#D8E1EC]")} style={{ left: definition.x, top: definition.y, width: definition.width, height: definition.height, backgroundColor: agentNodeBackground(definition.id) }} aria-label={`${agent?.meta.name || definition.fallbackName} · ${statusLabel(status)}`}>
    <span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#C35B43]" : "bg-[#D7E0EA]")} /><div className="flex items-start gap-2.5"><span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : active ? "bg-[#E8F1FF] text-[#2E72D2]" : status === "error" ? "bg-[#FBECE7] text-[#B4513C]" : "bg-[#EEF3F8] text-[#6E8299]")}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-[8px] font-extrabold tracking-[.1em] text-[#8291A4]">{definition.group}</span><strong className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-[#263C57]">{agent?.meta.name || definition.fallbackName}</strong></span></div><p className="mt-2 line-clamp-2 text-[8px] leading-3.5 text-[#75859A]">{description}</p><div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between text-[8px] font-bold"><span className={cn("inline-flex items-center gap-1", status === "done" ? "text-[#247E64]" : active ? "text-[#2E72D2]" : status === "error" ? "text-[#B4513C]" : "text-[#8A97A7]")}>{status === "done" ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : <CircleDashed className="size-3" />}{statusLabel(status)}</span><span className="text-[#A0AAB6]">{definition.id}</span></div>
  </article>
}

function agentNodeBackground(id: string) {
  if (["diagnosis", "domain_expert", "learning_strategy"].includes(id)) return "#FFF0F0"
  if (id === "resource_generation") return "#FFF3E5"
  if (["evidence_review", "practice_review", "difficulty_review"].includes(id)) return "#FFFBE6"
  if (id === "arbiter") return "#F4EEFF"
  return "#FFFFFF"
}

function VirtualNode({ x, y, width, height, icon: Icon, eyebrow, title, status }: { x: number; y: number; width: number; height: number; icon: LucideIcon; eyebrow: string; title: string; status: AgentStatus }) {
  const active = isActive(status)
  return <article className={cn("absolute z-10 flex flex-col justify-center overflow-hidden rounded-2xl border bg-white px-3 shadow-[0_8px_22px_rgba(53,76,105,.08)]", status === "done" ? "border-[#8DCAB8]" : active ? "agent-flow-node--active border-[#5B91DC]" : status === "error" ? "border-[#D99A89] bg-[#FFF8F5]" : "border-[#D8E1EC]")} style={{ left: x, top: y, width, height }}><span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#D1862F]" : "bg-[#D7E0EA]")} /><div className="flex items-center gap-2"><span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : status === "error" ? "bg-[#FFF0DA] text-[#B87527]" : "bg-[#E8F1FF] text-[#356FBF]")}><Icon className="size-4" /></span><span className="min-w-0"><small className="block text-[8px] font-extrabold tracking-[.08em] text-[#8291A4]">{eyebrow}</small><strong className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-[#263C57]">{title}</strong></span></div></article>
}
