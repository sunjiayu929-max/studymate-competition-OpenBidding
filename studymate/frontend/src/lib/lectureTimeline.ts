export interface LectureSeekPoint {
  beatIndex: number
  offsetMs: number
}

/** 无真实音频时的可解释时长估算；音频 metadata 就绪后会被实际 duration 覆盖。 */
export function estimateNarrationMs(text: string): number {
  return text.length * 175 + 300
}

/** 把内容时间定位到节拍和拍内偏移；边界时间属于后一拍。 */
export function resolveLectureSeek(durations: number[], targetMs: number): LectureSeekPoint {
  if (!durations.length) return { beatIndex: 0, offsetMs: 0 }
  const safeTarget = Math.max(0, targetMs)
  let cursor = 0
  for (let index = 0; index < durations.length; index++) {
    const duration = Math.max(1, durations[index] || 0)
    if (safeTarget < cursor + duration || index === durations.length - 1) {
      return { beatIndex: index, offsetMs: Math.max(0, safeTarget - cursor) }
    }
    cursor += duration
  }
  return { beatIndex: durations.length - 1, offsetMs: 0 }
}
