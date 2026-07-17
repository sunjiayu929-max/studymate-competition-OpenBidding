import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform,filter] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none disabled:brightness-100 motion-reduce:transform-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_6px_16px_color-mix(in_oklab,var(--primary)_24%,transparent)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_10px_24px_color-mix(in_oklab,var(--primary)_30%,transparent)]",
        outline: "border border-[var(--border)] bg-[var(--card)]/80 shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] hover:bg-[var(--accent)]",
        ghost: "hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        destructive: "border border-[#A94F35] bg-[#B85C3E] text-white shadow-[0_6px_16px_rgba(184,92,62,.2)] hover:-translate-y-0.5 hover:bg-[#A94F35] hover:shadow-[0_10px_22px_rgba(184,92,62,.24)]",
        secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:-translate-y-0.5 hover:brightness-98",
      },
      size: {
        sm: "h-9 px-3.5",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = "Button"
