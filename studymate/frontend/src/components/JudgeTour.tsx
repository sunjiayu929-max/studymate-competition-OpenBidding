import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clapperboard,
  Compass,
  Database,
  GraduationCap,
  GripHorizontal,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageCircleMore,
  MessageSquareText,
  Minimize2,
  NotebookPen,
  Sparkles,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { closeTutorBubble, openTutorBubble, useTutorBubble } from "@/store/tutorBubble"
import { useCurrentUser } from "@/store/user"

export const GETTING_STARTED_EVENT = "studymate:getting-started-open"
const LEGACY_JUDGE_TOUR_EVENT = "studymate:judge-tour-open"

type TourAction = "open-assistant"

interface TourStep {
  to: string
  phase: string
  label: string
  title: string
  description: string
  check: string
  evidence: string[]
  time: string
  icon: LucideIcon
  color: string
  wash: string
  action?: TourAction
}

interface DockPosition {
  x: number
  y: number
}

const POSITION_KEY = "sm:getting-started-position"
const ONBOARDING_VERSION = "v1"

const GUIDE_STEPS: TourStep[] = [
  {
    to: "/courses",
    phase: "准备学习环境",
    label: "课程空间",
    title: "先确认课程级知识与学习记录彼此隔离",
    description: "五门课程都有独立知识库、画像上下文和生成记录。课程切换后，检索、助教、笔记、测验和报告会协同切换。",
    check: "选择一门课程，确认顶部当前课程同步变化，并从课程卡片进入学习。",
    evidence: ["5 门固定课程", "课程知识库隔离", "全能力共享上下文"],
    time: "30 秒",
    icon: Library,
    color: "#B1842C",
    wash: "#F4ECD8",
  },
  {
    to: "/",
    phase: "准备学习环境",
    label: "今日学习",
    title: "查看系统如何组织一次真实学习",
    description: "首页把画像、课程、生成、笔记、测验和报告串成一条当日学习航线，而不是简单罗列功能入口。",
    check: "从“今日学习航线”进入任一待办，再返回首页观察任务状态和闭环进度。",
    evidence: ["画像参与路线", "任务有优先级", "完整学习闭环"],
    time: "35 秒",
    icon: Sparkles,
    color: "#355C8A",
    wash: "#E7EDF3",
  },
  {
    to: "/profile",
    phase: "建立个性化依据",
    label: "学习画像",
    title: "通过自然对话建立可持续更新的画像",
    description: "知识基础、认知风格、资源偏好、目标、薄弱点与学习节奏会被提取成结构化画像，并形成可追踪版本。",
    check: "补充一句学习目标或困难，观察右侧画像维度与版本号是否随对话更新。",
    evidence: ["多维画像", "对话式更新", "版本可追踪"],
    time: "50 秒",
    icon: GraduationCap,
    color: "#315E83",
    wash: "#E7EDF3",
  },
  {
    to: "/workspace",
    phase: "生成学习资源",
    label: "智能生成",
    title: "观察七个智能体的真实协作过程",
    description: "系统先检索课程依据，再并行生成六类内容与可视讲解。生成过程、异常、质量检查和最终七类资源都可见。",
    check: "发起一次生成，查看 7 个 Agent 状态；完成后进入任一资源，验证下载、笔记与后续学习入口。",
    evidence: ["7 个 Agent 协作", "先检索后生成", "7 类资源统一归档"],
    time: "90 秒",
    icon: LayoutDashboard,
    color: "#6F8A69",
    wash: "#E8EDE5",
  },
  {
    to: "/rag",
    phase: "验证知识依据",
    label: "RAG 检索",
    title: "验证生成和回答不是无依据结论",
    description: "检索结果保留教材名称、页码、相关片段与原文入口，便于逐条复核内容来源。",
    check: "搜索一个知识点，打开一条“查看原文”，核对教材、页码、命中片段和前后文。",
    evidence: ["1000+ 知识片段", "教材页码可追溯", "混合检索"],
    time: "45 秒",
    icon: Database,
    color: "#3E7774",
    wash: "#E2EEEB",
  },
  {
    to: "/tutor",
    phase: "完成深度学习",
    label: "AI 课程助教",
    title: "体验课程、画像与多轮上下文共同参与的辅导",
    description: "助教会自动参考当前课程和学习画像，支持历史会话、图片与文档，并按照用户理解程度调整讲解。",
    check: "新建一段对话并追问两轮，观察回答是否结合当前课程、目标与薄弱点，而不是通用回复。",
    evidence: ["多轮会话留存", "画像自适应讲解", "图片与文档输入"],
    time: "60 秒",
    icon: MessageCircleMore,
    color: "#B85C3E",
    wash: "#F6ECE7",
  },
  {
    to: "/notes",
    phase: "完成深度学习",
    label: "智能笔记",
    title: "把学习结果沉淀成可继续使用的个人知识库",
    description: "笔记支持文件夹、Markdown 编辑与预览、识图、智能总结、自动出题，并可下载 Markdown 或 PDF。",
    check: "打开一篇笔记切换编辑/预览，确认选项正确换行，再尝试智能总结或下载。",
    evidence: ["Markdown / PDF", "识图与总结", "笔记继续出题"],
    time: "60 秒",
    icon: NotebookPen,
    color: "#5B7C6A",
    wash: "#E8EFE8",
  },
  {
    to: "/quiz",
    phase: "完成深度学习",
    label: "智能测验",
    title: "用真实作答验证是否掌握",
    description: "测验支持选择、填空与代码题；未作答时只逐步引导，作答后才给出答案和讲解。",
    check: "进入一套测验完成一道题；打开代码题全屏编辑器，运行代码并提交答案。",
    evidence: ["多题型", "全屏代码运行", "作答后解析"],
    time: "75 秒",
    icon: BookOpenCheck,
    color: "#B1842C",
    wash: "#F4ECD8",
  },
  {
    to: "/concept",
    phase: "完成深度学习",
    label: "可视讲解",
    title: "把抽象知识转成可操作的动态过程",
    description: "动画库覆盖多门课程，点击知识点会直接进入播放页；用户可逐步播放、调节参数并观察状态变化。",
    check: "从动画库点击一个知识点，确认自动进入播放页，并操作一次播放、暂停或参数调整。",
    evidence: ["课程动画库", "点击即进入播放", "状态与参数可交互"],
    time: "45 秒",
    icon: Clapperboard,
    color: "#7E6B83",
    wash: "#EEE9EF",
  },
  {
    to: "/report",
    phase: "形成学习闭环",
    label: "学习报告",
    title: "查看学习证据如何回写画像与下一步路线",
    description: "报告汇总资源使用、测验结果和画像变化，形成可执行建议；后台生成不会因离开页面而中断。",
    check: "发起报告生成后离开页面，再返回确认任务仍在继续或报告已完成，并查看画像更新依据。",
    evidence: ["后台持续生成", "学习效果评估", "画像形成新版本"],
    time: "60 秒",
    icon: BarChart3,
    color: "#7E6B83",
    wash: "#EEE9EF",
  },
  {
    to: "/",
    phase: "形成学习闭环",
    label: "全局学习助手",
    title: "在任何页面随时获得带上下文的帮助",
    description: "小精灵会感知当前页面、课程与画像，支持新建和保留历史对话；无需离开正在进行的学习任务。",
    check: "导览会自动打开小精灵。向它询问当前页面能做什么，再切换一段历史对话。",
    evidence: ["全页面可用", "感知当前上下文", "会话历史保留"],
    time: "45 秒",
    icon: Bot,
    color: "#315E83",
    wash: "#E7EDF3",
    action: "open-assistant",
  },
  {
    to: "/tests",
    phase: "了解质量保障",
    label: "测试管理",
    title: "了解关键学习能力如何持续保持稳定",
    description: "管理角色可以在这里查看测试任务、执行状态与结果，快速确认核心流程和接口是否正常。",
    check: "查看一条测试记录的输入、状态和结果，了解系统如何验证关键学习链路。",
    evidence: ["测试任务留痕", "结果可复核", "关键链路可验证"],
    time: "45 秒",
    icon: ClipboardCheck,
    color: "#8E6925",
    wash: "#F4ECD8",
  },
  {
    to: "/feedback",
    phase: "获得帮助与反馈",
    label: "反馈中心",
    title: "遇到问题时，把建议直接告诉我们",
    description: "用户可以在学习过程中提交问题和建议，管理角色能够统一查看与跟进，形成产品侧闭环。",
    check: "查看反馈分类与处理状态；遇到问题时提交一条反馈，并在这里跟踪后续进展。",
    evidence: ["用户反馈入口", "状态统一管理", "改进链路闭环"],
    time: "30 秒",
    icon: MessageSquareText,
    color: "#9A4E35",
    wash: "#F6ECE7",
  },
]

