/**
 * 麦克风按钮：录音 → 讯飞 IAT WS 流式 ASR → onTranscript 回调。
 *
 * 流程：
 *   click → POST /api/voice/asr-url 拿带签名的 ws_url
 *   → new WebSocket(ws_url)
 *   → getUserMedia 拿麦 → AudioContext + ScriptProcessor → 重采样 16k 16bit mono PCM
 *   → 第一帧附 common/business 配置 + status=0；中间帧 status=1；尾帧 status=2 (audio: "")
 *   → 服务端推 result.ws 词列表 + pgs(apd/rpl) 修正标志
 *
 * 父组件用 onTranscript(text, isFinal) 拿到合并后的累积文本。
 */
import { useEffect, useRef, useState } from "react"
import { Mic, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { apiPost } from "@/lib/api"

type State = "idle" | "connecting" | "recording"

interface AsrUrlResponse {
  ws_url: string
  app_id: string
}

interface Props {
  onTranscript: (text: string, isFinal: boolean) => void
  onError?: (err: Error) => void
  size?: "sm" | "md"
  className?: string
  /** 静默自动结束阈值（毫秒），默认 3000（讯飞 vad_eos）*/
  vadEos?: number
  /** 录音开始/结束钩子（外层显示「正在听...」气泡用）*/
  onStateChange?: (recording: boolean) => void
  /** Increment to start recording from a parent-controlled conversation mode. */
  activationToken?: number
  /** Increment to stop recording from a parent-controlled conversation mode. */
  stopToken?: number
}

/** 讯飞 wpgs 合并：sn → 句子，pgs=rpl 时按 rg 范围替换 */
class TranscriptMerger {
  private segments = new Map<number, string>()

  apply(payload: { result?: { ws?: Array<{ cw?: Array<{ w: string }> }>; sn?: number; pgs?: string; rg?: [number, number] } }): string {
    const result = payload.result
    if (!result) return this.full()
    const ws = result.ws || []
    const sn = result.sn ?? 0
    const text = ws.map((w) => (w.cw || []).map((c) => c.w).join("")).join("")
    if (result.pgs === "rpl" && result.rg && result.rg.length === 2) {
      for (let i = result.rg[0]; i <= result.rg[1]; i++) this.segments.delete(i)
    }
    this.segments.set(sn, text)
    return this.full()
  }

  full(): string {
    return Array.from(this.segments.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => t)
      .join("")
  }

  reset() {
    this.segments.clear()
  }
}

export function MicButton({ onTranscript, onError, size = "sm", className = "", vadEos = 3000, onStateChange, activationToken = 0, stopToken = 0 }: Props) {
  const [state, setState] = useState<State>("idle")

  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const sentFirstRef = useRef(false)
  const mergerRef = useRef(new TranscriptMerger())
  const stoppingRef = useRef(false)
  const startRef = useRef<() => void>(() => {})
  const stopExternalRef = useRef<() => void>(() => {})
  const lastActivationRef = useRef(activationToken)
  const lastStopRef = useRef(stopToken)

  const cleanup = (notify: boolean) => {
    if (procRef.current) {
      try { procRef.current.disconnect() } catch { /* ignore */ }
      procRef.current.onaudioprocess = null
      procRef.current = null
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect() } catch { /* ignore */ }
      sourceRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current) {
      try { ctxRef.current.close() } catch { /* ignore */ }
      ctxRef.current = null
    }
    sentFirstRef.current = false
    setState("idle")
    if (notify) onStateChange?.(false)
  }

  const stop = () => {
    if (stoppingRef.current) return
    stoppingRef.current = true

    const ws = wsRef.current
    // 先停采集，避免发尾帧时再有新数据
    if (procRef.current) {
      try { procRef.current.disconnect() } catch { /* ignore */ }
      procRef.current.onaudioprocess = null
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" },
        }))
      } catch { /* ignore */ }
      // 留 600ms 让讯飞回最后的 final 结果再断
      setTimeout(() => {
        try { ws.close() } catch { /* ignore */ }
        wsRef.current = null
        cleanup(true)
        stoppingRef.current = false
      }, 600)
    } else {
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
        wsRef.current = null
      }
      cleanup(true)
      stoppingRef.current = false
    }
  }

  useEffect(() => {
    return () => {
      stoppingRef.current = false
      if (wsRef.current) try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
      cleanup(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    setState("connecting")
    mergerRef.current.reset()

    let appId: string
    let wsUrl: string
    try {
      const r = await apiPost<AsrUrlResponse>("/voice/asr-url")
      appId = r.app_id
      wsUrl = r.ws_url
    } catch (e) {
      setState("idle")
      onError?.(e as Error)
      return
    }

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const resp = JSON.parse(ev.data)
        if (resp.code !== 0) {
          onError?.(new Error(`讯飞 ASR code=${resp.code} msg=${resp.message || ""}`))
          stop()
          return
        }
        const merged = mergerRef.current.apply(resp.data || {})
        const finalFlag = resp.data?.status === 2
        if (merged) onTranscript(merged, finalFlag)
        if (finalFlag) stop()
      } catch (e) {
        onError?.(e as Error)
      }
    }
    ws.onerror = () => {
      onError?.(new Error("ASR WS 连接错误"))
      stop()
    }
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
    }

    ws.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        streamRef.current = stream

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        ctxRef.current = ctx
        const sourceRate = ctx.sampleRate

        const source = ctx.createMediaStreamSource(stream)
        sourceRef.current = source

        const proc = ctx.createScriptProcessor(4096, 1, 1)
        procRef.current = proc
        source.connect(proc)
        proc.connect(ctx.destination)

        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const input = e.inputBuffer.getChannelData(0)
          const ds = downsample(input, sourceRate, 16000)
          const pcm = floatToInt16(ds)
          const b64 = arrayBufferToBase64(pcm.buffer)

          const frame = sentFirstRef.current
            ? { data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: b64 } }
            : {
                common: { app_id: appId },
                business: {
                  language: "zh_cn",
                  domain: "iat",
                  accent: "mandarin",
                  vad_eos: vadEos,
                  dwa: "wpgs",
                  ptt: 1,
                },
                data: { status: 0, format: "audio/L16;rate=16000", encoding: "raw", audio: b64 },
              }
          sentFirstRef.current = true
          try { ws.send(JSON.stringify(frame)) } catch { /* ignore */ }
        }

        setState("recording")
        onStateChange?.(true)
      } catch (e) {
        onError?.(e as Error)
        stop()
      }
    }
  }

  const handleClick = () => {
    if (state === "recording" || state === "connecting") stop()
    else start()
  }

  startRef.current = () => { if (state === "idle") void start() }
  stopExternalRef.current = () => { if (state !== "idle") stop() }

  useEffect(() => {
    if (activationToken === lastActivationRef.current) return
    lastActivationRef.current = activationToken
    if (activationToken > 0) startRef.current()
  }, [activationToken])

  useEffect(() => {
    if (stopToken === lastStopRef.current) return
    lastStopRef.current = stopToken
    if (stopToken > 0) stopExternalRef.current()
  }, [stopToken])

  const sz = size === "md" ? "w-9 h-9" : "w-8 h-8"
  const iconSz = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"
  const title = state === "recording" ? "停止录音" : state === "connecting" ? "连接中…" : "语音输入"

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.9 }}
      title={title}
      className={`${sz} relative inline-flex items-center justify-center rounded-full transition-colors ${
        state === "recording"
          ? "bg-red-500 text-white"
          : state === "connecting"
          ? "bg-[var(--card)] border border-[var(--primary)] text-[var(--primary)]"
          : "bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
      } ${className}`}
      animate={state === "recording" ? { boxShadow: ["0 0 0 0 rgba(239,68,68,0.5)", "0 0 0 8px rgba(239,68,68,0)"] } : { boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
      transition={state === "recording" ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
    >
      {state === "connecting" ? <Loader2 className={`${iconSz} animate-spin`} /> : <Mic className={iconSz} />}
    </motion.button>
  )
}

// ===== PCM utilities =====

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const newLen = Math.floor(input.length / ratio)
  const out = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio)
    out[i] = input[idx] ?? 0
  }
  return out
}

function floatToInt16(buf: Float32Array): Int16Array {
  const out = new Int16Array(buf.length)
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function arrayBufferToBase64(buf: ArrayBufferLike): string {
  let binary = ""
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}
