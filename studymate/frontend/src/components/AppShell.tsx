import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Award,
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
  UsersRound,
  UserRound,
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

import "./AppShell.css"

const SIDEBAR_KEY = "sm:app-shell:collapsed"
const GROUP_KEY = "sm:app-shell:groups"
const DEFAULT_OPEN_GROUPS: Record<string, boolean> = {
  personalCenter: true,
  roleAlignment: true,
  learningLoop: true,
  jobPreparation: true,
}
const SHOWCASE_BLOCKED_PATHS = [
  "/workspace", "/competency", "/tutor", "/rag", "/knowledge", "/ppt",
  "/resources", "/report", "/learner-report", "/quiz", "/concept", "/career", "/notes",
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
    id: "personalCenter",
    label: "个人中心",
    icon: UserRound,
    items: [
      { label: "岗位能力画像", to: "/capability-profile", icon: GraduationCap },
      { label: "个人学情与资源匹配度报告", to: "/learner-report", icon: BarChart3 },
      { label: "实时学习报告", to: "/report", icon: BarChart3 },
      { label: "我的荣誉墙", to: "/honors", icon: Award },
    ],
  },
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
    ],
  },
  {
    id: "jobPreparation",
    label: "求职备战中心",
    icon: ClipboardCheck,
    items: [
      { label: "机考备战中心", to: "/oj-center", icon: Code2 },
      { label: "面试备战中心", to: "/ai-interview", icon: MessageSquare },
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

function matches(pathname: string, item: NavItem, search = ""): boolean {
  if (item.children) return item.children.some((child) => matches(pathname, child, search))
  if (item.external) return false
  if (!item.to) return false
  const [itemPath, itemQuery] = item.to.split("?", 2)
  const pathMatches = item.exact
    ? pathname === itemPath
    : pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  if (!pathMatches) return false
  if (itemQuery) return search === `?${itemQuery}`
  return !item.exact || search === ""
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
  const { pathname, search } = useLocation()
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
  const [homeUniverseVisible, setHomeUniverseVisible] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readGroups)
  const [enterpriseMember, setEnterpriseMember] = useState<boolean | null>(null)

  const enterpriseAdmin = user?.role === "enterprise_admin"
  const systemAdmin = user?.role === "admin"
  const enterpriseVisible = user?.role !== "admin" && (enterpriseAdmin || enterpriseMember === true)
  const learnerIdentity = enterpriseAdmin
    ? { kind: "企业管理员", detail: user?.company || "企业工作台" }
    : user?.learner_type === "worker"
      ? { kind: "从业者", detail: user.company || "未填写在职公司" }
      : { kind: "学生学习者", detail: user?.study_stage || "未填写学习阶段" }
  const learnerTargetRole = user?.target_role || targetRole?.name || course?.name || "未选择目标岗位"

  const immersive = /^\/quiz\/[^/]+$/u.test(pathname)
  const shellHidden = pathname === "/" && homeUniverseVisible
  const effectiveCollapsed = collapsed || immersive
  const showcaseBlocked = showcaseCourse && SHOWCASE_BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  const currentGroup = useMemo(
    () => GROUPS.find((group) => group.items.some((item) => matches(pathname, item, search)))?.id,
    [pathname, search],
  )
  const currentNestedGroup = useMemo(() => {
    for (const group of GROUPS) {
      const nestedItem = group.items.find((item) => item.children?.some((child) => matches(pathname, child, search)))
      if (nestedItem) return `${group.id}:${nestedItem.label}`
    }
    return undefined
  }, [pathname, search])

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
    // Current home no longer renders the immersive universe, so keep the shared
    // navigation visible. A future home experience can still override this via
    // the visibility event below.
    setHomeUniverseVisible(false)
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
            "flex h-10 w-full items-center rounded-xl text-xs font-bold tracking-[.02em] text-[#657783] transition-colors hover:bg-[#E5F1F8] hover:text-[#1F5578]",
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
          <div className="mt-0.5 space-y-0.5 border-l border-[#CDDFEB] pl-2.5">
            {group.items.map((item) => {
              if (!item.children) {
                const trainingStatus = item.to === "/competency" ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#C7DEEC] bg-[#EAF5FB] px-1.5 py-0.5 text-[9px] font-extrabold text-[#316785]">
                    {workspace.status === "running" && <span className="size-1.5 animate-pulse rounded-full bg-[#38A4D8]" />}
                    {workspace.status === "running" ? `${readyResources}/6` : "8 Agents"}
                  </span>
                ) : undefined
                return <ShellLink key={`${item.to}-${item.label}`} item={item} compact={false} pathname={pathname} search={search} trailing={trainingStatus} />
              }
              const nestedId = `${group.id}:${item.label}`
              const nestedOpen = Boolean(openGroups[nestedId])
              const nestedActive = matches(pathname, item, search)
              const ItemIcon = item.icon
              return (
                <div key={nestedId}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((current) => ({ ...current, [nestedId]: !current[nestedId] }))}
                    className={cn(
                      "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs font-semibold text-[#596C76] transition-colors hover:bg-[#E5F1F8] hover:text-[#1F5578]",
                      nestedActive && "text-[#244C66]",
                    )}
                    aria-expanded={nestedOpen}
                  >
                    <ItemIcon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                    <ChevronDown className={cn("ml-auto size-3.5 transition-transform", nestedOpen && "rotate-180")} />
                  </button>
                  {nestedOpen && (
                    <div className="ml-3 border-l border-[#CDDFEB] pl-2">
                      {item.children.map((child) => <ShellLink key={`${child.to}-${child.label}`} item={child} compact={false} pathname={pathname} search={search} />)}
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
    <div className={cn("app-shell-workspace min-h-dvh", effectiveCollapsed && "is-navigation-collapsed", shellHidden && "app-shell-universe")}>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed left-3 top-3 z-[72] grid size-10 place-items-center rounded-xl border border-[#C8DCE9] bg-white text-[#244C66] shadow-md lg:hidden",
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
          "app-shell-navigation fixed inset-y-0 left-0 z-[74] flex flex-col border-r border-[#B8D3E1]/80 transition-[width,transform,opacity] duration-300",
          effectiveCollapsed ? "w-[72px]" : "w-[240px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          shellHidden && !mobileOpen && "lg:pointer-events-none lg:-translate-x-full lg:opacity-0",
        )}
        aria-label="因材智训应用导航"
      >
        <div className="flex h-[70px] shrink-0 items-center gap-3 border-b border-[#D5E4ED] px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="因材智训今日学习">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#244C66] text-[#F0D6A4] shadow-[0_8px_18px_rgba(36,76,102,.18)]"><Sparkles className="size-[18px]" /></span>
            {!effectiveCollapsed && <span className="min-w-0"><strong className="block text-base tracking-[-.03em] text-[#18232D]">因材智训</strong><small className="block truncate text-[10px] font-bold tracking-[.12em] text-[#6F8492]">LEARNING OS</small></span>}
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="grid size-8 place-items-center rounded-lg text-[#667985] hover:bg-[#E5F1F8] lg:hidden" aria-label="关闭导航"><X className="size-4" /></button>
        </div>

        <div className="shrink-0 px-3 pt-3">
          <Link
            to={systemAdmin ? "/admin" : enterpriseAdmin ? "/enterprise/dashboard" : "/courses"}
            title={systemAdmin ? "系统管理工作台" : enterpriseAdmin ? user?.company || "企业管理工作台" : learnerTargetRole}
            className={cn(
              "app-shell-profile-card flex items-center rounded-2xl border transition-colors",
              effectiveCollapsed ? "app-shell-profile-card-collapsed h-11 justify-center" : "gap-2.5 px-3 py-2.5",
            )}
          >
            {systemAdmin ? <span className="app-shell-profile-mark is-admin"><ShieldCheck className="size-4" /></span> : enterpriseAdmin ? <span className="app-shell-profile-mark is-enterprise"><BriefcaseBusiness className="size-4" /></span> : <span className="app-shell-profile-mark"><UserRound className="size-4" /></span>}
            {!effectiveCollapsed && (
              <span className="app-shell-profile-copy">
                <small className="app-shell-profile-kicker">{systemAdmin ? "系统管理" : enterpriseAdmin ? "企业管理员" : learnerIdentity.kind}</small>
                <strong>{systemAdmin ? "平台运营工作台" : enterpriseAdmin ? (user?.name || "企业管理员") : (user?.name || "学习者")}</strong>
                <span className="app-shell-profile-meta">{systemAdmin ? "全局配置与运行监控" : enterpriseAdmin ? (user?.company || "河南本线商贸有限公司") : learnerIdentity.detail}</span>
                {!systemAdmin && !enterpriseAdmin && <span className="app-shell-profile-target"><Library className="size-3" />{learnerTargetRole}</span>}
              </span>
            )}
            {!effectiveCollapsed && <ChevronRight className="app-shell-profile-arrow size-3.5 shrink-0" />}
          </Link>
          {!enterpriseAdmin && !systemAdmin && (
            <div className="mt-2">
              <ShellLink item={{ label: "新手指引", to: "/guide", icon: Compass }} compact={effectiveCollapsed} pathname={pathname} />
            </div>
          )}
          {!enterpriseAdmin && !effectiveCollapsed && user && enterpriseVisible && (
            <Link to="/enterprise" className="mt-2 block rounded-2xl border border-[#DCE5D7] bg-[#F5FAF3] px-3 py-2.5 transition-colors hover:bg-[#EAF4E7]">
              <span className="flex items-center gap-2 text-[10px] font-bold text-[#52704D]"><BriefcaseBusiness className="size-3.5" />企业任务中心<ChevronRight className="ml-auto size-3" /></span>
              <span className="mt-1 block truncate text-[10px] text-[#758372]">查看企业下发的学习任务</span>
            </Link>
          )}
        </div>

        <nav className="nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="主功能">
          {systemAdmin ? <>
            <div className="mb-1 px-2.5 text-[9px] font-extrabold tracking-[.14em] text-[#2F6F95]">系统管理</div>
            <ShellLink item={{ label: "平台总览", to: "/admin", icon: ShieldCheck, exact: true }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "企业管理", to: "/admin?view=enterprises", icon: BriefcaseBusiness }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "用户与成员", to: "/admin?view=users", icon: UsersRound }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "内容与运行", to: "/admin?view=content", icon: Database }} compact={effectiveCollapsed} pathname={pathname} search={search} />
          </> : enterpriseAdmin ? <>
            <div className="mb-1 px-2.5 text-[9px] font-extrabold tracking-[.14em] text-[#52704D]">企业工作台</div>
            <ShellLink item={{ label: "运营看板", to: "/enterprise/dashboard", icon: BarChart3, exact: true }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "任务发布", to: "/enterprise?view=tasks", icon: ClipboardCheck }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "岗位知识库", to: "/enterprise?view=knowledge", icon: Library }} compact={effectiveCollapsed} pathname={pathname} search={search} />
            <ShellLink item={{ label: "成员加入", to: "/enterprise?view=members", icon: UsersRound }} compact={effectiveCollapsed} pathname={pathname} search={search} />
          </> : <>
          {GROUPS.slice(0, 3).map(renderGroup)}
          <ShellLink item={{ label: "转岗培训", to: "/career", icon: GraduationCap }} compact={effectiveCollapsed} pathname={pathname} />
          {GROUPS.slice(3, 4).map(renderGroup)}
          <ShellLink item={{ label: "AI 助教", to: "/tutor", icon: Bot }} compact={effectiveCollapsed} pathname={pathname} />
          {GROUPS.slice(4).map(renderGroup)}
          {enterpriseVisible && <ShellLink item={{ label: enterpriseAdmin ? "企业工作台" : "企业任务", to: "/enterprise", icon: BriefcaseBusiness }} compact={effectiveCollapsed} pathname={pathname} />}
          <ShellLink item={{ label: "反馈中心", to: "/feedback", icon: MessageSquare }} compact={effectiveCollapsed} pathname={pathname} />
          </>}
        </nav>

        <div className="shrink-0 border-t border-[#D5E4ED] bg-white/25 p-3">
          {!systemAdmin && isPrivilegedRole(user?.role) && (
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
          {!systemAdmin && isPrivilegedRole(user?.role) && <ShellLink item={{ label: "测试管理", to: "/tests", icon: ClipboardCheck }} compact={effectiveCollapsed} pathname={pathname} />}
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
              className={cn("mt-auto hidden h-9 w-full items-center rounded-xl border border-[#C9DCE8] bg-white/75 text-[11px] font-bold text-[#607583] hover:bg-[#E5F1F8] lg:flex", effectiveCollapsed ? "justify-center" : "gap-2 px-2.5")}
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
        title="确认退出因材智训？"
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
  search = "",
  trailing,
}: {
  item: NavItem
  compact: boolean
  pathname: string
  search?: string
  trailing?: ReactNode
}) {
  if (!item.to) return null
  const Icon = item.icon
  const active = matches(pathname, item, search)
  const className = cn(
    "group relative mb-0.5 flex h-11 items-center rounded-xl border text-xs font-semibold transition-[color,background-color,border-color,box-shadow]",
    compact ? "justify-center" : "gap-2.5 px-2.5",
    active
      ? "border-[#8FC5DF] bg-[linear-gradient(90deg,#CBE6F4_0%,#DDF0F7_100%)] text-[#123F5F] shadow-[0_5px_14px_rgba(41,107,145,.13),inset_0_1px_0_rgba(255,255,255,.72)]"
      : "border-transparent text-[#566A77] hover:border-[#C5DCE7] hover:bg-[#DDECF3]/80 hover:text-[#1F5578]",
  )
  const content = <>
      {active && <span className="absolute -left-3 h-7 w-1.5 rounded-r-full bg-gradient-to-b from-[#17628F] to-[#35A9D2] shadow-[0_0_12px_rgba(38,145,190,.52)]" />}
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
