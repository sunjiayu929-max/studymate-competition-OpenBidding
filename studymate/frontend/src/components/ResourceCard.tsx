import { motion } from "framer-motion"
import { ChevronRight, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type ResourceStatus = "pending" | "running" | "streaming" | "done" | "error"

interface ResourceCardProps {
  /** Agent id，例：doc / mindmap / quiz / reading / code / path */
  agentId: string
  title: string
  icon: LucideIcon
  /** Tailwind color tone, e.g. "indigo" / "rose" / "emerald" / "amber" / "sky" / "violet" */
  tone: "indigo" | "rose" | "emerald" | "amber" | "sky" | "violet"
  status: ResourceStatus
  /** 完成后展示的摘要：例 "850 字 · 6 个引用" / "5 道题" */
  summary?: string
  /** 流式进度：streaming 状态时显示，0-100 */
  progress?: number
  /** 错误信息 */
  errorMessage?: string
  onClick?: () => void
}

const TONE: Record<ResourceCardProps["tone"], { text: string; bg: string; border: string; iconBg: string }> = {
  indigo:  { text: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950/40",   border: "hover:border-indigo-400",  iconBg: "bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300" },
  rose:    { text: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950/40",       border: "hover:border-rose-400",    iconBg: "bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300" },
  emerald: { text: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "hover:border-emerald-400", iconBg: "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300" },
  amber:   { text: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/40",     border: "hover:border-amber-400",   iconBg: "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-300" },
  sky:     { text: "text-sky-600",     bg: "bg-sky-50 dark:bg-sky-950/40",         border: "hover:border-sky-400",     iconBg: "bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-300" },
  violet:  { text: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950/40",   border: "hover:border-violet-400",  iconBg: "bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-300" },
}

export function ResourceCard({ agentId, title, icon: Icon, tone, status, summary, progress, errorMessage, onClick }: ResourceCardProps) {
  const t = TONE[tone]
  const clickable = status === "done" && onClick
  const isLoading = status === "running" || status === "streaming"

  return (
    <motion.button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      whileHover={clickable ? { y: -2 } : undefined}
      whileTap={clickable ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15 }}
      className={`group text-left bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 transition-all ${
        clickable
          ? `cursor-pointer hover:shadow-md ${t.border}`
          : "cursor-default opacity-95"
      }`}
      data-agent={agentId}
    >
      <div className="flex items-start gap-3">
        <div className={`size-11 rounded-xl ${t.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className="font-semibold text-sm leading-tight truncate">{title}</h3>
            <StatusChip status={status} tone={tone} />
          </div>

          {/* 内容区随状态变化 */}
          {status === "done" && (
            <p className="text-xs text-[var(--muted-foreground)] line-clamp-2">{summary || "已完成"}</p>
          )}
          {status === "error" && (
            <p className="text-xs text-rose-600 line-clamp-2">{errorMessage || "生成失败"}</p>
          )}
          {status === "pending" && (
            <p className="text-xs text-[var(--muted-foreground)] italic">等待启动</p>
          )}
          {isLoading && (
            <>
              <p className="text-xs text-[var(--muted-foreground)] italic mb-1.5">
                {status === "streaming" ? "正在流式输出..." : "Agent 启动中..."}
              </p>
              <div className="h-1 bg-[var(--muted)] rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${t.iconBg.split(" ")[0]}`}
                  animate={{ width: `${progress ?? (status === "streaming" ? 60 : 15)}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </>
          )}
        </div>

        {clickable && (
          <ChevronRight className="size-4 text-[var(--muted-foreground)] group-hover:translate-x-0.5 transition-transform shrink-0 mt-2.5" />
        )}
      </div>
    </motion.button>
  )
}

function StatusChip({ status, tone }: { status: ResourceStatus; tone: ResourceCardProps["tone"] }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
        <CheckCircle2 className="size-2.5" /> 已完成
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 shrink-0">
        <AlertCircle className="size-2.5" /> 失败
      </span>
    )
  }
  if (status === "running" || status === "streaming") {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${TONE[tone].iconBg} shrink-0`}>
        <Loader2 className="size-2.5 animate-spin" /> 生成中
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0">
      <Clock className="size-2.5" /> 待启动
    </span>
  )
}
