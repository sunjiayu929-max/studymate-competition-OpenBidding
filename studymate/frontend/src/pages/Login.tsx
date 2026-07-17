import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { apiPost } from "@/lib/api"
import { setCurrentUser, useCurrentUser, type CurrentUser } from "@/store/user"

type Mode = "login" | "register"
interface AuthResponse extends CurrentUser { created: boolean }
interface LocationState { from?: { pathname?: string } }

const ORBIT_PATHS = [
  "M320 122 m -140 0 a 140 98 0 1 0 280 0 a 140 98 0 1 0 -280 0",
  "M320 122 m -232 0 a 232 112 0 1 0 464 0 a 232 112 0 1 0 -464 0",
]

const ORBIT_PLANETS = [
  { label: "学习画像", color: "#355C8A", radius: 10, orbit: 0, duration: 20, begin: "0s", staticPosition: [180, 122] },
  { label: "AI 助教", color: "#B85C3E", radius: 13, orbit: 0, duration: 20, begin: "-10s", staticPosition: [460, 122] },
  { label: "课程空间", color: "#C49A3A", radius: 11, orbit: 1, duration: 32, begin: "0s", staticPosition: [88, 122] },
  { label: "智能笔记", color: "#6F8A69", radius: 9, orbit: 1, duration: 32, begin: "-8s", staticPosition: [320, 10] },
  { label: "智能测验", color: "#3E7774", radius: 12, orbit: 1, duration: 32, begin: "-16s", staticPosition: [552, 122] },
  { label: "学习路径", color: "#7E6B83", radius: 14, orbit: 1, duration: 32, begin: "-24s", staticPosition: [320, 234] },
] as const

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = useCurrentUser()
  const reduceMotion = useReducedMotion()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const from = (location.state as LocationState | null)?.from?.pathname || "/"

  useEffect(() => {
    if (currentUser) navigate(from, { replace: true })
  }, [currentUser, from, navigate])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const sendCode = async () => {
    if (!email.trim()) return setError("请先输入邮箱地址")
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await apiPost<{ resend_after: number }>("/auth/register/send-code", { email: email.trim() })
      setCountdown(result.resend_after || 60)
      setNotice("验证码已发送，请检查收件箱或垃圾邮件")
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSending(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = mode === "login"
        ? await apiPost<AuthResponse>("/auth/login", { email: email.trim(), password })
        : await apiPost<AuthResponse>("/auth/register", {
            email: email.trim(), password, name: name.trim(), code: code.trim(),
          })
      setCurrentUser({ user_id: result.user_id, name: result.name, email: result.email, role: result.role })
      navigate(from, { replace: true })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#F3F0E7] text-[#18232D]">
      <PaperBackdrop />

      <header className="relative z-20 mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 sm:h-[84px] sm:px-7 lg:px-9 xl:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[13px] bg-[#244C66] text-[#F0D6A4] shadow-[0_8px_18px_rgba(24,35,45,.13)] sm:size-11">
            <Sparkles className="size-5" strokeWidth={1.8} />
          </span>
          <div>
            <div className="text-[17px] font-extrabold tracking-[-0.04em] sm:text-lg">StudyMate</div>
            <div className="hidden text-[9px] font-bold tracking-[0.14em] text-[#777E7B] uppercase sm:block">Intelligent Learning Studio</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#D7D1C4] bg-[#FFFEFA] px-3.5 py-2 text-[11px] font-semibold text-[#59645F] shadow-[0_6px_18px_rgba(24,35,45,.06)] sm:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#718B6A] opacity-35" />
            <span className="relative inline-flex size-2 rounded-full bg-[#718B6A]" />
          </span>
          7 个智能体在线
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1600px] px-3 pb-3 sm:px-5 sm:pb-5 lg:px-8 lg:pb-8">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          className="relative isolate grid overflow-hidden rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] shadow-[0_24px_70px_rgba(24,35,45,.10)] sm:rounded-[30px] lg:min-h-[calc(100dvh-116px)] lg:grid-cols-[52%_48%] xl:grid-cols-2"
        >
          <div className="pointer-events-none absolute inset-0 bg-[#F8F6F0]" aria-hidden />
          <div className="pointer-events-none absolute bottom-0 left-0 h-[48%] w-[61%] bg-[#E7EDE5] opacity-80" style={{ clipPath: "polygon(0 28%, 100% 0, 88% 100%, 0 100%)" }} aria-hidden />
          <div className="pointer-events-none absolute right-0 top-0 h-[46%] w-[47%] bg-[#E8ECEE] opacity-65" style={{ clipPath: "polygon(18% 0, 100% 0, 100% 100%, 0 72%)" }} aria-hidden />

          <section className="relative z-10 flex min-w-0 items-center px-5 pb-4 pt-7 sm:px-9 sm:pb-8 sm:pt-12 lg:px-11 lg:py-12 xl:px-14 2xl:px-16">
            <div className="w-full max-w-[700px] lg:-translate-y-8 xl:-translate-y-12">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D5CCBC] bg-[#FFFEFA] px-3 py-2 text-[10px] font-bold tracking-[0.035em] text-[#395C74] shadow-[0_5px_15px_rgba(24,35,45,.05)] sm:mb-5 sm:px-3.5 sm:text-[11px]"
              >
                <span className="size-1.5 rounded-full bg-[#B85F4B]" />
                为每个目标组织一支 AI 学习团队
              </motion.div>

              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.62, delay: 0.12 }}
                className="text-[32px] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#18232D] sm:text-[40px] lg:text-[clamp(42px,3.15vw,56px)]"
              >
                <span className="block">让学习路径清晰可见</span>
                <span className="mt-1 block text-[#315E83]">让每一步都有回应</span>
              </motion.h1>

              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18 }}
                className="mt-5 hidden max-w-[620px] text-[15px] leading-7 text-[#66717B] lg:block xl:text-base"
              >
                StudyMate 让学习画像、AI 助教与成长路径围绕你协同工作，把分散的课程、笔记和练习连接起来。
              </motion.p>

              <OrbitalLearningSystem reduced={Boolean(reduceMotion)} />
            </div>
          </section>

          <section className="relative z-20 flex items-center px-5 py-5 sm:px-9 sm:py-10 lg:px-10 lg:py-10 xl:px-12">
            <div className="relative mx-auto w-full max-w-[460px] lg:rounded-[20px] lg:border lg:border-[#D7D1C4] lg:bg-[#FFFEFA] lg:p-8 lg:shadow-[0_18px_48px_rgba(24,35,45,.11)]">
              <div className="mb-5 sm:mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-[10px] font-extrabold tracking-[0.08em] text-[#315E83]">
                    <span className="size-1.5 rounded-full bg-[#718B6A]" />
                    安全邮箱登录
                  </span>
                  <span className="grid size-8 place-items-center rounded-lg border border-[#DED8CC] bg-[#F1EDE4] text-[#315E83]"><Sparkles className="size-4" /></span>
                </div>
                <h2 className="text-[27px] font-extrabold tracking-[-0.045em] text-[#18232D] sm:text-[30px]">{mode === "login" ? "继续你的学习旅程" : "创建你的学习星图"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#66717B]">{mode === "login" ? "使用邮箱和密码进入 StudyMate" : "验证邮箱后，即可建立专属学习画像"}</p>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-xl border border-[#DED8CC] bg-[#ECE8DE] p-1" role="tablist" aria-label="登录或注册">
                {(["login", "register"] as Mode[]).map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => switchMode(item)} className={`relative h-10 rounded-[9px] text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5D4D9] ${mode === item ? "text-[#244C66]" : "text-[#727A78] hover:text-[#3D4B50]"}`}>
                    {mode === item && <motion.span layoutId="light-auth-tab" className="absolute inset-0 rounded-[9px] border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_3px_10px_rgba(24,35,45,.07)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <span className="relative z-10">{item === "login" ? "登录" : "注册"}</span>
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="space-y-3.5" aria-busy={loading}>
                <AnimatePresence initial={false} mode="popLayout">
                  {mode === "register" && (
                    <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <Field label="昵称" icon={<UserRound />} value={name} onChange={setName} placeholder="如何称呼你" autoComplete="name" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Field label="邮箱地址" icon={<Mail />} value={email} onChange={setEmail} placeholder="例如 name@example.com" type="email" autoComplete="email" />

                <AnimatePresence initial={false} mode="popLayout">
                  {mode === "register" && (
                    <motion.div key="code" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
                      <Field label="邮箱验证码" icon={<ShieldCheck />} value={code} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位验证码" inputMode="numeric" />
                      <Button type="button" variant="outline" disabled={sending || countdown > 0} onClick={sendCode} className="h-[50px] min-w-[108px] rounded-xl border-[#D7D1C4] bg-[#FFFEFA] px-3 text-xs text-[#415966] shadow-none hover:bg-[#F0ECE3]">
                        {sending ? <Loader2 className="animate-spin" /> : countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Field
                  label="密码"
                  icon={<KeyRound />}
                  value={password}
                  onChange={setPassword}
                  placeholder={mode === "register" ? "至少 8 位字符" : "输入你的密码"}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  action={
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-8 place-items-center rounded-lg text-[#8A918F] hover:bg-[#EFEAE0] hover:text-[#43545B]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />

                <AnimatePresence mode="popLayout">
                  {notice && <motion.div role="status" aria-live="polite" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-2.5 text-xs leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />{notice}</motion.div>}
                  {error && <motion.div role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2.5 text-xs leading-5 text-rose-700"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{error}</motion.div>}
                </AnimatePresence>

                <Button type="submit" size="lg" disabled={loading} className="group relative mt-1 w-full overflow-hidden border-0 bg-[#244C66] text-[#FFFEFA] shadow-[0_10px_22px_rgba(36,76,102,.20)] hover:bg-[#193B50]">
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : <>{mode === "login" ? "进入 StudyMate" : "验证并创建账号"}<ArrowRight /></>}
                  </span>
                </Button>
              </form>

              <div className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] leading-5 text-[#8A918F]">
                <ShieldCheck className="size-3.5" /> 安全邮箱验证 · 认证信息加密保护
              </div>
            </div>
          </section>
        </motion.div>
      </div>
    </main>
  )
}

function PaperBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#F3F0E7]" />
      <div className="absolute -left-[8vw] -top-[18vh] h-[48vh] w-[46vw] rotate-[-7deg] bg-[#E9E3D7] opacity-75" />
      <div className="absolute -bottom-[18vh] -right-[8vw] h-[52vh] w-[52vw] rotate-[8deg] bg-[#DEE6E2] opacity-70" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(rgba(24,35,45,.16) .55px, transparent .55px)", backgroundSize: "7px 7px" }} />
      <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(24,35,45,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(24,35,45,.035) 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(circle at 45% 48%, black, transparent 76%)" }} />
    </div>
  )
}

function OrbitalLearningSystem({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .65, delay: .24 }}
      className="relative mt-3 h-[136px] w-full max-w-[660px] sm:mt-5 sm:h-[205px] xl:mt-6 xl:h-[270px]"
    >
      <svg viewBox="0 0 640 250" className="absolute inset-x-0 top-0 h-[108px] w-full overflow-visible sm:h-[170px] xl:h-[230px]" role="img" aria-label="学习者位于中心，六个生成智能体沿轨道协同运行，RAG 检索智能体提供知识依据">
        <defs>
          <radialGradient id="paper-core" cx="30%" cy="24%">
            <stop offset="0%" stopColor="#F3D79D" />
            <stop offset="18%" stopColor="#5D7891" />
            <stop offset="66%" stopColor="#315873" />
            <stop offset="100%" stopColor="#1E3C50" />
          </radialGradient>
          <clipPath id="paper-core-clip">
            <circle cx="320" cy="122" r="69" />
          </clipPath>
          <filter id="paper-planet-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#18232D" floodOpacity=".16" />
          </filter>
        </defs>

        {ORBIT_PATHS.map((path, index) => (
          <path key={path} d={path} fill="none" stroke={index === 2 ? "#A8B3AE" : "#B8C1BC"} strokeWidth={index === 2 ? 1.15 : .9} strokeOpacity={index === 0 ? .72 : .58} strokeDasharray={index === 1 ? "3 7" : undefined} />
        ))}

        {ORBIT_PLANETS.map((planet) => {
          const [staticX, staticY] = planet.staticPosition
          return (
            <g key={planet.label} transform={reduced ? `translate(${staticX} ${staticY})` : undefined} filter="url(#paper-planet-shadow)">
              <circle r={planet.radius + 3} fill="#FFFEFA" stroke="#D7D1C4" strokeWidth="1" />
              <circle r={planet.radius} fill={planet.color} />
              <path d={`M-${planet.radius * .65} -${planet.radius * .12} Q0 ${planet.radius * .38} ${planet.radius * .7} -${planet.radius * .18}`} fill="none" stroke="#FFFEFA" strokeOpacity=".45" strokeWidth="1" />
              {!reduced && <animateMotion dur={`${planet.duration}s`} begin={planet.begin} repeatCount="indefinite" path={ORBIT_PATHS[planet.orbit]} />}
            </g>
          )
        })}

        <circle cx="320" cy="122" r="78" fill="#F8F6F0" stroke="#C9C2B5" strokeWidth="1" />
        <circle cx="320" cy="122" r="69" fill="url(#paper-core)" filter="url(#paper-planet-shadow)" />
        <motion.g
          clipPath="url(#paper-core-clip)"
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "320px 122px" }}
        >
          <ellipse cx="320" cy="122" rx="53" ry="68" fill="none" stroke="#F3E4C5" strokeOpacity=".28" strokeWidth="1" />
          <ellipse cx="320" cy="122" rx="27" ry="68" fill="none" stroke="#F3E4C5" strokeOpacity=".24" strokeWidth="1" />
          <path d="M251 108 C278 96 299 105 320 99 C343 92 364 96 389 111" fill="none" stroke="#F3E4C5" strokeOpacity=".38" strokeWidth="1.4" />
          <path d="M252 139 C278 151 300 141 322 147 C348 153 367 144 388 134" fill="none" stroke="#F3E4C5" strokeOpacity=".32" strokeWidth="1.2" />
          <path d="M286 79 C299 88 304 101 296 113 C289 124 297 135 310 137 C324 139 327 151 321 170" fill="none" stroke="#E5C17A" strokeOpacity=".5" strokeWidth="6" strokeLinecap="round" />
          <path d="M353 79 C343 92 346 103 358 111 C368 118 365 132 352 139 C341 145 345 158 356 166" fill="none" stroke="#E5C17A" strokeOpacity=".42" strokeWidth="5" strokeLinecap="round" />
        </motion.g>
        <circle cx="320" cy="122" r="69" fill="none" stroke="#193B50" strokeOpacity=".55" strokeWidth="1.2" />
        <text x="320" y="118" textAnchor="middle" fill="#FFFEFA" fontSize="13" fontWeight="800" letterSpacing="1">学习者</text>
        <text x="320" y="137" textAnchor="middle" fill="#F3E4C5" fontSize="8" fontWeight="700" letterSpacing="1.8">STUDYMATE</text>
      </svg>

      <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 gap-x-3 gap-y-1.5 px-1 sm:grid-cols-6 sm:gap-2 xl:border-t xl:border-[#BFC7C1] xl:px-3 xl:pt-2">
        {ORBIT_PLANETS.map((planet) => (
          <div key={planet.label} className="flex items-center justify-center gap-1.5 text-[8px] font-extrabold tracking-[0.01em] text-[#43525A] sm:text-[9px] xl:text-[11px] 2xl:text-[12px]">
            <span className="size-1.5 shrink-0 rounded-full xl:size-2 2xl:size-2.5" style={{ backgroundColor: planet.color }} />
            <span className="whitespace-nowrap">{planet.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function Field({ label, icon, value, onChange, action, ...props }: {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  action?: React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-[#394950]">{label}</span>
      <span className="group relative flex h-[50px] items-center rounded-xl border border-[#D7D1C4] bg-white transition-[border-color,box-shadow,background] focus-within:border-[#244C66] focus-within:shadow-[0_0_0_3px_rgba(197,212,217,.7)]">
        <span className="ml-3.5 grid size-5 shrink-0 place-items-center text-[#8A918F] transition-colors group-focus-within:text-[#244C66] [&_svg]:size-[16px]">{icon}</span>
        <input {...props} required value={value} onChange={(event) => onChange(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-[#24323A] outline-none placeholder:text-[#9A9F9C]" />
        {action && <span className="mr-2">{action}</span>}
      </span>
    </label>
  )
}
