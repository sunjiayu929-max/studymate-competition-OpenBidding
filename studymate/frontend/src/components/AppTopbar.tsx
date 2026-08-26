import { Link } from "react-router-dom"
import {
  BarChart3,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  Compass,
  Database,
  GraduationCap,
  Home,
  Library,
  MessageSquare,
  NotebookPen,
  Orbit,
  Presentation,
  Sparkles,
  WandSparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useCurrentUser } from "@/store/user"

export type PageId =
  | "home"
  | "workspace"
  | "tutor"
  | "profile"
  | "rag"
  | "knowledge"
  | "ppt"
  | "resources"
  | "career"
  | "report"
  | "tests"
  | "courses"
  | "notes"
  | "feedback"
  | "quiz"
  | "concept"
  | "guide"
  | "interview"

const PAGE_META: Record<PageId, { label: string; group: string; icon: typeof Home }> = {
  home: { label: "今日学习", group: "学习中心", icon: Home },
  workspace: { label: "训练资源", group: "岗位训练中心", icon: WandSparkles },
  tutor: { label: "AI 助教", group: "AI 学习工具", icon: Bot },
  profile: { label: "岗位能力画像", group: "学习中心", icon: GraduationCap },
  rag: { label: "岗位知识库", group: "知识与笔记", icon: Database },
  knowledge: { label: "自建知识库", group: "知识与笔记", icon: Database },
  ppt: { label: "PPT 生成", group: "AI 学习工具", icon: Presentation },
  resources: { label: "学习资源", group: "发现与拓展", icon: Compass },
  career: { label: "职业探索", group: "发现与拓展", icon: GraduationCap },
  report: { label: "实时学习报告", group: "练习与成长", icon: BarChart3 },
  tests: { label: "测试管理", group: "辅助入口", icon: ClipboardCheck },
  courses: { label: "岗位空间", group: "求职准备", icon: Library },
  notes: { label: "智能笔记", group: "知识与笔记", icon: NotebookPen },
  feedback: { label: "反馈中心", group: "辅助入口", icon: MessageSquare },
  quiz: { label: "智能测验", group: "练习与成长", icon: BookOpenCheck },
  concept: { label: "可视讲解", group: "AI 学习工具", icon: Orbit },
  guide: { label: "新手指引", group: "辅助入口", icon: Compass },
  interview: { label: "AI 面试", group: "求职准备", icon: MessageSquare },
}

interface AppTopbarProps {
  current?: PageId
  className?: string
  appearance?: "default" | "paper"
  labelOverride?: string
  groupOverride?: string
  selectionLabel?: string
}

export function AppTopbar({
  current = "home",
  className,
  appearance = "default",
  labelOverride,
  groupOverride,
  selectionLabel,
}: AppTopbarProps) {
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const user = useCurrentUser()
  const meta = PAGE_META[current]
  const Icon = meta.icon
  const paper = appearance === "paper"
  const label = labelOverride ?? meta.label
  const group = groupOverride ?? meta.group
  const roleSelectionPath = user?.role === "admin" ? "/admin" : current === "workspace" ? "/courses?returnTo=%2Fworkspace" : "/courses"
  const identityDetail = user?.role === "admin"
    ? `${user.name} · 系统管理员`
    : user?.role === "enterprise_admin"
      ? `${user.name} · 企业管理员`
      : [user?.name, user?.learner_type === "worker" ? user.company || "从业者" : user?.study_stage || "学习者", user?.target_role || targetRole?.name || course?.name].filter(Boolean).join(" · ")

  return (
    <header
      className={cn(
        "app-topbar flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 sm:px-4",
        paper
          ? "border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_8px_24px_rgba(24,35,45,.055)]"
          : "surface-card",
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4] shadow-[0_7px_16px_rgba(36,76,102,.16)]">
        <Icon className="size-[17px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[.1em] text-[#8A8172]">
          <Sparkles className="size-3 text-[#B1842C]" />
          {group}
        </div>
        <h1 className="truncate text-[14px] font-bold tracking-[-.02em] text-[#18232D]">{label}</h1>
        {identityDetail && <p className="mt-0.5 truncate text-[10px] font-medium text-[#7A817E]">{identityDetail}</p>}
      </div>
      <Link
        to={roleSelectionPath}
        className={cn(
          "hidden h-9 max-w-[240px] items-center gap-2 rounded-xl border px-3 text-[11px] font-semibold text-[#59636B] transition-colors hover:bg-[#F7F2E7] sm:flex",
          current === "courses" ? "border-[#9FB1BC] bg-[#E7EDF3] text-[#244C66]" : "border-[#D7D1C4] bg-[#FAF8F2]",
        )}
        title="查看或切换当前目标岗位"
      >
        <Library className="size-3.5 shrink-0 text-[#315E83]" />
        <span className="truncate">{selectionLabel ?? targetRole?.name ?? course?.name ?? "选择当前岗位"}</span>
      </Link>
    </header>
  )
}
