import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, Send, Loader2, RotateCw, Headphones, Paperclip, X, ShieldCheck, Sparkles, Target, AlertTriangle, Clock3, ImagePlus, GraduationCap, BriefcaseBusiness, Save, UserRound, ChevronDown, ScanLine, Network, Database, BrainCircuit, CheckCircle2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { InteractiveCanvas } from "@/components/InteractiveCanvas"
import { Markdown } from "@/components/Markdown"
import { ProfileRadar } from "@/components/ProfileRadar"
import { MicButton } from "@/components/MicButton"
import { SpeakerButton } from "@/components/SpeakerButton"
import { VoiceSelector } from "@/components/VoiceSelector"
import { usePostSSE } from "@/hooks/usePostSSE"
import { apiGet, apiPatch, apiPost } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { setCurrentUser, useCurrentUser } from "@/store/user"
import "./ProfileChat.css"

interface Msg {
  role: "user" | "assistant"
  content: string
  images?: string[]
}

interface ProfileDims {
  knowledge_base: Record<string, number>
  cognitive_style: Record<string, number>
  preference: Record<string, number>
  employment_skills: Record<string, number>
  goals: { primary?: string; deadline?: string; target_topics?: string[] }
  weak_points: { topics?: string[]; error_types?: string[] }
  pace: { hours_per_week?: number; intensity?: string }
  learner_background: { education?: string; major?: string; practice_status?: "unknown" | "none" | "has" }
}

interface ProfileResp {
  user_id: number
  version: number
  dims: ProfileDims
  intake_complete: boolean
  missing_fields: string[]
}

type ProfileNotice = { tone: "success" | "info" | "warning" | "error"; message: string }

type LearnerContext = {
  name: string
  learner_type: "student" | "worker"
  study_stage: string
  company: string
  target_role: string
  enterprise: unknown | null
}

