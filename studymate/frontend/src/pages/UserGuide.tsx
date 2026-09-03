import { Link } from "react-router-dom"
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clapperboard,
  Compass,
  Database,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageCircleMore,
  MessageSquareText,
  NotebookPen,
  Route,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useTrackPage } from "@/lib/useTrackPage"
import { isPrivilegedRole, useCurrentUser } from "@/store/user"
import { openTutorBubble } from "@/store/tutorBubble"

interface GuideLink {
  title: string
  detail: string
  to: string
  action: string
  icon: LucideIcon
  tone: string
  iconTone: string
}

const FIRST_ROUTE: GuideLink[] = [
  { title: "选择目标岗位", detail: "确定领域、岗位知识库与训练上下文", to: "/courses", action: "选择岗位", icon: Library, tone: "border-[#D8C9A8] bg-[#FBF7ED]", iconTone: "bg-[#F4ECD8] text-[#8E6925]" },
  { title: "让系统认识你", detail: "用对话补充目标与薄弱点", to: "/profile", action: "建立画像", icon: GraduationCap, tone: "border-[#C7D2D8] bg-[#F3F7F9]", iconTone: "bg-[#E7EDF3] text-[#315E83]" },
  { title: "运行岗位训练闭环", detail: "14 个协作节点完成诊断、协商、生成、审核、裁决与反馈", to: "/competency", action: "开始训练", icon: LayoutDashboard, tone: "border-[#CCD7C9] bg-[#F4F7F2]", iconTone: "bg-[#E8EDE5] text-[#5D7658]" },
  { title: "做一次真实测验", detail: "用作答结果检验掌握程度", to: "/quiz", action: "进入测验", icon: BookOpenCheck, tone: "border-[#DFC9BE] bg-[#FBF5F1]", iconTone: "bg-[#F6ECE7] text-[#9A4E35]" },
  { title: "查看学习报告", detail: "获得建议并更新下一步路线", to: "/report", action: "查看报告", icon: BarChart3, tone: "border-[#D7CDD9] bg-[#F8F5F8]", iconTone: "bg-[#EEE9EF] text-[#7E6B83]" },
]

const GOAL_LINKS: GuideLink[] = [
  { title: "我想快速攻克一个岗位能力点", detail: "让岗位助教结合当前岗位与画像连续讲解", to: "/tutor", action: "问岗位助教", icon: MessageCircleMore, tone: "border-[#DFC9BE] bg-[#FFFEFA]", iconTone: "bg-[#F6ECE7] text-[#9A4E35]" },
  { title: "我想核对内容出处", detail: "搜索岗位知识片段，查看资料、页码和前后文", to: "/rag", action: "检索岗位知识", icon: Search, tone: "border-[#C7DAD6] bg-[#FFFEFA]", iconTone: "bg-[#E2EEEB] text-[#3E7774]" },
  { title: "我想整理自己的学习成果", detail: "用 Markdown 笔记沉淀、总结并继续出题", to: "/notes", action: "整理智能笔记", icon: NotebookPen, tone: "border-[#CCD7C9] bg-[#FFFEFA]", iconTone: "bg-[#E8EFE8] text-[#5B7C6A]" },
  { title: "我想看懂抽象过程", detail: "播放动画并调整参数，观察过程如何变化", to: "/concept", action: "打开可视讲解", icon: Clapperboard, tone: "border-[#D7CDD9] bg-[#FFFEFA]", iconTone: "bg-[#EEE9EF] text-[#7E6B83]" },
  { title: "我不知道下一步学什么", detail: "回到今日学习，按系统给出的优先级继续", to: "/", action: "查看今日路线", icon: Route, tone: "border-[#C7D2D8] bg-[#FFFEFA]", iconTone: "bg-[#E7EDF3] text-[#315E83]" },
  { title: "我遇到了问题或有建议", detail: "提交反馈并查看后续处理状态", to: "/feedback", action: "前往反馈中心", icon: MessageSquareText, tone: "border-[#DFC9BE] bg-[#FFFEFA]", iconTone: "bg-[#F6ECE7] text-[#9A4E35]" },
]

