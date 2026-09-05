import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  LayoutPanelTop,
  Library,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { Button } from "@/components/ui/button"
import { apiDelete, apiGet, apiPost } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { isPrivilegedRole, useCurrentUser } from "@/store/user"
import "./FeedbackCenter.css"

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

interface FeedbackReply {
  id: number
  content: string
  author_id: number
  author_name: string
  author_role: "admin"
  created_at: string | null
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
  _action?: "created" | "updated"
}

const FEEDBACK_TYPES: { value: string; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "page", label: "页面体验", hint: "布局与操作", icon: LayoutPanelTop },
  { value: "resource", label: "资料内容", hint: "质量与实用性", icon: BookOpenText },
  { value: "quiz", label: "测评题目", hint: "难度与解析", icon: ClipboardCheck },
  { value: "topic", label: "训练流程", hint: "步骤与验收", icon: Workflow },
  { value: "course", label: "知识库内容", hint: "覆盖与准确性", icon: Library },
]

const TARGET_LABEL: Record<string, string> = {
  page: "页面体验",
  resource: "学习资源",
  quiz: "测验内容",
  topic: "训练任务",
  course: "岗位知识库",
  bilibili_video: "视频资源",
  bilibili_search: "视频搜索",
}

const ACTION_LABEL: Record<string, string> = {
  page_enter: "进入页面",
  page_leave: "完成页面浏览",
  workspace_start: "启动岗位训练",
  workspace_stop: "结束岗位训练",
  quiz_answer: "提交测验答案",
  external_resource_open: "打开外部资源",
}

const formatTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  : ""

const hasReply = (item: FeedbackItem) => (item.replies?.length ?? 0) > 0

