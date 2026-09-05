/**
 * /tutor/voice ── 实时语音对话页（仿 ChatGPT 语音模式）。
 *
 * 状态机循环：
 *   idle → listening → thinking → speaking → listening → ...
 *
 * - 进页面保持暂停；只有用户明确点击后才申请麦克风并启动 ASR
 * - ASR vad_eos 2.5s 静默触发 → 拿到 final transcript → 调 /tutor/chat SSE
 * - SSE done → 拿到完整文本 → 调 /voice/tts → 播放 mp3
 * - mp3 onended → 自动回 listening 继续监听
 *
 * 打断：speaking 中保持 ASR 开着，partial 文字 ≥ 4 个非空字符时立刻停掉 audio，
 * 走下一轮（避免被 AI 自己回音误触发，echoCancellation + 长度阈值双保险）
 *
 * 数字讲师会话与文字助教历史隔离，按 user×course 持久化。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, MessageSquare, Pause, Play, Trash2, X, Bot, User, Mic2, AlertTriangle, RotateCcw } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/Markdown"
import type { VoiceOrbState } from "@/components/VoiceOrb"
import { VoiceSelector } from "@/components/VoiceSelector"
import { LearningMethodSelector } from "@/components/LearningMethodSelector"
import { ModelSelector } from "@/components/ModelSelector"
import { SiteFiling } from "@/components/SiteFiling"
import { LecturerAvatar } from "@/components/LecturerAvatar"
import { apiGet, apiPost, sseHeaders } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useVoiceTutorHistory, voiceTutorHistory } from "@/store/voiceTutorHistory"
import { getCurrentVoice } from "@/store/voice"
import { formatTutorDisplayContent } from "@/lib/tutorFormatting"
import { setTutorLearningMethod, useTutorLearningMethod } from "@/store/tutorLearningMethod"
import { tutorGenerationStore, useTutorGeneration } from "@/store/tutorGeneration"
import { prepareSpeechText } from "@/lib/speechText"
import { StreamingTtsPipeline } from "@/lib/ttsPipeline"
import { VoiceSessionGuard } from "@/lib/voiceSessionGuard"

// 打断阈值：speaking 中 partial 长度 ≥ 此值才认定为"用户在说话"，避免 AI 自己声音被采误触发
const INTERRUPT_MIN_LEN = 4
// ASR 静默自动结束（毫秒）
const VAD_EOS_MS = 2500

interface AsrUrlResponse {
  ws_url: string
  app_id: string
}

interface VoiceServiceStatus {
  asr_configured: boolean
  tts_configured: boolean
  tts_engine: string
  permission_policy: "user_gesture_only"
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
  const targetRole = useTargetRole()
  const courseId = course?.id ?? null
  const learningMethod = useTutorLearningMethod(USER_ID, courseId)
  const messages = useVoiceTutorHistory(USER_ID, courseId)
  const generation = useTutorGeneration(USER_ID, courseId)
  const streaming = generation.partial

  const [orbState, setOrbState] = useState<VoiceOrbState>("idle")
  const [partial, setPartial] = useState("")        // ASR 实时识别
  const [error, setError] = useState<string | null>(null)
  const [errorRetryable, setErrorRetryable] = useState(false)
  const [serviceStatus, setServiceStatus] = useState<VoiceServiceStatus | null>(null)
  const [serviceStatusFailed, setServiceStatusFailed] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [conversationStarted, setConversationStarted] = useState(false)

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
  const interruptingRef = useRef(false)
  const sessionGuardRef = useRef(new VoiceSessionGuard())
  const asrRetryTimerRef = useRef<number | null>(null)

  // TTS / LLM 相关
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsUrlRef = useRef<string | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  const ttsPipelineRef = useRef<StreamingTtsPipeline | null>(null)
  const streamedCharsRef = useRef(0)
  const voiceRunRef = useRef<string | null>(null)
  const previousGenerationStatusRef = useRef(generation.status)

  const unmountedRef = useRef(false)
  const handleUserFinalRef = useRef<(text: string) => void>(() => {})
  const startTtsRef = useRef<(text: string) => Promise<void>>(async () => {})
  const startAsrRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    orbStateRef.current = orbState
  }, [orbState])

  useEffect(() => {
    let active = true
    apiGet<VoiceServiceStatus>("/voice/status")
      .then((status) => {
        if (active) setServiceStatus(status)
      })
      .catch(() => {
        if (active) setServiceStatusFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const setVoiceState = useCallback((next: VoiceOrbState) => {
    orbStateRef.current = next
    setOrbState(next)
  }, [])

  // ===== 清理工具 =====
  const stopAsr = useCallback(() => {
    sessionGuardRef.current.invalidateAsr()
    if (asrRetryTimerRef.current !== null) {
      window.clearTimeout(asrRetryTimerRef.current)
      asrRetryTimerRef.current = null
    }
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
    ttsPipelineRef.current?.cancel()
    ttsPipelineRef.current = null
    sessionGuardRef.current.clearPipeline()
    streamedCharsRef.current = 0
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
    interruptingRef.current = false
    setPartial("")
  }, [stopAsr, stopTts])

  const scheduleAsrReconnect = useCallback((reason: string) => {
    if (unmountedRef.current || orbStateRef.current === "paused") return
    const retry = sessionGuardRef.current.registerAsrFailure(2)
    if (!retry.shouldRetry) {
      setErrorRetryable(true)
      setError(`${reason}，自动重连未成功，请点击重试`)
      setVoiceState("paused")
      return
    }
    setErrorRetryable(true)
    setError(`${reason}，正在进行第 ${retry.attempt} 次自动重连`)
    setVoiceState("listening")
    asrRetryTimerRef.current = window.setTimeout(() => {
      asrRetryTimerRef.current = null
      void startAsrRef.current()
    }, retry.attempt * 650)
  }, [setVoiceState])

  // ===== 启动 ASR =====
  const startAsr = useCallback(async () => {
    if (unmountedRef.current) return
    // 先彻底清掉旧的
    stopAsr()
    const sessionId = sessionGuardRef.current.currentAsrSession()
    setPartial("")
    mergerRef.current.reset()
    userIsSpeakingRef.current = false

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId) || orbStateRef.current === "paused") {
        microphone.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = microphone
    } catch (e) {
      if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId)) return
      setErrorRetryable(true)
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
      if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId)) return
      const reason = readableVoiceError(e, "暂时无法连接语音识别服务")
      stopAsr()
      scheduleAsrReconnect(reason)
      return
    }
    if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId)) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      if (!sessionGuardRef.current.isCurrentAsr(sessionId)) return
      try {
        const resp = JSON.parse(ev.data)
        if (resp.code !== 0) {
          setErrorRetryable(true)
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
            interruptingRef.current = true
            tutorGenerationStore.stop(USER_ID, courseId)
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
      if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId) || orbStateRef.current === "paused") return
      stopAsr()
      scheduleAsrReconnect("语音识别连接中断")
    }

    ws.onopen = async () => {
      if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId) || orbStateRef.current === "paused") {
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
        setErrorRetryable(false)
        setError(null)
        sessionGuardRef.current.resetAsrFailures()
        if (orbStateRef.current === "idle") setVoiceState("listening")
      } catch (e) {
        if (unmountedRef.current || !sessionGuardRef.current.isCurrentAsr(sessionId)) return
        const reason = readableVoiceError(e, "语音识别初始化失败")
        stopAsr()
        scheduleAsrReconnect(reason)
      }
    }
  }, [USER_ID, courseId, scheduleAsrReconnect, setVoiceState, stopAsr, stopTts])

  useEffect(() => {
    startAsrRef.current = startAsr
  }, [startAsr])

  // ===== ASR final → 调 LLM =====
  const handleUserFinal = useCallback((userText: string) => {
    if (unmountedRef.current) return
    if (orbStateRef.current === "paused") return
    if (tutorGenerationStore.get(USER_ID, courseId).status === "open") return
    const text = userText.trim()
    if (!text) return

    interruptingRef.current = false
    stopAsr()
    stopTts()
    setPartial("")
    voiceTutorHistory.append(USER_ID, courseId, { role: "user", content: text })
    setVoiceState("thinking")
    const hist = voiceTutorHistory.get(USER_ID, courseId)
    voiceRunRef.current = tutorGenerationStore.start({
      userId: USER_ID,
      courseId,
      targetRole: targetRole?.name,
      messages: hist,
      learningMethod,
      origin: "voice",
      historySink: voiceTutorHistory,
    })
  }, [USER_ID, courseId, learningMethod, setVoiceState, stopAsr, stopTts, targetRole?.name])

  // ===== TTS 播放（同时启 ASR 监听打断）=====
  const startTts = useCallback(async (text: string) => {
    if (unmountedRef.current) return
    const cleaned = prepareSpeechText(text)
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
      setErrorRetryable(false)
      setError(null)

      audio.onended = () => {
        if (unmountedRef.current) return
        stopTts()
        if (orbStateRef.current === "speaking") {
          setVoiceState("listening")
          void startAsr()
        }
      }
      audio.onerror = () => {
        if (unmountedRef.current) return
        setErrorRetryable(false)
        setError("语音播放失败，文字回答已完整保留")
        stopTts()
        if (orbStateRef.current === "speaking") {
          setVoiceState("listening")
          void startAsr()
        }
      }
      await audio.play()
      if (!unmountedRef.current) setVoiceState("speaking")
    } catch (e) {
      const err = e as Error
      if (err.name === "AbortError") return
      setErrorRetryable(false)
      setError(readableVoiceError(err, "语音合成暂时不可用，文字回答已完整保留"))
      if (!unmountedRef.current && orbStateRef.current === "thinking") {
        setVoiceState("listening")
        void startAsr()
      }
    }
  }, [setVoiceState, startAsr, stopTts])

  useEffect(() => {
    handleUserFinalRef.current = handleUserFinal
    startTtsRef.current = startTts
  }, [handleUserFinal, startTts])

  // LLM 流式增量一旦形成完整句就立刻进入 TTS；播放当前句时预取后两句。
  useEffect(() => {
    if (generation.status !== "open" || !voiceRunRef.current || !generation.runId) return
    const currentRunId = generation.runId
    if (ttsPipelineRef.current && !sessionGuardRef.current.pipelineBelongsTo(currentRunId)) stopTts()
    if (!ttsPipelineRef.current) {
      streamedCharsRef.current = 0
      const pipeline = new StreamingTtsPipeline({
        prefetch: 1,
        onPlaybackStart: () => {
          if (unmountedRef.current || orbStateRef.current === "paused") return
          setErrorRetryable(false)
          setError(null)
          setVoiceState("speaking")
          // 播放期间继续监听，用户开口即可打断剩余句子。
          if (!streamRef.current) void startAsr()
        },
        onDrain: () => {
          if (ttsPipelineRef.current !== pipeline) return
          ttsPipelineRef.current = null
          sessionGuardRef.current.clearPipeline(currentRunId)
          streamedCharsRef.current = 0
          if (unmountedRef.current || orbStateRef.current === "paused") return
          setVoiceState("listening")
          if (!streamRef.current) void startAsr()
        },
        onError: (err) => {
          if (unmountedRef.current) return
          setErrorRetryable(false)
          setError(readableVoiceError(err, "语音合成暂时不可用，文字回答已完整保留"))
        },
      })
      ttsPipelineRef.current = pipeline
      sessionGuardRef.current.bindPipeline(currentRunId)
    }
    const consumed = streamedCharsRef.current
    const delta = streaming.length >= consumed ? streaming.slice(consumed) : streaming
    streamedCharsRef.current = streaming.length
    if (delta) ttsPipelineRef.current.append(delta)
  }, [generation.runId, generation.status, setVoiceState, startAsr, stopTts, streaming])

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

    if (interruptingRef.current) {
      voiceRunRef.current = null
      return
    }
    const startedFromThisVoicePage = Boolean(voiceRunRef.current)
    voiceRunRef.current = null
    const last = voiceTutorHistory.get(USER_ID, courseId).at(-1)
    if (startedFromThisVoicePage && last?.role === "assistant" && last.delivery === "complete" && last.content.trim()) {
      setErrorRetryable(false)
      setError(null)
      if (ttsPipelineRef.current) {
        ttsPipelineRef.current.finish()
        return
      }
      void startTtsRef.current(last.content)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      if (unmountedRef.current || orbStateRef.current === "paused") return
      if (last?.role === "assistant" && last.delivery === "error") {
        setErrorRetryable(false)
        setError("回答生成中断，当前内容已保留，可以切换文字模式重试")
      }
      setVoiceState("listening")
      void startAsr()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [USER_ID, courseId, generation.status, setVoiceState, startAsr, stopAsr])

  // ===== 生命周期：进页面保持暂停，只有明确点击后才申请麦克风权限 =====
  useEffect(() => {
    unmountedRef.current = false
    const frame = window.requestAnimationFrame(() => {
      if (unmountedRef.current) return
      const generationOpen = tutorGenerationStore.get(USER_ID, courseId).status === "open"
      setConversationStarted(generationOpen)
      if (generationOpen) setVoiceState("thinking")
      else setVoiceState("paused")
    })
    return () => {
      window.cancelAnimationFrame(frame)
      unmountedRef.current = true
      stopAll()
    }
  }, [USER_ID, courseId, setVoiceState, stopAll])

  // 消息更新滚动
  useEffect(() => {
    const scroller = messageScrollRef.current
    if (!scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }, [messages, streaming])

  // ===== 控制按钮 =====
  const retryConnection = () => {
    stopAll()
    sessionGuardRef.current.resetAsrFailures()
    setErrorRetryable(false)
    setError(null)
    setConversationStarted(true)
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
    voiceTutorHistory.clear(USER_ID, courseId)
    setClearConfirmOpen(false)
    setConversationStarted(false)
    setVoiceState("paused")
  }

  const courseLabel = targetRole?.name ?? course?.name ?? "目标岗位"
  const isPaused = orbState === "paused"
  const pausedActionLabel = conversationStarted ? "继续对话" : "开始对话"
  const needsAnswerRecovery = messages.at(-1)?.role === "user" && generation.status !== "open" && !streaming

  if (!course) {
    return (
      <div className="paper-theme fixed inset-0 z-[80] grid place-items-center bg-[#F3F0E7] p-6 text-center" role="status">
        <div className="max-w-md rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] p-7 shadow-[0_18px_48px_rgba(24,35,45,.10)]">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#D8C9A8] bg-[#F4ECD8] text-[#8E6925]"><AlertTriangle className="size-5" /></span>
          <h1 className="mt-4 text-lg font-bold text-[#18232D]">{targetRole ? `${targetRole.name} 的语音岗位助教尚未开放` : "请先选择目标岗位"}</h1>
          <p className="mt-2 text-xs leading-6 text-[#66717B]">{targetRole ? "专属岗位知识库接入后才会开放语音对话，避免使用无关内容回答。岗位选择已经保留。" : "目标岗位决定语音助教的知识边界与会话归档。"}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate("/courses?returnTo=%2Ftutor%2Fvoice")} className="bg-[#244C66] text-white hover:bg-[#193B50]">{targetRole ? "更换已开放岗位" : "选择目标岗位"}</Button>
            <Button variant="outline" onClick={() => navigate(targetRole ? "/workspace" : "/tutor")} className="border-[#D7D1C4] bg-[#F8F6F0]">{targetRole ? "查看岗位状态" : "返回文字助教"}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="paper-theme fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#F3F0E7]">
      {/* 顶部栏 */}
      <header className="m-3 mb-0 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2.5 shadow-[0_8px_24px_rgba(24,35,45,.065)] sm:mx-5 sm:flex-nowrap sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={handleExit} className="text-[#66717B] hover:bg-[#E7EDF3] hover:text-[#315E83]">
            <ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">退出语音</span>
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="grid size-8 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><Mic2 className="size-4" /></span>
            <span className="hidden font-bold text-[#18232D] min-[390px]:inline">因材智训实时语音</span>
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
          <ModelSelector compact />
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
              <p className="mt-1.5 text-[12px] leading-5 text-[#66717B]">记录只会从当前数字讲师会话中删除，不影响文字助教历史；正在进行的识别或播报也会停止。此操作无法恢复。</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setClearConfirmOpen(false)} className="h-9 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-4 text-[11px] font-bold text-[#59636B] hover:bg-[#F1EDE4]">继续保留</button>
                <button type="button" onClick={confirmClear} className="h-9 rounded-xl bg-[#A05137] px-4 text-[11px] font-bold text-white hover:bg-[#873F2A]">确认清空</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主区：真人讲师媒体舞台 + 消息列表 */}
      <main className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1.14fr)_minmax(380px,.86fr)] lg:items-center lg:overflow-hidden">
        {/* 左：真人讲师视频舞台 */}
        <section className="relative overflow-hidden rounded-[28px] border border-[#D8D1C4] bg-[#ECECE7] p-2 shadow-[0_18px_46px_rgba(24,35,45,.11)] sm:p-3">
          <DigitalHumanStage
            state={orbState}
            unavailable={serviceStatus?.asr_configured === false}
            preparingSpeech={orbState === "thinking" && generation.status !== "open"}
            conversationStarted={conversationStarted}
          />

          {/* 实时识别字幕与文字生成摘要 */}
          <div className="flex min-h-[54px] items-center justify-center px-4 py-2 text-center">
            <AnimatePresence mode="wait">
              {partial && (
                <motion.div
                  key="partial"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="line-clamp-2 text-sm font-bold leading-5 text-[#18232D]"
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
                  className="line-clamp-2 max-h-10 overflow-hidden text-xs leading-5 text-[var(--muted-foreground)]"
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
              {!partial && !streaming && orbState !== "listening" && (
                <motion.div
                  key="stage-caption"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.72 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] text-[#66717B]"
                >
                  真人讲师视频 · 当前岗位「{courseLabel}」
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 紧凑媒体工具带 */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-[18px] border border-[#D8D1C4] bg-[#FFFEFA]/92 px-2.5 py-2 shadow-[0_8px_22px_rgba(24,35,45,.07)]">
            <Button
              variant={isPaused ? "default" : "outline"}
              size="sm"
              onClick={togglePause}
              disabled={serviceStatus?.asr_configured === false}
              className={`min-w-[100px] disabled:cursor-not-allowed disabled:border-[#D7D1C4] disabled:bg-[#E4E0D7] disabled:text-[#8A8172] disabled:shadow-none ${isPaused ? "bg-[#244C66] text-[#FFFEFA] hover:bg-[#193B50]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#315E83] hover:bg-[#E7EDF3]"}`}
            >
              {serviceStatus?.asr_configured === false ? <><AlertTriangle className="size-3.5" /> 语音未配置</> : isPaused ? <><Play className="size-3.5" /> {pausedActionLabel}</> : <><Pause className="size-3.5" /> 暂停会话</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClearConfirmOpen(true)} disabled={generation.status === "open" || messages.length === 0} className="text-[#66717B] hover:bg-[#F4E8E2] hover:text-[#9A4E35]">
              <Trash2 className="size-3.5" /> 清空
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExit} className="text-[#66717B] hover:bg-[#F1EDE4] hover:text-[#18232D]">
              <X className="size-3.5" /> 退出
            </Button>
            {isPaused && !error && serviceStatus?.asr_configured !== false && <span className="basis-full text-center text-[9px] text-[#7A817F]">点击“{pausedActionLabel}”后才会申请麦克风权限</span>}
          </div>

          {/* 错误与服务状态 */}
          {error && (
            <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] px-3.5 py-2.5 text-center text-xs leading-5 text-[#9A4E35] sm:flex-row sm:text-left" role="alert">
              <AlertTriangle className="size-3.5 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
              {errorRetryable && <button type="button" onClick={retryConnection} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#D8B9AD] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#9A4E35] hover:bg-[#F9EEE9]"><RotateCcw className="size-3" />重试连接</button>}
            </div>
          )}
          {serviceStatus?.asr_configured === false && (
            <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] px-3.5 py-2.5 text-center text-[11px] leading-5 text-[#9A4E35] sm:flex-row sm:text-left" role="status">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1"><strong>演示降级：</strong>ASR 未配置，页面不会申请麦克风；现有文字回答仍可完整阅读{serviceStatus.tts_configured ? "，TTS 已配置但本页未主动调用" : "，TTS 也未配置"}。</span>
              <button type="button" onClick={() => navigate("/tutor")} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#D8B9AD] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#9A4E35] hover:bg-[#F9EEE9]"><MessageSquare className="size-3" />切换文字模式</button>
            </div>
          )}
          {serviceStatusFailed && !serviceStatus && (
            <p className="mt-3 text-center text-[10px] text-[#8A8172]">语音配置状态暂时无法读取；只有明确点击后才会申请麦克风。</p>
          )}
        </section>

        {/* 下：滚动消息列表 */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.065)] lg:h-full lg:max-h-[720px] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3">
            <div><h2 className="text-sm font-bold text-[#18232D]">数字讲师会话</h2><p className="mt-0.5 text-[10px] text-[#7A817F]">独立保存，不与文字助教记录混合</p></div>
            <span className="rounded-full bg-[#E9EEE6] px-2 py-1 text-[10px] font-bold text-[#557052]">{messages.length} 条</span>
          </div>
          <div ref={messageScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && !streaming && (
            <div className="grid min-h-full place-items-center py-10 text-center">
              <div>
                <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><MessageSquare className="size-5" /></span>
                <p className="mt-3 text-sm font-bold text-[#18232D]">{serviceStatus?.asr_configured === false ? "语音服务未配置，文字学习仍可继续" : "开口说话，开始这次学习对话"}</p>
                <p className="mt-1 text-[11px] text-[#7A817F]">{serviceStatus?.asr_configured === false ? "切换到文字模式，目标岗位、画像与历史记录都会保留" : "助教会自动识别、回答并朗读"}</p>
                {serviceStatus?.asr_configured === false && <button type="button" onClick={() => navigate("/tutor")} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D8C9A8] bg-[#FBF7ED] px-3 text-[10px] font-bold text-[#8E6925] hover:bg-[#F4ECD8]"><MessageSquare className="size-3.5" />继续文字学习</button>}
              </div>
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

function DigitalHumanStage({
  state,
  unavailable,
  preparingSpeech,
  conversationStarted,
}: {
  state: VoiceOrbState
  unavailable: boolean
  preparingSpeech: boolean
  conversationStarted: boolean
}) {
  const meta: Record<VoiceOrbState, { label: string; detail: string; tone: string }> = {
    idle: { label: "准备就绪", detail: "点击下方“开始对话”即可提问", tone: "bg-[#7A817F]" },
    listening: { label: "正在聆听", detail: "请自然地说出你的问题", tone: "bg-[#6F8A69]" },
    thinking: preparingSpeech
      ? { label: "准备朗读", detail: "语音正在合成，视频尚未进入讲解状态", tone: "bg-[#B1842C]" }
      : { label: "正在思考", detail: "正在组织更清楚的讲解", tone: "bg-[#B1842C]" },
    speaking: { label: "正在讲解", detail: "你可以随时开口打断", tone: "bg-[#315E83]" },
    paused: conversationStarted
      ? { label: "已暂停", detail: "点击下方“继续对话”恢复会话", tone: "bg-[#9A4E35]" }
      : { label: "准备开始", detail: "点击下方“开始对话”即可提问", tone: "bg-[#6F8A69]" },
  }
  const current = unavailable
    ? { label: "演示降级", detail: "语音识别未配置，请使用文字模式", tone: "bg-[#9A4E35]" }
    : meta[state]

  return (
    <div
      className="relative aspect-video w-full shrink-0 select-none overflow-hidden rounded-[22px] bg-[#D7DAD7] shadow-[inset_0_0_0_1px_rgba(255,255,255,.45)]"
      aria-label={`真人讲师视频：${current.label}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,.2),transparent_58%)]" />
      <LecturerAvatar
        voiceState={state}
        talking={state === "speaking"}
        preparingSpeech={preparingSpeech}
        showLabel={false}
        className="pointer-events-none absolute inset-0"
        mediaClassName="h-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[28%] bg-gradient-to-t from-[#152530]/72 via-[#1B2D38]/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-[2] rounded-[22px] ring-1 ring-inset ring-white/25" />

      <motion.div
        className="pointer-events-none absolute right-4 top-4 z-10 max-w-[220px] rounded-2xl bg-[#142631]/78 px-3 py-2.5 text-white shadow-[0_10px_28px_rgba(10,20,27,.2)] backdrop-blur-md sm:right-5 sm:top-5"
        animate={{ y: state === "speaking" ? [0, -2, 0] : 0 }}
        transition={{ repeat: state === "speaking" ? Infinity : 0, duration: 1.2 }}
      >
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full border border-white/70 ${current.tone} ${state === "listening" || state === "speaking" || state === "thinking" ? "animate-pulse" : ""}`} />
          <span className="text-[10px] font-bold tracking-[0.04em] text-white/72">真人讲师</span>
          <span className="text-white/45">·</span>
          <span className="text-[11px] font-bold text-white">{current.label}</span>
        </div>
        <p className="mt-1 text-[9px] leading-4 text-white/68">{current.detail}</p>
      </motion.div>

      <span className="pointer-events-none absolute bottom-4 left-16 z-10 text-[9px] font-semibold tracking-[0.12em] text-white/68 sm:left-20">
        REAL LECTURER VIDEO
      </span>
      {state === "speaking" && (
        <div className="pointer-events-none absolute bottom-3.5 right-4 z-10 flex items-end gap-1 rounded-full bg-[#10232D]/58 px-3 py-2 shadow-sm backdrop-blur sm:right-5">
          {[10, 17, 13, 21, 15, 9].map((height, index) => (
            <motion.span
              key={index}
              className="w-1 rounded-full bg-[#DDECF4]"
              animate={{ height: [5, height, 6] }}
              transition={{ repeat: Infinity, duration: 0.65, delay: index * 0.07 }}
            />
          ))}
        </div>
      )}
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
