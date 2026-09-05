import { AppTopbar } from "@/components/AppTopbar"
import { CareerRecommendations } from "@/components/CareerRecommendations"
import { useTrackPage } from "@/lib/useTrackPage"

import "./CareerExplorer.css"

export function CareerExplorer() {
  useTrackPage("career_explorer")

  return (
    <main className="app-page paper-theme career-transfer-page career-explorer-page min-h-dvh pb-8">
      <div className="career-explorer-shell w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar
          current="career"
          appearance="paper"
          labelOverride="转岗培训"
          groupOverride="画像驱动匹配"
        />

        <section className="career-explorer-content" aria-labelledby="career-explorer-title">
          <header className="career-explorer-intro">
            <div>
              <span>基于当前岗位画像</span>
              <h2 id="career-explorer-title">比较能力复用、关键差距与匹配岗位</h2>
            </div>
            <p>按岗位知识库中的共通能力与基础课程计算，推荐可立即进入训练的方向。</p>
          </header>

          <CareerRecommendations />
        </section>
      </div>
    </main>
  )
}
