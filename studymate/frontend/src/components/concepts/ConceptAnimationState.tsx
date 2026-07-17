import { Component, type ReactNode } from "react"
import { AlertTriangle, Film, RefreshCw } from "lucide-react"

export function ConceptAnimationLoading({ title }: { title: string }) {
  return (
    <section role="status" aria-live="polite" className="overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_12px_30px_rgba(24,35,45,.055)]">
      <header className="flex items-center gap-3 border-b border-[#DDD7CB] bg-[#F8F6F0] px-4 py-3.5 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Film className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.12em] text-[#8E6925]">正在准备可视讲解</p>
          <strong className="mt-0.5 block truncate text-sm text-[#18232D]">{title}</strong>
        </div>
      </header>
      <div className="grid min-h-[320px] place-items-center bg-[radial-gradient(circle_at_center,#F8F4E9_0,transparent_64%)] px-5 py-10 text-center">
        <div>
          <div className="relative mx-auto size-24" aria-hidden="true">
            <span className="absolute inset-2 rounded-full border border-[#D9CFB7]" />
            <span className="absolute inset-6 rounded-full border border-[#C7D2D8]" />
            <span className="absolute inset-[34px] grid place-items-center rounded-full bg-[#244C66] text-lg text-[#F0D6A4] shadow-[0_7px_18px_rgba(36,76,102,.2)]">✦</span>
            <span className="absolute left-1/2 top-1 size-2.5 -translate-x-1/2 animate-bounce rounded-full bg-[#B85C3E]" />
            <span className="absolute bottom-3 left-2 size-2 animate-pulse rounded-full bg-[#6F8A69]" />
            <span className="absolute bottom-4 right-1 size-2 animate-pulse rounded-full bg-[#B1842C] [animation-delay:180ms]" />
          </div>
          <strong className="mt-4 block text-sm text-[#243746]">只加载这一份动画</strong>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#66717B]">正在调入当前概念的交互步骤与讲课节奏，其余动画不会占用本次加载时间。</p>
          <div className="mx-auto mt-4 flex max-w-[260px] gap-1.5" aria-hidden="true">
            <span className="h-1.5 flex-[1.2] animate-pulse rounded-full bg-[#315E83]" />
            <span className="h-1.5 flex-1 animate-pulse rounded-full bg-[#B85C3E] [animation-delay:120ms]" />
            <span className="h-1.5 flex-[.8] animate-pulse rounded-full bg-[#6F8A69] [animation-delay:240ms]" />
          </div>
        </div>
      </div>
    </section>
  )
}

export class ConceptAnimationBoundary extends Component<
  { children: ReactNode; title: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section role="alert" className="grid min-h-[320px] place-items-center rounded-[24px] border border-[#DFC8BE] bg-[#FCF7F4] px-5 py-10 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"><AlertTriangle className="size-4" /></span>
          <strong className="mt-3 block text-sm text-[#18232D]">《{this.props.title}》动画加载中断</strong>
          <p className="mt-1 text-[11px] leading-5 text-[#66717B]">讲解文档和学习记录没有受到影响。重新加载后会只重试当前动画。</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]"><RefreshCw className="size-3.5" />重新加载动画</button>
        </div>
      </section>
    )
  }
}
