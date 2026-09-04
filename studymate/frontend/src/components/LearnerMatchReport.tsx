import { type WheelEvent, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  Flag,
  Lock,
  Network,
  Radar,
  Route,
  Sparkles,
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
import { InteractiveCanvas } from "@/components/InteractiveCanvas"

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

function passLockedCanvasWheelToPage(event: WheelEvent<HTMLDivElement>) {
  if (!(event.target as HTMLElement).closest(".interactive-canvas.is-scale-locked")) return
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
  document.scrollingElement?.scrollBy({ top: event.deltaY * multiplier, left: event.deltaX * multiplier, behavior: "auto" })
}

export function LearnerMatchReport(props: LearnerMatchReportProps) {
  const report = buildReport(props)
  const [selectedNodeId, setSelectedNodeId] = useState("")
  const [selectedPathId, setSelectedPathId] = useState("")
  const selectedNode = report.knowledgeNodes.find((node) => node.id === selectedNodeId) ?? report.knowledgeNodes[0]
  const pathCapabilities = props.capabilities.length ? props.capabilities : [{ id: "report-start", name: "建立目标岗位路径", level: 0, state: "ready" as const, task: "选择目标岗位后，系统会生成对应的能力节点与训练路线。", prerequisites: [] }]
  const selectedPath = pathCapabilities.find((node) => node.id === selectedPathId) ?? pathCapabilities.find((node) => node.state === "current") ?? pathCapabilities[0]
  return (
    <section id="learner-match-report" className="learner-signal-report mb-4 scroll-mt-24">
      <header className="learner-signal-identity flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div>
          <span className="learner-signal-kicker"><Radar className="size-3.5" /> LEARNER SIGNAL / RESOURCE SIGNAL</span>
          <h2 className="mt-1 text-lg font-black tracking-[-.025em] text-[#17354A] sm:text-xl">双轨信号匹配台 <small className="ml-2 text-[10px] font-bold tracking-normal text-[#517488]">画像、测评与训练记录联合对齐</small></h2>
        </div>
        <div className="learner-signal-live"><span /><div><b>画像信号在线</b><small>证据与资源持续同步</small></div></div>
      </header>

      <div className="learner-signal-stagebar" aria-label="报告生成流程"><span className="is-done">01 <b>画像采样</b></span><i /><span className="is-live">02 <b>双轨匹配</b></span><i /><span>03 <b>路径输出</b></span><i /><span>04 <b>训练验收</b></span></div>

      <div className="learner-signal-content">
        <section className="learner-signal-summary" aria-label="核心匹配结论">
          <div className="learner-signal-metrics" aria-label="报告关键指标">
            <SignalMetric label="理论证据" value={`${Math.round(props.theoryScore ?? props.diagnosis?.knowledge_score ?? 0)}%`} detail="测评与诊断加权" tone="blue" />
            <SignalMetric label="已确认差距" value={String(report.knowledgeNodes.filter((node) => node.status === "gap").length)} detail="优先进入训练路径" tone="amber" />
            <SignalMetric label="资源已就绪" value={`${props.resources.filter((item) => item.ready).length}/${props.resources.length}`} detail="讲义 / 实操 / 测试" tone="green" />
            <SignalMetric label="路径节点" value={String(pathCapabilities.length)} detail="按前置关系编排" tone="violet" />
          </div>
          <aside className="learner-signal-conclusion learner-signal-conclusion--compact">
            <span><Sparkles className="size-4" /> 即时匹配结论</span>
            <h3>先补齐首要差距，再沿能力前置关系逐级验收。</h3>
            <p>{report.knowledgeNodes.filter((node) => node.status === "gap").length ? `已定位 ${report.knowledgeNodes.filter((node) => node.status === "gap").length} 个明确差距，推荐资源已重排。` : "暂无已确认盲区，继续通过实操采集证据。"}</p>
            <Link to="/competency">开始训练 <ArrowRight className="size-4" /></Link>
          </aside>
        </section>

        <article className="learner-signal-module learner-signal-scan">
          <ReportHeading image="/images/learner-resource-matching-coupler-v1.png" index="01" title="画像 × 资源双轨映射" description="左侧学习者证据与右侧训练资源经由中央信号核完成匹配；点击节点查看依据与处理动作。" />
          <div className="learner-signal-map-layout mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div onWheelCapture={passLockedCanvasWheelToPage}><InteractiveCanvas canvasWidth={820} canvasHeight={450} viewportHeight={410} label="画像与资源双轨映射" className="learner-signal-canvas">
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
                  return <path className="learner-signal-edge" key={`edge-${node.id}`} d={`M 410 225 C ${(410 + startX) / 2} 225, ${(410 + startX) / 2} ${startY}, ${startX} ${startY}`} fill="none" stroke="#7D9FB5" strokeWidth="2.5" strokeDasharray="7 7" />
                })}
                <foreignObject x="326" y="176" width="168" height="98"><div className="grid h-full place-items-center rounded-[20px] border-2 border-[#6E8CAB] bg-white px-4 text-center shadow-[0_8px_18px_rgba(48,72,98,.11)]"><div><Network className="mx-auto size-5 text-[#456A90]" /><strong className="mt-2 block text-[12px] text-[#2D435A]">当前知识结构</strong></div></div></foreignObject>
                {report.knowledgeNodes.map((node, index) => {
                  const point = NODE_POSITIONS[index]
                  if (!point) return null
                  const meta = STATUS_META[node.status]
                  const nodeClass = cn("block h-full w-full rounded-[16px] border px-3 text-left shadow-[0_5px_14px_rgba(48,72,98,.07)] transition hover:-translate-y-0.5", meta.card, selectedNode?.id === node.id && "ring-2 ring-[#577FA7]/25")
                  const nodeContent = <><span className="flex items-center gap-1.5 text-xs font-bold"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}{node.status === "gap" && <ArrowRight className="ml-auto size-3" />}</span><strong className="mt-2 block line-clamp-2 text-sm leading-5">{node.name}</strong></>
                  return <foreignObject key={node.id} x={point.x} y={point.y} width="164" height="86">{node.status === "gap" ? <Link to={`/competency?topic=${encodeURIComponent(node.name)}&source=knowledge-gap#training-focus`} onClick={() => setSelectedNodeId(node.id)} aria-label={`学习知识盲区：${node.name}`} className={nodeClass}>{nodeContent}</Link> : <button type="button" onClick={() => setSelectedNodeId(node.id)} className={nodeClass}>{nodeContent}</button>}</foreignObject>
                })}
              </svg>
            </InteractiveCanvas></div>

            {selectedNode && <aside className={cn("learner-signal-gap-card", `is-${selectedNode.status}`)}><div className="learner-signal-gap-status"><span className={cn("size-2 rounded-full", STATUS_META[selectedNode.status].dot)} /><span>{STATUS_META[selectedNode.status].label}</span></div><h3 className="learner-signal-gap-title">{selectedNode.name}</h3><div className="learner-signal-evidence"><span>定位依据</span><p>{selectedNode.evidence}</p></div><div className="learner-signal-advice"><span>建议动作</span><p>{selectedNode.nextStep}</p></div>{selectedNode.status === "gap" && <Link to={`/competency?topic=${encodeURIComponent(selectedNode.name)}&source=knowledge-gap#training-focus`} className="learner-signal-gap-action">学习此主题<ArrowRight className="size-3.5" /></Link>}</aside>}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[9px] text-[#718090]">{(["gap", "verify", "supported"] as KnowledgeNodeStatus[]).map((status) => <span key={status} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", STATUS_META[status].dot)} />{STATUS_META[status].label}</span>)}</div>
        </article>

        <SignalTransition from="画像证据" to="难度校准" variant="converge" />

        <article className="learner-signal-module learner-signal-module--curve">
          <ReportHeading image="/images/learner-module-difficulty-calibrator-v1.png" index="02" title="资源难度匹配曲线" description="蓝色区域表示适宜难度范围，资源曲线随学习阶段逐步提升，并保持在合理训练负荷内。" />
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

        <SignalTransition from="匹配曲线" to="路径编排" variant="relay" />

        <article className="learner-signal-module learner-signal-module--route learner-signal-scan">
          <ReportHeading image="/images/learner-module-route-navigator-v1.png" index="03" title="学习路径规划图" description="路径根据当前知识盲区、能力前置关系和已有训练计划动态生成。" />
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_188px] xl:items-center">
            <div className="min-w-0">
              <ReportPathMap
                capabilities={pathCapabilities}
                targetRoleName={props.targetRoleName}
                selectedId={selectedPath?.id}
                onSelect={setSelectedPathId}
              />
              <ReportPathProgress capabilities={pathCapabilities} targetRoleName={props.targetRoleName} />
            </div>
            <Link to="/competency" className="learner-signal-route-cta group inline-flex min-h-24 items-center justify-center gap-2 rounded-[18px] border border-[#B9CBE4] bg-[linear-gradient(145deg,#244C80,#315E9C)] px-4 text-center text-xs font-bold text-white shadow-[0_12px_24px_rgba(36,76,128,.2)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(36,76,128,.28)]"><span><span className="grid mx-auto mb-2 size-9 place-items-center rounded-xl bg-white/15"><Route className="size-4" /></span><span className="block">开始今日学习</span><span className="mt-1 block text-[9px] font-medium text-[#CFE2FF]">进入岗位训练中心</span></span><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link>
          </div>
          {selectedPath && <div className="learner-signal-selected-path"><div className="flex flex-wrap items-center justify-between gap-2"><span>当前路径节点 · {selectedPath.level >= 3 ? "已验收" : selectedPath.state === "current" ? "本轮训练" : "待完成"}</span><strong>{selectedPath.name}</strong></div><p>{selectedPath.task}</p></div>}
        </article>

        <SignalTransition from="能力路径" to="资源投送" variant="dispatch" />

        <div>
          <article className="learner-signal-module learner-signal-module--resources">
            <ReportHeading image="/images/learner-module-resource-pod-v1.png" index="04" title="资源推荐清单" description="资源状态、质量分和处理动作分离展示，避免推荐依据被操作按钮淹没。" />
            <div className="learner-signal-resource-grid">{props.resources.map((resource) => <div key={resource.id} className={cn("learner-signal-resource", resource.ready ? "is-ready-card" : "is-waiting-card")}><span className="learner-signal-resource-icon"><img src={`/images/resource-icon-${resource.id}-v1.png`} alt="" /></span><div><strong>{resource.title}</strong><small>{resource.id === "doc" ? "建立概念与岗位语境" : resource.id === "guide" ? "完成场景化实操迁移" : "验证掌握与迁移效果"}</small></div><span className={resource.ready ? "is-ready" : "is-waiting"}>{resource.ready ? "已就绪" : "生成中"}</span><b>{resource.reviewScore ? `${Math.round(resource.reviewScore)} 分` : "待审核"}</b></div>)}</div>
          </article>
        </div>

      </div>
    </section>
  )
}

