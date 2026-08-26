import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
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
import { apiGet, apiPost } from "@/lib/api"
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
const DEFAULT_OPEN_GROUPS: Record<string, boolean> = {
  roleAlignment: true,
  learningLoop: true,
  jobPreparation: true,
}
const SHOWCASE_BLOCKED_PATHS = [
  "/workspace", "/competency", "/tutor", "/rag", "/knowledge", "/ppt",
  "/resources", "/report", "/quiz", "/concept", "/career", "/notes",
]

type NavItem = {
  label: string
  to?: string
  icon: typeof Home
  exact?: boolean
  external?: boolean
  children?: NavItem[]
}

const GROUPS: Array<{ id: string; label: string; icon: typeof Home; items: NavItem[] }> = [
  {
    id: "roleAlignment",
    label: "岗位对标设置",
    icon: BriefcaseBusiness,
    items: [
      { label: "目标岗位", to: "/courses", icon: Library },
      { label: "学情画像构建", to: "/profile", icon: GraduationCap },
    ],
  },
  {
    id: "learningLoop",
    label: "核心学习闭环",
    icon: ShieldCheck,
    items: [
      { label: "岗位训练中心", to: "/competency", icon: ShieldCheck },
      { label: "智能测验", to: "/quiz", icon: BookOpenCheck },
      { label: "智能笔记", to: "/notes", icon: NotebookPen },
      { label: "实时学习报告", to: "/report", icon: BarChart3 },
    ],
  },
  {
    id: "jobPreparation",
    label: "求职备战中心",
    icon: ClipboardCheck,
    items: [
      { label: "机考备战中心", to: "/api/oj/entry", icon: Code2, external: true },
      { label: "面试备战中心", to: "/ai-interview", icon: MessageSquare },
    ],
  },
  {
    id: "qaTools",
    label: "智能答疑工具",
    icon: Bot,
    items: [
      { label: "AI 助教", to: "/tutor", icon: Bot, exact: true },
      { label: "实时语音", to: "/tutor/voice", icon: Headphones },
    ],
  },
  {
    id: "contentTools",
    label: "资源与内容工具",
    icon: Database,
    items: [
      {
        label: "知识库",
        icon: Database,
        children: [
          { label: "岗位知识库", to: "/rag", icon: Library },
          { label: "自建知识库", to: "/knowledge", icon: Database },
        ],
      },
      { label: "学习资源", to: "/resources", icon: Compass },
      { label: "PPT 生成", to: "/ppt", icon: Presentation },
      { label: "可视讲解", to: "/concept", icon: Orbit },
    ],
  },
]

