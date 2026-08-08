import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Database,
  Gauge,
  Library,
  MessageCircleMore,
  Minimize2,
  Orbit,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  X,
} from "lucide-react"

import { apiGet } from "@/lib/api"
import { courseStore, setCurrentCourse, type CourseInfo } from "@/store/course"
import { useCurrentUser } from "@/store/user"

export const JUDGE_DEMO_EVENT = "studymate:judge-demo-open"
const SESSION_KEY = "sm:judge-demo:v1"

interface DemoSession {
  active: true
  step: number
  originalPath: string
  originalCourse: CourseInfo | null
  demoCourse: CourseInfo
  startedAt: number
}

interface ModelStatus {
  items: Array<{ id: string; label: string; configured: boolean }>
}

interface VoiceStatus {
  asr_configured: boolean
  tts_configured: boolean
  permission_policy: string
}

const STEPS = [
  {
    path: "/",
    label: "学习宇宙",
    title: "第一眼看到完整学习闭环",
    detail: "从中央学习核心和真实数据节点进入暖白学习桌面。一次性镜头和低频宇宙动态不会覆盖按钮。",
    action: "点击“进入今日学习”，再观察首页路线。",
    time: "25 秒",
    icon: Orbit,
  },
  {
    path: "/courses",
    label: "机器学习课程",
    title: "确认课程级上下文",
    detail: "演示临时选择《机器学习》。课程、画像、检索、助教和报告共享同一上下文；退出演示会恢复原课程。",
    action: "确认目标岗位卡片已被选中。",
    time: "20 秒",
    icon: Library,
  },
  {
    path: "/rag",
    label: "课程 RAG 来源",
    title: "核对回答依据可以追溯",
    detail: "搜索“梯度下降”，查看相对匹配度、教材来源、页码和原文上下文；百分比不是正确概率。",
    action: "搜索“梯度下降”并打开一条原文。",
    time: "35 秒",
    icon: Database,
  },
  {
    path: "/knowledge",
    label: "私有知识来源",
    title: "查看私库任务与真实降级",
    detail: "资料解析、向量化、OCR 未配置、失败重试与来源页码都有明确状态。演示导航不会上传或修改资料。",
    action: "查看已有资料状态或切换到库内检索。",
    time: "30 秒",
    icon: ShieldCheck,
  },
  {
    path: "/workspace",
    label: "学习资源工坊",
    title: "观察 7 Agents 共享依据",
    detail: "检索先行，讲解、导图、测验、阅读、代码、路径和可视讲解按同一主题协作生成。",
    action: "使用已有成果，避免演示时触发外部付费模型。",
    time: "40 秒",
    icon: Sparkles,
  },
  {
    path: "/concept",
    label: "AI 可视讲解",
    title: "验证真实时间轴",
    detail: "选择梯度下降，演示播放/暂停、seek、逐句高亮和 1.25× 倍速；无 TTS 时仍完整显示文字。",
    action: "播放后拖动时间轴并切换一次倍速。",
    time: "40 秒",
    icon: Clapperboard,
  },
  {
    path: "/tutor/voice",
    label: "AI 助教与语音",
    title: "明确展示服务降级",
    detail: "页面不会自动申请麦克风。外部模型、ASR 或 TTS 未配置时显示“演示降级”，可切换文字模式继续阅读。",
    action: "先看配置状态；不要在评委设备点击麦克风授权。",
    time: "35 秒",
    icon: MessageCircleMore,
  },
  {
    path: "/report",
    label: "实时学习报告",
    title: "以真实证据收束演示",
    detail: "报告进入即展示画像、测验、资源和学习事件，并把建议与下一步路线连接起来。",
    action: "查看趋势、热力图与画像版本，再退出演示。",
    time: "35 秒",
    icon: Gauge,
  },
] as const

function readSession(): DemoSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as DemoSession | null
    return value?.active && value.demoCourse ? value : null
  } catch {
    return null
  }
}

function writeSession(value: DemoSession | null) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // The route still works without persistence.
  }
}

