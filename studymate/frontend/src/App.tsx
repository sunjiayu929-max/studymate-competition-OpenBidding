import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom"
import { RequireAuth, RequireAdmin } from "@/components/guards"
import { JudgeTour } from "@/components/JudgeTour"
import { JudgeDemoMode } from "@/components/JudgeDemoMode"
import { SiteFiling } from "@/components/SiteFiling"
import { AppShell } from "@/components/AppShell"
import { useCurrentUser } from "@/store/user"

// 页面按路由拆包：首屏只下载当前页面，图表、PDF、编辑器等重依赖不再一次性阻塞启动。
const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })))
const ProfileChat = lazy(() => import("@/pages/ProfileChat").then((m) => ({ default: m.ProfileChat })))
const RagDemo = lazy(() => import("@/pages/RagDemo").then((m) => ({ default: m.RagDemo })))
const RagSource = lazy(() => import("@/pages/RagSource").then((m) => ({ default: m.RagSource })))
const WorkspaceDetail = lazy(() => import("@/pages/WorkspaceDetail").then((m) => ({ default: m.WorkspaceDetail })))
const TutorChat = lazy(() => import("@/pages/TutorChat").then((m) => ({ default: m.TutorChat })))
const VoiceTutor = lazy(() => import("@/pages/VoiceTutor").then((m) => ({ default: m.VoiceTutor })))
const Report = lazy(() => import("@/pages/Report").then((m) => ({ default: m.Report })))
const Tests = lazy(() => import("@/pages/Tests").then((m) => ({ default: m.Tests })))
const Courses = lazy(() => import("@/pages/Courses").then((m) => ({ default: m.Courses })))
const Notes = lazy(() => import("@/pages/Notes").then((m) => ({ default: m.Notes })))
const QuizLibrary = lazy(() => import("@/pages/QuizLibrary").then((m) => ({ default: m.QuizLibrary })))
const QuizPlay = lazy(() => import("@/pages/QuizPlay").then((m) => ({ default: m.QuizPlay })))
const FeedbackCenter = lazy(() => import("@/pages/FeedbackCenter").then((m) => ({ default: m.FeedbackCenter })))
const UserGuide = lazy(() => import("@/pages/UserGuide").then((m) => ({ default: m.UserGuide })))
const ConceptDemo = lazy(() => import("@/pages/ConceptDemo").then((m) => ({ default: m.ConceptDemo })))
const ConceptLibrary = lazy(() => import("@/pages/ConceptLibrary").then((m) => ({ default: m.ConceptLibrary })))
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase").then((m) => ({ default: m.KnowledgeBase })))
const PptGenerator = lazy(() => import("@/pages/PptGenerator").then((m) => ({ default: m.PptGenerator })))
const LearningResources = lazy(() => import("@/pages/LearningResources").then((m) => ({ default: m.LearningResources })))
const CareerExplorer = lazy(() => import("@/pages/CareerExplorer").then((m) => ({ default: m.CareerExplorer })))
const CompetencyTraining = lazy(() => import("@/pages/CompetencyTraining").then((m) => ({ default: m.CompetencyTraining })))
const AIInterview = lazy(() => import("@/pages/AIInterview").then((m) => ({ default: m.AIInterview })))
const EnterpriseHub = lazy(() => import("@/pages/EnterpriseHub").then((m) => ({ default: m.EnterpriseHub })))
const EnterpriseDashboard = lazy(() => import("@/pages/EnterpriseDashboard").then((m) => ({ default: m.EnterpriseDashboard })))
const EnterpriseTaskRead = lazy(() => import("@/pages/EnterpriseTaskRead").then((m) => ({ default: m.EnterpriseTaskRead })))
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })))
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })))
const NotFound = lazy(() => import("@/pages/NotFound").then((m) => ({ default: m.NotFound })))
const TutorBubble = lazy(() => import("@/components/TutorBubble").then((m) => ({ default: m.TutorBubble })))