export function ProfileChat() {
  useTrackPage("profile")
  const navigate = useNavigate()
  const user = useCurrentUser()
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const USER_ID = user?.user_id ?? 0
  const [profile, setProfile] = useState<ProfileResp | null>(null)
  const [messages, setMessages] = useState<Msg[]>(() => [{
    role: "assistant",
    content: buildOpeningMessage(targetRole?.name),
  }])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState("")
  const streamingRef = useRef("")  // 镜像 streaming，避开 StrictMode 在 setState updater 里 double-invoke 副作用
  const [lastReasoning, setLastReasoning] = useState("")
  const [profileNotice, setProfileNotice] = useState<ProfileNotice | null>(null)
  const [identity, setIdentity] = useState<LearnerContext>({
    name: user?.name || "",
    learner_type: user?.learner_type || "student",
    study_stage: user?.study_stage || "",
    company: user?.company || "",
    target_role: user?.target_role || "",
    enterprise: null,
  })
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityNotice, setIdentityNotice] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 用户是否「贴着底部」：只有贴底时才跟随自动滚，否则上滑看历史不被打断
  const pinnedRef = useRef(true)

  // 看图建画像：待发送的图片（base64，已压缩）
  const MAX_IMAGES = 3
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [imgBusy, setImgBusy] = useState(false)
  const [imgHint, setImgHint] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distToBottom < 80
  }, [])

  // 提示 2.5s 后自动消失
  useEffect(() => {
    if (!imgHint) return
    const t = setTimeout(() => setImgHint(""), 2500)
    return () => clearTimeout(t)
  }, [imgHint])

  // 统一入口：接受任意文件，过滤出图片、压缩、入队（粘贴 / 选文件共用）
  const addImageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const images = files.filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) {
        setImgHint("暂只支持图片附件")
        return
      }
      const skippedNonImage = files.length - images.length
      setImgBusy(true)
      try {
        const room = MAX_IMAGES - pendingImages.length
        if (room <= 0) {
          setImgHint(`最多 ${MAX_IMAGES} 张`)
          return
        }
        const picked = images.slice(0, room)
        const compressed = await Promise.all(picked.map((f) => compressImage(f)))
        setPendingImages((cur) => [...cur, ...compressed].slice(0, MAX_IMAGES))
        if (skippedNonImage > 0) setImgHint("已忽略非图片文件，暂只支持图片")
        else if (images.length > room) setImgHint(`最多 ${MAX_IMAGES} 张，多余已忽略`)
      } catch (e) {
        console.error("图片处理失败：", e)
      } finally {
        setImgBusy(false)
      }
    },
    [pendingImages.length]
  )

  const handlePickFiles = useCallback(
    (files: FileList | null) => {
      if (files) addImageFiles(Array.from(files))
      if (fileRef.current) fileRef.current.value = ""
    },
    [addImageFiles]
  )

  // 聊天框直接粘贴图片（仿主流大模型交互）
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
        e.preventDefault()
        addImageFiles(imgs)
      }
    },
    [addImageFiles]
  )

  const loadProfile = useCallback(async () => {
    if (!USER_ID) return
    const p = await apiGet<ProfileResp>(`/profile/${USER_ID}`)
    setProfile(p)
  }, [USER_ID])

  useEffect(() => {
    if (!USER_ID) return
    let active = true
    apiGet<ProfileResp>(`/profile/${USER_ID}`).then((value) => {
      if (active) {
        setProfile(value)
        setMessages((current) => current.length === 1
          ? [{ role: "assistant", content: buildOpeningMessage(targetRole?.name, value.missing_fields) }]
          : current)
      }
    })
    return () => {
      active = false
    }
  }, [USER_ID, targetRole?.name])

  useEffect(() => {
    if (!USER_ID) return
    let active = true
    apiGet<LearnerContext>("/learner/context").then((context) => {
      if (active) setIdentity(context)
    }).catch(() => {
      if (active) setIdentityNotice("身份资料暂时无法读取")
    })
    return () => {
      active = false
    }
  }, [USER_ID])

  const saveIdentity = async (event: React.FormEvent) => {
    event.preventDefault()
    setIdentitySaving(true)
    setIdentityNotice("")
    try {
      const next = await apiPatch<LearnerContext>("/learner/context", {
        learner_type: identity.learner_type,
        study_stage: identity.learner_type === "student" ? identity.study_stage.trim() : "",
        company: identity.learner_type === "worker" ? identity.company.trim() : "",
        target_role: identity.target_role.trim(),
      })
      setIdentity(next)
      if (user) {
        setCurrentUser({
          ...user,
          learner_type: next.learner_type,
          study_stage: next.study_stage,
          company: next.company,
          target_role: next.target_role,
        })
      }
      setIdentityNotice("身份资料已保存")
    } catch (error) {
      setIdentityNotice(error instanceof Error ? error.message : "身份资料保存失败，请稍后重试")
    } finally {
      setIdentitySaving(false)
    }
  }

  useEffect(() => {
    const scroller = scrollRef.current
    if (!pinnedRef.current || !scroller) return

    // 仅跟随画像对话容器，避免首屏渲染时把整个页面滚到对话底部。
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }, [messages, streaming])

  const { status, send } = usePostSSE({
    onEvent(ev) {
      switch (ev.event) {
        case "delta": {
          // 后端 delta 的 data 是裸字符串，hook 会尝试 JSON.parse —— 单字符大概率 parse 失败保留原文
          const chunk = typeof ev.data === "string" ? ev.data : ev.raw
          streamingRef.current += chunk
          setStreaming(streamingRef.current)
          break
        }
        case "patch": {
          const data = ev.data as {
            patch?: { reasoning?: string }
            version?: number
            dims?: ProfileDims
            changed?: boolean
            changed_fields?: string[]
            warning?: string | null
            intake_complete?: boolean
            missing_fields?: string[]
          }
          if (data.dims) {
            setProfile((p) => (p ? {
              ...p,
              version: data.version ?? p.version,
              dims: data.dims!,
              intake_complete: data.intake_complete ?? p.intake_complete,
              missing_fields: data.missing_fields ?? p.missing_fields,
            } : p))
          }
          if (data.patch?.reasoning) {
            setLastReasoning(data.patch.reasoning)
          }
          if (data.warning) {
            setProfileNotice({ tone: "warning", message: data.warning })
          } else if (data.changed) {
            const count = data.changed_fields?.length || 0
            setProfileNotice({ tone: "success", message: `画像已更新${count ? `，本轮调整 ${count} 个字段` : ""}` })
          } else {
            setProfileNotice({ tone: "info", message: "本轮没有发现需要修改的画像信息，现有画像保持不变" })
          }
          break
        }
        case "done": {
          const finalText = streamingRef.current
          streamingRef.current = ""
          setStreaming("")
          if (finalText) {
            setMessages((m) => [...m, { role: "assistant", content: finalText }])
          }
          break
        }
        case "error": {
          const message = typeof ev.data === "string" ? ev.data : ev.raw
          const partial = streamingRef.current
          streamingRef.current = ""
          setStreaming("")
          if (partial) setMessages((current) => [...current, { role: "assistant", content: partial }])
          setProfileNotice({ tone: "error", message: message || "画像更新失败，请稍后重试" })
          break
        }
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    // 允许「只发图不打字」；纯空内容不发
    if ((!text && pendingImages.length === 0) || status === "open") return
    pinnedRef.current = true // 发新消息时回到底部跟随
    const images = pendingImages
    const newMsgs: Msg[] = [
      ...messages,
      { role: "user", content: text, images: images.length ? images : undefined },
    ]
    setMessages(newMsgs)
    setInput("")
    setPendingImages([])
    setStreaming("")
    streamingRef.current = ""
    setLastReasoning("")
    setProfileNotice(null)
    send("/api/profile/chat", {
      user_id: USER_ID,
      message: text,
      // 只发送本轮之前的纯文字历史；当前消息由 message 字段单独传递。
      history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      images: images.length ? images : undefined,
      target_role: targetRole?.name,
      target_role_id: targetRole?.id,
      course_id: course?.id,
      core_competencies: targetRole?.skills ?? [],
    })
  }

  const handleReset = async () => {
    await apiPost(`/profile/${USER_ID}/reset`)
    setMessages([{ role: "assistant", content: buildOpeningMessage(targetRole?.name) }])
    setStreaming("")
    setLastReasoning("")
    setProfileNotice(null)
    await loadProfile()
  }

  const primaryGoal = profile?.dims.goals.primary?.trim() || "等待对话补充"
  const weakTopics = profile?.dims.weak_points.topics?.filter(Boolean) || []
  const targetTopics = profile?.dims.goals.target_topics?.filter(Boolean) || []
  const hoursPerWeek = profile?.dims.pace.hours_per_week || 0
  // Keep the training entry available for existing and partially migrated profiles.
  const hasProfileContent = Boolean(
    profile?.dims.goals.primary?.trim()
    || weakTopics.length
    || targetTopics.length
    || hoursPerWeek,
  )
  const quickPrompts = targetRole ? [
    "我是计算机专业本科生，编程基础较好，数学和岗位领域知识一般。",
    "我更喜欢边做边学、循序渐进地学，希望多提供文档、代码实操和小测。",
    `我每周能投入 6 小时，希望重点训练${targetRole.skills.slice(0, 2).join("和")}。`,
  ] : [
    "我还没有确定目标岗位，希望先梳理自己的专业与实践经历。",
    "我更喜欢边看案例边动手实践，每周能投入 6 小时。",
    "我做过一些项目，希望判断自己更适合哪个岗位方向。",
  ]
  const isFreshConversation = messages.length === 1 && !streaming
  const completion = profile?.intake_complete ? 100 : Math.max(18, 100 - (profile?.missing_fields.length ?? 5) * 14)
  return (
    <div className={`app-page paper-theme profile-scan ${status === "open" ? "is-running" : ""}`}>
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="profile" appearance="paper" iconImage="/images/profile-scan-device.png" showRocketFormation rocketVariant="honor" />

        <main className="profile-scan-main mt-16 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="profile-scan-dialogue flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)] xl:h-[780px]">
            <header className="flex flex-col items-stretch gap-2.5 border-b border-[#D7D1C4] bg-[#F8F6F0] px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                  <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
                </Link>
                <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
                <span className="profile-scan-device-avatar is-compact"><img src="/images/profile-assistant-device-v1.png" alt="" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-bold text-[#18232D]">因材智训岗位画像助手</h2>
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">补充目标、经历和学习安排</p>
                </div>
              </div>
              <div className="nav-scroll flex w-full items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto sm:shrink-0 sm:overflow-visible sm:pb-0">
                <span className="hidden w-fit items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-1.5 text-[11px] font-bold text-[#59636B] sm:inline-flex" aria-live="polite">
                  {status === "open" ? <Loader2 className="size-3.5 animate-spin text-[#B85C3E]" /> : <span className="size-2 rounded-full bg-[#6F8A69]" />}
                  {status === "open" ? "正在分析并更新画像" : "可以继续对话"}
                </span>
                <VoiceSelector compact />
                <span className="hidden h-9 items-center gap-1.5 rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] px-3 text-[11px] font-bold text-[#557052] sm:inline-flex">
                  <ShieldCheck className="size-3.5" />画像 v{profile?.version ?? "—"}
                </span>
                <button type="button" onClick={handleReset} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[11px] font-bold text-[#7A817F] transition-colors hover:bg-[#F4E8E2] hover:text-[#9A4E35]">
                  <RotateCw className="size-3.5" /><span className="hidden sm:inline">重置画像</span>
                </button>
              </div>
            </header>

            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-[#FDFBF6] px-4 sm:px-6">
              <div className={`flex w-full flex-col ${isFreshConversation ? "min-h-full justify-center py-8" : "gap-7 py-8"}`}>
                {isFreshConversation ? (
                  <div className="mx-auto w-full max-w-[720px] text-center">
                    <span className="profile-scan-device-avatar is-prominent"><img src="/images/profile-assistant-device-v1.png" alt="" /></span>
                    <h3 className="mt-4 text-xl font-bold tracking-[-0.03em] text-[#18232D]">先说说你的目标和经历</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#66717B]">
                      告诉我你的专业、学习基础和想学习的岗位。我会分几步补充信息，再为你安排训练。
                    </p>
                    <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                      {quickPrompts.map((prompt, index) => (
                        <button key={prompt} type="button" onClick={() => setInput(prompt)} className="profile-scan-question-card group rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] px-3.5 py-3 text-[11px] font-semibold leading-5 text-[#59636B] transition-all hover:-translate-y-0.5 hover:border-[#AFA796] hover:bg-[#F1EDE4] hover:text-[#244C66]">
                          <span className="mb-2 block text-[10px] font-bold tracking-[0.12em] text-[#9A8D78]">0{index + 1}</span>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message, index) => <MessageBubble key={index} role={message.role} content={message.content} images={message.images} />)}
                    {streaming && <MessageBubble role="assistant" content={streaming} streaming />}
                  </>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="profile-scan-composer border-t border-[#E3DED3] bg-[#FDFBF6] px-4 pb-3 pt-3 sm:px-6">
              <div className="w-full">
                <div className="rounded-[20px] border border-[#CFC8B9] bg-[#FFFEFA] p-2 shadow-[0_10px_28px_rgba(24,35,45,.08)] transition-shadow focus-within:border-[#9FB1BC] focus-within:shadow-[0_12px_32px_rgba(36,76,102,.12)]">
                  {pendingImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1 pb-2">
                      {pendingImages.map((src, index) => (
                        <div key={index} className="relative">
                          <img src={src} alt={`待发送图片 ${index + 1}`} className="size-14 rounded-xl border border-[#CFC8B9] object-cover" />
                          <button type="button" onClick={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#18232D] text-[#FFFEFA] transition-transform hover:scale-110" aria-label="移除图片"><X className="size-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {imgHint && <div className="px-2 pb-1 text-[11px] font-semibold text-[#9B7429]">{imgHint}</div>}
                  <label className="block">
                    <span className="sr-only">画像对话内容</span>
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                      disabled={status === "open"}
                      rows={1}
                      placeholder="告诉我你的目标、基础或最近遇到的困难…"
                      className="max-h-28 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-[#18232D] outline-none placeholder:text-[#929792] disabled:opacity-60"
                    />
                  </label>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => handlePickFiles(event.target.files)} />
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={status === "open" || pendingImages.length >= MAX_IMAGES || imgBusy} title="上传图片或成绩单截图" aria-label="上传图片" className="grid size-9 shrink-0 place-items-center rounded-xl text-[#66717B] transition-colors hover:bg-[#F4ECD8] hover:text-[#8E6925] disabled:opacity-40">
                        {imgBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                      </button>
                      <MicButton size="sm" onTranscript={(text) => setInput(text)} onError={(error) => console.error("ASR 失败：", error)} />
                      <button type="button" onClick={() => navigate("/tutor/voice")} title="进入实时语音对话" aria-label="进入实时语音对话" className="grid size-9 shrink-0 place-items-center rounded-xl text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]"><Headphones className="size-4" /></button>
                    </div>
                    <button type="submit" disabled={status === "open" || (!input.trim() && pendingImages.length === 0)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#244C66] text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.18)] transition-all hover:-translate-y-0.5 hover:bg-[#193B50] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40" aria-label="发送画像对话">
                      {status === "open" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#7A817F]">
                  <span className="inline-flex items-center gap-1.5"><Paperclip className="size-3" />支持粘贴或上传最多 {MAX_IMAGES} 张图片</span>
                  <span>Enter 发送 · Shift+Enter 换行</span>
                </div>
              </div>
            </form>
          </section>

          <aside className="profile-scan-sidebar space-y-6">
            <section className="profile-scan-result-card rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]">当前画像 · v{profile?.version ?? "—"}</span>
                  <h2 className="mt-1 text-sm font-bold tracking-[-0.02em] text-[#18232D]">这些信息会用于安排学习</h2>
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#DDD4BF] bg-[#F4ECD8] text-[#9B7429]" title="对话后实时更新">
                  <Sparkles className="size-3.5" />
                </span>
              </div>
              <div className="profile-scan-facts">
                <ProfileFact
                  icon={Target}
                  label="当前目标"
                  value={primaryGoal}
                  detail="作为课程内容与岗位能力的对标基准"
                  tone="blue"
                />
                <ProfileFact
                  icon={AlertTriangle}
                  label="优先关注"
                  value={weakTopics.length ? weakTopics.slice(0, 2).join("、") : targetTopics.slice(0, 2).join("、") || "等待补充"}
                  detail="优先补齐现场诊断与沟通证据"
                  tone="red"
                  compact
                />
                <ProfileFact
                  icon={Clock3}
                  label="学习节奏"
                  value={hoursPerWeek ? `每周 ${hoursPerWeek} 小时` : "等待补充"}
                  detail="建议拆分为每周 4 次短周期训练"
                  tone="gold"
                  compact
                />
                <ProfileFact
                  icon={CheckCircle2}
                  label="画像进度"
                  value={profile?.intake_complete ? "100% · 已完成" : `${completion}% · 持续采集`}
                  detail="继续对话会实时更新能力维度"
                  tone="blue"
                  compact
                />
              </div>
            </section>
            {lastReasoning && (
              <section className="profile-scan-reason-card rounded-[22px] border border-[#C9D1CB] bg-[#E9EEE6] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#557052]"><ShieldCheck className="size-4" />本轮画像更新依据</div>
                <p className="mt-2 text-[11px] leading-5 text-[#59636B]">{lastReasoning}</p>
              </section>
            )}

            {profileNotice && (
              <section
                role={profileNotice.tone === "error" ? "alert" : "status"}
                className={`profile-scan-notice-card rounded-[22px] border p-4 text-[11px] leading-5 ${
                  profileNotice.tone === "success"
                    ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]"
                    : profileNotice.tone === "error"
                      ? "border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"
                      : profileNotice.tone === "warning"
                        ? "border-[#DDD4BF] bg-[#F4ECD8] text-[#8E6925]"
                        : "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"
                }`}
              >
                <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{profileNotice.message}</div>
              </section>
            )}

            {hasProfileContent && (
              <section className="profile-scan-action-card rounded-[22px] border border-[#C7D2D8] bg-[#E7EDF3] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]">
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-[#315E83]"><Sparkles className="size-3.5" />画像已准备好</div>
                <h3 className="mt-2 text-sm font-bold text-[#18232D]">下一步：生成训练计划</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#596A75]">{course ? `将根据“${targetRole?.name || course.name}”的岗位要求和你的画像安排内容。` : targetRole ? `目标岗位已选为“${targetRole.name}”；岗位知识库接入后即可生成训练资源。` : "请先选择目标岗位，再开始训练。"}</p>
                <Link to={course || targetRole ? "/competency" : "/courses?returnTo=%2Fprofile"} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-[#FFFEFA] hover:bg-[#193B50]">
                  {course || targetRole ? "进入岗位训练中心" : "先选择目标岗位"}<ArrowRight className="size-3.5" />
                </Link>
              </section>
            )}
          </aside>
        </main>
        <form onSubmit={saveIdentity} className="profile-scan-identity-card profile-scan-identity-row rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold tracking-[0.12em] text-[#315E83]">身份资料</span>
              <h2 className="mt-1 text-sm font-bold tracking-[-0.02em] text-[#18232D]">随时调整学习身份</h2>
              <p className="mt-1 text-[10px] leading-4 text-[#7A817F]">保存后会同步到菜单栏。</p>
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]"><UserRound className="size-3.5" /></span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 py-2.5 text-[11px] font-semibold text-[#18232D]">
            <UserRound className="size-3.5 shrink-0 text-[#66717B]" />
            <span className="truncate">{identity.name || user?.name || "学习者"}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#F1EDE4] px-3 py-2 text-[10px] font-bold text-[#59636B]">
            {identity.learner_type === "student" ? <GraduationCap className="size-3.5 text-[#315E83]" /> : <BriefcaseBusiness className="size-3.5 text-[#52704D]" />}
            <span>注册身份 · {identity.learner_type === "student" ? "学生" : "从业者"}</span>
          </div>
          {identity.learner_type === "student" ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[10px] font-bold text-[#394950]">学习阶段</span>
              <span className="group relative flex h-10 items-center rounded-xl border border-[#D7D1C4] bg-white transition-[border-color,box-shadow] focus-within:border-[#244C66] focus-within:shadow-[0_0_0_3px_rgba(197,212,217,.55)]">
                <GraduationCap className="ml-3 size-3.5 shrink-0 text-[#8A918F] transition-colors group-focus-within:text-[#244C66]" />
                <select value={identity.study_stage} onChange={(event) => setIdentity((current) => ({ ...current, study_stage: event.target.value }))} className={`h-full min-w-0 flex-1 appearance-none bg-transparent px-2.5 pr-8 text-xs outline-none ${identity.study_stage ? "text-[#293D2A]" : "text-[#9A9F9C]"}`}>
                  <option value="">暂不填写</option>
                  <option value="本科">本科</option>
                  <option value="研究生">研究生</option>
                  <option value="博士">博士</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-[#8A918F]" />
              </span>
            </label>
          ) : (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[10px] font-bold text-[#394950]">在职公司</span>
              <span className="flex h-10 items-center rounded-xl border border-[#D7D1C4] bg-white px-3 focus-within:border-[#52704D]"><BriefcaseBusiness className="mr-2 size-3.5 shrink-0 text-[#8A918F]" /><input value={identity.company} onChange={(event) => setIdentity((current) => ({ ...current, company: event.target.value }))} placeholder="例如：星河科技" className="min-w-0 flex-1 bg-transparent text-xs text-[#293D2A] outline-none placeholder:text-[#9AA598]" /></span>
            </label>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span role={identityNotice.includes("失败") || identityNotice.includes("无法") ? "alert" : "status"} className={`min-w-0 truncate text-[10px] ${identityNotice.includes("失败") || identityNotice.includes("无法") ? "text-[#9A4E35]" : "text-[#557052]"}`}>{identityNotice}</span>
            <button type="submit" disabled={identitySaving} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#244C66] px-3 text-[10px] font-bold text-white disabled:opacity-50">{identitySaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}保存资料</button>
          </div>
        </form>
        <section className="profile-scan-hero" aria-labelledby="profile-scan-title">
          <div className="profile-scan-identity">
            <span className="profile-scan-index">02</span>
            <div><span>LEARNER SIGNAL INTAKE</span><b>{identity.name || user?.name || "学习者"} · {identity.learner_type === "student" ? "学生画像" : "从业者画像"}</b></div>
          </div>
          <div className="profile-scan-title-block">
            <div><span>PROFILE / SYNTHESIS</span><h1 id="profile-scan-title">人物扫描<br /><em>能力采集与画像汇聚</em></h1><p>通过对话、经历与学习偏好持续补全证据，让每一条训练建议都有画像依据。</p></div>
          </div>
          <div className="profile-scan-progress" aria-live="polite">
            <div><span>{status === "open" ? "扫描运行中" : profile?.intake_complete ? "画像已就绪" : "等待继续采集"}</span><strong>{completion}%</strong></div>
            <div className="profile-scan-progress-rule"><i style={{ width: `${completion}%` }} /></div>
            <div className="profile-scan-stage-rail">
              <span className="is-done"><b>01</b>身份校准</span><span className={completion > 35 ? "is-done" : "is-current"}><b>02</b>对话采集</span><span className={status === "open" ? "is-current" : completion > 70 ? "is-done" : ""}><b>03</b>能力识别</span><span className={profile?.intake_complete ? "is-done" : ""}><b>04</b>画像汇聚</span>
            </div>
          </div>
        </section>
        <section className="profile-scan-insights">
          <div className="profile-scan-data-transition" aria-label="采集信息通过航测扫描进入能力识别阶段">
            <span className="profile-scan-transition-label is-source"><small>01 · SIGNAL INTAKE</small><strong>问答与资料采集</strong></span>
            <i className="profile-scan-flight-route" aria-hidden="true">
              <span className="is-eastbound"><img src="/images/profile-survey-drone-v1.png" alt="" /></span>
              <span className="is-westbound"><img src="/images/profile-survey-drone-v1.png" alt="" /></span>
              <b className="is-particle-one" /><b className="is-particle-two" /><b className="is-particle-three" />
            </i>
            <span className="profile-scan-transition-label is-output"><small>02 · PROFILE SYNTHESIS</small><strong>能力信号汇聚</strong></span>
          </div>
          <div className="profile-scan-insight-grid">
            <section className="profile-scan-map-section">
              <div className="profile-scan-section-title"><span>03</span><div><small>ABILITY SIGNAL MAP</small><h2>能力证据汇聚图</h2><p>对话信号持续流向画像核心，已识别信息会点亮对应节点。</p></div></div>
              <ProfileGatheringCanvas profile={profile} running={status === "open"} />
            </section>
            {profile ? (
              <section className="profile-scan-radar-grid">
                <ProfileRadar title="知识基础" data={profile.dims.knowledge_base} color="#315E83" height={124} />
                <ProfileRadar title="认知风格" data={profile.dims.cognitive_style} color="#B85C3E" height={124} />
                <ProfileRadar title="资源偏好" data={profile.dims.preference} color="#6F8A69" height={124} />
              </section>
            ) : (
              <div className="profile-scan-results-empty">画像加载后，这里会实时显示目标、基础、偏好和节奏。</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ProfileGatheringCanvas({ profile, running }: { profile: ProfileResp | null; running: boolean }) {
  const signals = [
    { id: "background", label: "背景经历", detail: profile?.dims.learner_background.major || profile?.dims.learner_background.education || "等待采集", x: 34, y: 48, Icon: GraduationCap, ready: Boolean(profile?.dims.learner_background.major || profile?.dims.learner_background.education) },
    { id: "knowledge", label: "知识基础", detail: Object.keys(profile?.dims.knowledge_base || {}).slice(0, 2).join(" · ") || "等待识别", x: 34, y: 190, Icon: Database, ready: Boolean(Object.keys(profile?.dims.knowledge_base || {}).length) },
    { id: "preference", label: "学习偏好", detail: Object.keys(profile?.dims.preference || {}).slice(0, 2).join(" · ") || "等待识别", x: 34, y: 332, Icon: BrainCircuit, ready: Boolean(Object.keys(profile?.dims.preference || {}).length) },
  ]
  return (
    <InteractiveCanvas canvasWidth={720} canvasHeight={470} viewportHeight={470} label="学习者能力证据汇聚" className={`profile-scan-canvas ${running ? "is-running" : ""}`}>
      <svg className="profile-scan-links" viewBox="0 0 720 470" aria-hidden="true">
        <path d="M238 94 C330 94 335 214 434 214" /><path d="M238 236 C330 236 338 236 434 236" /><path d="M238 378 C330 378 335 258 434 258" />
      </svg>
      <div className="profile-scan-source"><ScanLine /><span>对话 / 图片</span><b>持续采集</b></div>
      {signals.map(({ id, label, detail, x, y, Icon, ready }) => <article key={id} className={`profile-scan-node ${ready ? "is-ready" : "is-waiting"}`} style={{ left: x, top: y }}><span><Icon /></span><div><small>{ready ? "已识别" : "待补充"}</small><strong>{label}</strong><p>{detail}</p></div>{ready && <CheckCircle2 className="profile-scan-check" />}</article>)}
      <article className={`profile-scan-core ${profile?.intake_complete ? "is-ready" : ""}`}><span><UserRound /></span><small>PROFILE CORE · v{profile?.version ?? "—"}</small><strong>学习者画像</strong><p>{profile?.dims.goals.primary || "目标、基础、偏好与节奏正在汇聚"}</p><div><Network />{profile?.intake_complete ? "可进入训练" : "等待更多证据"}</div></article>
    </InteractiveCanvas>
  )
}

function buildOpeningMessage(roleName?: string, missingFields?: string[]): string {
  const remaining = (missingFields ?? [
    "学历与专业背景",
    "知识基础与薄弱点",
    "认知风格",
    "资源偏好",
    "学习目标与时间安排",
  ])
    .filter((field) => field !== "就业技能与实践经历" && !(roleName && field === "目标岗位"))
  if (!remaining.length) {
    return `你的${roleName ? `“${roleName}”` : "岗位"}画像已准备好，可以进入岗位训练中心。`
  }
  const roleText = roleName ? `目标岗位已确定为 **${roleName}**。` : ""
  const pending = new Set(remaining)
  let question = "请先说明你的目标岗位。"
  if (pending.has("学历与专业背景") || pending.has("知识基础与薄弱点")) {
    question = pending.has("学历与专业背景") && pending.has("知识基础与薄弱点")
      ? "先介绍一下你的学历和专业，以及与岗位相关的课程或技术基础：哪些比较熟悉，哪些较薄弱？"
      : pending.has("学历与专业背景")
        ? "请补充你的学历、年级或专业背景。"
        : "你与岗位相关的课程或技术基础怎样？请说说比较熟悉和较薄弱的内容。"
  } else if (pending.has("认知风格") || pending.has("资源偏好")) {
    question = pending.has("认知风格") && pending.has("资源偏好")
      ? "学新内容时，你更喜欢先动手实践还是先吃透理论？偏爱循序渐进还是直接挑战综合难题？希望训练中多提供文档、思维导图、视频、代码实操还是小测？"
      : pending.has("认知风格")
        ? "学新内容时，你更喜欢先动手实践还是先吃透理论？偏爱循序渐进还是直接挑战综合难题？"
        : "训练资源方面，你更希望多提供文档、思维导图、视频、代码实操还是小测？"
  } else if (pending.has("学习目标与时间安排")) {
    question = "你每周可以投入多少学习时间？如果有期望完成时间也可以一起说明。"
  }
  return `${roleText}${question}我会分几步询问，不重复。`
}

function ProfileFact({ icon: Icon, label, value, detail, tone, compact = false }: { icon: LucideIcon; label: string; value: string; detail?: string; tone: "blue" | "red" | "gold"; compact?: boolean }) {
  const toneMap = {
    blue: "bg-[#E7EDF3] text-[#315E83]",
    red: "bg-[#F4E8E2] text-[#9A4E35]",
    gold: "bg-[#F4ECD8] text-[#8E6925]",
  }
  return (
    <div className={`profile-scan-fact-card flex items-start rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] ${compact ? "gap-2 p-2.5" : "gap-3 p-3"}`}>
      <span className={`grid shrink-0 place-items-center rounded-full ${compact ? "size-7" : "size-8"} ${toneMap[tone]}`}><Icon className={compact ? "size-3.5" : "size-4"} /></span>
      <div className="min-w-0">
        <span className="profile-scan-fact-label text-[10px] font-bold text-[#8A8172]">{label}</span>
        <p className={`mt-0.5 line-clamp-2 font-semibold text-[#18232D] ${compact ? "text-[10px] leading-4" : "text-[11px] leading-5"}`}>{value}</p>
        {detail && <span className="profile-scan-fact-detail">{detail}</span>}
      </div>
    </div>
  )
}

function MessageBubble({ role, content, images, streaming }: { role: "user" | "assistant"; content: string; images?: string[]; streaming?: boolean }) {
  const isUser = role === "user"

  if (!isUser) {
    return (
      <div className="min-w-0 pr-10 sm:pr-16">
        <div className="min-w-0 max-w-[780px]">
          {streaming && <span className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#6F8A69]"><span className="size-1.5 animate-pulse rounded-full bg-[#6F8A69]" />正在回复</span>}
          <div className="text-[#27343D]">
            <Markdown content={content} className="text-sm leading-7" />
            {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#315E83]" />}
          </div>
          {!streaming && content && <div className="mt-2"><SpeakerButton text={content} /></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 justify-end pl-10 sm:pl-16">
      <div className="min-w-0 max-w-[78%] overflow-x-auto rounded-[20px] rounded-tr-md bg-[#244C66] px-4 py-3 text-[#FFFEFA] shadow-[0_7px_16px_rgba(36,76,102,.13)]">
        <div className="space-y-2">
          {images && images.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {images.map((src, index) => (
                <a key={index} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`图片 ${index + 1}`} className="max-h-40 rounded-xl border border-white/20 object-cover" /></a>
              ))}
            </div>
          )}
          {content && <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>}
        </div>
      </div>
    </div>
  )
}
