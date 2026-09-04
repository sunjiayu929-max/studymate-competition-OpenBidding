import { useState } from "react"
import { ArrowRight, BookOpenCheck, BookText, Check, DatabaseZap, FileSearch, Landmark, Search } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ExternalLearningResources } from "@/components/ExternalLearningResources"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import "./LearningResources.css"

export function LearningResources() {
  useTrackPage("learning_resources")
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const isFde = targetRole?.id === "fde" || /FDE|前线部署工程师/.test(course?.name || "")
  const initialKeyword = isFde
    ? "FDE 前线部署工程师 现场交付 部署验收"
    : targetRole?.sampleTasks?.[0] || targetRole?.skills?.[0] || course?.name || "岗位能力训练"
  const [draft, setDraft] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)

  return (
    <main className="app-page paper-theme lr-station min-h-dvh pb-12">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="resources" appearance="paper" showRocketFormation rocketVariant="honor" />
        <section className="lr-station-hero relative mt-3 overflow-hidden border-y px-4 py-5 sm:px-6 sm:py-7">
          <div className="lr-station-grid" aria-hidden="true" />
          <div className="lr-station-live relative flex items-center justify-between border-b pb-4">
            <span className="inline-flex items-center gap-3 text-[12px] font-black tracking-[.16em] text-[#294E73]"><i /> KNOWLEDGE SUPPLY ONLINE</span>
            <span className="hidden text-[11px] font-bold text-[#315D7B] sm:block">岗位资源实时检索通道</span>
          </div>
          <form
            className="lr-station-search relative mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (draft.trim()) setKeyword(draft.trim())
            }}
          >
            <label className="flex min-h-12 flex-1 items-center gap-3 rounded-[14px] border px-4">
              <Search className="size-4 text-[#24618A]" />
              <input value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#173D5B] outline-none placeholder:text-[#607A8F]" aria-label="岗位能力资源关键词" />
            </label>
            <button type="submit" className="group inline-flex min-h-12 items-center gap-2 rounded-[14px] px-5 text-xs font-black text-white">搜索资源<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></button>
          </form>
          <div className="lr-station-rail relative mt-3 grid grid-cols-4 overflow-hidden rounded-[14px] border" aria-label="资源检索流程">
            <span className="lr-station-rail-signal" aria-hidden="true" />
            {[["01", "岗位定位"], ["02", "来源检索"], ["03", "相关校验"], ["04", "资源送达"]].map(([step, label]) => <span key={step}><i>{step}</i>{label}</span>)}
          </div>
          <div className="relative grid gap-7 pt-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
            <div className="min-w-0">
              <div className="lr-station-index"><strong>06</strong><span>学习资源</span><i>RESOURCE NAVIGATION</i></div>
              <h1 className="lr-station-title mt-5">知识补给站<span>连接岗位所需的真实资料</span></h1>
              <p className="mt-4 max-w-2xl text-[14px] font-semibold leading-7 text-[#315D7B]">搜索书籍、论文、视频和公开文档；保留来源与打开路径，让每一次补给都可核验、可追溯。</p>
              <div className="lr-station-metrics mt-6 grid max-w-2xl grid-cols-3">
                <span><DatabaseZap /><b>04</b><small>资源类型</small></span>
                <span><FileSearch /><b>真实</b><small>来源可核验</small></span>
                <span><BookOpenCheck /><b>岗位</b><small>智能匹配</small></span>
              </div>
            </div>
            <div className="lr-station-visual" aria-hidden="true">
              <div className="lr-browser-scene">
                <div className="lr-browser-bar">
                  <span className="lr-browser-dots"><i /><i /><i /></span>
                  <span className="lr-browser-address"><Search />检索岗位学习资料</span>
                  <span className="lr-browser-secure"><Check />来源可核验</span>
                </div>
                <div className="lr-browser-body">
                  <div className="lr-browser-query"><span>FDE 现场交付与部署验收</span><Search /></div>
                  <div className="lr-browser-results">
                    <div className="lr-browser-result is-active">
                      <span className="lr-result-icon"><Landmark /></span>
                      <span><small>官方技术文档</small><b>生产环境部署与验收指南</b></span>
                      <i><Check /></i>
                    </div>
                    <div className="lr-browser-result">
                      <span className="lr-result-icon"><BookText /></span>
                      <span><small>专业书籍</small><b>可靠系统交付实践</b></span>
                      <i><Check /></i>
                    </div>
                    <div className="lr-browser-result">
                      <span className="lr-result-icon"><FileSearch /></span>
                      <span><small>研究论文</small><b>软件部署质量评估</b></span>
                      <i><Check /></i>
                    </div>
                  </div>
                </div>
                <span className="lr-browser-cursor"><Search /></span>
              </div>
              <div className="lr-source-strip"><span><i />公开来源</span><span><i />相关性校验</span><span><i />可直接打开</span></div>
            </div>
          </div>
        </section>
        <section className="lr-station-content mt-4 rounded-[22px] border px-4 pb-7 sm:px-6">
          <ExternalLearningResources keyword={keyword} conceptTitle={keyword} />
        </section>
      </div>
    </main>
  )
}
