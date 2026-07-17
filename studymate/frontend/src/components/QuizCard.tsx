import { useState } from "react"
import { CheckCircle2, XCircle, Lightbulb, ChevronDown, ChevronUp, NotebookText, Check, Maximize2 } from "lucide-react"
import { motion } from "framer-motion"
import { apiPost } from "@/lib/api"
import { track } from "@/lib/track"
import { useCourseConfig, useCurrentCourse } from "@/store/course"
import { useCurrentUser } from "@/store/user"
import { SaveToNotebookModal } from "@/components/SaveToNotebookModal"
import { CodeRunner, type RunLang } from "@/components/CodeRunner"
import { CodeEditor } from "@/components/CodeEditor"
import { QuizFocusModal } from "@/components/QuizFocusModal"
import { classifyQuizErrorTags } from "@/lib/quizError"

export interface QuizItem {
  id: string
  type: "mcq" | "fill" | "code"
  question: string
  options?: string[]
  starter?: string
  answer: number | string
  explanation: string
  difficulty: number
}

export interface QuizResult {
  id: string
  question: string
  type: "mcq" | "fill" | "code"
  user_answer: string
  correct_answer: string
  is_correct: boolean
  difficulty: number
}

interface QuizCardProps {
  item: QuizItem
  index: number
  /** 答题主题（用于按主题统计正确率）。默认从 props 取，缺省走"未分类"。 */
  topic?: string
  /** 提交后回调，给上层（如 store）记录答题数据。code 题 is_correct=false 不准，做参考 */
  onSubmit?: (result: QuizResult & { topic: string }) => void
  /** 同批所有题(给「全屏专注」modal 跨题切换用),不传则只能看本题 */
  allItems?: QuizItem[]
}

