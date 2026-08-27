import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  FilePlus2,
  KeyRound,
  Library,
  Loader2,
  Plus,
  Send,
  UsersRound,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet, apiPost } from "@/lib/api"
import { cn } from "@/lib/utils"
import { setCurrentCourse, type CourseInfo } from "@/store/course"
import { setTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"

type Context = {
  name: string
  learner_type: "student" | "worker"
  study_stage: string
  company: string
  target_role: string
  enterprise: { id: number; name: string; invite_code?: string | null; member_role: string } | null
}

type Task = {
  id: number
  title: string
  description: string
  task_type: "training" | "reading"
  target_role: string
  material_title: string
  material_content: string
  knowledge_base_id: number | null
  status: "draft" | "published" | "expired"
  assignment_status?: "pending" | "accepted" | "in_progress" | "completed" | null
  due_label: string
  knowledge_base?: { source_course_id?: number | null } | null
}

type KnowledgeBase = { id: number; name: string; target_role: string; source_course_id?: number | null; description: string; materials: Array<{ title?: string; detail?: string; type?: string }>; material_count: number }

const taskStatus: Record<string, string> = { pending: "待接受", accepted: "已接受", in_progress: "进行中", completed: "已完成", draft: "草稿", published: "已发布", expired: "已过期" }

export function EnterpriseHub() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isAdmin = user?.role === "enterprise_admin"
  const [context, setContext] = useState<Context | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const rawView = params.get("view")
  const tab: "tasks" | "knowledge" | "members" = rawView === "knowledge" || rawView === "members" ? rawView : "tasks"
  const [taskView, setTaskView] = useState<"pending" | "completed">("pending")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [inviteCode, setInviteCode] = useState("SM-DEMO")
  const [taskForm, setTaskForm] = useState({ title: "", description: "", task_type: "training" as "training" | "reading", target_role: user?.target_role || "", material_title: "", material_content: "", knowledge_base_id: "", due_label: "本周完成" })
  const [knowledgeForm, setKnowledgeForm] = useState({ name: "", target_role: user?.target_role || "", description: "", materials: "" })
  const [memberText, setMemberText] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      if (isAdmin) {
        const enterprise = await apiGet<Context["enterprise"]>("/enterprise/context")
        const [taskResult, knowledgeResult] = await Promise.all([
          apiGet<{ items: Task[] }>("/enterprise/tasks"),
          apiGet<{ items: KnowledgeBase[] }>("/enterprise/knowledge-bases"),
        ])
        setContext((current) => ({ ...(current || { name: user?.name || "", learner_type: "worker", study_stage: "", company: "", target_role: "" }), enterprise }))
        setTasks(taskResult.items)
        setKnowledgeBases(knowledgeResult.items)
      } else {
        const [learner, taskResult] = await Promise.all([
          apiGet<Context>("/learner/context"),
          apiGet<{ items: Task[] }>("/learner/tasks"),
        ])
        setContext(learner)
        setTasks(taskResult.items)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "企业空间暂时无法打开")
    } finally {
      setLoading(false)
    }
  }, [isAdmin, user?.name])

  useEffect(() => { void load() }, [load])

  const join = async () => {
    setBusy("join")
    try { setContext(await apiPost<Context>("/learner/join", { invite_code: inviteCode.trim() })); await load() }
    catch (err) { setError(err instanceof Error ? err.message : "加入企业失败") }
    finally { setBusy("") }
  }

  const acceptTask = async (task: Task) => {
    setBusy(`task-${task.id}`)
    try {
      const next = await apiPost<Task>(`/learner/tasks/${task.id}/accept`)
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, ...next } : item))
    } catch (err) { setError(err instanceof Error ? err.message : "接受任务失败") }
    finally { setBusy("") }
  }

  const openTask = async (task: Task) => {
    if (task.assignment_status === "pending") await acceptTask(task)
    if (task.task_type === "reading") navigate(`/enterprise/tasks/${task.id}/read`)
    else {
      try {
        await apiPost(`/learner/tasks/${task.id}/start`)
        const courseId = task.knowledge_base?.source_course_id
        if (courseId) {
          const courses = await apiGet<{ items: CourseInfo[] }>("/courses")
          const course = courses.items.find((item) => item.id === courseId)
          if (course) {
            setCurrentCourse(course)
            setTargetRole({ domainId: "software", roleId: "fde" })
          }
        }
      } catch { /* detail page will show the state */ }
      navigate("/competency")
    }
  }

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy("task-create")
    setError("")
    try {
      await apiPost("/enterprise/tasks", { ...taskForm, knowledge_base_id: taskForm.knowledge_base_id ? Number(taskForm.knowledge_base_id) : null, publish: true })
      setTaskForm({ title: "", description: "", task_type: "training", target_role: user?.target_role || "", material_title: "", material_content: "", knowledge_base_id: "", due_label: "本周完成" })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : "任务发布失败") }
    finally { setBusy("") }
  }

  const createKnowledge = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy("knowledge-create")
    try {
      const materials = knowledgeForm.materials.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ title: line, type: "企业资料", detail: "可被同岗位的多个企业任务复用" }))
      await apiPost("/enterprise/knowledge-bases", { ...knowledgeForm, materials })
      setKnowledgeForm({ name: "", target_role: user?.target_role || "", description: "", materials: "" })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : "知识库创建失败") }
    finally { setBusy("") }
  }

  const importMembers = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy("members")
    try {
      const members = memberText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [name, email] = line.split(",").map((part) => part.trim()); return { name, email: email || name } })
      const result = await apiPost<{ message: string }>("/enterprise/members/import", { members })
      setMemberText("")
      setError(result.message)
    } catch (err) { setError(err instanceof Error ? err.message : "名单导入失败") }
    finally { setBusy("") }
  }

  const learnerTasks = useMemo(() => tasks.filter((task) => task.status !== "expired"), [tasks])
  const completedCount = learnerTasks.filter((task) => task.assignment_status === "completed").length

  return (
    <main className="app-page paper-theme min-h-dvh pb-12">
      <div className="mx-auto max-w-[1440px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="home" appearance="paper" labelOverride={isAdmin ? "企业管理员工作台" : "企业任务中心"} groupOverride="企业培训协作" selectionLabel={context?.enterprise?.name || (isAdmin ? "河南本线商贸有限公司" : "尚未加入企业")} />
        <section className="mt-4 overflow-hidden rounded-[26px] border border-[#D6E2D4] bg-[#F4F9F2] p-5 shadow-[0_14px_38px_rgba(59,92,58,.08)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl"><span className="inline-flex items-center gap-2 text-[10px] font-extrabold tracking-[.14em] text-[#5B7658]"><BriefcaseBusiness className="size-4" />{isAdmin ? "企业组织 · 任务与资料" : "学习者入口 · 企业任务"}</span><h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#243827] sm:text-3xl">{isAdmin ? "把岗位训练发布给正确的人" : context?.enterprise ? `今天先完成 ${context.enterprise.name} 的任务` : "接入企业任务，继续岗位训练"}</h1><p className="mt-2 text-sm leading-6 text-[#657661]">{isAdmin ? "企业管理员可以按岗位发布训练任务或普通阅读资料，并复用同一套岗位知识库。" : "企业任务与个人岗位训练中心相互衔接；培训任务进入能力路径，阅读任务保留独立资料页。"}</p></div>
            <div className={cn("grid min-w-[240px] gap-2", isAdmin ? "grid-cols-2" : "grid-cols-3")}>{isAdmin ? <><InfoChip icon={ClipboardList} label="已发布任务" value={`${tasks.length}`} /><InfoChip icon={Library} label="岗位资料库" value={`${knowledgeBases.length} 个`} /></> : <><InfoChip icon={ClipboardList} label="当前任务" value={`${learnerTasks.length - completedCount}`} /><InfoChip icon={Check} label="已完成任务" value={`${completedCount}`} /><InfoChip icon={Library} label="岗位资料库" value={context?.enterprise ? "已授权" : "待加入"} /></>}</div>
          </div>
        </section>

        {error && <div role="alert" className="mt-4 rounded-xl border border-[#E4C9BE] bg-[#FFF7F3] px-4 py-3 text-xs font-semibold text-[#A25139]">{error}</div>}
        {loading ? <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#52704D]" /></div> : isAdmin ? <AdminView tab={tab} context={context} tasks={tasks} knowledgeBases={knowledgeBases} taskForm={taskForm} setTaskForm={setTaskForm} knowledgeForm={knowledgeForm} setKnowledgeForm={setKnowledgeForm} memberText={memberText} setMemberText={setMemberText} busy={busy} createTask={createTask} createKnowledge={createKnowledge} importMembers={importMembers} /> : <LearnerView context={context} tasks={learnerTasks} taskView={taskView} setTaskView={setTaskView} inviteCode={inviteCode} setInviteCode={setInviteCode} busy={busy} join={join} openTask={openTask} />}
      </div>
    </main>
  )
}

