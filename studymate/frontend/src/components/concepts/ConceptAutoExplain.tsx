/**
 * 多 Agent 工作台「可视讲解」卡内容：按当前 topic 自动出 AI 动画/黑板 + B 站视频。
 * 前端合成，不走 orchestrator —— 复用 /concept 同一套讲解逻辑（ConceptResultView）。
 * 原 /concept 入口保留不变，这里只是把同一能力「同步」进工作台。
 */
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Film } from "lucide-react"
import { explainConcept, type ExplainResult } from "@/lib/concept"
import { ConceptResultView } from "@/components/concepts/ConceptResultView"

export function ConceptAutoExplain({ topic, userId }: { topic: string; userId: number }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExplainResult | null>(null)

  useEffect(() => {
    if (!topic) return
    let cancelled = false
    setLoading(true)
    setResult(null)
    explainConcept(topic, userId)
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [topic, userId])

  if (!topic) {
    return (
      <div className="text-center py-16 text-sm text-[var(--muted-foreground)]">
        先在工作台输入主题，这里会自动出可视讲解。
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Film className="size-3.5 text-amber-500" />
        围绕《{topic}》的 AI 动画/黑板讲解 + B 站真人视频。想自由搜索其它概念？
        <Link to="/concept" className="text-[var(--primary)] hover:underline">
          去可视讲解页
        </Link>
      </p>
      <ConceptResultView result={result} loading={loading} lastQuery={topic} />
    </div>
  )
}