const CAPABILITY_GROUPS = [
  {
    label: "开始学习",
    description: "先建立岗位和个性化训练依据",
    items: [
      { label: "岗位空间", to: "/courses", icon: Library },
      { label: "今日学习", to: "/", icon: Sparkles },
      { label: "岗位能力画像", to: "/profile", icon: GraduationCap },
    ],
  },
  {
    label: "理解知识",
    description: "从生成、检索到连续追问",
    items: [
      { label: "岗位训练中心", to: "/competency", icon: LayoutDashboard },
      { label: "知识库", to: "/knowledge", icon: Database },
      { label: "AI 岗位助教", to: "/tutor", icon: MessageCircleMore },
      { label: "可视讲解", to: "/concept", icon: Clapperboard },
    ],
  },
  {
    label: "练习与沉淀",
    description: "把学习过程变成可复用成果",
    items: [
      { label: "智能笔记", to: "/notes", icon: NotebookPen },
      { label: "智能测验", to: "/quiz", icon: BookOpenCheck },
      { label: "学习报告", to: "/report", icon: BarChart3 },
    ],
  },
  {
    label: "随时获得帮助",
    description: "不打断当前学习也能继续求助",
    items: [
      { label: "全局学习助手", to: "/", icon: Bot, assistant: true },
      { label: "反馈中心", to: "/feedback", icon: MessageSquareText },
    ],
  },
]

const TIPS = [
  ["目标岗位为什么很重要？", "当前岗位会同时影响检索范围、助教上下文、生成记录、笔记、测验和报告。开始前先确认顶部岗位名称。"],
  ["画像需要一次填完吗？", "不需要。它会随着对话和真实学习结果持续更新，你只需在目标或困难变化时补充信息。"],
  ["生成页面离开后会丢失吗？", "生成记录会保留；学习报告也会在后台继续生成，之后返回页面即可查看结果。"],
  ["在哪里能随时求助？", "除助教页面外，右下角学习助手会感知当前页面、目标岗位和画像，可直接询问“这个页面怎么用”。"],
]