export function QuizCard({ item, index, topic, onSubmit, allItems }: QuizCardProps) {
  const course = useCurrentCourse()
  const courseCfg = useCourseConfig()
  const user = useCurrentUser()
  // 算法课默认 C++,其他课默认 Python;用户可下拉切换
  const defaultRunLang: RunLang = courseCfg?.code_style === "algorithm" ? "cpp" : "python"
  const [focusOpen, setFocusOpen] = useState(false)
  const initialAnswer: string | number =
    item.type === "mcq" ? -1 : item.type === "code" ? (item.starter ?? "") : ""
  const [userAnswer, setUserAnswer] = useState<string | number>(initialAnswer)
  const [showResult, setShowResult] = useState(false)
  const [showExp, setShowExp] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [answerTouched, setAnswerTouched] = useState(false)
  const [answerHint, setAnswerHint] = useState<string | null>(null)

  const updateAnswer = (value: string | number) => {
    setUserAnswer(value)
    setAnswerTouched(true)
    setAnswerHint(null)
    if (showResult) {
      setShowResult(false)
      setShowExp(false)
    }
  }

  const answered = item.type === "mcq"
    ? typeof userAnswer === "number" && userAnswer >= 0
    : item.type === "fill"
      ? String(userAnswer).trim().length > 0
      : answerTouched && String(userAnswer).trim().length > 0

  const correct = (() => {
    if (item.type === "mcq") return userAnswer === item.answer
    if (item.type === "fill") return String(userAnswer).trim() === String(item.answer).trim()
    return null  // code 题需要自评，提交后展开解析对比标答
  })()
  const errorTags = correct === true
    ? []
    : classifyQuizErrorTags(item.question, item.type, userAnswer)

  const handleSubmit = () => {
    if (!answered) {
      setAnswerHint(item.type === "code" ? "请先补充或修改代码，再提交查看讲解。" : "先完成本题作答，提交后才会显示答案与讲解。")
      return
    }
    setAnswerHint(null)
    setShowResult(true)
    if (item.type === "code") setShowExp(true)  // code 题自动展开解析方便对比
    const isCorrect = correct === true  // null（code 题）按未答对算
    track("quiz_answer", "quiz", item.id, {
      topic: topic || "未分类",
      type: item.type,
      correct: isCorrect,
      difficulty: item.difficulty,
    })
    if (onSubmit) {
      onSubmit({
        id: item.id,
        question: item.question,
        type: item.type,
        user_answer: String(userAnswer),
        correct_answer: String(item.answer),
        is_correct: isCorrect,
        difficulty: item.difficulty,
        topic: topic || "未分类",
      })
    }
  }

  // 把当前题目 + 我的答 + 正确答 + 解析 序列化为 Markdown 笔记内容
  const buildWrongNoteContent = () => {
    const userAnsStr = item.type === "mcq" && typeof userAnswer === "number" && userAnswer >= 0 && item.options
      ? `${String.fromCharCode(65 + userAnswer)}. ${item.options[userAnswer]}`
      : String(userAnswer)
    const correctAnsStr = item.type === "mcq" && typeof item.answer === "number" && item.options
      ? `${String.fromCharCode(65 + item.answer)}. ${item.options[item.answer]}`
      : String(item.answer)
    return (
      `## 题目\n${item.question}\n\n` +
      (item.type === "mcq" && item.options
        ? `**选项**：\n${item.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}\n\n`
        : "") +
      `**我的答案**：${userAnsStr || "（未作答）"}\n\n` +
      `**正确答案**：${correctAnsStr}\n\n` +
      `**错误类型**：${errorTags.join("、") || "待复盘"}\n\n` +
      `## 解析\n${item.explanation}\n` +
      (item.type === "code"
        ? "\n```python\n" + String(item.answer) + "\n```\n"
        : "")
    )
  }

  const confirmSave = async ({ folder, title }: { folder: string; title: string }) => {
    if (!user) return
    await apiPost("/notes", {
      user_id: user.user_id,
      course_id: course?.id ?? null,
      folder,
      title,
      content_md: buildWrongNoteContent(),
      tags: [topic, "错题", item.type, ...errorTags.map((tag) => `错误类型:${tag}`)].filter(Boolean),
      source: "quiz",
    })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2500)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-[22px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 shadow-[0_8px_22px_rgba(24,35,45,.045)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-base font-semibold leading-relaxed flex-1 min-w-0">
          <span className="text-[var(--muted-foreground)] mr-1.5">第 {index + 1} 题</span>
          {item.question}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] font-mono">
            {item.type} · {"★".repeat(item.difficulty)}
          </span>
          <button
            type="button"
            onClick={() => setFocusOpen(true)}
            title="全屏专注答题"
            aria-label="全屏专注答题"
            className="inline-flex size-9 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {item.type === "mcq" && item.options && (
        <div className="space-y-2 mt-3">
          {item.options.map((opt, i) => (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6 transition-colors
                ${userAnswer === i ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--muted)]"}
                ${showResult && i === item.answer ? "border-[#7E9978] bg-[#E9EEE6] ring-1 ring-[#7E9978]/25" : ""}
                ${showResult && userAnswer === i && userAnswer !== item.answer ? "border-[#B85C3E] bg-[#F6ECE7] ring-1 ring-[#B85C3E]/20" : ""}
              `}
            >
              <input
                type="radio"
                name={item.id}
                checked={userAnswer === i}
                onChange={() => updateAnswer(i)}
                className="mt-1 size-4 accent-[#315E83]"
              />
              <span className="font-mono opacity-50">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {item.type === "fill" && (
        <input
          value={userAnswer as string}
          onChange={(e) => updateAnswer(e.target.value)}
          placeholder="填写答案..."
          className="mt-3 w-full h-11 px-4 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      )}

      {item.type === "code" && (
        <div className="mt-3 space-y-2">
          <CodeEditor
            value={String(userAnswer)}
            onChange={(v) => updateAnswer(v)}
            language={defaultRunLang}
            height="280px"
          />
          <CodeRunner
            source={String(userAnswer)}
            defaultLanguage={defaultRunLang}
            allowLanguageSwitch
            allowStdin
            compact
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="inline-flex h-9 items-center rounded-xl bg-[#244C66] px-4 text-xs font-bold text-[#FFFEFA] shadow-[0_6px_14px_rgba(36,76,102,.16)] transition-colors hover:bg-[#193B50]"
        >
          提交
        </button>
        {item.type === "code" && (
          <button
            type="button"
            onClick={() => {
              setUserAnswer(item.starter ?? "")
              setAnswerTouched(false)
              setAnswerHint(null)
              setShowResult(false)
              setShowExp(false)
            }}
            className="inline-flex h-9 items-center rounded-xl border border-[var(--border)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--muted)]"
          >
            重置
          </button>
        )}
        {showResult && (
          <button
            type="button"
            onClick={() => setShowExp((v) => !v)}
            aria-expanded={showExp}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--muted)]"
          >
            <Lightbulb className="size-3.5" /> 讲解
            {showExp ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
        {showResult && correct !== null && (
          <span className={`text-xs inline-flex items-center gap-1 ${correct ? "text-emerald-600" : "text-rose-600"}`}>
            {correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {correct ? "正确" : "再想想"}
          </span>
        )}
        {showResult && correct === null && (
          <span className="text-xs inline-flex items-center gap-1 text-amber-600">
            <Lightbulb className="size-4" /> 已提交，对比标答自评
          </span>
        )}
        {/* 答错 / 自评类题，可一键加入错题本（弹窗选文件夹） */}
        {showResult && correct !== true && (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className={`ml-auto inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-semibold transition-colors ${
              savedFlash
                ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]"
                : "border-[#DFC9BE] text-[#A65339] hover:bg-[#F6ECE7]"
            }`}
          >
            {savedFlash ? (
              <><Check className="size-3" /> 已加入</>
            ) : (
              <><NotebookText className="size-3" /> 加入错题本</>
            )}
          </button>
        )}
      </div>

      {answerHint && (
        <div role="status" aria-live="polite" className="mt-3 flex items-start gap-2 rounded-xl border border-[#D8C9A8] bg-[#F7F2E7] px-3 py-2.5 text-xs leading-5 text-[#7E5E22]">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
          <span>{answerHint}</span>
        </div>
      )}

      {showResult && correct !== true && errorTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#DFC8BE] bg-[#FCF7F4] px-3 py-2">
          <span className="text-[10px] font-bold text-[#9A4E35]">错误类型</span>
          {errorTags.map((tag) => <span key={tag} className="rounded-full bg-[#F4E8E2] px-2 py-0.5 text-[10px] font-semibold text-[#9A4E35]">{tag}</span>)}
          <span className="ml-auto text-[9px] text-[#7A817F]">后续优先加练</span>
        </div>
      )}

      {/* 保存到笔记本弹窗 */}
      <SaveToNotebookModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onConfirm={confirmSave}
        defaultTitle={`错题：${item.question.slice(0, 28)}${item.question.length > 28 ? "..." : ""}`}
        defaultFolder={course?.name || ""}
        description="把这道错题存到错题本，方便后面复盘"
      />

      {showExp && (
        <div className="mt-3 rounded-xl border border-[#D8C9A8] bg-[#F7F2E7] p-3.5 text-sm leading-6">
          <strong className="text-[#7E5E22]">讲解：</strong>
          <span className="ml-1 text-[#4F4B43]">{item.explanation}</span>
          {item.type === "code" && (
            <pre className="mt-2 overflow-x-auto whitespace-pre rounded-xl bg-[#111A22] p-3 text-xs text-[#F8F6F0]">
              <code>{item.answer}</code>
            </pre>
          )}
        </div>
      )}

      <QuizFocusModal
        open={focusOpen}
        items={allItems && allItems.length > 0 ? allItems : [item]}
        startIndex={allItems && allItems.length > 0 ? Math.max(0, allItems.findIndex((q) => q.id === item.id)) : 0}
        topic={topic}
        defaultLanguage={defaultRunLang}
        onClose={() => setFocusOpen(false)}
        onSubmit={onSubmit}
      />
    </motion.div>
  )
}