const REPORT_ROUTE_META: Record<ReportCapability["state"], { fill: string; stroke: string; label: string }> = {
  mastered: { fill: "#F0F7F3", stroke: "#477A68", label: "已验收" },
  developing: { fill: "#FBF6EA", stroke: "#9A7336", label: "待补强" },
  current: { fill: "#EEF3F8", stroke: "#456A8E", label: "本轮训练" },
  ready: { fill: "#F7F7F4", stroke: "#7C858D", label: "可以开始" },
  locked: { fill: "#F4F4F2", stroke: "#9A9D9F", label: "前置未完成" },
}

interface RoutePoint {
  x: number
  y: number
}

interface RouteLayoutNode {
  id: string
  point: RoutePoint
  depth: number
  capability?: ReportCapability
  assessment?: boolean
}

const ROUTE_NODE_WIDTH = 196
const ROUTE_NODE_HEIGHT = 112
const ROUTE_COLUMN_GAP = 270
const ROUTE_ROW_GAP = 148
const ROUTE_START_X = 118
const ROUTE_START_Y = 106

function buildReportRouteLayout(capabilities: ReportCapability[]) {
  const nodeById = new Map(capabilities.map((node) => [node.id, node]))
  const depthById = new Map<string, number>()

  const getDepth = (id: string, visiting = new Set<string>()): number => {
    const cached = depthById.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    const node = nodeById.get(id)
    if (!node) return 0
    const nextVisiting = new Set(visiting).add(id)
    const depth = node.prerequisites
      .filter((prerequisiteId) => nodeById.has(prerequisiteId))
      .reduce((maxDepth, prerequisiteId) => Math.max(maxDepth, getDepth(prerequisiteId, nextVisiting) + 1), 0)
    depthById.set(id, depth)
    return depth
  }

  capabilities.forEach((node) => getDepth(node.id))
  const prerequisiteIds = new Set(capabilities.flatMap((node) => node.prerequisites.filter((id) => nodeById.has(id))))
  const leafIds = capabilities.filter((node) => !prerequisiteIds.has(node.id)).map((node) => node.id)
  const assessmentDepth = leafIds.length ? Math.max(...leafIds.map((id) => depthById.get(id) ?? 0)) + 1 : 0
  const routeNodes: Array<Omit<RouteLayoutNode, "point">> = [
    ...capabilities.map((node) => ({ id: node.id, depth: depthById.get(node.id) ?? 0, capability: node })),
    { id: "final-assessment", depth: assessmentDepth, assessment: true },
  ]
  const maxDepth = Math.max(...routeNodes.map((node) => node.depth), 0)
  const columns = Array.from({ length: maxDepth + 1 }, (_, depth) => routeNodes.filter((node) => node.depth === depth))
  const maxRows = Math.max(...columns.map((column) => column.length), 1)
  const positionedNodes: RouteLayoutNode[] = []

  columns.forEach((column, depth) => {
    const verticalOffset = (maxRows - column.length) / 2
    column.forEach((node, row) => positionedNodes.push({
      ...node,
      point: {
        x: ROUTE_START_X + depth * ROUTE_COLUMN_GAP,
        y: ROUTE_START_Y + (verticalOffset + row) * ROUTE_ROW_GAP,
      },
    }))
  })

  return {
    nodes: positionedNodes,
    leafIds,
    width: Math.max(1100, ROUTE_START_X * 2 + (maxDepth + 1) * ROUTE_COLUMN_GAP),
    height: Math.max(380, ROUTE_START_Y * 2 + maxRows * ROUTE_ROW_GAP),
  }
}

function SignalMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className={`learner-signal-metric learner-signal-metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small><i /></div>
}

function SignalTransition({ from, to, variant }: { from: string; to: string; variant: "converge" | "relay" | "dispatch" }) {
  const meta = {
    converge: { asset: "/images/learner-transition-survey-aircraft-v1.png", label: "SURVEY CALIBRATION · 01" },
    relay: { asset: "/images/learner-transition-route-jet-v1.png", label: "ROUTE ALIGNMENT · 02" },
    dispatch: { asset: "/images/learner-transition-cargo-evtol-v1.png", label: "RESOURCE DELIVERY · 03" },
  }[variant]
  return <div className={`learner-signal-transition learner-signal-transition--${variant}`} aria-label={`${from}到${to}`}>
    <span className="learner-signal-transition-end is-origin"><small>DEPARTURE</small><strong>{from}</strong></span>
    <div className="learner-signal-flight-lane" aria-hidden="true">
      <i className="is-outbound" /><i className="is-return" /><b>{meta.label}</b>
      <img className="is-outbound" src={meta.asset} alt="" decoding="async" />
      <img className="is-return" src={meta.asset} alt="" decoding="async" />
    </div>
    <span className="learner-signal-transition-end is-destination"><small>ARRIVAL</small><strong>{to}</strong></span>
  </div>
}

export function ReportPathMap({ capabilities, targetRoleName, selectedId, onSelect }: { capabilities: ReportCapability[]; targetRoleName: string; selectedId?: string; onSelect: (id: string) => void }) {
  const layout = buildReportRouteLayout(capabilities)
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]))
  const finalReady = capabilities.length > 0 && capabilities.every((node) => node.level >= 3)
  const assessment = nodeById.get("final-assessment")

  const edgePath = (source: RoutePoint, target: RoutePoint) => {
    const startX = source.x + ROUTE_NODE_WIDTH / 2
    const endX = target.x - ROUTE_NODE_WIDTH / 2
    const controlOffset = Math.max(42, (endX - startX) / 2)
    return `M ${startX} ${source.y} C ${startX + controlOffset} ${source.y}, ${endX - controlOffset} ${target.y}, ${endX} ${target.y}`
  }

  return <div onWheelCapture={passLockedCanvasWheelToPage}><InteractiveCanvas canvasWidth={layout.width} canvasHeight={layout.height} viewportHeight={400} label={`${targetRoleName || "目标岗位"}路径地图`} className="rounded-[18px] border border-[#D7DEE8] bg-white">
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label={`${targetRoleName || "目标岗位"}路径地图`}>
      <defs>
        <pattern id="learner-report-route-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#DDE7F2" strokeWidth="1" opacity=".55" /></pattern>
        <marker id="learner-report-route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9AAFC7" /></marker>
        <linearGradient id="route-energy-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6E9DCA" /><stop offset="42%" stopColor="#72C7F3" /><stop offset="58%" stopColor="#D8F5FF" /><stop offset="74%" stopColor="#7186E8" /><stop offset="100%" stopColor="#6E9DCA" /></linearGradient>
      </defs>
      <rect width={layout.width} height={layout.height} fill="url(#learner-report-route-grid)" />
      {capabilities.flatMap((node) => node.prerequisites.map((sourceId) => {
        const source = nodeById.get(sourceId)
        const target = nodeById.get(node.id)
        if (!source || !target) return null
        return <path className="route-flow-line" key={`${sourceId}-${node.id}`} d={edgePath(source.point, target.point)} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={node.level < 3 ? "7 7" : undefined} markerEnd="url(#learner-report-route-arrow)" />
      }))}
      {layout.leafIds.map((sourceId) => {
        const source = nodeById.get(sourceId)
        if (!source || !assessment) return null
        return <path className="route-flow-line route-flow-line--terminal" key={`${sourceId}-final-assessment`} d={edgePath(source.point, assessment.point)} fill="none" stroke="#9AAFC7" strokeWidth="3" strokeDasharray={finalReady ? undefined : "7 7"} markerEnd="url(#learner-report-route-arrow)" />
      })}
      {capabilities.map((node) => {
        const routeNode = nodeById.get(node.id)
        if (!routeNode) return null
        const meta = REPORT_ROUTE_META[node.state]
        return <foreignObject className="route-node" key={node.id} x={routeNode.point.x - ROUTE_NODE_WIDTH / 2} y={routeNode.point.y - ROUTE_NODE_HEIGHT / 2} width={ROUTE_NODE_WIDTH} height={ROUTE_NODE_HEIGHT}><button type="button" onClick={() => onSelect(node.id)} className="h-full w-full rounded-[14px] border-2 px-4 py-3 text-left shadow-[0_6px_16px_rgba(50,77,110,.09)] transition" style={{ backgroundColor: meta.fill, borderColor: selectedId === node.id ? "#315F91" : meta.stroke }}><span className="block text-[12px] font-extrabold" style={{ color: meta.stroke }}>{meta.label} · L{node.level}/L3</span><strong className="mt-1.5 block truncate text-[16px] leading-5 text-[#172E49]">{node.name}</strong><small className="mt-1 block line-clamp-2 text-[12px] leading-4 text-[#52667E]">{node.task}</small></button></foreignObject>
      })}
      {assessment && <foreignObject x={assessment.point.x - ROUTE_NODE_WIDTH / 2} y={assessment.point.y - ROUTE_NODE_HEIGHT / 2} width={ROUTE_NODE_WIDTH} height={ROUTE_NODE_HEIGHT}><div className={cn("grid h-full place-items-center rounded-[14px] border-2 px-4 text-center shadow-[0_6px_16px_rgba(50,77,110,.09)]", finalReady ? "border-[#2A8A70] bg-[#E6F6EF]" : "border-[#A8B0BC] bg-[#F5F6F8]")}><div>{finalReady ? <Flag className="mx-auto size-5 text-[#2A8A70]" /> : <Lock className="mx-auto size-5 text-[#7A8798]" />}<strong className="mt-1.5 block truncate text-[15px] text-[#1E3652]">岗位综合情境验收</strong><small className="mt-1 block max-w-full truncate text-[11px] text-[#586B82]">目标：{targetRoleName || "目标岗位"}</small><small className="mt-0.5 block text-[11px] text-[#586B82]">{finalReady ? "可以进入岗位验收" : `还需完成 ${capabilities.filter((node) => node.level < 3).length} 项能力`}</small></div></div></foreignObject>}
    </svg>
  </InteractiveCanvas></div>
}

export function ReportPathProgress({ capabilities, targetRoleName }: { capabilities: ReportCapability[]; targetRoleName: string }) {
  const capabilityProgress = capabilities.length
    ? Math.round(capabilities.reduce((sum, node) => sum + Math.min(3, Math.max(0, node.level)), 0) / (capabilities.length * 3) * 100)
    : 0

  return <div className="mt-4 rounded-[18px] border border-[#D8E2EE] bg-[#F7FAFD] p-4" role="progressbar" aria-label="岗位学习路径进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={capabilityProgress}>
    <div className="flex items-center justify-between gap-3 text-[13px] font-bold text-[#52677F]"><span className="inline-flex items-center gap-2"><Zap className="size-4 text-[#C6872E]" />岗位学习路径进度</span><strong className="text-[#285FAF]">{capabilityProgress}%</strong></div>
    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-[#DCE5F0] shadow-inner"><div className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#2E6EC8_0%,#6C5CE7_48%,#22A38A_100%)] shadow-[0_0_14px_rgba(68,111,218,.7)] transition-[width] duration-700" style={{ width: `${capabilityProgress}%` }} /><div className="absolute inset-y-0 w-16 animate-[route-progress-shimmer_2.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ left: `calc(${Math.max(0, capabilityProgress - 8)}% - 32px)` }} /></div>
    <div className="mt-2 flex items-center justify-between text-xs text-[#6B7D91]"><span>{capabilities.filter((node) => node.level > 0).length} 项已有学习证据</span><span>目标：{targetRoleName || "目标岗位"}</span></div>
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

function ReportHeading({ image, index, title, description }: { image: string; index: string; title: string; description: string }) {
  return <div className="learner-signal-report-heading"><span className={`learner-signal-heading-icon is-${index}`}><img src={image} alt="" aria-hidden="true" /></span><div><span className="text-[9px] font-bold tracking-[.12em] text-[#8493A2]">{index}</span><h3 className="text-sm font-bold text-[#293C51]">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[#758392]">{description}</p></div></div>
}
