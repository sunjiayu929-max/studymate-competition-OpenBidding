/**
 * /quiz · 题库测验列表页
 * - 顶部：当前目标岗位 + 新建测验按钮
 * - 历史 sessions 卡片墙：主题 / 题数 / 模式 / 状态 / 得分 / 用时
 * - 已提交 → 跳详情页查回顾；ready 状态 → 继续作答
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  BookOpen,
  Plus,
  Sparkles,
  Clock,
  CheckCircle2,
  Trophy,
  Loader2,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Library,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppTopbar } from "@/components/AppTopbar"
import { NewQuizModal } from "@/components/NewQuizModal"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { listQuizSessions, type QuizSession } from "@/lib/quizSession"

export function QuizLibrary() {
  useTrackPage("quiz")
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const courseId = course?.id ?? null
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTopic, setModalTopic] = useState("")

  useEffect(() => {
    if (!course || searchParams.get("create") !== "1") return
    const requestedTopic = searchParams.get("topic")?.trim() || ""
    const frame = window.requestAnimationFrame(() => {
      setModalTopic(requestedTopic)
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete("create")
      next.delete("topic")
      setSearchParams(next, { replace: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [course, searchParams, setSearchParams])

  useTutorContext({
    page: "quiz",
    title: `题库测验${course?.name ? ` · ${course.name}` : ""}`,
  })

  const refresh = useCallback(async () => {
    if (!USER_ID) return
    setLoading(true)
    setError(null)
    try {
      const list = await listQuizSessions({
        user_id: USER_ID,
        course_id: courseId,
        limit: 50,
      })
      setSessions(list)
    } catch (e) {
      setError(`加载失败：${String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [USER_ID, courseId])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh())
    return () => window.cancelAnimationFrame(frame)
  }, [refresh])

  const stats = useMemo(() => {
    const submitted = sessions.filter((s) => s.status === "submitted")
    const avg = submitted.length
      ? submitted.reduce((a, b) => a + b.score, 0) / submitted.length
      : 0
    return {
      total: sessions.length,
      submitted: submitted.length,
      avg: Math.round(avg),
    }
  }, [sessions])

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="quiz" appearance="paper" />

        <section className="mt-4 flex min-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-col items-stretch gap-2.5 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><BookOpen className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-bold text-[#18232D]">StudyMate 智能测验</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">{course ? `围绕“${targetRole?.name || course.name}”岗位知识库生成个性化题目 · 完成评分、错题归档与针对性复习` : targetRole ? `已选择“${targetRole.name}” · 专属知识库接入后开放岗位测验` : "选择目标岗位后生成个性化题目，并把错题准确归档"}</p>
              </div>
            </div>
            {course ? (
              <button type="button" onClick={() => { setModalTopic(""); setModalOpen(true) }} className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50]">
                <Plus className="size-3.5" />新建测验
              </button>
            ) : (
              <Link to={targetRole ? "/workspace" : "/courses?returnTo=%2Fquiz"} className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50]">
                <Library className="size-3.5" />{targetRole ? "查看岗位状态" : "选择目标岗位"}
              </Link>
            )}
          </header>

          <div className="flex flex-1 flex-col p-4 sm:p-5">
            {!course ? (
              <CourseRequiredState targetRoleName={targetRole?.name} />
            ) : (
              <>
            <div className="mb-5 grid overflow-hidden rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] sm:grid-cols-3">
              <StatCard label="累计测验" value={stats.total} icon={Sparkles} tone="blue" />
              <StatCard label="已完成" value={stats.submitted} icon={CheckCircle2} tone="green" />
              <StatCard label="平均得分" value={stats.submitted ? `${stats.avg}` : "—"} icon={Trophy} tone="gold" />
            </div>

        {error && (
          <div role="alert" className="mb-3 flex flex-col gap-2 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2.5 text-sm text-[#9A4E35] sm:flex-row sm:items-center">
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">测验列表加载失败，请稍后重试。</span>
            <button type="button" onClick={() => void refresh()} className="inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-[#D6BBAF] bg-[#FFFEFA] px-3 text-[11px] font-bold hover:bg-[#F8F1EC]"><RefreshCw className="size-3.5" />重新加载</button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20 text-[var(--muted-foreground)]">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : sessions.length === 0 ? (
          <EmptyHint onCreate={() => { setModalTopic(""); setModalOpen(true) }} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s, i) => (
              <SessionCard
                key={s.id}
                s={s}
                index={i}
                onOpen={() => navigate(`/quiz/${s.id}`)}
              />
            ))}
          </div>
        )}
              </>
            )}
          </div>
        </section>
      </div>

      <NewQuizModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTopic={modalTopic}
        onCreated={(s) => {
          setModalOpen(false)
          navigate(`/quiz/${s.id}`)
        }}
      />
    </div>
  )
}

function CourseRequiredState({ targetRoleName }: { targetRoleName?: string }) {
  return (
    <div className="grid flex-1 place-items-center rounded-[24px] border border-dashed border-[#CFC8B9] bg-[#F8F6F0] px-5 py-12 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Library className="size-5" /></span>
        <div className="mt-4 text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">{targetRoleName ? "岗位已选定" : "开始测验前"}</div>
        <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-[#18232D]">{targetRoleName ? `“${targetRoleName}”岗位知识库正在建设` : "先选择测验所属目标岗位"}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66717B]">{targetRoleName ? "岗位选择与画像已经保存；专属知识库接入后，系统会按岗位能力范围生成测验并归档答题证据。" : "目标岗位会锁定出题范围、知识依据和错题归档位置，避免不同岗位的训练记录混在一起。"}</p>
        <Link to={targetRoleName ? "/workspace" : "/courses?returnTo=%2Fquiz"} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] hover:bg-[#193B50]">{targetRoleName ? "返回资源工坊查看状态" : "选择目标岗位并继续"} <ArrowRight className="size-3.5" /></Link>
        {targetRoleName && <Link to="/courses?returnTo=%2Fquiz" className="mt-3 inline-flex text-xs font-semibold text-[#66717B] hover:text-[#244C66]">更换目标岗位</Link>}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  icon: typeof Sparkles
  tone: "blue" | "green" | "gold"
}) {
  const palette = {
    blue: "bg-[#E7EDF3] text-[#315E83]",
    green: "bg-[#E9EEE6] text-[#557052]",
    gold: "bg-[#F4ECD8] text-[#8E6925]",
  }[tone]
  return (
    <div className="flex items-center gap-3 border-b border-[#D7D1C4] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${palette}`}><Icon className="size-4" /></span>
      <div>
        <div className="text-[10px] font-bold tracking-[0.1em] text-[#8A8172]">{label}</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-[#18232D]">{value}</div>
      </div>
    </div>
  )
}

function SessionCard({
  s,
  index,
  onOpen,
}: {
  s: QuizSession
  index: number
  onOpen: () => void
}) {
  const statusBadge = {
    submitted: { label: "已完成", color: "bg-[#E9EEE6] text-[#557052]" },
    ready: { label: "待作答", color: "bg-[#F4ECD8] text-[#8E6925]" },
    generating: { label: "出题中", color: "bg-[#E7EDF3] text-[#315E83]" },
    error: { label: "生成失败", color: "bg-[#F4E8E2] text-[#9A4E35]" },
  }[s.status]

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onOpen}
      className="group rounded-[22px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 text-left shadow-[0_9px_24px_rgba(24,35,45,.045)] transition-all hover:-translate-y-0.5 hover:border-[#AEBAB5] hover:shadow-[0_15px_30px_rgba(24,35,45,.08)]"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{s.topic}</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            {fmtDate(s.created_at)} · 难度 {s.difficulty}/4 · {s.mode === "exam" ? "试卷" : "闯关"}
          </div>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">mcq × {s.mcq_count}</span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">fill × {s.fill_count}</span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">code × {s.code_count}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          {s.status === "submitted" && (
            <>
              <span className="inline-flex items-center gap-1 font-medium text-[#557052]">
                <Trophy className="size-3" /> {s.score} 分
              </span>
              {s.duration_ms > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
                  <Clock className="size-3" /> {fmtDur(s.duration_ms)}
                </span>
              )}
            </>
          )}
        </div>
        <ArrowRight className="size-3.5 text-[#8A8172] transition-colors group-hover:text-[#315E83]" />
      </div>
    </motion.button>
  )
}

function EmptyHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-[#C9C2B4] bg-[#F8F6F0] px-4 py-12 text-center">
      <div>
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><BookOpen className="size-5" /></span>
        <div className="mb-1 text-base font-bold text-[#18232D]">开始你的第一次系统测验</div>
        <div className="mx-auto mb-4 max-w-xl text-sm leading-6 text-[#66717B]">
          自定义题型、数量与难度，提交后自动评分；错题可以直接保存到智能笔记继续复习。
        </div>
        <Button onClick={onCreate}>
          <Plus className="size-3.5" /> 新建测验
        </Button>
      </div>
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${mm}-${dd} ${hh}:${mi}`
}

function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}m${ss}s`
}
