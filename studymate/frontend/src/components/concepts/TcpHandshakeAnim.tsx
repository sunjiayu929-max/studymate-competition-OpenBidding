/**
 * 概念动画 · TCP 三次握手（计算机网络旗舰）
 * ------------------------------------------------------------------
 * 真实协议时序：SYN → SYN+ACK → ACK，三步建立连接。
 *   - 数据包在 客户端 / 服务端 两条竖线间飞行（rAF 插值）
 *   - 两端状态机实时更新（CLOSED→SYN_SENT→ESTABLISHED / LISTEN→SYN_RCVD→ESTABLISHED）
 *   - seq / ack 序号按真实规则推进（ack = 对方 seq + 1）
 *   - ▶播放 / ⏸暂停 / ⏭单步 / ↻重置
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ConceptAnimProps } from "./registry"
import { useCanvasViewport } from "./useCanvasViewport"
import { ViewportControls } from "./ViewportControls"
import { useLecture } from "./useLecture"

interface Packet {
  dir: "c2s" | "s2c" // 客户端→服务端 / 服务端→客户端
  label: string
  detail: string
  clientState: string
  serverState: string
  caption: string
}

const X = 100 // 客户端初始 seq
const Y = 300 // 服务端初始 seq

const PACKETS: Packet[] = [
  {
    dir: "c2s",
    label: "SYN",
    detail: `seq=${X}`,
    clientState: "SYN_SENT",
    serverState: "LISTEN",
    caption: `① 客户端发 SYN（seq=${X}），请求建立连接，进入 SYN_SENT`,
  },
  {
    dir: "s2c",
    label: "SYN + ACK",
    detail: `seq=${Y}, ack=${X + 1}`,
    clientState: "SYN_SENT",
    serverState: "SYN_RCVD",
    caption: `② 服务端回 SYN+ACK（seq=${Y}, ack=${X + 1}），确认并同步自己的序号，进入 SYN_RCVD`,
  },
  {
    dir: "c2s",
    label: "ACK",
    detail: `seq=${X + 1}, ack=${Y + 1}`,
    clientState: "ESTABLISHED",
    serverState: "ESTABLISHED",
    caption: `③ 客户端回 ACK（ack=${Y + 1}），双方进入 ESTABLISHED，连接建立 ✓`,
  },
]

export function TcpHandshakeAnim({ lecture = false, narrate, prepareNarration, replayNonce = 0, onLectureEnd }: ConceptAnimProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vp = useCanvasViewport(canvasRef)
  const applyViewport = vp.apply
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1) // -1 = 初始未开始；0/1/2 = 第几个包已完成
  const atEnd = step >= PACKETS.length - 1

  // 动画态
  const flyingRef = useRef<number | null>(null) // 正在飞的包 index
  const progRef = useRef(0) // 0..1 飞行进度
  const playingRef = useRef(playing)
  const stepRef = useRef(step)
  const rafRef = useRef(0)
  const settledAtRef = useRef(0)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    stepRef.current = step
  }, [step])

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
    applyViewport(ctx) // 真·视口：缩放/平移叠到场景
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const isDark = document.documentElement.classList.contains("dark")
    const line = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"
    const fg = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)"
    const muted = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)"

    const leftX = cssW * 0.2
    const rightX = cssW * 0.8
    const topY = 60
    const botY = cssH - 24

    // 当前两端状态
    const done = stepRef.current
    const clientState = done >= 0 ? PACKETS[done].clientState : "CLOSED"
    const serverState = done >= 0 ? PACKETS[done].serverState : "LISTEN"

    // 顶部端点标题 + 状态徽章
    ctx.textAlign = "center"
    ctx.fillStyle = fg
    ctx.font = "bold 13px ui-sans-serif, system-ui"
    ctx.fillText("客户端 Client", leftX, 26)
    ctx.fillText("服务端 Server", rightX, 26)
    const badge = (x: number, text: string, color: string) => {
      ctx.font = "11px ui-sans-serif, system-ui"
      const w = ctx.measureText(text).width + 16
      ctx.fillStyle = color
      ctx.globalAlpha = 0.15
      roundRect(ctx, x - w / 2, 34, w, 18, 9)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.fillText(text, x, 47)
    }
    const stColor = (s: string) =>
      s === "ESTABLISHED" ? "#10b981" : s === "CLOSED" || s === "LISTEN" ? muted : "#f59e0b"
    badge(leftX, clientState, stColor(clientState))
    badge(rightX, serverState, stColor(serverState))

    // 两条竖线
    ctx.strokeStyle = line
    ctx.lineWidth = 2
    ;[leftX, rightX].forEach((x) => {
      ctx.beginPath()
      ctx.moveTo(x, topY)
      ctx.lineTo(x, botY)
      ctx.stroke()
    })

    // 已完成的包：画成静态的斜箭头（带标签），按顺序往下排
    const slotH = (botY - topY - 30) / PACKETS.length
    const drawArrow = (i: number, prog: number) => {
      const p = PACKETS[i]
      const y0 = topY + 24 + i * slotH
      const y1 = y0 + slotH * 0.7
      const fromX = p.dir === "c2s" ? leftX : rightX
      const toX = p.dir === "c2s" ? rightX : leftX
      const curX = fromX + (toX - fromX) * prog
      const curY = y0 + (y1 - y0) * prog
      // 线
      ctx.strokeStyle = "#6366f1"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(fromX, y0)
      ctx.lineTo(curX, curY)
      ctx.stroke()
      // 包体（飞行中高亮）
      ctx.fillStyle = "#6366f1"
      roundRect(ctx, curX - 50, curY - 12, 100, 24, 6)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.font = "bold 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(p.label, curX, curY - 1)
      ctx.font = "10.5px ui-sans-serif, system-ui"
      ctx.fillText(p.detail, curX, curY + 9)
    }

    // 已落定的包画完整箭头
    for (let i = 0; i <= stepRef.current; i++) {
      if (flyingRef.current === i) continue
      drawArrow(i, 1)
    }
    // 正在飞的包
    if (flyingRef.current !== null) {
      drawArrow(flyingRef.current, progRef.current)
    }

    // 完成提示
    if (stepRef.current >= PACKETS.length - 1 && flyingRef.current === null) {
      ctx.fillStyle = "#10b981"
      ctx.font = "bold 13px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText("✓ 连接已建立，可以传数据了", cssW / 2, botY + 16)
    }
  }, [applyViewport])

  // 开始飞下一个包
  const flyNext = useCallback(() => {
    const next = stepRef.current + 1
    if (next >= PACKETS.length) return
    flyingRef.current = next
    progRef.current = 0
  }, [])

  // 主循环
  useEffect(() => {
    const FLY_MS = 900
    const PAUSE_MS = 450
    let flyStart = 0
    const tick = (now: number) => {
      if (flyingRef.current !== null) {
        if (flyStart === 0) flyStart = now
        const t = Math.min(1, (now - flyStart) / FLY_MS)
        progRef.current = t
        if (t >= 1) {
          const landed = flyingRef.current
          flyingRef.current = null
          flyStart = 0
          settledAtRef.current = now
          setStep(landed)
          if (landed >= PACKETS.length - 1) {
            playingRef.current = false
            setPlaying(false)
          }
        }
      } else if (
        playingRef.current &&
        stepRef.current < PACKETS.length - 1 &&
        now - settledAtRef.current > PAUSE_MS
      ) {
        flyStart = 0
        flyNext()
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, flyNext])

  const handleReset = useCallback(() => {
    setPlaying(false)
    playingRef.current = false
    flyingRef.current = null
    progRef.current = 0
    settledAtRef.current = 0
    setStep(-1)
  }, [])

  const handleStep = useCallback(() => {
    if (flyingRef.current !== null || atEnd) return
    flyNext()
  }, [flyNext, atEnd])

  const togglePlay = useCallback(() => {
    if (atEnd) {
      handleReset()
      requestAnimationFrame(() => {
        settledAtRef.current = 0
        setPlaying(true)
        playingRef.current = true
      })
      return
    }
    setPlaying((p) => !p)
  }, [atEnd, handleReset])

  // 讲课模式：三次握手 = 三拍，每拍把画面停在对应步骤、念完这句再进下一步（音画同步）
  useLecture({
    lecture,
    replayNonce,
    narrate,
    prepareNarration,
    onLectureEnd,
    onEnter: () => {
      setPlaying(false)
      playingRef.current = false
      flyingRef.current = null
    },
    buildBeats: () => [
      {
        apply: () => setStep(0),
        text: "建立 TCP 连接，得先握三次手。第一次，客户端给服务端发一个 SYN 包，意思是「我想跟你建立连接」，同时带上自己的初始序号。发完它就进入 SYN_SENT 状态、等回应。",
      },
      {
        apply: () => setStep(1),
        text: "服务端收到了，回一个 SYN 加 ACK。这一步它干了两件事：ACK 是确认收到了你的请求，SYN 是把自己的序号也告诉你。现在服务端进入 SYN_RCVD。",
      },
      {
        apply: () => setStep(2),
        text: "最后，客户端再回一个 ACK，确认收到服务端的序号。到这儿双方都进入 ESTABLISHED，连接就正式建立、可以开始传数据了。为什么非得三次？两次没法确认双方收发能力都正常，四次又多余，三次刚刚好。",
      },
    ],
  })

  const caption =
    step >= 0 ? PACKETS[step].caption : "准备建立 TCP 连接。点「播放」看三次握手如何同步双方序号。"

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="relative bg-[var(--background)]">
        <canvas
          ref={canvasRef}
          {...vp.canvasProps}
          className="w-full"
          style={{ height: 320, display: "block", ...vp.canvasProps.style }}
        />
        <ViewportControls vp={vp} />
      </div>

      {/* 讲课模式下隐藏自带字幕条，交给播放器大字幕（避免重复） */}
      {!lecture && <div className="px-4 py-2.5 text-sm border-t border-[var(--border)]">{caption}</div>}

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
          为什么是三次：两次不够确认「双方收发能力都正常」，四次冗余 → 三次刚好
        </span>
      </div>
      )}
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
