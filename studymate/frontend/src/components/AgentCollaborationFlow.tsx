import { useEffect, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
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

const NODE_WIDTH = 205
const NODE_HEIGHT = 142
const CANVAS_WIDTH = 1780
const CANVAS_HEIGHT = 610

const FLOW_COLUMNS = [
  { x: 18, width: 160, step: "输入", title: "训练任务", detail: "岗位目标与当前学情", tone: { background: "#F2F6FA", border: "#C8D4DF", text: "#587087", title: "#2F4D68" } },
  { x: 235, width: 500, step: "01", title: "分析", detail: "学情诊断 · 领域专家 · 教学策略", tone: { background: "#F0D6D3", border: "#CC8F8A", text: "#874746", title: "#5B2F33" } },
  { x: 800, width: 205, step: "02", title: "生成", detail: "六类资源统一生成", tone: { background: "#F5DEBD", border: "#C99F68", text: "#7B511C", title: "#573710" } },
  { x: 1080, width: 220, step: "03", title: "校验", detail: "三项交叉校验", tone: { background: "#F0E6B9", border: "#C2B163", text: "#6C5A17", title: "#4E420D" } },
  { x: 1360, width: 205, step: "04", title: "决策", detail: "汇总证据并决策", tone: { background: "#E3D8F1", border: "#B19ACB", text: "#614B77", title: "#443251" } },
  { x: 1600, width: 160, step: "门禁", title: "发布门禁", detail: "通过或自动返工", tone: { background: "#EEF5F1", border: "#C5D8CF", text: "#58776A", title: "#35594A" } },
] as const

const FLOW_NODES: FlowNodeDefinition[] = [
  { id: "diagnosis", x: 245, y: 275, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: BrainCircuit, fallbackName: "学情诊断 Agent", fallbackDescription: "定位岗位能力盲区与训练起点" },
  { id: "domain_expert", x: 510, y: 110, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: BriefcaseBusiness, fallbackName: "领域专家 Agent", fallbackDescription: "提出专业覆盖与验收要求" },
  { id: "learning_strategy", x: 510, y: 440, width: NODE_WIDTH, height: NODE_HEIGHT, group: "01 · 分析", icon: Gauge, fallbackName: "教学策略 Agent", fallbackDescription: "平衡时间预算、难度与认知负荷" },
  { id: "resource_generation", x: 800, y: 275, width: NODE_WIDTH, height: NODE_HEIGHT, group: "02 · 生成", icon: Sparkles, fallbackName: "资源生成 Agent", fallbackDescription: "统一生成六类岗位训练资源" },
  { id: "evidence_review", x: 1085, y: 110, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: SearchCheck, fallbackName: "事实与来源校验 Agent", fallbackDescription: "交叉核对资源依据、引用与来源" },
  { id: "practice_review", x: 1085, y: 275, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: ShieldCheck, fallbackName: "实操规范校验 Agent", fallbackDescription: "检查步骤、代码、异常与安全边界" },
  { id: "difficulty_review", x: 1085, y: 440, width: NODE_WIDTH, height: NODE_HEIGHT, group: "03 · 校验", icon: FileCheck2, fallbackName: "难度与覆盖校验 Agent", fallbackDescription: "校准资源难度与岗位能力覆盖" },
  { id: "arbiter", x: 1360, y: 275, width: NODE_WIDTH, height: NODE_HEIGHT, group: "04 · 决策", icon: BadgeCheck, fallbackName: "总决策 Agent", fallbackDescription: "汇总三项校验证据并决策发布或返工" },
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
  task: { x: 18, y: 291, width: 160, height: 110 },
  publish: { x: 1600, y: 291, width: 160, height: 110 },
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  // Fit the complete graph to its container; no zoom, panning or wheel capture.
  const scale = Math.min(width / CANVAS_WIDTH, 340 / CANVAS_HEIGHT)
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
    <div className={cn("agent-flow-shell mt-5 overflow-hidden rounded-[24px] border border-[#D7E2EF] bg-[#F9FBFE] shadow-[inset_0_1px_0_rgba(255,255,255,.9)]", workspace.status === "running" && "is-running")}>
      <div className="flex flex-col gap-3 border-b border-[#DFE7F1] bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-base font-extrabold text-[#294B73]">02 · 多智能体协作过程</div><p className="mt-1 text-[13px] text-[#64758A]">任务沿分析、生成、校验、决策与发布门禁实时流转。</p></div>
        <div className="flex flex-wrap items-center gap-3"><div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-[#5D7088]"><FlowLegend color="#AEBCCE" label="等待" dashed /><FlowLegend color="#2E72D2" label="执行中" dashed active /><FlowLegend color="#2C9677" label="已完成" /></div></div>
      </div>
      <div ref={containerRef} className="agent-flow-fit relative w-full bg-[#FBFCFD]" style={{ height: width ? CANVAS_HEIGHT * scale : undefined, aspectRatio: width ? undefined : `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }} role="group" aria-label="多智能体实时协作流程">
        <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left", marginLeft: Math.max(0, (width - CANVAS_WIDTH * scale) / 2) }}><div className="agent-flow-grid pointer-events-none absolute inset-0" />
          {FLOW_COLUMNS.map((column) => <div key={column.title} className="absolute top-5 z-[3] text-center" style={{ left: column.x, width: column.width }}><div className="mx-auto w-fit min-w-[126px] rounded-[14px] border px-4 py-2.5 shadow-[0_4px_10px_rgba(48,72,98,.07)]" style={{ backgroundColor: column.tone.background, borderColor: column.tone.border }}><div className="text-[11px] font-black tracking-[.1em]" style={{ color: column.tone.text }}>{column.step}</div><div className="mt-0.5 text-[14px] font-extrabold" style={{ color: column.tone.title }}>{column.title}</div><div className="mt-1 text-[11px]" style={{ color: column.tone.text }}>{column.detail}</div></div></div>)}
          <svg className="pointer-events-none absolute inset-0 z-[2]" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
            <defs><linearGradient id="agent-energy-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#568EDB" /><stop offset="38%" stopColor="#63D5F5" /><stop offset="56%" stopColor="#E5FAFF" /><stop offset="74%" stopColor="#7D72EC" /><stop offset="100%" stopColor="#568EDB" /></linearGradient><marker id="agent-flow-arrow-pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#AEBCCE" /></marker><marker id="agent-flow-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2E72D2" /></marker><marker id="agent-flow-arrow-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2C9677" /></marker><marker id="agent-flow-arrow-error" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#C35B43" /></marker></defs>
            {FLOW_EDGES.map((edge) => { const style = EDGE_STYLES[edgeState(statusOf(edge.to), statusOf(edge.from))]; return <path className="agent-flow-edge" key={`${edge.from}-${edge.to}`} d={connectorPath(edge.from, edge.to, edge.parallel)} fill="none" stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${style.marker})`} /> })}
          </svg>
          <VirtualNode x={VIRTUAL_NODES.task.x} y={VIRTUAL_NODES.task.y} width={VIRTUAL_NODES.task.width} height={VIRTUAL_NODES.task.height} icon={BriefcaseBusiness} eyebrow="任务输入" title={workspace.topic || "岗位训练任务"} status={taskStatus} />
          {FLOW_NODES.map((definition) => <AgentFlowNode key={definition.id} definition={definition} agent={agentMap.get(definition.id)} status={statusOf(definition.id)} description={agentDescription(agentMap.get(definition.id), definition, workspace)} />)}
          <VirtualNode x={VIRTUAL_NODES.publish.x} y={VIRTUAL_NODES.publish.y} width={VIRTUAL_NODES.publish.width} height={VIRTUAL_NODES.publish.height} icon={publishStatus === "done" ? Check : LockKeyhole} eyebrow="发布门禁" title={publishStatus === "done" ? "资源已发布" : workspace.decision?.decision === "rework" ? "携带意见返工" : "等待总决策"} status={publishStatus} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#E1E8F1] bg-white px-4 py-3 text-xs text-[#65768C]"><span>流程事件与校验结果实时同步</span><span className="font-bold text-[#526B88]">第 {workspace.generationRound} 轮 · 10 个流程节点</span></div>
    </div>
  )
}

