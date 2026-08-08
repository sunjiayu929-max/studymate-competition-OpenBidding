import { useMemo, useState } from "react"
import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Network,
  Sparkles,
  Target,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { careerDomains, type DomainId } from "@/lib/domainCareerCatalog"
import { useTrackPage } from "@/lib/useTrackPage"

const domainIcons = {
  industrial: Network,
  software: BriefcaseBusiness,
  ai: Sparkles,
}

const resourceIcons = {
  "定制讲义": BookOpenCheck,
  "实操指南": ClipboardCheck,
  "分阶测试题": FlaskConical,
}

export function CareerExplorer() {
  useTrackPage("career_explorer")
  const [domainId, setDomainId] = useState<DomainId>("software")
  const [selectedRoleId, setSelectedRoleId] = useState("fde")
  const selectedDomain = useMemo(
    () => careerDomains.find((domain) => domain.id === domainId) ?? careerDomains[0],
    [domainId],
  )
  const selectedRole = selectedDomain.roles.find((role) => role.id === selectedRoleId) ?? selectedDomain.roles[0]

  function selectDomain(nextDomainId: DomainId) {
    const nextDomain = careerDomains.find((domain) => domain.id === nextDomainId)
    if (!nextDomain) return
    setDomainId(nextDomainId)
    setSelectedRoleId(nextDomain.roles[0].id)
  }

  return (
    <main className="app-page paper-theme min-h-dvh px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AppTopbar current="career" appearance="paper" />
        <section className="mt-5 border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_18px_48px_rgba(24,35,45,.07)]">
          <header className="border-b border-[#E3DED3] px-5 py-6 sm:px-7">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#315E83]"><Target className="size-4" />TARGET ROLE STUDIO</span>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#18232D]">定领域，找岗位，建知识库</h1>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-[#66717B]">先选定垂直领域，再从对应岗位进入技能训练与知识资源。当前已完成 FDE 岗位的最小知识库切片。</p>
              </div>
              <div className="flex items-center gap-2 border border-[#BFD0C0] bg-[#EEF4EB] px-3 py-2 text-[11px] font-semibold text-[#557052]">
                <CheckCircle2 className="size-4" />已构建 1 个可测试岗位
              </div>
            </div>
          </header>

          <div className="grid min-h-[620px] lg:grid-cols-[238px_minmax(0,1fr)]">
            <aside className="border-b border-[#E3DED3] bg-[#F7F6F1] p-4 lg:border-r lg:border-b-0">
              <p className="px-2 text-[10px] font-bold tracking-[.12em] text-[#8A8172]">领域</p>
              <nav className="mt-3 flex gap-2 overflow-x-auto lg:flex-col" aria-label="选择领域">
                {careerDomains.map((domain) => {
                  const Icon = domainIcons[domain.id]
                  const active = domain.id === domainId
                  return (
                    <button
                      key={domain.id}
                      type="button"
                      onClick={() => selectDomain(domain.id)}
                      className={`flex min-w-44 items-center gap-3 border px-3 py-3 text-left transition lg:min-w-0 ${active ? "border-[#315E83] bg-[#244C66] text-white" : "border-transparent bg-transparent text-[#4E5960] hover:border-[#D7D1C4] hover:bg-[#FFFEFA]"}`}
                    >
                      <span className={`grid size-8 shrink-0 place-items-center ${active ? "bg-[#315E83] text-[#F2C968]" : "bg-[#E5EDF1] text-[#315E83]"}`}><Icon className="size-4" /></span>
                      <span className="min-w-0 flex-1"><strong className="block text-xs">{domain.name}</strong><span className={`mt-1 block text-[10px] leading-4 ${active ? "text-[#DDE9F0]" : "text-[#7A817F]"}`}>{domain.roles.length} 个岗位方向</span></span>
                      <ChevronRight className="size-4 shrink-0" />
                    </button>
                  )
                })}
              </nav>
            </aside>

            <div className="min-w-0 p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[.12em] text-[#B1842C]">{selectedDomain.name.toUpperCase()}</p>
                  <h2 className="mt-1 text-xl font-bold text-[#18232D]">选择目标岗位</h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-[#66717B]">{selectedDomain.description}</p>
                </div>
                <span className="border border-[#D7D1C4] bg-[#F8F6F0] px-2.5 py-1.5 text-[10px] font-semibold text-[#66717B]">岗位知识库优先级</span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3" role="list" aria-label="岗位列表">
                {selectedDomain.roles.map((role) => {
                  const active = role.id === selectedRole.id
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`min-h-44 border p-4 text-left transition ${active ? "border-[#315E83] bg-[#EAF1F5] shadow-[0_8px_22px_rgba(36,76,102,.08)]" : "border-[#D7D1C4] bg-[#FFFEFA] hover:border-[#9FB1BC]"}`}
                    >
                      <div className="flex items-start justify-between gap-2"><span className={`grid size-8 place-items-center ${active ? "bg-[#244C66] text-[#F2C968]" : "bg-[#F4ECD8] text-[#8E6925]"}`}><BriefcaseBusiness className="size-4" /></span><span className={`px-2 py-1 text-[10px] font-bold ${role.knowledgeBaseState === "ready" ? "bg-[#DDEBDD] text-[#557052]" : "bg-[#EEE9E0] text-[#766B5C]"}`}>{role.knowledgeBaseState === "ready" ? "已构建" : "待构建"}</span></div>
                      <h3 className="mt-3 text-sm font-bold text-[#18232D]">{role.name}</h3>
                      <p className="mt-1.5 text-[11px] leading-5 text-[#66717B]">{role.summary}</p>
                    </button>
                  )
                })}
              </div>

              <section className="mt-6 border-t border-[#E3DED3] pt-6" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[.12em] text-[#315E83]"><FileText className="size-3.5" />岗位知识库</span>
                    <h2 className="mt-1 text-lg font-bold text-[#18232D]">{selectedRole.name}</h2>
                  </div>
                  <span className={`border px-2.5 py-1.5 text-[10px] font-bold ${selectedRole.knowledgeBaseState === "ready" ? "border-[#BFD0C0] bg-[#EEF4EB] text-[#557052]" : "border-[#D7D1C4] bg-[#F8F6F0] text-[#766B5C]"}`}>{selectedRole.knowledgeBaseState === "ready" ? "可进入 Agent 测试" : "知识库待接入"}</span>
                </div>

                {selectedRole.knowledgeBase ? <FdeKnowledgeBase role={selectedRole} /> : <PlannedKnowledgeBase roleName={selectedRole.name} />}
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function FdeKnowledgeBase({ role }: { role: (typeof careerDomains)[number]["roles"][number] }) {
  const knowledgeBase = role.knowledgeBase
  if (!knowledgeBase) return null
  return (
    <div className="mt-4">
      <p className="max-w-3xl text-xs leading-6 text-[#59636B]">{knowledgeBase.overview}</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <h3 className="text-xs font-bold text-[#18232D]">核心职责</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {knowledgeBase.responsibilities.map((item) => <li key={item} className="flex gap-2 border-l-2 border-[#B1842C] bg-[#F8F6F0] px-3 py-2 text-[11px] leading-5 text-[#59636B]"><span className="mt-0.5 font-bold text-[#B1842C]">01</span>{item}</li>)}
          </ul>
          <h3 className="mt-5 text-xs font-bold text-[#18232D]">岗位交付流程</h3>
          <ol className="mt-2 flex flex-wrap gap-2">
            {knowledgeBase.workflow.map((step, index) => <li key={step} className="inline-flex items-center gap-2 border border-[#D7D1C4] bg-[#FFFEFA] px-2.5 py-2 text-[10px] font-semibold text-[#59636B]"><span className="text-[#B1842C]">0{index + 1}</span>{step}{index < knowledgeBase.workflow.length - 1 && <ArrowRight className="size-3 text-[#A8AFAE]" />}</li>)}
          </ol>
        </div>
        <div className="border-l-2 border-[#315E83] bg-[#EAF1F5] p-4">
          <p className="text-[10px] font-bold tracking-[.12em] text-[#315E83]">岗位能力标签</p>
          <div className="mt-3 flex flex-wrap gap-2">{role.skills.map((skill) => <span key={skill} className="border border-[#B9C9D3] bg-[#FFFEFA] px-2 py-1 text-[10px] font-semibold text-[#315E83]">{skill}</span>)}</div>
          <p className="mt-4 text-[10px] leading-5 text-[#66717B]">后续由学情诊断 Agent 用这些能力标签匹配学习者基础，并按缺口调用三类资源。</p>
        </div>
      </div>
      <h3 className="mt-6 text-xs font-bold text-[#18232D]">首批知识资源</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {knowledgeBase.resources.map((resource) => {
          const Icon = resourceIcons[resource.type]
          return <a key={resource.title} href={resource.sourceUrl} target="_blank" rel="noreferrer noopener" className="group border border-[#D7D1C4] bg-[#FFFEFA] p-4 hover:border-[#315E83]">
            <span className="grid size-8 place-items-center bg-[#F4ECD8] text-[#8E6925]"><Icon className="size-4" /></span>
            <p className="mt-3 text-[10px] font-bold text-[#B1842C]">{resource.type}</p>
            <h4 className="mt-1 text-xs font-bold text-[#18232D] group-hover:text-[#315E83]">{resource.title}</h4>
            <p className="mt-2 text-[11px] leading-5 text-[#66717B]">{resource.description}</p>
            <p className="mt-3 text-[10px] font-semibold text-[#315E83]">来源：{resource.sourceLabel}</p>
          </a>
        })}
      </div>
    </div>
  )
}

function PlannedKnowledgeBase({ roleName }: { roleName: string }) {
  return <div className="mt-4 border border-dashed border-[#C7D2D8] bg-[#F8F6F0] p-5 text-center"><p className="text-xs font-semibold text-[#59636B]">{roleName} 的岗位切片尚未构建</p><p className="mt-2 text-[11px] leading-5 text-[#7A817F]">下一步按“岗位职责、核心技能、可追溯资料、实操任务、分阶题目”补齐，再接入知识生成与审核 Agent。</p></div>
}
