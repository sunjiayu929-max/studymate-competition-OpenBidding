import { type WheelEvent as ReactWheelEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Check, CircleAlert, CircleGauge, CircleHelp, Radar, Sparkles, Target, TrendingUp, Zap } from "lucide-react"
import { ReportPathMap, ReportPathProgress, type ReportCapability } from "@/components/LearnerMatchReport"

interface Props { targetRoleName: string; capabilities: ReportCapability[]; loading?: boolean }
type ViewState = "mastered" | "developing" | "gap" | "locked"
const stateMeta: Record<ViewState, { label: string; card: string; dot: string }> = {
  mastered: { label: "已达标", card: "border-[#B8D8CB] bg-[#EAF5F0]", dot: "bg-[#287B65]" },
  developing: { label: "正在提升", card: "border-[#E7D0A1] bg-[#FFF5DF]", dot: "bg-[#B8781F]" },
  gap: { label: "关键差距", card: "border-[#E7BBB0] bg-[#FFF0EC]", dot: "bg-[#B65742]" },
  locked: { label: "待解锁", card: "border-[#DCE3E9] bg-[#F7F9FB]", dot: "bg-[#AAB8C4]" },
}
const levelLabel = (level: number) => level >= 3 ? "熟练" : level >= 2 ? "基础" : level >= 1 ? "入门" : "未接触"
function displayState(item: ReportCapability): ViewState {
  if (item.level >= 3) return "mastered"
  if (item.state === "locked" || item.level === 0 && item.state === "ready") return "locked"
  if (item.level === 0 || item.state === "current") return "gap"
  return "developing"
}

