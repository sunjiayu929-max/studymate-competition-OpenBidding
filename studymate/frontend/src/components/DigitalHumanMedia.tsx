import { motion, useReducedMotion } from "framer-motion"

import { DIGITAL_HUMAN_FULLBODY_POSTER, type DigitalHumanState } from "@/lib/digitalHuman"
import { cn } from "@/lib/utils"

/**
 * Transparent full-body fallback used where the available continuous video
 * cannot be shown without its classroom background (for example the floating
 * assistant). It deliberately never swaps state pose images.
 */
export function DigitalHumanMedia({
  state,
  alt = "",
  className,
  priority = false,
}: {
  state: DigitalHumanState
  alt?: string
  className?: string
  priority?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.span
      className={cn("relative block h-full w-full origin-bottom", className)}
      data-digital-human-state={state}
      data-digital-human-fallback="static-fullbody"
      animate={reduceMotion || state === "paused"
        ? undefined
        : state === "thinking"
          ? { x: [0, -1.3, 0.8, 0], y: [0, -1.8, -0.4, 0], rotate: [0, -0.34, 0.22, 0] }
          : { x: [0, 0.7, 0, -0.55, 0], y: [0, -1.1, -0.3, -0.8, 0], rotate: [0, 0.16, 0, -0.13, 0] }}
      transition={{
        duration: state === "thinking" ? 5.4 : state === "listening" ? 6.2 : 7.2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <motion.span
        className="block h-full w-full origin-bottom"
        animate={reduceMotion || state === "paused" ? undefined : { scaleY: [1, 1.005, 1], scaleX: [1, 1.002, 1] }}
        transition={{ duration: state === "thinking" ? 3.8 : 4.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <img
          src={DIGITAL_HUMAN_FULLBODY_POSTER}
          alt={alt}
          draggable={false}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="h-full w-full object-contain object-bottom"
        />
      </motion.span>
    </motion.span>
  )
}
