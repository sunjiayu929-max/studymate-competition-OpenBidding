import { Link, useLocation } from "react-router-dom"
import { ArrowRight, BookOpenCheck, Compass, Database, Home, LayoutDashboard, Library, MessageCircleMore } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { useTrackPage } from "@/lib/useTrackPage"

const DESTINATIONS = [
  { to: "/courses", label: "课程空间", detail: "先确定学习范围", icon: Library, color: "#8E6925", wash: "#F4ECD8" },
  { to: "/workspace", label: "学习资源工坊", detail: "7 Agents 生成完整资源包", icon: LayoutDashboard, color: "#315E83", wash: "#E7EDF3" },
  { to: "/tutor", label: "AI 课程助教", detail: "继续当前问题", icon: MessageCircleMore, color: "#6F8A69", wash: "#E8EDE5" },
  { to: "/knowledge", label: "知识库", detail: "管理私有资料与来源", icon: Database, color: "#B85C3E", wash: "#F4E8E2" },
]

export function NotFound() {
  const location = useLocation()
  useTrackPage("not_found", { path: location.pathname })

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar appearance="paper" />

        <main className="mt-4 grid min-h-[calc(100dvh-120px)] place-items-center overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] p-4 shadow-[0_16px_42px_rgba(24,35,45,.07)] sm:p-7">
          <section className="grid w-full max-w-[940px] overflow-hidden rounded-[28px] border border-[#D5CEC0] bg-[#FBF9F4] shadow-[0_18px_48px_rgba(24,35,45,.07)] lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="relative grid min-h-[230px] place-items-center overflow-hidden border-b border-[#D5CEC0] bg-[#F1EDE4] p-8 lg:min-h-[520px] lg:border-b-0 lg:border-r">
              <span className="absolute -left-20 -top-20 size-64 rounded-full border border-[#C9C1B2]" />
              <span className="absolute -bottom-28 -right-24 size-72 rounded-full border border-[#C9C1B2]" />
              <div className="relative text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full border border-[#C9C1B2] bg-[#FFFEFA] text-[#315E83] shadow-[0_10px_25px_rgba(24,35,45,.06)]">
                  <Compass className="size-7" />
                </span>
                <strong className="mt-5 block font-serif text-7xl leading-none tracking-[-0.08em] text-[#244C66]">404</strong>
                <span className="mt-4 inline-flex max-w-[240px] items-center rounded-full border border-[#D5CEC0] bg-[#FFFEFA] px-3 py-1.5 font-mono text-[10px] text-[#7A817F]">
                  <span className="truncate">{location.pathname}</span>
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-8 lg:p-10">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[#B1842C]"><Compass className="size-3.5" />页面未找到 · 学习进度不受影响</p>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[#18232D] sm:text-3xl">这个入口不存在，换一条学习路线继续。</h1>
              <p className="mt-3 max-w-[580px] text-sm leading-6 text-[#66717B]">链接可能已经更新或输入有误。你的课程、笔记、测验与学习记录都不会受到影响，可以从下面任一入口继续。</p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2" aria-label="推荐学习入口">
                {DESTINATIONS.map(({ to, label, detail, icon: Icon, color, wash }) => (
                  <Link key={to} to={to} className="group flex items-center gap-3 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3 transition-all hover:-translate-y-0.5 hover:border-[#AEBBC3] hover:shadow-[0_8px_20px_rgba(24,35,45,.055)]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ color, backgroundColor: wash }}><Icon className="size-[18px]" /></span>
                    <span className="min-w-0 flex-1"><strong className="block text-xs text-[#243746]">{label}</strong><span className="mt-0.5 block text-[10px] text-[#7A817F]">{detail}</span></span>
                    <ArrowRight className="size-3.5 shrink-0 text-[#A49D90] transition-transform group-hover:translate-x-0.5 group-hover:text-[#315E83]" />
                  </Link>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-2 border-t border-[#E0DACE] pt-5 sm:flex-row sm:items-center">
                <Link to="/" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] transition-colors hover:bg-[#1D4058]"><Home className="size-4" />返回今日学习</Link>
                <Link to="/quiz" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D1C9BA] bg-[#FFFEFA] px-5 text-xs font-bold text-[#59666E] transition-colors hover:bg-[#F4ECD8] hover:text-[#8E6925]"><BookOpenCheck className="size-4" />继续最近测验</Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
