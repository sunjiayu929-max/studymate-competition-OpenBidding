import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import { DigitalHumanVideo } from "@/components/DigitalHumanVideo"
import type { SpeakerStatus } from "@/components/SpeakerButton"
import { TutorChatPanel } from "@/components/TutorChatPanel"
import { useTutorContext } from "@/hooks/useTutorContext"
import type { DigitalHumanState } from "@/lib/digitalHuman"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { useTutorGeneration } from "@/store/tutorGeneration"
import { useCurrentUser } from "@/store/user"
import "./TutorChat.css"

export function TutorChat() {
  useTrackPage("tutor")
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const generation = useTutorGeneration(user?.user_id ?? 0, course?.id ?? null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [speechStatus, setSpeechStatus] = useState<SpeakerStatus>("idle")
  const [conversationState, setConversationState] = useState<DigitalHumanState | null>(null)
  const captureMode = searchParams.get("capture") === "1"

  useTutorContext(null)

  const handleCaptureModeChange = useCallback((enabled: boolean) => {
    const next = new URLSearchParams(searchParams)
    if (enabled) next.set("capture", "1")
    else next.delete("capture")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const digitalHumanState = useMemo<DigitalHumanState>(() => {
    if (conversationState) return conversationState
    if (speechStatus === "playing") return "speaking"
    if (speechStatus === "loading" || generation.status === "open") return "thinking"
    return "idle"
  }, [conversationState, generation.status, speechStatus])

  const stateCopy = digitalHumanState === "speaking"
    ? { label: "正在讲解", detail: "数字人正在同步播报助教回答", dot: "bg-[#6F8A69]" }
    : digitalHumanState === "thinking"
      ? { label: "正在思考", detail: "正在组织答案或准备朗读", dot: "bg-[#B1842C]" }
      : { label: "随时在线", detail: "可以在左侧输入问题开始学习", dot: "bg-[#6F8A69]" }

  return (
    <div className="app-page paper-theme tutor-signal-studio">
      <div className="mx-auto max-w-[1580px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="tutor" appearance="paper" labelOverride="AI 岗位助教" groupOverride="智能通信学习中心" selectionLabel={targetRole?.name || course?.name || "通用学习频道"} iconImage="/images/tutor-ai-terminal-v1.png" showRocketFormation rocketVariant="honor" />

        <main className="tutor-signal-workspace grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className={`tutor-signal-chat flex min-h-[680px] min-w-0 flex-col ${generation.status === "open" ? "is-running" : ""} ${captureMode ? "overflow-visible" : "overflow-hidden xl:min-h-0"}`}>
            <TutorChatPanel
              variant="fullscreen"
              captureMode={captureMode}
              onCaptureModeChange={handleCaptureModeChange}
              onSpeechStatusChange={setSpeechStatus}
              onVoiceConversationStateChange={setConversationState}
            />
          </section>

          <aside
            data-testid="tutor-digital-human-sidebar"
            className={`tutor-signal-avatar relative min-h-[680px] overflow-hidden xl:min-h-0 ${captureMode ? "xl:sticky xl:top-4" : ""}`}
            aria-label="AI 助教数字人"
          >
            <DigitalHumanVideo
              state={digitalHumanState}
              priority
              active={!captureMode}
              idlePoster="/digital-human/studymate-lecturer-idle-hd-v2.png"
              showFallbackStatus
              className="absolute inset-0 size-full"
              mediaClassName="object-cover object-center"
              alt="AI 助教数字讲师"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-40 bg-gradient-to-b from-[#142631]/55 via-[#142631]/15 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[38%] bg-gradient-to-t from-[#10232D]/92 via-[#142631]/48 to-transparent" />

            <div className="absolute left-4 right-4 top-4 z-[3] rounded-2xl border border-white/20 bg-[#142631]/72 px-4 py-3 text-white shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full border border-white/70 ${stateCopy.dot} ${digitalHumanState !== "idle" ? "animate-pulse" : ""}`} />
                <span className="text-[10px] font-bold tracking-[.12em] text-white/65">AI DIGITAL TUTOR</span>
                <span className="ml-auto text-xs font-bold">{stateCopy.label}</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-white/72">{stateCopy.detail}</p>
            </div>

            <div className="absolute inset-x-4 bottom-4 z-[3] rounded-[22px] border border-white/20 bg-[#FFFEFA]/94 p-3.5 shadow-[0_16px_38px_rgba(10,25,34,.22)] backdrop-blur-md">
              <div className="flex items-center gap-3 px-1">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]">
                  <img src={digitalHumanState === "thinking" ? "/images/tutor-communication-core-v1.png" : digitalHumanState === "speaking" ? "/images/tutor-signal-relay-v1.png" : "/images/tutor-ai-terminal-v1.png"} alt="" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-xs text-[#18232D]">{targetRole?.name || course?.name || "AI 岗位助教"}</strong>
                  <span className="mt-0.5 block truncate text-[10px] text-[#66717B]">点击回答旁的朗读按钮，数字人会同步讲解</span>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
