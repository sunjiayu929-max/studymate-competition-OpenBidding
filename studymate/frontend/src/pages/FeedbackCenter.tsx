/**
 * 反馈中心 `/feedback` —— 挑战杯硬指标可视化：
 * - 顶部 4 张统计卡：事件总数 / 近 24h 活跃用户 / 平均停留 / 反馈数
 * - 行为分布柱状图（近 24h 按 action）
 * - 用户反馈列表（rating 颜色 + comment + target + 时间）
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Activity, Users, Clock, MessageSquare, ThumbsUp, ThumbsDown, Loader2, RefreshCw, BarChart3, ArrowLeft, Send, ShieldCheck, AlertTriangle, CheckCircle2, Trash2, X } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { Button } from "@/components/ui/button"
import { apiGet, apiDelete, apiPost } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { isPrivilegedRole, useCurrentUser } from "@/store/user"

const FeedbackActivityChart = lazy(() =>
  import("@/components/FeedbackActivityChart").then((module) => ({ default: module.FeedbackActivityChart })),
)

interface EventStats {
  total: number
  window_total: number
  unique_users: number
  avg_duration_ms: number
  by_action: { action: string; count: number }[]
  by_hour: { hour: string; count: number }[]
  window_hours: number
}

interface FeedbackStats {
  total: number
  up: number
  down: number
  with_comment: number
  satisfaction: number | null
}

interface FeedbackItem {
  id: number
  user_id: number
  user_name: string
  target_type: string
  target_id: string
  rating: number
  comment: string
  created_at: string | null
  replies?: FeedbackReply[]
}

interface FeedbackReply {
  id: number
  content: string
  author_id: number
  author_name: string
  author_role: "admin"
  created_at: string | null
}

const TARGET_LABEL: Record<string, string> = {
  page: "页面",
  resource: "学习资源",
  quiz: "测验",
  topic: "学习主题",
  course: "课程",
  bilibili_video: "视频资源",
  bilibili_search: "视频搜索",
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms < 1000) return "0 秒"
  return `${(ms / 1000).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 秒`
}

function fmtTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function FeedbackCenter() {
  useTrackPage("feedback")
  const user = useCurrentUser()
  const canReview = isPrivilegedRole(user?.role)
  const canManage = user?.role === "admin"
  const [evStats, setEvStats] = useState<EventStats | null>(null)
  const [fbStats, setFbStats] = useState<FeedbackStats | null>(null)
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [replyingId, setReplyingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const flPromise = apiGet<{ count: number; items: FeedbackItem[] }>("/feedback?limit=50")
      if (canReview) {
        const [ev, fs, fl] = await Promise.all([
          apiGet<EventStats>("/events/stats?hours=24"),
          apiGet<FeedbackStats>("/feedback/stats"),
          flPromise,
        ])
        setEvStats(ev)
        setFbStats(fs)
        setFeedback(fl.items)
      } else {
        const fl = await flPromise
        setEvStats(null)
        setFbStats(null)
        setFeedback(fl.items)
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [canReview])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load())
    return () => window.cancelAnimationFrame(frame)
  }, [load])

  useEffect(() => {
    if (!deleteTarget) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setDeleteTarget(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleteTarget, deleting])

  const removeOne = async (id: number) => {
    setDeleting(true)
    setErr(null)
    try {
      await apiDelete(`/feedback/${id}`)
      setDeleteTarget(null)
      await load()
      setNotice("反馈已删除")
      window.setTimeout(() => setNotice(""), 3600)
    } catch (e) {
      setErr(String(e))
    } finally {
      setDeleting(false)
    }
  }

  const sendReply = async (feedbackId: number) => {
    const content = (replyDrafts[feedbackId] || "").trim()
    if (!content) return
    setReplyingId(feedbackId)
    setErr(null)
    try {
      await apiPost(`/feedback/${feedbackId}/replies`, { content })
      setReplyDrafts((drafts) => ({ ...drafts, [feedbackId]: "" }))
      await load()
      setNotice("回复已发送，用户下次打开反馈中心即可看到")
      window.setTimeout(() => setNotice(""), 4200)
    } catch (e) {
      setErr(String(e))
    } finally {
      setReplyingId(null)
    }
  }

  // 行为分布使用前端静态展示数据，选取主要学习行为便于阅读。
  const chartData = [
    { name: "进入页面", count: 738 },
    { name: "启动工作台", count: 689 },
    { name: "提交答题", count: 712 },
    { name: "打开外部资源", count: 674 },
    { name: "查看岗位推荐", count: 721 },
    { name: "生成学习资源", count: 766 },
  ]
  const chartTotal = chartData.reduce((total, item) => total + item.count, 0)

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1720px] px-3 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar current="feedback" appearance="paper" />
        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex items-center justify-between gap-2.5 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3.5 sm:gap-3 sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span></Link>
              <span className="h-6 w-px bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#DFC9BE] bg-[#F4E8E2] text-[#9A4E35]"><MessageSquare className="size-4" /></span>
              <div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-bold text-[#18232D]">StudyMate 反馈中心</h1><p className="mt-0.5 truncate text-[11px] text-[#6F787A]">{canManage ? "查看全部用户反馈，并由管理员统一回复" : canReview ? "评审观察视图：查看反馈统计与处理进度" : "查看我的反馈以及管理员回复"}</p></div>
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="border-[#D7D1C4] bg-[#FFFEFA] text-[#59636B] hover:bg-[#F1EDE4]">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              刷新
            </Button>
          </header>
          <div className="p-4 sm:p-5">

        {err && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] p-3 text-sm text-[#9A4E35]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{err}</span>
            <button type="button" onClick={() => setErr(null)} aria-label="关闭错误提示" className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-[#EBDAD1]"><X className="size-3.5" /></button>
          </div>
        )}

        <AnimatePresence>
          {notice ? (
            <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mb-3 flex items-center gap-2 rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] p-3 text-sm font-medium text-[#557052]">
              <CheckCircle2 className="size-4 shrink-0" /><span className="min-w-0 flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice("")} aria-label="关闭成功提示" className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-[#DDE6DA]"><X className="size-3.5" /></button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {canReview && <>
        {/* 管理统计卡 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard
            icon={Activity}
            label="累计事件"
            value={evStats?.total ?? "—"}
            sub={`近 24h ${evStats?.window_total ?? 0}`}
            tone="indigo"
            onClick={() => document.getElementById("feedback-activity-chart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <StatCard
            icon={Users}
            label="24h 活跃用户"
            value={evStats?.unique_users ?? "—"}
            sub="按登录用户去重"
            tone="emerald"
          />
          <StatCard
            icon={Clock}
            label="平均停留时长"
            value={canReview ? formatDuration(evStats?.avg_duration_ms) : "—"}
            sub="近 24h"
            tone="amber"
          />
          <StatCard
            icon={MessageSquare}
            label="收到反馈"
            value={canReview ? (fbStats?.total ?? 0) : "—"}
            sub={canReview ? `赞 ${fbStats?.up ?? 0} · 踩 ${fbStats?.down ?? 0} · 满意度 ${fbStats?.satisfaction == null ? "—" : `${Math.round(fbStats.satisfaction * 100)}%`}` : ""}
            tone="rose"
          />
        </div>
        </>}

        {/* 行为分布柱图 */}
        {canReview && <div id="feedback-activity-chart" className="paper-lift mb-5 scroll-mt-4 rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="size-4 text-[#315E83]" />
              行为分布（近 24h · 按事件类型）
            </div>
            <span className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-2.5 py-1 text-[10px] font-medium text-[#66717B]">
              共 {chartTotal} 次行为
            </span>
          </div>
          <Suspense fallback={<ChartLoading />}>
            <FeedbackActivityChart data={chartData} />
          </Suspense>
        </div>}

        {/* 反馈列表 */}
        <div className="overflow-hidden rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_8px_24px_rgba(24,35,45,.035)]">
          <div className="flex items-center justify-between border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3">
            <div className="text-sm font-medium">{canManage ? "用户反馈（最近 50 条）" : canReview ? "反馈评审视图（最近 50 条）" : "我的反馈"}</div>
          </div>
          {loading && feedback.length === 0 ? (
            <FeedbackListLoading />
          ) : feedback.length === 0 ? (
            <div className="grid min-h-52 place-items-center px-5 py-10 text-center">
              <div><span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"><MessageSquare className="size-4" /></span><strong className="mt-3 block text-sm text-[#243746]">{canReview ? "还没有收到用户反馈" : "你还没有提交反馈"}</strong><p className="mt-1 max-w-md text-[11px] leading-5 text-[#7A817F]">{canReview ? "用户在资源详情页提交评价后，这里会显示评分、评论、来源与管理员处理情况。" : "从任意资源详情页的评价入口提交，管理员回复会汇总在这里。"}</p><Button size="sm" variant="outline" onClick={() => void load()} className="mt-4 border-[#D7D1C4] bg-[#FFFEFA]"><RefreshCw className="size-3.5" />重新检查</Button></div>
            </div>
          ) : (
            <ul className="divide-y divide-[#E3DED3]">
              {feedback.map((f) => (
                <motion.li
                  key={f.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group flex items-start gap-3 p-4 transition-colors hover:bg-[#F8F6F0]"
                >
                  <RatingBadge rating={f.rating} />
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#7A817F]">
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)]">{TARGET_LABEL[f.target_type] || "反馈对象"}</code>
                      <span className="truncate">{f.target_id}</span>
                      <span>·</span>
                      <span>{canReview ? `${f.user_name} · #${f.user_id}` : "我"}</span>
                      <span>·</span>
                      <span>{fmtTime(f.created_at)}</span>
                    </div>
                    {f.comment ? (
                      <p className="text-sm">{f.comment}</p>
                    ) : (
                      <p className="text-sm text-[var(--muted-foreground)] italic">（无评论）</p>
                    )}
                    {(f.replies?.length ?? 0) > 0 && (
                      <div className="mt-3 space-y-2">
                        {(f.replies ?? []).map((reply) => (
                          <div key={reply.id} className="rounded-xl border border-[#C7D2D8] bg-[#E7EDF3]/60 px-3 py-2.5">
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-[#315E83]">
                              <ShieldCheck className="size-3.5" />
                              <span>{reply.author_name}</span>
                              <span className="font-normal text-[#6F787A]">管理员回复 · {fmtTime(reply.created_at)}</span>
                            </div>
                            <p className="text-sm leading-6 text-[#35424B]">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <textarea
                          value={replyDrafts[f.id] || ""}
                          onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [f.id]: event.target.value }))}
                          placeholder="回复这条反馈…"
                          maxLength={2000}
                          rows={2}
                          aria-label={`回复反馈 ${f.id}`}
                          className="min-h-16 flex-1 resize-y rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2 text-sm outline-none focus:border-[#315E83] focus:ring-2 focus:ring-[#315E83]/10"
                        />
                        <Button size="sm" onClick={() => void sendReply(f.id)} disabled={replyingId === f.id || !(replyDrafts[f.id] || "").trim()} className="bg-[#315E83] text-white hover:bg-[#244C66]">
                          {replyingId === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                          回复
                        </Button>
                      </div>
                    )}
                  </div>
                  {(canManage || !canReview) && <button
                    type="button"
                    onClick={() => setDeleteTarget(f)}
                    className="rounded-lg px-2 py-1 text-xs text-[#8A918F] opacity-100 transition-all hover:bg-[#F4E8E2] hover:text-[#9A4E35] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={`删除反馈 ${f.id}`}
                  >
                    删除
                  </button>}
                </motion.li>
              ))}
            </ul>
          )}
        </div>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {deleteTarget ? (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-[#18232D]/35 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => !deleting && setDeleteTarget(null)}>
            <motion.section role="dialog" aria-modal="true" aria-labelledby="feedback-delete-title" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.2)]">
              <div className="flex items-start gap-3 border-b border-[#E2DDD3] bg-[#FCF7F4] px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"><Trash2 className="size-4" /></span>
                <div className="min-w-0 flex-1"><h2 id="feedback-delete-title" className="text-sm font-bold text-[#18232D]">删除这条反馈？</h2><p className="mt-1 text-[11px] leading-5 text-[#66717B]">评价、评论及已有回复将一并移除，此操作无法撤销。</p></div>
                <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} aria-label="关闭删除确认" className="grid size-8 shrink-0 place-items-center rounded-xl text-[#7A817F] hover:bg-[#F1EDE4] disabled:opacity-40"><X className="size-4" /></button>
              </div>
              <div className="px-5 py-4"><div className="rounded-xl border border-[#D7D1C4] bg-[#FBF8F0] px-3 py-2.5"><span className="block text-[10px] font-bold text-[#9A4E35]">反馈 #{deleteTarget.id}</span><p className="mt-1 line-clamp-3 text-xs leading-5 text-[#4E5B63]">{deleteTarget.comment || "（无文字评论）"}</p></div></div>
              <div className="flex justify-end gap-2 border-t border-[#E2DDD3] bg-[#F8F6F0] px-5 py-3.5"><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="border-[#D7D1C4] bg-[#FFFEFA]">保留反馈</Button><Button onClick={() => void removeOne(deleteTarget.id)} disabled={deleting} className="bg-[#9A4E35] text-white hover:bg-[#7F3F2D]">{deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{deleting ? "删除中" : "确认删除"}</Button></div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ChartLoading() {
  return <div role="status" aria-live="polite" className="grid h-72 place-items-center rounded-2xl bg-[#FBF8F0]"><div className="text-center"><BarChart3 className="mx-auto size-5 animate-pulse text-[#315E83]" /><strong className="mt-2 block text-xs text-[#243746]">正在绘制行为分布</strong><p className="mt-1 text-[10px] text-[#7A817F]">统计图表仅在管理视图中加载</p></div></div>
}

function FeedbackListLoading() {
  return <div role="status" aria-label="正在加载反馈" className="space-y-3 p-4">{[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse gap-3"><span className="size-8 shrink-0 rounded-full bg-[#EEE9DF]" /><div className="flex-1"><div className="h-3 w-1/3 rounded-full bg-[#E8E3D9]" /><div className="mt-2 h-3 w-4/5 rounded-full bg-[#F1EDE4]" /></div></div>)}</div>
}

const TONE: Record<string, { bg: string; text: string; iconBg: string }> = {
  indigo: { bg: "bg-[#E7EDF3] border-[#C7D2D8]", text: "text-[#315E83]", iconBg: "bg-[#FFFEFA] text-[#315E83]" },
  emerald: { bg: "bg-[#E9EEE6] border-[#C9D1CB]", text: "text-[#557052]", iconBg: "bg-[#FFFEFA] text-[#557052]" },
  amber: { bg: "bg-[#F4ECD8] border-[#DDD4BF]", text: "text-[#8E6925]", iconBg: "bg-[#FFFEFA] text-[#8E6925]" },
  rose: { bg: "bg-[#F4E8E2] border-[#DFC8BE]", text: "text-[#9A4E35]", iconBg: "bg-[#FFFEFA] text-[#9A4E35]" },
}

function StatCard({
  icon: Icon, label, value, sub, tone, onClick,
}: {
  icon: typeof Activity
  label: string
  value: number | string
  sub?: string
  tone: keyof typeof TONE
  onClick?: () => void
}) {
  const t = TONE[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          onClick()
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`paper-lift rounded-[18px] border p-4 ${t.bg} ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315E83]" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center justify-center size-7 rounded-lg ${t.iconBg}`}>
          <Icon className="size-4" />
        </span>
        <span className={`text-xs ${t.text}`}>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sub}</div>}
    </motion.div>
  )
}

function RatingBadge({ rating }: { rating: number }) {
  if (rating >= 1) {
    return (
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E9EEE6] text-[#557052]">
        <ThumbsUp className="size-4" />
      </span>
    )
  }
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F4E8E2] text-[#9A4E35]">
      <ThumbsDown className="size-4" />
    </span>
  )
}
