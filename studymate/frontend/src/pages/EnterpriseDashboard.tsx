import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  Target,
  UsersRound,
  X,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet } from "@/lib/api"
import { cn } from "@/lib/utils"

type Capability = {
  id: string
  name: string
  description: string
  evidence: string
  score: number
  level: number
  member_count?: number
}

type Member = {
  id: number
  name: string
  email: string | null
  job_title: string
  target_role: string
  progress: number
  today_minutes: number
  total_minutes: number
  active_today: boolean
  last_active_at: string | null
  current_task: { id: number; title: string; status: string } | null
  task_history: Array<{ id: number; title: string; task_type: string; status: string; progress: number; target_role: string; due_label: string; completed_at: string | null }>
  learning_trend: Array<{ date: string; minutes: number }>
  capabilities: Capability[]
  is_demo: boolean
  capability_note: string
}

type Dashboard = {
  enterprise: { id: number; name: string; invite_code: string }
  meta: { is_demo_data: boolean; demo_member_count: number; generated_at: string; data_note: string }
  summary: { employee_count: number; active_learners: number; in_progress_tasks: number; completed_tasks: number; overdue_tasks: number; completion_rate: number; average_today_minutes: number; today_minutes: number; recent_7_minutes: number; recent_30_minutes: number; knowledge_usage_count: number; knowledge_base_count: number; knowledge_material_count: number }
  roles: Array<{ name: string; member_count: number; active_count: number; average_progress: number }>
  tasks: Array<{ id: number; title: string; task_type: string; target_role: string; status: string; due_label: string; assignment_count: number; completed_count: number; in_progress_count: number; completion_rate: number; knowledge_base_id: number | null }>
  members: Member[]
  capabilities: Capability[]
  audit_logs: Array<{ id: number; action: string; target_type: string; target_id: string | null; detail: Record<string, unknown>; actor_name: string; created_at: string | null }>
}

type MemberDetail = { enterprise: Dashboard["enterprise"]; meta: Dashboard["meta"]; member: Member; capabilities: Capability[]; task_history: Member["task_history"]; learning_trend: Member["learning_trend"] }

const taskStatus: Record<string, { label: string; className: string }> = {
  published: { label: "已发布", className: "bg-[#EEF3F7] text-[#557088]" },
  in_progress: { label: "进行中", className: "bg-[#E7F0FF] text-[#2E65B2]" },
  completed: { label: "已完成", className: "bg-[#DDF2E9] text-[#18745E]" },
  expired: { label: "已逾期", className: "bg-[#FBE9E1] text-[#A05235]" },
}

const assignmentStatus: Record<string, string> = { pending: "待接受", accepted: "已接受", in_progress: "进行中", completed: "已完成" }
const auditAction: Record<string, string> = { task_publish: "发布任务", task_draft: "保存任务草稿", knowledge_base_create: "创建岗位知识库", member_import: "导入成员", member_join: "成员加入企业", task_accept: "接受任务", task_start: "开始任务", task_complete: "完成任务" }

