/**
 * 概念动画 · 哈希表 Hash Table（数据结构与算法 · 链地址法）
 * ------------------------------------------------------------------
 * 真实哈希：键 k 经哈希函数 h(k)=k mod m 直接定位到桶下标 → O(1) 存取。
 *   - 不同键算出同一下标 = 冲突；链地址法用「每个桶挂一条链表」化解
 *   - 逐个插入，看哈希计算 + 冲突时往链上接
 * 桶数组 + 冲突链，逐键揭示。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture, chunkedBeats } from "./useLecture"

const STEP_MS = 900
const M = 7 // 桶数
const KEYS = [15, 11, 27, 8, 22, 19, 4] // 插入序列（刻意制造冲突）
const h = (k: number) => k % M

export function HashTableAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0) // 已插入键数 0..KEYS.length
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const lastRef = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    posRef.current = pos
  }, [pos])

  const total = KEYS.length

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    applyViewport(ctx)
    const isDark = document.documentElement.classList.contains("dark")
    const FG = isDark ? "#e4e4e7" : "#27272a"
    const MUT = isDark ? "#a1a1aa" : "#71717a"
    const p = posRef.current

    // 各桶当前链（按已插入的键）
    const buckets: number[][] = Array.from({ length: M }, () => [])
    for (let i = 0; i < p; i++) buckets[h(KEYS[i])].push(KEYS[i])
    const curKey = p > 0 && p <= total ? KEYS[p - 1] : null
    const curBucket = curKey !== null ? h(curKey) : -1

    const bw = 50
    const bh = 26
    const x0 = 70
    const gapY = 4
    const y0 = 50
    const nodeW = 44
    const nodeGap = 14

    // 顶部:当前哈希计算
    if (curKey !== null && p <= total) {
      ctx.fillStyle = FG
      ctx.font = "600 14px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      const collide = buckets[curBucket].length > 1
      ctx.fillText(`插入 ${curKey}：h(${curKey}) = ${curKey} mod ${M} = ${curBucket}` + (collide ? "  → 冲突！接到链尾" : ""), 118, 32)
      if (collide) {
        ctx.fillStyle = "#f43f5e"
        ctx.font = "600 12px ui-sans-serif, system-ui"
      }
    } else {
      ctx.fillStyle = MUT
      ctx.font = "12px ui-sans-serif, system-ui"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText("哈希表：h(k)=k mod 7 把键映射到桶；冲突用链地址法挂链表", 118, 32)
    }

    // 桶数组 + 链
    for (let b = 0; b < M; b++) {
      const by = y0 + b * (bh + gapY)
      const isCur = b === curBucket && p <= total
      // 桶
      ctx.fillStyle = isCur ? "rgba(245,158,11,0.25)" : isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)"
      ctx.fillRect(x0, by, bw, bh)
      ctx.strokeStyle = isCur ? "#f59e0b" : isDark ? "#3f3f46" : "#d4d4d8"
      ctx.lineWidth = isCur ? 2 : 1
      ctx.strokeRect(x0, by, bw, bh)
      ctx.fillStyle = MUT
      ctx.font = "12px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(`[${b}]`, x0 + bw / 2, by + bh / 2)
      // 链节点
      const chain = buckets[b]
      for (let n = 0; n < chain.length; n++) {
        const nx = x0 + bw + 22 + n * (nodeW + nodeGap)
        const ny = by
        // 箭头
        ctx.strokeStyle = isDark ? "#52525b" : "#a1a1aa"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(n === 0 ? x0 + bw : nx - nodeGap, ny + bh / 2)
        ctx.lineTo(nx, ny + bh / 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(nx, ny + bh / 2)
        ctx.lineTo(nx - 5, ny + bh / 2 - 3.5)
        ctx.lineTo(nx - 5, ny + bh / 2 + 3.5)
        ctx.closePath()
        ctx.fillStyle = isDark ? "#52525b" : "#a1a1aa"
        ctx.fill()
        // 节点框
        const isNew = isCur && n === chain.length - 1
        ctx.fillStyle = isNew ? "#f59e0b" : "#6366f1"
        ctx.fillRect(nx, ny + 3, nodeW, bh - 6)
        ctx.fillStyle = "#fff"
        ctx.font = "600 13px ui-monospace, monospace"
        ctx.textAlign = "center"
        ctx.fillText(String(chain[n]), nx + nodeW / 2, ny + bh / 2)
      }
    }

    // 待插入队列
    ctx.fillStyle = MUT
    ctx.font = "11px ui-sans-serif, system-ui"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("插入序列：", x0, cssH - 18)
    let qx = x0 + 70
    KEYS.forEach((k, i) => {
      const inserted = i < p
      ctx.fillStyle = inserted ? (isDark ? "#3f3f46" : "#d4d4d8") : i === p ? "#f59e0b" : FG
      ctx.font = i === p ? "600 13px ui-monospace, monospace" : "13px ui-monospace, monospace"
      ctx.fillText(String(k), qx, cssH - 18)
      qx += String(k).length * 9 + 12
    })
  }, [applyViewport, total])

  useEffect(() => {
    const tick = (now: number) => {
      if (playingRef.current && now - lastRef.current > STEP_MS) {
        lastRef.current = now
        if (posRef.current < total) setPos((p) => p + 1)
        else setPlaying(false)
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, total])

  const done = pos >= total
  const handleReset = useCallback(() => {
    setPlaying(false)
    setPos(0)
  }, [])
  const handleStep = useCallback(() => {
    if (posRef.current < total) setPos((p) => p + 1)
  }, [total])
  const togglePlay = useCallback(() => {
    if (done) {
      setPos(0)
      requestAnimationFrame(() => setPlaying(true))
      return
    }
    setPlaying((p) => !p)
  }, [done])

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
        total + 1,
        [
          "哈希表想做到近乎 O(1) 的存取:给每个键算一个哈希值,直接定位到数组下标,不用一个个找。这里用最简单的哈希函数 h(k)=k mod 7,余数几就放进几号桶。",
          "一个个插入。算出下标,就把键放进对应的桶里。前几个键各去各的桶,干脆利落。",
          "麻烦在「冲突」:不同的键算出了同一个下标,比如这两个都该进同一个桶。链地址法的办法是——每个桶挂一条链表,冲突了就接到链子尾巴上(橙色高亮)。",
          "查找时也一样:先算下标定位到桶,再沿那条短链逐个比。只要哈希函数够均匀、链都很短,平均依然接近 O(1);可一旦冲突扎堆、链拉得老长,就退化成线性查找——所以要好的哈希函数,并在装太满时扩容。",
        ],
        (i) => setPos(i)
      ),
  })

  const caption = done
    ? "全部插入完毕：冲突的键挂在同一桶的链表上。哈希均匀+链短 → 平均 O(1)；链太长则退化，需好哈希+扩容。"
    : pos === 0
      ? "哈希表 h(k)=k mod 7：算下标直接定位桶。点播放逐个插入，看冲突如何挂链。"
      : `插入 ${KEYS[Math.min(pos, total) - 1]}：h=${h(KEYS[Math.min(pos, total) - 1])}，` + (() => {
          const b: number[] = []
          for (let i = 0; i < pos; i++) if (h(KEYS[i]) === h(KEYS[pos - 1])) b.push(KEYS[i])
          return b.length > 1 ? "冲突 → 接到链尾。" : "放入空桶。"
        })()

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas ref={canvasRef} {...vp.canvasProps} className="w-full" style={{ height: 320, display: "block", ...vp.canvasProps.style }} />
        <ViewportControls vp={vp} />
        <div className="absolute top-2 right-3 text-[11px] font-mono text-[var(--muted-foreground)] bg-[var(--card)]/70 backdrop-blur rounded px-2 py-1">
          {Math.min(pos, total)} / {total}
        </div>
      </div>
      {!lecture && (
        <div className={`px-4 py-2.5 text-sm border-t border-[var(--border)] ${done ? "text-indigo-600 dark:text-indigo-400 font-medium" : ""}`}>{caption}</div>
      )}
      {!lecture && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
          <Button size="sm" onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {done ? "重新演示" : playing ? "暂停" : "播放"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={playing || done}>
            <SkipForward className="size-4" /> 单步（插一个）
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" /> 重置
          </Button>
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]">橙=刚插入/冲突挂链 · 链地址法</span>
        </div>
      )}
    </div>
  )
}
