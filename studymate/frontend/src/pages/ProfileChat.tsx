import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, Send, Loader2, RotateCw, Headphones, Paperclip, X, ShieldCheck, Sparkles, Target, AlertTriangle, Clock3, ImagePlus, GraduationCap, BriefcaseBusiness, Save, UserRound, ChevronDown } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { Markdown } from "@/components/Markdown"
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

  const primaryGoal = profile?.dims.goals.primary?.trim() || targetRole?.name || "等待对话补充"
  const weakTopics = profile?.dims.weak_points.topics?.filter(Boolean) || []
  const targetTopics = profile?.dims.goals.target_topics?.filter(Boolean) || []
  const hoursPerWeek = profile?.dims.pace.hours_per_week || 0
  const background = profile?.dims.learner_background.major
    || profile?.dims.learner_background.education
    || identity.study_stage
    || identity.company
    || "等待补充"
  const preferenceLabels = profile?.missing_fields.includes("资源偏好")
    ? []
    : Object.entries(profile?.dims.preference || {})
      .filter(([, value]) => Number(value) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([key]) => formatProfileKey(key))
  const focusTopics = weakTopics.length ? weakTopics : targetTopics
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
    <div className={`app-page paper-theme profile-page ${status === "open" ? "is-running" : ""}`}>
      <div className="profile-page-inner">
        <AppTopbar current="profile" appearance="paper" iconImage="/images/profile-scan-device.png" />

        <main className="profile-workspace">
          <section className="profile-summary-card" aria-labelledby="profile-summary-title">
            <div className="profile-summary-heading">
              <div>
                <span>实时画像 · v{profile?.version ?? "—"}</span>
                <h2 id="profile-summary-title">系统已经认识了这些</h2>
              </div>
              <span className="profile-summary-live" aria-live="polite">
                {status === "open" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {status === "open" ? "更新中" : "随对话更新"}
              </span>
            </div>

            <div className="profile-completion" aria-label={`画像完成度 ${completion}%`}>
              <div>
                <span>{profile?.intake_complete ? "画像已完成" : "画像完成度"}</span>
                <strong>{completion}%</strong>
              </div>
              <div className="profile-completion-track"><i style={{ width: `${completion}%` }} /></div>
              <p>
                {profile?.intake_complete
                  ? "目标、背景、偏好和节奏已形成，可继续补充新变化。"
                  : profile?.missing_fields?.length
                    ? `还需补充：${profile.missing_fields.slice(0, 2).join("、")}`
                    : "继续对话，画像会根据新信息实时补全。"}
              </p>
            </div>

            <div className="profile-facts-grid">
              <ProfileFact icon={Target} label="当前目标" value={primaryGoal} tone="blue" />
              <ProfileFact icon={GraduationCap} label="背景经历" value={background} tone="blue" compact />
              <ProfileFact icon={Sparkles} label="学习偏好" value={preferenceLabels.join("、") || "等待补充"} tone="gold" compact />
              <ProfileFact icon={AlertTriangle} label="优先关注" value={focusTopics.slice(0, 2).join("、") || "等待补充"} tone="red" compact />
              <ProfileFact
                icon={Clock3}
                label="学习节奏"
                value={hoursPerWeek ? `每周 ${hoursPerWeek} 小时${profile?.dims.pace.intensity ? ` · ${formatPaceIntensity(profile.dims.pace.intensity)}` : ""}` : "等待补充"}
                tone="gold"
                compact
              />
            </div>

            {lastReasoning && (
              <section className="profile-update-reason">
                <div><ShieldCheck />本轮画像更新依据</div>
                <p>{lastReasoning}</p>
              </section>
            )}

            {profileNotice && (
              <section role={profileNotice.tone === "error" ? "alert" : "status"} className={`profile-notice profile-notice--${profileNotice.tone}`}>
                <AlertTriangle />{profileNotice.message}
              </section>
            )}
          </section>

          <section className="profile-chat-card">
            <header className="profile-chat-header">
              <div className="profile-chat-title">
                <span className="profile-assistant-avatar"><img src="/images/profile-assistant-device-v1.png" alt="" /></span>
                <div>
                  <h2>画像采集对话</h2>
                  <p>{status === "open" ? "正在分析并更新画像" : "继续补充目标、经历和学习安排"}</p>
                </div>
              </div>
              <div className="profile-chat-tools">
                <VoiceSelector compact />
                <span className="profile-version"><ShieldCheck />v{profile?.version ?? "—"}</span>
                <button type="button" onClick={handleReset} className="profile-reset-button" title="重置画像" aria-label="重置画像">
                  <RotateCw /><span>重置</span>
                </button>
              </div>
            </header>

            <div ref={scrollRef} onScroll={handleScroll} className="profile-message-scroll">
              <div className={`profile-message-stack ${isFreshConversation ? "is-fresh" : ""}`}>
                {isFreshConversation ? (
                  <div className="profile-chat-welcome">
                    <h3>说说你的目标和经历</h3>
                    <p>选择一个快捷回答，或直接输入你的真实情况。</p>
                    <div className="profile-quick-grid">
                      {quickPrompts.map((prompt, index) => (
                        <button key={prompt} type="button" onClick={() => setInput(prompt)} className="profile-quick-prompt">
                          <span>0{index + 1}</span>{prompt}
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

            <form onSubmit={handleSubmit} className="profile-chat-composer">
              <div className="profile-composer-box">
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1 pb-2">
                    {pendingImages.map((src, index) => (
                      <div key={index} className="relative">
                        <img src={src} alt={`待发送图片 ${index + 1}`} className="size-14 rounded-xl border border-[#bcd8e6] object-cover" />
                        <button type="button" onClick={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#173e59] text-white" aria-label="移除图片"><X className="size-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {imgHint && <div className="px-2 pb-1 text-[11px] font-semibold text-[#8E6925]">{imgHint}</div>}
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
                  />
                </label>
                <div className="profile-composer-actions">
                  <div>
                    <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => handlePickFiles(event.target.files)} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={status === "open" || pendingImages.length >= MAX_IMAGES || imgBusy} title="上传图片或成绩单截图" aria-label="上传图片">
                      {imgBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                    </button>
                    <MicButton size="sm" onTranscript={(text) => setInput(text)} onError={(error) => console.error("ASR 失败：", error)} />
                    <button type="button" onClick={() => navigate("/tutor/voice")} title="进入实时语音对话" aria-label="进入实时语音对话"><Headphones /></button>
                  </div>
                  <button type="submit" disabled={status === "open" || (!input.trim() && pendingImages.length === 0)} className="profile-send-button" aria-label="发送画像对话">
                    {status === "open" ? <Loader2 className="animate-spin" /> : <Send />}
                  </button>
                </div>
              </div>
              <div className="profile-composer-hint">
                <span><Paperclip />最多 {MAX_IMAGES} 张图片</span>
                <span>Enter 发送 · Shift+Enter 换行</span>
              </div>
            </form>
          </section>

          <aside className="profile-secondary-panel">
            <form onSubmit={saveIdentity} className="profile-identity-card">
              <div className="profile-secondary-heading">
                <div><span>基础资料</span><h2>编辑已识别事实</h2></div>
                <UserRound />
              </div>
              <div className="profile-identity-summary">
                <span><UserRound />{identity.name || user?.name || "学习者"}</span>
                <span>{identity.learner_type === "student" ? <GraduationCap /> : <BriefcaseBusiness />}{identity.learner_type === "student" ? "学生" : "从业者"}</span>
              </div>
              {identity.learner_type === "student" ? (
                <label>
                  <span>学习阶段</span>
                  <span className="profile-field">
                    <GraduationCap />
                    <select value={identity.study_stage} onChange={(event) => setIdentity((current) => ({ ...current, study_stage: event.target.value }))}>
                      <option value="">暂不填写</option>
                      <option value="本科">本科</option>
                      <option value="研究生">研究生</option>
                      <option value="博士">博士</option>
                    </select>
                    <ChevronDown />
                  </span>
                </label>
              ) : (
                <label>
                  <span>在职公司</span>
                  <span className="profile-field"><BriefcaseBusiness /><input value={identity.company} onChange={(event) => setIdentity((current) => ({ ...current, company: event.target.value }))} placeholder="例如：星河科技" /></span>
                </label>
              )}
              <div className="profile-identity-save">
                <span role={identityNotice.includes("失败") || identityNotice.includes("无法") ? "alert" : "status"} className={identityNotice.includes("失败") || identityNotice.includes("无法") ? "is-error" : ""}>{identityNotice}</span>
                <button type="submit" disabled={identitySaving}>{identitySaving ? <Loader2 className="animate-spin" /> : <Save />}保存资料</button>
              </div>
            </form>
          </aside>

          {hasProfileContent && (
            <section className="profile-next-card">
              <div>
                <span>下一步</span>
                <h3>{profile?.intake_complete ? "画像已完成，可开始训练" : "已有画像基础，可先查看训练"}</h3>
              </div>
              <Link to={course || targetRole ? "/competency" : "/courses?returnTo=%2Fprofile"}>
                {course || targetRole ? "进入训练中心" : "选择目标岗位"}<ArrowRight />
              </Link>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

const profileKeyLabels: Record<string, string> = {
  document: "文档",
  mindmap: "思维导图",
  quiz: "小测",
  code: "代码实操",
  video: "视频",
  reading: "阅读",
  practice_first: "实践优先",
  theory_first: "理论优先",
  step_by_step: "循序渐进",
  challenge: "挑战导向",
}

function formatProfileKey(key: string) {
  return profileKeyLabels[key] || key.replaceAll("_", " ")
}

const paceIntensityLabels: Record<string, string> = {
  fast: "高强度",
  medium: "适中",
  slow: "稳步",
}

function formatPaceIntensity(value: string) {
  return paceIntensityLabels[value] || value
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
    <div className={`profile-fact-card ${compact ? "is-compact" : ""}`}>
      <span className={toneMap[tone]}><Icon /></span>
      <div className="min-w-0">
        <span className="profile-fact-label">{label}</span>
        <p>{value}</p>
        {detail && <span className="profile-fact-detail">{detail}</span>}
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