export function RoleCapabilityProfile({ targetRoleName, capabilities, loading = false }: Props) {
  const [selectedId, setSelectedId] = useState("")
  const [onlyGaps, setOnlyGaps] = useState(false)
  const model = useMemo(() => {
    const enriched = capabilities.map((item) => ({ ...item, visualState: displayState(item) }))
    const total = enriched.length
    const achieved = enriched.filter((item) => item.visualState === "mastered")
    const growing = enriched.filter((item) => item.visualState === "developing")
    const gaps = enriched.filter((item) => item.visualState === "gap")
    const average = total ? enriched.reduce((sum, item) => sum + item.level, 0) / total : 0
    return { enriched, total, achieved, growing, gaps, average, progress: total ? Math.round(average / 3 * 100) : 0 }
  }, [capabilities])
  if (loading) return <section className="capability-profile-loading"><Radar /><div><b>正在同步岗位能力画像</b><span>能力雷达正在校准节点与证据…</span></div></section>
  if (!model.total) return <section className="capability-profile-empty-state"><CircleGauge /><h2>先选择目标岗位</h2><p>选择岗位后，将在这里生成对应的能力图谱、等级要求和训练差距。</p><Link to="/courses">选择目标岗位<ArrowRight /></Link></section>

  const visible = onlyGaps ? model.enriched.filter((item) => item.visualState === "gap" || item.visualState === "locked") : model.enriched
  const selected = model.enriched.find((item) => item.id === selectedId) ?? model.gaps[0] ?? model.growing[0] ?? model.enriched[0]
  const stages = ["基础底座", "核心开发", "工程实践", "岗位胜任"]
  const passLockedCanvasWheelToPage = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest(".interactive-canvas.is-scale-locked")) return
    event.preventDefault()
    event.stopPropagation()
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    document.scrollingElement?.scrollBy({ top: event.deltaY * multiplier, left: event.deltaX * multiplier, behavior: "auto" })
  }
  return <section id="profile-overview" data-testid="role-capability-profile" className="capability-profile-content">
    <section className="capability-profile-hero">
      <div className="capability-profile-live-row"><div><span /><b>CAPABILITY RADAR</b><i>PROFILE / 01</i></div><em>{selectedId ? `正在扫描 · ${selected.name}` : "画像已同步 · 等待点亮下一节点"}</em></div>
      <div className="capability-profile-hero-grid">
        <div className="capability-profile-title-block"><div className="capability-profile-index"><strong>01</strong><span>岗位能力画像</span><i>ROLE CAPABILITY</i></div><h1>能力雷达<br /><span>岗位节点与能力点亮</span></h1><p>依据画像、测评、学习记录和项目训练动态更新</p></div>
        <div className="capability-profile-radar-visual" aria-hidden="true"><span /><Radar /><i>LIVE</i></div>
        <div className="capability-profile-progress-summary"><span>目标岗位 · {targetRoleName}</span><strong>{model.progress}<small>%</small></strong><p>{levelLabel(model.average)} · L{Math.min(3, Math.round(model.average))} / 岗位要求 L3</p><div><i style={{ width: `${model.progress}%` }} /></div></div>
      </div>
      <div className="capability-profile-stage-rail"><i aria-hidden="true" />{stages.map((stage, index) => <span key={stage} className={index === Math.min(3, Math.floor(model.average)) ? "is-current" : index < model.average ? "is-done" : ""}><b>{String(index + 1).padStart(2, "0")}</b>{stage}</span>)}</div>
    </section>
    <section className={`capability-profile-map-section ${selectedId ? "is-inspecting" : ""}`}>
      <div className="capability-profile-section-heading"><div className="capability-profile-number"><strong>02</strong><span>节点关系画板</span><i>CAPABILITY GRAPH</i></div><div><h2>{targetRoleName}能力图谱</h2><p>沿动态路径读取能力前置关系，点击节点查看诊断依据与提升建议</p></div><div className="capability-profile-map-actions"><label><input type="checkbox" checked={onlyGaps} onChange={(event) => setOnlyGaps(event.target.checked)} />只看差距项</label><Link to="/competency">训练当前节点<ArrowRight /></Link></div></div>
      <div className="capability-profile-canvas-shell" onWheelCapture={passLockedCanvasWheelToPage}>{visible.length ? <ReportPathMap capabilities={visible} targetRoleName={targetRoleName} selectedId={selected.id} onSelect={setSelectedId} /> : <div className="capability-profile-empty"><Target />暂无符合筛选条件的能力节点</div>}<ReportPathProgress capabilities={model.enriched} targetRoleName={targetRoleName} /></div>
      <div className="capability-profile-legend">{(Object.keys(stateMeta) as ViewState[]).map((state) => <span key={state}><i className={stateMeta[state].dot} />{stateMeta[state].label}</span>)}<span>L0 未接触 · L1 入门 · L2 基础 · L3 熟练</span></div>
    </section>
    <TransitionBand asset="/images/capability-transition-aircraft-v1.png" from="能力节点扫描" to="岗位证据汇聚" label="CAPABILITY FLIGHT · 01" />
    <div className="capability-profile-requirement-grid"><RoleRequirement targetRoleName={targetRoleName} total={model.total} mastered={model.achieved.length} /><div className="capability-profile-metrics"><Metric icon={Sparkles} label="已点亮技能" value={`${model.achieved.length} / ${model.total}`} tone="is-green" code="SKILL ACTIVATION" detail="岗位技能点亮率" progress={model.total ? Math.round(model.achieved.length / model.total * 100) : 0} /><Metric icon={TrendingUp} label="正在提升" value={`${model.growing.length} 项`} tone="is-gold" code="TRAINING IN FLIGHT" detail="训练节点占比" progress={model.total ? Math.round(model.growing.length / model.total * 100) : 0} /><Metric icon={CircleAlert} label="关键能力差距" value={`${model.gaps.length} 项`} tone="is-coral" code="GAP MONITOR" detail="待补齐能力占比" progress={model.total ? Math.round(model.gaps.length / model.total * 100) : 0} /></div></div>
    <TransitionBand asset="/images/capability-transition-satellite-v1.png" from="达成度遥测" to="差距建议生成" label="ORBIT TELEMETRY · 02" variant="telemetry" />
    {selected && <SkillDetail item={selected} targetRoleName={targetRoleName} />}
  </section>
}

