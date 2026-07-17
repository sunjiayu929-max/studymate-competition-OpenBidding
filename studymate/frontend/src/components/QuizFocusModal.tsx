/**
 * LeetCode 风格的全屏专注答题 modal。
 *
 * 左栏:题面 / 选项展示 / 提示 / 解析(提交后)
 * 右栏:作答区(code 题 → Monaco 编辑器 + CodeRunner;mcq/fill → 选项/输入框)
 * 顶部:题号 N/M + 难度 chip + 上下题 + 关闭
 * 底部:重置(code 题) + 提交 + 下一题
 *
 * 设计原则:
 * - 不替换原 QuizCard,共用提交回调
 * - 支持键盘:Esc 关闭、← → 切题
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ListChecks,
  Code as CodeIcon,
  Pencil,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { CodeEditor } from "@/components/CodeEditor"
import { CodeRunner, type RunLang } from "@/components/CodeRunner"
import { Markdown } from "@/components/Markdown"
import type { QuizItem, QuizResult } from "@/components/QuizCard"

interface QuizFocusModalProps {
  open: boolean
  items: QuizItem[]
  startIndex?: number
  topic?: string
  defaultLanguage?: RunLang
  onClose: () => void
  /** 每次答题提交回调,用于上层同步统计 */
  onSubmit?: (result: QuizResult & { topic: string }) => void
}

interface Attempt {
  answered: boolean
  userAnswer: string | number
  isCorrect: boolean | null   // code 题为 null(自评)
}

type AttemptMap = Record<string, Attempt>

const DIFFICULTY_LABEL = ["", "入门", "基础", "进阶", "挑战"]
const TYPE_META: Record<QuizItem["type"], { label: string; Icon: typeof ListChecks; color: string }> = {
  mcq:  { label: "选择题", Icon: ListChecks, color: "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]" },
  fill: { label: "填空题", Icon: Pencil,     color: "border-[#D8C9A8] bg-[#F7F2E7] text-[#8E6925]" },
  code: { label: "编程题", Icon: CodeIcon,   color: "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" },
}

