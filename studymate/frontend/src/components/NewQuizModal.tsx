/**
 * 新建题库测验弹窗：
 * - 主题（默认综合复习，可填或从 course sample_topics 一键填充）
 * - 题数：mcq / fill / code 三个数字
 * - 难度：1-4 滑块
 * - 答题模式：试卷 / 闯关 二选一（分段控件）
 * - code 评分：LLM / 自评 二选一
 * - 「开始」→ POST /quiz-sessions → 跳 /quiz/{id}
 */
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { X, Loader2, Sparkles, BookOpen, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrentCourse, useCourseConfig, fallbackSamplesFor, DEFAULT_SAMPLE_TOPICS } from "@/store/course"
import { createQuizSession, getQuizRecommendation, type QuizMode, type CodeGrading, type QuizRecommendation, type QuizSession } from "@/lib/quizSession"
import { useCurrentUser } from "@/store/user"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (s: QuizSession) => void
  /** 从资源详情或笔记页带入的学习主题。 */
  initialTopic?: string
}

export function NewQuizModal({ open, onClose, onCreated, initialTopic = "" }: Props) {
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseCfg = useCourseConfig()
  const sampleTopics =
    courseCfg?.sample_topics?.length
      ? courseCfg.sample_topics
      : course
        ? fallbackSamplesFor(course.name).topics
        : DEFAULT_SAMPLE_TOPICS

  const [topic, setTopic] = useState("综合复习")
  const [mcq, setMcq] = useState(8)
  const [fill, setFill] = useState(4)
  const [code, setCode] = useState(3)
  const [difficulty, setDifficulty] = useState(2)
  const [mode, setMode] = useState<QuizMode>("exam")
  const [codeGrading, setCodeGrading] = useState<CodeGrading>("llm")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState<QuizRecommendation | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      setTopic(initialTopic.trim() || "综合复习")
      setError(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, initialTopic])

  useEffect(() => {
    if (!open || !USER_ID || !course) {
      setRecommendation(null)
      return
    }
    let active = true
    getQuizRecommendation({ user_id: USER_ID, course_id: course.id })
      .then((value) => { if (active) setRecommendation(value) })
      .catch(() => { if (active) setRecommendation(null) })
    return () => { active = false }
  }, [USER_ID, course, open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [open, submitting, onClose])

  const total = mcq + fill + code

  const handleStart = async () => {
    if (!course) {
      setError("请先选择课程，再创建测验")
      return
    }
    if (total <= 0) {
      setError("至少需要 1 道题")
      return
    }
    if (total > 50) {
      setError("单次测验最多 50 道题")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const s = await createQuizSession({
        user_id: USER_ID,
        course_id: course?.id ?? null,
        topic: topic.trim() || "综合复习",
        mcq_count: mcq,
        fill_count: fill,
        code_count: code,
        difficulty,
        mode,
        code_grading: codeGrading,
      })
      onCreated(s)
    } catch (e) {
      setError(`出题失败：${String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18232D]/35 p-3 backdrop-blur-[2px] sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-quiz-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className="flex max-h-[min(92dvh,780px)] w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.18)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-full border border-[#DDD4BF] bg-[#F4ECD8] text-[#8E6925]">
              <BookOpen className="size-4" />
            </div>
            <div className="min-w-0">
              <div id="new-quiz-title" className="text-sm font-bold text-[#18232D]">新建智能测验</div>
              <div className="truncate text-[11px] text-[#6F787A]">
                {course?.name || "未选课程"} · 提交后入库可查回顾
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#66717B] hover:bg-[#F1EDE4]"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          {/* 主题 */}
          <Field label="测验主题">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="综合复习 / 梯度下降 / ..."
              className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] px-3 text-sm focus:border-[#315E83] focus:outline-none focus:ring-2 focus:ring-[#315E83]/10"
              disabled={submitting}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sampleTopics.slice(0, 6).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={submitting}
                  onClick={() => setTopic(t)}
                  className="inline-flex min-h-8 items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-2.5 py-1 text-[11px] font-medium text-[#66717B] transition-colors hover:border-[#9EAFAF] hover:bg-[#E7EDF3] hover:text-[#315E83]"
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-xl border border-[#C9D1CB] bg-[#F5F8F3] px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#E9EEE6] text-[#557052]"><Target className="size-3.5" /></span>
              <div className="min-w-0">
                <strong className="block text-[11px] text-[#3F5840]">错题类型自适应</strong>
                <p className="mt-0.5 text-[10px] leading-4 text-[#66736A]">{recommendation?.message || "正在读取近期错题，完成后会自动安排同类型变式练习"}</p>
                {!!recommendation?.focus.length && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {recommendation.focus.map((item) => <span key={item.tag} className="rounded-full border border-[#C9D1CB] bg-[#FFFEFA] px-2 py-0.5 text-[9px] font-bold text-[#557052]">{item.tag} · {item.count}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 题数 */}
          <Field label={`题目数量（合计 ${total}）`}>
            <div className="grid grid-cols-3 gap-2">
              <NumberCell label="选择题" value={mcq} onChange={setMcq} max={20} disabled={submitting} />
              <NumberCell label="填空题" value={fill} onChange={setFill} max={20} disabled={submitting} />
              <NumberCell label="编程题" value={code} onChange={setCode} max={10} disabled={submitting} />
            </div>
          </Field>

          {/* 难度 */}
          <Field label={`难度 · ${["", "入门", "基础", "进阶", "挑战"][difficulty]}`}>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={difficulty}
              onChange={(e) => setDifficulty(parseInt(e.target.value))}
              disabled={submitting}
              className="w-full accent-[#315E83]"
              aria-label="测验难度"
            />
            <div className="grid grid-cols-4 gap-0 text-[10px] text-[var(--muted-foreground)] mt-0.5">
              <span className="text-left">1 入门</span>
              <span className="text-center">2 基础</span>
              <span className="text-center">3 进阶</span>
              <span className="text-right">4 挑战</span>
            </div>
          </Field>

          {/* 答题模式 */}
          <Field label="答题模式">
            <Segmented
              value={mode}
              options={[
                { value: "exam", label: "试卷模式", desc: "一次出全部 · 自由滑动 · 一键提交" },
                { value: "quest", label: "闯关模式", desc: "一题一屏 · 顺序作答" },
              ]}
              onChange={(v) => setMode(v as QuizMode)}
              disabled={submitting}
            />
          </Field>

          {/* code 评分 */}
          {code > 0 && (
            <Field label="编程题评分方式">
              <Segmented
                value={codeGrading}
                options={[
                  { value: "llm", label: "智能严格判分", desc: "结合答案要点与代码逻辑综合评分" },
                  { value: "self", label: "用户自评", desc: "查看解析后自行确认对错，立即完成" },
                ]}
                onChange={(v) => setCodeGrading(v as CodeGrading)}
                disabled={submitting}
              />
            </Field>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2 text-xs text-[#9A4E35]">
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-[#D7D1C4] bg-[#F8F6F0] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-[#6F787A]">
            结合当前岗位与学习画像生成
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button size="sm" onClick={handleStart} disabled={submitting || total === 0 || !course}>
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> 出题中...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" /> 开始测验
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function NumberCell({
  label,
  value,
  onChange,
  max,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  max: number
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] px-2.5 py-2">
      <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="size-8 rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] text-sm transition-colors hover:bg-[#E7EDF3] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`减少${label}`}
        >
          −
        </button>
        <div className="text-base font-semibold tabular-nums">{value}</div>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="size-8 rounded-lg border border-[#D7D1C4] bg-[#FFFEFA] text-sm transition-colors hover:bg-[#E7EDF3] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`增加${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

function Segmented({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string
  options: { value: string; label: string; desc: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`rounded-xl border px-3 py-2 text-left transition-colors ${
              active
                ? "border-[#7F9AAA] bg-[#E7EDF3] text-[#315E83] shadow-[inset_0_0_0_1px_rgba(49,94,131,.08)]"
                : "border-[#D7D1C4] bg-[#FFFEFA] hover:bg-[#F1EDE4]"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="text-xs font-medium">{opt.label}</div>
            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{opt.desc}</div>
          </button>
        )
      })}
    </div>
  )
}