function Metric({ icon: Icon, label, value, tone, code, detail, progress }: { icon: typeof Sparkles; label: string; value: string; tone: string; code: string; detail: string; progress: number }) {
  return <article className={`capability-profile-metric ${tone}`}><span className="capability-profile-card-fx" aria-hidden="true"><i /><b /></span><Icon /><div className="capability-profile-metric-content"><small>{code}</small><p>{label}</p><strong>{value}</strong><footer><span>{detail}</span><em>{progress}%</em></footer><div className="capability-profile-metric-track"><i style={{ width: `${progress}%` }} /></div></div><Zap className="capability-profile-metric-signal" /></article>
}
function TransitionBand({ asset, from, to, label, variant = "flight" }: { asset: string; from: string; to: string; label: string; variant?: "flight" | "telemetry" }) {
  return <div className={`capability-profile-transfer is-${variant}`} aria-label={`${from}到${to}`}>
    <span className="capability-profile-transfer-end is-origin"><small>DEPARTURE</small><strong>{from}</strong></span>
    <div className="capability-profile-flight-lane" aria-hidden="true"><i className="is-east-gate" /><i className="is-west-gate" /><b>{label}</b><img className="is-eastbound" src={asset} alt="" /><img className="is-westbound" src={asset} alt="" /></div>
    <span className="capability-profile-transfer-end is-destination"><small>ARRIVAL</small><strong>{to}</strong></span>
  </div>
}
function RoleRequirement({ targetRoleName, total, mastered }: { targetRoleName: string; total: number; mastered: number }) {
  return <aside className="capability-profile-requirement"><span className="capability-profile-card-fx" aria-hidden="true"><i /><b /></span><div><BriefcaseBusiness /></div><span>岗位要求 / ROLE TARGET</span><h3>{targetRoleName}</h3><ul><li><Check />{total} 项核心技能达到熟练 L3</li><li><Check />工程部署能力达到基础 L2</li><li><Check />综合项目验收不低于 80 分</li></ul><p>当前已点亮 <b>{mastered}</b> 项能力</p></aside>
}
function SkillDetail({ item, targetRoleName }: { item: ReportCapability & { visualState: ViewState }; targetRoleName: string }) {
  const state = stateMeta[item.visualState]
  const evidence = item.level >= 2 ? ["已完成相关知识学习与阶段练习", "当前学习记录已形成可追溯证据", "可在岗位任务中继续验证稳定性"] : ["当前学习记录仍缺少稳定的任务证据", "相关能力尚未达到岗位要求等级"]
  const requirementText = item.level >= 3
    ? `已达到岗位 L3 要求，后续在 ${targetRoleName} 的综合任务中持续验证稳定性。`
    : `还需从 L${item.level} 提升至 L3，并在 ${targetRoleName} 的真实任务中完成验证。`
  return <section className="capability-profile-detail"><div className="capability-profile-detail-main"><div className="capability-profile-detail-title"><span>03 · 节点诊断</span><h2>{item.name}</h2><i className={state.card}>{state.label}</i></div><p>{item.task}</p><div className="capability-profile-levels"><div><span>当前水平</span><strong>{levelLabel(item.level)} · L{item.level}</strong></div><div><span>岗位要求</span><strong>熟练 · L3</strong></div></div><div className="capability-profile-evidence"><div><h3>判断依据</h3><ul>{evidence.map((line) => <li key={line}><BadgeCheck />{line}</li>)}</ul></div><div><h3>{item.level >= 3 ? "岗位达标结论" : "与岗位要求的差距"}</h3><p>{requirementText}</p></div></div></div><aside><CircleHelp /><span>建议下一步</span><strong>{item.level >= 3 ? "进入岗位综合验收并保持项目复盘" : item.task}</strong><div className="capability-profile-launch-scene" aria-hidden="true"><div><img src="/images/profile-launch-rocket-v1.png" alt="" /></div></div><Link to="/competency">{item.level >= 3 ? "进入综合训练" : "开始专项训练"}<ArrowRight /></Link></aside></section>
}