export function EnterpriseDashboard() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setData(await apiGet<Dashboard>("/enterprise/dashboard"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "企业看板暂时无法打开")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openMember = async (member: Member) => {
    setSelectedId(member.id)
    setDetailLoading(true)
    try {
      setDetail(await apiGet<MemberDetail>(`/enterprise/members/${member.id}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : "成员详情暂时无法读取")
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <main className="app-page paper-theme min-h-dvh pb-12">
      <div className="mx-auto max-w-[1440px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="home" appearance="paper" labelOverride="企业运营看板" groupOverride="企业培训协作" selectionLabel={data?.enterprise.name || "郑州澜善科技有限公司"} />
        <header className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-[#D6E2D4] bg-[#F4F9F2] p-5 shadow-[0_14px_38px_rgba(59,92,58,.08)] sm:p-7">
          <div>
            <Link to="/enterprise" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#668064] hover:text-[#365A38]"><ArrowLeft className="size-3.5" />返回企业工作台</Link>
            <div className="mt-3 flex items-center gap-2 text-[10px] font-extrabold tracking-[.14em] text-[#5B7658]"><BarChart3 className="size-4" />企业学习运营</div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#243827] sm:text-3xl">看清员工正在学什么、学到哪一步</h1>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-[#657661]">按岗位、任务和成员下钻查看培训进度。任务完成率来自企业任务分配，学习时长来自成员近 30 日有效学习事件。</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#C8D8C4] bg-white px-3 text-xs font-bold text-[#52704D] hover:bg-[#F0F6EE] disabled:opacity-50"><RefreshCw className={cn("size-4", loading && "animate-spin")} />刷新数据</button>
        </header>

        {error && <div role="alert" className="mt-4 rounded-xl border border-[#E4C9BE] bg-[#FFF7F3] px-4 py-3 text-xs font-semibold text-[#A25139]">{error}</div>}
        {loading && !data ? <div className="grid min-h-[45vh] place-items-center"><Loader2 className="size-7 animate-spin text-[#52704D]" /></div> : data ? <DashboardContent data={data} onMemberClick={openMember} /> : null}
      </div>
      {selectedId !== null && <MemberDrawer detail={detail} loading={detailLoading} onClose={() => { setSelectedId(null); setDetail(null) }} />}
    </main>
  )
}

function DashboardContent({ data, onMemberClick }: { data: Dashboard; onMemberClick: (member: Member) => void }) {
  const { summary } = data
  return <>
    <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric icon={UsersRound} label="企业员工" value={`${summary.employee_count}`} detail={`${summary.active_learners} 人今日有学习活动`} tone="blue" />
      <Metric icon={Activity} label="今日学习" value={`${summary.today_minutes} 分钟`} detail={`人均 ${summary.average_today_minutes} 分钟`} tone="green" />
      <Metric icon={BookOpenCheck} label="进行中任务" value={`${summary.in_progress_tasks}`} detail={`${summary.completed_tasks} 个任务已完成`} tone="gold" />
      <Metric icon={CheckCircle2} label="任务完成率" value={`${summary.completion_rate}%`} detail={`${summary.knowledge_material_count} 条岗位资料 · 近 7 日 ${summary.recent_7_minutes} 分钟`} tone="teal" />
    </section>

    <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.82fr)]">
      <section className="flex h-full flex-col rounded-2xl border border-[#DCE5D9] bg-white p-5">
        <SectionHeading icon={BriefcaseBusiness} title="岗位分布" detail="按成员当前目标岗位聚合，进度由已分配任务状态计算。" />
        <div className="mt-5 grid flex-1 content-start gap-2.5 sm:grid-cols-2">
          {data.roles.length ? data.roles.map((role, index) => index === 0 ? (
            <div key={role.name} className="rounded-xl border border-[#D8E5D5] bg-[#F3F9F1] p-4 sm:col-span-2">
              <div className="flex items-start justify-between gap-3"><div><span className="text-[9px] font-extrabold text-[#6D9168]">核心交付岗位</span><h3 className="mt-1 text-sm font-bold leading-5 text-[#334934]">{role.name}</h3></div><span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-[#52704D]">{role.member_count} 人</span></div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-[#748273]"><span>平均训练进度 {role.average_progress}%</span><span>今日活跃 {role.active_count} 人</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#6D9A68] transition-all" style={{ width: `${Math.min(100, role.average_progress)}%` }} /></div>
            </div>
          ) : (
            <div key={role.name} className="rounded-xl border border-[#E3EAE1] bg-[#FBFDFB] p-3">
              <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-bold leading-5 text-[#334934]">{role.name}</h3><strong className="shrink-0 text-sm text-[#52704D]">{role.member_count} 人</strong></div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-[#7C8879]"><span>平均进度 {role.average_progress}%</span><span>活跃 {role.active_count}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EDF2EB]"><div className="h-full rounded-full bg-[#8AAA84]" style={{ width: `${Math.min(100, role.average_progress)}%` }} /></div>
            </div>
          )) : <div className="sm:col-span-2"><Empty text="还没有企业学习成员" /></div>}
        </div>
      </section>
      <section className="rounded-2xl border border-[#DCE5D9] bg-white p-5">
        <SectionHeading icon={FileCheck2} title="任务完成情况" detail="任务状态按成员分配结果汇总，便于演示培训闭环。" />
        <div className="mt-4 space-y-2.5">{data.tasks.length ? data.tasks.slice(0, 4).map((task) => { const status = taskStatus[task.status] || taskStatus.published; return <div key={task.id} className="rounded-xl border border-[#E6ECE3] bg-[#FBFDFB] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", task.task_type === "training" ? "bg-[#E7EDF8] text-[#315E83]" : "bg-[#FFF1D9] text-[#946B27]")}>{task.task_type === "training" ? "岗位训练" : "普通阅读"}</span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", status.className)}>{status.label}</span></div><p className="mt-2 truncate text-xs font-bold text-[#334934]">{task.title}</p></div><strong className="shrink-0 text-sm text-[#52704D]">{task.completion_rate}%</strong></div><div className="mt-2 flex items-center justify-between text-[10px] text-[#899588]"><span>{task.completed_count}/{task.assignment_count || 0} 人完成</span><span>{task.due_label}</span></div></div> }) : <Empty text="还没有发布企业任务" />}</div>
      </section>
    </div>

    <section className="mt-4 rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={FileCheck2} title="最近协作操作" detail="只展示企业范围内的关键管理与任务状态操作，便于回看演示过程。" /><div className="mt-4 grid gap-2 md:grid-cols-2">{data.audit_logs.length ? data.audit_logs.slice(0, 6).map((log) => <div key={log.id} className="flex items-start gap-3 rounded-xl border border-[#E6ECE3] bg-[#FBFDFB] p-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#EAF4E7] text-[#52704D]"><Activity className="size-3.5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-[11px] text-[#334934]">{auditAction[log.action] || log.action}</strong><span className="text-[10px] text-[#899588]">{log.actor_name}</span></div><p className="mt-1 truncate text-[10px] text-[#748273]">{String(log.detail.title || log.detail.name || log.detail.member_name || "企业任务状态已更新")}</p></div><time className="shrink-0 text-[9px] text-[#9AA598]">{formatTime(log.created_at)}</time></div>) : <Empty text="暂无关键操作记录" />}</div></section>

    <section className="mt-4 rounded-2xl border border-[#DCE5D9] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={Target} title="能力掌握概览" detail="能力等级沿用岗位训练中心的 L0-L3 口径；点击员工可查看个人节点。" /><span className="rounded-full bg-[#F7F3EA] px-2.5 py-1.5 text-[10px] font-bold text-[#8B7042]">资料使用 {summary.knowledge_usage_count} 次</span></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.capabilities.map((capability) => <div key={capability.id} className="rounded-xl border border-[#E6ECE3] bg-[#FBFDFB] p-3.5"><div className="flex items-start justify-between gap-2"><span className="text-xs font-bold text-[#334934]">{capability.name}</span><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", capability.level >= 3 ? "bg-[#DDF2E9] text-[#18745E]" : capability.level >= 2 ? "bg-[#E7F0FF] text-[#2E65B2]" : "bg-[#FFF0D8] text-[#9A651E]")}>L{capability.level}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E9EFE7]"><div className="h-full rounded-full bg-[#5C8C62]" style={{ width: `${capability.score}%` }} /></div><div className="mt-1.5 flex justify-between text-[10px] text-[#7C8879]"><span>团队均分</span><strong>{capability.score}</strong></div></div>)}</div>
    </section>

    <section className="mt-4 rounded-2xl border border-[#DCE5D9] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={UsersRound} title="员工学习进度" detail="查看岗位、当前任务、今日学习时长和累计学习时长。点击一行打开能力画像。" /><span className="text-[10px] font-semibold text-[#899588]">共 {data.members.length} 人</span></div>
      <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[780px] text-left"><thead><tr className="border-b border-[#E6ECE3] text-[10px] font-bold text-[#899588]"><th className="px-3 py-2">成员</th><th className="px-3 py-2">岗位</th><th className="px-3 py-2">当前任务</th><th className="px-3 py-2">进度</th><th className="px-3 py-2">今日学习</th><th className="px-3 py-2">状态</th><th className="px-3 py-2" /></tr></thead><tbody>{data.members.map((member) => <MemberRow key={member.id} member={member} onClick={onMemberClick} />)}</tbody></table></div>
      <div className="mt-4 space-y-2.5 md:hidden">{data.members.map((member) => <button type="button" key={member.id} onClick={() => onMemberClick(member)} className="w-full rounded-xl border border-[#E6ECE3] bg-[#FBFDFB] p-3 text-left"><div className="flex items-start justify-between gap-3"><div><strong className="text-xs text-[#334934]">{member.name}</strong><p className="mt-1 text-[10px] text-[#748273]">{member.job_title}</p></div><ChevronRight className="size-4 text-[#9AA598]" /></div><div className="mt-3 flex items-center justify-between text-[10px] text-[#748273]"><span>任务进度 {member.progress}%</span><span>今日 {member.today_minutes} 分钟</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E9EFE7]"><div className="h-full rounded-full bg-[#6D9A68]" style={{ width: `${member.progress}%` }} /></div></button>)}</div>
    </section>

    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] leading-5 text-[#899588]"><span className="rounded-full bg-[#F7F3EA] px-2 py-1 font-bold text-[#8B7042]">数据口径</span><span>{data.meta.data_note}</span></div>
  </>
}

function MemberRow({ member, onClick }: { member: Member; onClick: (member: Member) => void }) {
  return <tr className="group border-b border-[#EEF2EC] text-xs transition hover:bg-[#FBFDFB]"><td className="px-3 py-3"><button type="button" onClick={() => onClick(member)} className="flex items-center gap-2.5 text-left"><span className="grid size-8 place-items-center rounded-full bg-[#E8F1E5] text-[11px] font-black text-[#52704D]">{member.name.slice(0, 1)}</span><span><strong className="font-bold text-[#334934]">{member.name}</strong></span></button></td><td className="px-3 py-3 text-[10px] text-[#748273]">{member.job_title}</td><td className="max-w-[230px] px-3 py-3 text-[10px] text-[#748273]"><span className="block truncate">{member.current_task?.title || "暂无进行中任务"}</span>{member.current_task && <span className="mt-1 block text-[9px] text-[#9AA598]">{assignmentStatus[member.current_task.status] || member.current_task.status}</span>}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#E9EFE7]"><div className="h-full rounded-full bg-[#6D9A68]" style={{ width: `${member.progress}%` }} /></div><span className="text-[10px] font-bold text-[#52704D]">{member.progress}%</span></div></td><td className="px-3 py-3 text-[10px] font-bold text-[#52704D]">{member.today_minutes} 分钟</td><td className="px-3 py-3"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", member.active_today ? "bg-[#DDF2E9] text-[#18745E]" : "bg-[#F0F2EF] text-[#7A8677]")}>{member.active_today ? "今日活跃" : "待学习"}</span></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => onClick(member)} aria-label={`查看${member.name}详情`} className="rounded-lg p-1.5 text-[#80907F] hover:bg-[#EAF4E7] hover:text-[#52704D]"><ChevronRight className="size-4" /></button></td></tr>
}

function MemberDrawer({ detail, loading, onClose }: { detail: MemberDetail | null; loading: boolean; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-[#18232D]/25" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[#DCE5D9] bg-[#FFFEFA] p-5 shadow-[-16px_0_40px_rgba(24,35,45,.14)] sm:p-7" role="dialog" aria-modal="true" aria-label="员工学习详情"><div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-extrabold tracking-[.14em] text-[#668064]">成员学习画像</span><h2 className="mt-1 text-xl font-bold text-[#293D2A]">{detail?.member.name || "正在读取"}</h2><p className="mt-1 text-xs text-[#7A8677]">{detail?.member.job_title || "请稍候加载成员信息"}</p></div><button type="button" onClick={onClose} aria-label="关闭详情" className="rounded-xl border border-[#D7E1D4] p-2 text-[#667566] hover:bg-[#F0F6EE]"><X className="size-4" /></button></div>{loading ? <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#52704D]" /></div> : detail && <><div className="mt-5 grid grid-cols-3 gap-2"><MiniMetric label="任务进度" value={`${detail.member.progress}%`} /><MiniMetric label="今日学习" value={`${detail.member.today_minutes} 分钟`} /><MiniMetric label="近 30 日" value={`${detail.member.total_minutes} 分钟`} /></div><section className="mt-5 rounded-2xl border border-[#DCE5D9] bg-[#F7FBF5] p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-[#334934]">7 日学习时长</h3><Clock3 className="size-4 text-[#6D9168]" /></div><div className="mt-5 flex h-32 items-end gap-2">{detail.learning_trend.map((item) => { const max = Math.max(...detail.learning_trend.map((value) => value.minutes), 1); return <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1"><span className="text-[9px] font-bold text-[#6B7E69]">{item.minutes || ""}</span><div className="flex h-20 w-full items-end"><div className="w-full rounded-t-md bg-[#79A173] transition-all" style={{ height: `${Math.max(item.minutes ? 8 : 2, item.minutes / max * 100)}%` }} /></div><span className="text-[9px] text-[#899588]">{item.date}</span></div> })}</div><p className="mt-3 text-[10px] leading-4 text-[#899588]">时长来自成员账号在系统内产生的有效页面停留事件，当前不含线下培训。</p></section><section className="mt-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-[#334934]">能力掌握</h3><span className="text-[10px] text-[#899588]">L0-L3</span></div><div className="mt-3 space-y-3">{detail.capabilities.map((capability) => <div key={capability.id}><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-bold text-[#334934]">{capability.name}</span><span className="font-bold text-[#52704D]">L{capability.level} · {capability.score} 分</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E9EFE7]"><div className="h-full rounded-full bg-[#5C8C62]" style={{ width: `${capability.score}%` }} /></div><p className="mt-1 text-[10px] text-[#899588]">证据：{capability.evidence}</p></div>)}</div><p className="mt-3 rounded-xl bg-[#F7F3EA] px-3 py-2.5 text-[10px] leading-4 text-[#8B7042]">{detail.member.capability_note}</p></section><section className="mt-5"><h3 className="text-sm font-bold text-[#334934]">任务历史</h3><div className="mt-3 space-y-2">{detail.task_history.length ? detail.task_history.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E6ECE3] bg-white p-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-[#334934]">{task.title}</p><p className="mt-1 text-[10px] text-[#899588]">{task.target_role || "全员"} · {task.due_label}</p></div><span className={cn("shrink-0 rounded-full px-2 py-1 text-[9px] font-bold", task.status === "completed" ? "bg-[#DDF2E9] text-[#18745E]" : "bg-[#E7F0FF] text-[#2E65B2]")}>{assignmentStatus[task.status] || task.status}</span></div>) : <Empty text="该成员暂未分配任务" />}</div></section></>}</aside></div>
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof UsersRound; label: string; value: string; detail: string; tone: "blue" | "green" | "gold" | "teal" }) {
  const colors = { blue: "bg-[#E7EDF8] text-[#315E83]", green: "bg-[#EAF4E7] text-[#52704D]", gold: "bg-[#FFF1D9] text-[#946B27]", teal: "bg-[#E4F2F0] text-[#34736D]" }
  return <article className="rounded-2xl border border-[#DCE5D9] bg-white p-4"><span className={cn("grid size-9 place-items-center rounded-xl", colors[tone])}><Icon className="size-4" /></span><strong className="mt-3 block text-xl font-black text-[#293D2A]">{value}</strong><span className="mt-1 block text-[10px] font-bold text-[#63735F]">{label}</span><span className="mt-1 block text-[10px] text-[#899588]">{detail}</span></article>
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#E0E9DE] bg-white p-3"><strong className="block text-base font-black text-[#52704D]">{value}</strong><span className="mt-1 block text-[10px] font-bold text-[#899588]">{label}</span></div> }
function SectionHeading({ icon: Icon, title, detail }: { icon: typeof BarChart3; title: string; detail: string }) { return <div className="flex items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EAF4E7] text-[#52704D]"><Icon className="size-4" /></span><div><h2 className="text-base font-bold text-[#293D2A]">{title}</h2><p className="mt-1 text-[10px] leading-4 text-[#7A8677]">{detail}</p></div></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-[#D8E4D5] bg-[#FBFDFB] px-4 py-8 text-center text-xs text-[#7A8677]">{text}</div> }
function formatTime(value: string | null) { if (!value) return "刚刚"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }
