import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Cpu,
  Network,
  Sparkles,
  Target,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { apiGet } from "@/lib/api"
import { careerDomains, type CareerDomain, type CareerRole, type DomainId } from "@/lib/domainCareerCatalog"
import { useTrackPage } from "@/lib/useTrackPage"
import { setCurrentCourse, type CourseInfo } from "@/store/course"
import { setTargetRole, useTargetRole } from "@/store/targetRole"

const domainOrder: DomainId[] = ["ai", "software", "industrial"]
const domainIcons = { ai: Sparkles, software: BriefcaseBusiness, industrial: Network }
const domainTones = {
  ai: { cover: "from-[#315E83] to-[#6F8A69]", chip: "bg-[#E7EDF3] text-[#315E83]" },
  software: { cover: "from-[#7E6B83] to-[#315E83]", chip: "bg-[#EEE9EF] text-[#7E6B83]" },
  industrial: { cover: "from-[#8E6925] to-[#3E7774]", chip: "bg-[#F4ECD8] text-[#8E6925]" },
}

interface CourseListResponse {
  items: CourseInfo[]
}

function getOrderedDomains(): CareerDomain[] {
  return domainOrder.map((id) => careerDomains.find((domain) => domain.id === id)).filter((domain): domain is CareerDomain => Boolean(domain))
}

