interface SiteFilingProps {
  compact?: boolean
  className?: string
}

export function SiteFiling({ compact = false, className = "" }: SiteFilingProps) {
  return (
    <footer
      className={`paper-theme flex shrink-0 items-center justify-center border-t border-[#D7D1C4] bg-[#F3F0E7] px-4 text-center text-[10px] text-[#747C7D] ${compact ? "min-h-7 py-1" : "min-h-9 py-2"} ${className}`}
      style={compact ? { paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" } : undefined}
    >
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-[#315E83] hover:underline"
      >
        豫ICP备2026028221号
      </a>
    </footer>
  )
}
