import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  Compass,
  Database,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  MessageCircleMore,
  MessageSquare,
  NotebookPen,
  Route,
  Sparkles,
} from "lucide-react"

import { apiPost } from "@/lib/api"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { cn } from "@/lib/utils"
import { useCurrentCourse } from "@/store/course"
import { isPrivilegedRole, logoutUser, useCurrentUser } from "@/store/user"

export type PageId = "home" | "workspace" | "tutor" | "profile" | "rag" | "report" | "tests" | "courses" | "notes" | "feedback" | "quiz" | "concept" | "guide"

const NAV = [
  { id: "home" as PageId, to: "/", label: "今日学习", icon: Route },
  { id: "profile" as PageId, to: "/profile", label: "学习画像", icon: GraduationCap },
  { id: "workspace" as PageId, to: "/workspace", label: "智能生成", icon: LayoutDashboard },
  { id: "tutor" as PageId, to: "/tutor", label: "AI 助教", icon: MessageCircleMore },
  { id: "notes" as PageId, to: "/notes", label: "笔记", icon: NotebookPen },
  { id: "quiz" as PageId, to: "/quiz", label: "测验", icon: BookOpenCheck },
  { id: "concept" as PageId, to: "/concept", label: "可视讲解", icon: Sparkles },
  { id: "report" as PageId, to: "/report", label: "学习报告", icon: BarChart3 },
  { id: "rag" as PageId, to: "/rag", label: "RAG 检索", icon: Database },
]

interface AppTopbarProps {
  current?: PageId
  className?: string
  appearance?: "default" | "paper"
}

export function AppTopbar({ current, className, appearance = "default" }: AppTopbarProps) {
  const course = useCurrentCourse()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const canManage = isPrivilegedRole(user?.role)
  const isPaper = appearance === "paper"
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)

  const handleLogout = async () => {
    setLogoutBusy(true)
    try {
      await apiPost("/auth/logout", {})
    } finally {
      logoutUser()
      setLogoutBusy(false)
      navigate("/login", { replace: true })
    }
  }

  return (
    <>
    <div className={cn(
      "app-topbar flex min-h-16 flex-wrap items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:px-4 lg:gap-1.5 lg:py-2",
      isPaper
        ? "border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_8px_24px_rgba(24,35,45,.065)]"
        : "surface-card",
      className,
    )}>
      <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="返回 StudyMate 首页">
        <span className={cn(
          "grid size-9 place-items-center rounded-xl transition-transform group-hover:-rotate-3 group-hover:scale-105",
          isPaper
            ? "bg-[#244C66] text-[#F0D6A4] shadow-[0_7px_16px_rgba(36,76,102,.18)]"
            : "brand-gradient text-white shadow-[0_8px_20px_rgba(36,76,102,.2)]",
        )}>
          <Sparkles className="size-[18px]" />
        </span>
        <span className="app-topbar-brand-name hidden text-[15px] font-bold tracking-[-0.03em] text-[var(--foreground)] sm:block">StudyMate</span>
      </Link>

      <div className="app-topbar-divider mx-1 hidden h-6 w-px bg-[var(--border)]" />

      <nav className="app-topbar-nav nav-scroll order-last flex w-full min-w-0 basis-full items-center gap-1 overflow-x-auto border-t border-[var(--border)]/70 pt-2 lg:pt-1.5" aria-label="主导航">
        {NAV.map(({ id, to, label, icon: Icon }) => (
          <Link
            key={id}
            to={to}
            aria-current={current === id ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-[var(--muted-foreground)] transition-all duration-200 hover:-translate-y-px hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] min-[1360px]:px-2 min-[1360px]:text-[12px] min-[1536px]:px-2.5 min-[1536px]:text-[13px]",
              current === id && "bg-[var(--brand-soft)] text-[var(--primary)] shadow-[inset_0_-2px_0_rgba(49,94,131,.34)]"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Link
          to="/courses"
          className={cn(
            "hidden h-9 max-w-48 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors hover:border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] hover:bg-[var(--accent)] md:flex min-[1360px]:px-2.5 min-[1360px]:text-[11px] min-[1536px]:px-3 min-[1536px]:text-xs",
            current === "courses" ? "border-[var(--primary)]/25 bg-[var(--brand-soft)] text-[var(--primary)]" : "bg-[var(--card)] text-[var(--muted-foreground)]"
          )}
          title="切换课程"
        >
          <Library className="size-3.5 shrink-0" />
          <span className="truncate">{course?.name || "选择课程"}</span>
        </Link>

        <div className="flex items-center gap-1.5" aria-label="快捷功能">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("studymate:getting-started-open"))}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] px-2.5 text-[11px] font-bold text-[#315E83] transition-all hover:-translate-y-px hover:bg-[#DBE6EE] sm:px-3 sm:text-xs min-[1360px]:px-2.5 min-[1360px]:text-[11px] min-[1536px]:px-3 min-[1536px]:text-xs",
              current === "guide" && "border-[#315E83] bg-[#DBE6EE]",
            )}
            title="打开新手指引"
            aria-label="打开新手指引"
          >
            <Compass className="size-3.5" />
            <span className="hidden sm:inline">新手指引</span>
          </button>
          {canManage && (
            <Link
              to="/tests"
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#D8C9A8] bg-[#F7F2E7] px-2.5 text-[11px] font-bold text-[#8E6925] transition-colors hover:bg-[#F1E7D2] sm:px-3 sm:text-xs min-[1360px]:px-2.5 min-[1360px]:text-[11px] min-[1536px]:px-3 min-[1536px]:text-xs",
                current === "tests" && "border-[#B1842C] bg-[#F1E7D2]",
              )}
            >
              <ClipboardCheck className="size-3.5" />
              <span className="sm:hidden">测试</span><span className="hidden sm:inline">测试管理</span>
            </Link>
          )}
          <Link
            to="/feedback"
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] px-2.5 text-[11px] font-bold text-[#9A4E35] transition-colors hover:bg-[#F1E1D9] sm:px-3 sm:text-xs min-[1360px]:px-2.5 min-[1360px]:text-[11px] min-[1536px]:px-3 min-[1536px]:text-xs",
              current === "feedback" && "border-[#B85C3E] bg-[#F1E1D9]",
            )}
          >
            <MessageSquare className="size-3.5" />
            <span className="sm:hidden">反馈</span><span className="hidden sm:inline">反馈中心</span>
          </Link>
        </div>

        <button type="button" onClick={() => setLogoutOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted-foreground)] transition-colors hover:bg-[#F6ECE7] hover:text-[#A65339]" title="退出登录" aria-label="退出登录">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
      <ConfirmDialog
        open={logoutOpen}
        title="确认退出 StudyMate？"
        description="当前账号会安全退出；已保存的课程、笔记与学习进度不会丢失。"
        confirmLabel="退出登录"
        busy={logoutBusy}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => { void handleLogout() }}
      />
    </>
  )
}
