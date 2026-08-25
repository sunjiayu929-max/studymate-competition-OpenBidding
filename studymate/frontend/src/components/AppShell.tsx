import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  BarChart3,
  BookOpenCheck,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Compass,
  Database,
  GraduationCap,
  Headphones,
  Home,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  NotebookPen,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  PlayCircle,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { apiPost } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { isShowcaseCourse } from "@/store/course"
import { ShowcaseCourseGuard } from "@/components/ShowcaseCourseGuard"
import { useWorkspaceStore } from "@/store/workspace"
import { isPrivilegedRole, logoutUser, useCurrentUser } from "@/store/user"
import { discardPendingEventsForLogout } from "@/lib/track"
import { JUDGE_DEMO_EVENT } from "@/components/JudgeDemoMode"

const SIDEBAR_KEY = "sm:app-shell:collapsed"
const GROUP_KEY = "sm:app-shell:groups"
const SHOWCASE_BLOCKED_PATHS = [
  "/workspace", "/competency", "/tutor", "/rag", "/knowledge", "/ppt",
  "/resources", "/report", "/quiz", "/concept", "/career", "/notes",
]

type NavItem = {
  label: string
  to: string
  icon: typeof Home
  exact?: boolean
  external?: boolean
}

const GROUPS: Array<{ id: string; label: string; icon: typeof Home; items: NavItem[] }> = [
  {
    id: "ai",
    label: "AI 学习工具",
    icon: Bot,
    items: [
      { label: "AI 助教", to: "/tutor", icon: Bot, exact: true },
      { label: "实时语音", to: "/tutor/voice", icon: Headphones },
      { label: "可视讲解", to: "/concept", icon: Orbit },
      { label: "PPT 生成", to: "/ppt", icon: Presentation },
    ],
  },
  {
    id: "knowledge",
    label: "知识与笔记",
    icon: Database,
    items: [
      { label: "岗位知识库", to: "/rag", icon: Library },
      { label: "自建知识库", to: "/knowledge", icon: Database },
      { label: "智能笔记", to: "/notes", icon: NotebookPen },
    ],
  },
  {
    id: "growth",
    label: "练习与成长",
    icon: BarChart3,
    items: [
      { label: "智能测验", to: "/quiz", icon: BookOpenCheck },
      { label: "实时学习报告", to: "/report", icon: BarChart3 },
      { label: "在线判题", to: "/api/oj/entry", icon: Code2, external: true },
    ],
  },
  {
    id: "discover",
    label: "职业发展",
    icon: Compass,
    items: [
      { label: "学习资源", to: "/resources", icon: Compass },
      { label: "职业探索", to: "/career", icon: GraduationCap },
      { label: "AI 面试", to: "/ai-interview", icon: MessageSquare },
    ],
  },
]

function matches(pathname: string, item: NavItem) {
  if (item.external) return false
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1"
  } catch {
    return false
  }
}