export function Courses() {
  useTrackPage("target_role_selection")
  const navigate = useNavigate()
  const storedRole = useTargetRole()
  const domains = useMemo(getOrderedDomains, [])
  const storedDomain = careerDomains.find((item) => item.roles.some((role) => role.id === storedRole?.id))?.id
  const [domainId, setDomainId] = useState<DomainId>(storedDomain ?? "ai")
  const [activationError, setActivationError] = useState("")
  const [activatingRoleId, setActivatingRoleId] = useState("")
  const domain = domains.find((item) => item.id === domainId) ?? domains[0]

  async function selectRole(role: CareerRole) {
    setActivationError("")
    setTargetRole({ domainId: domain.id, roleId: role.id })
    if (role.id !== "fde") {
      setCurrentCourse(null)
      return
    }

    setActivatingRoleId(role.id)
    try {
      const response = await apiGet<CourseListResponse>("/courses")
      const fdeCourse = response.items.find((course) => course.name === "FDE 岗位知识库")
      if (!fdeCourse) throw new Error("FDE 知识库尚未加载")
      setCurrentCourse(fdeCourse)
      navigate("/workspace")
    } catch {
      setActivationError("FDE 知识库暂未连接。请重新登录后刷新页面，再点击进入岗位训练。")
    } finally {
      setActivatingRoleId("")
    }
  }

  return (
    <main className="app-page paper-theme min-h-dvh">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位空间" groupOverride="求职准备" selectionLabel={storedRole?.name ?? "选择目标岗位"} />

        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span></Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Target className="size-4" /></span>
              <div className="min-w-0"><h1 className="text-[15px] font-bold text-[#18232D]">选择你的目标岗位</h1><p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">先选择领域，再选择该领域的目标岗位</p></div>
            </div>
            <div className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold ${storedRole ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#7A817F]"}`}>
              {storedRole ? <CheckCircle2 className="size-3.5" /> : <BookOpenCheck className="size-3.5" />}{storedRole ? `当前目标岗位 · ${storedRole.name}` : "请选择目标岗位"}
            </div>
          </header>

          <div className="p-4 sm:p-5">
            <div className="relative mb-5 overflow-hidden rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] px-5 py-5 sm:px-6">
              <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full border border-[#DDD4BF]" />
              <span className="relative inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#6F8A69]"><Sparkles className="size-3.5 text-[#B1842C]" />岗位训练模式</span>
              <h2 className="relative mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D]">从领域进入目标岗位，再围绕岗位能力开展训练</h2>
              <p className="relative mt-1.5 max-w-3xl text-sm leading-6 text-[#66717B]">岗位是求职者的训练目标；后续学情诊断、知识库检索、资源生成和测评都会围绕所选岗位进行。</p>
            </div>

            <section aria-labelledby="domain-heading">
              <div className="mb-3 flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#E7EDF3] text-[10px] font-bold text-[#315E83]">1</span><h2 id="domain-heading" className="text-sm font-bold text-[#18232D]">选择领域</h2></div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {domains.map((item) => {
                  const Icon = domainIcons[item.id]
                  const selected = item.id === domain.id
                  return <button key={item.id} type="button" onClick={() => setDomainId(item.id)} className={`flex min-h-20 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${selected ? "border-[#315E83] bg-[#EAF1F5] shadow-[0_8px_20px_rgba(49,94,131,.10)]" : "border-[#D7D1C4] bg-[#FFFEFA] hover:border-[#9FB1BC] hover:bg-[#F8F6F0]"}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-[#315E83] text-[#F2C968]" : "bg-[#F4ECD8] text-[#8E6925]"}`}><Icon className="size-4" /></span>
                    <span className="min-w-0"><strong className="block text-sm text-[#18232D]">{item.name}</strong><small className="mt-1 block text-[11px] text-[#66717B]">{item.roles.length} 个岗位方向</small></span>
                  </button>
                })}
              </div>
            </section>

            <section className="mt-6 border-t border-[#E3DED3] pt-5" aria-labelledby="role-heading">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[.12em] text-[#B1842C]"><BriefcaseBusiness className="size-3.5" />{domain.name.toUpperCase()}</span><h2 id="role-heading" className="mt-1 text-lg font-bold text-[#18232D]">选择该领域的目标岗位</h2></div><p className="max-w-xl text-[11px] leading-5 text-[#66717B]">{domain.description}</p></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {domain.roles.map((role, index) => <RoleBook key={role.id} role={role} domainId={domain.id} index={index} selected={storedRole?.id === role.id} activating={activatingRoleId === role.id} onSelect={() => void selectRole(role)} />)}
              </div>
              {activationError && <p role="alert" className="mt-4 border border-[#DFC9BE] bg-[#F6ECE7] px-3 py-2 text-xs text-[#9A4E35]">{activationError}</p>}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function RoleBook({ role, domainId, index, selected, activating, onSelect }: { role: CareerRole; domainId: DomainId; index: number; selected: boolean; activating: boolean; onSelect: () => void }) {
  const tone = domainTones[domainId]
  const Icon = domainId === "ai" ? Cpu : domainId === "industrial" ? Network : BriefcaseBusiness
  return <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.05 }} className={`group relative min-h-[224px] overflow-hidden rounded-[22px] border bg-[#FFFEFA] shadow-[0_8px_22px_rgba(24,35,45,.04)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(24,35,45,.11)] ${selected ? "border-[#7F9AAA] ring-2 ring-[#315E83]/12" : "border-[#D7D1C4] hover:border-[#AEBAB5]"}`}>
    <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.cover}`} />
    <button type="button" onClick={onSelect} disabled={activating} className="relative z-10 grid h-full min-h-[224px] w-full grid-cols-[104px_minmax(0,1fr)] gap-4 p-4 text-left disabled:cursor-wait sm:grid-cols-[116px_minmax(0,1fr)]">
      <span className={`relative my-auto block aspect-[0.73] w-full overflow-hidden rounded-[9px] border border-black/10 bg-gradient-to-br ${tone.cover} shadow-[0_12px_22px_rgba(24,35,45,.18),-5px_0_0_#ece7db]`}><span className="absolute left-3 top-4 text-[9px] font-bold tracking-[.1em] text-white/75">TARGET ROLE</span><span className="absolute inset-x-3 top-11 h-px bg-white/35" /><Icon className="absolute left-3 top-[44%] size-7 text-[#F5D989]" /><span className="absolute inset-x-3 bottom-4 text-[11px] font-bold leading-4 text-white">{role.name}</span><span className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/20 to-transparent" /></span>
      <span className="flex min-w-0 flex-col py-1"><span className="flex min-h-6 items-start justify-end">{selected ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E9EEE6] px-2 py-1 text-[10px] font-bold text-[#557052]"><CheckCircle2 className="size-3" />已选择</span> : role.knowledgeBaseState === "ready" ? <span className="rounded-full bg-[#E9EEE6] px-2 py-1 text-[10px] font-bold text-[#557052]">知识库已导入</span> : <span className="rounded-full bg-[#F8F1E4] px-2 py-1 text-[10px] font-bold text-[#8E6925]">待建设</span>}</span><strong className="mt-3 text-lg leading-6 tracking-[-.025em] text-[#18232D]">{role.name}</strong><span className="mt-1.5 text-xs leading-5 text-[#66717B]">{role.summary}</span><span className="mt-auto flex w-full items-end justify-between gap-2 pt-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone.chip}`}>{role.knowledgeBase?.chunkCount ? `${role.knowledgeBase.chunkCount} 条知识片段` : "岗位目录"}</span><span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#315E83]">{activating ? "正在进入" : role.id === "fde" ? "进入岗位训练" : "选择岗位"}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span></span></span>
    </button>
  </motion.article>
}