export function JudgeDemoMode() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [session, setSession] = useState<DemoSession | null>(readSession)
  const [minimized, setMinimized] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)

  const current = STEPS[Math.min(session?.step ?? 0, STEPS.length - 1)]
  const CurrentIcon = current.icon
  const onCurrentPage = location.pathname === current.path

  const refreshStatuses = useCallback(async () => {
    setStatusFailed(false)
    const [models, voice] = await Promise.allSettled([
      apiGet<ModelStatus>("/tutor/models"),
      apiGet<VoiceStatus>("/voice/status"),
    ])
    if (models.status === "fulfilled") setModelStatus(models.value)
    else setStatusFailed(true)
    if (voice.status === "fulfilled") setVoiceStatus(voice.value)
    else setStatusFailed(true)
  }, [])

  useEffect(() => {
    if (!user) return
    const open = () => {
      setError("")
      setWelcomeOpen(true)
    }
    window.addEventListener(JUDGE_DEMO_EVENT, open)
    return () => window.removeEventListener(JUDGE_DEMO_EVENT, open)
  }, [user])

  useEffect(() => {
    if (!session) return
    setCurrentCourse(session.demoCourse)
    void refreshStatuses()
  }, [refreshStatuses, session])

  const start = async () => {
    if (!user || starting) return
    setStarting(true)
    setError("")
    try {
      const courses = await apiGet<{ items: CourseInfo[] }>("/courses")
      const machineLearning = courses.items.find((course) => course.name === "机器学习")
      if (!machineLearning) throw new Error("未找到机器学习课程，无法启动真实演示路线")
      const next: DemoSession = {
        active: true,
        step: 0,
        originalPath: location.pathname + location.search,
        originalCourse: courseStore.get(),
        demoCourse: machineLearning,
        startedAt: Date.now(),
      }
      writeSession(next)
      setCurrentCourse(machineLearning)
      setSession(next)
      setWelcomeOpen(false)
      setMinimized(false)
      navigate(STEPS[0].path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "演示模式启动失败")
    } finally {
      setStarting(false)
    }
  }

  const moveTo = (step: number) => {
    if (!session) return
    const bounded = Math.max(0, Math.min(STEPS.length - 1, step))
    const next = { ...session, step: bounded }
    writeSession(next)
    setSession(next)
    navigate(STEPS[bounded].path)
  }

  const reset = () => {
    if (!session) return
    setCurrentCourse(session.demoCourse)
    setMinimized(false)
    moveTo(0)
  }

  const exit = () => {
    if (!session) return
    const { originalCourse, originalPath } = session
    writeSession(null)
    setSession(null)
    setMinimized(false)
    setCurrentCourse(originalCourse)
    navigate(originalPath || "/", { replace: true })
  }

  const modelReady = useMemo(
    () => Boolean(modelStatus?.items.some((item) => item.configured)),
    [modelStatus],
  )
  const voiceReady = Boolean(voiceStatus?.asr_configured && voiceStatus.tts_configured)

  if (!user) return null

  return (
    <>
      <AnimatePresence>
        {welcomeOpen && !session && (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-[#18232D]/30 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="judge-demo-title"
              className="w-full max-w-[520px] rounded-[28px] border border-[#D7D1C4] bg-[#FFFEFA] p-6 shadow-[0_30px_90px_rgba(24,35,45,.28)] sm:p-7"
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#244C66] text-[#F0D6A4]"><Play className="size-5" /></span>
                <button type="button" onClick={() => setWelcomeOpen(false)} className="grid size-9 place-items-center rounded-xl text-[#66717B] hover:bg-[#ECE8DE]" aria-label="关闭评委演示入口"><X className="size-4" /></button>
              </div>
              <p className="mt-5 text-[10px] font-bold tracking-[.14em] text-[#8E6925]">独立评委演示 · 3–5 分钟</p>
              <h2 id="judge-demo-title" className="mt-1 text-2xl font-bold tracking-[-.035em] text-[#18232D]">沿真实功能完成一次学习闭环</h2>
              <p className="mt-3 text-xs leading-6 text-[#66717B]">演示导航临时选择《机器学习》，不创建预置结果、不上传资料，也不调用付费模型或语音服务。退出后自动恢复你进入前的课程和页面。</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {["真实数据与来源", "未配置明确降级", "随时退出并恢复"].map((label) => <span key={label} className="rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2 text-center text-[10px] font-bold text-[#59636B]">{label}</span>)}
              </div>
              {error && <p role="alert" className="mt-4 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2 text-[11px] text-[#9A4E35]">{error}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setWelcomeOpen(false)} className="h-10 rounded-xl border border-[#D7D1C4] px-4 text-xs font-bold text-[#59636B] hover:bg-[#F1EDE4]">暂不演示</button>
                <button type="button" disabled={starting} onClick={() => void start()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white hover:bg-[#193B50] disabled:opacity-50">{starting ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{starting ? "读取真实课程…" : "开始演示"}</button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {session && (
          minimized ? (
            <motion.button
              key="judge-demo-minimized"
              type="button"
              onClick={() => setMinimized(false)}
              className="fixed right-4 top-4 z-[88] inline-flex h-11 items-center gap-2 rounded-full border border-[#D9CFB7] bg-[#FFFEFA] px-4 text-[11px] font-bold text-[#244C66] shadow-[0_14px_36px_rgba(24,35,45,.16)]"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <Sparkles className="size-4 text-[#B1842C]" />评委演示 {session.step + 1}/{STEPS.length}
            </motion.button>
          ) : (
            <motion.aside
              key="judge-demo-panel"
              className="fixed right-3 top-3 z-[88] w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.22)]"
              initial={reduceMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              aria-label="评委演示路线"
            >
              <header className="flex items-center gap-2 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3">
                <span className="grid size-8 place-items-center rounded-xl bg-[#244C66] text-[#F0D6A4]"><Sparkles className="size-3.5" /></span>
                <div className="min-w-0 flex-1"><strong className="block text-xs text-[#18232D]">独立评委演示</strong><small className="text-[9px] text-[#7A817F]">导航状态隔离 · 退出自动恢复</small></div>
                <button type="button" onClick={() => setMinimized(true)} className="grid size-8 place-items-center rounded-lg text-[#66717B] hover:bg-[#ECE8DE]" aria-label="收起评委演示"><Minimize2 className="size-3.5" /></button>
                <button type="button" onClick={exit} className="grid size-8 place-items-center rounded-lg text-[#9A4E35] hover:bg-[#F4E8E2]" aria-label="退出评委演示"><X className="size-3.5" /></button>
              </header>
              <div className="h-1 bg-[#ECE8DE]"><motion.div className="h-full bg-[#B1842C]" animate={{ width: `${((session.step + 1) / STEPS.length) * 100}%` }} /></div>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#E7EDF3] text-[#315E83]"><CurrentIcon className="size-4.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold tracking-[.1em] text-[#8E6925]">{current.label}</span><span className="text-[9px] text-[#8A8172]">{current.time}</span></div>
                    <h3 className="mt-1 text-sm font-bold text-[#18232D]">{current.title}</h3>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#66717B]">{current.detail}</p>
                <div className="mt-3 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2.5 text-[10px] leading-4 text-[#59636B]"><strong className="text-[#18232D]">现场动作：</strong>{current.action}</div>

                {session.step === 6 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ServiceState icon={MessageCircleMore} label="回答模型" ready={modelReady} unknown={!modelStatus || statusFailed} />
                    <ServiceState icon={Volume2} label="ASR / TTS" ready={voiceReady} unknown={!voiceStatus || statusFailed} />
                  </div>
                )}

                {!onCurrentPage && (
                  <button type="button" onClick={() => navigate(current.path)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] px-3 py-2 text-[10px] font-bold text-[#315E83]"><RotateCcw className="size-3" />回到本步页面</button>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button type="button" onClick={reset} className="grid size-9 place-items-center rounded-xl border border-[#D7D1C4] text-[#66717B] hover:bg-[#ECE8DE]" title="复位演示" aria-label="复位演示"><RefreshCw className="size-3.5" /></button>
                  <button type="button" disabled={session.step === 0} onClick={() => moveTo(session.step - 1)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#D7D1C4] px-3 text-[10px] font-bold text-[#59636B] hover:bg-[#F1EDE4] disabled:opacity-35"><ArrowLeft className="size-3" />上一步</button>
                  {session.step < STEPS.length - 1 ? (
                    <button type="button" onClick={() => moveTo(session.step + 1)} className="ml-auto inline-flex h-9 items-center gap-1 rounded-xl bg-[#244C66] px-4 text-[10px] font-bold text-white hover:bg-[#193B50]">下一站<ArrowRight className="size-3" /></button>
                  ) : (
                    <button type="button" onClick={exit} className="ml-auto inline-flex h-9 items-center gap-1 rounded-xl bg-[#557052] px-4 text-[10px] font-bold text-white hover:bg-[#425B40]"><CheckCircle2 className="size-3" />完成并恢复</button>
                  )}
                </div>
              </div>
            </motion.aside>
          )
        )}
      </AnimatePresence>
    </>
  )
}

function ServiceState({
  icon: Icon,
  label,
  ready,
  unknown,
}: {
  icon: typeof MessageCircleMore
  label: string
  ready: boolean
  unknown: boolean
}) {
  const state = unknown ? "状态未知" : ready ? "已配置（本演示不调用）" : "演示降级"
  return (
    <div className={`rounded-xl border px-3 py-2 ${unknown ? "border-[#D7D1C4] bg-[#F8F6F0]" : ready ? "border-[#C9D1CB] bg-[#E9EEE6]" : "border-[#DFC8BE] bg-[#F4E8E2]"}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#59636B]"><Icon className="size-3" />{label}</div>
      <strong className={`mt-1 block text-[9px] ${unknown ? "text-[#7A817F]" : ready ? "text-[#557052]" : "text-[#9A4E35]"}`}>{state}</strong>
    </div>
  )
}
