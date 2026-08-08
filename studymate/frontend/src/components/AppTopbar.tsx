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

const PAGE_META: Record<PageId, { label: string; group: string; icon: typeof Home }> = {
  home: { label: "今日学习", group: "学习中心", icon: Home },
  workspace: { label: "学习资源工坊", group: "7 Agents 协作", icon: WandSparkles },
  tutor: { label: "AI 助教", group: "AI 学习工具", icon: Bot },
  profile: { label: "学习画像", group: "学习中心", icon: GraduationCap },
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
}

const PAGE_ACTIONS: Partial<Record<PageId, Array<{ label: string; to: string }>>> = {
  home: [{ label: "岗位空间", to: "/courses" }, { label: "学习工坊", to: "/workspace" }, { label: "学习画像", to: "/profile" }],
  workspace: [{ label: "目标岗位", to: "/courses" }, { label: "沉淀笔记", to: "/notes" }, { label: "验证掌握", to: "/quiz" }, { label: "查看报告", to: "/report" }],
  tutor: [{ label: "实时语音", to: "/tutor/voice" }, { label: "可视讲解", to: "/concept" }, { label: "学习画像", to: "/profile" }],
  profile: [{ label: "选择目标岗位", to: "/courses" }, { label: "开始对话", to: "/tutor" }, { label: "查看报告", to: "/report" }],
  rag: [{ label: "自建知识库", to: "/knowledge" }, { label: "智能笔记", to: "/notes" }, { label: "AI 助教", to: "/tutor" }],
  knowledge: [{ label: "岗位知识库", to: "/rag" }, { label: "上传资料", to: "/knowledge" }, { label: "检索结果", to: "/rag" }],
  ppt: [{ label: "学习工坊", to: "/workspace" }, { label: "岗位知识库", to: "/rag" }, { label: "保存笔记", to: "/notes" }],
  resources: [{ label: "职业探索", to: "/career" }, { label: "岗位空间", to: "/courses" }, { label: "学习报告", to: "/report" }],
  career: [{ label: "学习画像", to: "/profile" }, { label: "学习报告", to: "/report" }, { label: "岗位空间", to: "/courses" }],
  report: [{ label: "继续学习", to: "/workspace" }, { label: "智能测验", to: "/quiz" }, { label: "更新画像", to: "/profile" }],
  courses: [{ label: "建立画像", to: "/profile" }, { label: "生成资源", to: "/workspace" }, { label: "新手指引", to: "/guide" }],
  notes: [{ label: "AI 助教", to: "/tutor" }, { label: "智能测验", to: "/quiz" }, { label: "学习报告", to: "/report" }],
  quiz: [{ label: "岗位空间", to: "/courses" }, { label: "智能笔记", to: "/notes" }, { label: "查看报告", to: "/report" }],
  concept: [{ label: "AI 助教", to: "/tutor" }, { label: "概念库", to: "/concept/library" }, { label: "学习工坊", to: "/workspace" }],
  feedback: [{ label: "新手指引", to: "/guide" }, { label: "返回首页", to: "/" }],
  guide: [{ label: "选择目标岗位", to: "/courses" }, { label: "学习工坊", to: "/workspace" }, { label: "反馈中心", to: "/feedback" }],
  tests: [{ label: "今日学习", to: "/" }, { label: "反馈中心", to: "/feedback" }],
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
  const meta = PAGE_META[current]
  const Icon = meta.icon
  const paper = appearance === "paper"
  const label = labelOverride ?? meta.label
  const group = groupOverride ?? meta.group

  return (
    <header
      className={cn(
        "app-topbar flex flex-col items-stretch gap-0 rounded-2xl px-3 py-2 sm:px-4",
        paper
          ? "border border-[#DCE5F1] bg-white/90 shadow-[0_12px_32px_rgba(41,67,112,.08)] backdrop-blur-xl"
          : "surface-card",
        className,
      )}
      data-page={current}
    >
      <div className="app-topbar-main flex min-h-10 items-center gap-3">
        <span className="app-context-icon grid size-9 shrink-0 -rotate-2 place-items-center rounded-[11px_14px_10px_14px] bg-gradient-to-br from-[#1685F8] via-[#5266EA] to-[#9B5BDD] text-white shadow-[0_9px_20px_rgba(67,92,225,.24)]">
          <Icon className="size-[17px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[.1em] text-[#8A8172]">
            <Sparkles className="size-3 text-[#6A62E8]" />
            {group}
          </div>
          <h1 className="truncate text-[14px] font-bold tracking-[-.025em] text-[#17233D]">{label}</h1>
        </div>
        <Link
          to="/courses"
          className={cn(
            "hidden h-9 max-w-[240px] items-center gap-2 rounded-xl border px-3 text-[11px] font-semibold text-[#596B87] transition-colors hover:bg-[#EFF5FF] sm:flex",
            current === "courses" ? "border-[#B9CEEE] bg-[#EAF2FF] text-[#245DB9]" : "border-[#DCE5F1] bg-[#F8FBFF]",
          )}
          title="查看或切换当前目标岗位"
        >
          <Library className="size-3.5 shrink-0 text-[#3477DA]" />
          <span className="truncate">{selectionLabel ?? course?.name ?? "选择当前岗位"}</span>
        </Link>
        <Link to="/guide" className="app-topbar-help hidden size-9 place-items-center rounded-xl border border-[#DCE5F1] bg-[#F8FBFF] text-[11px] font-extrabold text-[#5272A5] transition-colors hover:bg-[#EFF5FF] sm:grid" aria-label="打开新手指引">?</Link>
      </div>
      <nav className="app-topbar-nav mt-2 flex items-center gap-1 overflow-x-auto border-t border-[#E7EEF7] pt-2" aria-label={`${label}快捷操作`}>
        <span className="mr-1 shrink-0 rounded-full bg-[#EEF4FC] px-2 py-1 text-[9px] font-bold tracking-[.08em] text-[#7590B5]">继续下一步</span>
        {(PAGE_ACTIONS[current] || []).map((action) => <Link key={`${action.to}-${action.label}`} to={action.to} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[#627593] transition-colors hover:bg-[#EFF5FF] hover:text-[#2865C4]">{action.label}</Link>)}
      </nav>
    </header>
  )
}