function AdminView(props: {
  tab: "tasks" | "knowledge" | "members"
  context: Context | null
  tasks: Task[]
  knowledgeBases: KnowledgeBase[]
  taskForm: { title: string; description: string; task_type: "training" | "reading"; target_role: string; material_title: string; material_content: string; knowledge_base_id: string; due_label: string }
  setTaskForm: (value: AdminViewProps["taskForm"]) => void
  knowledgeForm: { name: string; target_role: string; description: string; materials: string }
  setKnowledgeForm: (value: AdminViewProps["knowledgeForm"]) => void
  memberText: string
  setMemberText: (value: string) => void
  busy: string
  createTask: (event: React.FormEvent) => void
  createKnowledge: (event: React.FormEvent) => void
  importMembers: (event: React.FormEvent) => void
}) {
  const { tab, context, tasks, knowledgeBases, taskForm, setTaskForm, knowledgeForm, setKnowledgeForm, memberText, setMemberText, busy, createTask, createKnowledge, importMembers } = props
  return <>
    {tab === "tasks" && <section className="mt-4 grid gap-4 xl:grid-cols-[390px_minmax(0,1.1fr)]"><TaskComposer form={taskForm} setForm={setTaskForm} knowledgeBases={knowledgeBases} busy={busy} onSubmit={createTask} /><div className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={ClipboardList} title="已发布任务" detail="培训任务与普通阅读任务使用同一发布入口。" /><div className="mt-4 space-y-2.5">{tasks.length ? tasks.map((task) => <div key={task.id} className="rounded-xl border border-[#E6ECE3] bg-[#FBFDFB] p-3.5"><div className="flex items-start justify-between gap-3"><div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", task.task_type === "training" ? "bg-[#E7EDF8] text-[#315E83]" : "bg-[#FFF1D9] text-[#946B27]")}>{task.task_type === "training" ? "岗位训练" : "普通阅读"}</span><h3 className="mt-2 text-sm font-bold text-[#293D2A]">{task.title}</h3></div><span className="rounded-full bg-[#EAF4E7] px-2 py-1 text-[9px] font-bold text-[#52704D]">{taskStatus[task.status]}</span></div><p className="mt-2 text-xs leading-5 text-[#738071]">{task.description || "暂无任务说明"}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#7C8879]"><span>目标岗位：{task.target_role || "全员"}</span><span>·</span><span>{task.due_label}</span></div></div>) : <EmptyState text="还没有任务，请创建第一条企业任务。" />}</div></div></section>}
    {tab === "knowledge" && <section className="mt-4 grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]"><form onSubmit={createKnowledge} className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={FilePlus2} title="创建岗位资料库" detail="先建岗位范围，再逐条补充材料。" /><TextInput label="知识库名称" value={knowledgeForm.name} onChange={(value) => setKnowledgeForm({ ...knowledgeForm, name: value })} placeholder="例如：FDE 入职资料库" required /><TextInput label="目标岗位" value={knowledgeForm.target_role} onChange={(value) => setKnowledgeForm({ ...knowledgeForm, target_role: value })} placeholder="例如：前线部署工程师" required /><TextArea label="用途说明" value={knowledgeForm.description} onChange={(value) => setKnowledgeForm({ ...knowledgeForm, description: value })} placeholder="这套资料解决什么岗位问题？" /><TextArea label="资料条目（每行一条）" value={knowledgeForm.materials} onChange={(value) => setKnowledgeForm({ ...knowledgeForm, materials: value })} placeholder="岗位交付检查清单\n现场问题复盘模板" /><button disabled={busy === "knowledge-create"} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#52704D] px-4 text-xs font-bold text-white disabled:opacity-50">{busy === "knowledge-create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}创建知识库</button></form><div className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={Library} title="按岗位复用的企业知识库" detail="同一岗位的多个任务可以绑定同一资料集合。" /><div className="mt-4 grid gap-3 md:grid-cols-2">{knowledgeBases.length ? knowledgeBases.map((item) => <article key={item.id} className="rounded-xl border border-[#E3EBDD] bg-[#FBFDFB] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#293D2A]">{item.name}</h3><p className="mt-1 text-[10px] font-semibold text-[#668064]">{item.target_role}</p></div><span className="rounded-full bg-[#EAF4E7] px-2 py-1 text-[9px] font-bold text-[#52704D]">{item.material_count} 份资料</span></div><p className="mt-3 text-xs leading-5 text-[#738071]">{item.description || "暂无说明"}</p><div className="mt-3 space-y-1">{item.materials.slice(0, 3).map((material, index) => <div key={`${item.id}-${index}`} className="flex gap-2 text-[10px] text-[#778477]"><Check className="mt-0.5 size-3 text-[#6F976B]" />{material.title}</div>)}</div></article>) : <EmptyState text="创建岗位知识库后，任务可以直接复用它。" />}</div></div></section>}
    {tab === "members" && <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]"><div className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={KeyRound} title="企业邀请码" detail="把邀请码发给员工，员工加入后会看到已发布任务。" /><div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-[#AFC4A9] bg-[#F7FBF5] p-4"><span className="grid size-11 place-items-center rounded-xl bg-[#E5F0E2] text-[#52704D]"><KeyRound className="size-5" /></span><div><span className="block text-[10px] font-bold text-[#778477]">当前企业邀请码</span><strong className="mt-1 block text-xl tracking-[.14em] text-[#293D2A]">{context?.enterprise?.invite_code || "SM-DEMO"}</strong></div></div><p className="mt-4 text-xs leading-5 text-[#738071]">一个学习者只能属于一个企业；成员加入后，管理员可以给他分配岗位训练和普通阅读任务。</p></div><form onSubmit={importMembers} className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={UsersRound} title="导入员工名单" detail="每行使用：姓名,邮箱" /><TextArea label="名单" value={memberText} onChange={setMemberText} placeholder="张三,zhangsan@example.com\n李四,lisi@example.com" required /><button disabled={busy === "members"} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#52704D] px-4 text-xs font-bold text-white disabled:opacity-50">{busy === "members" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}导入名单</button></form></section>}
  </>
}

type AdminViewProps = Parameters<typeof AdminView>[0]

function LearnerView({ context, tasks, taskView, setTaskView, inviteCode, setInviteCode, busy, join, openTask }: { context: Context | null; tasks: Task[]; taskView: "pending" | "completed"; setTaskView: (value: "pending" | "completed") => void; inviteCode: string; setInviteCode: (value: string) => void; busy: string; join: () => void; openTask: (task: Task) => Promise<void> }) {
  const hasEnterprise = Boolean(context?.enterprise)
  const pendingTasks = tasks.filter((task) => task.assignment_status !== "completed")
  const completedTasks = tasks.filter((task) => task.assignment_status === "completed")
  const visibleTasks = taskView === "completed" ? completedTasks : pendingTasks
  return <>
    {!hasEnterprise ? <section className="mt-5 rounded-2xl border border-[#DCE5D9] bg-white p-6"><span className="text-[10px] font-extrabold tracking-[.14em] text-[#5B7658]">加入企业</span><h2 className="mt-2 text-xl font-bold text-[#293D2A]">输入邀请码，接收岗位任务</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#738071]">加入后只属于这个企业，企业管理员可以直接下发任务和查看训练状态。当前邀请码为 <strong className="text-[#52704D]">SM-DEMO</strong>。</p><div className="mt-5 flex max-w-md gap-2"><input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-[#D7E1D4] px-3 text-sm outline-none focus:border-[#52704D]" aria-label="企业邀请码" /><button type="button" onClick={join} disabled={busy === "join"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#52704D] px-4 text-xs font-bold text-white disabled:opacity-50">{busy === "join" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}加入企业</button></div></section> : <section className="mt-5 rounded-2xl border border-[#DCE5D9] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading icon={ClipboardList} title="我的企业任务" detail="培训任务进入岗位训练中心，阅读任务打开独立资料页。" /><div className="flex rounded-xl border border-[#D7E1D4] bg-[#F7F9F6] p-1"><button type="button" onClick={() => setTaskView("pending")} className={cn("h-9 rounded-lg px-3 text-[10px] font-bold transition", taskView === "pending" ? "bg-[#52704D] text-white shadow-sm" : "text-[#687667]")}>待完成 {pendingTasks.length}</button><button type="button" onClick={() => setTaskView("completed")} className={cn("h-9 rounded-lg px-3 text-[10px] font-bold transition", taskView === "completed" ? "bg-[#52704D] text-white shadow-sm" : "text-[#687667]")}>已完成 {completedTasks.length}</button></div></div><div className="mt-4 space-y-3">{visibleTasks.length ? visibleTasks.map((task) => <article key={task.id} className="rounded-xl border border-[#E3EBDD] bg-[#FBFDFB] p-4"><div className="flex items-start justify-between gap-3"><div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", task.task_type === "training" ? "bg-[#E7EDF8] text-[#315E83]" : "bg-[#FFF1D9] text-[#946B27]")}>{task.task_type === "training" ? "岗位训练任务" : "普通阅读任务"}</span><h3 className="mt-2 text-sm font-bold text-[#293D2A]">{task.title}</h3></div><span className="shrink-0 rounded-full bg-[#F0F4EE] px-2 py-1 text-[9px] font-bold text-[#63735F]">{taskStatus[task.assignment_status || "pending"]}</span></div><p className="mt-2 text-xs leading-5 text-[#738071]">{task.description}</p><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-[#7C8879]">{task.due_label} · {task.target_role || "全员"}</span><button type="button" onClick={() => void openTask(task)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#52704D] px-3 text-[10px] font-bold text-white">{task.assignment_status === "pending" ? "接受并打开" : task.task_type === "training" ? "进入岗位训练" : "打开资料"}<ArrowRight className="size-3.5" /></button></div></article>) : <EmptyState text={taskView === "completed" ? "还没有已完成任务。" : "当前没有待完成任务。"} />}</div></section>}
  </>
}

function TaskComposer({ form, setForm, knowledgeBases, busy, onSubmit }: { form: AdminViewProps["taskForm"]; setForm: AdminViewProps["setTaskForm"]; knowledgeBases: KnowledgeBase[]; busy: string; onSubmit: (event: React.FormEvent) => void }) {
  return <form onSubmit={onSubmit} className="rounded-2xl border border-[#DCE5D9] bg-white p-5"><SectionHeading icon={Plus} title="发布新任务" detail="支持训练中心任务与普通阅读任务。" /><TextInput label="任务标题" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="例如：完成一次部署风险核对" required /><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm({ ...form, task_type: "training" })} className={cn("h-9 rounded-lg text-xs font-bold", form.task_type === "training" ? "bg-[#E7EDF8] text-[#315E83]" : "bg-[#F5F7F4] text-[#7A8677]")}>岗位训练</button><button type="button" onClick={() => setForm({ ...form, task_type: "reading" })} className={cn("h-9 rounded-lg text-xs font-bold", form.task_type === "reading" ? "bg-[#FFF1D9] text-[#946B27]" : "bg-[#F5F7F4] text-[#7A8677]")}>普通阅读</button></div><TextInput label="目标岗位" value={form.target_role} onChange={(value) => setForm({ ...form, target_role: value })} placeholder="例如：前线部署工程师" /><TextArea label="任务说明" value={form.description} onChange={(value) => setForm({ ...form, description: value })} placeholder="员工需要完成什么？" required /><TextInput label="关联资料标题" value={form.material_title} onChange={(value) => setForm({ ...form, material_title: value })} placeholder="例如：岗位交付检查清单" /><TextArea label="资料内容" value={form.material_content} onChange={(value) => setForm({ ...form, material_content: value })} placeholder="任务页或阅读页展示的材料内容" /><label className="mt-3 block"><span className="mb-1.5 block text-[11px] font-bold text-[#394950]">复用岗位知识库</span><select value={form.knowledge_base_id} onChange={(event) => setForm({ ...form, knowledge_base_id: event.target.value })} className="h-10 w-full rounded-xl border border-[#D7E1D4] bg-white px-3 text-xs text-[#293D2A] outline-none"><option value="">不绑定知识库</option>{knowledgeBases.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.target_role}</option>)}</select></label><button disabled={busy === "task-create"} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#52704D] px-4 text-xs font-bold text-white disabled:opacity-50">{busy === "task-create" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}发布任务</button></form>
}

function SectionHeading({ icon: Icon, title, detail }: { icon: typeof Library; title: string; detail: string }) { return <div className="flex items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EAF4E7] text-[#52704D]"><Icon className="size-4" /></span><div><h2 className="text-base font-bold text-[#293D2A]">{title}</h2><p className="mt-1 text-[10px] leading-4 text-[#7A8677]">{detail}</p></div></div> }
function InfoChip({ icon: Icon, label, value }: { icon: typeof Library; label: string; value: string }) { return <div className="rounded-xl border border-[#D9E6D6] bg-white/80 px-3 py-2.5"><Icon className="size-4 text-[#52704D]" /><strong className="mt-1 block text-lg font-black text-[#293D2A]">{value}</strong><span className="text-[10px] font-bold text-[#7A8677]">{label}</span></div> }
function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-[#D8E4D5] bg-[#FBFDFB] px-4 py-8 text-center text-xs text-[#7A8677]">{text}</div> }
function TextInput({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) { return <label className="mt-3 block"><span className="mb-1.5 block text-[11px] font-bold text-[#394950]">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-[#D7E1D4] bg-white px-3 text-xs text-[#293D2A] outline-none placeholder:text-[#9AA598] focus:border-[#52704D]" /></label> }
function TextArea({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) { return <label className="mt-3 block"><span className="mb-1.5 block text-[11px] font-bold text-[#394950]">{label}</span><textarea required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder.replaceAll("\\n", "\n")} rows={3} className="w-full resize-y rounded-xl border border-[#D7E1D4] bg-white px-3 py-2.5 text-xs leading-5 text-[#293D2A] outline-none placeholder:text-[#9AA598] focus:border-[#52704D]" /></label> }
