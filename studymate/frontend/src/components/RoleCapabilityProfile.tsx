import { type WheelEvent as ReactWheelEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  CircleGauge,
  CircleHelp,
  LoaderCircle,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { ReportPathMap, type ReportCapability } from "@/components/LearnerMatchReport"

interface Props {
  targetRoleName: string
  capabilities: ReportCapability[]
  loading?: boolean
}

type ViewState = "mastered" | "developing" | "gap" | "locked"
type ProfileCapability = ReportCapability & { visualState: ViewState }

const stateMeta: Record<ViewState, { label: string }> = {
  mastered: { label: "已达标" },
  developing: { label: "正在提升" },
  gap: { label: "关键差距" },
  locked: { label: "待解锁" },
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
    const enriched: ProfileCapability[] = capabilities.map((item) => ({ ...item, visualState: displayState(item) }))
    const total = enriched.length
    const achieved = enriched.filter((item) => item.visualState === "mastered")
    const growing = enriched.filter((item) => item.visualState === "developing")
    const gaps = enriched.filter((item) => item.visualState === "gap")
    const locked = enriched.filter((item) => item.visualState === "locked")
    const average = total ? enriched.reduce((sum, item) => sum + item.level, 0) / total : 0

    return {
      enriched,
      total,
      achieved,
      growing,
      gaps,
      locked,
      progress: total ? Math.round(average / 3 * 100) : 0,
    }
  }, [capabilities])

  if (loading) {
    return <section className="capability-profile-loading" aria-live="polite"><LoaderCircle /><div><b>正在同步岗位能力画像</b><span>正在读取最新学习与训练证据</span></div></section>
  }

  if (!model.total) {
    return <section className="capability-profile-empty-state"><CircleGauge /><h2>先选择目标岗位</h2><p>选择岗位后，这里将展示能力达成情况、关键差距与训练建议。</p><Link to="/courses">选择目标岗位<ArrowRight /></Link></section>
  }

  const visible = onlyGaps
    ? model.enriched.filter((item) => item.visualState === "gap" || item.visualState === "locked")
    : model.enriched
  const selected = model.enriched.find((item) => item.id === selectedId)
    ?? model.gaps[0]
    ?? model.growing[0]
    ?? model.locked[0]
    ?? model.enriched[0]
  const needsWork = model.gaps.length + model.locked.length
  const summary = model.progress === 100
    ? "全部核心能力已达到岗位要求，可进入综合训练。"
    : model.gaps.length
      ? `优先补齐「${model.gaps[0].name}」，完成后继续更新岗位画像。`
      : model.growing.length
        ? `继续提升「${model.growing[0].name}」，形成稳定的岗位任务证据。`
        : `从「${selected.name}」开始积累岗位能力证据。`

  const passLockedCanvasWheelToPage = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest(".interactive-canvas.is-scale-locked")) return
    event.preventDefault()
    event.stopPropagation()
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    document.scrollingElement?.scrollBy({ top: event.deltaY * multiplier, left: event.deltaX * multiplier, behavior: "auto" })
  }

  return <section id="profile-overview" data-testid="role-capability-profile" className="capability-profile-content">
    <section className="capability-profile-summary" aria-labelledby="capability-profile-title">
      <div className="capability-profile-summary-copy">
        <span>岗位能力达成</span>
        <h1 id="capability-profile-title">{targetRoleName}</h1>
        <p>{summary}</p>
        <small><Target />岗位目标：{model.total} 项核心能力达到熟练 L3</small>
      </div>
      <div className="capability-profile-progress-summary">
        <strong>{model.progress}<small>%</small></strong>
        <span>总体达成度</span>
        <div className="capability-profile-progress-track" role="progressbar" aria-label="总体能力达成度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.progress}><i style={{ width: `${model.progress}%` }} /></div>
      </div>
      <div className="capability-profile-stats" aria-label="能力状态概览">
        <SummaryStat icon={CheckCircle2} label="已达标" value={`${model.achieved.length} / ${model.total}`} tone="mastered" />
        <SummaryStat icon={TrendingUp} label="正在提升" value={`${model.growing.length} 项`} tone="developing" />
        <SummaryStat icon={CircleAlert} label="待补齐" value={`${needsWork} 项`} tone="gap" />
      </div>
    </section>

    <section className="capability-profile-workspace">
      <section className="capability-profile-map-section" aria-labelledby="capability-map-title">
        <div className="capability-profile-section-heading">
          <div>
            <span>能力路径</span>
            <h2 id="capability-map-title">{targetRoleName}能力图谱</h2>
            <p>点击节点，右侧同步显示等级、差距与下一步。</p>
          </div>
          <label><input type="checkbox" checked={onlyGaps} onChange={(event) => setOnlyGaps(event.target.checked)} />只看待补齐</label>
        </div>
        <div className="capability-profile-canvas-shell" onWheelCapture={passLockedCanvasWheelToPage}>
          {visible.length
            ? <ReportPathMap capabilities={visible} targetRoleName={targetRoleName} selectedId={selected.id} onSelect={setSelectedId} />
            : <div className="capability-profile-empty"><CheckCircle2 /><b>当前没有待补齐的能力节点</b><span>关闭筛选可查看完整能力路径</span></div>}
        </div>
        <div className="capability-profile-legend">
          {(Object.keys(stateMeta) as ViewState[]).map((state) => <span key={state}><i className={`is-${state}`} />{stateMeta[state].label}</span>)}
          <span className="capability-profile-level-legend">L0 未接触 · L1 入门 · L2 基础 · L3 熟练</span>
        </div>
      </section>

      <SkillDetail item={selected} targetRoleName={targetRoleName} />
    </section>
  </section>
}

