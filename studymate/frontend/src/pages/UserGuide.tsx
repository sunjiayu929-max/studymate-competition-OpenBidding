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

import "./UserGuide.css"

interface GuideLink {
  title: string
  detail: string
  to: string
  action: string
  icon: LucideIcon
  tone: "blue" | "cyan" | "mint" | "violet" | "gold" | "coral"
}

const FIRST_ROUTE: GuideLink[] = [
  { title: "选择目标岗位", detail: "确定领域、岗位知识库与训练上下文", to: "/courses", action: "选择岗位", icon: Library, tone: "blue" },
  { title: "让系统认识你", detail: "用对话补充目标与薄弱点", to: "/profile", action: "建立画像", icon: GraduationCap, tone: "cyan" },
  { title: "运行岗位训练闭环", detail: "14 个协作节点完成诊断、协商、生成、审核、裁决与反馈", to: "/competency", action: "开始训练", icon: LayoutDashboard, tone: "violet" },
  { title: "做一次真实测验", detail: "用作答结果检验掌握程度", to: "/quiz", action: "进入测验", icon: BookOpenCheck, tone: "mint" },
  { title: "查看学习报告", detail: "获得建议并更新下一步路线", to: "/report", action: "查看报告", icon: BarChart3, tone: "gold" },
]

const GOAL_LINKS: GuideLink[] = [
  { title: "我想快速攻克一个岗位能力点", detail: "让岗位助教结合当前岗位与画像连续讲解", to: "/tutor", action: "问岗位助教", icon: MessageCircleMore, tone: "coral" },
  { title: "我想核对内容出处", detail: "搜索岗位知识片段，查看资料、页码和前后文", to: "/rag", action: "检索岗位知识", icon: Search, tone: "cyan" },
  { title: "我想整理自己的学习成果", detail: "用 Markdown 笔记沉淀、总结并继续出题", to: "/notes", action: "整理智能笔记", icon: NotebookPen, tone: "mint" },
  { title: "我想看懂抽象过程", detail: "播放动画并调整参数，观察过程如何变化", to: "/concept", action: "打开可视讲解", icon: Clapperboard, tone: "violet" },
  { title: "我不知道下一步学什么", detail: "回到今日学习，按系统给出的优先级继续", to: "/", action: "查看今日路线", icon: Route, tone: "blue" },
  { title: "我遇到了问题或有建议", detail: "提交反馈并查看后续处理状态", to: "/feedback", action: "前往反馈中心", icon: MessageSquareText, tone: "gold" },
]

