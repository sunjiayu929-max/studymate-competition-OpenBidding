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
          <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#B1842C]"><GraduationCap className="size-4" />职业探索</span>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#18232D]">看看你与目标岗位还有多远</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#66717B]">根据画像和已完成的测验，查看岗位匹配度、已有优势和待补能力。</p>
          <div className="mt-6">
            <CareerRecommendations />
          </div>
        </section>
      </div>
    </main>
  )
}