export function FeedbackCenter() {
  useTrackPage("feedback")
  const user = useCurrentUser()
  const canReview = isPrivilegedRole(user?.role)
  const canManage = user?.role === "admin"
  const [eventStats, setEventStats] = useState<EventStats | null>(null)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [replyErrors, setReplyErrors] = useState<Record<number, string>>({})
  const [replyingId, setReplyingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FeedbackItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [draftType, setDraftType] = useState("page")
  const [draftTarget, setDraftTarget] = useState("反馈中心")
  const [draftRating, setDraftRating] = useState<1 | -1>(1)
  const [draftComment, setDraftComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [justSubmittedId, setJustSubmittedId] = useState<number | null>(null)
  const latestCardRef = useRef<HTMLElement | null>(null)
  const refreshButtonRef = useRef<HTMLButtonElement | null>(null)
  const deleteDialogRef = useRef<HTMLElement | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setEvidenceError(null)
    try {
      const list = await apiGet<{ count: number; items: FeedbackItem[] }>("/feedback?limit=50")
      setFeedback(list.items)
      if (canReview) {
        try {
          const [events, stats] = await Promise.all([
            apiGet<EventStats>("/events/stats?hours=24"),
            apiGet<FeedbackStats>("/feedback/stats"),
          ])
          setEventStats(events)
          setFeedbackStats(stats)
        } catch (error) {
          setEventStats(null)
          setFeedbackStats(null)
          setEvidenceError(String(error))
        }
      } else {
        setEventStats(null)
        setFeedbackStats(null)
      }
    } catch (error) {
      setLoadError(String(error))
    } finally {
      setLoading(false)
    }
  }, [canReview])

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load())
    return () => cancelAnimationFrame(frame)
  }, [load])

  useEffect(() => {
    if (!deleteTarget) return
    const frame = requestAnimationFrame(() => deleteCancelRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        event.preventDefault()
        setDeleteTarget(null)
        requestAnimationFrame(() => deleteTriggerRef.current?.focus())
        return
      }
      if (event.key !== "Tab") return
      const controls = deleteDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener("keydown", onKeyDown)
    }
  }, [deleteTarget, deleting])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(""), 4200)
  }

  const closeDeleteDialog = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError(null)
    requestAnimationFrame(() => deleteTriggerRef.current?.focus())
  }

  const openDeleteDialog = (item: FeedbackItem, trigger: HTMLButtonElement) => {
    deleteTriggerRef.current = trigger
    setDeleteError(null)
    setDeleteTarget(item)
  }

  const removeOne = async (id: number) => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiDelete(`/feedback/${id}`)
      setDeleteTarget(null)
      setFeedback((items) => items.filter((item) => item.id !== id))
      flash("反馈已删除")
      await load()
      requestAnimationFrame(() => refreshButtonRef.current?.focus())
    } catch (error) {
      setDeleteError(String(error))
    } finally {
      setDeleting(false)
    }
  }

  const sendReply = async (id: number) => {
    const content = (replyDrafts[id] || "").trim()
    if (!content) return
    setReplyingId(id)
    setReplyErrors((errors) => ({ ...errors, [id]: "" }))
    try {
      await apiPost(`/feedback/${id}/replies`, { content })
      setReplyDrafts((drafts) => ({ ...drafts, [id]: "" }))
      await load()
      flash("处理结果已回传")
    } catch (error) {
      setReplyErrors((errors) => ({ ...errors, [id]: String(error) }))
    } finally {
      setReplyingId(null)
    }
  }

  const submitFeedback = async () => {
    const targetId = draftTarget.trim()
    const comment = draftComment.trim()
    if (!targetId || !comment) return
    setSubmitting(true)
    setComposeError(null)
    try {
      const saved = await apiPost<FeedbackItem>("/feedback", {
        target_type: draftType,
        target_id: targetId,
        rating: draftRating,
        comment,
      })
      setFeedback((items) => [saved, ...items.filter((item) => item.id !== saved.id)])
      setJustSubmittedId(saved.id)
      setDraftComment("")
      flash(saved._action === "updated" ? "反馈已更新，可继续查看处理进度" : "反馈已提交，可继续查看处理进度")
      await load()
    } catch (error) {
      setComposeError(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const resetSubmittedState = () => {
    setJustSubmittedId(null)
    setNotice("")
    setComposeError(null)
  }

  const chartData = useMemo(
    () => (eventStats?.by_action ?? [])
      .filter((item) => item.count > 0)
      .slice(0, 6)
      .map((item) => ({ name: ACTION_LABEL[item.action] ?? item.action, count: item.count })),
    [eventStats],
  )

  const featuredFeedback = justSubmittedId == null
    ? feedback[0]
    : feedback.find((item) => item.id === justSubmittedId) ?? feedback[0]
  const repliedCount = feedback.filter(hasReply).length
  const pendingCount = Math.max(0, feedback.length - repliedCount)
  const commentRate = feedbackStats?.total
    ? Math.round((feedbackStats.with_comment / feedbackStats.total) * 100)
    : null
  const satisfaction = feedbackStats?.satisfaction == null
    ? null
    : Math.round(feedbackStats.satisfaction * 100)

  return (
    <div className="feedback-center app-page">
      <div className="feedback-center-shell">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="feedback" appearance="paper" />
        <main className="feedback-center-main">
          <header className="feedback-center-intro">
            <div>
              <span>反馈中心</span>
              <h1>说出真实体验，查看处理回复</h1>
              <p>选择对象并写下具体意见；提交后，你可以在这里持续查看管理员回复。</p>
            </div>
            <span className={`feedback-center-sync ${loadError ? "is-error" : ""}`}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : loadError ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              {loading ? "正在加载" : loadError ? "加载失败" : "数据已更新"}
            </span>
          </header>

          <section className="feedback-center-primary-grid" aria-label="提交反馈并查看最新状态">
            <ComposeArea
              draftType={draftType}
              draftTarget={draftTarget}
              draftRating={draftRating}
              draftComment={draftComment}
              submitting={submitting}
              justSubmitted={justSubmittedId != null}
              error={composeError}
              notice={notice}
              setDraftType={(value) => { resetSubmittedState(); setDraftType(value) }}
              setDraftTarget={(value) => { resetSubmittedState(); setDraftTarget(value) }}
              setDraftRating={(value) => { resetSubmittedState(); setDraftRating(value) }}
              setDraftComment={(value) => { resetSubmittedState(); setDraftComment(value) }}
              onPrimaryAction={() => justSubmittedId == null
                ? void submitFeedback()
                : latestCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            />
            <LatestFeedbackCard ref={latestCardRef} item={featuredFeedback} loading={loading} canReview={canReview} />
          </section>

          {canReview && (
            <section className="feedback-center-evidence" aria-labelledby="feedback-evidence-title">
              <SectionHeading
                icon={BarChart3}
                eyebrow="真实数据"
                title="用户反馈与近 24 小时使用情况"
                description="以下数据直接来自现有反馈与行为统计接口。"
                id="feedback-evidence-title"
              />
              {evidenceError && <InlineAlert message={evidenceError} onClose={() => setEvidenceError(null)} />}
              <div className="feedback-center-metrics">
                <Stat icon={MessageSquare} label="反馈总数" value={feedbackStats ? feedbackStats.total.toLocaleString("zh-CN") : "—"} detail="全部真实反馈" />
                <Stat icon={ThumbsUp} label="正向率" value={satisfaction == null ? "暂无" : `${satisfaction}%`} detail={feedbackStats ? `${feedbackStats.up} 条正向 · ${feedbackStats.down} 条改进` : "暂无反馈数据"} />
                <Stat icon={FileText} label="具体说明" value={commentRate == null ? "暂无" : `${commentRate}%`} detail={feedbackStats ? `${feedbackStats.with_comment} 条含文字说明` : "暂无反馈数据"} />
                <Stat icon={Users} label="近 24 小时活跃" value={eventStats ? eventStats.unique_users.toLocaleString("zh-CN") : "—"} detail={eventStats ? `${eventStats.window_total.toLocaleString("zh-CN")} 次行为` : "暂无行为数据"} />
              </div>
              <div className="feedback-center-chart-card">
                <div>
                  <span><BarChart3 className="size-4" />高频行为</span>
                  <small>{eventStats ? `近 ${eventStats.window_hours} 小时` : "等待数据"}</small>
                </div>
                {loading && !eventStats
                  ? <ChartLoading />
                  : <Suspense fallback={<ChartLoading />}><FeedbackActivityChart data={chartData} /></Suspense>}
              </div>
            </section>
          )}

          <section className="feedback-center-history" aria-labelledby="feedback-history-title">
            <div className="feedback-center-history-head">
              <SectionHeading
                icon={canManage ? ShieldCheck : Inbox}
                eyebrow={canManage ? "管理员处理" : canReview ? "只读反馈记录" : "处理进度"}
                title={canManage ? "反馈处理与结果回传" : canReview ? "真实反馈记录" : "我的反馈与回复"}
                description={canManage ? "回复会作为正式处理结果展示给提交者。" : canReview ? "评委可查看真实反馈与管理员回复，不提供处理操作。" : "状态仅表示当前记录是否收到管理员回复。"}
                id="feedback-history-title"
              />
              <Button ref={refreshButtonRef} variant="outline" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                刷新
              </Button>
            </div>
            {loadError && <InlineAlert message={loadError} onClose={() => setLoadError(null)} />}
            <div className="feedback-center-status-summary" aria-label="当前已加载反馈状态">
              <span><small>当前已加载</small><strong>{feedback.length}</strong></span>
              <span><small>待回复</small><strong>{pendingCount}</strong></span>
              <span><small>已回复</small><strong>{repliedCount}</strong></span>
            </div>
            {loading && !feedback.length
              ? <FeedbackListLoading />
              : !feedback.length
                ? <div className="feedback-center-empty"><MessageSquare className="size-6" /><b>还没有反馈记录</b><p>完成上方表单后，处理状态会显示在这里。</p></div>
                : <ul className="feedback-center-list">{feedback.map((item) => (
                  <FeedbackRow
                    key={item.id}
                    item={item}
                    canReview={canReview}
                    canManage={canManage}
                    reply={replyDrafts[item.id] || ""}
                    replyError={replyErrors[item.id] || ""}
                    replying={replyingId === item.id}
                    onReplyChange={(value) => setReplyDrafts((drafts) => ({ ...drafts, [item.id]: value }))}
                    onReply={() => void sendReply(item.id)}
                    onDelete={(trigger) => openDeleteDialog(item, trigger)}
                  />
                ))}</ul>}
          </section>
        </main>
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div className="feedback-center-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={closeDeleteDialog}>
            <motion.section
              ref={deleteDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-delete-title"
              aria-describedby="feedback-delete-description"
              onMouseDown={(event) => event.stopPropagation()}
              initial={{ y: 12, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
            >
              <div className="feedback-center-modal-title">
                <Trash2 className="size-5" />
                <span><b id="feedback-delete-title">删除这条反馈？</b><small id="feedback-delete-description">评价、评论与回复将一并移除，此操作无法撤销。</small></span>
              </div>
              <p>{deleteTarget.comment || "（无文字评论）"}</p>
              {deleteError && <div role="alert" className="feedback-center-modal-error"><AlertTriangle className="size-4" />{deleteError}</div>}
              <footer>
                <Button ref={deleteCancelRef} variant="outline" onClick={closeDeleteDialog}>保留反馈</Button>
                <Button onClick={() => void removeOne(deleteTarget.id)} disabled={deleting}>
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  确认删除
                </Button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ComposeArea({
  draftType,
  draftTarget,
  draftRating,
  draftComment,
  submitting,
  justSubmitted,
  error,
  notice,
  setDraftType,
  setDraftTarget,
  setDraftRating,
  setDraftComment,
  onPrimaryAction,
}: {
  draftType: string
  draftTarget: string
  draftRating: 1 | -1
  draftComment: string
  submitting: boolean
  justSubmitted: boolean
  error: string | null
  notice: string
  setDraftType: (value: string) => void
  setDraftTarget: (value: string) => void
  setDraftRating: (value: 1 | -1) => void
  setDraftComment: (value: string) => void
  onPrimaryAction: () => void
}) {
  const ready = Boolean(draftTarget.trim() && draftComment.trim())
  const buttonLabel = submitting
    ? "正在提交"
    : justSubmitted
      ? "查看处理进度"
      : ready
        ? "提交并跟踪"
        : "填写意见后提交"

  return (
    <div className="feedback-center-compose">
      <div className="feedback-center-card-head">
        <span><MessageSquare className="size-4" />提交反馈</span>
        <small>具体描述有助于更快处理</small>
      </div>
      <div className="feedback-center-types" aria-label="反馈类型">
        {FEEDBACK_TYPES.map(({ value, label, hint, icon: Icon }) => (
          <button type="button" key={value} className={draftType === value ? "is-active" : ""} onClick={() => setDraftType(value)} aria-pressed={draftType === value}>
            <Icon className="size-4" />
            <span><b>{label}</b><small>{hint}</small></span>
          </button>
        ))}
      </div>
      <div className="feedback-center-fields">
        <label>
          <span>具体对象 <small>{draftTarget.length}/64</small></span>
          <input value={draftTarget} maxLength={64} onChange={(event) => setDraftTarget(event.target.value)} placeholder="例如：岗位训练中心" />
        </label>
        <label>
          <span>你的意见 <small>{draftComment.length}/300</small></span>
          <textarea value={draftComment} maxLength={300} rows={3} onChange={(event) => setDraftComment(event.target.value)} placeholder="遇到了什么？你期待怎样改进？也欢迎告诉我们值得保留的地方。" />
        </label>
      </div>
      <div className="feedback-center-compose-footer">
        <div className="feedback-center-sentiment" aria-label="反馈倾向">
          <button type="button" className={draftRating === 1 ? "is-active" : ""} onClick={() => setDraftRating(1)} aria-pressed={draftRating === 1}>
            <ThumbsUp className="size-4" />值得保留
          </button>
          <button type="button" className={draftRating === -1 ? "is-negative" : ""} onClick={() => setDraftRating(-1)} aria-pressed={draftRating === -1}>
            <ThumbsDown className="size-4" />需要改进
          </button>
        </div>
        <Button className="feedback-center-submit" onClick={onPrimaryAction} disabled={submitting || (!justSubmitted && !ready)}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : justSubmitted ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
          {buttonLabel}
          {!submitting && <ArrowRight className="size-4" />}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {error && <motion.div role="alert" className="feedback-center-compose-message is-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><AlertTriangle className="size-4" />{error}</motion.div>}
        {!error && notice && <motion.div role="status" className="feedback-center-compose-message is-success" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CheckCircle2 className="size-4" />{notice}</motion.div>}
      </AnimatePresence>
    </div>
  )
}

const LatestFeedbackCard = forwardRef<HTMLElement, { item?: FeedbackItem; loading: boolean; canReview: boolean }>(
  function LatestFeedbackCard({ item, loading, canReview }, ref) {
    const latestReply = item?.replies?.[(item.replies?.length ?? 0) - 1]
    const replied = item ? hasReply(item) : false
    return (
      <aside ref={ref} className="feedback-center-latest" aria-labelledby="feedback-latest-title">
        <div className="feedback-center-card-head">
          <span><Inbox className="size-4" /><b id="feedback-latest-title">{canReview ? "最新反馈" : "最新处理状态"}</b></span>
          {item && <em className={replied ? "is-replied" : ""}>{replied ? "已回复" : "待回复"}</em>}
        </div>
        {loading && !item
          ? <div className="feedback-center-latest-loading"><span /><span /><span /></div>
          : !item
            ? <div className="feedback-center-latest-empty"><MessageSquare className="size-6" /><b>还没有反馈记录</b><p>提交后，这里会显示是否收到回复。</p></div>
            : <div className="feedback-center-latest-content">
              <div className="feedback-center-latest-meta">
                <span>{TARGET_LABEL[item.target_type] || "反馈对象"}</span>
                <small>{canReview ? `${item.user_name} · ` : ""}{formatTime(item.created_at)}</small>
              </div>
              <h2>{item.target_id}</h2>
              <p>{item.comment || "（无文字评论）"}</p>
              {latestReply
                ? <div className="feedback-center-latest-reply"><ShieldCheck className="size-4" /><span><b>{latestReply.author_name}的回复</b><p>{latestReply.content}</p></span></div>
                : <div className="feedback-center-waiting"><RefreshCw className="size-4" /><span><b>等待管理员回复</b><small>你可以稍后刷新查看最新状态。</small></span></div>}
            </div>}
      </aside>
    )
  },
)

function SectionHeading({ icon: Icon, eyebrow, title, description, id }: { icon: LucideIcon; eyebrow: string; title: string; description: string; id: string }) {
  return <div className="feedback-center-section-heading"><span><Icon className="size-5" /></span><div><small>{eyebrow}</small><h2 id={id}>{title}</h2><p>{description}</p></div></div>
}

function Stat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className="feedback-center-stat"><Icon className="size-4" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function InlineAlert({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="alert" className="feedback-center-alert"><AlertTriangle className="size-4" /><span>{message}</span><button type="button" onClick={onClose} aria-label="关闭错误提示"><X className="size-4" /></button></div>
}

function FeedbackRow({
  item,
  canReview,
  canManage,
  reply,
  replyError,
  replying,
  onReplyChange,
  onReply,
  onDelete,
}: {
  item: FeedbackItem
  canReview: boolean
  canManage: boolean
  reply: string
  replyError: string
  replying: boolean
  onReplyChange: (value: string) => void
  onReply: () => void
  onDelete: (trigger: HTMLButtonElement) => void
}) {
  const replied = hasReply(item)
  return (
    <motion.li initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <div className={`feedback-center-rating ${item.rating < 1 ? "is-negative" : ""}`}>
        {item.rating >= 1 ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
      </div>
      <div className="feedback-center-item-body">
        <div className="feedback-center-item-meta">
          <span>{TARGET_LABEL[item.target_type] || "反馈对象"}</span>
          <b>{item.target_id}</b>
          <small>{canReview ? `${item.user_name} · #${item.user_id}` : "我"} · {formatTime(item.created_at)}</small>
          <em className={replied ? "is-replied" : ""}>{replied ? "已回复" : "待回复"}</em>
        </div>
        <p>{item.comment || "（无文字评论）"}</p>
        {item.replies?.map((replyItem) => (
          <div className="feedback-center-reply" key={replyItem.id}>
            <ShieldCheck className="size-4" />
            <span><b>{replyItem.author_name} · 正式回复</b><p>{replyItem.content}</p><small>{formatTime(replyItem.created_at)}</small></span>
          </div>
        ))}
        {canManage && item.id > 0 && (
          <div className="feedback-center-reply-area">
            <div className="feedback-center-reply-box">
              <textarea value={reply} onChange={(event) => onReplyChange(event.target.value)} rows={2} maxLength={2000} placeholder="填写正式处理结果…" aria-label={`回复反馈 ${item.id}`} />
              <Button variant="outline" onClick={onReply} disabled={replying || !reply.trim()}>
                {replying ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                回传结果
              </Button>
            </div>
            {replyError && <div role="alert" className="feedback-center-row-error"><AlertTriangle className="size-4" />{replyError}</div>}
          </div>
        )}
      </div>
      {item.id > 0 && (canManage || !canReview) && (
        <button type="button" className="feedback-center-delete" onClick={(event) => onDelete(event.currentTarget)} aria-label={`删除反馈 ${item.id}`}>
          <Trash2 className="size-4" />
        </button>
      )}
    </motion.li>
  )
}

function ChartLoading() {
  return <div className="feedback-center-chart-loading"><BarChart3 className="size-5" />正在读取行为数据</div>
}

function FeedbackListLoading() {
  return <div className="feedback-center-list-loading">{[0, 1, 2].map((index) => <span key={index}><i /><b /></span>)}</div>
}