function FlowLegend({ color, label, dashed = false, active = false }: { color: string; label: string; dashed?: boolean; active?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><i className={cn("block h-0 w-7 border-t-2", dashed && "border-dashed", active && "agent-flow-legend--active")} style={{ borderColor: color }} />{label}</span>
}

function AgentFlowNode({ definition, agent, status, description }: { definition: FlowNodeDefinition; agent?: WorkspaceAgent; status: AgentStatus; description: string }) {
  const active = isActive(status)
  const Icon = definition.icon
  return <article className={cn("absolute z-10 overflow-hidden rounded-2xl border px-3.5 pb-3 pt-3 shadow-[0_8px_22px_rgba(53,76,105,.08)] transition-[border-color,box-shadow,transform] duration-300", status === "done" && "border-[#8DCAB8] shadow-[0_8px_24px_rgba(44,150,119,.12)]", active && "agent-flow-node--active -translate-y-0.5 border-[#5B91DC] shadow-[0_12px_30px_rgba(46,114,210,.20)]", status === "error" && "border-[#D99A89]", status === "pending" && "border-[#D8E1EC]")} style={{ left: definition.x, top: definition.y, width: definition.width, height: definition.height, backgroundColor: agentNodeBackground(definition.id) }} aria-label={`${agent?.meta.name || definition.fallbackName} · ${statusLabel(status)}`}>
    <span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#C35B43]" : "bg-[#D7E0EA]")} /><div className="flex items-start gap-3"><span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : active ? "bg-[#E8F1FF] text-[#2E72D2]" : status === "error" ? "bg-[#FBECE7] text-[#B4513C]" : "bg-[#EEF3F8] text-[#6E8299]")}><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-extrabold tracking-[.06em] text-[#657992]">{definition.group}</span><strong className="mt-1 block line-clamp-2 text-[15px] leading-5 text-[#172F4B]">{agent?.meta.name || definition.fallbackName}</strong></span></div><p className="mt-2.5 line-clamp-2 text-[12px] leading-5 text-[#526981]">{description}</p><div className="absolute bottom-3 left-3.5 right-3.5 text-[11px] font-bold"><span className={cn("inline-flex items-center gap-1.5", status === "done" ? "text-[#247E64]" : active ? "text-[#2E72D2]" : status === "error" ? "text-[#B4513C]" : "text-[#687B91]")}>{status === "done" ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDashed className="size-3.5" />}{statusLabel(status)}</span></div>
  </article>
}

function agentNodeBackground(id: string) {
  if (["diagnosis", "domain_expert", "learning_strategy"].includes(id)) return "#F5DFDC"
  if (id === "resource_generation") return "#F7E6CC"
  if (["evidence_review", "practice_review", "difficulty_review"].includes(id)) return "#F4EDC9"
  if (id === "arbiter") return "#EAE2F3"
  return "#FFFFFF"
}

function VirtualNode({ x, y, width, height, icon: Icon, eyebrow, title, status }: { x: number; y: number; width: number; height: number; icon: LucideIcon; eyebrow: string; title: string; status: AgentStatus }) {
  const active = isActive(status)
  return <article className={cn("absolute z-10 flex flex-col justify-center overflow-hidden rounded-[14px] border bg-white px-4 shadow-[0_6px_16px_rgba(53,76,105,.08)]", status === "done" ? "border-[#8DCAB8]" : active ? "agent-flow-node--active border-[#5B91DC]" : status === "error" ? "border-[#D99A89] bg-[#FFF8F5]" : "border-[#D8E1EC]")} style={{ left: x, top: y, width, height }}><span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#D1862F]" : "bg-[#D7E0EA]")} /><div className="flex items-center gap-3"><span className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : status === "error" ? "bg-[#FFF0DA] text-[#B87527]" : "bg-[#E8F1FF] text-[#356FBF]")}><Icon className="size-5" /></span><span className="min-w-0"><small className="block text-[11px] font-extrabold tracking-[.06em] text-[#657992]">{eyebrow}</small><strong className="mt-1 block line-clamp-2 text-[15px] leading-5 text-[#172F4B]">{title}</strong></span></div></article>
}
