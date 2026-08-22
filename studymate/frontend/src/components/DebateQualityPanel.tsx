import {
  ArrowRight,
  CheckCircle2,
  GitCompareArrows,
  MessageCircle,
  RotateCcw,
  Scale,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { DebateExchange, DebateRecord, WorkspaceState } from "@/store/workspace"

const AGENT_LABELS: Record<string, string> = {
  domain_expert: "领域专家 Agent",
  learning_strategy: "教学策略 Agent",
  plan_arbiter: "训练计划仲裁 Agent",
  doc: "讲义生成 Agent",
  guide: "指南生成 Agent",
  quiz: "测试生成 Agent",
  mindmap: "思维导图生成 Agent",
  reading: "拓展阅读生成 Agent",
  code: "代码案例生成 Agent",
  video: "可视讲解生成 Agent",
  evidence_review: "事实审核 Agent",
  practice_review: "实操审核 Agent",
  difficulty_review: "难度审核 Agent",
}

const RESOURCE_REVIEWERS = {
  doc: ["evidence_review"],
  guide: ["evidence_review", "practice_review"],
  quiz: ["evidence_review", "difficulty_review"],
  mindmap: ["evidence_review", "difficulty_review"],
  reading: ["evidence_review", "difficulty_review"],
  code: ["practice_review", "difficulty_review"],
  video: ["evidence_review", "practice_review", "difficulty_review"],
} as const

type ResourceGenerator = keyof typeof RESOURCE_REVIEWERS

export function DebateQualityPanel({ workspace }: { workspace: WorkspaceState }) {
  const planningRound = 1 + workspace.reworkHistory.filter((item) => item.phase === "planning").length
  const planning = [...workspace.debates].reverse().find((item) => item.phase === "planning" && item.round === planningRound)
  const resource = [...workspace.debates].reverse().find((item) => item.phase === "resource" && item.round === workspace.generationRound)

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-[#BDD5EF] bg-[#F5FAFF]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D5E5F6] bg-[#EAF4FF] px-4 py-3">
        <div>
          <strong className="flex items-center gap-2 text-[12px] text-[#244F80]"><GitCompareArrows className="size-4 text-[#3378C3]" />可审计辩论实录</strong>
          <p className="mt-1 text-[9px] text-[#69829F]">明确展示谁提出观点、谁发起质疑、生成方如何回应，以及谁作出最终决定。</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {workspace.status === "running" && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCEEFF] px-2.5 py-1 text-[9px] font-black text-[#2467AB]"><i className="size-1.5 animate-pulse rounded-full bg-[#2E72D2]" />正在与协作流程同步更新 · {liveStageLabel(workspace.stage)}</span>}
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#507298]">
            {['提出观点', '发起质疑', '回应质疑', '作出决定'].map((label, index) => (
              <span key={label} className="contents"><span className="rounded-full border border-[#C7DBF1] bg-white px-2 py-1">{label}</span>{index < 3 && <ArrowRight className="size-3 text-[#7EA4CE]" />}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <PlanningDebate workspace={workspace} debate={planning} planningRound={planningRound} />
        <ResourceDebate workspace={workspace} debate={resource} />
      </div>
    </section>
  )
}

function PlanningDebate({ workspace, debate, planningRound }: { workspace: WorkspaceState; debate?: DebateRecord; planningRound: number }) {
  const liveExpert = workspace.outputs.domain_expert?.debate_round === planningRound ? workspace.outputs.domain_expert : undefined
  const liveStrategy = workspace.outputs.learning_strategy?.debate_round === planningRound ? workspace.outputs.learning_strategy : undefined
  const expert = debate?.positions?.domain_expert || liveExpert?.position || "等待领域专家提出专业覆盖与验收观点。"
  const strategy = debate?.positions?.learning_strategy || liveStrategy?.position || "等待教学策略 Agent 从时间和认知负荷角度发起质疑。"
  const responses = [
    ...(liveExpert?.response_to_feedback ?? []),
    ...(liveStrategy?.response_to_feedback ?? []),
  ]
  const response = responses.length
    ? responses.join("；")
    : debate?.conflict
      ? `双方确认本轮争议：${debate.conflict}`
      : "等待双方围绕专业覆盖与学习负荷进行交叉回应。"
  const activeStep = planningActiveStep(workspace.stage)

  return (
    <article className="rounded-2xl border border-[#C9DCF1] bg-white p-4 shadow-[0_10px_28px_rgba(58,104,153,.07)]">
      <DebateHeader number="第1轮辩论" title="训练计划观点交锋" description={`当前第 ${planningRound} 次协商 · 领域专家与教学策略提出不同约束，由训练计划仲裁 Agent 决定通过或返工。`} debate={debate} />
      <DebateSequence labels={["专业观点", "约束质疑", "交叉回应", "计划仲裁"]} activeStep={activeStep} completed={Boolean(debate)} />

      <div className="mt-4 space-y-2.5">
        <SpeechBubble agent="领域专家 Agent" action="提出观点" text={expert} side="left" active={activeStep === 0} />
        <SpeechBubble agent="教学策略 Agent" action="发起质疑" text={strategy} side="right" active={workspace.stage === "planning"} />
        <SpeechBubble agent="双方 Agent" action="回应质疑" text={response} side="left" active={workspace.stage === "plan_decision"} muted={!debate && !responses.length} />
        <DecisionBox
          agent="训练计划仲裁 Agent"
          text={debate?.resolution || "等待汇总双方观点后作出通过或返工决定。"}
          decision={debate?.decision}
          active={activeStep === 3}
        />
      </div>
    </article>
  )
}

function ResourceDebate({ workspace, debate }: { workspace: WorkspaceState; debate?: DebateRecord }) {
  const exchanges = (Object.keys(RESOURCE_REVIEWERS) as ResourceGenerator[]).map((generator) => buildLiveExchanges(workspace, debate, generator))
  const activeStep = resourceActiveStep(workspace.stage)

  return (
    <article className="rounded-2xl border border-[#C9DCF1] bg-white p-4 shadow-[0_10px_28px_rgba(58,104,153,.07)]">
      <DebateHeader number="第2轮辩论" title="七类资源生成与审核质询" description={`当前第 ${workspace.generationRound} 轮资源 · 七个生成 Agent 并行陈述，三组审核 Agent 交叉质询并独立决定接受或返工。`} debate={debate} />
      <DebateSequence labels={["资源陈述", "审核质询", "生成回应", "审核决定"]} activeStep={activeStep} completed={Boolean(debate)} />

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {exchanges.map((item, index) => (
          <ExchangeCard key={item.generator} exchanges={item.exchanges} index={index} activeStep={activeStep} outputReady={item.outputReady} reviewReady={item.reviewReady} />
        ))}
      </div>
    </article>
  )
}

function DebateHeader({ number, title, description, debate }: { number: string; title: string; description: string; debate?: DebateRecord }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-[#DCEEFF] px-3 py-1 text-[9px] font-black text-[#2867A9] ring-1 ring-[#BAD5F0]">{number}</span>
        <div><strong className="block text-[11px] text-[#2D4F75]">{title}</strong><p className="mt-1 text-[9px] leading-4 text-[#71849A]">{description}</p></div>
      </div>
      {debate && <DecisionBadge decision={debate.decision} round={debate.round} />}
    </div>
  )
}

function DebateSequence({ labels, activeStep, completed }: { labels: string[]; activeStep: number; completed: boolean }) {
  return (
    <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-xl border border-[#D5E3F2] bg-[#F7FAFE]">
      {labels.map((label, index) => {
        const done = completed || (activeStep >= 0 && index < activeStep)
        const active = activeStep === index
        return (
          <div key={label} className={cn("relative flex items-center justify-center gap-1.5 border-r border-[#DCE7F3] px-2 py-2 text-center text-[9px] font-bold last:border-r-0", done && "bg-[#EDF7F3] text-[#27765F]", active && "debate-step--active bg-[#E4F1FF] text-[#236AB4]", !done && !active && "text-[#8291A4]")}>
            <span className={cn("grid size-4 place-items-center rounded-full text-[8px]", done ? "bg-[#CFE9DF]" : active ? "bg-[#C8E1FB]" : "bg-[#E6ECF3]")}>{done ? "✓" : index + 1}</span>{label}
          </div>
        )
      })}
    </div>
  )
}

function SpeechBubble({ agent, action, text, side, active = false, muted = false, compact = false }: { agent: string; action: string; text: string; side: "left" | "right"; active?: boolean; muted?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex", side === "right" ? "justify-end" : "justify-start")}>
      <div className={cn("relative max-w-[88%] rounded-2xl border px-3 py-2.5", compact && "max-w-[94%] py-2", side === "left" ? "rounded-bl-md border-[#C8DDF2] bg-[#F1F7FE]" : "rounded-br-md border-[#D4D8F0] bg-[#F6F5FC]", muted && "border-dashed opacity-70", active && "debate-bubble--active")}>
        <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-[#315F91]"><MessageCircle className="size-3" />{agent}<span className="font-semibold text-[#7890AA]">· {action}</span></div>
        <p className={cn("mt-1 text-[10px] leading-5 text-[#526A84]", compact && "text-[9px] leading-4")}>{text}</p>
      </div>
    </div>
  )
}

function DecisionBox({ agent, text, decision, active }: { agent: string; text: string; decision?: "accept" | "rework"; active: boolean }) {
  return (
    <div className={cn("rounded-xl border border-[#C6D9ED] bg-[#F7FAFE] px-3 py-2.5", active && "debate-bubble--active")}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-[9px] text-[#365E8A]"><Scale className="size-3.5" />{agent} · 作出决定</strong>{decision && <DecisionBadge decision={decision} />}</div>
      <p className="mt-1 text-[10px] leading-5 text-[#526A84]">{text}</p>
    </div>
  )
}

function ExchangeCard({ exchanges, index, activeStep, outputReady, reviewReady }: { exchanges: DebateExchange[]; index: number; activeStep: number; outputReady: boolean; reviewReady: boolean }) {
  const primary = exchanges[0]
  const reviewerCount = exchanges.length
  const isExchangeReady = (exchange: DebateExchange) => exchange.review_score > 0 || exchange.reviewer_challenges.length > 0
  const readyCount = exchanges.filter(isExchangeReady).length
  const challenges = exchanges.flatMap((exchange) => exchange.reviewer_challenges)
  const response = exchanges.flatMap((exchange) => exchange.generator_response)
  const hasRework = exchanges.some((exchange) => isExchangeReady(exchange) && exchange.reviewer_decision === "rework")

  return (
    <div className="rounded-2xl border border-[#D4E2F1] bg-[#FBFDFF] p-3">
      <div className="flex items-center justify-between gap-2 border-b border-[#E1EAF4] pb-2">
        <strong className="text-[10px] text-[#355A84]">第 {index + 1} 类资源</strong>
        <span className="text-[8px] font-bold text-[#7990A9]">{reviewReady ? `${readyCount}/${reviewerCount} 组审核` : outputReady ? "资源已提交" : "正在生成"}</span>
      </div>
      <div className="mt-3 space-y-2">
        <SpeechBubble agent={AGENT_LABELS[primary.generator] || primary.generator} action="资源陈述" text={primary.generator_position} side="left" compact active={activeStep === 0} muted={!outputReady} />
        <SpeechBubble
          agent={`${reviewerCount} 组审核 Agent`}
          action="发起质询"
          text={challenges.length ? `${challenges[0].message}${challenges.length > 1 ? `（另有 ${challenges.length - 1} 项）` : ""}` : reviewReady ? "审核接受本轮资源，未发现需要返工的问题。" : "等待审核 Agent 发起专业质询。"}
          side="right"
          compact
          active={activeStep === 1}
          muted={!reviewReady}
        />
        <SpeechBubble
          agent={AGENT_LABELS[primary.generator] || primary.generator}
          action="回应质询"
          text={response.length ? `针对审核意见：${response.join("；")}` : challenges.length ? "审核意见已进入返工队列，等待生成方下一轮回应。" : reviewReady ? "确认接受本轮审核结论。" : "等待审核意见后作出回应。"}
          side="left"
          compact
          active={activeStep === 2}
          muted={!outputReady}
        />
      </div>
      <div className={cn("mt-2 rounded-xl border px-2.5 py-2 text-[9px]", hasRework && reviewReady ? "border-[#E6CBBB] bg-[#FFF6F1] text-[#A3573D]" : reviewReady ? "border-[#C7E0D6] bg-[#F1F9F5] text-[#23745E]" : "border-[#DCE5EF] bg-white text-[#8291A4]", activeStep === 3 && "debate-bubble--active")}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">审核汇总结论</span>
          {reviewReady ? <DecisionBadge decision={hasRework ? "rework" : "accept"} /> : <span>待决定</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {exchanges.map((exchange) => (
            <span key={exchange.reviewer} className="rounded-full bg-white/80 px-1.5 py-0.5 text-[8px]">{AGENT_LABELS[exchange.reviewer] || exchange.reviewer} · {isExchangeReady(exchange) ? `${exchange.review_score} 分` : "等待"}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function DecisionBadge({ decision, round }: { decision: "accept" | "rework"; round?: number }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold", decision === "accept" ? "bg-[#E1F2EB] text-[#20755F]" : "bg-[#FFEDE4] text-[#A9573D]")}>{decision === "accept" ? <CheckCircle2 className="size-3" /> : <RotateCcw className="size-3" />}{round ? `第 ${round} 轮 · ` : ""}{decision === "accept" ? "通过" : "返工"}</span>
}

function buildLiveExchanges(workspace: WorkspaceState, debate: DebateRecord | undefined, generator: ResourceGenerator) {
  const output = workspace.outputs[generator]
  const outputMeta = output as ({ title?: string; version?: number; revision_response?: string[] } | undefined)
  const lastResourceRework = [...workspace.reworkHistory].reverse().find((item) => item.phase === "resource")
  const outputVersion = Number(outputMeta?.version ?? (output ? 1 : 0))
  const waitingForTargetRetry = workspace.stage === "generation"
    && Boolean(lastResourceRework?.targets.includes(generator))
    && outputVersion < workspace.generationRound
  const outputReady = Boolean(output && !waitingForTargetRetry)
  const exchanges = RESOURCE_REVIEWERS[generator].map((reviewer) => {
    const completed = debate?.exchanges?.find((item) => item.generator === generator && item.reviewer === reviewer)
    const review = workspace.reviews[reviewer]
    const reviewReady = Boolean(completed || review)
    return completed ?? {
      generator,
      reviewer,
      generator_position: outputReady && output
        ? `${outputMeta?.title || generator} · 第 ${outputVersion || workspace.generationRound} 轮资源陈述`
        : `正在生成第 ${workspace.generationRound} 轮资源，完成后将立即陈述设计与知识依据。`,
      generator_response: outputReady ? (outputMeta?.revision_response ?? []) : [],
      reviewer_challenges: review?.findings?.filter((finding) => finding.target_agent === generator) ?? [],
      reviewer_decision: review?.decision ?? (review?.status === "pass" ? "accept" : "rework"),
      review_score: reviewReady ? review?.score ?? 0 : 0,
    } satisfies DebateExchange
  })
  const reviewReady = RESOURCE_REVIEWERS[generator].some((reviewer) => Boolean(
    debate?.exchanges?.some((item) => item.generator === generator && item.reviewer === reviewer) || workspace.reviews[reviewer],
  ))
  return { generator, exchanges, outputReady, reviewReady }
}

function planningActiveStep(stage: string): number {
  if (stage === "planning") return 0
  if (stage === "plan_decision") return 3
  return -1
}

function resourceActiveStep(stage: string): number {
  if (stage === "generation") return 0
  if (stage === "review") return 1
  if (stage === "rework") return 2
  if (stage === "decision") return 3
  return -1
}

function liveStageLabel(stage: string) {
  const labels: Record<string, string> = {
    diagnosis: "准备辩论依据",
    retrieval: "检索专业证据",
    planning: "双方正在提出观点",
    plan_decision: "计划仲裁正在回应与裁决",
    generation: "七类生成方正在并行陈述",
    review: "三组审核方正在交叉质询",
    rework: "生成方正在回应并返工",
    decision: "审核结论正在汇总",
    publishing: "裁决通过，准备发布",
    published: "本轮辩论已完成",
  }
  return labels[stage] ?? "等待下一步事件"
}
