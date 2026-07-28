/** 口型：与 /public/avatars/lecturer_*_{pose}.png 一致 */
export type MouthPose = "idle" | "speak" | "open"

/** 响度 → 口型（带迟滞，避免嘴皮子抖） */
const T_SPEAK = 0.07
const T_OPEN = 0.2
const HYSTERESIS = 0.03

export function mouthPoseFromLevel(level: number, prev: MouthPose): MouthPose {
  const v = Math.max(0, Math.min(1, level))
  if (prev === "open") {
    if (v < T_OPEN - HYSTERESIS) return v < T_SPEAK - HYSTERESIS ? "idle" : "speak"
    return "open"
  }
  if (prev === "speak") {
    if (v >= T_OPEN) return "open"
    if (v < T_SPEAK - HYSTERESIS) return "idle"
    return "speak"
  }
  // idle
  if (v >= T_OPEN) return "open"
  if (v >= T_SPEAK) return "speak"
  return "idle"
}
