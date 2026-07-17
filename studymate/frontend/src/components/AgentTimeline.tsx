import { Loader2, Check, Clock, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export interface AgentMeta {
  id: string
  name: string
  icon: string
  color: string  // tailwind color name
  description: string
}

export type AgentStatus = "pending" | "running" | "streaming" | "done" | "error"

export interface AgentState {
  meta: AgentMeta
  status: AgentStatus
  message?: string
  progress?: number
}

interface AgentTimelineProps {
  agents: AgentState[]
  logs: string[]
}

const COLOR_BG: Record<string, string> = {
  sky: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300/50",
  indigo: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300/50",
  rose: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300/50",
  emerald: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300/50",
  amber: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300/50",
}

export function AgentTimeline({ agents, logs }: AgentTimelineProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">🤝 多智能体协作</h3>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {agents.filter((a) => a.status === "done").length}/{agents.length} 已完成
        </span>
      </div>

      {/* Agent 头像横排 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {agents.map((a) => (
          <motion.div
            key={a.meta.id}
            animate={a.status === "running" || a.status === "streaming" ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg border transition-all",
              COLOR_BG[a.meta.color] || COLOR_BG.indigo,
              a.status === "pending" && "opacity-50",
              a.status === "done" && "ring-1 ring-emerald-400/60",
            )}
          >
            <div className="text-xl shrink-0">{a.meta.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{a.meta.name}</div>
              <div className="text-[10px] opacity-75 truncate">{a.meta.description}</div>
            </div>
            <StatusIcon status={a.status} />
          </motion.div>
        ))}
      </div>

      {/* 实时日志流 */}
      <div className="bg-[var(--background)] border border-[var(--border)] rounded p-2 max-h-32 overflow-y-auto font-mono text-[11px] space-y-0.5">
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="text-[var(--muted-foreground)] italic">等待启动协作...</div>
          ) : (
            logs.slice(-50).map((line, i) => (
              <motion.div
                key={`${logs.length}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[var(--foreground)]"
              >
                <span className="text-[var(--muted-foreground)]">{">"} </span>
                {line}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "pending":
      return <Clock className="size-4 opacity-50" />
    case "running":
    case "streaming":
      return <Loader2 className="size-4 animate-spin" />
    case "done":
      return <Check className="size-4 text-emerald-600" />
    case "error":
      return <AlertCircle className="size-4 text-rose-600" />
  }
}
