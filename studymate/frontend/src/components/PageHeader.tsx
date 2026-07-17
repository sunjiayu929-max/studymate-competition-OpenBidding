import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { AppTopbar, type PageId } from "@/components/AppTopbar"

export type { PageId }

interface PageHeaderProps {
  current: PageId
  title: string
  subtitle?: string
  icon?: LucideIcon
  iconColor?: string
  rightExtra?: React.ReactNode
  backTo?: string
  backLabel?: string
  appearance?: "default" | "paper"
}

export function PageHeader({
  current,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-[var(--primary)]",
  rightExtra,
  backTo = "/",
  backLabel = "返回首页",
  appearance = "default",
}: PageHeaderProps) {
  if (appearance === "paper") {
    return (
      <header className="mb-4">
        <AppTopbar current={current} appearance="paper" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] px-4 py-3 shadow-[0_8px_22px_rgba(24,35,45,.035)] sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link to={backTo} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
              <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">{backLabel}</span>
            </Link>
            <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
            {Icon && (
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#FFFEFA]">
                <Icon className={`size-4 ${iconColor}`} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-bold tracking-[-0.02em] text-[#18232D]">{title}</h1>
              {subtitle && <p className="mt-0.5 max-sm:line-clamp-2 text-[11px] leading-4 text-[#6F787A] sm:truncate">{subtitle}</p>}
            </div>
          </div>
          {rightExtra && <div className="flex w-full max-w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">{rightExtra}</div>}
        </div>
      </header>
    )
  }

  return (
    <header className="mb-7">
      <AppTopbar current={current} appearance={appearance} />

      <div className="mt-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <Link to={backTo} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]">
            <ArrowLeft className="size-3.5" /> {backLabel}
          </Link>
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="surface-card mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl">
                <Icon className={`size-5 ${iconColor}`} />
              </span>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.035em] sm:text-[30px]">{title}</h1>
              {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{subtitle}</p>}
            </div>
          </div>
        </div>
        {rightExtra && <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:pb-0.5">{rightExtra}</div>}
      </div>
    </header>
  )
}
