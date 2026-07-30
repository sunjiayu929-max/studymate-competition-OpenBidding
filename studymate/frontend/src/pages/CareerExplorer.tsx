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
          <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#B1842C]"><GraduationCap className="size-4" />CAREER EXPLORER</span>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#18232D]">把学习证据映射到职业方向</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#66717B]">建议基于当前画像、课程和已提交测验在本地计算匹配度与能力差距，不会把未经评估的经历当成已掌握能力。</p>
          <div className="mt-6">
            <CareerRecommendations />
          </div>
        </section>
      </div>
    </main>
  )
}
