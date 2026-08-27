import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet } from "@/lib/api"
import { cn } from "@/lib/utils"

type View = "overview" | "enterprises" | "users" | "content"
type Summary = Record<string, number>
type Enterprise = {
  id: number
  name: string
  status: string
  invite_code: string
  owner: { name: string }
  member_count: number
  published_task_count: number
  knowledge_base_count: number
  assignment_count: number
  completion_rate: number
  created_at: string | null
}
type Overview = { generated_at: string; summary: Summary; trend: { date: string; active_users: number; minutes: number }[]; enterprises: Enterprise[] }
type AdminUser = {
  id: number
  name: string
  email: string | null
  role: string
  learner_type: string
  study_stage: string
  company: string
  target_role: string
  is_active: boolean
  enterprise: { id: number; name: string } | null
  enterprise_job_title: string
  created_at: string | null
}
type Content = { courses: number; knowledge_chunks: number; enterprise_knowledge_bases: number; resources: number; training_runs: Record<string, number>; enterprise_tasks: number; indexed_documents: number; generated_today: number; pending_reviews: number; active_services: number; service_total: number; storage_gb: number; feedback_count: number; updated_at: string }

const tabs: { id: View; label: string; detail: string }[] = [
  { id: "overview", label: "平台总览", detail: "全局运营概况" },
  { id: "enterprises", label: "企业管理", detail: "组织与任务规模" },
  { id: "users", label: "用户与成员", detail: "账号与归属关系" },
  { id: "content", label: "内容与运行", detail: "知识库和服务状态" },
]

