/**
 * 概念动画 · 5 级流水线（计算机组成原理旗舰）
 * ------------------------------------------------------------------
 * 时空图：行=指令，列=时钟周期，格子=该周期指令所处阶段(IF/ID/EX/MEM/WB)。
 *   - 按时钟逐拍揭示，看指令如何重叠 → 吞吐率提升
 *   - 含一次真实的「数据冒险」停顿(bubble)：I2 依赖 I1 未写回的结果 → 插泡泡
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useLecture, chunkedBeats } from "./useLecture"

const N_CYCLES = 9
const INSTRS = ["I1", "I2", "I3", "I4"]

// 每条指令：周期 → 阶段（●=停顿 bubble）。手算保证正确（含 load-use 1 拍停顿）。
const SCHED: Record<number, string>[] = [
  { 1: "IF", 2: "ID", 3: "EX", 4: "MEM", 5: "WB" },
  { 2: "IF", 3: "ID", 4: "●", 5: "EX", 6: "MEM", 7: "WB" },
  { 3: "IF", 4: "IF", 5: "ID", 6: "EX", 7: "MEM", 8: "WB" },
  { 5: "IF", 6: "ID", 7: "EX", 8: "MEM", 9: "WB" },
]

const STAGE_CLASS: Record<string, string> = {
  IF: "bg-indigo-500",
  ID: "bg-sky-500",
  EX: "bg-emerald-500",
  MEM: "bg-amber-500",
  WB: "bg-violet-500",
  "●": "bg-rose-500",
}

const CYCLE_CAPTION: Record<number, string> = {
  0: "5 级流水线 IF→ID→EX→MEM→WB。点「播放」按时钟逐拍看指令如何重叠执行。",
  1: "周期 1：I1 取指 (IF)，流水线开始填充。",
  2: "周期 2：I1 译码 (ID)、I2 取指 (IF)，两条指令已重叠。",
  3: "周期 3：I1 执行、I2 译码、I3 取指 —— 三条指令同时在流水线里。",
  4: "周期 4：I2 需要 I1 尚未写回的数据 → 数据冒险！插入停顿 (bubble)，后续指令顺延一拍。",
  5: "周期 5：停顿解除，I2 执行、I3 译码、I4 取指。",
  6: "周期 6：流水线满载 —— I2 访存、I3 执行、I4 译码 同时进行。",
  7: "周期 7：I2 写回完成，I3 访存、I4 执行。",
  8: "周期 8：I3 写回，I4 访存。",
  9: "周期 9：I4 写回，全部完成 ✓ 无停顿本只需 8 拍，bubble 多花 1 拍。",
}

export function PipelineAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const [playing, setPlaying] = useState(false)
  const [cycle, setCycle] = useState(0) // 0=未开始，1..9 已揭示到第几拍
  const atEnd = cycle >= N_CYCLES

  const playingRef = useRef(playing)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    const STEP_MS = 850
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        setCycle((c) => {
          if (c >= N_CYCLES) {
            playingRef.current = false
            setPlaying(false)
            return c
          }
          return c + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    setCycle(0)
  }, [])
  const handleStep = useCallback(() => {
    if (atEnd) return
    setCycle((c) => Math.min(c + 1, N_CYCLES))
  }, [atEnd])
  const togglePlay = useCallback(() => {
    if (atEnd) {
      setCycle(0)
      lastRef.current = performance.now()
      setPlaying(true)
      return
    }
    setPlaying((p) => !p)
  }, [atEnd])

  // 讲课模式：4 拍讲清「重叠提速 → 数据冒险插泡泡 → 满载 → 流出」，时空图按时钟逐拍揭示（音画同步）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
    },
    buildBeats: () =>
      chunkedBeats(
        N_CYCLES + 1,
        [
          "五级流水线把一条指令拆成五段：取指、译码、执行、访存、写回。它的妙处是重叠——前一条指令进入译码时，后一条马上就能取指，像工厂流水线一样，多条指令同时在跑。",
          "你看，三条指令很快就重叠起来了。但到这儿出问题了：I2 要用 I1 还没写回的结果——这叫数据冒险。流水线只好插一个气泡、停顿一拍，让后面的指令都顺延等一下。",
          "停顿一解除，流水线又满载运转：取指、译码、执行、访存、写回五个阶段同时各跑一条指令，吞吐率拉满。",
          "最后几条指令依次写回、流出流水线。本来不停顿只要 8 拍，这个数据冒险让我们多花了 1 拍——这就是流水线又快、又得小心冒险的地方。",
        ],
        (i) => setCycle(i)
      ),
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="bg-[var(--background)] p-4 overflow-x-auto">
        <div
          className="grid gap-1 min-w-[520px]"
          style={{ gridTemplateColumns: `40px repeat(${N_CYCLES}, 1fr)` }}
        >
          {/* 表头：周期号 */}
          <div className="text-[11px] text-[var(--muted-foreground)] flex items-end justify-center pb-1">
            周期
          </div>
          {Array.from({ length: N_CYCLES }, (_, i) => i + 1).map((c) => (
            <div
              key={c}
              className={`text-[11px] text-center pb-1 ${
                c <= cycle ? "text-[var(--foreground)] font-semibold" : "text-[var(--muted-foreground)]/40"
              }`}
            >
              {c}
            </div>
          ))}

          {/* 指令行 */}
          {INSTRS.map((instr, r) => (
            <div key={instr} className="contents">
              <div className="text-xs font-mono flex items-center justify-center text-[var(--muted-foreground)]">
                {instr}
              </div>
              {Array.from({ length: N_CYCLES }, (_, i) => i + 1).map((c) => {
                const stage = SCHED[r][c]
                const visible = stage && c <= cycle
                return (
                  <div
                    key={c}
                    className={`h-9 rounded flex items-center justify-center text-[11px] font-semibold text-white transition-all duration-300 ${
                      visible
                        ? `${STAGE_CLASS[stage]} opacity-100 scale-100`
                        : "opacity-0 scale-90"
                    }`}
                  >
                    {visible ? (stage === "●" ? "停顿" : stage) : ""}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 讲课模式下隐藏自带字幕条 + 控件，交给播放器（上方时空图保留） */}
      {!lecture && (
      <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">
        {CYCLE_CAPTION[Math.min(cycle, N_CYCLES)]}
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
        <div className="ml-auto flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] flex-wrap">
          {["IF", "ID", "EX", "MEM", "WB"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`inline-block size-2.5 rounded-sm ${STAGE_CLASS[s]}`} />
              {s}
            </span>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}
