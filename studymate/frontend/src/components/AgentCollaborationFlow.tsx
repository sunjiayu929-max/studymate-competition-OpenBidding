import { useRef } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  FileCheck2,
  FileText,
  Film,
  Gauge,
  GitCompareArrows,
  Code2,
  Loader2,
  LockKeyhole,
  Network,
  SearchCheck,
  ShieldCheck,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { WorkspaceState } from "@/store/workspace"

type WorkspaceAgent = WorkspaceState["agents"][number]
type AgentStatus = WorkspaceAgent["status"]
type EdgeState = "pending" | "active" | "done" | "error" | "rework"

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
  bend?: number
  parallel?: boolean
}

const NODE_WIDTH = 160
const NODE_HEIGHT = 124
const CANVAS_WIDTH = 1585
const CANVAS_HEIGHT = 800

const FLOW_COLUMNS = [
  { x: 18, width: 125, step: "输入", title: "训练任务", detail: "岗位目标与画像" },
  { x: 170, width: NODE_WIDTH, step: "01", title: "画像诊断", detail: "确认起点与差距" },
  { x: 365, width: NODE_WIDTH, step: "02", title: "提出观点", detail: "专业主张与学习约束" },
  { x: 560, width: NODE_WIDTH, step: "03", title: "质疑与仲裁", detail: "回应分歧并形成合同" },
  { x: 755, width: 330, step: "04", title: "生成方陈述", detail: "六类资源并行生成" },
  { x: 1095, width: NODE_WIDTH, step: "05", title: "审核方质询", detail: "三组交叉验证六类资源" },
  { x: 1270, width: NODE_WIDTH, step: "06", title: "总裁决", detail: "汇总全部证据" },
  { x: 1445, width: 120, step: "门禁", title: "发布结果", detail: "通过或定向返工" },
] as const

const FLOW_NODES: FlowNodeDefinition[] = [
  { id: "diagnosis", x: 170, y: 248, width: NODE_WIDTH, height: NODE_HEIGHT, group: "画像诊断", icon: BrainCircuit, fallbackName: "学情诊断 Agent", fallbackDescription: "定位岗位能力盲区与训练起点" },
  { id: "domain_expert", x: 365, y: 120, width: NODE_WIDTH, height: NODE_HEIGHT, group: "提出专业观点", icon: BriefcaseBusiness, fallbackName: "领域专家 Agent", fallbackDescription: "提出专业覆盖与验收要求" },
  { id: "learning_strategy", x: 365, y: 410, width: NODE_WIDTH, height: NODE_HEIGHT, group: "提出约束质疑", icon: Gauge, fallbackName: "教学策略 Agent", fallbackDescription: "平衡时间预算、难度与认知负荷" },
  { id: "plan_arbiter", x: 560, y: 265, width: NODE_WIDTH, height: NODE_HEIGHT, group: "回应与仲裁", icon: GitCompareArrows, fallbackName: "训练计划仲裁 Agent", fallbackDescription: "解决分歧并形成个性化训练合同" },
  // 七个生成 Agent 属于同一阶段，统一排成一列，避免连线被误读为资源之间的依赖。
  { id: "doc", x: 755, y: 126, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: FileText, fallbackName: "定制讲义生成 Agent", fallbackDescription: "生成带领域来源的岗位讲义" },
  { id: "guide", x: 755, y: 218, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: Wrench, fallbackName: "实操指南生成 Agent", fallbackDescription: "生成可执行、可验收的实操指南" },
  { id: "quiz", x: 755, y: 310, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: BookOpenCheck, fallbackName: "分阶测试生成 Agent", fallbackDescription: "生成匹配学情的分阶测试" },
  { id: "mindmap", x: 755, y: 402, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: Network, fallbackName: "思维导图生成 Agent", fallbackDescription: "梳理岗位任务中的概念、依赖与关系" },
  { id: "code", x: 755, y: 586, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: Code2, fallbackName: "代码案例生成 Agent", fallbackDescription: "生成适配岗位任务的代码或示例" },
  { id: "video", x: 755, y: 678, width: NODE_WIDTH, height: 86, group: "生成方陈述", icon: Film, fallbackName: "可视讲解生成 Agent", fallbackDescription: "生成带中文原生声音的岗位适配视频" },
  { id: "evidence_review", x: 1095, y: 120, width: NODE_WIDTH, height: NODE_HEIGHT, group: "审核方质询", icon: SearchCheck, fallbackName: "事实与来源审核 Agent", fallbackDescription: "交叉核对六类资源的专业依据与来源" },
  { id: "practice_review", x: 1095, y: 265, width: NODE_WIDTH, height: NODE_HEIGHT, group: "审核方质询", icon: ShieldCheck, fallbackName: "实操规范审核 Agent", fallbackDescription: "交叉检查步骤、代码、异常与安全边界" },
  { id: "difficulty_review", x: 1095, y: 410, width: NODE_WIDTH, height: NODE_HEIGHT, group: "审核方质询", icon: FileCheck2, fallbackName: "难度与覆盖审核 Agent", fallbackDescription: "交叉校准六类资源的难度与岗位覆盖" },
  { id: "arbiter", x: 1270, y: 265, width: NODE_WIDTH, height: NODE_HEIGHT, group: "发布裁决", icon: BadgeCheck, fallbackName: "总裁决 Agent", fallbackDescription: "汇总全部审核证据，决定发布或定向返工" },
]

