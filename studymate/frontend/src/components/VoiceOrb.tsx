/**
 * 语音对话页中央可视化圆球。
 *
 * 5 个状态：idle / listening / thinking / speaking / paused
 *  - listening：蓝色，外圈光晕脉冲扩散
 *  - thinking：紫色，主体缓慢旋转
 *  - speaking：绿色，主体呼吸放缩
 *  - idle / paused：静止，颜色不同
 */
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"

export type VoiceOrbState = "idle" | "listening" | "thinking" | "speaking" | "paused"

const STATE_CFG: Record<VoiceOrbState, { tone: string; pulse: string; label: string }> = {
  idle: { tone: "bg-[radial-gradient(circle_at_34%_28%,#F8EDC8_0%,#607783_28%,#244C66_72%,#193B50_100%)]", pulse: "bg-[#315E83]", label: "正在连接麦克风…" },
  listening: { tone: "bg-[radial-gradient(circle_at_34%_28%,#EAF4EE_0%,#4A8884_30%,#315E83_72%,#244C66_100%)]", pulse: "bg-[#4A8884]", label: "聆听中…说话即可" },
  thinking: { tone: "bg-[radial-gradient(circle_at_34%_28%,#FFF1C9_0%,#C49A45_30%,#8E6925_72%,#684B18_100%)]", pulse: "bg-[#B1842C]", label: "助教思考中…" },
  speaking: { tone: "bg-[radial-gradient(circle_at_34%_28%,#EDF4E9_0%,#83A17C_30%,#557052_72%,#38503A_100%)]", pulse: "bg-[#6F8A69]", label: "助教回答中（说话可打断）" },
  paused: { tone: "bg-[radial-gradient(circle_at_34%_28%,#F8E7DC_0%,#C77A5C_30%,#9A4E35_72%,#743522_100%)]", pulse: "bg-[#B85C3E]", label: "已暂停" },
}

interface Props {
  state: VoiceOrbState
  size?: number
}

export function VoiceOrb({ state, size = 220 }: Props) {
  const cfg = STATE_CFG[state]
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative flex flex-col items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* listening 时外圈三层光晕错时扩散 */}
        {state === "listening" && !reduceMotion && [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`absolute inset-0 rounded-full ${cfg.pulse}`}
            initial={{ scale: 0.9, opacity: 0.45 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}

        {/* 主圆球 */}
        <motion.div
          className={`absolute inset-0 rounded-full ${cfg.tone} shadow-[0_24px_60px_rgba(36,76,102,.28)] ring-1 ring-white/60`}
          animate={
            reduceMotion ? { scale: 1, rotate: 0 }
              : state === "speaking" ? { scale: [1, 1.08, 1] }
              : state === "thinking" ? { rotate: 360 }
              : { scale: 1, rotate: 0 }
          }
          transition={
            state === "speaking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : state === "thinking" ? { duration: 4, repeat: Infinity, ease: "linear" }
              : { duration: 0.3 }
          }
        />

        {/* 高光斑 */}
        <div className="absolute inset-[12%] rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      </div>

      {/* 状态标签 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-[var(--muted-foreground)] font-medium"
        >
          {cfg.label}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