export function AdminDashboard() {
  const [params] = useSearchParams()
  const rawView = params.get("view") as View | null
  const view: View = tabs.some((tab) => tab.id === rawView) ? rawView as View : "overview"
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [content, setContent] = useState<Content | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const nextOverview = await apiGet<Overview>("/admin/overview")
      setOverview(nextOverview)
      if (view === "users") {
        const result = await apiGet<{ items: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`)
        setUsers(result.items)
      }
      if (view === "content") setContent(await apiGet<Content>("/admin/content"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "系统管理数据暂时无法加载")
    } finally {
      setLoading(false)
    }
  }, [query, view])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [query, view])

  return (
    <main className="app-page paper-theme min-h-dvh bg-[#F3F0E7] px-3 pb-8 pt-3 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1500px]">
        <AppTopbar current="home" appearance="paper" labelOverride="系统管理工作台" groupOverride="平台运营" selectionLabel="全平台" />
        <header className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-[#E1CFC6] bg-[#FFF9F5] p-5 shadow-[0_14px_38px_rgba(120,76,58,.07)] sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold tracking-[.14em] text-[#9A4E35]"><ShieldCheck className="size-4" />SYSTEM OPERATIONS</div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#3D2922] sm:text-3xl">看清平台正在发生什么</h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[#7E6C64]">从系统管理员视角查看企业培训规模、学习活动、内容资产和运行状态。企业任务仍由企业管理员负责发布。</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DFC8BE] bg-white px-3 text-xs font-bold text-[#9A4E35] hover:bg-[#FFF2EC] disabled:opacity-50"><RefreshCw className={cn("size-4", loading && "animate-spin")} />刷新数据</button>
        </header>

        {error && <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-[#DFC8BE] bg-[#FFF5F0] px-4 py-3 text-xs font-semibold text-[#9A4E35]"><CircleAlert className="size-4" />{error}</div>}
        {loading && !overview ? <div className="grid min-h-[35vh] place-items-center"><RefreshCw className="size-6 animate-spin text-[#9A4E35]" /></div> : overview && <>
          {view === "overview" && <OverviewView data={overview} />}
          {view === "enterprises" && <PaginatedEnterpriseView items={overview.enterprises} />}
          {view === "users" && <UserView users={users} query={query} setQuery={setQuery} onSearch={() => void load()} page={page} setPage={setPage} />}
          {view === "content" && <ContentView data={content} />}
        </>}
      </div>
    </main>
  )
}

function OverviewView({ data }: { data: Overview }) {
  const s = data.summary
  const metrics = [
    [UsersRound, "平台用户", s.user_count ?? 0, `${s.active_today ?? 0} 人今日活跃`, "blue"],
    [Building2, "接入企业", s.enterprise_count ?? 0, `${s.member_count ?? 0} 名企业成员`, "coral"],
    [FileCheck2, "已发布任务", s.published_task_count ?? 0, `完成率 ${s.completion_rate ?? 0}%`, "gold"],
    [Activity, "今日学习", `${s.today_minutes ?? 0} 分钟`, `${s.active_today ?? 0} 人产生学习活动`, "green"],
  ] as const
  const maxMinutes = Math.max(...data.trend.map((item) => item.minutes), 1)
  return <>
    <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([Icon, label, value, detail, tone]) => <article key={label} className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-4"><span className={cn("grid size-9 place-items-center rounded-xl", tone === "blue" && "bg-[#E7EDF3] text-[#315E83]", tone === "coral" && "bg-[#F4E8E2] text-[#9A4E35]", tone === "gold" && "bg-[#F4ECD8] text-[#946B27]", tone === "green" && "bg-[#EAF4E7] text-[#52704D]")}><Icon className="size-4" /></span><strong className="mt-3 block text-xl font-black text-[#2D3739]">{value}</strong><span className="mt-1 block text-[10px] font-bold text-[#68736F]">{label}</span><span className="mt-1 block text-[10px] text-[#9AA09B]">{detail}</span></article>)}</section>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
      <section className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><SectionHeading icon={Activity} title="近 7 日学习活动" detail="按有效页面停留事件聚合，单位为分钟。" /><div className="mt-5 flex h-40 items-end gap-2 sm:gap-4">{data.trend.map((item) => <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1"><span className="text-[9px] font-bold text-[#7A817E]">{item.minutes || ""}</span><div className="flex h-24 w-full items-end"><div className="w-full rounded-t-lg bg-[#6D8DA5] transition-all" style={{ height: `${Math.max(item.minutes ? 10 : 3, item.minutes / maxMinutes * 100)}%` }} /></div><span className="text-[9px] text-[#9AA09B]">{item.date}</span></div>)}</div></section>
      <section className="rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><SectionHeading icon={Database} title="平台内容资产" detail="系统岗位内容与企业资料的总体规模。" /><div className="mt-4 space-y-3"><Stat label="系统岗位课程" value={s.course_count ?? 0} /><Stat label="知识库分片" value={s.knowledge_chunk_count ?? 0} /><Stat label="企业岗位知识库" value={s.knowledge_base_count ?? 0} /><Stat label="生成资源" value={s.resource_count ?? 0} /></div></section>
    </div>
    <section className="mt-4 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><SectionHeading icon={Building2} title="企业运营速览" detail="展示近期活跃企业的成员、任务与培训完成情况。" /><div className="mt-4 grid gap-2 md:grid-cols-2">{data.enterprises.slice(0, 6).map((item) => <EnterpriseRow key={item.id} item={item} />)}</div></section>
  </>
}

function EnterpriseView({ items, total = items.length }: { items: Enterprise[]; total?: number }) { return <section className="mt-4 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><SectionHeading icon={Building2} title="企业管理" detail={`平台当前接入 ${total} 家企业，集中展示平台侧运营规模。`} /><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[#E7E2D8] text-[10px] font-bold text-[#929994]"><tr><th className="px-3 py-2">企业</th><th className="px-3 py-2">成员</th><th className="px-3 py-2">任务</th><th className="px-3 py-2">资料库</th><th className="px-3 py-2">完成率</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-[#F0ECE4]"><td className="px-3 py-3"><strong className="text-[#334934]">{item.name}</strong><span className="mt-1 block text-[10px] text-[#9AA09B]">邀请码 {item.invite_code}</span></td><td className="px-3 py-3 font-bold text-[#52704D]">{item.member_count}</td><td className="px-3 py-3 text-[#748078]">{item.published_task_count} 已发布</td><td className="px-3 py-3 text-[#748078]">{item.knowledge_base_count}</td><td className="px-3 py-3"><span className="rounded-full bg-[#EAF4E7] px-2 py-1 text-[10px] font-bold text-[#52704D]">{item.completion_rate}%</span></td></tr>)}</tbody></table></div></section> }

function PaginatedEnterpriseView({ items }: { items: Enterprise[] }) {
  const pageSize = 8
  const [enterprisePage, setEnterprisePage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(enterprisePage, pageCount)
  const pageItems = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, safePage])
  return <><EnterpriseView items={pageItems} total={items.length} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-4 py-3"><span className="text-[10px] text-[#89928C]">共 {items.length} 家企业 · 第 {safePage} / {pageCount} 页</span><div className="flex items-center gap-2"><button type="button" onClick={() => setEnterprisePage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D7D1C4] bg-white px-3 text-[10px] font-bold text-[#68736F] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-3.5" />上一页</button><button type="button" onClick={() => setEnterprisePage(Math.min(pageCount, safePage + 1))} disabled={safePage === pageCount} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D7D1C4] bg-white px-3 text-[10px] font-bold text-[#68736F] disabled:cursor-not-allowed disabled:opacity-40">下一页<ChevronRight className="size-3.5" /></button></div></div></>
}

function UserView({ users, query, setQuery, onSearch, page, setPage }: { users: AdminUser[]; query: string; setQuery: (value: string) => void; onSearch: () => void; page: number; setPage: (value: number) => void }) {
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => users.slice((safePage - 1) * pageSize, safePage * pageSize), [safePage, users])
  return <section className="mt-4 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={UsersRound} title="用户与成员" detail={`共 ${users.length} 条账号记录，每页展示 ${pageSize} 条。`} /><div className="flex h-10 w-full max-w-xs items-center gap-2 rounded-lg border border-[#D7D1C4] bg-white px-2.5"><Search className="size-3.5 text-[#9AA09B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch() }} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="搜索姓名或邮箱" /><button type="button" onClick={onSearch} className="h-8 px-2 text-[10px] font-bold text-[#9A4E35]">查询</button></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-[#E7E2D8] text-[10px] font-bold text-[#929994]"><tr><th className="px-3 py-2">用户</th><th className="px-3 py-2">系统角色</th><th className="px-3 py-2">身份</th><th className="px-3 py-2">企业归属</th><th className="px-3 py-2">目标岗位</th><th className="px-3 py-2">状态</th></tr></thead><tbody>{pageItems.map((item) => <tr key={item.id} className="border-b border-[#F0ECE4]"><td className="px-3 py-3"><strong className="text-[#334934]">{item.name}</strong><span className="mt-1 block text-[10px] text-[#9AA09B]">{item.email}</span></td><td className="px-3 py-3"><RoleBadge role={item.role} /></td><td className="px-3 py-3 text-[10px] text-[#748078]">{item.learner_type === "worker" ? `从业者 · ${item.company || "未填写公司"}` : item.role === "student" ? `学生 · ${item.study_stage || "未填写阶段"}` : "平台管理"}</td><td className="px-3 py-3 text-[10px] text-[#748078]">{item.enterprise?.name || "未加入企业"}{item.enterprise_job_title && <span className="mt-1 block text-[#9AA09B]">{item.enterprise_job_title}</span>}</td><td className="px-3 py-3 text-[10px] text-[#748078]">{item.target_role || "未选择"}</td><td className="px-3 py-3"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", item.is_active ? "bg-[#EAF4E7] text-[#52704D]" : "bg-[#F4E8E2] text-[#9A4E35]")}>{item.is_active ? "正常" : "已停用"}</span></td></tr>)}</tbody></table>{!users.length && <div className="py-12 text-center text-xs text-[#8B938D]">没有匹配的用户</div>}</div>{users.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E7E2D8] pt-4"><span className="text-[10px] text-[#89928C]">第 {safePage} / {pageCount} 页 · 当前显示 {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, users.length)} 条</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D7D1C4] bg-white px-3 text-[10px] font-bold text-[#68736F] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-3.5" />上一页</button><button type="button" onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage === pageCount} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D7D1C4] bg-white px-3 text-[10px] font-bold text-[#68736F] disabled:cursor-not-allowed disabled:opacity-40">下一页<ChevronRight className="size-3.5" /></button></div></div>}</section>
}

function ContentView({ data }: { data: Content | null }) { return <section className="mt-4 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-5"><SectionHeading icon={Database} title="内容与运行" detail="汇总平台内容资产与训练任务运行情况。" />{data ? <><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="岗位课程" value={data.courses} /><Stat label="知识库分片" value={data.knowledge_chunks} /><Stat label="已索引文档" value={data.indexed_documents} /><Stat label="企业资料库" value={data.enterprise_knowledge_bases} /><Stat label="企业任务" value={data.enterprise_tasks} /><Stat label="生成资源" value={data.resources} /><Stat label="今日新生成" value={data.generated_today} /><Stat label="待复核内容" value={data.pending_reviews} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><StatusCard label="训练运行记录" value={Object.values(data.training_runs).reduce((sum, item) => sum + item, 0)} icon={Activity} tone="green" /><StatusCard label="运行中任务" value={data.training_runs.running || 0} icon={RefreshCw} tone="gold" /><StatusCard label="已完成训练" value={data.training_runs.completed || 0} icon={CheckCircle2} tone="teal" /><StatusCard label="可用服务" value={data.active_services} icon={ShieldCheck} tone="blue" /><StatusCard label="内容存储（GB）" value={data.storage_gb} icon={Database} tone="green" /><StatusCard label="累计反馈" value={data.feedback_count} icon={CircleAlert} tone="gold" /></div><p className="mt-4 text-[10px] text-[#9AA09B]">数据更新时间：{new Date(data.updated_at).toLocaleString("zh-CN")}</p></> : <div className="py-12 text-center text-xs text-[#8B938D]">正在加载内容状态</div>}</section> }

function EnterpriseRow({ item }: { item: Enterprise }) { return <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E2D8] bg-white p-3.5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#F4E8E2] text-[#9A4E35]"><Building2 className="size-4" /></span><div><strong className="block text-xs text-[#334934]">{item.name}</strong><span className="mt-1 block text-[10px] text-[#89928C]">{item.member_count} 名成员 · {item.published_task_count} 个已发布任务</span></div></div><span className="rounded-full bg-[#EAF4E7] px-2 py-1 text-[10px] font-bold text-[#52704D]">完成率 {item.completion_rate}%</span></article> }
function SectionHeading({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail: string }) { return <div className="flex items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#F4E8E2] text-[#9A4E35]"><Icon className="size-4" /></span><div><h2 className="text-base font-bold text-[#334934]">{title}</h2><p className="mt-1 text-[10px] leading-4 text-[#89928C]">{detail}</p></div></div> }
function Stat({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-xl border border-[#E7E2D8] bg-white px-3.5 py-3"><span className="text-[10px] font-bold text-[#89928C]">{label}</span><strong className="text-lg font-black text-[#334934]">{value}</strong></div> }
function StatusCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Activity; tone: string }) { return <div className="flex items-center gap-3 rounded-xl border border-[#E7E2D8] bg-white p-4"><span className={cn("grid size-9 place-items-center rounded-xl", tone === "blue" && "bg-[#E7EDF3] text-[#315E83]", tone === "green" && "bg-[#EAF4E7] text-[#52704D]", tone === "gold" && "bg-[#F4ECD8] text-[#946B27]", tone === "teal" && "bg-[#E4F2F0] text-[#34736D]")}><Icon className="size-4" /></span><div><strong className="block text-lg text-[#334934]">{value}</strong><span className="text-[10px] font-bold text-[#89928C]">{label}</span></div></div> }
function RoleBadge({ role }: { role: string }) { const labels: Record<string, string> = { admin: "系统管理员", enterprise_admin: "企业管理员", judge: "评委", student: "学生", worker: "从业者" }; return <span className="rounded-full bg-[#E7EDF3] px-2 py-1 text-[10px] font-bold text-[#315E83]">{labels[role] || role}</span> }
