import { Component, lazy, Suspense, useEffect, type ReactNode } from "react"
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom"
import { RequireAuth, RequireAdmin } from "@/components/guards"
import { JudgeTour } from "@/components/JudgeTour"
import { SiteFiling } from "@/components/SiteFiling"
import { useCurrentUser } from "@/store/user"

// 页面按路由拆包：首屏只下载当前页面，图表、PDF、编辑器等重依赖不再一次性阻塞启动。
const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })))
const ProfileChat = lazy(() => import("@/pages/ProfileChat").then((m) => ({ default: m.ProfileChat })))
const RagDemo = lazy(() => import("@/pages/RagDemo").then((m) => ({ default: m.RagDemo })))
const RagSource = lazy(() => import("@/pages/RagSource").then((m) => ({ default: m.RagSource })))
const Workspace = lazy(() => import("@/pages/Workspace").then((m) => ({ default: m.Workspace })))
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
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })))
const NotFound = lazy(() => import("@/pages/NotFound").then((m) => ({ default: m.NotFound })))
const TutorBubble = lazy(() => import("@/components/TutorBubble").then((m) => ({ default: m.TutorBubble })))

// 登录页和助教自身页面不重复显示；其余业务页都可随时呼出学习助手。
const BUBBLE_HIDDEN_PATHS = ["/login", "/tutor", "/tutor/voice"]

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [pathname])
  return null
}

function GlobalTutorBubble() {
  const location = useLocation()
  const user = useCurrentUser()
  if (!user) return null
  const hidden = BUBBLE_HIDDEN_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  )
  if (hidden) return null
  return <Suspense fallback={null}><TutorBubble /></Suspense>
}

function GlobalSiteFiling() {
  const { pathname } = useLocation()
  if (pathname === "/tutor/voice") return null
  return <SiteFiling />
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
          <p className="mt-4 text-[10px] font-bold tracking-[0.12em] text-[#9A4E35]">页面资源加载中断</p>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#18232D]">当前学习记录仍然安全</h1>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#66717B]">可能是网络短暂波动或页面资源更新。重新加载即可继续，工作台生成结果与答题证据不会被清空。</p>
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
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfileChat /></RequireAuth>} />
          <Route path="/rag" element={<RequireAuth><RagDemo /></RequireAuth>} />
          <Route path="/rag/source/:chunkId" element={<RequireAuth><RagSource /></RequireAuth>} />
          <Route path="/workspace" element={<RequireAuth><Workspace /></RequireAuth>} />
          <Route path="/workspace/r/:agentId" element={<RequireAuth><WorkspaceDetail /></RequireAuth>} />
          <Route path="/tutor" element={<RequireAuth><TutorChat /></RequireAuth>} />
          <Route path="/tutor/voice" element={<RequireAuth><VoiceTutor /></RequireAuth>} />
          <Route path="/report" element={<RequireAuth><Report /></RequireAuth>} />
          <Route path="/courses" element={<RequireAuth><Courses /></RequireAuth>} />
          <Route path="/notes" element={<RequireAuth><Notes /></RequireAuth>} />
          <Route path="/quiz" element={<RequireAuth><QuizLibrary /></RequireAuth>} />
          <Route path="/quiz/:id" element={<RequireAuth><QuizPlay /></RequireAuth>} />
          <Route path="/concept" element={<RequireAuth><ConceptDemo /></RequireAuth>} />
          <Route path="/concept/library" element={<RequireAuth><ConceptLibrary /></RequireAuth>} />
          {/* 管理员与评委可管理测试；所有登录用户均可进入反馈中心 */}
          <Route path="/tests" element={<RequireAdmin><Tests /></RequireAdmin>} />
          <Route path="/feedback" element={<RequireAuth><FeedbackCenter /></RequireAuth>} />
          <Route path="/guide" element={<RequireAuth><UserGuide /></RequireAuth>} />
          <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
      <GlobalSiteFiling />
      <JudgeTour />
      <GlobalTutorBubble />
    </BrowserRouter>
  )
}
