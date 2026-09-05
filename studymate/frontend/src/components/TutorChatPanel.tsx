/**
 * AI 助教对话 Panel（左对话流 + 底部输入框），可复用：
 * - 全屏页 /tutor    → <TutorChatPanel variant="fullscreen" />
 * - 抽屉小精灵       → <TutorChatPanel variant="drawer" />
 * - 历史走 useTutorHistory 单例 store，与 VoiceTutor 共享
 * - 自动注入当前页面 page_context（store/tutorContext）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { AlertCircle, ArrowLeft, Send, Loader2, Bot, User, Paperclip, Trash2, X, FileText, Code2, Sparkles, History, MessageSquarePlus, MessageCircleMore, RotateCcw, Square, ScanLine } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Markdown } from "@/components/Markdown"
import { MicButton } from "@/components/MicButton"
import { SpeakerButton, type SpeakerStatus } from "@/components/SpeakerButton"
import { VoiceSelector } from "@/components/VoiceSelector"
import { TutorConversationPanel } from "@/components/TutorConversationPanel"
import { LearningMethodSelector } from "@/components/LearningMethodSelector"
import { ModelSelector } from "@/components/ModelSelector"
import { compressImage } from "@/lib/image"
import {
  useCurrentCourse,
  useCourseConfig,
  fallbackSamplesFor,
  DEFAULT_SAMPLE_QUESTIONS,
} from "@/store/course"
import { useCurrentUser } from "@/store/user"
import {
  useTutorHistory,
  useTutorConversations,
  tutorHistory,
  type TutorAttachment,
  type TutorMsg,
} from "@/store/tutorHistory"
import { useTutorPageContext } from "@/store/tutorContext"
import { useTargetRole } from "@/store/targetRole"
import { tutorGenerationStore, useTutorDraft, useTutorGeneration } from "@/store/tutorGeneration"
import { formatTutorDisplayContent } from "@/lib/tutorFormatting"
import type { DigitalHumanState } from "@/lib/digitalHuman"
import { prepareSpeechText } from "@/lib/speechText"
import { StreamingTtsPipeline } from "@/lib/ttsPipeline"
import {
  setTutorLearningMethod,
  useTutorLearningMethod,
  learningMethodLabel,
  type TutorLearningMethod,
} from "@/store/tutorLearningMethod"

type Variant = "fullscreen" | "drawer"

interface TutorChatPanelProps {
  variant?: Variant
  onMockChange?: (mock: boolean) => void
  showStarters?: boolean
  captureMode?: boolean
  onCaptureModeChange?: (enabled: boolean) => void
  onSpeechStatusChange?: (status: SpeakerStatus) => void
  onVoiceConversationStateChange?: (state: DigitalHumanState | null) => void
}

export function TutorChatPanel({
  variant = "fullscreen",
  onMockChange,
  showStarters = true,
  captureMode = false,
  onCaptureModeChange,
  onSpeechStatusChange,
  onVoiceConversationStateChange,
}: TutorChatPanelProps) {
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const courseCfg = useCourseConfig()
  const pageCtx = useTutorPageContext()

  const starters: string[] = courseCfg?.sample_questions?.length
    ? courseCfg.sample_questions
    : course
      ? fallbackSamplesFor(course.name).questions
      : DEFAULT_SAMPLE_QUESTIONS

  const courseLabel = targetRole?.name || course?.name || "目标岗位"
  const courseId = course?.id ?? null
  const learningMethod = useTutorLearningMethod(USER_ID, courseId)
  const generation = useTutorGeneration(USER_ID, courseId)
  const status = generation.status
  const streaming = generation.partial

  const persistedMessages = useTutorHistory(USER_ID, courseId)
  const conversations = useTutorConversations(USER_ID, courseId)
  const welcome: TutorMsg = useMemo(
    () => ({
      role: "assistant",
      content:
        learningMethod === "feynman"
          ? variant === "drawer"
            ? `我会结合当前页面和「${courseLabel}」，先讲清楚，再请你复述。你想先学什么？`
            : `可以问我「${courseLabel}」相关的能力、任务、代码或题目。你今天想先弄懂什么？`
          : variant === "drawer"
            ? `我会结合当前页面和「${courseLabel}」讲清关键点，再一次问一小步。你想从哪里开始？`
            : `可以问我「${courseLabel}」相关的能力、任务、代码或题目。我会一次带你解决一个问题。`,
    }),
    [courseLabel, learningMethod, variant]
  )
  const messages: TutorMsg[] = useMemo(
    () => (persistedMessages.length > 0 ? persistedMessages : [welcome]),
    [persistedMessages, welcome]
  )

  const [input, setInput] = useTutorDraft(USER_ID, courseId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 用户是否「贴着底部」：只有贴底时才跟随自动滚，否则上滑看历史不被打断
  const pinnedRef = useRef(true)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distToBottom < 80 // 距底 80px 内算贴底
  }, [])

  // 图片和文件都可以成为本轮上下文；文件先由后端安全提取文本。
  const MAX_IMAGES = 3
  const MAX_FILES = 3
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<TutorAttachment[]>([])
  const [imgBusy, setImgBusy] = useState(false)
  const [imgHint, setImgHint] = useState("")
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [conversationMode, setConversationMode] = useState(false)
  const [micActivationToken, setMicActivationToken] = useState(0)
  const [micStopToken, setMicStopToken] = useState(0)
  const conversationModeRef = useRef(false)
  const autoSpeechRef = useRef<StreamingTtsPipeline | null>(null)
  const lastAutoSpokenRef = useRef("")

  const handleLearningMethodChange = useCallback((method: TutorLearningMethod) => {
    setTutorLearningMethod(USER_ID, courseId, method)
    setImgHint(`已切换为${learningMethodLabel(method)}，从下一次回复开始生效`)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [USER_ID, courseId])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`
  }, [input])

  // 提示 2.5s 后自动消失
  useEffect(() => {
    if (!imgHint) return
    const t = setTimeout(() => setImgHint(""), 2500)
    return () => clearTimeout(t)
  }, [imgHint])

  useEffect(() => {
    if (generation.mock !== null) onMockChange?.(generation.mock)
  }, [generation.mock, onMockChange])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const images = files.filter((f) => f.type.startsWith("image/"))
      const documents = files.filter((f) => !f.type.startsWith("image/"))
      setImgBusy(true)
      try {
        const imageRoom = MAX_IMAGES - pendingImages.length
        if (images.length && imageRoom > 0) {
          const compressed = await Promise.all(images.slice(0, imageRoom).map((f) => compressImage(f)))
          setPendingImages((current) => [...current, ...compressed].slice(0, MAX_IMAGES))
        } else if (images.length) {
          setImgHint(`图片最多 ${MAX_IMAGES} 张`)
        }

        const fileRoom = MAX_FILES - pendingFiles.length
        for (const document of documents.slice(0, Math.max(0, fileRoom))) {
          const formData = new FormData()
          formData.append("file", document)
          const response = await fetch("/api/tutor/extract-file", {
            method: "POST",
            body: formData,
            credentials: "include",
          })
          const data = await response.json() as TutorAttachment & { detail?: string; truncated?: boolean }
          if (!response.ok) throw new Error(data.detail || `无法读取 ${document.name}`)
          setPendingFiles((current) => [...current, data].slice(0, MAX_FILES))
          if (data.truncated) setImgHint(`${document.name} 较长，已读取前 16000 字`)
        }
        if (documents.length > fileRoom) setImgHint(`文件最多 ${MAX_FILES} 个，多余文件未加入`)
        if (images.length > imageRoom) setImgHint(`图片最多 ${MAX_IMAGES} 张，多余图片未加入`)
      } catch (e) {
        setImgHint(e instanceof Error ? e.message : "附件处理失败")
      } finally {
        setImgBusy(false)
      }
    },
    [pendingFiles.length, pendingImages.length],
  )

  const handlePickFiles = useCallback(
    (files: FileList | null) => {
      if (files) addFiles(Array.from(files))
      if (fileRef.current) fileRef.current.value = ""
    },
    [addFiles]
  )

  // 聊天框直接粘贴图片（仿主流大模型交互）
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imgs: File[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile()
          if (f) imgs.push(f)
        }
      }
      if (imgs.length > 0) {
        e.preventDefault() // 阻止把图片当文本/文件名粘进输入框
        addFiles(imgs)
      }
    },
    [addFiles]
  )

  useEffect(() => {
    const scroller = scrollRef.current
    if (!pinnedRef.current || !scroller) return

    // 只滚动聊天容器。scrollIntoView 会在首屏渲染时连带滚动整个页面，
    // 使助教面板标题被全局吸顶导航遮住。
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }, [messages, streaming])

  const startStream = useCallback((newMessages: TutorMsg[]) => {
    tutorGenerationStore.start({
      userId: USER_ID,
      courseId,
      targetRole: targetRole?.name,
      messages: newMessages.map((message) => ({
        role: message.role,
        content: message.content,
        images: message.images,
        attachments: message.attachments,
      })),
      pageContext: pageCtx,
      learningMethod,
      origin: "text",
    })
  }, [USER_ID, courseId, learningMethod, pageCtx, targetRole?.name])

  const handleSend = useCallback(
    (text: string, images: string[] = [], attachments: TutorAttachment[] = []) => {
      const t = text.trim()
      // 允许只发附件；纯空内容不发送。
      if ((!t && images.length === 0 && attachments.length === 0) || status === "open") return
      pinnedRef.current = true // 发新消息时回到底部跟随
      tutorHistory.append(USER_ID, courseId, {
        role: "user",
        content: t,
        images: images.length ? images : undefined,
        attachments: attachments.length ? attachments : undefined,
      })
      const newMsgs = [...tutorHistory.get(USER_ID, courseId)]
      setInput("")
      setPendingImages([])
      setPendingFiles([])
      startStream(newMsgs)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    },
    [status, USER_ID, courseId, setInput, startStream]
  )

  const handleConversationTranscript = useCallback((text: string, isFinal: boolean) => {
    setInput(text)
    if (!isFinal || !text.trim()) return
    onVoiceConversationStateChange?.("thinking")
    handleSend(text)
  }, [handleSend, onVoiceConversationStateChange, setInput])

  const handleConversationMicState = useCallback((recording: boolean) => {
    if (recording) onVoiceConversationStateChange?.("listening")
    else if (conversationModeRef.current && status !== "open") onVoiceConversationStateChange?.("thinking")
  }, [onVoiceConversationStateChange, status])

  const stopConversationMode = useCallback(() => {
    conversationModeRef.current = false
    setConversationMode(false)
    setMicStopToken((value) => value + 1)
    autoSpeechRef.current?.cancel()
    autoSpeechRef.current = null
    onSpeechStatusChange?.("idle")
    onVoiceConversationStateChange?.(null)
  }, [onSpeechStatusChange, onVoiceConversationStateChange])

  const toggleConversationMode = useCallback(() => {
    if (conversationModeRef.current) {
      stopConversationMode()
      return
    }
    const latestAssistant = [...tutorHistory.get(USER_ID, courseId)].reverse().find((message) => message.role === "assistant")
    lastAutoSpokenRef.current = latestAssistant?.content || ""
    conversationModeRef.current = true
    setConversationMode(true)
    onVoiceConversationStateChange?.("listening")
    setMicActivationToken((value) => value + 1)
  }, [USER_ID, courseId, onVoiceConversationStateChange, stopConversationMode])

  useEffect(() => {
    if (!conversationMode || status === "open") return
    const latest = persistedMessages.at(-1)
    if (latest?.role !== "assistant" || !latest.content || latest.content === lastAutoSpokenRef.current) return
    lastAutoSpokenRef.current = latest.content
    const speechText = prepareSpeechText(latest.content)
    if (!speechText) {
      onVoiceConversationStateChange?.("listening")
      setMicActivationToken((value) => value + 1)
      return
    }

    autoSpeechRef.current?.cancel()
    onSpeechStatusChange?.("loading")
    onVoiceConversationStateChange?.("thinking")
    const pipeline = new StreamingTtsPipeline({
      prefetch: 1,
      onPlaybackStart: () => {
        onSpeechStatusChange?.("playing")
        onVoiceConversationStateChange?.("speaking")
      },
      onDrain: () => {
        if (autoSpeechRef.current === pipeline) autoSpeechRef.current = null
        onSpeechStatusChange?.("idle")
        if (!conversationModeRef.current) return
        onVoiceConversationStateChange?.("listening")
        setMicActivationToken((value) => value + 1)
      },
      onError: (error) => {
        console.error("[TutorConversation] TTS 失败：", error)
        if (autoSpeechRef.current === pipeline) autoSpeechRef.current = null
        setImgHint("回答已显示，但自动朗读失败；你可以继续文字提问")
        stopConversationMode()
      },
    })
    autoSpeechRef.current = pipeline
    pipeline.append(speechText)
    pipeline.finish()
  }, [conversationMode, onSpeechStatusChange, onVoiceConversationStateChange, persistedMessages, status, stopConversationMode])

  useEffect(() => () => {
    conversationModeRef.current = false
    autoSpeechRef.current?.cancel()
    onVoiceConversationStateChange?.(null)
  }, [onVoiceConversationStateChange])

  const handleStop = useCallback(() => {
    if (status !== "open") return
    tutorGenerationStore.stop(USER_ID, courseId)
  }, [USER_ID, courseId, status])

  const handleRetry = useCallback((assistantIndex: number) => {
    if (status === "open") return
    const current = [...tutorHistory.get(USER_ID, courseId)]
    let userIndex = Math.min(assistantIndex - 1, current.length - 1)
    while (userIndex >= 0 && current[userIndex]?.role !== "user") userIndex -= 1
    if (userIndex < 0) return
    const retryMessages = current.slice(0, userIndex + 1)
    pinnedRef.current = true
    tutorHistory.set(USER_ID, courseId, retryMessages)
    startStream(retryMessages)
  }, [USER_ID, courseId, startStream, status])

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (status === "open" || imgBusy) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length) void addFiles(files)
  }, [addFiles, imgBusy, status])

  const handleComposerKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (status === "open") {
      setImgHint("当前回答结束后即可发送，下一问草稿已保留")
      return
    }
    event.currentTarget.form?.requestSubmit()
  }, [status])

  const isDrawer = variant === "drawer"
  const isFreshConversation = persistedMessages.length === 0 && !streaming
  const needsRecovery = status !== "open" && !streaming && persistedMessages.at(-1)?.role === "user"

  if (!isDrawer) {
    return (
      <div className={`relative flex min-h-0 flex-col ${captureMode ? "overflow-visible" : "h-full overflow-hidden"}`}>
        <header className="flex flex-col items-stretch gap-2.5 border-b border-[#C5DDE8] bg-[#EAF5FA] px-3 py-3.5 sm:px-5 min-[1800px]:flex-row min-[1800px]:items-center min-[1800px]:justify-between min-[1800px]:gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#5E7988] transition-colors hover:bg-[#DCEEF5] hover:text-[#2F6F95]">
              <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
            </Link>
            <span className="h-6 w-px shrink-0 bg-[#C5DDE8]" />
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#BFD9E5] bg-[#E3F2F7] text-[#2F7CA2]"><Bot className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold text-[#18394D]">因材智训岗位助教</h2>
              <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">正在学习「{courseLabel}」· {learningMethod === "feynman" ? "讲清后复述" : "一次解决一个问题"}</p>
            </div>
          </div>
          <div className="tutor-toolbar-scroll nav-scroll flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 min-[1800px]:w-auto min-[1800px]:shrink-0 min-[1800px]:overflow-visible min-[1800px]:pb-0">
            <span className="hidden shrink-0 items-center gap-2 rounded-full border border-[#C5DDE8] bg-[#FFFFFF] px-3 py-1.5 text-[11px] font-bold text-[#557381] 2xl:inline-flex" aria-live="polite">
              {status === "open" ? <Loader2 className="size-3.5 animate-spin text-[#B85C3E]" /> : <span className="size-2 rounded-full bg-[#6F8A69]" />}
              {status === "open" ? "正在组织答案" : "可以继续提问"}
            </span>
            {onCaptureModeChange && (
              <button
                type="button"
                onClick={() => onCaptureModeChange(!captureMode)}
                aria-pressed={captureMode}
                aria-label={captureMode ? "退出长截图" : "长截图模式"}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors ${captureMode ? "border-[#8CB6C8] bg-[#DCEEF5] text-[#225E7D]" : "border-[#C5DDE8] bg-[#FFFFFF] text-[#557381] hover:bg-[#E8F4F8] hover:text-[#225E7D]"}`}
              >
                <ScanLine className="size-3.5" /><span className="hidden lg:inline">{captureMode ? "退出长截图" : "长截图模式"}</span>
              </button>
            )}
            <LearningMethodSelector value={learningMethod} onChange={handleLearningMethodChange} variant="compact" className="shrink-0" />
            <span className="shrink-0"><ModelSelector compact /></span>
            <button
              type="button"
              onClick={() => { setHistoryOpen(false); tutorHistory.startNew(USER_ID, courseId) }}
              disabled={status === "open"}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#B8D3E1] bg-[#225E7D] px-3 text-[11px] font-bold text-[#FFFFFF] shadow-[0_5px_12px_rgba(36,76,102,.12)] transition-colors hover:bg-[#194B66] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <MessageSquarePlus className="size-3.5" /><span className="hidden lg:inline">新对话</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              disabled={status === "open"}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${historyOpen ? "border-[#8CB6C8] bg-[#DCEEF5] text-[#225E7D]" : "border-[#C5DDE8] bg-[#FFFFFF] text-[#557381] hover:bg-[#E8F4F8] hover:text-[#225E7D]"}`}
              aria-expanded={historyOpen}
            >
              <History className="size-3.5" /><span className="hidden lg:inline">历史</span>{conversations.length > 0 && <span className="rounded-full bg-[#E3F2F7] px-1.5 py-0.5 text-[9px] text-[#2F6F95]">{conversations.length}</span>}
            </button>
            <span className="shrink-0"><VoiceSelector compact /></span>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={status === "open" || persistedMessages.length === 0}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#C5DDE8] bg-[#FFFFFF] px-3 text-[11px] font-bold text-[#6F8795] transition-colors hover:bg-[#FDEDEC] hover:text-[#9A4E35] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /><span className="hidden sm:inline">清空对话</span>
            </button>
          </div>
        </header>

        {captureMode && (
          <div className="border-b border-[#C5DDE8] bg-[#EDF2F5] px-4 py-2 text-center text-[10px] font-semibold text-[#2F6F95] sm:px-6" role="status">
            长截图模式已展开完整对话；浏览器整页截图会包含全部消息，完成后可点击“退出长截图”。
          </div>
        )}

        <AnimatePresence>
          {clearConfirmOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 grid place-items-center bg-[#18394D]/18 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="clear-tutor-title">
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} className="w-full max-w-[390px] rounded-[22px] border border-[#B8D3E1] bg-[#FFFFFF] p-5 shadow-[0_22px_60px_rgba(24,35,45,.22)]">
                <span className="grid size-10 place-items-center rounded-xl bg-[#FDEDEC] text-[#B85C3E]"><Trash2 className="size-4" /></span>
                <h3 id="clear-tutor-title" className="mt-4 text-base font-bold text-[#18394D]">清空当前对话？</h3>
                <p className="mt-1.5 text-[12px] leading-5 text-[#5E7988]">当前岗位下的这段对话将被清空。若希望保留，请先点击“新对话”，系统会自动归档到历史记录。</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setClearConfirmOpen(false)} className="h-9 rounded-xl border border-[#C5DDE8] bg-[#FFFFFF] px-4 text-[11px] font-bold text-[#557381] hover:bg-[#E8F4F8]">继续保留</button>
                  <button type="button" onClick={() => { tutorHistory.clear(USER_ID, courseId); setClearConfirmOpen(false) }} className="h-9 rounded-xl bg-[#B85C3E] px-4 text-[11px] font-bold text-white hover:bg-[#9C4934]">确认清空</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {historyOpen && (
            <>
              <motion.button
                type="button"
                aria-label="关闭历史对话"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setHistoryOpen(false)}
                className="fixed inset-0 z-[60] bg-[#18394D]/16 backdrop-blur-[1px] sm:absolute sm:inset-x-0 sm:bottom-0 sm:top-[65px] sm:z-20 sm:bg-[#18394D]/10"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 14 }}
                transition={{ type: "tween", ease: [0.32, 0.72, 0, 1], duration: 0.24 }}
                className="fixed inset-x-3 bottom-3 top-[18vh] z-[70] overflow-hidden rounded-[24px] border border-[#B8D3E1] shadow-[0_22px_60px_rgba(24,35,45,.22)] sm:absolute sm:bottom-0 sm:left-0 sm:right-auto sm:top-[65px] sm:z-30 sm:w-[330px] sm:origin-left sm:rounded-none sm:border-y-0 sm:border-l-0 sm:shadow-[14px_0_36px_rgba(24,35,45,.13)]"
              >
                <TutorConversationPanel
                  conversations={conversations}
                  courseName={courseLabel}
                  onBack={() => setHistoryOpen(false)}
                  onRestore={(id) => { if (status !== "open") { tutorHistory.restore(USER_ID, courseId, id); setHistoryOpen(false) } }}
                  onDelete={(id) => { if (status !== "open") tutorHistory.deleteArchive(USER_ID, courseId, id) }}
                  onRename={(id, title) => { if (status !== "open") tutorHistory.renameArchive(USER_ID, courseId, id, title) }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="tutor-message-scroll"
          className={`${captureMode ? "overflow-visible" : "flex-1 overflow-y-auto"} bg-[#F3F9FC] px-4 sm:px-6`}
        >
          <div className={`flex w-full flex-col ${isFreshConversation ? "min-h-full justify-center py-8" : "gap-7 py-8"}`}>
            {isFreshConversation ? (
              <div className="mx-auto w-full max-w-[740px] text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#BFD9E5] bg-[#E3F2F7] text-[#2F7CA2] shadow-[0_8px_20px_rgba(142,105,37,.09)]"><Bot className="size-5" /></span>
                <h3 className="mt-4 text-xl font-bold tracking-[-0.03em] text-[#18394D]">今天想弄懂什么？</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5E7988]">
                  {learningMethod === "feynman"
                    ? "概念、公式、代码和题目都可以问。我会先讲清楚，再请你复述。"
                    : "概念、公式、代码和题目都可以问。我们一次解决一个问题。"}
                </p>
                <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-[#C5DDE8] bg-[#EFF8FB] px-3 py-1.5 text-[10px] font-semibold text-[#527A8A]"><Sparkles className="size-3" />{learningMethod === "feynman" ? "讲清后复述" : "一次一个问题"}</div>
                {showStarters && (
                  <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                    {starters.slice(0, 4).map((question, index) => (
                      <button key={question} type="button" onClick={() => setInput(question)} className="group rounded-2xl border border-[#C5DDE8] bg-[#FFFFFF] px-4 py-3 text-[11px] font-semibold leading-5 text-[#557381] transition-all hover:-translate-y-0.5 hover:border-[#8CB6C8] hover:bg-[#E8F4F8] hover:text-[#225E7D]">
                        <span className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-[#7894A3]">问题 0{index + 1}</span>
                        {question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((message, index) => <Bubble key={index} role={message.role} content={message.content} images={message.images} attachments={message.attachments} delivery={message.delivery} errorDetail={message.error_detail} onRetry={message.delivery === "error" || message.delivery === "stopped" ? () => handleRetry(index) : undefined} onSpeechStatusChange={onSpeechStatusChange} />)}
                {streaming && <Bubble role="assistant" content={streaming} streaming />}
                {status === "open" && !streaming && (
                  <div className="min-w-0 pr-10 sm:pr-16">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-[#5E7988]"><Loader2 className="size-3.5 animate-spin" />助教正在组织答案<ThinkingDots /></div>
                  </div>
                )}
                {needsRecovery && <Bubble role="assistant" content="" delivery="error" errorDetail="上一次连接在完整回复前结束，问题仍已保留。" onRetry={() => handleRetry(persistedMessages.length)} />}
              </>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleSend(input, pendingImages, pendingFiles)
          }}
          className="border-t border-[#CFE2EA] bg-[#F3F9FC] px-4 pb-3 pt-3 sm:px-6"
        >
          <div className="w-full">
            <div
              onDragEnter={(event) => { event.preventDefault(); if (status !== "open" && !imgBusy) setDragActive(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }}
              onDrop={handleDrop}
              className={`relative rounded-[20px] border bg-[#FFFFFF] p-2 shadow-[0_10px_28px_rgba(24,35,45,.08)] transition-all focus-within:border-[#8CB6C8] focus-within:shadow-[0_12px_32px_rgba(36,76,102,.12)] ${dragActive ? "border-[#2F6F95] ring-3 ring-[#2F7CA2]/12" : "border-[#B8D3E1]"}`}
            >
              {dragActive && <div className="pointer-events-none absolute inset-1 z-10 grid place-items-center rounded-[16px] border border-dashed border-[#2F7CA2] bg-[#F0F8FB]/95 text-xs font-bold text-[#2F6F95]"><span className="inline-flex items-center gap-2"><Paperclip className="size-4" />松开即可加入本轮参考</span></div>}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pb-2">
                  {pendingImages.map((src, index) => (
                    <div key={index} className="relative">
                      <img src={src} alt={`待发送图片 ${index + 1}`} className="size-14 rounded-xl border border-[#B8D3E1] object-cover" />
                      <button type="button" onClick={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#18394D] text-[#FFFFFF]" aria-label="移除图片"><X className="size-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pb-2">
                  {pendingFiles.map((file, index) => (
                    <AttachmentChip key={`${file.name}-${index}`} file={file} onRemove={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                  ))}
                </div>
              )}
              {imgHint && <div className="px-2 pb-1 text-[11px] font-semibold text-[#2F7CA2]">{imgHint}</div>}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                placeholder={`向助教提问「${courseLabel}」岗位中的任何问题…`}
                className="max-h-28 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-[#18394D] outline-none placeholder:text-[#8CA1AA]"
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.md,.markdown,.txt,.py,.js,.jsx,.ts,.tsx,.java,.c,.cc,.cpp,.h,.hpp,.go,.rs,.sql,.html,.css,.json,.yaml,.yml,.sh,.ps1" className="hidden" onChange={(event) => handlePickFiles(event.target.files)} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={status === "open" || imgBusy} title="上传图片、PDF、Markdown、文本或代码" aria-label="上传附件" className="grid size-9 place-items-center rounded-xl text-[#5E7988] transition-colors hover:bg-[#E3F2F7] hover:text-[#2F6F95] disabled:opacity-40">
                    {imgBusy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                  </button>
                  <MicButton
                    size="sm"
                    activationToken={micActivationToken}
                    stopToken={micStopToken}
                    vadEos={1800}
                    onTranscript={(text, isFinal) => conversationModeRef.current ? handleConversationTranscript(text, isFinal) : setInput(text)}
                    onStateChange={handleConversationMicState}
                    onError={(error) => {
                      console.error("ASR 失败：", error)
                      setImgHint("语音识别连接失败，请检查语音服务配置")
                      if (conversationModeRef.current) stopConversationMode()
                    }}
                  />
                  <button
                    type="button"
                    onClick={toggleConversationMode}
                    disabled={!conversationMode && status === "open"}
                    aria-pressed={conversationMode}
                    title={conversationMode ? "结束数字人对话" : "与数字人对话"}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${conversationMode ? "border-[#2F6F95] bg-[#225E7D] text-white shadow-[0_5px_12px_rgba(36,76,102,.18)]" : "border-[#C5DDE8] bg-[#FFFFFF] text-[#557381] hover:border-[#8CB6C8] hover:bg-[#DCEEF5] hover:text-[#225E7D]"}`}
                  >
                    <MessageCircleMore className={`size-4 ${conversationMode ? "animate-pulse" : ""}`} />
                    <span>{conversationMode ? "结束对话" : "数字人对话"}</span>
                  </button>
                </div>
                <button type={status === "open" ? "button" : "submit"} onClick={status === "open" ? handleStop : undefined} disabled={status !== "open" && !input.trim() && pendingImages.length === 0 && pendingFiles.length === 0} className={`grid size-10 place-items-center rounded-xl text-[#FFFFFF] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 ${status === "open" ? "bg-[#B85C3E] hover:bg-[#9C4934]" : "bg-[#225E7D] hover:bg-[#194B66]"}`} aria-label={status === "open" ? "停止生成并保留当前回答" : "发送问题"}>
                  {status === "open" ? <Square className="size-3.5 fill-current" /> : <Send className="size-4" />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#6F8795]">
              <span className="inline-flex items-center gap-1.5"><Paperclip className="size-3" />支持图片、PDF、Markdown、文本和代码</span>
              <span>{status === "open" ? "正在回复，可先写下一问；点击停止会保留当前回答" : "Enter 发送 · Shift+Enter 换行"}</span>
            </div>
          </div>
        </form>
      </div>
    )
  }

  if (!course) {
    return (
      <section className="grid min-h-[360px] flex-1 place-items-center bg-[#FFFFFF] p-6 text-center" role="status">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#D8C9A8] bg-[#E3F2F7] text-[#2F6F95]"><AlertCircle className="size-5" /></span>
          <h2 className="mt-4 text-base font-bold text-[#18394D]">{targetRole ? `${targetRole.name} 的岗位知识库正在建设` : "请先选择目标岗位"}</h2>
          <p className="mt-2 text-xs leading-6 text-[#5E7988]">{targetRole ? "目标岗位已保留。岗位知识库接入后即可开始提问。" : "选择岗位后，助教会围绕对应知识回答。"}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/courses?returnTo=%2Ftutor" className="inline-flex h-9 items-center rounded-xl bg-[#225E7D] px-4 text-[11px] font-bold text-white hover:bg-[#194B66]">{targetRole ? "更换已开放岗位" : "选择目标岗位"}</Link>
            {targetRole && <Link to="/workspace" className="inline-flex h-9 items-center rounded-xl border border-[#C5DDE8] bg-[#EAF5FA] px-4 text-[11px] font-bold text-[#557381] hover:bg-[#EFEAE0]">查看岗位状态</Link>}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F3F9FC]">
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {pageCtx && (
          <div className="rounded-2xl border border-[#C5DDE8] bg-[#EAF5FA] px-3.5 py-3 shadow-[0_5px_14px_rgba(24,35,45,.04)]">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]"><Sparkles className="size-3.5" />正在参考当前页面</div>
            <div className="mt-1 truncate text-[13px] font-bold text-[#225E7D]">{pageCtx.title || pageCtx.page}</div>
            {pageCtx.topic && <div className="mt-0.5 truncate text-[11px] text-[#6F8795]">主题 · {pageCtx.topic}</div>}
          </div>
        )}
        {messages.map((message, index) => (
          <Bubble key={index} role={message.role} content={message.content} images={message.images} attachments={message.attachments} delivery={message.delivery} errorDetail={message.error_detail} onRetry={message.delivery === "error" || message.delivery === "stopped" ? () => handleRetry(index) : undefined} compact />
        ))}
        {streaming && <Bubble role="assistant" content={streaming} streaming compact />}
        {status === "open" && !streaming && (
          <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#5E7988]"><Loader2 className="size-3.5 animate-spin" />学习助手正在整理思路<ThinkingDots /></div>
        )}
        {needsRecovery && <Bubble role="assistant" content="" delivery="error" errorDetail="上一次连接在完整回复前结束，问题仍已保留。" onRetry={() => handleRetry(persistedMessages.length)} compact />}
        {showStarters && persistedMessages.length === 0 && (
          <div className="pt-1">
            <div className="mb-2 text-[11px] font-bold text-[#5E7988]">选择学习方法</div>
            <LearningMethodSelector value={learningMethod} onChange={handleLearningMethodChange} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); handleSend(input, pendingImages, pendingFiles) }} className="border-t border-[#CFE2EA] bg-[#EAF5FA] px-3 pb-3 pt-3">
        {persistedMessages.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-bold text-[#6F8795]">学习方法</span>
            <LearningMethodSelector value={learningMethod} onChange={handleLearningMethodChange} variant="compact" />
          </div>
        )}
        {(pendingImages.length > 0 || pendingFiles.length > 0) && (
          <div className="flex flex-wrap gap-2 pb-2">
            {pendingImages.map((src, index) => (
              <div key={index} className="relative"><img src={src} alt={`待发送图片 ${index + 1}`} className="size-12 rounded-xl border border-[#B8D3E1] object-cover" /><button type="button" onClick={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#18394D] text-[#FFFFFF]" aria-label="移除图片"><X className="size-3" /></button></div>
            ))}
            {pendingFiles.map((file, index) => <AttachmentChip key={`${file.name}-${index}`} file={file} compact onRemove={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}
          </div>
        )}
        {imgHint && <div className="pb-2 text-[11px] font-semibold text-[#2F7CA2]">{imgHint}</div>}
        <div
          onDragEnter={(event) => { event.preventDefault(); if (status !== "open" && !imgBusy) setDragActive(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }}
          onDrop={handleDrop}
          className={`relative rounded-[18px] border bg-[#FFFFFF] p-2 shadow-[0_10px_28px_rgba(24,35,45,.08)] focus-within:border-[#8CB6C8] ${dragActive ? "border-[#2F6F95] ring-3 ring-[#2F7CA2]/12" : "border-[#B8D3E1]"}`}
        >
          {dragActive && <div className="pointer-events-none absolute inset-1 z-10 grid place-items-center rounded-[14px] border border-dashed border-[#2F7CA2] bg-[#F0F8FB]/95 text-[11px] font-bold text-[#2F6F95]">松开即可加入参考</div>}
          <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onPaste={handlePaste} onKeyDown={handleComposerKeyDown} rows={1} placeholder={`问我「${courseLabel}」岗位或当前页面…`} className="max-h-28 min-h-14 w-full resize-none bg-transparent px-2 py-2 text-[13px] leading-5 text-[#18394D] outline-none placeholder:text-[#8CA1AA]" />
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.md,.markdown,.txt,.py,.js,.jsx,.ts,.tsx,.java,.c,.cc,.cpp,.h,.hpp,.go,.rs,.sql,.html,.css,.json,.yaml,.yml,.sh,.ps1" className="hidden" onChange={(event) => handlePickFiles(event.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={status === "open" || imgBusy} title="上传图片、PDF、Markdown、文本或代码" aria-label="上传附件" className="grid size-9 place-items-center rounded-xl text-[#5E7988] transition-colors hover:bg-[#E3F2F7] hover:text-[#2F6F95] disabled:opacity-40">{imgBusy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}</button>
              <MicButton size="sm" onTranscript={(text) => setInput(text)} onError={(error) => console.error("ASR 失败：", error)} />
            </div>
            <button type={status === "open" ? "button" : "submit"} onClick={status === "open" ? handleStop : undefined} disabled={status !== "open" && !input.trim() && pendingImages.length === 0 && pendingFiles.length === 0} className={`grid size-10 place-items-center rounded-xl text-[#FFFFFF] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${status === "open" ? "bg-[#B85C3E] hover:bg-[#9C4934]" : "bg-[#225E7D] hover:bg-[#194B66]"}`} aria-label={status === "open" ? "停止生成并保留当前回答" : "发送问题"}>{status === "open" ? <Square className="size-3.5 fill-current" /> : <Send className="size-4" />}</button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[9px] text-[#6F8795]"><span>附件会作为本轮参考</span><span className="text-right">{status === "open" ? "正在回复，可先写下一问；结束后再发送" : "Enter 发送 · Alt+/ 呼出"}</span></div>
      </form>
    </div>
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function formatFileSize(size?: number) {
  if (!size || size < 1) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function AttachmentChip({ file, onRemove, compact }: { file: TutorAttachment; onRemove?: () => void; compact?: boolean }) {
  const Icon = file.kind === "code" ? Code2 : FileText
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-xl border ${compact ? "max-w-[210px] px-2.5 py-2" : "max-w-[260px] px-3 py-2"} border-[#C5DDE8] bg-[#EAF5FA] text-[#225E7D]`}>
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#DCEEF5]"><Icon className="size-3.5" /></span>
      <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold">{file.name}</div><div className="text-[9px] text-[#6F8795]">{file.kind === "code" ? "代码文件" : "参考文档"}{formatFileSize(file.size) ? ` · ${formatFileSize(file.size)}` : ""}</div></div>
      {onRemove && <button type="button" onClick={onRemove} className="grid size-5 shrink-0 place-items-center rounded-full text-[#6F8795] hover:bg-[#FDEDEC] hover:text-[#9A4E35]" aria-label={`移除 ${file.name}`}><X className="size-3" /></button>}
    </div>
  )
}

function ResponseIssue({
  delivery,
  detail,
  onRetry,
  compact,
}: {
  delivery: "stopped" | "error"
  detail?: string
  onRetry?: () => void
  compact?: boolean
}) {
  const stopped = delivery === "stopped"
  return (
    <div className={`mt-3 flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${compact ? "" : "sm:flex-row sm:items-center sm:justify-between"} ${stopped ? "border-[#D8C9A8] bg-[#F0F8FB]" : "border-[#E8B9AE] bg-[#FFF2EE]"}`} role="status">
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className={`mt-0.5 size-3.5 shrink-0 ${stopped ? "text-[#2F6F95]" : "text-[#B85C3E]"}`} />
        <div>
          <div className={`${compact ? "text-[10px]" : "text-[11px]"} font-bold text-[#405D6C]`}>{stopped ? "你已停止生成，当前内容已保留" : "这次回复没有完整结束"}</div>
          {detail && <p className="mt-0.5 break-words text-[10px] leading-4 text-[#6F8795]">{detail}</p>}
        </div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#B8D3E1] bg-[#FFFFFF] px-3 text-[10px] font-bold text-[#225E7D] hover:bg-[#DCEEF5]">
          <RotateCcw className="size-3" />重新回答
        </button>
      )}
    </div>
  )
}

function Bubble({
  role,
  content,
  images,
  attachments,
  delivery,
  errorDetail,
  onRetry,
  streaming,
  compact,
  onSpeechStatusChange,
}: {
  role: "user" | "assistant"
  content: string
  images?: string[]
  attachments?: TutorAttachment[]
  delivery?: TutorMsg["delivery"]
  errorDetail?: string
  onRetry?: () => void
  streaming?: boolean
  compact?: boolean
  onSpeechStatusChange?: (status: SpeakerStatus) => void
}) {
  const isUser = role === "user"
  const displayContent = isUser ? content : formatTutorDisplayContent(content)

  if (!compact) {
    if (!isUser) {
      return (
        <div data-tutor-message="assistant" className="min-w-0 pr-10 sm:pr-16">
          <div className="min-w-0 max-w-[780px]">
            {streaming && <span className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#6F8A69]"><span className="size-1.5 animate-pulse rounded-full bg-[#6F8A69]" />正在回复</span>}
            <div className="text-[#27343D]">
              {displayContent && <Markdown content={displayContent} className="text-sm leading-7" wrapLongContent />}
              {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#2F7CA2]" />}
            </div>
            {(delivery === "error" || delivery === "stopped") && <ResponseIssue delivery={delivery} detail={errorDetail} onRetry={onRetry} />}
            {!streaming && content && delivery !== "error" && delivery !== "stopped" && <div className="mt-2"><SpeakerButton text={content} onStatusChange={onSpeechStatusChange} /></div>}
          </div>
        </div>
      )
    }

    return (
      <div data-tutor-message="user" className="flex min-w-0 justify-end pl-10 sm:pl-16">
        <div className="min-w-0 max-w-[78%] overflow-hidden rounded-[20px] rounded-tr-md bg-[#225E7D] px-4 py-3 text-[#FFFFFF] shadow-[0_7px_16px_rgba(36,76,102,.13)]">
          <div className="space-y-2">
            {images && images.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {images.map((src, index) => (
                  <a key={index} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`图片 ${index + 1}`} className="max-h-40 rounded-xl border border-white/20 object-cover" /></a>
                ))}
              </div>
            )}
            {attachments && attachments.length > 0 && <div className="flex flex-wrap gap-2">{attachments.map((file, index) => <AttachmentChip key={`${file.name}-${index}`} file={file} />)}</div>}
            {content && <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>}
          </div>
        </div>
      </div>
    )
  }

  const avatarSize = compact ? "size-7" : "size-8"
  const iconSize = compact ? "size-3.5" : "size-4"
  return (
    <div data-tutor-message={role} className={`flex min-w-0 gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`${avatarSize} flex shrink-0 items-center justify-center rounded-full border ${
          isUser
            ? "border-[#DFC8BC] bg-[#FDEDEC] text-[#9A4E35]"
            : "border-[#BFD9E5] bg-[#E3F2F7] text-[#2F7CA2]"
        }`}
      >
        {isUser ? <User className={iconSize} /> : <Bot className={iconSize} />}
      </div>
      <div
        className={`group/bubble relative min-w-0 overflow-hidden ${
          isUser
            ? "max-w-[82%] rounded-[18px] rounded-tr-md border border-[#BFD8E3] bg-[#DCEFF6] px-3.5 py-2.5 text-[#27343D] shadow-[0_5px_14px_rgba(24,35,45,.055)]"
            : "max-w-[calc(100%-38px)] px-1 py-1 text-[#27343D]"
        }`}
      >
        {isUser ? (
          <div className="space-y-1.5">
            {images && images.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {images.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt={`图片 ${i + 1}`}
                      className="max-h-40 rounded-lg border border-white/20 object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            {attachments && attachments.length > 0 && <div className="flex flex-wrap gap-1.5">{attachments.map((file, index) => <AttachmentChip key={`${file.name}-${index}`} file={file} compact />)}</div>}
            {content && (
              <p className={`${compact ? "text-[13px]" : "text-sm"} whitespace-pre-wrap break-words`}>
                {content}
              </p>
            )}
          </div>
        ) : (
          <>
            {displayContent && <Markdown content={displayContent} className="text-[13px] leading-6" wrapLongContent />}
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#2F7CA2]" />
            )}
            {(delivery === "error" || delivery === "stopped") && <ResponseIssue delivery={delivery} detail={errorDetail} onRetry={onRetry} compact />}
            {!streaming && content && delivery !== "error" && delivery !== "stopped" && (
              <div className="flex justify-end mt-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                <SpeakerButton text={content} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