export function QuizFocusModal({
  open,
  items,
  startIndex = 0,
  topic,
  defaultLanguage = "python",
  onClose,
  onSubmit,
}: QuizFocusModalProps) {
  const [idx, setIdx] = useState(startIndex)
  const [attempts, setAttempts] = useState<AttemptMap>({})
  const [lang, setLang] = useState<RunLang>(defaultLanguage)
  const [answerHint, setAnswerHint] = useState<string | null>(null)
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const questionScrollRef = useRef<HTMLDivElement | null>(null)
  const answerScrollRef = useRef<HTMLDivElement | null>(null)

  // 切换 startIndex 时重置
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => setIdx(startIndex))
    return () => window.cancelAnimationFrame(frame)
  }, [open, startIndex])

  const current = items[idx]

  // 进入题目时,若已答过则保留,否则初始化作答
  const userAnswer = useMemo(() => {
    if (!current) return ""
    const a = attempts[current.id]
    if (a) return a.userAnswer
    if (current.type === "mcq") return -1
    if (current.type === "code") return current.starter ?? ""
    return ""
  }, [current, attempts])

  const setUserAnswer = useCallback(
    (next: string | number) => {
      if (!current) return
      setAnswerHint(null)
      setAttempts((m) => ({
        ...m,
        [current.id]: {
          answered: m[current.id]?.answered ?? false,
          isCorrect: m[current.id]?.isCorrect ?? null,
          userAnswer: next,
        },
      }))
    },
    [current]
  )

  const submitted = current ? attempts[current.id]?.answered : false
  const isCorrect = current ? attempts[current.id]?.isCorrect : null
  const hasAnswer = current?.type === "mcq"
    ? typeof userAnswer === "number" && userAnswer >= 0
    : current?.type === "fill"
      ? String(userAnswer).trim().length > 0
      : Boolean(current && attempts[current.id])
        && String(userAnswer).trim().length > 0
        && String(userAnswer) !== String(current?.starter ?? "")

  const goTo = useCallback((next: number) => {
    setIdx(next)
    setAnswerHint(null)
  }, [])

  // 键盘快捷键
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      // 避免编辑器内左右影响光标
      const tag = (e.target as HTMLElement)?.tagName
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.classList?.contains("monaco-editor")
      if (isEditing) return
      if (e.key === "ArrowLeft" && idx > 0) goTo(idx - 1)
      if (e.key === "ArrowRight" && idx < items.length - 1) goTo(idx + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, idx, items.length, onClose, goTo])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousRootOverflow
    }
  }, [open])

  // 每次打开或切题都从题面顶部开始。弹窗内部在窄屏、短视口下可能由
  // 不同容器负责滚动，因此统一复位三个候选滚动区。
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0 })
      questionScrollRef.current?.scrollTo({ top: 0 })
      answerScrollRef.current?.scrollTo({ top: 0 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, idx])

  const handleSubmit = () => {
    if (!current) return
    if (!hasAnswer) {
      setAnswerHint(current.type === "code" ? "请先补充或修改代码，再提交查看标准答案与讲解。" : "请先完成作答；答案与讲解会在提交后显示。")
      return
    }
    setAnswerHint(null)
    let correct: boolean | null = null
    if (current.type === "mcq") correct = userAnswer === current.answer
    else if (current.type === "fill")
      correct = String(userAnswer).trim() === String(current.answer).trim()
    // code 题为 null,自评

    setAttempts((m) => ({
      ...m,
      [current.id]: { answered: true, userAnswer, isCorrect: correct },
    }))

    if (onSubmit) {
      onSubmit({
        id: current.id,
        question: current.question,
        type: current.type,
        user_answer: String(userAnswer),
        correct_answer: String(current.answer),
        is_correct: correct === true,
        difficulty: current.difficulty,
        topic: topic || "未分类",
      })
    }
  }

  const handleReset = () => {
    if (!current) return
    setUserAnswer(
      current.type === "mcq" ? -1 : current.type === "code" ? (current.starter ?? "") : ""
    )
    setAttempts((m) => {
      const next = { ...m }
      delete next[current.id]
      return next
    })
  }

  if (!open || !current || typeof document === "undefined") return null

  const TypeIcon = TYPE_META[current.type].Icon

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] bg-[#18232D]/32 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="paper-theme fixed inset-2 z-[60] flex flex-col overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#F3F0E7] shadow-[0_26px_80px_rgba(24,35,45,.22)] sm:inset-4 lg:inset-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="专注答题模式"
      >
        {/* 顶部 */}
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              第 {idx + 1} / {items.length} 题
            </span>
            <span className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${TYPE_META[current.type].color}`}>
              <TypeIcon className="size-3" />
              {TYPE_META[current.type].label}
            </span>
            <span className="hidden text-[11px] text-[#8E6925] md:inline">
              {"★".repeat(current.difficulty)}
              <span className="opacity-30">{"★".repeat(4 - current.difficulty)}</span>
              <span className="ml-1 opacity-70">{DIFFICULTY_LABEL[current.difficulty]}</span>
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <NavBtn disabled={idx === 0} onClick={() => goTo(idx - 1)} title="上一题 (←)">
              <ChevronLeft className="size-4" />
            </NavBtn>
            <NavBtn disabled={idx === items.length - 1} onClick={() => goTo(idx + 1)} title="下一题 (→)">
              <ChevronRight className="size-4" />
            </NavBtn>
            <NavBtn onClick={onClose} title="关闭 (Esc)">
              <X className="size-4" />
            </NavBtn>
          </div>
        </div>

        {/* 主体:左右两栏 */}
        <div
          ref={contentScrollRef}
          className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[#D7D1C4] overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:divide-x lg:divide-y-0 lg:overflow-hidden"
        >
          {/* 左:题面 */}
          <div ref={questionScrollRef} className="space-y-4 p-4 lg:overflow-y-auto lg:p-5">
            <div className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              题目
            </div>
            <div className="text-base leading-relaxed whitespace-pre-wrap">
              {current.question}
            </div>

            {current.type === "mcq" && current.options && (
              <div className="space-y-2 mt-4">
                {current.options.map((opt, i) => {
                  const selected = userAnswer === i
                  const isAns = submitted && i === current.answer
                  const isWrong = submitted && selected && !isAns
                  return (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6 transition-all
                        ${selected ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--muted)]"}
                        ${isAns ? "border-[#7E9978] bg-[#E9EEE6] ring-1 ring-[#7E9978]/25" : ""}
                        ${isWrong ? "border-[#B85C3E] bg-[#F6ECE7] ring-1 ring-[#B85C3E]/20" : ""}
                      `}
                    >
                      <input
                        type="radio"
                        name={`focus-${current.id}`}
                        checked={selected}
                        onChange={() => setUserAnswer(i)}
                        disabled={submitted}
                        className="mt-1 size-4 accent-[#315E83]"
                      />
                      <span className="font-mono opacity-50">{String.fromCharCode(65 + i)}.</span>
                      <span className="flex-1">{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {current.type === "fill" && (
              <input
                value={userAnswer as string}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={submitted}
                placeholder="填写答案"
                className="mt-2 w-full h-11 px-4 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            )}

            {submitted && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-2 rounded-xl border border-[#D8C9A8] bg-[#F7F2E7] p-4 text-sm"
              >
                <div className="flex items-center gap-1.5 font-semibold text-[#7E5E22]">
                  <Lightbulb className="size-4" /> 讲解
                </div>
                <div className="leading-relaxed text-[#4F4B43]">
                  <Markdown content={current.explanation} className="text-sm" />
                </div>
                {current.type !== "mcq" && (
                  <div className="mt-2 text-xs text-[#7E5E22]">
                    <div>
                      <strong>标准答案:</strong>
                    </div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre rounded-xl bg-[#111A22] p-3 text-[12px] text-[#F8F6F0]">
                      <code>{String(current.answer)}</code>
                    </pre>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* 右:作答区 */}
          <div ref={answerScrollRef} className="flex min-h-[300px] flex-col overscroll-contain lg:min-h-0 lg:overflow-y-auto">
            {current.type === "code" ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30 shrink-0">
                  <span className="text-xs text-[var(--muted-foreground)]">语言:</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as RunLang)}
                    className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="python">Python 3.10</option>
                    <option value="c">C (gcc)</option>
                    <option value="cpp">C++ (g++ 17)</option>
                  </select>
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">
                    Ctrl+Enter 运行(编辑器内)
                  </span>
                </div>
                <div className="flex min-h-[260px] flex-1 p-2 lg:min-h-0">
                  <CodeEditor
                    value={String(userAnswer)}
                    onChange={(v) => setUserAnswer(v)}
                    language={lang}
                    height="100%"
                    className="min-h-0 flex-1"
                  />
                </div>
                <div className="shrink-0 border-t border-[var(--border)] p-2 bg-[var(--card)]">
                  <CodeRunner
                    source={String(userAnswer)}
                    language={lang}
                    allowStdin
                    compact
                  />
                </div>
              </>
            ) : (
              <div className="p-5 flex items-center justify-center text-[var(--muted-foreground)] text-sm h-full">
                {submitted ? (
                  isCorrect ? (
                    <div className="flex flex-col items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="size-12" />
                      <div className="text-lg font-semibold">回答正确</div>
                      <div className="text-xs">查看左侧解析,或切换下一题继续</div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-rose-600">
                      <XCircle className="size-12" />
                      <div className="text-lg font-semibold">再想想</div>
                      <div className="text-xs">
                         正确答案: <span className="font-mono text-[#18232D]">{String(current.answer)}</span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center">
                    <div className="text-sm">作答后点「提交答案」</div>
                    <div className="text-[11px] mt-1">非编程题在左侧作答</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-t border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2 sm:px-4">
          {current.type === "code" && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--muted)]"
            >
              <RotateCw className="size-3.5" /> 重置代码
            </button>
          )}
          {answerHint && <div role="status" className="min-w-0 flex-1 text-[11px] leading-4 text-[#8E6925]">{answerHint}</div>}
          {!answerHint && <div className="flex-1" />}
          {!submitted ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-5 text-sm font-semibold text-white shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-colors hover:bg-[#193B50]"
            >
              <CheckCircle2 className="size-4" /> 提交答案
            </button>
          ) : (
            <div className="text-xs text-[var(--muted-foreground)] mr-2">
              已提交
            </div>
          )}
          <button
            type="button"
            disabled={idx === items.length - 1}
            onClick={() => goTo(idx + 1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一题 <ChevronRight className="size-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

function NavBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="size-8 rounded-md inline-flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}