const FLOW_EDGES: FlowEdgeDefinition[] = [
  { from: "task", to: "diagnosis" },
  { from: "diagnosis", to: "domain_expert" },
  { from: "diagnosis", to: "learning_strategy" },
  { from: "domain_expert", to: "plan_arbiter" },
  { from: "learning_strategy", to: "plan_arbiter" },
  { from: "plan_arbiter", to: "doc", parallel: true },
  { from: "plan_arbiter", to: "guide", parallel: true },
  { from: "plan_arbiter", to: "quiz", parallel: true },
  { from: "plan_arbiter", to: "mindmap", parallel: true },
  { from: "plan_arbiter", to: "code", parallel: true },
  { from: "plan_arbiter", to: "video", parallel: true },
  { from: "doc", to: "evidence_review" },
  { from: "guide", to: "evidence_review" },
  { from: "guide", to: "practice_review" },
  { from: "quiz", to: "evidence_review" },
  { from: "quiz", to: "difficulty_review" },
  { from: "mindmap", to: "evidence_review" },
  { from: "mindmap", to: "difficulty_review" },
  { from: "code", to: "practice_review" },
  { from: "code", to: "difficulty_review" },
  { from: "video", to: "evidence_review" },
  { from: "video", to: "practice_review" },
  { from: "video", to: "difficulty_review" },
  { from: "evidence_review", to: "arbiter" },
  { from: "practice_review", to: "arbiter" },
  { from: "difficulty_review", to: "arbiter" },
  { from: "arbiter", to: "publish" },
]

const VIRTUAL_NODES = {
  task: { x: 18, y: 281, width: 125, height: 92 },
  publish: { x: 1445, y: 281, width: 120, height: 92 },
} as const

const EDGE_STYLES: Record<EdgeState, { color: string; width: number; dash?: string; marker: string }> = {
  pending: { color: "#AEBCCE", width: 2, dash: "5 7", marker: "agent-flow-arrow-pending" },
  active: { color: "#2E72D2", width: 3, dash: "8 7", marker: "agent-flow-arrow-active" },
  done: { color: "#2C9677", width: 3, marker: "agent-flow-arrow-done" },
  error: { color: "#C35B43", width: 3, dash: "6 6", marker: "agent-flow-arrow-error" },
  rework: { color: "#D1862F", width: 3, dash: "9 7", marker: "agent-flow-arrow-rework" },
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
  const node = FLOW_NODES.find((item) => item.id === id) ?? VIRTUAL_NODES[id as keyof typeof VIRTUAL_NODES]
  return node
}

function connectorPath(from: string, to: string, parallel = false) {
  const source = pointFor(from)
  const target = pointFor(to)
  const startX = source.x + source.width
  const startY = source.y + source.height / 2
  const endX = target.x
  const endY = target.y + target.height / 2
  if (parallel) {
    const controlOffset = Math.max(24, (endX - startX) * 0.55)
    return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
  }
  const middleX = startX + (endX - startX) / 2
  return Math.abs(startY - endY) < 2
    ? `M ${startX} ${startY} H ${endX}`
    : `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`
}

function agentDescription(agent: WorkspaceAgent | undefined, definition: FlowNodeDefinition, workspace: WorkspaceState) {
  const review = workspace.reviews[definition.id]
  if (review) {
    const reviewLabel = review.status === "pass" ? "通过" : review.status === "warn" ? "有建议" : "未通过"
    return `${review.score} 分 · ${reviewLabel}${review.findings.length ? ` · ${review.findings.length} 条意见` : ""}`
  }
  if (definition.id === "arbiter" && workspace.decision) {
    return workspace.decision.decision === "publish"
      ? `批准发布 · 质量分 ${workspace.decision.quality_score}`
      : workspace.decision.decision === "failed"
        ? "返工已达 3 次上限 · 保留真实评分并停止发布"
        : `定向返工 · ${workspace.decision.rework_targets.length || 3} 个目标`
  }
  if (definition.id === "plan_arbiter" && workspace.outputs.training_plan) {
    const plan = workspace.outputs.training_plan
    return plan.decision === "rework"
      ? `第 ${plan.planning_round ?? 1} 轮辩论 · 决定返工`
      : "辩论通过 · 训练合同已形成"
  }
  return agent?.message || agent?.meta.description || definition.fallbackDescription
}

