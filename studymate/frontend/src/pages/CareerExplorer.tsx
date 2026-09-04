import { Activity, Compass, Route, Sparkles } from "lucide-react"
import { motion } from "framer-motion"

import { AppTopbar } from "@/components/AppTopbar"
import { CareerRecommendations } from "@/components/CareerRecommendations"
import { useTrackPage } from "@/lib/useTrackPage"

export function CareerExplorer() {
  useTrackPage("career_explorer")
  return (
    <main className="app-page paper-theme career-transfer-page min-h-dvh pb-12">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar current="career" appearance="paper" labelOverride="转岗培训" groupOverride="职业航线迁移" iconImage="/images/career-orbital-transfer-pod-v1.png" showRocketFormation rocketVariant="honor" />
        <motion.section className="career-transfer-workspace mt-3 border-y px-3 py-6 sm:px-5 lg:px-6" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .72, ease: [0.22, 1, 0.36, 1] }}>
          <div className="career-transfer-brief">
            <div className="career-transfer-live-row flex items-center gap-2 border-b pb-4">
              <span className="inline-flex items-center gap-2 text-[11px] font-black tracking-[.16em]"><i />ROUTE TRANSFER</span>
              <span className="ml-auto hidden text-[11px] font-bold sm:block">当前能力已同步 · 等待目标航线确认</span>
            </div>
            <div className="career-transfer-brief-row grid items-center gap-5 py-6 md:grid-cols-[210px_minmax(260px,.9fr)_minmax(300px,1.1fr)]">
              <div>
              <div className="career-transfer-index"><strong>03</strong><span>转岗培训</span><em>CAREER TRANSITION</em></div>
              </div>
              <div className="career-transfer-brief-title">
              <h1>切换下一条<br /><span>职业航线</span></h1>
              <div className="career-transfer-title-rule mt-5" aria-hidden="true" />
              </div>
              <div className="career-transfer-brief-copy">
              <div className="career-transfer-copy-kicker"><Activity className="size-3.5" /><span>航线规划引擎</span><i /><b>实时校准</b></div>
              <p className="mt-2 text-[13px] font-semibold leading-6"><strong>从已有能力出发，规划更短的转岗路径。</strong><small>系统将同步识别可复用能力、训练缺口与可立即进入的岗位方向。</small></p>
              <div className="career-transfer-feature-chips mt-3 flex flex-wrap gap-2 text-[11px] font-extrabold">
                <span><Compass className="size-3.5" />能力定向</span><span><Route className="size-3.5" />航线规划</span><span><Sparkles className="size-3.5" />一键转训</span>
              </div>
              <div className="career-transfer-scout-lane" aria-hidden="true">
                <small>K9 ROUTE SCOUT · RUNNING</small><span className="career-transfer-scout-track" /><span className="career-transfer-scout-dog" />
              </div>
              <div className="career-transfer-brief-signals mt-3" aria-label="航线规划状态">
                <span><i>01</i><small>能力档案</small><strong>已同步</strong></span>
                <span><i>02</i><small>候选航线</small><strong>6 条</strong></span>
                <span><i>03</i><small>训练资源</small><strong>READY</strong></span>
              </div>
              </div>
            </div>
          </div>
          <div className="career-transfer-recommendations min-w-0 border-t pt-7">
          <div className="career-transfer-section-heading">
            <span>01 · 航线候选</span><h2>匹配你的下一岗位</h2><p>只展示知识库已就绪、可立即进入训练的方向</p>
          </div>
          <div className="mt-4">
            <CareerRecommendations />
          </div>
          </div>
        </motion.section>
        <motion.section className="career-transfer-journey mt-9 px-1 sm:px-3" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }}>
          <div className="career-transfer-section-heading">
            <span>02 · 迁移路径</span><h2>从能力复用到目标训练</h2><p>导航换轨信号持续校准下一步建议</p>
          </div>
          <div className="career-transfer-route-stage mt-5" aria-hidden="true">
            <span className="career-transfer-orbit is-outer" /><span className="career-transfer-orbit is-inner" />
            <span className="career-transfer-waypoint is-origin"><b>01</b><i /></span><span className="career-transfer-waypoint is-switch"><b>02</b><i /></span><span className="career-transfer-waypoint is-target"><b>03</b><i /></span>
            <span className="career-transfer-route-line" /><img src="/images/career-orbital-transfer-pod-v1.png" alt="" />
            <small className="is-origin-label">CURRENT ABILITY</small><small className="is-target-label">TRAINING ROUTE</small>
          </div>
          <div className="career-transfer-rail mt-3 grid grid-cols-3 overflow-hidden rounded-[14px] border">
            {["当前能力盘点", "目标岗位迁移", "生成训练建议"].map((label, index) => <div key={label}><i>{String(index + 1).padStart(2, "0")}</i><span>{label}</span></div>)}
          </div>
        </motion.section>
      </div>
    </main>
  )
}
