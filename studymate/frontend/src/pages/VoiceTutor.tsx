/**
 * /tutor/voice ── 实时语音对话页（仿 ChatGPT 语音模式）。
 *
 * 状态机循环：
 *   idle → listening → thinking → speaking → listening → ...
 *
 * - 进页面自动启 ASR（用户允许麦后即开始）
 * - ASR vad_eos 2.5s 静默触发 → 拿到 final transcript → 调 /tutor/chat SSE
 * - SSE done → 拿到完整文本 → 调 /voice/tts → 播放 mp3
 * - mp3 onended → 自动回 listening 继续监听
 *
 * 打断：speaking 中保持 ASR 开着，partial 文字 ≥ 4 个非空字符时立刻停掉 audio，
 * 走下一轮（避免被 AI 自己回音误触发，echoCancellation + 长度阈值双保险）
 *
 * 历史与 TutorChat 共享 store/tutorHistory，按 user×course 隔离，刷新不丢。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, MessageSquare, Pause, Play, Trash2, X, Bot, User, Mic2, AlertTriangle, RotateCcw } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/Markdown"
import { VoiceOrb, type VoiceOrbState } from "@/components/VoiceOrb"
import { VoiceSelector } from "@/components/VoiceSelector"
import { LearningMethodSelector } from "@/components/LearningMethodSelector"
import { SiteFiling } from "@/components/SiteFiling"
import { apiPost, sseHeaders } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"
import { useCurrentCourse } from "@/store/course"
import { useTutorHistory, tutorHistory } from "@/store/tutorHistory"
import { getCurrentVoice } from "@/store/voice"
import { formatTutorDisplayContent } from "@/lib/tutorFormatting"
import { setTutorLearningMethod, useTutorLearningMethod } from "@/store/tutorLearningMethod"
import { tutorGenerationStore, useTutorGeneration } from "@/store/tutorGeneration"

// 打断阈值：speaking 中 partial 长度 ≥ 此值才认定为"用户在说话"，避免 AI 自己声音被采误触发
const INTERRUPT_MIN_LEN = 4
// ASR 静默自动结束（毫秒）
const VAD_EOS_MS = 2500

interface AsrUrlResponse {
  ws_url: string
  app_id: string
}

// 讯飞 wpgs 合并：sn → 句子，pgs=rpl 时按 rg 范围替换
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
  full() { return Array.from(this.segments.entries()).sort((a, b) => a[0] - b[0]).map(([, t]) => t).join("") }
  reset() { this.segments.clear() }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "（此处省略代码块）")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, "（数学公式）")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)] ?? 0
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

function readableVoiceError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || /permission|denied|不允许|授权/iu.test(raw)) return "麦克风权限未开启，请在浏览器地址栏允许后重试"
  if (name === "NotFoundError" || /device.*not found|找不到.*麦克风/iu.test(raw)) return "没有检测到可用麦克风，请连接设备后重试"
  if (name === "NotReadableError" || /could not start|占用/iu.test(raw)) return "麦克风可能正被其他应用占用，请关闭占用后重试"
  if (/401|未登录|会话失效/iu.test(raw)) return "登录状态已失效，请重新登录后再使用语音助教"
  if (/503|未配置|尚未配置/iu.test(raw)) return "语音服务尚未就绪，请检查服务配置后重试"
  if (/network|failed to fetch|websocket|连接|connection/iu.test(raw)) return "语音连接暂时不可用，请检查网络后重试"
  return /[\u3400-\u9fff]/u.test(raw) ? raw.slice(0, 160) : fallback
}

export function VoiceTutor() {
  useTrackPage("tutor_voice")
  const navigate = useNavigate()
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseId = course?.id ?? null
  const learningMethod = useTutorLearningMethod(USER_ID, courseId)
  const messages = useTutorHistory(USER_ID, courseId)
  const generation = useTutorGeneration(USER_ID, courseId)
  const streaming = generation.partial

  const [orbState, setOrbState] = useState<VoiceOrbState>("idle")
  const [partial, setPartial] = useState("")        // ASR 实时识别
  const [error, setError] = useState<string | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const orbStateRef = useRef<VoiceOrbState>("idle")
  const messageScrollRef = useRef<HTMLDivElement>(null)

  // ASR 相关
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const sentFirstAsrRef = useRef(false)
  const mergerRef = useRef(new TranscriptMerger())
  const userIsSpeakingRef = useRef(false)  // speaking 中是否已经触发了打断
  const asrSessionRef = useRef(0)

  // TTS / LLM 相关
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsUrlRef = useRef<string | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  const voiceRunRef = useRef<string | null>(null)
  const previousGenerationStatusRef = useRef(generation.status)

  const unmountedRef = useRef(false)
  const handleUserFinalRef = useRef<(text: string) => void>(() => {})
  const startTtsRef = useRef<(text: string) => Promise<void>>(async () => {})

  useEffect(() => {
    orbStateRef.current = orbState
  }, [orbState])

  const setVoiceState = useCallback((next: VoiceOrbState) => {
    orbStateRef.current = next
    setOrbState(next)
  }, [])

  // ===== 清理工具 =====
  const stopAsr = useCallback(() => {
    asrSessionRef.current += 1
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
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch { /* ignore */ }
      audioCtxRef.current = null
    }
    if (wsRef.current) {
      const ws = wsRef.current
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" } }))
        }
      } catch { /* ignore */ }
      try { ws.close() } catch { /* ignore */ }
      wsRef.current = null
    }
    sentFirstAsrRef.current = false
    mergerRef.current.reset()
    userIsSpeakingRef.current = false
  }, [])

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      const audio = ttsAudioRef.current
      audio.onended = null
      audio.onerror = null
      try { audio.pause() } catch { /* ignore */ }
      audio.removeAttribute("src")
      ttsAudioRef.current = null
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current)
      ttsUrlRef.current = null
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort()
      ttsAbortRef.current = null
    }
  }, [])

  const stopAll = useCallback(() => {
    stopAsr()
    stopTts()
    setPartial("")
  }, [stopAsr, stopTts])

  // ===== 启动 ASR =====
  const startAsr = useCallback(async () => {
    if (unmountedRef.current) return
    // 先彻底清掉旧的
    stopAsr()
    const sessionId = asrSessionRef.current
    setPartial("")
    mergerRef.current.reset()
    userIsSpeakingRef.current = false

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      if (unmountedRef.current || sessionId !== asrSessionRef.current || orbStateRef.current === "paused") {
        microphone.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = microphone
    } catch (e) {
      if (unmountedRef.current || sessionId !== asrSessionRef.current) return
      setError(readableVoiceError(e, "无法启动麦克风，请检查设备后重试"))
      setVoiceState("paused")
      stopAsr()
      return
    }

    let appId: string, wsUrl: string
    try {
      const r = await apiPost<AsrUrlResponse>("/voice/asr-url")
      appId = r.app_id; wsUrl = r.ws_url
    } catch (e) {
      if (unmountedRef.current || sessionId !== asrSessionRef.current) return
      setError(readableVoiceError(e, "暂时无法连接语音识别服务，请稍后重试"))
      setVoiceState("paused")
      stopAsr()
      return
    }
    if (unmountedRef.current || sessionId !== asrSessionRef.current) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      if (sessionId !== asrSessionRef.current) return
      try {
        const resp = JSON.parse(ev.data)
        if (resp.code !== 0) {
          setError(readableVoiceError(resp.message, "语音识别服务返回异常，请重试"))
          setVoiceState("paused")
          stopAsr()
          return
        }
        const merged = mergerRef.current.apply(resp.data || {})
        if (merged) {
          setPartial(merged)
          // speaking 中检测打断：partial 达到阈值 → 立刻停 audio，把当前进度记到 ref
          if (orbStateRef.current === "speaking" && merged.length >= INTERRUPT_MIN_LEN && !userIsSpeakingRef.current) {
            userIsSpeakingRef.current = true
            stopTts()
            setVoiceState("listening")
          }
        }
        if (resp.data?.status === 2 && merged) {
          // 用户说完一句
          handleUserFinalRef.current(merged)
        }
      } catch { /* ignore */ }
    }
    ws.onerror = () => {
      if (unmountedRef.current || sessionId !== asrSessionRef.current || orbStateRef.current === "paused") return
      setError("语音识别连接中断，点击重试即可继续")
      setVoiceState("paused")
      stopAsr()
    }

    ws.onopen = async () => {
      if (unmountedRef.current || sessionId !== asrSessionRef.current || orbStateRef.current === "paused") {
        try { ws.close() } catch { /* ignore */ }
        return
      }
      try {
        const stream = streamRef.current
        if (!stream) throw new Error("麦克风连接已释放")
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        if (ctx.state === "suspended") await ctx.resume()
        audioCtxRef.current = ctx
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
          const frame = sentFirstAsrRef.current
            ? { data: { status: 1, format: "audio/L16;rate=16000", encoding: "raw", audio: b64 } }
            : {
                common: { app_id: appId },
                business: { language: "zh_cn", domain: "iat", accent: "mandarin", vad_eos: VAD_EOS_MS, dwa: "wpgs", ptt: 1 },
                data: { status: 0, format: "audio/L16;rate=16000", encoding: "raw", audio: b64 },
              }
          sentFirstAsrRef.current = true
          try { ws.send(JSON.stringify(frame)) } catch { /* ignore */ }
        }
        setError(null)
        if (orbStateRef.current === "idle") setVoiceState("listening")
      } catch (e) {
        if (unmountedRef.current || sessionId !== asrSessionRef.current) return
        setError(readableVoiceError(e, "无法启动麦克风，请检查设备后重试"))
        setVoiceState("paused")
        stopAsr()
      }
    }
  }, [setVoiceState, stopAsr, stopTts])

  // ===== ASR final → 调 LLM =====
  const handleUserFinal = useCallback((userText: string) => {
    if (unmountedRef.current) return
    if (orbStateRef.current === "paused") return
    if (generation.status === "open") return
    const text = userText.trim()
    if (!text) return

    stopAsr()
    setPartial("")
    tutorHistory.append(USER_ID, courseId, { role: "user", content: text })
    setVoiceState("thinking")
    const hist = tutorHistory.get(USER_ID, courseId)
    voiceRunRef.current = tutorGenerationStore.start({
      userId: USER_ID,
      courseId,
      messages: hist,
      learningMethod,
      origin: "voice",
    })
  }, [USER_ID, courseId, generation.status, learningMethod, setVoiceState, stopAsr])

  // ===== TTS 播放（同时启 ASR 监听打断）=====
  const startTts = useCallback(async (text: string) => {
    if (unmountedRef.current) return
    const cleaned = stripMarkdown(text)
    if (!cleaned) {
      setVoiceState("listening")
      void startAsr()
      return
    }
    const ctrl = new AbortController()
    ttsAbortRef.current = ctrl
    try {
      const r = await fetch("/api/voice/tts", {
        method: "POST",
        headers: sseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: cleaned, voice: getCurrentVoice() }),
        signal: ctrl.signal,
      })
      if (!r.ok) {
        const detail = await r.text().catch(() => "")
        throw new Error(`TTS ${r.status}: ${detail.slice(0, 200)}`)
      }
      const blob = await r.blob()
      if (unmountedRef.current) return

      const url = URL.createObjectURL(blob)
      ttsUrlRef.current = url
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      setError(null)

      audio.onended = () => {
        if (unmountedRef.current) return
        stopTts()
        if (orbStateRef.current === "speaking") {
          setVoiceState("paused")
        }
      }
      audio.onerror = () => {
        if (unmountedRef.current) return
        setError("语音播放失败，文字回答已完整保留")
        stopTts()
        if (orbStateRef.current === "speaking") {
          setVoiceState("paused")
        }
      }
      await audio.play()
      if (!unmountedRef.current) setVoiceState("speaking")
    } catch (e) {
      const err = e as Error
      if (err.name === "AbortError") return
      setError(readableVoiceError(err, "语音合成暂时不可用，文字回答已完整保留"))
      if (!unmountedRef.current && orbStateRef.current === "thinking") {
        setVoiceState("paused")
      }
    }
  }, [setVoiceState, startAsr, stopTts])

  useEffect(() => {
    handleUserFinalRef.current = handleUserFinal
    startTtsRef.current = startTts
  }, [handleUserFinal, startTts])

  useEffect(() => {
    const previous = previousGenerationStatusRef.current
    previousGenerationStatusRef.current = generation.status
    if (generation.status === "open") {
      stopAsr()
      const frame = window.requestAnimationFrame(() => {
        if (!unmountedRef.current && orbStateRef.current !== "paused") setVoiceState("thinking")
      })
      return () => window.cancelAnimationFrame(frame)
    }
    if (previous !== "open" || unmountedRef.current || orbStateRef.current === "paused") return

    const startedFromThisVoicePage = Boolean(voiceRunRef.current)
    voiceRunRef.current = null
    const last = tutorHistory.get(USER_ID, courseId).at(-1)
    if (startedFromThisVoicePage && last?.role === "assistant" && last.delivery === "complete" && last.content.trim()) {
      setError(null)
      void startTtsRef.current(last.content)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (unmountedRef.current || orbStateRef.current === "paused") return
      if (last?.role === "assistant" && last.delivery === "error") {
        setError("回答生成中断，当前内容已保留，可以切换文字模式重试")
      }
      setVoiceState("listening")
      void startAsr()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [USER_ID, courseId, generation.status, setVoiceState, startAsr, stopAsr])

  // ===== 生命周期：进页面自动启动 =====
  useEffect(() => {
    unmountedRef.current = false
    const frame = window.requestAnimationFrame(() => {
      if (unmountedRef.current) return
      if (tutorGenerationStore.get(USER_ID, courseId).status === "open") setVoiceState("thinking")
      else void startAsr()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      unmountedRef.current = true
      stopAll()
    }
  }, [USER_ID, courseId, setVoiceState, startAsr, stopAll])

  // 消息更新滚动
  useEffect(() => {
    const scroller = messageScrollRef.current
    if (!scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }, [messages, streaming])

  // ===== 控制按钮 =====
  const retryConnection = () => {
    stopAll()
    setError(null)
    setVoiceState("listening")
    void startAsr()
  }

  const togglePause = () => {
    if (orbStateRef.current === "paused") {
      retryConnection()
    } else {
      tutorGenerationStore.stop(USER_ID, courseId)
      stopAll()
      setVoiceState("paused")
    }
  }

  const handleExit = () => {
    stopAll()
    navigate("/tutor")
  }

  const confirmClear = () => {
    if (generation.status === "open") return
    stopAll()
    tutorHistory.clear(USER_ID, courseId)
    setClearConfirmOpen(false)
    setVoiceState("paused")
  }

  const courseLabel = course?.name ?? "机器学习"
  const isPaused = orbState === "paused"
  const needsAnswerRecovery = messages.at(-1)?.role === "user" && generation.status !== "open" && !streaming

  return (
    <div className="paper-theme fixed inset-0 z-30 flex flex-col overflow-hidden bg-[#F3F0E7]">
      {/* 顶部栏 */}
      <header className="m-3 mb-0 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2.5 shadow-[0_8px_24px_rgba(24,35,45,.065)] sm:mx-5 sm:flex-nowrap sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={handleExit} className="text-[#66717B] hover:bg-[#E7EDF3] hover:text-[#315E83]">
            <ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">退出语音</span>
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="grid size-8 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><Mic2 className="size-4" /></span>
            <span className="hidden font-bold text-[#18232D] min-[390px]:inline">StudyMate 实时语音</span>
            <span className="hidden text-xs text-[var(--muted-foreground)] md:inline">·</span>
            <span className="hidden max-w-32 truncate text-xs text-[var(--muted-foreground)] md:inline">{courseLabel}</span>
          </div>
        </div>
        <div className="order-3 flex basis-full justify-center border-t border-[#E3DED3] pt-2 sm:order-none sm:basis-auto sm:border-0 sm:pt-0">
          <LearningMethodSelector
            value={learningMethod}
            onChange={(method) => setTutorLearningMethod(USER_ID, courseId, method)}
            variant="compact"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <VoiceSelector compact />
          <Button variant="ghost" size="sm" onClick={handleExit} className="text-[#66717B] hover:bg-[#F4ECD8] hover:text-[#8E6925]">
            <MessageSquare className="size-3.5" /> <span className="hidden sm:inline">文字模式</span>
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {clearConfirmOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-[#18232D]/22 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="voice-clear-title">
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} className="w-full max-w-[400px] rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] p-5 shadow-[0_24px_70px_rgba(24,35,45,.24)]">
              <span className="grid size-10 place-items-center rounded-xl bg-[#F4E8E2] text-[#A05137]"><Trash2 className="size-4" /></span>
              <h2 id="voice-clear-title" className="mt-4 text-base font-bold text-[#18232D]">清空这次语音对话？</h2>
              <p className="mt-1.5 text-[12px] leading-5 text-[#66717B]">对话记录会从当前课程中删除，正在进行的识别或播报也会停止。此操作无法恢复。</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setClearConfirmOpen(false)} className="h-9 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-4 text-[11px] font-bold text-[#59636B] hover:bg-[#F1EDE4]">继续保留</button>
                <button type="button" onClick={confirmClear} className="h-9 rounded-xl bg-[#A05137] px-4 text-[11px] font-bold text-white hover:bg-[#873F2A]">确认清空</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主区：圆球 + partial + 消息列表 */}
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.72fr)] lg:overflow-hidden">
        {/* 上：圆球 + partial */}
        <section className="relative flex min-h-[430px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] px-5 py-7 shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full border border-[#DDD4BF]" />
          <div className="pointer-events-none absolute -bottom-32 -right-20 size-80 rounded-full bg-[#E9EEE6]/65" />
          <div className="relative"><VoiceOrb state={orbState} size={190} /></div>

          {/* 实时识别字幕 */}
          <div className="mt-6 min-h-[2.5rem] max-w-2xl text-center px-4">
            <AnimatePresence mode="wait">
              {partial && (
                <motion.div
                  key="partial"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-base font-bold text-[#18232D]"
                >
                  「{partial}」
                </motion.div>
              )}
              {!partial && streaming && (
                <motion.div
                  key="streaming"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-[var(--muted-foreground)] max-h-20 overflow-hidden line-clamp-3"
                >
                  {streaming}
                </motion.div>
              )}
              {!partial && !streaming && orbState === "listening" && (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-[var(--muted-foreground)]"
                >
                  开口说话即可，AI 会自动回复并朗读
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mt-3 flex max-w-xl flex-col items-center gap-2 rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] px-3.5 py-2.5 text-center text-xs leading-5 text-[#9A4E35] sm:flex-row sm:text-left" role="alert">
              <AlertTriangle className="size-3.5 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
              <button type="button" onClick={retryConnection} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#D8B9AD] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#9A4E35] hover:bg-[#F9EEE9]"><RotateCcw className="size-3" />重试连接</button>
            </div>
          )}

          {/* 控制按钮组 */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant={isPaused ? "default" : "outline"}
              size="sm"
              onClick={togglePause}
              className={`min-w-[100px] ${isPaused ? "bg-[#244C66] text-[#FFFEFA] hover:bg-[#193B50]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#315E83] hover:bg-[#E7EDF3]"}`}
            >
              {isPaused ? <><Play className="size-3.5" /> 继续聆听</> : <><Pause className="size-3.5" /> 暂停会话</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClearConfirmOpen(true)} disabled={generation.status === "open" || messages.length === 0} className="text-[#66717B] hover:bg-[#F4E8E2] hover:text-[#9A4E35]">
              <Trash2 className="size-3.5" /> 清空对话
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExit} className="text-[#66717B] hover:bg-[#F1EDE4] hover:text-[#18232D]">
              <X className="size-3.5" /> 退出
            </Button>
          </div>
        </section>

        {/* 下：滚动消息列表 */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.065)] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3">
            <div><h2 className="text-sm font-bold text-[#18232D]">实时对话记录</h2><p className="mt-0.5 text-[10px] text-[#7A817F]">内容会同步保存到文字助教</p></div>
            <span className="rounded-full bg-[#E9EEE6] px-2 py-1 text-[10px] font-bold text-[#557052]">{messages.length} 条</span>
          </div>
          <div ref={messageScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && !streaming && (
            <div className="grid min-h-full place-items-center py-10 text-center">
              <div><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><MessageSquare className="size-5" /></span><p className="mt-3 text-sm font-bold text-[#18232D]">开口说话，开始这次学习对话</p><p className="mt-1 text-[11px] text-[#7A817F]">助教会自动识别、回答并朗读</p></div>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((m, i) => (
              <Line key={i} role={m.role} content={m.content} delivery={m.delivery} errorDetail={m.error_detail} onRecover={m.delivery === "error" || m.delivery === "stopped" ? () => navigate("/tutor") : undefined} />
            ))}
            {streaming && <Line role="assistant" content={streaming} streaming />}
            {needsAnswerRecovery && <Line role="assistant" content="" delivery="error" errorDetail="上一次问题尚未收到完整回答，切换文字模式即可原位重试。" onRecover={() => navigate("/tutor")} />}
          </div>
          </div>
        </section>
      </main>
      <SiteFiling compact />
    </div>
  )
}

function Line({
  role,
  content,
  streaming,
  delivery,
  errorDetail,
  onRecover,
}: {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
  delivery?: "complete" | "stopped" | "error"
  errorDetail?: string
  onRecover?: () => void
}) {
  const isUser = role === "user"
  const hasIssue = delivery === "error" || delivery === "stopped"
  const displayContent = isUser ? content : formatTutorDisplayContent(content)
  return (
    <div data-voice-message={role} className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-[#244C66] text-[#FFFEFA]" : "bg-[#F4ECD8] text-[#8E6925]"}`}>
        {isUser ? <User className="size-3" /> : <Bot className="size-3" />}
      </div>
      <div className={`min-w-0 max-w-[84%] overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${isUser ? "bg-[#244C66] text-[#FFFEFA]" : "border border-[#D7D1C4] bg-[#F8F6F0] text-[#18232D]"}`}>
        {displayContent && (
          isUser
            ? <span className="whitespace-pre-wrap break-words">{displayContent}</span>
            : <Markdown content={displayContent} className="text-sm leading-6" wrapLongContent />
        )}
        {streaming && <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse" />}
        {hasIssue && (
          <div className={`${content ? "mt-2 border-t border-[#D7D1C4] pt-2" : ""} text-[10px] leading-4 text-[#8B5B48]`}>
            <div className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" /><span>{delivery === "stopped" ? "本次回答已停止，当前内容已保留。" : errorDetail || "本次回答没有完整结束。"}</span></div>
            {onRecover && <button type="button" onClick={onRecover} className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-[#D7C1B8] bg-[#FFFEFA] px-2.5 text-[10px] font-bold text-[#244C66] hover:bg-[#E7EDF3]"><MessageSquare className="size-3" />转到文字模式重试</button>}
          </div>
        )}
      </div>
    </div>
  )
}
