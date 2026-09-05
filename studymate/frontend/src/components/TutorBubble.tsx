/** 全局 StudyMate 学习助手：轻量入口 + 非阻塞右侧抽屉。 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  EyeOff,
  History,
  Maximize2,
  MessageCircle,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  useTutorBubble,
  openTutorBubble,
  closeTutorBubble,
  toggleTutorBubble,
  setTutorBubbleWidth,
} from "@/store/tutorBubble"
import { useCurrentCourse } from "@/store/course"
import { useCurrentUser } from "@/store/user"
import {
  useTutorConversations,
  useTutorHistory,
  tutorHistory,
} from "@/store/tutorHistory"
import { TutorChatPanel } from "@/components/TutorChatPanel"
import { TutorConversationPanel } from "@/components/TutorConversationPanel"
import { DigitalHumanVideo } from "@/components/DigitalHumanVideo"
import { useTutorGeneration } from "@/store/tutorGeneration"
import { DIGITAL_HUMAN_VIDEO, type DigitalHumanState } from "@/lib/digitalHuman"

const TUTOR_POSITION_KEY = "sm:digital-human-position"
const TUTOR_GREETING_SEEN_KEY = "sm:digital-human-greeting"
const TUTOR_HIDDEN_KEY = "sm:digital-human-hidden"
const TUTOR_GREETING = "我是你的学习助教，有问题随时来问我。"

function tutorHintsFor(pathname: string) {
  const general = "哪一步卡住了？我可以换种讲法。"
  if (pathname.startsWith("/rag")) {
    return ["检索结果有点长？我帮你抓住三点。", general]
  }
  if (pathname.startsWith("/profile")) {
    return ["想按你的节奏重讲一遍吗？", general]
  }
  if (pathname.startsWith("/concept")) {
    return ["这一帧没跟上？我换个例子。", general]
  }
  if (pathname.startsWith("/workspace")) {
    return ["这个岗位能力点想换种讲法吗？我可以继续。", general]
  }
  return [general, "有题目没想通？交给我一起拆。"]
}

interface FloatingSize {
  width: number
  height: number
}

function getFloatingSize(): FloatingSize {
  if (typeof window === "undefined") return { width: 170, height: 218 }
  if (window.innerHeight <= 800) return { width: 170, height: 218 }
  if (window.innerHeight <= 950) return { width: 184, height: 236 }
  return { width: 196, height: 252 }
}

function clampFloatingPosition(x: number, y: number, size: FloatingSize) {
  const maxX = Math.max(8, window.innerWidth - size.width - 8)
  const minX = Math.min(window.innerWidth >= 1024 ? 236 : window.innerWidth >= 768 ? 82 : 8, maxX)
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(58, Math.min(y, Math.max(58, window.innerHeight - size.height - 8))),
  }
}

function loadFloatingPosition(size: FloatingSize) {
  if (typeof window === "undefined") return { x: 0, y: 0 }
  try {
    const raw = localStorage.getItem(TUTOR_POSITION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: number; y?: number }
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return { x: Number(parsed.x), y: Number(parsed.y) }
      }
    }
  } catch {
    /* use default */
  }
  return {
    x: Math.max(12, window.innerWidth - size.width - 20),
    y: Math.max(70, window.innerHeight - size.height - 14),
  }
}

function loadTutorHidden() {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(TUTOR_HIDDEN_KEY) === "true"
  } catch {
    return false
  }
}