function SummaryStat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: "mastered" | "developing" | "gap" }) {
  return <article className={`capability-profile-stat is-${tone}`}><Icon /><div><span>{label}</span><strong>{value}</strong></div></article>
}

function SkillDetail({ item, targetRoleName }: { item: ProfileCapability; targetRoleName: string }) {
  const state = stateMeta[item.visualState]
  const evidence = item.level >= 2
    ? ["已完成相关知识学习与阶段练习", "当前学习记录已形成可追溯证据", "可在岗位任务中继续验证稳定性"]
    : ["当前学习记录仍缺少稳定的任务证据", "相关能力尚未达到岗位要求等级"]
  const requirementText = item.level >= 3
    ? `已达到岗位 L3 要求，后续在 ${targetRoleName} 的综合任务中持续验证稳定性。`
    : `还需从 L${item.level} 提升至 L3，并在 ${targetRoleName} 的真实任务中完成验证。`
  const actionText = item.level >= 3 ? "进入岗位综合验收并保持项目复盘" : item.task

  return <aside className="capability-profile-detail" aria-live="polite">
    <header className="capability-profile-detail-header">
      <span>当前节点诊断</span>
      <div><h2>{item.name}</h2><i className={`is-${item.visualState}`}>{state.label}</i></div>
      <p>{item.task}</p>
    </header>

    <div className="capability-profile-levels" aria-label="当前水平与岗位要求">
      <div><span>当前水平</span><strong>{levelLabel(item.level)} · L{item.level}</strong></div>
      <ArrowRight />
      <div><span>岗位要求</span><strong>熟练 · L3</strong></div>
    </div>

    <section className="capability-profile-gap-result">
      <h3><CircleAlert />{item.level >= 3 ? "岗位达标结论" : "关键差距"}</h3>
      <p>{requirementText}</p>
    </section>

    <section className="capability-profile-evidence">
      <h3>判断依据</h3>
      <ul>{evidence.map((line) => <li key={line}><BadgeCheck />{line}</li>)}</ul>
    </section>

    <footer className="capability-profile-action">
      <div><CircleHelp /><span>建议下一步</span><strong>{actionText}</strong></div>
      <Link to="/competency">{item.level >= 3 ? "进入综合训练" : "开始专项训练"}<ArrowRight /></Link>
    </footer>
  </aside>
}
