import { GraduationCap } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { CareerRecommendations } from "@/components/CareerRecommendations"
import { useTrackPage } from "@/lib/useTrackPage"

export function CareerExplorer() {
  useTrackPage("career_explorer")
  return (
    <main className="app-page paper-theme min-h-dvh px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AppTopbar current="career" appearance="paper" />
        <section className="mt-5 rounded-[28px] border border-[#D7D1C4] bg-[#FFFEFA] p-5 shadow-[0_18px_48px_rgba(24,35,45,.07)] sm:p-7">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#B1842C]"><GraduationCap className="size-4" />转岗培训</span>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#18232D]">从当前岗位平移到下一个训练方向</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#66717B]">只展示已导入岗位知识库的训练方向；查看能力匹配度后即可直接进入对应岗位训练，并可跳转公开招聘平台了解实时需求。</p>
          <div className="mt-6">
            <CareerRecommendations />
          </div>
        </section>
      </div>
    </main>
  )
}
