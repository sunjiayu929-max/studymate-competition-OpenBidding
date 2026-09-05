/**
 * /quiz · 智能测验
 *
 * 左侧直接组卷，右侧同步展示历史测验与统计。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Library,
  Loader2,
  RefreshCw,
  Trophy,
  type LucideIcon,
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

const QUIZ_HISTORY_PAGE_SIZE = 4

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
  const [historyPage, setHistoryPage] = useState(1)

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
    title: `智能测验${course?.name ? ` · ${course.name}` : ""}`,
  })

  const refresh = useCallback(async () => {
    if (!USER_ID) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await listQuizSessions({ user_id: USER_ID, course_id: courseId, limit: 50 })
      setSessions(list)
    } catch (cause) {
      setError(`加载失败：${String(cause)}`)
    } finally {
      setLoading(false)
    }
  }, [USER_ID, courseId])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh())
    return () => window.cancelAnimationFrame(frame)
  }, [refresh])

  const stats = useMemo(() => {
    const submitted = sessions.filter((session) => session.status === "submitted")
    const avg = submitted.length
      ? submitted.reduce((sum, session) => sum + session.score, 0) / submitted.length
      : 0
    return { total: sessions.length, submitted: submitted.length, avg: Math.round(avg) }
  }, [sessions])

  const historyPageCount = Math.max(1, Math.ceil(sessions.length / QUIZ_HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyPageCount)
  const visibleSessions = useMemo(() => {
    const start = (currentHistoryPage - 1) * QUIZ_HISTORY_PAGE_SIZE
    return sessions.slice(start, start + QUIZ_HISTORY_PAGE_SIZE)
  }, [currentHistoryPage, sessions])

  useEffect(() => {
    setHistoryPage(1)
  }, [courseId])

  return (
    <main className="app-page paper-theme quiz-library-page min-h-dvh">
      <div className="quiz-library-frame">
        <AppTopbar
          className="rounded-none border-x-0 shadow-none"
          current="quiz"
          appearance="paper"
          labelOverride="智能测验"
          groupOverride="岗位训练"
          selectionLabel={targetRole?.name || course?.name || "尚未选择目标岗位"}
        />

        <section className="quiz-library-shell quiz-split-shell">
          <div className="quiz-split-workspace">
            <section className="quiz-builder-panel" aria-label="测验设置">
              {course ? (
                <NewQuizModal open embedded onClose={() => undefined} initialTopic={modalTopic} challengePreset={challengePreset} onCreated={(session) => navigate(`/quiz/${session.id}`)} />
              ) : (
                <CourseRequiredState targetRoleName={targetRole?.name} />
              )}
            </section>

            <section className="quiz-history-panel" aria-labelledby="quiz-history-title">
              <div className="quiz-history-heading">
                <div><span>QUIZ ARCHIVE</span><h2 id="quiz-history-title">历史测验</h2><p>继续未完成题组，或查看已提交测验的得分与解析。</p></div>
                <small>点击题组继续作答或查看解析</small>
              </div>

              <div className="quiz-stats" aria-label="历史测验统计">
                <StatCard label="累计测验" value={stats.total} icon={BookOpenCheck} />
                <StatCard label="已完成" value={stats.submitted} icon={CheckCircle2} />
                <StatCard label="平均得分" value={stats.submitted ? stats.avg : "—"} icon={Trophy} />
              </div>

              {error && (
                <div role="alert" className="quiz-list-error"><AlertCircle /><span>测验列表加载失败，请稍后重试。</span><button type="button" onClick={() => void refresh()}><RefreshCw />重新加载</button></div>
              )}

              {loading ? (
                <div className="quiz-loading"><Loader2 className="animate-spin" />加载测验记录…</div>
              ) : sessions.length === 0 ? (
                <EmptyHint />
              ) : (
                <>
                  <div className="quiz-session-grid">
                    {visibleSessions.map((session) => <SessionCard key={session.id} session={session} onOpen={() => navigate(`/quiz/${session.id}`)} />)}
                  </div>
                  {historyPageCount > 1 && (
                    <nav className="quiz-history-pagination" aria-label="历史测验分页">
                      <span>第 {currentHistoryPage} / {historyPageCount} 页 · 共 {sessions.length} 条</span>
                      <div>
                        <button type="button" onClick={() => setHistoryPage(Math.max(1, currentHistoryPage - 1))} disabled={currentHistoryPage === 1} aria-label="上一页"><ChevronLeft /></button>
                        <button type="button" onClick={() => setHistoryPage(Math.min(historyPageCount, currentHistoryPage + 1))} disabled={currentHistoryPage === historyPageCount} aria-label="下一页"><ChevronRight /></button>
                      </div>
                    </nav>
                  )}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function CourseRequiredState({ targetRoleName }: { targetRoleName?: string }) {
  return (
    <div className="quiz-course-required">
      <span><Library /></span><small>{targetRoleName ? "岗位已选定" : "开始测验前"}</small>
      <h2>{targetRoleName ? `“${targetRoleName}”岗位知识库正在建设` : "先选择测验所属目标岗位"}</h2>
      <p>{targetRoleName ? "岗位选择与画像已经保存；专属知识库接入后即可按岗位范围生成题目。" : "目标岗位会锁定出题范围、知识依据和测验归档位置。"}</p>
      <Link to={targetRoleName ? "/workspace" : "/courses?returnTo=%2Fquiz"}>{targetRoleName ? "查看岗位状态" : "选择目标岗位"}<ArrowRight /></Link>
      {targetRoleName && <Link className="quiz-change-role" to="/courses?returnTo=%2Fquiz">更换目标岗位</Link>}
    </div>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return <div className="quiz-stat-card"><span><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></div>
}

function SessionCard({ session, onOpen }: { session: QuizSession; onOpen: () => void }) {
  const statusBadge = {
    submitted: { label: "已完成", className: "is-submitted" },
    ready: { label: "待作答", className: "is-ready" },
    generating: { label: "出题中", className: "is-generating" },
    error: { label: "生成失败", className: "is-error" },
  }[session.status]

  return (
    <button type="button" onClick={onOpen} className={`quiz-session-card ${statusBadge.className}`}>
      <div className="quiz-session-card-header"><div><strong>{session.topic}</strong><small>{fmtDate(session.created_at)} · 难度 {session.difficulty}/4 · {session.mode === "exam" ? "试卷模式" : "闯关模式"}</small></div><span>{session.status === "generating" && <Loader2 className="animate-spin" />}{statusBadge.label}</span></div>
      <div className="quiz-session-meta"><span>选择 {session.mcq_count}</span><span>填空 {session.fill_count}</span><span>编程 {session.code_count}</span></div>
      <div className="quiz-session-footer"><div>{session.status === "submitted" && <strong><Trophy />{session.score} 分</strong>}{session.status === "submitted" && session.duration_ms > 0 && <span><Clock />{fmtDur(session.duration_ms)}</span>}</div><span>{session.status === "submitted" ? "查看解析" : "打开测验"}<ArrowRight /></span></div>
    </button>
  )
}

function EmptyHint() {
  return (
    <div className="quiz-empty-result"><span><History /></span><h3>还没有历史测验</h3><p>在左侧完成第一份测验后，题组、得分和错题解析会归档在这里。</p></div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  return `${mm}-${dd} ${hh}:${mi}`
}

function fmtDur(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`
}