function matches(pathname: string, item: NavItem): boolean {
  if (item.children) return item.children.some((child) => matches(pathname, child))
  if (item.external) return false
  if (!item.to) return false
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
    return value
      ? { ...DEFAULT_OPEN_GROUPS, ...JSON.parse(value) as Record<string, boolean> }
      : DEFAULT_OPEN_GROUPS
  } catch {
    return DEFAULT_OPEN_GROUPS
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
  const [enterpriseMember, setEnterpriseMember] = useState<boolean | null>(null)

  const enterpriseAdmin = user?.role === "enterprise_admin"
  const enterpriseVisible = user?.role !== "admin" && (enterpriseAdmin || enterpriseMember === true)
  const learnerIdentity = enterpriseAdmin
    ? { kind: "企业管理员", detail: user?.company || "企业工作台" }
    : user?.learner_type === "worker"
      ? { kind: "从业者", detail: user.company || "未填写在职公司" }
      : { kind: "学生学习者", detail: user?.study_stage || "未填写学习阶段" }
  const learnerTargetRole = user?.target_role || targetRole?.name || course?.name || "未选择目标岗位"

  const immersive = pathname === "/tutor/voice" || /^\/quiz\/[^/]+$/u.test(pathname)
  const shellHidden = pathname === "/" && homeUniverseVisible
  const effectiveCollapsed = collapsed || immersive
  const showcaseBlocked = showcaseCourse && SHOWCASE_BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  const currentGroup = useMemo(
    () => GROUPS.find((group) => group.items.some((item) => matches(pathname, item)))?.id,
    [pathname],
  )
  const currentNestedGroup = useMemo(() => {
    for (const group of GROUPS) {
      const nestedItem = group.items.find((item) => item.children?.some((child) => matches(pathname, child)))
      if (nestedItem) return `${group.id}:${nestedItem.label}`
    }
    return undefined
  }, [pathname])

  useEffect(() => {
    if (currentGroup || currentNestedGroup) {
      setOpenGroups((current) => ({
        ...current,
        ...(currentGroup ? { [currentGroup]: true } : {}),
        ...(currentNestedGroup ? { [currentNestedGroup]: true } : {}),
      }))
    }
    setMobileOpen(false)
  }, [currentGroup, currentNestedGroup, pathname])

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

  useEffect(() => {
    if (!user?.user_id) {
      setEnterpriseMember(null)
      return
    }
    if (enterpriseAdmin || user.role === "admin") {
      setEnterpriseMember(true)
      return
    }
    setEnterpriseMember(null)
    void apiGet<{ enterprise: unknown | null }>("/learner/context")
      .then((context) => setEnterpriseMember(Boolean(context.enterprise)))
      .catch(() => setEnterpriseMember(false))
  }, [enterpriseAdmin, user?.role, user?.user_id])

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

  const renderGroup = (group: (typeof GROUPS)[number]) => {
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
            {group.items.map((item) => {
              if (!item.children) {
                const trainingStatus = item.to === "/competency" ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#F4ECD8] px-1.5 py-0.5 text-[9px] font-extrabold text-[#8E6925]">
                    {workspace.status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-[#B1842C]" />}
                    {workspace.status === "running" ? `${readyResources}/6` : "14 Agents"}
                  </span>
                ) : undefined
                return <ShellLink key={`${item.to}-${item.label}`} item={item} compact={false} pathname={pathname} trailing={trainingStatus} />
              }
              const nestedId = `${group.id}:${item.label}`
              const nestedOpen = Boolean(openGroups[nestedId])
              const nestedActive = matches(pathname, item)
              const ItemIcon = item.icon
              return (
                <div key={nestedId}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((current) => ({ ...current, [nestedId]: !current[nestedId] }))}
                    className={cn(
                      "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs font-semibold text-[#59636B] transition-colors hover:bg-[#ECE8DE] hover:text-[#244C66]",
                      nestedActive && "text-[#244C66]",
                    )}
                    aria-expanded={nestedOpen}
                  >
                    <ItemIcon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                    <ChevronDown className={cn("ml-auto size-3.5 transition-transform", nestedOpen && "rotate-180")} />
                  </button>
                  {nestedOpen && (
                    <div className="ml-3 border-l border-[#D7D1C4] pl-2">
                      {item.children.map((child) => <ShellLink key={`${child.to}-${child.label}`} item={child} compact={false} pathname={pathname} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
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
            to={user?.role === "admin" ? "/admin" : "/courses"}
            title={user?.role === "admin" ? "系统管理工作台" : targetRole?.name || course?.name || "选择当前岗位"}
            className={cn(
              "flex items-center rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_5px_14px_rgba(24,35,45,.045)] transition-colors hover:bg-[#F7F2E7]",
              effectiveCollapsed ? "h-11 justify-center" : "gap-2.5 px-3 py-2.5",
            )}
          >
            {user?.role === "admin" ? <ShieldCheck className="size-4 shrink-0 text-[#9A4E35]" /> : <Library className="size-4 shrink-0 text-[#315E83]" />}
            {!effectiveCollapsed && (user?.role === "admin"
              ? <span className="min-w-0"><small className="block text-[10px] font-bold tracking-[.08em] text-[#8A8172]">系统管理</small><strong className="mt-0.5 block truncate text-xs text-[#18232D]">平台运营工作台</strong></span>
              : <span className="min-w-0"><small className="block text-[10px] font-bold tracking-[.08em] text-[#8A8172]">{learnerIdentity.kind}</small><strong className="mt-0.5 block truncate text-xs text-[#18232D]">{user?.name || "学习者"}</strong><span className="mt-1 block truncate text-[10px] text-[#66717B]">{learnerIdentity.detail} · {learnerTargetRole}</span></span>)}
          </Link>
          <div className="mt-2">
            <ShellLink item={{ label: "新手指引", to: "/guide", icon: Compass }} compact={effectiveCollapsed} pathname={pathname} />
          </div>
          {!effectiveCollapsed && user && enterpriseVisible && (
            <Link to="/enterprise" className="mt-2 block rounded-2xl border border-[#DCE5D7] bg-[#F5FAF3] px-3 py-2.5 transition-colors hover:bg-[#EAF4E7]">
              <span className="flex items-center gap-2 text-[10px] font-bold text-[#52704D]"><BriefcaseBusiness className="size-3.5" />{enterpriseAdmin ? "企业管理员工作台" : "企业任务中心"}<ChevronRight className="ml-auto size-3" /></span>
              <span className="mt-1 block truncate text-[10px] text-[#758372]">{enterpriseAdmin ? "发布任务 · 管理岗位资料" : "查看企业下发的学习任务"}</span>
            </Link>
          )}
        </div>

        <nav className="nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="主功能">
          {user?.role === "admin" && <>
            <div className="mb-1 px-2.5 text-[9px] font-extrabold tracking-[.14em] text-[#9A4E35]">系统管理</div>
            <ShellLink item={{ label: "系统总览", to: "/admin", icon: ShieldCheck, exact: true }} compact={effectiveCollapsed} pathname={pathname} />
            <div className="mb-3 grid grid-cols-3 gap-1 px-1">
              <Link to="/admin?view=enterprises" className="rounded-lg bg-[#F4E8E2] px-1.5 py-1.5 text-center text-[9px] font-bold text-[#9A4E35]">企业</Link>
              <Link to="/admin?view=users" className="rounded-lg bg-[#E7EDF3] px-1.5 py-1.5 text-center text-[9px] font-bold text-[#315E83]">用户</Link>
              <Link to="/admin?view=content" className="rounded-lg bg-[#EAF4E7] px-1.5 py-1.5 text-center text-[9px] font-bold text-[#52704D]">运行</Link>
            </div>
            <div className="my-3 border-t border-[#DED8CC]" />
          </>}
          <ShellLink item={{ label: "今日学习", to: "/", icon: Home, exact: true }} compact={effectiveCollapsed} pathname={pathname} />
          {GROUPS.slice(0, 3).map(renderGroup)}
          <ShellLink item={{ label: "转岗培训", to: "/career", icon: GraduationCap }} compact={effectiveCollapsed} pathname={pathname} />
          {GROUPS.slice(3).map(renderGroup)}
          {enterpriseVisible && <ShellLink item={{ label: enterpriseAdmin ? "企业工作台" : "企业任务", to: "/enterprise", icon: BriefcaseBusiness }} compact={effectiveCollapsed} pathname={pathname} />}
          <ShellLink item={{ label: "反馈中心", to: "/feedback", icon: MessageSquare }} compact={effectiveCollapsed} pathname={pathname} />
        </nav>

        <div className="shrink-0 border-t border-[#DED8CC] p-3">
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
  if (!item.to) return null
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
