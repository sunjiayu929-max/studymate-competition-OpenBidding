import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  RotateCcw,
  Scale,
  ShieldCheck,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { DebateExchange, DebateRecord, WorkspaceState } from "@/store/workspace"

const REVIEWER_LABELS: Record<string, string> = {
  evidence_review: "事实与来源校验 Agent",
  practice_review: "实操规范校验 Agent",
  difficulty_review: "难度与覆盖校验 Agent",
}

const RESOURCE_IDS = ["doc", "guide", "quiz", "mindmap", "code", "video"] as const

export function DebateQualityPanel({ workspace }: { workspace: WorkspaceState }) {
  const debate = [...workspace.debates].reverse().find((item) => item.phase === "resource" && item.round === workspace.generationRound)
    ?? [...workspace.debates].reverse().find((item) => item.phase === "resource")
  const exchanges = mergeResourceExchanges(workspace, debate)
  const active = workspace.status === "running" && ["generation", "review", "rework", "decision"].includes(workspace.stage)
  const completed = Boolean(debate || workspace.decision || Object.keys(workspace.reviews).length)

  return (
    <details open className="competency-section debate-quality-panel mt-4">
      <summary className="debate-quality-header cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="debate-quality-heading">
          <span className="debate-quality-emblem"><img src="/images/quality-inspection-instrument-v1.png" alt="" aria-hidden="true" /></span>
          <div className="debate-quality-copy"><span>02 · 质量复核</span><h2>多重校验，一次看清</h2><p>资源陈述 → 三项校验 → 修改回应 → 最终决策</p></div>
          <i className="debate-quality-flight" aria-hidden="true"><span className="is-upper"><img src="/images/section-helicopter-v1.png" alt="" /></span><span className="is-lower"><img src="/images/section-helicopter-v1.png" alt="" /></span></i>
          <div className="debate-quality-status"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black", active ? "bg-[#DCEEFF] text-[#2467AB]" : completed ? "bg-[#E1F2EB] text-[#20755F]" : "bg-white/75 text-[#315D7B]")}>{active && <i className="size-2 animate-pulse rounded-full bg-[#2E72D2]" />}{active ? "实时同步中" : completed ? "已记录" : "等待复核"}</span><span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#285A7D]">展开查看 <ArrowRight className="size-4" /></span></div>
        </div>
      </summary>
      <div className="debate-quality-content space-y-4">
        <DebateSequence activeStep={debateActiveStep(workspace.stage)} completed={completed} />
        <article className="debate-quality-board rounded-[18px] border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><strong className="block text-[15px] text-[#243E5C]">资源生成 Agent × 三项校验 Agent</strong>{debate && <DecisionBadge decision={debate.decision} round={debate.round} />}</div>
          <div className="debate-dialogue-flow mt-4"><SpeechBubble step="01" agent="资源生成 Agent" action="资源陈述" text={resourcePosition(workspace, exchanges)} active={workspace.stage === "generation"} muted={!exchanges.length && !workspace.outputs.doc} /><SpeechBubble step="02" agent="三项校验 Agent" action="校验质询" text={reviewChallenges(workspace, exchanges)} active={workspace.stage === "review"} muted={!Object.keys(workspace.reviews).length} /><SpeechBubble step="03" agent="资源生成 Agent" action="回应校验" text={resourceResponse(workspace, exchanges)} active={workspace.stage === "rework"} muted={!exchanges.some((item) => item.generator_response.length)} /><DecisionBox step="04" decision={debate?.decision ?? decisionFromReviews(workspace)} text={debate?.resolution || workspace.decision?.summary || "等待三项校验结果汇总后，由总决策 Agent 决定发布或自动返工。"} active={workspace.stage === "decision"} /></div>
        </article>
        <ReviewResultGrid workspace={workspace} />
      </div>
    </details>
  )
}

function ReviewResultGrid({ workspace }: { workspace: WorkspaceState }) {
  const decision = workspace.decision
  const reviewMetric = (reviewId: string, metricId: string) => {
    const value = workspace.reviews[reviewId]?.metrics?.[metricId]
    return typeof value === "number" ? value : undefined
  }
  const evidenceScore = workspace.reviews.evidence_review?.score
  const difficultyScore = workspace.reviews.difficulty_review?.score
  const hallucinationRate = decision?.hallucination_rate
    ?? decision?.quality_metrics?.hallucination_rate?.value
    ?? reviewMetric("evidence_review", "hallucination_rate")
    ?? (typeof evidenceScore === "number" ? Math.max(0, 100 - evidenceScore) : undefined)
  const profileDifficultyAccuracy = decision?.profile_difficulty_accuracy
    ?? decision?.quality_metrics?.profile_difficulty_accuracy?.value
    ?? reviewMetric("difficulty_review", "difficulty_fit")
    ?? difficultyScore
  const coreKnowledgeCoverage = decision?.core_knowledge_coverage
    ?? decision?.quality_metrics?.core_knowledge_coverage?.value
    ?? reviewMetric("difficulty_review", "core_coverage")
    ?? difficultyScore
  const decisionMetrics = decision ? [
    { key: "hallucination_rate", label: "专业知识谬误率（幻觉率）", value: hallucinationRate, rule: "< 5%", passed: hallucinationRate === undefined ? undefined : hallucinationRate < 5 },
    { key: "profile_difficulty_accuracy", label: "学习者画像-资源难度适配准确率", value: profileDifficultyAccuracy, rule: "≥ 85%", passed: profileDifficultyAccuracy === undefined ? undefined : profileDifficultyAccuracy >= 85 },
    { key: "core_knowledge_coverage", label: "核心知识点覆盖率", value: coreKnowledgeCoverage, rule: "≥ 90%", passed: coreKnowledgeCoverage === undefined ? undefined : coreKnowledgeCoverage >= 90 },
  ] : []

  return (
    <div className="debate-result-grid grid gap-4 lg:grid-cols-2">
      <section className="debate-review-panel rounded-2xl border border-[#DFE6EF] bg-[#F8FAFD] p-4">
        <strong className="text-[15px] text-[#263E59]">交叉验证结果</strong>
        <div className="mt-3 space-y-2">
          {["evidence_review", "practice_review", "difficulty_review"].map((id) => {
            const review = workspace.reviews[id]
            return <div key={id} className={cn("debate-review-row flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-[13px]", !review && "is-waiting", review?.status === "pass" && "is-passed", review?.status === "fail" && "is-failed")}><span className="font-medium text-[#52667E]">{REVIEWER_LABELS[id]}</span><span className={cn("debate-review-status shrink-0 font-black", review?.status === "pass" ? "text-[#1A8067]" : review?.status === "fail" ? "text-[#B4523B]" : review ? "text-[#A06C24]" : "text-[#315D7B]")}>{review ? `${review.score} 分 · ${reviewStatusLabel(review.status)}` : "等待校验"}</span></div>
          })}
        </div>
      </section>
      <section className={cn("debate-decision-panel rounded-2xl border p-4", decision?.decision === "publish" ? "is-published border-[#BFDCCF] bg-[#F3FAF7]" : decision?.decision === "rework" || decision?.decision === "failed" ? "is-rework border-[#E8CDBE] bg-[#FFF7F2]" : "is-waiting border-[#DFE6EF] bg-[#F8FAFD]")}>
        <strong className="flex items-center gap-2 text-[15px] text-[#263E59]"><ShieldCheck className="size-4.5" />审核结果</strong>
        <p className="mt-2 text-[13px] leading-6 text-[#596D85]">{decision?.summary || "完成全部校验后，资源将开放或返回修改。"}</p>
        {decision && <>
          <div className="mt-3 space-y-1.5">
            {decisionMetrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-3.5 py-3 text-[12px]"><span className="font-semibold text-[#52667E]">{metric.label}</span><span className={cn("shrink-0 font-black", metric.passed === false ? "text-[#B4523B]" : "text-[#168069]")}>实际结果 {metric.value === undefined ? "--" : `${metric.value}%`} {metric.rule}</span></div>)}
          </div>
          <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#426384]">{decisionLabel(decision.decision)} · 质量分 {decision.quality_score}</span>
        </>}
      </section>
    </div>
  )
}

function mergeResourceExchanges(workspace: WorkspaceState, debate?: DebateRecord) {
  const stored = debate?.exchanges ?? []
  if (stored.length) return stored
  return RESOURCE_IDS.flatMap((generator) => {
    const output = workspace.outputs[generator]
    const outputMeta = output as ({ title?: string; revision_response?: string[] } | undefined)
    return ["evidence_review", "practice_review", "difficulty_review"].map((reviewer) => {
      const review = workspace.reviews[reviewer]
      return { generator, reviewer, generator_position: outputMeta?.title ? `${outputMeta.title} 已生成，等待三项校验。` : "资源生成 Agent 正在准备本轮资源陈述。", generator_response: outputMeta?.revision_response ?? [], reviewer_challenges: review?.findings?.filter((finding) => finding.target_agent === generator) ?? [], reviewer_decision: review?.decision ?? (review?.status === "pass" ? "accept" : "rework"), review_score: review?.score ?? 0 } satisfies DebateExchange
    })
  })
}

function resourcePosition(workspace: WorkspaceState, exchanges: DebateExchange[]) {
  const titles = RESOURCE_IDS.map((id) => (workspace.outputs[id] as { title?: string } | undefined)?.title).filter(Boolean)
  return titles.length ? `本轮已形成 ${titles.length} 类资源：${titles.join("、")}。` : exchanges.length ? exchanges[0].generator_position : "等待资源生成 Agent 输出本轮六类资源。"
}

function reviewChallenges(workspace: WorkspaceState, exchanges: DebateExchange[]) {
  const findings = exchanges.flatMap((exchange) => exchange.reviewer_challenges).slice(0, 3)
  if (findings.length) return findings.map((finding) => `${REVIEWER_LABELS[exchanges.find((item) => item.reviewer === finding.target_agent)?.reviewer || ""] || "校验 Agent"}：${finding.message}`).join("；")
  return Object.keys(workspace.reviews).length ? "三项校验 Agent 已完成交叉检查，当前没有新增阻断意见。" : "等待事实与来源、实操规范、难度与覆盖三项校验 Agent 发起质询。"
}

function resourceResponse(workspace: WorkspaceState, exchanges: DebateExchange[]) {
  const responses = exchanges.flatMap((exchange) => exchange.generator_response)
  if (responses.length) return responses.join("；")
  if (workspace.stage === "rework") return "已接收校验意见，资源生成 Agent 正在按目标重新生成并准备下一轮回应。"
  return "校验意见进入后，资源生成 Agent 将给出依据、修改说明与新的交付版本。"
}

function decisionFromReviews(workspace: WorkspaceState): "accept" | "rework" | undefined {
  if (workspace.decision?.decision === "publish") return "accept"
  if (workspace.decision?.decision === "rework" || workspace.decision?.decision === "failed") return "rework"
  if (Object.values(workspace.reviews).some((review) => review.status === "fail")) return "rework"
  return Object.keys(workspace.reviews).length === 3 ? "accept" : undefined
}

function debateActiveStep(stage: string) {
  if (stage === "generation") return 0
  if (stage === "review") return 1
  if (stage === "rework") return 2
  if (stage === "decision" || stage === "publishing" || stage === "published") return 3
  return -1
}

function DebateSequence({ activeStep, completed }: { activeStep: number; completed: boolean }) {
  return <div className="debate-quality-sequence grid grid-cols-4 overflow-hidden rounded-[12px] border border-[#DDE2E8] bg-[#FAFAF8]">{["资源陈述", "校验质询", "生成回应", "总决策"].map((label, index) => { const done = completed || (activeStep >= 0 && index < activeStep); const active = activeStep === index; return <div key={label} className={cn("relative flex min-h-11 items-center justify-center gap-2 border-r border-[#E2E6EB] px-3 py-2.5 text-center text-[12px] font-bold last:border-r-0", done && "is-done bg-[#F0F6F3] text-[#27765F]", active && "is-active bg-[#EEF3F8] text-[#315F91]", !done && !active && "is-pending text-[#315D7B]")}><span className={cn("grid size-5 place-items-center rounded-full text-[10px]", done ? "bg-[#D9EAE2]" : active ? "bg-[#DCE7F1]" : "bg-[#E8EBEF]")}>{done ? "✓" : index + 1}</span>{label}</div> })}</div>
}

function SpeechBubble({ step, agent, action, text, active = false, muted = false }: { step: string; agent: string; action: string; text: string; active?: boolean; muted?: boolean }) {
  return <div className={cn("debate-dialogue-node relative rounded-[16px] border px-4 py-4", muted && "is-muted", active && "debate-bubble--active is-active")}><div className="debate-dialogue-kicker"><span>{step}</span>{action}</div><div className="mt-3 flex items-center gap-2 text-[14px] font-black text-[#173C5B]"><MessageCircle className="size-4.5 text-[#2E70A5]" />{agent}</div><p className="mt-2 text-[13px] leading-6 text-[#315D7B]">{text}</p></div>
}

function DecisionBox({ step, decision, text, active }: { step: string; decision?: "accept" | "rework"; text: string; active: boolean }) {
  return <div className={cn("debate-dialogue-node debate-decision-node relative rounded-[16px] border px-4 py-4", active && "debate-bubble--active is-active")}><div className="debate-dialogue-kicker"><span>{step}</span>最终决策</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><strong className="flex items-center gap-2 text-[14px] text-[#173C5B]"><Scale className="size-4.5 text-[#2E70A5]" />总决策 Agent</strong>{decision && <DecisionBadge decision={decision} />}</div><p className="mt-2 text-[13px] leading-6 text-[#315D7B]">{text}</p></div>
}

function DecisionBadge({ decision, round }: { decision: "accept" | "rework"; round?: number }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold", decision === "accept" ? "bg-[#E1F2EB] text-[#20755F]" : "bg-[#FFEDE4] text-[#A9573D]")}>{decision === "accept" ? <CheckCircle2 className="size-3.5" /> : <RotateCcw className="size-3.5" />}{round ? `第 ${round} 轮 · ` : ""}{decision === "accept" ? "通过" : "返工"}</span>
}

function reviewStatusLabel(status: string) {
  return ({ pass: "通过", warn: "有建议", fail: "未通过" } as Record<string, string>)[status] || status
}

function decisionLabel(decision: string) {
  return ({ publish: "可以使用", rework: "需要修改", failed: "暂不可用" } as Record<string, string>)[decision] || decision
}
