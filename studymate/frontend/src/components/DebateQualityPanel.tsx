import {
  ArrowRight,
  CheckCircle2,
  GitCompareArrows,
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
    <details open className="mt-4 overflow-hidden rounded-[22px] border border-[#BDD5EF] bg-[#F5FAFF]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 border-b border-[#D5E5F6] bg-[#EAF4FF] px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div><strong className="flex items-center gap-2 text-[12px] text-[#244F80]"><GitCompareArrows className="size-4 text-[#3378C3]" />辩论实录</strong><p className="mt-1 text-[9px] text-[#69829F]">六类资源已合并为一个资源生成 Agent，实时展示资源陈述、三项校验质询、回应与最终决策。</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black", active ? "bg-[#DCEEFF] text-[#2467AB]" : completed ? "bg-[#E1F2EB] text-[#20755F]" : "bg-white text-[#8291A4]")}>{active && <i className="size-1.5 animate-pulse rounded-full bg-[#2E72D2]" />}{active ? "实时同步中" : completed ? "已记录" : "等待辩论"}</span><span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#507298]">展开查看 <ArrowRight className="size-3" /></span></div>
      </summary>
      <div className="space-y-4 p-4">
        <DebateSequence activeStep={debateActiveStep(workspace.stage)} completed={completed} />
        <article className="rounded-2xl border border-[#C9DCF1] bg-white p-4 shadow-[0_10px_28px_rgba(58,104,153,.07)]">
          <div className="flex flex-wrap items-start justify-between gap-3"><strong className="block text-[11px] text-[#2D4F75]">资源生成 Agent × 三项校验 Agent</strong>{debate && <DecisionBadge decision={debate.decision} round={debate.round} />}</div>
          <div className="mt-4 space-y-2.5"><SpeechBubble agent="资源生成 Agent" action="资源陈述" text={resourcePosition(workspace, exchanges)} side="left" active={workspace.stage === "generation"} muted={!exchanges.length && !workspace.outputs.doc} /><SpeechBubble agent="三项校验 Agent" action="发起校验质询" text={reviewChallenges(workspace, exchanges)} side="right" active={workspace.stage === "review"} muted={!Object.keys(workspace.reviews).length} /><SpeechBubble agent="资源生成 Agent" action="回应校验" text={resourceResponse(workspace, exchanges)} side="left" active={workspace.stage === "rework"} muted={!exchanges.some((item) => item.generator_response.length)} /><DecisionBox decision={debate?.decision ?? decisionFromReviews(workspace)} text={debate?.resolution || workspace.decision?.summary || "等待三项校验结果汇总后，由总决策 Agent 决定发布或自动返工。"} active={workspace.stage === "decision"} /></div>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#DFE6EF] bg-[#F8FAFD] p-4">
        <strong className="text-[11px] text-[#334B68]">交叉验证结果</strong>
        <div className="mt-3 space-y-2">
          {["evidence_review", "practice_review", "difficulty_review"].map((id) => {
            const review = workspace.reviews[id]
            return <div key={id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-[10px]"><span className="text-[#62748B]">{REVIEWER_LABELS[id]}</span><span className={cn("shrink-0 font-black", review?.status === "pass" ? "text-[#1A8067]" : review?.status === "fail" ? "text-[#B4523B]" : review ? "text-[#A06C24]" : "text-[#8291A4]")}>{review ? `${review.score} 分 · ${reviewStatusLabel(review.status)}` : "等待校验"}</span></div>
          })}
        </div>
      </section>
      <section className={cn("rounded-2xl border p-4", decision?.decision === "publish" ? "border-[#BFDCCF] bg-[#F3FAF7]" : decision?.decision === "rework" || decision?.decision === "failed" ? "border-[#E8CDBE] bg-[#FFF7F2]" : "border-[#DFE6EF] bg-[#F8FAFD]")}>
        <strong className="flex items-center gap-2 text-[11px] text-[#334B68]"><ShieldCheck className="size-3.5" />审核结果</strong>
        <p className="mt-2 text-[10px] leading-5 text-[#687991]">{decision?.summary || "完成全部校验后，资源将开放或返回修改。"}</p>
        {decision && <>
          <div className="mt-3 space-y-1.5">
            {decisionMetrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-[9px]"><span className="font-semibold text-[#5D7088]">{metric.label}</span><span className={cn("shrink-0 font-black", metric.passed === false ? "text-[#B4523B]" : "text-[#168069]")}>实际结果 {metric.value === undefined ? "--" : `${metric.value}%`} {metric.rule}</span></div>)}
          </div>
          <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#426384]">{decisionLabel(decision.decision)} · 质量分 {decision.quality_score}</span>
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
  return <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-[#D5E3F2] bg-[#F7FAFE]">{["资源陈述", "校验质询", "生成回应", "总决策"].map((label, index) => { const done = completed || (activeStep >= 0 && index < activeStep); const active = activeStep === index; return <div key={label} className={cn("relative flex items-center justify-center gap-1.5 border-r border-[#DCE7F3] px-2 py-2 text-center text-[9px] font-bold last:border-r-0", done && "bg-[#EDF7F3] text-[#27765F]", active && "bg-[#E4F1FF] text-[#236AB4]", !done && !active && "text-[#8291A4]")}><span className={cn("grid size-4 place-items-center rounded-full text-[8px]", done ? "bg-[#CFE9DF]" : active ? "bg-[#C8E1FB]" : "bg-[#E6ECF3]")}>{done ? "✓" : index + 1}</span>{label}</div> })}</div>
}

function SpeechBubble({ agent, action, text, side, active = false, muted = false }: { agent: string; action: string; text: string; side: "left" | "right"; active?: boolean; muted?: boolean }) {
  return <div className={cn("flex", side === "right" ? "justify-end" : "justify-start")}><div className={cn("relative max-w-[92%] rounded-2xl border px-3 py-2.5", side === "left" ? "rounded-bl-md border-[#C8DDF2] bg-[#F1F7FE]" : "rounded-br-md border-[#D4D8F0] bg-[#F6F5FC]", muted && "border-dashed opacity-70", active && "debate-bubble--active")}><div className="flex items-center gap-1.5 text-[9px] font-extrabold text-[#315F91]"><MessageCircle className="size-3" />{agent}<span className="font-semibold text-[#7890AA]">· {action}</span></div><p className="mt-1 text-[10px] leading-5 text-[#526A84]">{text}</p></div></div>
}

function DecisionBox({ decision, text, active }: { decision?: "accept" | "rework"; text: string; active: boolean }) {
  return <div className={cn("rounded-xl border border-[#C6D9ED] bg-[#F7FAFE] px-3 py-2.5", active && "debate-bubble--active")}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-[9px] text-[#365E8A]"><Scale className="size-3.5" />总决策 Agent · 做出决策</strong>{decision && <DecisionBadge decision={decision} />}</div><p className="mt-1 text-[10px] leading-5 text-[#526A84]">{text}</p></div>
}

function DecisionBadge({ decision, round }: { decision: "accept" | "rework"; round?: number }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold", decision === "accept" ? "bg-[#E1F2EB] text-[#20755F]" : "bg-[#FFEDE4] text-[#A9573D]")}>{decision === "accept" ? <CheckCircle2 className="size-3" /> : <RotateCcw className="size-3" />}{round ? `第 ${round} 轮 · ` : ""}{decision === "accept" ? "通过" : "返工"}</span>
}

function reviewStatusLabel(status: string) {
  return ({ pass: "通过", warn: "有建议", fail: "未通过" } as Record<string, string>)[status] || status
}

function decisionLabel(decision: string) {
  return ({ publish: "可以使用", rework: "需要修改", failed: "暂不可用" } as Record<string, string>)[decision] || decision
}
