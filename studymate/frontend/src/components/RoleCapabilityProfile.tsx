import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Check, CircleAlert, CircleGauge, CircleHelp, Sparkles, TrendingUp } from "lucide-react"

import type { ReportCapability } from "@/components/LearnerMatchReport"

interface RoleCapabilityProfileProps {
  targetRoleName: string
  capabilities: ReportCapability[]
  loading?: boolean
}

type CapabilityState = "mastered" | "developing" | "gap" | "locked"

const stateMeta: Record<CapabilityState, { label: string; card: string; dot: string }> = {
  mastered: { label: "已达标", card: "border-[#B8D8CB] bg-[#EAF5F0]", dot: "bg-[#287B65]" },
  developing: { label: "正在提升", card: "border-[#E7D0A1] bg-[#FFF5DF]", dot: "bg-[#B8781F]" },
  gap: { label: "关键差距", card: "border-[#E7BBB0] bg-[#FFF0EC]", dot: "bg-[#B65742]" },
  locked: { label: "待解锁", card: "border-[#DCE3E9] bg-[#F7F9FB]", dot: "bg-[#AAB8C4]" },
}

function levelLabel(level: number) {
  if (level >= 3) return "熟练"
  if (level >= 2) return "基础"
  if (level >= 1) return "入门"
  return "未接触"
}

function displayState(capability: ReportCapability): CapabilityState {
  if (capability.level >= 3) return "mastered"
  if (capability.state === "locked" || capability.level === 0 && capability.state === "ready") return "locked"
  if (capability.level === 0 || capability.state === "current") return "gap"
  return "developing"
}

function stageFor(capability: ReportCapability, index: number, total: number) {
  if (total <= 4) return Math.min(3, index)
  if (!capability.prerequisites.length) return 0
  if (index >= total - 1) return 3
  return index < Math.ceil(total * .58) ? 1 : 2
}

function ProgressBars({ value, state }: { value: number; state: CapabilityState }) {
  const activeColor = stateMeta[state].dot
  return <div className="mt-3 flex gap-1" aria-label={`当前等级 L${value}`}>
    {[1, 2, 3].map((level) => <span key={level} className={`h-1.5 w-6 rounded-sm ${level <= value ? activeColor : "bg-[#DCE5EC]"}`} />)}
  </div>
}