export function UserGuide() {
  useTrackPage("guide")
  useTutorContext({
    page: "guide",
    title: "新手指引与使用手册",
    quick_actions: ["带我完成第一次学习", "我应该先用哪个功能", "解释完整学习闭环"],
  })
  const user = useCurrentUser()
  const canManage = isPrivilegedRole(user?.role)

  const openAssistant = openTutorBubble
  const openQuickGuide = () => window.dispatchEvent(new Event("studymate:getting-started-open"))

  return (
    <div className="app-page paper-theme min-h-dvh">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="guide" appearance="paper" />

        <main className="mt-4 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <section className="relative overflow-hidden border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full border border-[#DDD4BF]" />
            <div className="pointer-events-none absolute -right-4 top-10 size-40 rounded-full border border-[#E5DED0]" />
            <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(390px,.9fr)] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D8C9A8] bg-[#FBF7ED] px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">
                  <Compass className="size-3.5" /> 因材智训使用手册
                </div>
                <h1 className="mt-4 max-w-2xl text-[32px] font-black leading-[1.12] tracking-[-0.045em] text-[#18232D] sm:text-[40px] lg:text-[46px]">
                  不必认识所有功能，<br className="hidden sm:block" />先完成一次学习闭环
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#66717B] sm:text-sm">
                  因材智训会把目标岗位、岗位知识、个人画像、训练资源、测验证据和报告回写连在一起。第一次使用建议跟随 3 分钟指引，之后再按当前岗位目标选择功能。
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  <button type="button" onClick={openQuickGuide} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] shadow-[0_10px_24px_rgba(36,76,102,.18)] transition-all hover:-translate-y-px hover:bg-[#193B50]">
                    <Compass className="size-4" /> 开始 3 分钟指引
                  </button>
                  <Link to="/courses" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#C9C2B4] bg-[#FFFEFA] px-5 text-xs font-bold text-[#315E83] transition-colors hover:bg-[#EEE9DF]">
                    直接选择目标岗位 <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#C7D2D8] bg-[#FFFEFA]/95 p-4 shadow-[0_16px_36px_rgba(24,35,45,.08)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold tracking-[0.12em] text-[#315E83]">最短上手路线</div>
                    <div className="mt-1 text-base font-bold text-[#18232D]">只记住这三个动作</div>
                  </div>
                  <span className="rounded-full bg-[#E9EEE6] px-2.5 py-1 text-[10px] font-bold text-[#557052]">约 3 分钟</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    ["01", "先选目标岗位", "所有能力会自动共享该岗位的知识与训练上下文"],
                    ["02", "再做一件学习任务", "生成、提问、记笔记或完成一道题"],
                    ["03", "最后看结果", "在报告和画像中确认学习产生了变化"],
                  ].map(([index, title, detail]) => (
                    <div key={index} className="flex gap-3 rounded-xl border border-[#E3DED3] bg-[#F8F6F0] px-3 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#244C66] text-[10px] font-black text-[#F0D6A4]">{index}</span>
                      <div>
                        <div className="text-[11px] font-bold text-[#18232D]">{title}</div>
                        <div className="mt-0.5 text-[10px] leading-4 text-[#737C80]">{detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <nav className="flex gap-2 overflow-x-auto border-b border-[#E3DED3] bg-[#FFFEFA] px-5 py-3 sm:px-8 lg:px-10" aria-label="本页目录">
            {[["第一次使用", "first-route"], ["按目标找功能", "by-goal"], ["完整功能地图", "feature-map"], ["常见问题", "tips"]].map(([label, id]) => (
              <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">{label}</a>
            ))}
          </nav>

          <div className="px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
            <section id="first-route" className="scroll-mt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">第一次使用</div>
                  <h2 className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-[#18232D]">建议按这条路线走一遍</h2>
                  <p className="mt-1.5 text-xs leading-5 text-[#737C80]">每一步都能直接进入实际功能，不需要返回本页等待。</p>
                </div>
                <button type="button" onClick={openQuickGuide} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] px-3 text-[11px] font-bold text-[#315E83] hover:bg-[#DBE6EE]">
                  打开悬浮指引 <Compass className="size-3.5" />
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {FIRST_ROUTE.map(({ title, detail, to, action, icon: Icon, tone, iconTone }, index) => (
                  <Link key={title} to={to} className={`group flex min-h-44 flex-col rounded-[20px] border p-4 transition-all hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(24,35,45,.09)] ${tone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`grid size-10 place-items-center rounded-xl ${iconTone}`}><Icon className="size-[18px]" /></span>
                      <span className="text-[10px] font-black text-[#9A9488]">0{index + 1}</span>
                    </div>
                    <div className="mt-4 text-[13px] font-bold text-[#18232D]">{title}</div>
                    <p className="mt-1 text-[10px] leading-4 text-[#737C80]">{detail}</p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[10px] font-bold text-[#315E83]">{action}<ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></span>
                  </Link>
                ))}
              </div>
            </section>

            <section id="by-goal" className="mt-10 scroll-mt-5 border-t border-[#E3DED3] pt-9">
              <div className="text-[10px] font-bold tracking-[0.12em] text-[#5D7658]">按目标找功能</div>
              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-[#18232D]">你现在想完成什么？</h2>
              <p className="mt-1.5 text-xs leading-5 text-[#737C80]">不用记住产品结构，直接从你当前的问题出发。</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {GOAL_LINKS.map(({ title, detail, to, action, icon: Icon, tone, iconTone }) => (
                  <Link key={title} to={to} className={`group flex items-start gap-3.5 rounded-[18px] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(24,35,45,.07)] ${tone}`}>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTone}`}><Icon className="size-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold text-[#18232D]">{title}</span>
                      <span className="mt-1 block text-[10px] leading-4 text-[#737C80]">{detail}</span>
                      <span className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#315E83]">{action}<ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section id="feature-map" className="mt-10 scroll-mt-5 border-t border-[#E3DED3] pt-9">
              <div className="text-[10px] font-bold tracking-[0.12em] text-[#7E6B83]">完整功能地图</div>
              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-[#18232D]">所有能力都在同一条学习链路里</h2>
              <p className="mt-1.5 text-xs leading-5 text-[#737C80]">按学习阶段浏览；右下角全局学习助手会在大多数页面持续可用。</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {CAPABILITY_GROUPS.map((group, groupIndex) => (
                  <div key={group.label} className="rounded-[20px] border border-[#D7D1C4] bg-[#F8F6F0] p-4">
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-lg bg-[#244C66] text-[9px] font-black text-[#F0D6A4]">{groupIndex + 1}</span>
                      <div>
                        <div className="text-[12px] font-bold text-[#18232D]">{group.label}</div>
                        <div className="mt-0.5 text-[9px] text-[#7A817F]">{group.description}</div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {group.items.map(({ label, to, icon: Icon, assistant }) => assistant ? (
                        <button key={label} type="button" onClick={openAssistant} className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-[#E3DED3] bg-[#FFFEFA] px-3 text-left text-[10px] font-bold text-[#3D4850] hover:border-[#C7D2D8] hover:bg-[#E7EDF3] hover:text-[#315E83]">
                          <Icon className="size-3.5 text-[#315E83]" /><span className="flex-1">{label}</span><ChevronRight className="size-3 text-[#9A9488] group-hover:translate-x-0.5" />
                        </button>
                      ) : (
                        <Link key={label} to={to} className="group flex h-10 items-center gap-2.5 rounded-xl border border-[#E3DED3] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#3D4850] hover:border-[#C7D2D8] hover:bg-[#E7EDF3] hover:text-[#315E83]">
                          <Icon className="size-3.5 text-[#315E83]" /><span className="flex-1">{label}</span><ChevronRight className="size-3 text-[#9A9488] group-hover:translate-x-0.5" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {canManage && (
                <Link to="/tests" className="mt-3 flex items-center gap-3 rounded-[16px] border border-[#D8C9A8] bg-[#FBF7ED] px-4 py-3 text-[11px] font-bold text-[#8E6925] hover:bg-[#F4ECD8]">
                  <ClipboardCheck className="size-4" />
                  <span className="flex-1">管理角色还可以进入测试管理，查看关键学习链路的执行状态与验证结果。</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </section>

            <section id="tips" className="mt-10 scroll-mt-5 border-t border-[#E3DED3] pt-9">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#9A4E35]">常见问题</div>
                  <h2 className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-[#18232D]">先知道这四件事，使用会更顺</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {TIPS.map(([title, detail]) => (
                      <div key={title} className="rounded-[18px] border border-[#E3DED3] bg-[#FFFEFA] p-4">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-[#18232D]"><CircleHelp className="size-3.5 text-[#9A4E35]" />{title}</div>
                        <p className="mt-2 text-[10px] leading-[18px] text-[#66717B]">{detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <aside className="self-start rounded-[22px] border border-[#C7D2D8] bg-[#E7EDF3] p-5">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[#244C66] text-[#F0D6A4]"><Bot className="size-5" /></span>
                  <h3 className="mt-4 text-lg font-black tracking-[-0.025em] text-[#18232D]">还是不知道从哪开始？</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[#596A75]">直接问右下角学习助手“带我完成第一次学习”，它会结合当前岗位和画像给出下一步。</p>
                  <button type="button" onClick={openAssistant} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]">
                    打开学习助手 <ArrowRight className="size-3.5" />
                  </button>
                  <Link to="/feedback" className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#AFC0CA] bg-[#FFFEFA] px-4 text-[10px] font-bold text-[#315E83] hover:bg-[#F3F7F9]">
                    前往反馈中心
                  </Link>
                </aside>
              </div>
            </section>

            <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-[22px] border border-[#CCD7C9] bg-[#F4F7F2] p-5 sm:flex-row sm:items-center sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E8EDE5] text-[#5D7658]"><CheckCircle2 className="size-[18px]" /></span>
                <div>
                  <div className="text-[13px] font-bold text-[#18232D]">准备好了，就从一个目标岗位开始</div>
                  <p className="mt-1 text-[10px] leading-4 text-[#66717B]">不必一次配置完所有内容，因材智训会在真实学习过程中逐步了解你。</p>
                </div>
              </div>
              <Link to="/courses" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#6F8A69] px-5 text-[11px] font-bold text-white hover:bg-[#5D7658]">选择目标岗位 <ArrowRight className="size-3.5" /></Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