// 登录、助教自身、沉浸工具与高密度数据页不叠加悬浮人物，避免遮挡关键控件和数据卡。
const BUBBLE_HIDDEN_PATHS = ["/login", "/tutor", "/tutor/voice", "/concept", "/ppt", "/report", "/tests"]

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const scrollToDestination = () => {
      if (hash) {
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start", behavior: "auto" })
        return
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }
    const frame = window.requestAnimationFrame(scrollToDestination)
    const timeout = window.setTimeout(scrollToDestination, 100)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [pathname, hash])
  return null
}

function GlobalTutorBubble() {
  const location = useLocation()
  const user = useCurrentUser()
  const [homeUniverseVisible, setHomeUniverseVisible] = useState(location.pathname === "/")

  useEffect(() => {
    if (location.pathname !== "/") {
      setHomeUniverseVisible(false)
      return
    }
    setHomeUniverseVisible(true)
    const onVisibility = (event: Event) => {
      setHomeUniverseVisible(Boolean((event as CustomEvent<{ visible?: boolean }>).detail?.visible))
    }
    window.addEventListener("studymate:home-universe-visibility", onVisibility)
    return () => window.removeEventListener("studymate:home-universe-visibility", onVisibility)
  }, [location.pathname])

  if (!user) return null
  const hidden = BUBBLE_HIDDEN_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  ) || (location.pathname === "/" && homeUniverseVisible)
  if (hidden) return null
  return <Suspense fallback={null}><TutorBubble /></Suspense>
}

function GlobalSiteFiling() {
  const { pathname } = useLocation()
  if (pathname === "/tutor/voice") return null
  return <SiteFiling />
}

function RootEntry() {
  const user = useCurrentUser()
  useEffect(() => {
    if (!user) window.location.replace("/landing/index.html")
  }, [user])
  if (!user) return null
  if (user.role === "admin") return <Navigate to="/admin" replace />
  if (user.role === "enterprise_admin") return <Navigate to="/enterprise/dashboard" replace />
  return <AppShell><Home /></AppShell>
}

function SystemAdminEntry() {
  const user = useCurrentUser()
  if (!user) return <RequireAuth><div /></RequireAuth>
  if (user.role !== "admin") return <Navigate to="/" replace />
  return <AppShell><AdminDashboard /></AppShell>
}

function ProtectedPage({ children }: { children: ReactNode }) {
  return <RequireAuth><AppShell>{children}</AppShell></RequireAuth>
}

function EnterpriseDashboardEntry() {
  const user = useCurrentUser()
  if (!user) return <RequireAuth><div /></RequireAuth>
  if (user.role !== "enterprise_admin") {
    return <Navigate to="/enterprise" replace />
  }
  return <AppShell><EnterpriseDashboard /></AppShell>
}

function LearnerTaskReadEntry() {
  const user = useCurrentUser()
  if (!user) return <RequireAuth><div /></RequireAuth>
  if (user.role === "admin") return <Navigate to="/admin" replace />
  if (user.role === "enterprise_admin") return <Navigate to="/enterprise" replace />
  return <ProtectedPage><EnterpriseTaskRead /></ProtectedPage>
}