function readGroups(): Record<string, boolean> {
  try {
    const value = localStorage.getItem(GROUP_KEY)
    return value ? JSON.parse(value) as Record<string, boolean> : {}
  } catch {
    return {}
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const showcaseCourse = isShowcaseCourse(course)
  const workspace = useWorkspaceStore()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [homeUniverseVisible, setHomeUniverseVisible] = useState(pathname === "/")
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readGroups)

  const immersive = pathname === "/tutor/voice" || /^\/quiz\/[^/]+$/u.test(pathname)
  const shellHidden = pathname === "/" && homeUniverseVisible
  const effectiveCollapsed = collapsed || immersive
  const showcaseBlocked = showcaseCourse && SHOWCASE_BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  const currentGroup = useMemo(
    () => GROUPS.find((group) => group.items.some((item) => matches(pathname, item)))?.id,
    [pathname],
  )

  useEffect(() => {
    if (currentGroup) {
      setOpenGroups((current) => current[currentGroup] ? current : { ...current, [currentGroup]: true })
    }
    setMobileOpen(false)
  }, [currentGroup, pathname])

  useEffect(() => {
    if (pathname !== "/") {
      setHomeUniverseVisible(false)
      return
    }
    setHomeUniverseVisible(true)
    const onVisibility = (event: Event) => {
      setHomeUniverseVisible(Boolean((event as CustomEvent<{ visible?: boolean }>).detail?.visible))
    }
    window.addEventListener("studymate:home-universe-visibility", onVisibility)
    return () => window.removeEventListener("studymate:home-universe-visibility", onVisibility)
  }, [pathname])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0")
      localStorage.setItem(GROUP_KEY, JSON.stringify(openGroups))
    } catch {
      /* storage is optional */
    }
  }, [collapsed, openGroups])

  const handleLogout = async () => {
    setLogoutBusy(true)
    discardPendingEventsForLogout()
    try {
      // Hydro owns a separate /oj-scoped browser session. Clear it before the
      // StudyMate session so one browser logout signs out of both services.
      await fetch("/oj/integrations/studymate/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined)
      await apiPost("/auth/logout", {})
    } finally {
      logoutUser()
      setLogoutBusy(false)
      navigate("/login", { replace: true })
    }
  }

  const toggleGroup = (id: string) => {
    if (effectiveCollapsed) {
      setCollapsed(false)
      setOpenGroups((current) => ({ ...current, [id]: true }))
      return
    }
    setOpenGroups((current) => ({ ...current, [id]: !current[id] }))
  }

  const readyResources = [
    workspace.outputs.doc?.content,
    workspace.outputs.guide?.content,
    workspace.outputs.quiz?.items?.length,
    workspace.outputs.mindmap?.content,
    workspace.outputs.reading?.items?.length,
    workspace.outputs.code?.code,
  ].filter(Boolean).length

  return (
    <div className={cn("app-shell-workspace min-h-dvh", shellHidden && "app-shell-universe")}>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed left-3 top-3 z-[72] grid size-10 place-items-center rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] text-[#244C66] shadow-md lg:hidden",
          shellHidden && "border-white/15 bg-[#101722]/75 text-white backdrop-blur",
        )}
        aria-label="打开应用导航"
      >
        <Menu className="size-4.5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[73] bg-[#18232D]/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭应用导航"
        />
      )}

      <aside
        className={cn(
          "app-shell-navigation fixed inset-y-0 left-0 z-[74] flex flex-col border-r border-[#D7D1C4]/55 transition-[width,transform,opacity] duration-300",
          effectiveCollapsed ? "w-[72px]" : "w-[240px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          shellHidden && !mobileOpen && "lg:pointer-events-none lg:-translate-x-full lg:opacity-0",
        )}
        aria-label="StudyMate 应用导航"
      >
        <div className="flex h-[70px] shrink-0 items-center gap-3 border-b border-[#DED8CC] px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="StudyMate 今日学习">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#244C66] text-[#F0D6A4] shadow-[0_8px_18px_rgba(36,76,102,.18)]"><Sparkles className="size-[18px]" /></span>
            {!effectiveCollapsed && <span className="min-w-0"><strong className="block text-base tracking-[-.03em] text-[#18232D]">StudyMate</strong><small className="block truncate text-[10px] font-bold tracking-[.12em] text-[#8A8172]">LEARNING OS</small></span>}
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="grid size-8 place-items-center rounded-lg text-[#66717B] hover:bg-[#ECE8DE] lg:hidden" aria-label="关闭导航"><X className="size-4" /></button>
        </div>

        <div className="shrink-0 px-3 pt-3">
          <Link
            to="/courses"
            title={targetRole?.name || course?.name || "选择当前岗位"}
            className={cn(
              "flex items-center rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_5px_14px_rgba(24,35,45,.045)] transition-colors hover:bg-[#F7F2E7]",
              effectiveCollapsed ? "h-11 justify-center" : "gap-2.5 px-3 py-2.5",
            )}
          >
            <Library className="size-4 shrink-0 text-[#315E83]" />
            {!effectiveCollapsed && <span className="min-w-0"><small className="block text-[10px] font-bold tracking-[.08em] text-[#8A8172]">当前岗位</small><strong className="mt-0.5 block truncate text-xs text-[#18232D]">{targetRole?.name || course?.name || "选择目标岗位"}</strong></span>}
          </Link>
        </div>

        <nav className="nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="主功能">
          <ShellLink item={{ label: "今日学习", to: "/", icon: Home, exact: true }} compact={effectiveCollapsed} pathname={pathname} />
          <ShellLink item={{ label: "目标岗位", to: "/courses", icon: Library }} compact={effectiveCollapsed} pathname={pathname} />
          <ShellLink item={{ label: "岗位能力画像", to: "/profile", icon: GraduationCap }} compact={effectiveCollapsed} pathname={pathname} />
          <ShellLink
            item={{ label: "岗位训练中心", to: "/competency", icon: ShieldCheck, exact: true }}
            compact={effectiveCollapsed}
            pathname={pathname}
            trailing={!effectiveCollapsed ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#F4ECD8] px-1.5 py-0.5 text-[9px] font-extrabold text-[#8E6925]">
                {workspace.status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-[#B1842C]" />}
                {workspace.status === "running" ? `${readyResources}/6` : "14 Agents"}
              </span>
            ) : undefined}
          />

          <div className="my-3 border-t border-[#DED8CC]" />

          {GROUPS.map((group) => {
            const active = group.id === currentGroup
            const opened = Boolean(openGroups[group.id])
            const GroupIcon = group.icon
            return (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "flex h-10 w-full items-center rounded-xl text-xs font-bold tracking-[.02em] text-[#727A7E] transition-colors hover:bg-[#ECE8DE] hover:text-[#244C66]",
                    effectiveCollapsed ? "justify-center" : "gap-2 px-2.5",
                    active && "text-[#244C66]",
                  )}
                  title={group.label}
                  aria-expanded={opened}
                >
                  <GroupIcon className="size-3.5 shrink-0" />
                  {!effectiveCollapsed && <><span>{group.label}</span><ChevronDown className={cn("ml-auto size-3.5 transition-transform", opened && "rotate-180")} /></>}
                </button>
                {!effectiveCollapsed && opened && (
                  <div className="mt-0.5 space-y-0.5 border-l border-[#D7D1C4] pl-2.5">
                    {group.items.map((item) => <ShellLink key={`${item.to}-${item.label}`} item={item} compact={false} pathname={pathname} />)}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="shrink-0 border-t border-[#DED8CC] p-3">
          <ShellLink item={{ label: "新手指引", to: "/guide", icon: Compass }} compact={effectiveCollapsed} pathname={pathname} />
          {isPrivilegedRole(user?.role) && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(JUDGE_DEMO_EVENT))}
              className={cn(
                "mb-0.5 flex h-10 w-full items-center rounded-xl text-xs font-semibold text-[#8E6925] transition-colors hover:bg-[#F4ECD8]",
                effectiveCollapsed ? "justify-center" : "gap-2.5 px-2.5",
              )}
              title="开启独立评委演示"
            >
              <PlayCircle className="size-4 shrink-0" />
              {!effectiveCollapsed && <><span>评委演示</span><span className="ml-auto rounded-full border border-[#D9CFB7] px-1.5 py-0.5 text-[8px]">3–5 分钟</span></>}
            </button>
          )}
          <ShellLink item={{ label: "反馈中心", to: "/feedback", icon: MessageSquare }} compact={effectiveCollapsed} pathname={pathname} />
          {isPrivilegedRole(user?.role) && <ShellLink item={{ label: "测试管理", to: "/tests", icon: ClipboardCheck }} compact={effectiveCollapsed} pathname={pathname} />}
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={cn("mt-1 flex h-10 w-full items-center rounded-xl text-xs font-semibold text-[#7A6257] hover:bg-[#F4E8E2] hover:text-[#9A4E35]", effectiveCollapsed ? "justify-center" : "gap-2.5 px-2.5")}
            title="退出登录"
          >
            <LogOut className="size-4 shrink-0" />
            {!effectiveCollapsed && <span className="min-w-0 truncate">{user?.name || "退出登录"}</span>}
          </button>
          {!immersive && (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className={cn("mt-auto hidden h-9 w-full items-center rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] text-[11px] font-bold text-[#66717B] hover:bg-[#ECE8DE] lg:flex", effectiveCollapsed ? "justify-center" : "gap-2 px-2.5")}
              aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /><span>折叠导航</span><ChevronLeft className="ml-auto size-3.5" /></>}
            </button>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "app-shell-content min-h-dvh transition-[padding] duration-300",
          effectiveCollapsed ? "lg:pl-[72px]" : "lg:pl-[240px]",
          shellHidden && "lg:pl-0",
        )}
      >
        {showcaseBlocked ? <ShowcaseCourseGuard /> : children}
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="确认退出 StudyMate？"
        description="当前账号会安全退出；待上报行为队列会先停止，已保存的目标岗位、笔记与训练进度不会丢失。"
        confirmLabel="退出登录"
        busy={logoutBusy}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => { void handleLogout() }}
      />
    </div>
  )
}

function ShellLink({
  item,
  compact,
  pathname,
  trailing,
}: {
  item: NavItem
  compact: boolean
  pathname: string
  trailing?: ReactNode
}) {
  const Icon = item.icon
  const active = matches(pathname, item)
  const className = cn(
    "group relative mb-0.5 flex h-11 items-center rounded-xl text-xs font-semibold transition-colors",
    compact ? "justify-center" : "gap-2.5 px-2.5",
    active ? "bg-[#E7EDF3] text-[#244C66]" : "text-[#59636B] hover:bg-[#ECE8DE] hover:text-[#244C66]",
  )
  const content = <>
      {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-[#315E83]" />}
      <Icon className="size-4 shrink-0" />
      {!compact && <span className="truncate">{item.label}</span>}
      {trailing}
      {!compact && !trailing && active && <ChevronRight className="ml-auto size-3.5" />}
  </>
  if (item.external) {
    return <a href={item.to} title={item.label} className={className}>{content}</a>
  }
  return <Link to={item.to} title={item.label} aria-current={active ? "page" : undefined} className={className}>{content}</Link>
}
