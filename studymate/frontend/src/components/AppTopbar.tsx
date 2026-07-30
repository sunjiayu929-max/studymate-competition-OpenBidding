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
  rag: { label: "RAG 检索测试", group: "知识库", icon: Database },
  knowledge: { label: "知识库", group: "知识与笔记", icon: Database },
  ppt: { label: "PPT 生成", group: "AI 学习工具", icon: Presentation },
  resources: { label: "学习资源", group: "发现与拓展", icon: Compass },
  career: { label: "职业探索", group: "发现与拓展", icon: GraduationCap },
  report: { label: "实时学习报告", group: "练习与成长", icon: BarChart3 },
  tests: { label: "测试管理", group: "辅助入口", icon: ClipboardCheck },
  courses: { label: "课程空间", group: "学习中心", icon: Library },
  notes: { label: "智能笔记", group: "知识与笔记", icon: NotebookPen },
  feedback: { label: "反馈中心", group: "辅助入口", icon: MessageSquare },
  quiz: { label: "智能测验", group: "练习与成长", icon: BookOpenCheck },
  concept: { label: "可视讲解", group: "AI 学习工具", icon: Orbit },
  guide: { label: "新手指引", group: "辅助入口", icon: Compass },
}

interface AppTopbarProps {
  current?: PageId
  className?: string
  appearance?: "default" | "paper"
}

export function AppTopbar({ current = "home", className, appearance = "default" }: AppTopbarProps) {
  const course = useCurrentCourse()
  const meta = PAGE_META[current]
  const Icon = meta.icon
  const paper = appearance === "paper"

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
          {meta.group}
        </div>
        <h1 className="truncate text-[14px] font-bold tracking-[-.02em] text-[#18232D]">{meta.label}</h1>
      </div>
      <Link
        to="/courses"
        className={cn(
          "hidden h-9 max-w-[240px] items-center gap-2 rounded-xl border px-3 text-[11px] font-semibold text-[#59636B] transition-colors hover:bg-[#F7F2E7] sm:flex",
          current === "courses" ? "border-[#9FB1BC] bg-[#E7EDF3] text-[#244C66]" : "border-[#D7D1C4] bg-[#FAF8F2]",
        )}
        title="切换当前课程"
      >
        <Library className="size-3.5 shrink-0 text-[#315E83]" />
        <span className="truncate">{course?.name || "选择当前课程"}</span>
      </Link>
    </header>
  )
}