function RouteFallback() {
  return (
    <div className="app-page paper-theme grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm rounded-[24px] border border-[#D7D1C4] bg-[#FFFEFA] p-6 shadow-[0_18px_45px_rgba(24,35,45,.08)]">
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 place-items-center rounded-2xl bg-[#244C66] text-[#F0D6A4]">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-[#244C66] opacity-15" />
            <span className="relative text-lg">✦</span>
          </span>
          <div className="flex-1">
            <div className="h-3 w-28 animate-pulse rounded-full bg-[#D7D1C4]" />
            <div className="mt-2 h-2 w-44 max-w-full animate-pulse rounded-full bg-[#ECE8DE]" />
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#ECE8DE]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[#6F8A69]" />
        </div>
        <p className="mt-3 text-center text-[11px] font-medium text-[#66717B]">正在打开你的学习空间…</p>
      </div>
    </div>
  )
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app-page paper-theme grid min-h-dvh place-items-center px-5">
        <section role="alert" className="w-full max-w-lg rounded-[28px] border border-[#DFC8BE] bg-[#FFFEFA] p-6 text-center shadow-[0_18px_48px_rgba(24,35,45,.09)] sm:p-8">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-xl text-[#9A4E35]">!</span>
          <p className="mt-4 text-[10px] font-bold tracking-[0.12em] text-[#9A4E35]">加载失败</p>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#18232D]">页面暂时无法打开</h1>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#66717B]">可能是网络波动。学习记录不会丢失，请重新加载。</p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] hover:bg-[#193B50]">重新加载当前页面</button>
            <button type="button" onClick={() => { window.location.href = "/" }} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-5 text-xs font-bold text-[#59636B] hover:bg-[#F1EDE4]">返回学习首页</button>
          </div>
        </section>
      </div>
    )
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootEntry />} />
          <Route path="/admin" element={<SystemAdminEntry />} />
          <Route path="/profile" element={<ProtectedPage><ProfileChat /></ProtectedPage>} />
          <Route path="/rag" element={<ProtectedPage><RagDemo /></ProtectedPage>} />
          <Route path="/rag/source/:chunkId" element={<ProtectedPage><RagSource /></ProtectedPage>} />
          <Route path="/knowledge" element={<ProtectedPage><KnowledgeBase /></ProtectedPage>} />
          <Route path="/ppt" element={<ProtectedPage><PptGenerator /></ProtectedPage>} />
          <Route path="/resources" element={<ProtectedPage><LearningResources /></ProtectedPage>} />
          <Route path="/career" element={<ProtectedPage><CareerExplorer /></ProtectedPage>} />
          <Route path="/competency" element={<ProtectedPage><CompetencyTraining /></ProtectedPage>} />
          <Route path="/competency/resources" element={<Navigate to="/competency" replace />} />
          <Route path="/competency/audit" element={<Navigate to="/competency" replace />} />
          <Route path="/competency/report" element={<Navigate to="/#learner-match-report" replace />} />
          <Route path="/ai-interview" element={<ProtectedPage><AIInterview /></ProtectedPage>} />
          <Route path="/enterprise" element={<ProtectedPage><EnterpriseHub /></ProtectedPage>} />
          <Route path="/enterprise/dashboard" element={<EnterpriseDashboardEntry />} />
          <Route path="/enterprise/tasks/:taskId/read" element={<LearnerTaskReadEntry />} />
          <Route path="/workspace" element={<Navigate to="/competency" replace />} />
          <Route path="/workspace/r/:agentId" element={<ProtectedPage><WorkspaceDetail /></ProtectedPage>} />
          <Route path="/tutor" element={<ProtectedPage><TutorChat /></ProtectedPage>} />
          <Route path="/tutor/voice" element={<ProtectedPage><VoiceTutor /></ProtectedPage>} />
          <Route path="/report" element={<ProtectedPage><Report /></ProtectedPage>} />
          <Route path="/courses" element={<ProtectedPage><Courses /></ProtectedPage>} />
          <Route path="/notes" element={<ProtectedPage><Notes /></ProtectedPage>} />
          <Route path="/quiz" element={<ProtectedPage><QuizLibrary /></ProtectedPage>} />
          <Route path="/quiz/:id" element={<ProtectedPage><QuizPlay /></ProtectedPage>} />
          <Route path="/concept" element={<ProtectedPage><ConceptDemo /></ProtectedPage>} />
          <Route path="/concept/library" element={<ProtectedPage><ConceptLibrary /></ProtectedPage>} />
          {/* 管理员与评委可管理测试；所有登录用户均可进入反馈中心 */}
          <Route path="/tests" element={<RequireAdmin><AppShell><Tests /></AppShell></RequireAdmin>} />
          <Route path="/feedback" element={<ProtectedPage><FeedbackCenter /></ProtectedPage>} />
          <Route path="/guide" element={<ProtectedPage><UserGuide /></ProtectedPage>} />
          <Route path="*" element={<ProtectedPage><NotFound /></ProtectedPage>} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
      <GlobalSiteFiling />
      <JudgeTour />
      <JudgeDemoMode />
      <GlobalTutorBubble />
    </BrowserRouter>
  )
}
