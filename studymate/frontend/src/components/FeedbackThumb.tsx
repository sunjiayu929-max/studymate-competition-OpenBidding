/**
 * 资源 👍/👎 反馈组件（挑战杯硬指标：用户反馈采集入口）。
 *
 * 用法：
 *   <FeedbackThumb targetType="resource" targetId={`${agentKey}:${topic}`} />
 *
 * 行为：
 * - 挂载时拉 /api/feedback?target_id=... 取当前用户的已有反馈，渲染选中态
 * - 点击 👍/👎 切换：调 POST /api/feedback（upsert）
 * - 第一次点击 / 点击后再次点 → 弹一个内联评论框，可选填评论后保存
 * - 已提交后显示 "已反馈 ✓"
 */
import { useEffect, useState } from "react"
import { ThumbsUp, ThumbsDown, MessageSquare, Check, Loader2, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { apiGet, apiPost } from "@/lib/api"
import { useCurrentUser } from "@/store/user"

type Rating = 1 | -1 | 0  // 0 = 未反馈

interface FeedbackItem {
  id: number
  user_id: number
  target_type: string
  target_id: string
  rating: number
  comment: string
  created_at: string | null
}

interface ListResp {
  count: number
  items: FeedbackItem[]
}

export function FeedbackThumb({
  targetType, targetId, compact = false,
}: {
  targetType: string
  targetId: string
  /** 紧凑模式：藏到只剩两个图标按钮 */
  compact?: boolean
}) {
  const user = useCurrentUser()
  const userId = user?.user_id ?? 0
  const [rating, setRating] = useState<Rating>(0)
  const [comment, setComment] = useState("")
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 拉已有反馈
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      try {
        const r = await apiGet<ListResp>(
          `/feedback?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}&limit=1`,
        )
        if (cancelled) return
        const f = r.items[0]
        if (f) {
          setRating(f.rating === 1 ? 1 : f.rating === -1 ? -1 : 0)
          setComment(f.comment || "")
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [targetType, targetId, userId])

  const submit = async (nextRating: Rating, nextComment?: string) => {
    if (nextRating === 0 || !userId) return
    setSaving(true)
    try {
      await apiPost(`/feedback`, {
        target_type: targetType,
        target_id: targetId,
        rating: nextRating,
        comment: nextComment ?? comment,
      })
      setRating(nextRating)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      console.error("feedback submit failed", e)
    } finally {
      setSaving(false)
    }
  }

  const onThumb = (v: Rating) => {
    // 同向再点：保持选中并展开评论框（让用户能补一句话）
    void submit(v)
    setShowCommentBox(true)
  }

  return (
    <div className="inline-flex max-w-full flex-col items-end gap-1.5">
      <div className="inline-flex items-center gap-1">
        {!compact && (
          <span className="text-xs text-[var(--muted-foreground)] mr-1">这份回答对你有帮助吗？</span>
        )}
        <ThumbButton
          active={rating === 1}
          icon={ThumbsUp}
          onClick={() => onThumb(1)}
          disabled={!loaded || saving}
          color="emerald"
        />
        <ThumbButton
          active={rating === -1}
          icon={ThumbsDown}
          onClick={() => onThumb(-1)}
          disabled={!loaded || saving}
          color="rose"
        />
        {rating !== 0 && !showCommentBox && (
          <button
            type="button"
            onClick={() => setShowCommentBox(true)}
            title="加点评论"
            aria-label="补充评价说明"
            className="ml-1 grid size-8 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <MessageSquare className="size-3.5" />
          </button>
        )}
        <AnimatePresence>
          {savedFlash && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#557052]"
            >
              <Check className="size-3" /> 已记录
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCommentBox && rating !== 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex w-72 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-[var(--shadow-sm)]"
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={rating === 1 ? "好在哪？(可选)" : "什么地方需要改进？(可选)"}
              maxLength={300}
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--border)] bg-[#FAF7F0] p-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/25"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => { void submit(rating, comment); setShowCommentBox(false) }}
                disabled={saving}
                className="grid size-8 place-items-center rounded-lg bg-[#557052] text-white transition-colors hover:bg-[#465F44] disabled:opacity-50"
                title="保存评论"
                aria-label="保存评价说明"
              >
                {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => setShowCommentBox(false)}
                className="grid size-8 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                title="收起"
                aria-label="收起评价输入框"
              >
                <X className="size-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ThumbButton({
  active, icon: Icon, onClick, disabled, color,
}: {
  active: boolean
  icon: typeof ThumbsUp
  onClick: () => void
  disabled: boolean
  color: "emerald" | "rose"
}) {
  const activeCls = color === "emerald"
    ? "bg-[#E9EEE6] text-[#557052] ring-1 ring-[#C9D1CB]"
    : "bg-[#F6ECE7] text-[#A65339] ring-1 ring-[#DFC9BE]"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={color === "emerald" ? "这份回答有帮助" : "这份回答需要改进"}
      aria-pressed={active}
      className={`grid size-8 place-items-center rounded-lg transition-all ${
        active
          ? activeCls
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
