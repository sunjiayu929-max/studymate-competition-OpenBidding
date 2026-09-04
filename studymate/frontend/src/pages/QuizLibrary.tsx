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
  Activity,
  Crosshair,
  RadioTower,
} from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { NewQuizModal } from "@/components/NewQuizModal"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"
import { listQuizSessions, type QuizSession } from "@/lib/quizSession"
import "./QuizLibrary.css"

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
  const [modalTopic, setModalTopic] = useState("")
  const [challengePreset, setChallengePreset] = useState(false)

  useEffect(() => {
    if (!course || searchParams.get("create") !== "1") return
    const requestedTopic = searchParams.get("topic")?.trim() || ""
    const requestedChallenge = searchParams.get("challenge") === "1"
    const frame = window.requestAnimationFrame(() => {
      setModalTopic(requestedTopic)
      setChallengePreset(requestedChallenge)
      const next = new URLSearchParams(searchParams)
      next.delete("create")
      next.delete("topic")
      next.delete("challenge")
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
    <main className="app-page paper-theme quiz-command-center min-h-dvh">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="quiz" appearance="paper" labelOverride="智能测验中心" groupOverride="岗位能力测评" selectionLabel={targetRole?.name || course?.name || "尚未选择目标岗位"} iconImage="/images/quiz-assessment-radar-v1.png" showRocketFormation rocketVariant="honor" />

        <section className="quiz-command-shell mt-3 flex min-h-[calc(100dvh-108px)] flex-col overflow-hidden border-y">
          <header className="quiz-command-hero relative overflow-hidden px-3 py-5 sm:px-5 lg:px-6">
            <div className="quiz-scan-grid" aria-hidden="true" />
            <div className="quiz-signal-track" aria-hidden="true"><i /><i /><i /><span /></div>
            <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(340px,.76fr)_minmax(560px,1.24fr)] xl:items-start xl:gap-6">
              <div className="quiz-mission-summary min-w-0">
                <Link to="/" className="quiz-back inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black">
                  <ArrowLeft className="size-3.5" /><span>返回首页</span>
                </Link>
                <div className="mt-4 flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <span className="quiz-hero-radar shrink-0"><img src="/images/quiz-assessment-radar-v1.png" alt="" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <div className="quiz-title-index"><strong>01</strong><span>智能测验</span><i>ASSESSMENT RADAR</i></div>
                    <h1 className="quiz-command-title mt-2">扫描知识盲区<br /><span>校准真实能力</span></h1>
                  </div>
                </div>
                <p className="mt-4 max-w-xl text-[13px] font-semibold leading-6">{course ? `围绕“${targetRole?.name || course.name}”岗位知识库生成个性化题目，完成评分、错题归档与针对性复习。` : targetRole ? `已选择“${targetRole.name}”，专属知识库接入后开放岗位测验。` : "选择目标岗位后生成个性化题目，并把错题准确归档。"}</p>
                <div className="quiz-calibration-brief mt-5" aria-label="本轮校准协议">
                  <span><small>测评范围</small><b>{targetRole?.name || course?.name || "等待选择岗位"}</b></span>
                  <span><small>扫描输出</small><b>个性化题组与能力精度</b></span>
                  <span><small>闭环回写</small><b>得分、错题与针对性复习</b></span>
                </div>
                <div className="quiz-telemetry mt-5 grid grid-cols-3 overflow-hidden rounded-[16px] border">
                  <span><Activity className="size-4" /><b>{stats.total}</b><small>测验信号</small></span>
                  <span><Crosshair className="size-4" /><b>{stats.submitted}</b><small>完成锁定</small></span>
                  <span><RadioTower className="size-4" /><b>{stats.submitted ? stats.avg : "—"}</b><small>平均精度</small></span>
                </div>
                <div className="quiz-stage-rail relative mt-5 grid grid-cols-4 overflow-hidden rounded-[14px] border"><span aria-hidden="true" />{["选择", "组卷", "作答", "归档"].map((label, index) => <div key={label}><i>{String(index + 1).padStart(2, "0")}</i>{label}</div>)}</div>
                <div className="quiz-scan-dimensions mt-5" aria-label="能力扫描维度">
                  <div className="quiz-scan-dimensions__header">
                    <div><span><i />ABILITY SCAN CHANNELS</span><b>能力扫描维度</b></div>
                    <small>3 条校准通道在线</small>
                  </div>
                  <div className="quiz-scan-dimension is-knowledge">
                    <span><BookOpen className="size-4" /></span>
                    <div><b>岗位知识边界</b><small>{course ? `${course.name} 已锁定` : "选择岗位后锁定知识范围"}</small><i><em /></i></div>
                    <strong>{course ? "已锁定" : "待接入"}</strong>
                  </div>
                  <div className="quiz-scan-dimension is-formats">
                    <span><Crosshair className="size-4" /></span>
                    <div><b>题型组合覆盖</b><small>选择题、填空题与编程题协同校准</small><i><em /></i></div>
                    <strong>多题型</strong>
                  </div>
                  <div className="quiz-scan-dimension is-loop">
                    <span><RefreshCw className="size-4" /></span>
                    <div><b>训练闭环回写</b><small>得分与错题证据自动进入复习路径</small><i><em /></i></div>
                    <strong>可回溯</strong>
                  </div>
                  <span className="quiz-scan-dimensions__sweep" aria-hidden="true" />
                </div>
              </div>
              {course ? (
                <aside className="quiz-builder-panel min-w-0">
                  <QuizSectionHeading number="02" eyebrow="ASSESSMENT SETUP" title="设定测评参数" description="选择主题、题型与难度，立即启动本轮能力扫描。" />
                  <NewQuizModal open embedded onClose={() => undefined} initialTopic={modalTopic} challengePreset={challengePreset} onCreated={(s) => navigate(`/quiz/${s.id}`)} />
                </aside>
              ) : <CourseRequiredState targetRoleName={targetRole?.name} />}
            </div>
          </header>

          <div className="quiz-command-toolbar flex flex-col items-stretch gap-2.5 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
            <div className="flex items-center gap-2"><span className="quiz-live-dot" /><strong className="text-[11px] tracking-[.14em]">ASSESSMENT ONLINE</strong><span className="text-[11px] font-bold">测评雷达已就绪</span></div>
            {course ? (
              <span className="quiz-ready-badge inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold">
                <Sparkles className="size-3.5" />首屏测评工作区已就绪
              </span>
            ) : (
              <Link to={targetRole ? "/workspace" : "/courses?returnTo=%2Fquiz"} className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50]">
                <Library className="size-3.5" />{targetRole ? "查看岗位状态" : "选择目标岗位"}
              </Link>
            )}
          </div>

          <div className="quiz-longform flex flex-1 flex-col px-3 py-8 sm:px-5 sm:py-10">
            <section className="quiz-archive min-w-0">
            <QuizSectionHeading number="03" eyebrow="QUIZ ARCHIVE" title="历史测验题" description="题组、得分与错题解析持续归档，形成可回溯的能力证据。" aside="点击题组继续作答或查看解析" />
            <div className="quiz-stats mb-5 grid overflow-hidden rounded-[18px] border sm:grid-cols-3">
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
          <div className="quiz-loading flex flex-1 items-center justify-center py-20 text-[var(--muted-foreground)]">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : sessions.length === 0 ? (
          <EmptyHint />
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
            </section>
          </div>
        </section>
      </div>

    </main>
  )
}

function QuizSectionHeading({ number, eyebrow, title, description, aside }: { number: string; eyebrow: string; title: string; description: string; aside?: string }) {
  return (
    <div className="quiz-section-heading relative mb-5 flex items-start gap-4 overflow-hidden border-b pb-5">
      <strong aria-hidden="true">{number}</strong>
      <div className="relative z-10 min-w-0">
        <span>{number} · {eyebrow}</span>
        <h2 className="mt-1">{title}</h2>
        <p className="mt-1">{description}</p>
      </div>
      {aside && <small className="relative z-10 ml-auto hidden self-end text-right xl:block">{aside}</small>}
      <i className="quiz-heading-wave" aria-hidden="true"><b /><b /><b /></i>
    </div>
  )
}

function CourseRequiredState({ targetRoleName }: { targetRoleName?: string }) {
  return (
    <div className="quiz-course-required grid flex-1 place-items-center border border-dashed px-5 py-16 text-center">
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
    <div className={`quiz-stat-card is-${tone} flex items-center gap-3 border-b border-[#D7D1C4] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0`}>
      <span className={`quiz-stat-icon grid size-9 shrink-0 place-items-center rounded-xl ${palette}`}><Icon className="size-4" /></span>
      <div className="quiz-stat-copy">
        <div className="text-[10px] font-bold tracking-[0.1em] text-[#8A8172]">{label}</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-[#18232D]">{value}</div>
      </div>
      <i className="quiz-stat-signal" aria-hidden="true" />
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
      className={`quiz-session-card is-${s.status} group rounded-[18px] border p-5 text-left transition-all`}
    >
      <span className="quiz-session-visual" aria-hidden="true"><i /><i /><i /></span>
      <div className="quiz-session-card__header flex items-start justify-between gap-2 mb-2">
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

      <div className="quiz-session-meta flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">mcq × {s.mcq_count}</span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">fill × {s.fill_count}</span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--muted)]">code × {s.code_count}</span>
      </div>

      <div className="quiz-session-footer flex items-center justify-between">
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

function EmptyHint() {
  return (
    <div className="quiz-empty-result relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden border border-dashed px-4 py-12 text-center">
      <span className="quiz-empty-radar" aria-hidden="true"><i /><i /><i /></span>
      <div className="relative z-10">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><BookOpen className="size-5" /></span>
        <div className="mb-1 text-base font-bold text-[#18232D]">暂无历史测验题</div>
        <div className="mx-auto mb-4 max-w-xl text-sm leading-6 text-[#66717B]">
          在左侧完成一次测验设置后，题组、得分和错题解析会自动归档到这里，之后可以随时继续作答或回顾。
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#B9C9D3] bg-[#E7EDF3] px-3 py-2 text-[11px] font-bold text-[#315E83]">请在左侧设置后开始</div>
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