const CAPABILITY_GROUPS = [
  {
    label: "开始学习",
    description: "先建立岗位和个性化训练依据",
    items: [
      { label: "岗位空间", to: "/courses", icon: Library },
      { label: "今日学习", to: "/", icon: Sparkles },
      { label: "学情画像构建", to: "/profile", icon: GraduationCap },
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

const QUICK_STEPS = [
  ["01", "先选目标岗位", "所有能力会自动共享该岗位的知识与训练上下文"],
  ["02", "再做一件学习任务", "生成、提问、记笔记或完成一道题"],
  ["03", "最后看结果", "在报告和画像中确认学习产生了变化"],
]

const SECTION_LINKS = [
  ["第一次使用", "first-route"],
  ["按目标找功能", "by-goal"],
  ["完整功能地图", "feature-map"],
  ["常见问题", "tips"],
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
    <main className="guide-studio app-page paper-theme min-h-dvh">
      <div className="guide-shell">
        <AppTopbar current="guide" appearance="paper" />

        <section className="guide-hero" aria-labelledby="guide-title">
          <div className="guide-livebar">
            <span className="guide-livebar-beacon" />
            <b>GETTING STARTED</b>
            <small>新手路线已就绪</small>
            <em>3 分钟完成首次导航</em>
          </div>

          <div className="guide-hero-grid">
            <div className="guide-hero-copy">
              <div className="guide-kicker"><Compass />因材智训使用手册</div>
              <h1 id="guide-title">不必认识所有功能，<span>先完成一次学习闭环</span></h1>
              <p>因材智训会把目标岗位、岗位知识、个人画像、训练资源、测验证据和报告回写连在一起。第一次使用建议跟随 3 分钟指引，之后再按当前岗位目标选择功能。</p>
              <div className="guide-hero-actions">
                <button type="button" onClick={openQuickGuide} className="guide-button guide-button-primary">
                  <Compass />开始 3 分钟指引<span className="guide-button-signal" aria-hidden="true" />
                </button>
                <Link to="/courses" className="guide-button guide-button-secondary">
                  直接选择目标岗位<ArrowRight />
                </Link>
              </div>
            </div>

            <div className="guide-quick-panel">
              <div className="guide-quick-heading">
                <div><small>最短上手路线</small><h2>只记住这三个动作</h2></div>
                <span>约 3 分钟</span>
              </div>
              <div className="guide-quick-steps">
                <i className="guide-quick-path" aria-hidden="true" />
                {QUICK_STEPS.map(([index, title, detail]) => (
                  <div className="guide-quick-step" key={index}>
                    <span>{index}</span>
                    <div><strong>{title}</strong><small>{detail}</small></div>
                    <CheckCircle2 />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <nav className="guide-nav" aria-label="本页目录">
          <span>页面导航</span>
          {SECTION_LINKS.map(([label, id], index) => (
            <a key={id} href={`#${id}`}><i>{String(index + 1).padStart(2, "0")}</i>{label}</a>
          ))}
        </nav>

        <div className="guide-content">
          <section id="first-route" className="guide-section guide-first-route">
            <GuideHeading eyebrow="01 · 第一次使用" title="建议按这条路线走一遍" detail="每一步都能直接进入实际功能，不需要返回本页等待。">
              <button type="button" onClick={openQuickGuide} className="guide-inline-action">打开悬浮指引<Compass /></button>
            </GuideHeading>
            <div className="guide-route-grid">
              <span className="guide-route-line" aria-hidden="true"><i /></span>
              {FIRST_ROUTE.map(({ title, detail, to, action, icon: Icon, tone }, index) => (
                <Link key={title} to={to} className="guide-route-card" data-tone={tone}>
                  <div className="guide-card-top"><span><Icon /></span><b>{String(index + 1).padStart(2, "0")}</b></div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                  <small>{action}<ChevronRight /></small>
                </Link>
              ))}
            </div>
          </section>

          <GuideTransition from="首次路线" to="按需探索" />

          <section id="by-goal" className="guide-section">
            <GuideHeading eyebrow="02 · 按目标找功能" title="你现在想完成什么？" detail="不用记住产品结构，直接从你当前的问题出发。" />
            <div className="guide-goal-grid">
              {GOAL_LINKS.map(({ title, detail, to, action, icon: Icon, tone }) => (
                <Link key={title} to={to} className="guide-goal-card" data-tone={tone}>
                  <span className="guide-goal-icon"><Icon /></span>
                  <span className="guide-goal-copy"><strong>{title}</strong><small>{detail}</small><b>{action}<ArrowRight /></b></span>
                  <i className="guide-card-scan" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          <GuideTransition from="目标意图" to="功能导航" reverse />

          <section id="feature-map" className="guide-section">
            <GuideHeading eyebrow="03 · 完整功能地图" title="所有能力都在同一条学习链路里" detail="按学习阶段浏览；右下角全局学习助手会在大多数页面持续可用。" />
            <div className="guide-capability-grid">
              {CAPABILITY_GROUPS.map((group, groupIndex) => (
                <div key={group.label} className="guide-capability-card">
                  <div className="guide-capability-heading">
                    <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                    <div><strong>{group.label}</strong><small>{group.description}</small></div>
                  </div>
                  <div className="guide-capability-links">
                    {group.items.map(({ label, to, icon: Icon, assistant }) => assistant ? (
                      <button key={label} type="button" onClick={openAssistant}>
                        <Icon /><span>{label}</span><ChevronRight />
                      </button>
                    ) : (
                      <Link key={label} to={to}>
                        <Icon /><span>{label}</span><ChevronRight />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {canManage && (
              <Link to="/tests" className="guide-admin-link">
                <ClipboardCheck />
                <span>管理角色还可以进入测试管理，查看关键学习链路的执行状态与验证结果。</span>
                <ArrowRight />
              </Link>
            )}
          </section>

          <GuideTransition from="能力地图" to="答疑支持" />

          <section id="tips" className="guide-section guide-tips-section">
            <GuideHeading eyebrow="04 · 常见问题" title="先知道这四件事，使用会更顺" />
            <div className="guide-tips-layout">
              <div className="guide-tip-grid">
                {TIPS.map(([title, detail], index) => (
                  <article key={title} className="guide-tip-card">
                    <div><span>{String(index + 1).padStart(2, "0")}</span><CircleHelp /></div>
                    <h3>{title}</h3>
                    <p>{detail}</p>
                  </article>
                ))}
              </div>
              <aside className="guide-assistant-card">
                <span className="guide-assistant-icon"><Bot /></span>
                <small>随时可用 · 学习助手</small>
                <h3>还是不知道从哪开始？</h3>
                <p>直接问右下角学习助手“带我完成第一次学习”，它会结合当前岗位和画像给出下一步。</p>
                <button type="button" onClick={openAssistant}>打开学习助手<ArrowRight /></button>
                <Link to="/feedback">前往反馈中心</Link>
              </aside>
            </div>
          </section>

          <div className="guide-finish-panel">
            <span><CheckCircle2 /></span>
            <div><strong>准备好了，就从一个目标岗位开始</strong><p>不必一次配置完所有内容，因材智训会在真实学习过程中逐步了解你。</p></div>
            <Link to="/courses">选择目标岗位<ArrowRight /></Link>
          </div>
        </div>
      </div>
    </main>
  )
}

function GuideHeading({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="guide-section-heading">
      <div><small>{eyebrow}</small><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
      {children}
    </div>
  )
}

function GuideTransition({ from, to, reverse = false }: { from: string; to: string; reverse?: boolean }) {
  return (
    <div className={`guide-transition ${reverse ? "is-reverse" : ""}`} aria-hidden="true">
      <span>{from}</span><div><i /><i /><i /><b /></div><strong>{to}</strong>
    </div>
  )
}
