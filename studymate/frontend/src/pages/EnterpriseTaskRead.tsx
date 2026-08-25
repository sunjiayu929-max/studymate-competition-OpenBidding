import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, BookOpenText, CheckCircle2, Loader2, Library } from "lucide-react"

import { Markdown } from "@/components/Markdown"
import { AppTopbar } from "@/components/AppTopbar"
import { apiGet, apiPost } from "@/lib/api"

type Task = {
  id: number
  title: string
  description: string
  task_type: "training" | "reading"
  target_role: string
  material_title: string
  material_content: string
  assignment_status: string | null
  due_label: string
  knowledge_base?: { name: string; target_role: string; materials: Array<{ title?: string; detail?: string }> } | null
}

export function EnterpriseTaskRead() {
  const { taskId } = useParams()
  const [task, setTask] = useState<Task | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!taskId) return
    apiGet<Task>(`/learner/tasks/${taskId}`).then(setTask).catch((err) => setError(err instanceof Error ? err.message : "任务无法打开"))
  }, [taskId])

  const complete = async () => {
    if (!task) return
    setBusy(true)
    try { setTask(await apiPost<Task>(`/learner/tasks/${task.id}/complete`)) }
    catch (err) { setError(err instanceof Error ? err.message : "完成状态回写失败") }
    finally { setBusy(false) }
  }

  const knowledgeMarkdown = task?.knowledge_base?.materials
    .map((item, index) => `## ${index + 1}. ${item.title || "岗位知识要点"}\n\n${item.detail || "暂无详细内容"}`)
    .join("\n\n") || ""

  return <main className="app-page paper-theme min-h-dvh pb-12"><div className="mx-auto max-w-[1280px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"><AppTopbar current="home" appearance="paper" labelOverride="企业资料阅读" groupOverride="企业任务中心" selectionLabel="返回任务列表" />{error && <div role="alert" className="mt-4 rounded-xl border border-[#E4C9BE] bg-[#FFF7F3] px-4 py-3 text-xs font-semibold text-[#A25139]">{error}</div>}{!task && !error ? <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#52704D]" /></div> : task && <><Link to="/enterprise" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#52704D]"><ArrowLeft className="size-4" />返回企业任务</Link><article className="mt-4 rounded-[26px] border border-[#DCE5D9] bg-white p-5 shadow-[0_14px_38px_rgba(59,92,58,.08)] sm:p-8 lg:px-12"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="inline-flex items-center gap-2 rounded-full bg-[#FFF1D9] px-3 py-1.5 text-[10px] font-bold text-[#946B27]"><BookOpenText className="size-3.5" />普通阅读任务</span><h1 className="mt-3 text-2xl font-bold tracking-[-.04em] text-[#293D2A]">{task.title}</h1><p className="mt-2 text-xs text-[#7A8677]">{task.target_role || "全员任务"} · {task.due_label}</p></div>{task.assignment_status === "completed" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4E7] px-3 py-1.5 text-[10px] font-bold text-[#52704D]"><CheckCircle2 className="size-3.5" />已完成</span> : <button type="button" onClick={() => void complete()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#52704D] px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}标记为已读</button>}</div><div className="mt-7 max-w-[940px] border-t border-[#ECF0E9] pt-6"><h2 className="text-base font-bold text-[#293D2A]">{task.material_title || "任务资料"}</h2><div className="mt-4 text-sm leading-8 text-[#536153]"><Markdown content={task.material_content || task.description} /></div></div>{task.knowledge_base && <section className="mt-8 max-w-[940px] border-t border-[#ECF0E9] pt-8"><div className="flex items-center gap-2 text-xs font-bold text-[#52704D]"><Library className="size-4" />岗位知识库 · {task.knowledge_base.name}</div><Markdown content={knowledgeMarkdown} className="mt-5 text-sm leading-8 text-[#536153]" /></section>}</article></>}</div></main>
}