function matchesStep(pathname: string, target: string) {
  if (target === "/") return pathname === "/"
  return pathname === target || pathname.startsWith(`${target}/`)
}

function readSavedPosition(): DockPosition | null {
  if (typeof window === "undefined") return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(POSITION_KEY) || "null")
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed
  } catch {
    // Ignore invalid session state.
  }
  return null
}

function defaultPosition(): DockPosition {
  if (typeof window === "undefined") return { x: 24, y: 96 }
  const width = Math.min(420, window.innerWidth - 24)
  return {
    x: Math.max(12, window.innerWidth - width - 20),
    y: Math.max(92, window.innerHeight - 520),
  }
}

export function JudgeTour() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const tutorBubble = useTutorBubble()
  const panelRef = useRef<HTMLElement>(null)
  const checkedFirstVisitFor = useRef<number | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(() => new Set())
  const [position, setPosition] = useState<DockPosition>(() => readSavedPosition() || defaultPosition())

  const enabled = Boolean(user)
  const canManage = user?.role === "judge" || user?.role === "admin"
  const guideSteps = useMemo(
    () => canManage ? GUIDE_STEPS : GUIDE_STEPS.filter((step) => step.to !== "/tests"),
    [canManage],
  )
  const currentStep = guideSteps[Math.min(stepIndex, guideSteps.length - 1)]
  const seenKey = user ? `sm:getting-started-seen:${ONBOARDING_VERSION}:${user.user_id}` : null
  const isCurrentPage = useMemo(() => {
    if (!matchesStep(location.pathname, currentStep.to)) return false
    if (currentStep.action === "open-assistant") return tutorBubble.isOpen
    return true
  }, [currentStep.action, currentStep.to, location.pathname, tutorBubble.isOpen])

  const completedCount = visited.size

  const markOnboardingSeen = useCallback(() => {
    if (!seenKey) return
    try {
      localStorage.setItem(seenKey, "1")
    } catch {
      // The guide still works when browser storage is unavailable.
    }
  }, [seenKey])

  const clampPosition = (next: DockPosition): DockPosition => {
    const rect = panelRef.current?.getBoundingClientRect()
    const width = rect?.width || Math.min(420, window.innerWidth - 24)
    const height = rect?.height || 120
    return {
      x: Math.min(Math.max(12, next.x), Math.max(12, window.innerWidth - width - 12)),
      y: Math.min(Math.max(12, next.y), Math.max(12, window.innerHeight - height - 12)),
    }
  }

  const closeTour = useCallback(() => {
    if (currentStep.action === "open-assistant") closeTutorBubble()
    markOnboardingSeen()
    setOpen(false)
  }, [currentStep.action, markOnboardingSeen])

  const openStep = (index: number) => {
    const bounded = Math.max(0, Math.min(guideSteps.length - 1, index))
    const nextStep = guideSteps[bounded]
    if (currentStep.action === "open-assistant" && nextStep.action !== "open-assistant") {
      closeTutorBubble()
    }
    setVisited((previous) => new Set(previous).add(stepIndex))
    setStepIndex(bounded)
    setShowWelcome(false)
    setShowChecklist(false)
    markOnboardingSeen()
    navigate(nextStep.to)
    if (nextStep.action === "open-assistant") openTutorBubble()
  }

  useEffect(() => {
    if (!enabled) return
    const handleOpen = () => {
      closeTutorBubble()
      setStepIndex(0)
      setMinimized(false)
      setShowChecklist(false)
      setShowWelcome(true)
      setOpen(true)
    }
    window.addEventListener(GETTING_STARTED_EVENT, handleOpen)
    window.addEventListener(LEGACY_JUDGE_TOUR_EVENT, handleOpen)
    return () => {
      window.removeEventListener(GETTING_STARTED_EVENT, handleOpen)
      window.removeEventListener(LEGACY_JUDGE_TOUR_EVENT, handleOpen)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !seenKey || !user || checkedFirstVisitFor.current === user.user_id) return
    checkedFirstVisitFor.current = user.user_id
    try {
      if (localStorage.getItem(seenKey)) return
    } catch {
      // Continue with an in-memory first visit when storage is unavailable.
    }
    const frame = window.requestAnimationFrame(() => {
      setStepIndex(0)
      setMinimized(false)
      setShowChecklist(false)
      setShowWelcome(true)
      setOpen(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [enabled, seenKey, user])

  useEffect(() => {
    if (!open || !isCurrentPage) return
    const frame = window.requestAnimationFrame(() => {
      setVisited((previous) => {
        if (previous.has(stepIndex)) return previous
        return new Set(previous).add(stepIndex)
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isCurrentPage, open, stepIndex])

  useEffect(() => {
    if (!open) return
    const handleResize = () => setPosition((previous) => clampPosition(previous))
    const frame = window.requestAnimationFrame(handleResize)
    window.addEventListener("resize", handleResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", handleResize)
    }
  }, [minimized, open, showChecklist, showWelcome])

  useEffect(() => {
    if (!open) return
    sessionStorage.setItem(POSITION_KEY, JSON.stringify(position))
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showChecklist) setShowChecklist(false)
        else if (!minimized) setMinimized(true)
        else closeTour()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeTour, minimized, open, showChecklist])

  if (!enabled) return null

  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.userSelect = "none"
  }

  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition(clampPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }))
  }

  const onDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    document.body.style.userSelect = ""
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ left: position.x, top: position.y }}
          className={minimized
            ? "fixed z-[90] w-[min(304px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[#BDB5A6] bg-[#FFFEFA] shadow-[0_20px_60px_rgba(24,35,45,.22)]"
            : "fixed z-[90] flex max-h-[calc(100vh-24px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px] border border-[#BDB5A6] bg-[#FFFEFA] shadow-[0_24px_72px_rgba(24,35,45,.24)]"}
          aria-label="新手指引"
        >
          {minimized ? (
            <div
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              className="flex cursor-grab touch-none items-center gap-3 p-2.5 active:cursor-grabbing"
              title="按住拖动新手指引"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]">
                <Compass className="size-4" />
              </span>
              <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left">
                <div className="text-[10px] font-bold tracking-[0.1em] text-[#8E6925]">新手指引 · {completedCount}/{guideSteps.length}</div>
                <div className="mt-0.5 truncate text-xs font-bold text-[#18232D]">{showWelcome ? "从这里开始认识 StudyMate" : `${stepIndex + 1}. ${currentStep.label}`}</div>
              </button>
              <button type="button" onClick={() => setMinimized(false)} className="grid size-8 place-items-center rounded-lg border border-[#D7D1C4] text-[#315E83] hover:bg-[#E7EDF3]" aria-label="展开新手指引"><ListChecks className="size-4" /></button>
              <button type="button" onClick={closeTour} className="grid size-8 place-items-center rounded-lg text-[#7A817F] hover:bg-[#F1EDE4] hover:text-[#18232D]" aria-label="关闭新手指引"><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <div
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className="flex cursor-grab touch-none items-center gap-2 border-b border-[#E3DED3] bg-[#F8F6F0] px-3 py-2.5 active:cursor-grabbing"
                title="按住拖动新手指引"
              >
                <GripHorizontal className="size-4 shrink-0 text-[#9A9488]" />
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]">
                  <Compass className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#18232D]">新手指引</span>
                    <span className="rounded-full bg-[#E8EDE5] px-2 py-0.5 text-[9px] font-bold text-[#5D7658]">约 3 分钟上手</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#737C80]">拖动到任意位置 · Esc 最小化</div>
                </div>
                <button type="button" onClick={() => { setShowWelcome(false); setShowChecklist((value) => !value) }} className="grid size-8 place-items-center rounded-lg border border-[#D7D1C4] bg-white text-[#315E83] hover:bg-[#E7EDF3]" aria-label="查看完整功能清单" title="完整功能清单"><ListChecks className="size-4" /></button>
                <button type="button" onClick={() => setMinimized(true)} className="grid size-8 place-items-center rounded-lg text-[#7A817F] hover:bg-[#ECE8DE] hover:text-[#18232D]" aria-label="最小化新手指引"><Minimize2 className="size-4" /></button>
                <button type="button" onClick={closeTour} className="grid size-8 place-items-center rounded-lg text-[#7A817F] hover:bg-[#ECE8DE] hover:text-[#18232D]" aria-label="关闭新手指引"><X className="size-4" /></button>
              </div>

              {!showWelcome && <div className="flex gap-1.5 px-3 pt-3" aria-label={`已体验 ${completedCount} / ${guideSteps.length} 项`}>
                {guideSteps.map((step, index) => (
                  <button
                    key={`${step.to}-${step.label}`}
                    type="button"
                    onClick={() => openStep(index)}
                    title={`${index + 1}. ${step.label}`}
                    aria-label={`跳转到第 ${index + 1} 步：${step.label}`}
                    className="h-1.5 min-w-0 flex-1 rounded-full transition-all hover:h-2"
                    style={{
                      backgroundColor: index === stepIndex
                        ? currentStep.color
                        : visited.has(index) ? "#6F8A69" : "#DDD8CD",
                    }}
                  />
                ))}
              </div>}

              {showWelcome ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="rounded-[18px] border border-[#D8C9A8] bg-[#FBF7ED] p-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">
                      <Sparkles className="size-3.5" /> 第一次来 StudyMate？
                    </div>
                    <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D]">先完成一次最短学习闭环</h2>
                    <p className="mt-1.5 text-[12px] leading-5 text-[#66717B]">不用一次看懂所有功能。跟着下面三步走一遍，你就知道它如何真正帮助学习。</p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {[
                      ["01", "选择课程", "确定知识库与学习上下文"],
                      ["02", "生成一套资源", "让 7 个智能体协作完成学习材料"],
                      ["03", "测验并查看报告", "用结果更新画像与下一步路线"],
                    ].map(([index, title, detail]) => (
                      <div key={index} className="flex items-center gap-3 rounded-xl border border-[#E3DED3] bg-white px-3 py-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#E7EDF3] text-[10px] font-black text-[#315E83]">{index}</span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold text-[#18232D]">{title}</span>
                          <span className="mt-0.5 block text-[10px] leading-4 text-[#737C80]">{detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => openStep(0)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#244C66] px-4 text-xs font-bold text-[#FFFEFA] transition-colors hover:bg-[#193B50]">
                    开始 3 分钟新手指引 <ArrowRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      markOnboardingSeen()
                      setOpen(false)
                      navigate("/guide")
                    }}
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#C9C2B4] bg-[#F8F6F0] px-4 text-[11px] font-bold text-[#315E83] transition-colors hover:bg-[#EEE9DF]"
                  >
                    查看完整使用手册 <BookOpenCheck className="size-3.5" />
                  </button>
                  <button type="button" onClick={closeTour} className="mt-2 h-8 w-full text-[10px] font-semibold text-[#7A817F] hover:text-[#18232D]">暂时跳过，之后可从顶部“新手指引”打开</button>
                </div>
              ) : showChecklist ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[#18232D]">完整能力清单</div>
                      <p className="mt-0.5 text-[10px] text-[#737C80]">按顺序体验，或直接跳到现在需要的功能。</p>
                    </div>
                    <span className="text-[10px] font-bold text-[#5D7658]">已体验 {completedCount}/{guideSteps.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {guideSteps.map((step, index) => {
                      const StepIcon = step.icon
                      const active = index === stepIndex
                      return (
                        <button
                          key={`${step.to}-${step.label}-list`}
                          type="button"
                          onClick={() => openStep(index)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? "border-[#9FB4C2] bg-[#E7EDF3]" : "border-[#E3DED3] bg-white hover:bg-[#F8F6F0]"}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ color: step.color, backgroundColor: step.wash }}><StepIcon className="size-3.5" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[9px] font-bold tracking-[0.08em] text-[#8A8174]">{step.phase}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-bold text-[#18232D]">{index + 1}. {step.label}</span>
                          </span>
                          <span className="text-[9px] font-semibold text-[#7A817F]">{step.time}</span>
                          <span className={`grid size-5 place-items-center rounded-full ${visited.has(index) ? "bg-[#6F8A69] text-white" : "border border-[#D7D1C4] text-transparent"}`}><Check className="size-3" /></span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ color: currentStep.color, backgroundColor: currentStep.wash }}>
                      <currentStep.icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] font-bold tracking-[0.1em] text-[#8A8174]">{currentStep.phase}</span>
                        <span className="text-[9px] font-bold" style={{ color: currentStep.color }}>第 {stepIndex + 1}/{guideSteps.length} 项 · {currentStep.time}</span>
                        {isCurrentPage && <span className="inline-flex items-center gap-1 rounded-full bg-[#E9EEE6] px-1.5 py-0.5 text-[9px] font-bold text-[#557052]"><CheckCircle2 className="size-2.5" />已到达</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold" style={{ color: currentStep.color }}>{currentStep.label}</div>
                    </div>
                  </div>

                  <h2 className="mt-3 text-[16px] font-bold leading-6 tracking-[-0.02em] text-[#18232D]">{currentStep.title}</h2>
                  <p className="mt-1.5 text-[12px] leading-5 text-[#66717B]">{currentStep.description}</p>

                  <div className="mt-3 rounded-xl border border-[#D8C9A8] bg-[#FBF7ED] p-3">
                    <div className="text-[9px] font-bold tracking-[0.12em] text-[#8E6925]">推荐你这样体验</div>
                    <p className="mt-1 text-[11px] font-medium leading-[18px] text-[#3D4850]">{currentStep.check}</p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {currentStep.evidence.map((item) => <span key={item} className="rounded-full border border-[#D7D1C4] bg-[#F8F6F0] px-2 py-1 text-[9px] font-semibold text-[#59636B]">{item}</span>)}
                  </div>
                </div>
              )}

              {!showWelcome && <div className="flex items-center gap-2 border-t border-[#E3DED3] bg-[#FFFEFA] p-3">
                <button type="button" onClick={() => openStep(stepIndex - 1)} disabled={stepIndex === 0} className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D7D1C4] text-[#59636B] hover:bg-[#F1EDE4] disabled:opacity-35" aria-label="上一步"><ArrowLeft className="size-4" /></button>
                {!isCurrentPage && (
                  <button type="button" onClick={() => openStep(stepIndex)} className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#C9C2B4] bg-[#F8F6F0] px-3 text-[11px] font-bold text-[#244C66] hover:bg-[#EEE9DF]">打开这个功能 <ArrowRight className="size-3.5" /></button>
                )}
                {stepIndex < guideSteps.length - 1 ? (
                  <button type="button" onClick={() => openStep(stepIndex + 1)} className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50] ${isCurrentPage ? "flex-1" : "shrink-0"}`}>下一步 <ArrowRight className="size-3.5" /></button>
                ) : (
                  <button type="button" onClick={closeTour} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#6F8A69] px-3.5 text-[11px] font-bold text-white hover:bg-[#5D7658]"><CheckCircle2 className="size-3.5" />完成新手指引</button>
                )}
              </div>}
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
