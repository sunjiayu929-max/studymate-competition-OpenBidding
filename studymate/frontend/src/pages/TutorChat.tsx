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

  const signalStep = generation.status === "open" ? 2 : digitalHumanState === "speaking" ? 3 : 0

  return (
    <div className="app-page paper-theme tutor-signal-studio">
      <div className="mx-auto max-w-[1580px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="tutor" appearance="paper" labelOverride="AI 岗位助教" groupOverride="智能通信学习中心" selectionLabel={targetRole?.name || course?.name || "通用学习频道"} iconImage="/images/tutor-ai-terminal-v1.png" showRocketFormation rocketVariant="honor" />

        <section className={`tutor-signal-hero ${generation.status === "open" ? "is-running" : ""}`} aria-labelledby="tutor-signal-title">
          <div className="tutor-signal-hero-copy">
            <div className="tutor-signal-index"><strong>01</strong><span>对话工作区</span><i>LIVE TUTOR CHANNEL</i></div>
            <div><h1 id="tutor-signal-title">提问即刻进入<span>智能反馈闭环</span></h1><p>围绕「{targetRole?.name || course?.name || "当前学习目标"}」输入问题，支持文字、语音与附件。</p></div>
          </div>
          <div className="tutor-signal-wave" aria-hidden="true">
            <span className="tutor-signal-wave-core"><img src="/images/tutor-communication-core-v1.png" alt="" /></span>
            <i /><i /><i /><i /><i /><i /><i />
            <b className="is-ring-one" /><b className="is-ring-two" />
          </div>
          <div className="tutor-signal-hero-status">
            <span className="is-channel"><small>通信状态</small><strong>{generation.status === "open" ? "传输中" : "频道就绪"}</strong></span><span className="is-feedback"><small>助教反馈</small><strong>{stateCopy.label}</strong></span>
          </div>
        </section>

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

        <section className="tutor-signal-relay" aria-labelledby="tutor-relay-title">
          <div className="tutor-signal-section-title"><span><img src="/images/tutor-signal-relay-v1.png" alt="" aria-hidden="true" /></span><div><b>02 · 回答中继</b><h2 id="tutor-relay-title">一条可感知的消息传输链</h2><p>从接收问题到生成答案，再由朗读与追问完成理解校准。</p></div></div>
          <div className="tutor-signal-beam" aria-hidden="true"><i /><i /><i /><b /><b /></div>
          <div className="tutor-signal-rail" aria-label="对话反馈流程">
            <span className="tutor-signal-packet" aria-hidden="true" />
            {[{ image: "/images/tutor-feedback-capsule-v1.png", label: "接收问题" }, { image: "/images/tutor-ai-terminal-v1.png", label: "理解语境" }, { image: "/images/tutor-communication-core-v1.png", label: "生成传输" }, { image: "/images/tutor-signal-relay-v1.png", label: "反馈校准" }].map(({ image, label }, index) => (
              <div key={label} className={index === signalStep ? "is-current" : index < signalStep ? "is-done" : ""}><i>{String(index + 1).padStart(2, "0")}</i><img src={image} alt="" aria-hidden="true" /><strong>{label}</strong></div>
            ))}
          </div>
        </section>

        <section className="tutor-signal-guide">
          <div className="tutor-signal-section-title"><span><img src="/images/tutor-feedback-capsule-v1.png" alt="" aria-hidden="true" /></span><div><b>03 · 高质量提问</b><h2>从问题到行动，只差一个清晰上下文</h2><p>推荐问题位于新会话中央；输入区持续固定在对话容器底部，不被动态装饰干扰。</p></div></div>
          <div className="tutor-signal-guide-grid"><p><strong>补充目标</strong><span>说明你要理解、完成或排查什么。</span></p><p><strong>携带材料</strong><span>可上传图片、PDF、文本或代码作为本轮参考。</span></p><p><strong>闭环追问</strong><span>用朗读、复述或继续提问校准理解结果。</span></p></div>
        </section>
      </div>
    </div>
  )
}