export function RoleCapabilityProfile({ targetRoleName, capabilities, loading = false }: RoleCapabilityProfileProps) {
  const [selectedId, setSelectedId] = useState("")
  const [onlyGaps, setOnlyGaps] = useState(false)
  const model = useMemo(() => {
    const enriched = capabilities.map((item, index) => ({ ...item, visualState: displayState(item), stage: stageFor(item, index, capabilities.length) }))
    const total = enriched.length
    const achieved = enriched.filter((item) => item.visualState === "mastered")
    const growing = enriched.filter((item) => item.visualState === "developing")
    const gaps = enriched.filter((item) => item.visualState === "gap")
    const average = total ? enriched.reduce((sum, item) => sum + item.level, 0) / total : 0
    return { enriched, total, achieved, growing, gaps, average, progress: total ? Math.round(average / 3 * 100) : 0 }
  }, [capabilities])

  if (loading) {
    return <section className="border border-[#D5E0EA] bg-white p-6 text-sm text-[#677D92]">正在同步岗位能力画像…</section>
  }

  if (!model.total) {
    return <section className="border border-dashed border-[#C9D8E5] bg-white p-8 text-center"><CircleGauge className="mx-auto size-7 text-[#315E83]" /><h2 className="mt-3 text-base font-bold text-[#203A55]">先选择目标岗位</h2><p className="mt-1 text-xs leading-5 text-[#718397]">选择岗位后，将在这里生成对应的能力图谱、等级要求和训练差距。</p><Link to="/courses" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#234A68] px-3.5 text-[11px] font-bold text-white">选择目标岗位<ArrowRight className="size-3.5" /></Link></section>
  }

  const visible = onlyGaps ? model.enriched.filter((item) => item.visualState === "gap" || item.visualState === "locked") : model.enriched
  const selected = model.enriched.find((item) => item.id === selectedId) ?? model.gaps[0] ?? model.growing[0] ?? model.enriched[0]
  const stages = [
    { title: "基础底座", description: "建立岗位通用基础" },
    { title: "核心开发", description: "形成核心方法能力" },
    { title: "工程实践", description: "落实到真实任务" },
    { title: "岗位胜任", description: "完成综合情境验收" },
  ]

  return <section id="profile-overview" data-testid="role-capability-profile" className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,375px)_minmax(0,1fr)] lg:items-stretch">
      <RoleRequirement targetRoleName={targetRoleName} total={model.total} mastered={model.achieved.length} />
      <header className="border border-[#D3DFE9] bg-white px-5 py-6 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[#2E669B]"><CircleGauge className="size-5" />目标岗位 · {targetRoleName}</span>
            <h1 className="mt-3 text-[30px] font-bold leading-tight text-[#183D60] sm:text-[36px]">我的岗位能力画像</h1>
            <p className="mt-2 text-sm text-[#68809A]">依据画像、测评、学习记录和项目训练动态更新</p>
          </div>
          <div className="border-t border-[#D8E2EA] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div className="flex items-baseline justify-between gap-3"><strong className="text-[30px] font-medium text-[#245E91]">{levelLabel(model.average)} · L{Math.min(3, Math.round(model.average))}</strong><span className="text-sm text-[#687E95]">岗位要求：熟练 · L3</span></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#DDE6EC]"><div className="h-full bg-[#287B70] transition-[width] duration-500" style={{ width: `${model.progress}%` }} /></div>
            <div className="mt-3 flex justify-between text-sm text-[#557492]"><span>综合达成度 {model.progress}%</span><span>还差 {Math.max(0, 3 - Math.round(model.average))} 个阶段</span></div>
          </div>
        </div>
      </header>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={Sparkles} label="已点亮技能" value={`${model.achieved.length} / ${model.total}`} tone="text-[#287B65]" />
      <Metric icon={TrendingUp} label="正在提升" value={`${model.growing.length} 项`} tone="text-[#B8781F]" />
      <Metric icon={CircleAlert} label="关键能力差距" value={`${model.gaps.length} 项`} tone="text-[#B65742]" />
    </div>

    <section className="border border-[#D3DFE9] bg-white">
      <div className="flex flex-col gap-4 border-b border-[#D9E3EA] px-5 py-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-xl font-bold text-[#173E60]">{targetRoleName}能力图谱</h2><p className="mt-1 text-sm text-[#68809A]">从左到右为能力前置关系，点击技能查看诊断依据与提升建议</p></div>
        <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 self-start rounded-md border border-[#D2DFE9] px-3 text-sm font-medium text-[#315E83] lg:self-auto"><input type="checkbox" checked={onlyGaps} onChange={(event) => setOnlyGaps(event.target.checked)} className="size-4 rounded border-[#8DA2B4]" />只看差距项</label>
      </div>

      <div className="relative overflow-x-auto bg-[radial-gradient(#D7E4EF_1px,transparent_1px)] bg-[size:28px_28px] px-5 py-7 sm:px-7">
        <div className="relative grid min-w-[940px] grid-cols-[repeat(4,minmax(180px,1fr))] gap-6">
          {stages.map((stage, stageIndex) => <div key={stage.title} className="relative">
            {stageIndex < stages.length - 1 && <div className="absolute right-[-25px] top-[136px] h-px w-7 bg-[#A8C0D3]" aria-hidden="true" />}
            <div className="mb-4 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-md bg-[#EEF5FA] text-sm font-medium text-[#2E669B]">{stageIndex + 1}</span><div><h3 className="text-base font-medium text-[#315E83]">{stage.title}</h3><p className="text-[11px] text-[#7790A6]">{stage.description}</p></div></div>
            <div className="space-y-3">
              {visible.filter((item) => item.stage === stageIndex).map((item) => <CapabilityCard key={item.id} item={item} selected={selected.id === item.id} onSelect={() => setSelectedId(item.id)} />)}
              {!visible.some((item) => item.stage === stageIndex) && <div className="border border-dashed border-[#D7E3EC] bg-white/70 p-4 text-xs text-[#899AA9]">暂无符合筛选条件的技能</div>}
            </div>
          </div>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#D9E3EA] px-5 py-4 text-xs text-[#5E768D] sm:px-7">
        {(Object.keys(stateMeta) as CapabilityState[]).map((state) => <span key={state} className="inline-flex items-center gap-2"><i className={`size-2.5 rounded-sm ${stateMeta[state].dot}`} />{stateMeta[state].label}</span>)}
        <span>L0 未接触 · L1 入门 · L2 基础 · L3 熟练</span>
      </div>
    </section>

    {selected && <SkillDetail item={selected} targetRoleName={targetRoleName} />}
  </section>
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Sparkles; label: string; value: string; tone: string }) {
  return <article className="border border-[#D3DFE9] bg-white px-6 py-5"><p className="text-sm text-[#557492]">{label}</p><div className={`mt-3 flex items-center gap-3 ${tone}`}><Icon className="size-6" strokeWidth={1.7} /><strong className="text-[28px] font-medium text-[#193D5D]">{value}</strong></div></article>
}

function CapabilityCard({ item, selected, onSelect }: { item: ReportCapability & { visualState: CapabilityState }; selected: boolean; onSelect: () => void }) {
  const meta = stateMeta[item.visualState]
  return <button type="button" onClick={onSelect} className={`block w-full border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245E91] ${meta.card} ${selected ? "ring-2 ring-[#2E669B] ring-offset-2" : ""}`}>
    <strong className="block truncate text-[17px] font-medium text-[#183D60]">{item.name}</strong><span className="mt-2 block text-sm text-[#5D7790]">{meta.label}</span><div className="mt-5 flex items-end justify-between gap-2"><span className="text-sm text-[#4F6E89]">{levelLabel(item.level)} L{item.level} / L3</span><ProgressBars value={item.level} state={item.visualState} /></div>
  </button>
}

function RoleRequirement({ targetRoleName, total, mastered, compact = false }: { targetRoleName: string; total: number; mastered: number; compact?: boolean }) {
  return <aside className={`border-2 border-[#725CA8] bg-[#F3F0FB] text-[#283B62] ${compact ? "p-4" : "p-5"}`}><div className="grid size-10 place-items-center rounded-full bg-white text-[#725CA8]"><BriefcaseBusiness className="size-5" /></div><h3 className="mt-4 text-xl font-medium">{targetRoleName}</h3><p className="mt-1 text-sm text-[#5F6E88]">岗位能力要求</p><ul className="mt-5 space-y-2.5 text-sm leading-6"><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#725CA8]" />{total} 项核心技能达到熟练 L3</li><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#725CA8]" />工程部署能力达到基础 L2</li><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#725CA8]" />综合项目验收不低于 80 分</li></ul><p className="mt-4 border-t border-[#D9D0EE] pt-3 text-xs text-[#6E6094]">当前已达标 {mastered} 项</p></aside>
}

function SkillDetail({ item, targetRoleName }: { item: ReportCapability & { visualState: CapabilityState }; targetRoleName: string }) {
  const state = stateMeta[item.visualState]
  const evidence = item.level >= 2 ? ["已完成相关知识学习与阶段练习", "当前学习记录已形成可追溯证据", "可在岗位任务中继续验证稳定性"] : ["当前学习记录仍缺少稳定的任务证据", "相关能力尚未达到岗位要求等级"]
  return <section className="grid gap-5 border border-[#D3DFE9] bg-white p-6 lg:grid-cols-[minmax(0,1fr)_300px]"><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold text-[#183D60]">{item.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.card}`}>{state.label}</span></div><p className="mt-2 text-sm text-[#6A8197]">{item.task}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="bg-[#F5F8FB] p-4"><p className="text-xs text-[#738AA0]">当前水平</p><strong className="mt-1 block text-lg font-medium text-[#244E73]">{levelLabel(item.level)} · L{item.level}</strong></div><div className="bg-[#F5F8FB] p-4"><p className="text-xs text-[#738AA0]">岗位要求</p><strong className="mt-1 block text-lg font-medium text-[#244E73]">熟练 · L3</strong></div></div><div className="mt-5 grid gap-5 md:grid-cols-2"><div><h3 className="text-sm font-medium text-[#315E83]">判断依据</h3><ul className="mt-3 space-y-2 text-sm leading-5 text-[#607C91]">{evidence.map((line) => <li key={line} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#5B8C7B]" />{line}</li>)}</ul></div><div><h3 className="text-sm font-medium text-[#B65742]">与岗位要求的差距</h3><p className="mt-3 text-sm leading-6 text-[#607C91]">还需从 L{item.level} 提升至 L3，并在 {targetRoleName} 的真实任务中完成验证。</p></div></div></div><aside className="flex flex-col justify-between border border-[#D7E4EE] bg-[#F7FAFD] p-5"><div><CircleHelp className="size-5 text-[#2E669B]" /><p className="mt-4 text-xs font-medium text-[#66829B]">建议下一步</p><strong className="mt-1 block text-lg font-medium leading-7 text-[#234A68]">{item.task}</strong></div><Link to="/competency" className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#234A68] px-4 text-sm font-medium text-white">开始专项训练<ArrowRight className="size-4" /></Link></aside></section>
}
