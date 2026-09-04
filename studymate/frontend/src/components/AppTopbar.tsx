import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import {
  Award,
  BarChart3,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  Code2,
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

import "./AppTopbar.css"

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
  | "learnerReport"
  | "capabilityProfile"
  | "tests"
  | "courses"
  | "notes"
  | "feedback"
  | "quiz"
  | "concept"
  | "guide"
  | "interview"
  | "oj"
  | "honor"

const PAGE_META: Record<PageId, { label: string; group: string; icon: typeof Home }> = {
  home: { label: "今日学习", group: "学习中心", icon: Home },
  workspace: { label: "训练资源", group: "岗位训练中心", icon: WandSparkles },
  tutor: { label: "AI 助教", group: "AI 学习工具", icon: Bot },
  profile: { label: "学情画像构建", group: "岗位对标设置", icon: GraduationCap },
  capabilityProfile: { label: "岗位能力画像", group: "个人中心", icon: GraduationCap },
  rag: { label: "岗位知识库", group: "知识与笔记", icon: Database },
  knowledge: { label: "自建知识库", group: "知识与笔记", icon: Database },
  ppt: { label: "PPT 生成", group: "AI 学习工具", icon: Presentation },
  resources: { label: "学习资源", group: "发现与拓展", icon: Compass },
  career: { label: "转岗培训", group: "发现与拓展", icon: GraduationCap },
  report: { label: "实时学习报告", group: "个人中心", icon: BarChart3 },
  learnerReport: { label: "个人学情与资源匹配度报告", group: "个人中心", icon: BarChart3 },
  tests: { label: "测试管理", group: "辅助入口", icon: ClipboardCheck },
  courses: { label: "岗位空间", group: "求职准备", icon: Library },
  notes: { label: "智能笔记", group: "知识与笔记", icon: NotebookPen },
  feedback: { label: "反馈中心", group: "辅助入口", icon: MessageSquare },
  quiz: { label: "智能测验", group: "练习与成长", icon: BookOpenCheck },
  concept: { label: "可视讲解", group: "AI 学习工具", icon: Orbit },
  guide: { label: "新手指引", group: "辅助入口", icon: Compass },
  interview: { label: "AI 面试", group: "求职准备", icon: MessageSquare },
  oj: { label: "机考备战中心", group: "求职备战中心", icon: Code2 },
  honor: { label: "我的荣誉墙", group: "个人中心", icon: Award },
}

const PAGE_ICON_TONES: Record<PageId, { accent: string; soft: string }> = {
  home: { accent: "#167fa9", soft: "#d9f2fb" },
  workspace: { accent: "#4e62c8", soft: "#e7e8ff" },
  tutor: { accent: "#168aa7", soft: "#d9f5f5" },
  profile: { accent: "#376dcb", soft: "#e2ecff" },
  rag: { accent: "#157a70", soft: "#dcf3ed" },
  knowledge: { accent: "#256da3", soft: "#deeffb" },
  ppt: { accent: "#a65d32", soft: "#fae7da" },
  resources: { accent: "#397ab6", soft: "#e0f1fb" },
  career: { accent: "#5c64bd", soft: "#e9e7ff" },
  report: { accent: "#167ba9", soft: "#dff3fb" },
  learnerReport: { accent: "#2972c0", soft: "#e2edff" },
  capabilityProfile: { accent: "#4564c4", soft: "#e8e9ff" },
  tests: { accent: "#9a6332", soft: "#f7ead9" },
  courses: { accent: "#2774a4", soft: "#def2f8" },
  notes: { accent: "#7455bd", soft: "#eee6ff" },
  feedback: { accent: "#39776d", soft: "#e2f2ec" },
  quiz: { accent: "#266bc4", soft: "#e0ecff" },
  concept: { accent: "#6458bd", soft: "#ebe7ff" },
  guide: { accent: "#2d7893", soft: "#dff2f5" },
  interview: { accent: "#985270", soft: "#f7e4ee" },
  oj: { accent: "#345e9f", soft: "#e2eaff" },
  honor: { accent: "#a16f24", soft: "#faedcf" },
}

interface AppTopbarProps {
  current?: PageId
  className?: string
  appearance?: "default" | "paper"
  labelOverride?: string
  groupOverride?: string
  selectionLabel?: string
  statusLabel?: string
  iconImage?: string
  showRocketFormation?: boolean
  rocketCount?: number
  rocketVariant?: "default" | "honor"
}

export function AppTopbar({
  current = "home",
  className,
  appearance = "default",
  labelOverride,
  groupOverride,
  selectionLabel,
  statusLabel,
  iconImage,
  showRocketFormation = false,
  rocketCount,
  rocketVariant = "default",
}: AppTopbarProps) {
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const user = useCurrentUser()
  const meta = PAGE_META[current]
  const Icon = meta.icon
  const paper = appearance === "paper"
  const label = labelOverride ?? meta.label
  const group = groupOverride ?? meta.group
  const iconTone = PAGE_ICON_TONES[current]
  const resolvedRocketCount = rocketCount ?? (rocketVariant === "honor" ? 5 : 3)
  const roleSelectionPath = user?.role === "admin" ? "/admin" : current === "workspace" ? "/courses?returnTo=%2Fworkspace" : "/courses"
  return (
    <header
      className={cn(
        "app-topbar relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl px-3 py-2 sm:px-4",
        paper
          ? "border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_8px_24px_rgba(24,35,45,.055)]"
          : "surface-card",
        className,
      )}
    >
      {showRocketFormation && <span className={cn("app-topbar-rocket-formation", rocketVariant === "honor" && "app-topbar-honor-rockets")} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${resolvedRocketCount}, minmax(0, 1fr))` }}>{Array.from({ length: resolvedRocketCount }, (_, index) => <i key={index}><img src="/images/training-launch-rocket-cutout-v2.png" alt="" /></i>)}</span>}
      <span
        className={cn("app-topbar-symbol grid size-10 shrink-0 place-items-center", iconImage ? "app-topbar-real-icon size-12" : "app-topbar-symbol-fallback")}
        data-page-icon={current}
        style={!iconImage ? { "--app-topbar-icon-accent": iconTone.accent, "--app-topbar-icon-soft": iconTone.soft } as CSSProperties : undefined}
      >
        {iconImage ? <img src={iconImage} alt="" aria-hidden="true" /> : <Icon className="size-[17px]" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[.1em] text-[#8A8172]">
          <Sparkles className="size-3 text-[#B1842C]" />
          {group}
        </div>
        <h1 className="truncate text-[14px] font-bold tracking-[-.02em] text-[#18232D]">{label}</h1>
        {statusLabel && <p className="app-topbar-status mt-0.5 truncate text-[10px] font-semibold text-[#315E83]">{statusLabel}</p>}
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
        <span className="truncate">{selectionLabel ?? ((user?.learner_type === "worker" && user.target_role) || targetRole?.name || course?.name || "选择当前岗位")}</span>
      </Link>
    </header>
  )
}
