import { BookOpenText, Check, MessageCircleQuestion } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TutorLearningMethod } from "@/store/tutorLearningMethod"

const METHODS: Array<{
  value: TutorLearningMethod
  label: string
  description: string
  icon: typeof BookOpenText
}> = [
  {
    value: "feynman",
    label: "费曼学习法",
    description: "先用大白话讲清，再由你复述并补上理解缺口",
    icon: BookOpenText,
  },
  {
    value: "socratic",
    label: "苏格拉底式学习法",
    description: "一次推进一个问题，沿着你的回答继续推理",
    icon: MessageCircleQuestion,
  },
]

export function LearningMethodSelector({
  value,
  onChange,
  variant = "cards",
  className,
}: {
  value: TutorLearningMethod
  onChange: (method: TutorLearningMethod) => void
  variant?: "cards" | "compact"
  className?: string
}) {
  if (variant === "compact") {
    return (
      <div className={cn("inline-flex rounded-xl border border-[#D7D1C4] bg-[#F1EDE4] p-1", className)} role="radiogroup" aria-label="选择学习方法">
        {METHODS.map((method) => {
          const selected = value === method.value
          return (
            <button
              key={method.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={method.description}
              onClick={() => onChange(method.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold transition-colors sm:px-3",
                selected
                  ? "bg-[#FFFEFA] text-[#244C66] shadow-[0_3px_10px_rgba(24,35,45,.09)]"
                  : "text-[#7A817F] hover:text-[#244C66]",
              )}
            >
              <method.icon className="size-3.5" />
              <span>{method.value === "feynman" ? "费曼" : "苏格拉底"}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("grid gap-2", className)} role="radiogroup" aria-label="选择学习方法">
      {METHODS.map((method) => {
        const selected = value === method.value
        return (
          <button
            key={method.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(method.value)}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all",
              selected
                ? "border-[#9FB1BC] bg-[#E7EDF3] shadow-[0_6px_16px_rgba(36,76,102,.08)]"
                : "border-[#D7D1C4] bg-[#FFFEFA] hover:-translate-y-0.5 hover:border-[#AFA796] hover:bg-[#F8F6F0]",
            )}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", selected ? "bg-[#244C66] text-[#F2C968]" : "bg-[#F4ECD8] text-[#8E6925]")}>
              <method.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-[#243746]">{method.label}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#7A817F]">{method.description}</span>
            </span>
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", selected ? "border-[#315E83] bg-[#315E83] text-white" : "border-[#C9C2B4] text-transparent")}>
              <Check className="size-3" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