export function AgentCollaborationFlow({ workspace }: { workspace: WorkspaceState }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const agentMap = new Map(workspace.agents.map((agent) => [agent.meta.id, agent]))
  const statusMap = new Map(FLOW_NODES.map((definition) => [definition.id, agentMap.get(definition.id)?.status ?? "pending"]))
  const taskStatus: AgentStatus = workspace.agents.length || workspace.status !== "idle" ? "done" : "pending"
  const publishStatus: AgentStatus = workspace.stage === "published" || workspace.decision?.decision === "publish"
    ? "done"
    : workspace.stage === "publishing"
      ? "running"
      : workspace.decision
        ? "error"
        : "pending"
  const reworkTargets = new Set(workspace.reworkHistory.at(-1)?.targets ?? workspace.decision?.rework_targets ?? [])
  const showRework = workspace.reworkHistory.length > 0 || workspace.generationRound > 1 || workspace.stage === "rework" || workspace.decision?.decision === "rework"
  const planningDebateActive = workspace.stage === "planning" || workspace.stage === "plan_decision"
  const resourceDebateActive = workspace.stage === "generation" || workspace.stage === "review" || workspace.stage === "rework"

  const statusOf = (id: string): AgentStatus => {
    if (id === "task") return taskStatus
    if (id === "publish") return publishStatus
    return statusMap.get(id) ?? "pending"
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[24px] border border-[#D7E2EF] bg-[#F9FBFE] shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
      <div className="flex flex-col gap-3 border-b border-[#DFE7F1] bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-extrabold text-[#294B73]">多 Agent 辩论协作画布</div>
          <p className="mt-0.5 text-[9px] text-[#75859A]">淡蓝色区域为两轮辩论；动态连线表示观点、质疑、回应与裁决正在传递。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-semibold text-[#6F7F93]" aria-label="流程状态图例">
            <FlowLegend color="#AEBCCE" label="等待" dashed />
            <FlowLegend color="#2E72D2" label="执行中" dashed active />
            <FlowLegend color="#2C9677" label="已完成" />
            <FlowLegend color="#D1862F" label="定向返工" dashed />
          </div>
          <div className="ml-auto inline-flex rounded-lg border border-[#D6E0EC] bg-[#F6F9FC] p-0.5" aria-label="移动协作画布">
            <button type="button" aria-label="向左查看流程" onClick={() => scrollFlow(scrollRef.current, -520)} className="grid size-7 place-items-center rounded-md text-[#61758D] hover:bg-white hover:text-[#2F66AA]"><ArrowLeft className="size-3.5" /></button>
            <button type="button" aria-label="向右查看流程" onClick={() => scrollFlow(scrollRef.current, 520)} className="grid size-7 place-items-center rounded-md text-[#61758D] hover:bg-white hover:text-[#2F66AA]"><ArrowRight className="size-3.5" /></button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="agent-flow-scroll relative cursor-grab overflow-x-auto overscroll-x-contain active:cursor-grabbing" tabIndex={0} aria-label="多 Agent 实时协作流程，可横向滚动查看完整流程">
        <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          <div className="agent-flow-grid pointer-events-none absolute inset-0" />

          <DebateZone x={348} width={392} label="第1轮辩论" detail="专业观点 × 教学约束 × 计划仲裁" active={planningDebateActive} />
          <DebateZone x={738} width={517} label="第2轮辩论" detail="六类资源并行陈述 × 审核质询" active={resourceDebateActive} />

          {FLOW_COLUMNS.map((column) => (
            <div key={column.title} className="absolute top-5 z-[3] text-center" style={{ left: column.x, width: column.width }}>
              <div className="text-[9px] font-black tracking-[.12em] text-[#7D91AA]">{column.step}</div>
              <div className="mt-0.5 text-[11px] font-extrabold text-[#304760]">{column.title}</div>
              <div className="mt-0.5 text-[8px] text-[#8B99AA]">{column.detail}</div>
            </div>
          ))}

          <svg className="pointer-events-none absolute inset-0 z-[2]" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-hidden="true">
            <defs>
              <marker id="agent-flow-arrow-pending" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#AEBCCE" /></marker>
              <marker id="agent-flow-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2E72D2" /></marker>
              <marker id="agent-flow-arrow-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2C9677" /></marker>
              <marker id="agent-flow-arrow-error" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#C35B43" /></marker>
              <marker id="agent-flow-arrow-rework" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#D1862F" /></marker>
            </defs>
            {FLOW_EDGES.map((edge) => {
              const state = edgeState(statusOf(edge.to), statusOf(edge.from))
              const style = EDGE_STYLES[state]
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={connectorPath(edge.from, edge.to, edge.parallel)}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#${style.marker})`}
                  className={cn("agent-flow-edge", state === "active" && "agent-flow-edge--active", state === "error" && "agent-flow-edge--error")}
                />
              )
            })}
            {showRework && [...reworkTargets].map((targetId, index) => {
              const target = pointFor(targetId)
              if (!target) return null
              const startX = VIRTUAL_NODES.publish.x - 10
              const startY = VIRTUAL_NODES.publish.y + VIRTUAL_NODES.publish.height
              const endX = target.x + target.width / 2
              const endY = target.y + target.height
              const loopY = 730 - index * 7
              return (
                <path
                  key={`rework-${targetId}`}
                  d={`M ${startX} ${startY} V ${loopY} H ${endX} V ${endY}`}
                  fill="none"
                  stroke={EDGE_STYLES.rework.color}
                  strokeWidth={EDGE_STYLES.rework.width}
                  strokeDasharray={EDGE_STYLES.rework.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#agent-flow-arrow-rework)"
                  className="agent-flow-edge agent-flow-edge--rework"
                />
              )
            })}
          </svg>

          <VirtualNode
            x={VIRTUAL_NODES.task.x}
            y={VIRTUAL_NODES.task.y}
            width={VIRTUAL_NODES.task.width}
            height={VIRTUAL_NODES.task.height}
            icon={BriefcaseBusiness}
            eyebrow="任务输入"
            title={workspace.topic || "岗位训练任务"}
            status={taskStatus}
          />

          {FLOW_NODES.map((definition) => {
            const agent = agentMap.get(definition.id)
            return (
              <AgentFlowNode
                key={definition.id}
                definition={definition}
                agent={agent}
                description={agentDescription(agent, definition, workspace)}
              />
            )
          })}

          <VirtualNode
            x={VIRTUAL_NODES.publish.x}
            y={VIRTUAL_NODES.publish.y}
            width={VIRTUAL_NODES.publish.width}
            height={VIRTUAL_NODES.publish.height}
            icon={publishStatus === "done" ? Check : LockKeyhole}
            eyebrow={workspace.decision && workspace.decision.decision !== "publish" ? "未通过门禁" : "发布门禁"}
            title={publishStatus === "done"
              ? "训练资源已发布"
              : workspace.decision?.decision === "failed"
                ? "达到返工上限，停止发布"
                : workspace.decision?.decision === "rework"
                  ? "携带意见返工"
                  : "等待总裁决"}
            status={publishStatus}
          />

          {showRework && (
            <div className="absolute bottom-2 left-[770px] rounded-full border border-[#E7C99E] bg-[#FFF8EB] px-3 py-1 text-[9px] font-bold text-[#A86C22]">
              已返工 {workspace.reworkHistory.length} 次 · 审核意见返回对应 Agent
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#E1E8F1] bg-white px-4 py-2.5 text-[9px] text-[#718096]">
        <span>左右拖动查看完整协作链 · 六类资源的审核证据最终汇聚到总裁决 Agent</span>
        <span className="font-bold text-[#526B88]">第 {workspace.generationRound} 轮 · {workspace.agents.length || 15} 个协作节点</span>
      </div>
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

function DebateZone({ x, width, label, detail, active }: { x: number; width: number; label: string; detail: string; active: boolean }) {
  return (
    <>
      <div
        className={cn("agent-debate-zone pointer-events-none absolute top-[72px] z-[1] h-[704px] rounded-[24px] border border-[#BFD7F1] bg-[#EAF4FF]/70", active && "agent-debate-zone--active")}
        style={{ left: x, width }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute z-[20] flex items-center gap-2 rounded-full border border-[#B5D1EE] bg-[#F7FBFF] px-3 py-1 shadow-sm" style={{ left: x + 12, top: 82 }} aria-hidden="true">
        <GitCompareArrows className="size-3 text-[#3372B8]" />
        <strong className="text-[9px] text-[#245C99]">{label}</strong>
        <span className="text-[8px] text-[#6D87A5]">{detail}</span>
      </div>
    </>
  )
}

function AgentFlowNode({ definition, agent, description }: { definition: FlowNodeDefinition; agent?: WorkspaceAgent; description: string }) {
  const status = agent?.status ?? "pending"
  const active = isActive(status)
  const compact = definition.group === "生成方陈述"
  const Icon = definition.icon
  return (
    <article
      className={cn(
        "absolute z-10 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_22px_rgba(53,76,105,.08)] transition-[border-color,box-shadow,transform] duration-300",
        compact ? "px-2.5 pb-2 pt-2" : "px-3.5 pb-3 pt-3",
        status === "done" && "border-[#8DCAB8] shadow-[0_8px_24px_rgba(44,150,119,.12)]",
        active && "agent-flow-node--active -translate-y-0.5 border-[#5B91DC] shadow-[0_12px_30px_rgba(46,114,210,.20)]",
        status === "error" && "border-[#D99A89] bg-[#FFFDFC] shadow-[0_10px_26px_rgba(195,91,67,.13)]",
        status === "pending" && "border-[#D8E1EC]",
      )}
      style={{ left: definition.x, top: definition.y, width: definition.width, height: definition.height }}
      aria-label={`${agent?.meta.name || definition.fallbackName}，${statusLabel(status)}`}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#C35B43]" : "bg-[#D7E0EA]")} />
      <div className="flex items-start gap-2.5">
        <span className={cn(compact ? "grid size-7 shrink-0 place-items-center rounded-lg" : "grid size-8 shrink-0 place-items-center rounded-xl", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : active ? "bg-[#E8F1FF] text-[#2E72D2]" : status === "error" ? "bg-[#FBECE7] text-[#B4513C]" : "bg-[#EEF3F8] text-[#6E8299]")}>
          <Icon className={compact ? "size-3.5" : "size-4"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-extrabold tracking-[.1em] text-[#8291A4]", compact ? "text-[7px]" : "text-[8px]")}>{definition.group}</span>
          <strong className={cn("mt-0.5 block line-clamp-2 text-[#263C57]", compact ? "text-[9px] leading-3.5" : "text-[10px] leading-4")}>{agent?.meta.name || definition.fallbackName}</strong>
        </span>
      </div>
      <p className={cn("line-clamp-1 text-[#75859A]", compact ? "mt-1 text-[7px] leading-3" : "mt-2 text-[8px] leading-3.5")}>{description}</p>
      <div className={cn("absolute flex items-center justify-between font-bold", compact ? "bottom-2 left-2.5 right-2.5 text-[7px]" : "bottom-2.5 left-3.5 right-3.5 text-[8px]")}>
        <span className={cn("inline-flex items-center gap-1", status === "done" ? "text-[#247E64]" : active ? "text-[#2E72D2]" : status === "error" ? "text-[#B4513C]" : "text-[#8A97A7]")}>
          {status === "done" ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : status === "error" ? <CircleDashed className="size-3" /> : <CircleDashed className="size-3" />}
          {statusLabel(status)}
        </span>
        <span className="text-[#A0AAB6]">{definition.id}</span>
      </div>
    </article>
  )
}

function VirtualNode({ x, y, width, height, icon: Icon, eyebrow, title, status }: { x: number; y: number; width: number; height: number; icon: LucideIcon; eyebrow: string; title: string; status: AgentStatus }) {
  const active = isActive(status)
  return (
    <article
      className={cn(
        "absolute z-10 flex flex-col justify-center overflow-hidden rounded-2xl border bg-white px-3 shadow-[0_8px_22px_rgba(53,76,105,.08)]",
        status === "done" ? "border-[#8DCAB8]" : active ? "agent-flow-node--active border-[#5B91DC]" : status === "error" ? "border-[#D99A89] bg-[#FFF8F5]" : "border-[#D8E1EC]",
      )}
      style={{ left: x, top: y, width, height }}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", status === "done" ? "bg-[#2C9677]" : active ? "bg-[#2E72D2]" : status === "error" ? "bg-[#D1862F]" : "bg-[#D7E0EA]")} />
      <div className="flex items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", status === "done" ? "bg-[#E4F4EE] text-[#247E64]" : status === "error" ? "bg-[#FFF0DA] text-[#B87527]" : "bg-[#E8F1FF] text-[#356FBF]")}><Icon className="size-4" /></span>
        <span className="min-w-0"><small className="block text-[8px] font-extrabold tracking-[.08em] text-[#8291A4]">{eyebrow}</small><strong className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-[#263C57]">{title}</strong></span>
      </div>
    </article>
  )
}