export function TutorBubble() {
  const reduceMotion = useReducedMotion()
  const { isOpen, width } = useTutorBubble()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useCurrentUser()
  const userId = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseId = course?.id ?? null
  const generation = useTutorGeneration(userId, courseId)
  const generating = generation.status === "open"
  // Text generation has no TTS playback, so it must never impersonate speaking.
  const digitalHumanState: DigitalHumanState = generating ? "thinking" : "idle"
  const messages = useTutorHistory(userId, courseId)
  const conversations = useTutorConversations(userId, courseId)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assistantHidden, setAssistantHidden] = useState(loadTutorHidden)
  const [hintKind, setHintKind] = useState<"greeting" | "context" | null>(null)
  const [hintIndex, setHintIndex] = useState(0)
  const [floatingSize, setFloatingSize] = useState(getFloatingSize)
  const [floatingPosition, setFloatingPosition] = useState(() => loadFloatingPosition(floatingSize))
  const floatingPositionRef = useRef(floatingPosition)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)

  const hints = tutorHintsFor(location.pathname)
  const hintText = hintKind === "greeting" ? TUTOR_GREETING : hints[hintIndex % hints.length]

  useEffect(() => {
    if (isOpen || assistantHidden) {
      setHintKind(null)
      return
    }
    if (hintKind) return
    const greetingDue = sessionStorage.getItem(TUTOR_GREETING_SEEN_KEY) !== "shown"
    const delay = greetingDue ? 2200 : 75000
    const show = window.setTimeout(() => {
      setHintKind(greetingDue ? "greeting" : "context")
      if (greetingDue) sessionStorage.setItem(TUTOR_GREETING_SEEN_KEY, "shown")
    }, delay)
    return () => window.clearTimeout(show)
  }, [assistantHidden, hintIndex, hintKind, isOpen, location.pathname])

  useEffect(() => {
    if (!hintKind) return
    const hide = window.setTimeout(() => {
      setHintKind(null)
      if (hintKind === "context") setHintIndex((index) => index + 1)
    }, hintKind === "greeting" ? 8200 : 7200)
    return () => window.clearTimeout(hide)
  }, [hintKind])

  const setTutorHidden = useCallback((hidden: boolean) => {
    setAssistantHidden(hidden)
    setHintKind(null)
    if (hidden) closeTutorBubble()
    try {
      localStorage.setItem(TUTOR_HIDDEN_KEY, String(hidden))
    } catch {
      /* hidden preference persistence is optional */
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const slashKey = event.key === "/" || event.code === "Slash"
      if ((event.altKey || event.ctrlKey) && slashKey && !event.shiftKey) {
        event.preventDefault()
        if (assistantHidden) {
          setTutorHidden(false)
          openTutorBubble()
        } else {
          toggleTutorBubble()
        }
      }
      if (event.key === "Escape" && isOpen) closeTutorBubble()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [assistantHidden, isOpen, setTutorHidden])

  const drawerStyle = { "--drawer-width": `${width}px` } as CSSProperties
  useEffect(() => {
    const onResize = () => {
      const nextSize = getFloatingSize()
      setFloatingSize(nextSize)
      setFloatingPosition((position) => {
        const nextPosition = clampFloatingPosition(position.x, position.y, nextSize)
        floatingPositionRef.current = nextPosition
        return nextPosition
      })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const finishFloatingDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (!drag.moved) {
      openTutorBubble()
      return
    }
    try {
      localStorage.setItem(TUTOR_POSITION_KEY, JSON.stringify(floatingPositionRef.current))
    } catch {
      /* position persistence is optional */
    }
  }

  return (
    <>
      <AnimatePresence>
        {assistantHidden && !isOpen && (
          <motion.button
            key="restore-studymate-tutor"
            type="button"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            onClick={() => setTutorHidden(false)}
            className="fixed bottom-5 right-0 z-50 flex h-11 items-center gap-1.5 rounded-l-full border border-r-0 border-[#CFC8B9] bg-[#FFFEFA]/94 pl-3 pr-2.5 text-[10px] font-bold text-[#315E83] shadow-[0_10px_28px_rgba(24,35,45,.14)] backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/45"
            aria-label="显示因材智训学习助教"
            title="显示学习助教"
          >
            <MessageCircle className="size-4 text-[#B1842C]" />
            显示助教
          </motion.button>
        )}
        {!assistantHidden && !isOpen && (
          <motion.div
            key="studymate-digital-human"
            initial={{ scale: 0.82, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.82, opacity: 0, y: 14 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="fixed z-50 touch-none select-none"
            style={{ left: floatingPosition.x, top: floatingPosition.y, width: floatingSize.width, height: floatingSize.height }}
          >
            <AnimatePresence>
              {hintKind && (
                <motion.button
                  type="button"
                  onClick={openTutorBubble}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.97 }}
                  className="absolute bottom-[calc(100%+8px)] right-0 w-[204px] rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA]/96 px-3 py-2.5 text-left text-[11px] font-semibold leading-[18px] text-[#33424C] shadow-[0_16px_36px_rgba(24,35,45,.16)] backdrop-blur md:bottom-auto md:right-[calc(100%-24px)] md:top-5"
                >
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-[#315E83]"><Sparkles className="size-3.5 text-[#B1842C]" />因材智训助教</span>
                  {hintText}
                  <span className="absolute -bottom-1.5 right-8 size-3 rotate-45 border-b border-r border-[#D7D1C4] bg-[#FFFEFA] md:bottom-auto md:-right-1.5 md:top-8 md:border-b-0 md:border-l-0 md:border-r md:border-t" />
                </motion.button>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setTutorHidden(true)
              }}
              className="absolute left-1 top-1 z-20 grid size-7 place-items-center rounded-full border border-[#D7D1C4] bg-[#FFFEFA]/88 text-[#66717B] shadow-sm backdrop-blur transition hover:bg-white hover:text-[#A05137] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/45"
              aria-label="隐藏学习助教"
              title="隐藏学习助教"
            >
              <EyeOff className="size-3.5" />
            </button>
            <motion.button
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                dragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: floatingPosition.x,
                  originY: floatingPosition.y,
                  moved: false,
                }
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current
                if (!drag || drag.pointerId !== event.pointerId) return
                const dx = event.clientX - drag.startX
                const dy = event.clientY - drag.startY
                if (Math.hypot(dx, dy) > 6) drag.moved = true
                if (drag.moved) {
                  const nextPosition = clampFloatingPosition(drag.originX + dx, drag.originY + dy, floatingSize)
                  floatingPositionRef.current = nextPosition
                  setFloatingPosition(nextPosition)
                }
              }}
              onPointerUp={finishFloatingDrag}
              onPointerCancel={() => { dragRef.current = null }}
              onClick={(event) => {
                if (event.detail === 0) openTutorBubble()
              }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              className="group relative h-full w-full cursor-grab border-0 bg-transparent p-0 text-left outline-none active:cursor-grabbing"
              aria-label="打开因材智训真人学习助手（Alt+/）"
              title="因材智训真人学习助手 · 可拖动 · Alt+/"
            >
              <motion.span
                className="pointer-events-none absolute inset-x-5 bottom-1 h-6 rounded-[50%] bg-[#244C66]/18 blur-xl transition-colors group-hover:bg-[#244C66]/22"
                animate={reduceMotion ? undefined : { scaleX: [1, 1.08, 1], opacity: [0.62, 0.82, 0.62] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="pointer-events-none absolute inset-0 block origin-bottom drop-shadow-[0_13px_14px_rgba(24,35,45,.24)] transition-[filter] duration-300 group-hover:drop-shadow-[0_17px_18px_rgba(24,35,45,.3)]"
              >
                <DigitalHumanVideo
                  state={digitalHumanState}
                  alt="因材智训真人讲师动态入口"
                  priority
                  idleOnly
                  floatingBlend
                  idleSrc={DIGITAL_HUMAN_VIDEO.floatingIdleSrc}
                  idlePoster={DIGITAL_HUMAN_VIDEO.floatingIdlePoster}
                  className="h-full w-full"
                  mediaClassName="h-full w-full"
                />
              </motion.span>
              {!reduceMotion && (
                <>
                  <motion.span
                    className="pointer-events-none absolute left-[24%] top-[13%] text-[#C49A45]"
                    animate={{ opacity: [0, 0, 0.9, 0], scale: [0.6, 0.6, 1.05, 0.7], rotate: [0, 0, 18, 34] }}
                    transition={{ duration: 5.8, times: [0, 0.62, 0.72, 0.86], repeat: Infinity, ease: "easeOut" }}
                  >
                    <Sparkles className="size-3.5" />
                  </motion.span>
                  <motion.span
                    className="pointer-events-none absolute right-[19%] top-[8%] size-1.5 rounded-full bg-[#6F8A69]"
                    animate={{ opacity: [0, 0.75, 0], y: [2, -2, -5], scale: [0.7, 1, 0.65] }}
                    transition={{ duration: 3.6, delay: 1.8, repeat: Infinity, repeatDelay: 3.2, ease: "easeOut" }}
                  />
                </>
              )}
              <span className="pointer-events-none absolute right-2 top-3 flex items-center gap-1.5 rounded-full bg-[#FFFEFA]/82 px-2 py-1 text-[9px] font-bold tracking-[0.08em] text-[#315E83] shadow-sm backdrop-blur transition group-focus-visible:ring-2 group-focus-visible:ring-[#315E83]/55">
                <span className={`size-2 rounded-full border border-[#FFFEFA] shadow-sm ${generating ? "animate-pulse bg-[#B1842C]" : "bg-[#6F8A69]"}`} />
                {generating ? "思考中" : "在线"}
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && !assistantHidden && (
          <>
            <motion.button
              key="mobile-backdrop"
              type="button"
              aria-label="关闭学习助手"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeTutorBubble}
              className="fixed inset-0 z-40 bg-[#18232D]/20 sm:hidden"
            />
            <motion.aside
              key="studymate-drawer"
              initial={{ x: "105%", opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "105%", opacity: 0.7 }}
              transition={{ type: "tween", ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
              style={drawerStyle}
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.22)] sm:inset-y-3 sm:right-3 sm:w-[var(--drawer-width)] sm:max-w-[calc(100vw-24px)] sm:rounded-[26px] sm:border"
              aria-label="因材智训学习助手"
            >
              <ResizeHandle width={width} />

              <header className="shrink-0 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D9CFB7] bg-[#244C66] text-[#F2C968] shadow-[0_5px_12px_rgba(36,76,102,.14)]"><Sparkles className="size-4.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold tracking-[-0.01em] text-[#18232D]">因材智训学习助手</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#6F787A]"><span className={`size-1.5 rounded-full ${generating ? "animate-pulse bg-[#B1842C]" : "bg-[#6F8A69]"}`} />《{course?.name || "FDE 岗位知识库"}》· {generating ? "回答在后台继续生成" : "记得当前岗位对话"}</div>
                  </div>
                  <IconButton onClick={() => { setHistoryOpen(false); tutorHistory.startNew(userId, courseId) }} title={generating ? "回答完成后可新建对话" : "新对话"} disabled={generating}><MessageSquarePlus className="size-4" /></IconButton>
                  <IconButton onClick={() => setHistoryOpen((value) => !value)} title={generating ? "回答完成后可切换历史" : "历史会话"} active={historyOpen} disabled={generating}><History className="size-4" /></IconButton>
                  <IconButton onClick={() => tutorHistory.clear(userId, courseId)} title={generating ? "回答完成后可清空" : "清空当前对话"} disabled={generating || messages.length === 0}><Trash2 className="size-4" /></IconButton>
                  <IconButton onClick={() => { closeTutorBubble(); navigate("/tutor") }} title="打开完整助教"><Maximize2 className="size-4" /></IconButton>
                  <IconButton onClick={() => setTutorHidden(true)} title="隐藏助教"><EyeOff className="size-4" /></IconButton>
                  <IconButton onClick={closeTutorBubble} title="关闭（Esc）"><X className="size-4.5" /></IconButton>
                </div>
              </header>

              <div className="min-h-0 flex-1">
                {historyOpen ? (
                  <TutorConversationPanel
                    conversations={conversations}
                    courseName={course?.name || "机器学习"}
                    onBack={() => setHistoryOpen(false)}
                    onRestore={(id) => { tutorHistory.restore(userId, courseId, id); setHistoryOpen(false) }}
                    onDelete={(id) => tutorHistory.deleteArchive(userId, courseId, id)}
                    onRename={(id, title) => tutorHistory.renameArchive(userId, courseId, id, title)}
                  />
                ) : (
                  <TutorChatPanel variant="drawer" />
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function IconButton({ children, onClick, title, active, disabled }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`grid size-8 shrink-0 place-items-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-[#9FB1BC] bg-[#E7EDF3] text-[#244C66]" : "border-transparent text-[#66717B] hover:border-[#D7D1C4] hover:bg-[#FFFEFA] hover:text-[#244C66]"}`}>{children}</button>
}

function ResizeHandle({ width }: { width: number }) {
  const [resizing, setResizing] = useState(false)
  const startRef = useRef<{ x: number; width: number } | null>(null)
  useEffect(() => {
    if (!resizing) return
    const onMove = (event: MouseEvent) => { const start = startRef.current; if (start) setTutorBubbleWidth(start.width + start.x - event.clientX) }
    const onUp = () => setResizing(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    document.body.style.userSelect = "none"
    document.body.style.cursor = "ew-resize"
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; document.body.style.cursor = "" }
  }, [resizing])
  return <div onMouseDown={(event) => { startRef.current = { x: event.clientX, width }; setResizing(true) }} className={`absolute inset-y-0 left-0 z-20 hidden w-1.5 cursor-ew-resize sm:block ${resizing ? "bg-[#B1842C]/35" : "hover:bg-[#B1842C]/20"}`} title="拖动调整宽度" />
}
