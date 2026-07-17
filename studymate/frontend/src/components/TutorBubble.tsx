/** 全局 StudyMate 学习助手：轻量入口 + 非阻塞右侧抽屉。 */
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import {
  History,
  Maximize2,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
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
import { useTutorGeneration } from "@/store/tutorGeneration"

export function TutorBubble() {
  const { isOpen, width } = useTutorBubble()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const userId = user?.user_id ?? 0
  const course = useCurrentCourse()
  const courseId = course?.id ?? null
  const generation = useTutorGeneration(userId, courseId)
  const generating = generation.status === "open"
  const messages = useTutorHistory(userId, courseId)
  const conversations = useTutorConversations(userId, courseId)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const slashKey = event.key === "/" || event.code === "Slash"
      if ((event.altKey || event.ctrlKey) && slashKey && !event.shiftKey) {
        event.preventDefault()
        toggleTutorBubble()
      }
      if (event.key === "Escape" && isOpen) closeTutorBubble()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  const drawerStyle = { "--drawer-width": `${width}px` } as CSSProperties

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="studymate-fab"
            type="button"
            onClick={openTutorBubble}
            initial={{ scale: 0.75, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.75, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 360, damping: 25 }}
            className="group fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center overflow-hidden rounded-2xl border border-[#193B50] bg-[#244C66] text-[#FFFEFA] shadow-[0_14px_32px_rgba(24,35,45,.24)] transition-[width,background-color,transform] duration-300 hover:w-[174px] hover:-translate-y-0.5 hover:bg-[#193B50] focus-visible:w-[174px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#D7E0E5]"
            aria-label="打开 StudyMate 学习助手（Alt+/）"
            title="StudyMate 学习助手 · Alt+/"
          >
            <span className="grid h-13 w-13 shrink-0 place-items-center"><Sparkles className="size-5 text-[#F2C968]" strokeWidth={2.2} /></span>
            <span className="whitespace-nowrap pr-4 text-[12px] font-bold tracking-wide opacity-0 transition-opacity delay-100 duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">{generating ? "助教正在回答" : "问问 StudyMate"}</span>
            <span className={`absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-[#244C66] ${generating ? "animate-pulse bg-[#F2C968]" : "bg-[#8EB187]"}`} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
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
              aria-label="StudyMate 学习助手"
            >
              <ResizeHandle width={width} />

              <header className="shrink-0 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D9CFB7] bg-[#244C66] text-[#F2C968] shadow-[0_5px_12px_rgba(36,76,102,.14)]"><Sparkles className="size-4.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold tracking-[-0.01em] text-[#18232D]">StudyMate 学习助手</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#6F787A]"><span className={`size-1.5 rounded-full ${generating ? "animate-pulse bg-[#B1842C]" : "bg-[#6F8A69]"}`} />《{course?.name || "机器学习"}》· {generating ? "回答在后台继续生成" : "记得当前课程对话"}</div>
                  </div>
                  <IconButton onClick={() => { setHistoryOpen(false); tutorHistory.startNew(userId, courseId) }} title={generating ? "回答完成后可新建对话" : "新对话"} disabled={generating}><MessageSquarePlus className="size-4" /></IconButton>
                  <IconButton onClick={() => setHistoryOpen((value) => !value)} title={generating ? "回答完成后可切换历史" : "历史会话"} active={historyOpen} disabled={generating}><History className="size-4" /></IconButton>
                  <IconButton onClick={() => tutorHistory.clear(userId, courseId)} title={generating ? "回答完成后可清空" : "清空当前对话"} disabled={generating || messages.length === 0}><Trash2 className="size-4" /></IconButton>
                  <IconButton onClick={() => { closeTutorBubble(); navigate("/tutor") }} title="打开完整助教"><Maximize2 className="size-4" /></IconButton>
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
