/**
 * 概念动画 · Cache 直接映射（计算机组成原理）
 * ------------------------------------------------------------------
 * 一串内存块访问，演示直接映射的命中/缺失/冲突：
 *   - 行号 index = 块号 % 行数；tag = 块号 / 行数
 *   - 命中(绿)/缺失(红)，冲突缺失会把同一行原来的块挤掉
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useLecture, chunkedBeats } from "./useLecture"

const LINES = 4
// 访问的内存块号序列（精心设计：含命中、强制缺失、冲突缺失）
const SEQ = [0, 1, 2, 0, 4, 0, 5, 2]

interface StepResult {
  block: number
  index: number
  tag: number
  hit: boolean
  evicted: number | null
  cacheAfter: (number | null)[] // 每行当前存的块号
  caption: string
}

function simulate(): StepResult[] {
  const cache: (number | null)[] = Array(LINES).fill(null)
  const steps: StepResult[] = []
  for (const block of SEQ) {
    const index = block % LINES
    const tag = Math.floor(block / LINES)
    const occupant = cache[index]
    const hit = occupant === block
    let evicted: number | null = null
    if (!hit) {
      if (occupant !== null) evicted = occupant
      cache[index] = block
    }
    const caption = hit
      ? `访问块 ${block} → 行 ${index}（${block}%${LINES}）：该行正好是块 ${block} → 命中 ✓`
      : occupant === null
        ? `访问块 ${block} → 行 ${index}：该行空 → 强制缺失（首次），载入块 ${block}`
        : `访问块 ${block} → 行 ${index}：该行是块 ${occupant}（tag 不符）→ 冲突缺失！挤掉块 ${occupant}，载入块 ${block}`
    steps.push({ block, index, tag, hit, evicted, cacheAfter: [...cache], caption })
  }
  return steps
}

export function CacheAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const steps = simulate()
  const [idx, setIdx] = useState(-1) // -1 未开始
  const [playing, setPlaying] = useState(false)
  const atEnd = idx >= steps.length - 1

  const cur = idx >= 0 ? steps[idx] : null
  const cache = cur ? cur.cacheAfter : Array(LINES).fill(null)
  const hits = idx >= 0 ? steps.slice(0, idx + 1).filter((s) => s.hit).length : 0
  const total = idx + 1

  useEffect(() => {
    if (!playing) return
    if (atEnd) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, steps.length - 1)), 1100)
    return () => clearTimeout(t)
  }, [playing, idx, atEnd, steps.length])

  const handleReset = useCallback(() => {
    setPlaying(false)
    setIdx(-1)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setIdx((i) => Math.min(i + 1, steps.length - 1))
  }, [atEnd, steps.length])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIdx(-1)
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  // 讲课模式：4 拍讲清「直接映射规则 → 命中 → 冲突缺失来回挤 → 软肋」，访问序列随讲解推进（音画同步）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => setPlaying(false),
    buildBeats: () => {
      const hits = steps.filter((s) => s.hit).length
      const rate = Math.round((hits / steps.length) * 100)
      return chunkedBeats(
        steps.length,
        [
          "直接映射的规矩很死：每个内存块只能进固定的一行——行号等于块号对行数取余。先访问块 0 和块 1，对应的行还空着，所以都是强制缺失，分别把它们载进去。",
          "再访问块 2，载入第 2 行；紧接着又访问块 0——它还在第 0 行待着没被动过，这次就命中了，直接读出来、不用再跑内存，这正是 Cache 的意义。",
          "现在看冲突。块 4 也要落在第 0 行，因为 4 对 4 取余还是 0，可那儿正占着块 0、tag 对不上，只能把块 0 挤出去换成块 4，这叫冲突缺失；下一步又访问块 0，它刚被挤走，于是又得把块 4 挤掉、把块 0 换回来。",
          `你看，块 0 和块 4 抢同一行、来回把对方挤掉，反复缺失。最后访问块 5、块 2，块 2 还在第 2 行没被打扰、命中收尾。整段 ${steps.length} 次访问里只命中了 ${hits} 次，命中率 ${rate}%——这正是直接映射的软肋：简单，但同一行容易被反复争抢、冲突缺失多。`,
        ],
        (i) => setIdx(i)
      )
    },
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="bg-[var(--background)] p-4">
        {/* 访问序列 */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] mr-1">访问序列：</span>
          {SEQ.map((b, i) => (
            <span
              key={i}
              className={`inline-flex items-center justify-center size-7 rounded text-xs font-mono border transition-all ${
                i === idx
                  ? cur?.hit
                    ? "border-emerald-500 bg-emerald-500 text-white scale-110"
                    : "border-rose-500 bg-rose-500 text-white scale-110"
                  : i < idx
                    ? "border-[var(--border)] text-[var(--muted-foreground)] opacity-50"
                    : "border-[var(--border)] text-[var(--foreground)]"
              }`}
            >
              {b}
            </span>
          ))}
        </div>

        {/* Cache 表 */}
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 max-w-sm">
          <div className="text-[11px] text-[var(--muted-foreground)] font-medium">行号</div>
          <div className="text-[11px] text-[var(--muted-foreground)] font-medium">内容（块号 / tag）</div>
          {Array.from({ length: LINES }, (_, line) => {
            const block = cache[line]
            const active = cur && cur.index === line
            return (
              <div key={line} className="contents">
                <div
                  className={`flex items-center justify-center size-9 rounded font-mono text-sm border ${
                    active
                      ? cur.hit
                        ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-rose-500 text-rose-600 dark:text-rose-400"
                      : "border-[var(--border)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {line}
                </div>
                <div
                  className={`flex items-center px-3 h-9 rounded border text-sm transition-all ${
                    active
                      ? cur.hit
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                        : "border-rose-500 bg-rose-50 dark:bg-rose-950/40"
                      : "border-[var(--border)] bg-[var(--muted)]/30"
                  }`}
                >
                  {block === null ? (
                    <span className="text-[var(--muted-foreground)] text-xs">空</span>
                  ) : (
                    <span className="font-mono">
                      块 {block} <span className="text-[var(--muted-foreground)]">/ tag {Math.floor(block / LINES)}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {total > 0 && (
          <div className="mt-3 text-xs text-[var(--muted-foreground)]">
            命中率：{hits} / {total} = {((hits / total) * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器（上方访问序列/表格保留） */}
      {!lecture && (
      <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${cur ? (cur.hit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") : ""}`}>
        {cur ? cur.caption : `直接映射 Cache（${LINES} 行）。块号 % ${LINES} 决定落哪行。点「播放」看命中与冲突缺失。`}
      </div>
      )}

      {!lecture && (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <Button size="sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {atEnd ? "重新演示" : playing ? "暂停" : "播放"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || atEnd}>
          <SkipForward className="size-4" /> 单步
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" /> 重置
        </Button>
        <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">
          直接映射：每个块只能进固定一行 → 简单但易冲突
        </span>
      </div>
      )}
    </div>
  )
}
