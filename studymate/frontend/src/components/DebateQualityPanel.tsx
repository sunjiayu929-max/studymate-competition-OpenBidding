import { CheckCircle2, GitCompareArrows, RotateCcw, ShieldCheck, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DebateRecord, QualityMetric, WorkspaceState } from "@/store/workspace"

const AGENT_LABELS: Record<string, string> = {
  domain_expert: "领域专家",
  learning_strategy: "教学策略",
  plan_arbiter: "计划仲裁",
  doc: "讲义生成",
  guide: "指南生成",
  quiz: "测试生成",
  evidence_review: "事实审核",
  practice_review: "实操审核",
  difficulty_review: "难度审核",
}

export function DebateQualityPanel({ workspace }: { workspace: WorkspaceState }) {
  const planning = [...workspace.debates].reverse().find((item) => item.phase === "planning")
  const resource = [...workspace.debates].reverse().find((item) => item.phase === "resource")
  const metrics = Object.entries(workspace.decision?.quality_metrics ?? {})

  if (!planning && !resource && !metrics.length) {
    return <div className="mt-4 rounded-2xl border border-dashed border-[#CBD8E8] bg-[#F8FBFF] p-4 text-[10px] leading-5 text-[#718096]">启动训练后，这里会展示两次辩论、审核质询和三项总裁决指标。</div>
  }

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(330px,.8fr)]">
      <div className="space-y-3">
        <DebateCard debate={planning} fallbackTitle="第一次辩论 · 训练计划协商" />
        <DebateCard debate={resource} fallbackTitle="第二次辩论 · 资源生成与审核质询" />
      </div>
      <div className="rounded-2xl border border-[#DCE4EE] bg-[#F8FAFD] p-4">
        <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#334B68]"><ShieldCheck className="size-4" />总裁决三项门槛</div>
        <div className="mt-3 space-y-2">
          {metrics.length ? metrics.map(([key, metric]) => <MetricRow key={key} metric={metric} />) : <p className="text-[10px] leading-5 text-[#7A899D]">等待交叉审核完成后计算真实指标。</p>}
        </div>
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[9px] leading-4 text-[#75859A]">门槛：幻觉率 &lt;5% · 难度适配准确率 ≥85% · 核心知识点覆盖率 ≥90%。达到 3 次返工上限仍不合格时停止发布，保留真实分数。</p>
      </div>
    </div>
  )
}

function DebateCard({ debate, fallbackTitle }: { debate?: DebateRecord; fallbackTitle: string }) {
  return (
    <article className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <strong className="flex items-center gap-2 text-[11px] text-[#334B68]"><GitCompareArrows className="size-4 text-[#6E59A5]" />{debate?.title || fallbackTitle}</strong>
        {debate && <DecisionBadge decision={debate.decision} round={debate.round} />}
      </div>
      {!debate ? <p className="mt-2 text-[10px] leading-5 text-[#7A899D]">等待本次辩论执行。</p> : debate.phase === "planning" ? (
        <div className="mt-3 space-y-2 text-[10px] leading-5">
          <Position label="领域专家" text={debate.positions?.domain_expert || "—"} />
          <Position label="教学策略" text={debate.positions?.learning_strategy || "—"} />
          <div className="rounded-xl bg-[#F6F2FB] px-3 py-2 text-[#655778]"><b>仲裁：</b>{debate.conflict || "无冲突"}<br /><b>结论：</b>{debate.resolution || "等待结论"}</div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(debate.exchanges ?? []).map((exchange) => (
            <div key={`${exchange.generator}-${exchange.reviewer}`} className={cn("rounded-xl border px-3 py-2.5", exchange.reviewer_decision === "accept" ? "border-[#CBE1D8] bg-[#F4FAF7]" : "border-[#E7CCBE] bg-[#FFF7F2]")}>
              <div className="flex items-center justify-between gap-2 text-[9px] font-extrabold"><span>{AGENT_LABELS[exchange.generator] || exchange.generator} ↔ {AGENT_LABELS[exchange.reviewer] || exchange.reviewer}</span><span>{exchange.review_score} 分</span></div>
              <p className="mt-1.5 text-[9px] leading-4 text-[#6E7D90]">{exchange.reviewer_challenges.length ? `${exchange.reviewer_challenges.length} 项质疑：${exchange.reviewer_challenges[0].message}` : "审核接受本轮资源，无需返工。"}</p>
              {exchange.generator_response.length > 0 && <p className="mt-1.5 border-t border-current/10 pt-1.5 text-[9px] leading-4 text-[#526982]">生成方回应：已按上轮 {exchange.generator_response.length} 项意见修订</p>}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function Position({ label, text }: { label: string; text: string }) {
  return <div className="rounded-xl bg-[#F5F8FC] px-3 py-2 text-[#61738A]"><b className="text-[#355E91]">{label}：</b>{text}</div>
}

function DecisionBadge({ decision, round }: { decision: "accept" | "rework"; round: number }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold", decision === "accept" ? "bg-[#E4F3ED] text-[#20755F]" : "bg-[#FFF0E8] text-[#A9573D]")}>{decision === "accept" ? <CheckCircle2 className="size-3" /> : <RotateCcw className="size-3" />}第 {round} 轮 · {decision === "accept" ? "接受" : "返工"}</span>
}

function MetricRow({ metric }: { metric: QualityMetric }) {
  const Icon = metric.passed ? CheckCircle2 : XCircle
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"><div className="flex items-center gap-2"><Icon className={cn("size-3.5", metric.passed ? "text-[#238066]" : "text-[#B4513C]")} /><span className="text-[10px] font-bold text-[#526982]">{metric.label}</span></div><span className={cn("text-[11px] font-black", metric.passed ? "text-[#238066]" : "text-[#B4513C]")}>{metric.value}%</span></div>
}
