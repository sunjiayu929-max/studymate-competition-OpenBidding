import { useEffect, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
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

import "./Login.css"

type Mode = "login" | "register"
interface AuthResponse extends CurrentUser { created: boolean }
interface LocationState { from?: { pathname?: string; search?: string; hash?: string } }

function safeReturnTo(value: string | null): string | null {
  if (!value || value.startsWith("//") || !value.startsWith("/api/oj/entry")) return null
  return value
}

function landingPath(user: Pick<CurrentUser, "role">, requestedPath: string): string {
  if (user.role === "admin") return "/admin"
  if (user.role === "enterprise_admin") return "/enterprise/dashboard"
  if (requestedPath === "/admin" || requestedPath === "/enterprise/dashboard") return "/"
  return requestedPath
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const currentUser = useCurrentUser()
  const reduceMotion = useReducedMotion()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState("")
  const [accountType, setAccountType] = useState<"learner" | "enterprise_admin">("learner")
  const [learnerType, setLearnerType] = useState<"student" | "worker">("student")
  const [studyStage, setStudyStage] = useState("")
  const [company, setCompany] = useState("")
  const [targetRole, setTargetRole] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const stateFrom = (location.state as LocationState | null)?.from
  const statePath = stateFrom
    ? `${stateFrom.pathname || "/"}${stateFrom.search || ""}${stateFrom.hash || ""}`
    : null
  const from = safeReturnTo(searchParams.get("return_to")) || statePath || "/"

  useEffect(() => {
    if (currentUser) navigate(landingPath(currentUser, from), { replace: true })
  }, [currentUser, from, navigate])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const switchMode = (next: Mode) => {
    setMode(next)
    if (next === "login") setAccountType("learner")
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
            account_type: accountType,
            learner_type: learnerType,
            study_stage: studyStage.trim(),
            company: company.trim(),
            target_role: targetRole.trim(),
          })
      setCurrentUser({
        user_id: result.user_id,
        name: result.name,
        email: result.email,
        role: result.role,
        learner_type: result.learner_type,
        study_stage: result.study_stage,
        company: result.company,
        target_role: result.target_role,
      })
      navigate(landingPath(result, from), { replace: true })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <LoginBackdrop />

      <header className="login-topbar">
        <div className="login-brand" aria-label="因材智训">
          <span className="login-brand-mark"><Sparkles strokeWidth={1.8} /></span>
          <span className="login-brand-copy">
            <strong>因材智训</strong>
            <small>INTELLIGENT LEARNING STUDIO</small>
          </span>
        </div>
        <div className="login-topbar-actions">
          <a href="/landing/index.html" className="login-back-link"><ArrowLeft /><span>返回介绍页</span></a>
          <div className="login-online-status" role="status"><span className="login-online-dot" aria-hidden><i /></span><span>8 个智能体在线</span></div>
        </div>
      </header>

      <div className="login-shell">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          className="login-stage"
        >
          <section className="login-story" aria-labelledby="login-story-title">
            <div className="login-story-copy">
              <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="login-kicker">
                <Activity /><span>AI LEARNING WORKSPACE · LIVE</span>
              </motion.div>
              <motion.h1 id="login-story-title" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.68, delay: 0.12 }}>
                让学习路径清晰可见<span>让每一步都有回应</span>
              </motion.h1>
              <motion.p initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.58, delay: 0.18 }}>
                岗位能力画像、多 Agent 协作与训练验收围绕同一个目标持续同步，把标准、资源与成果证据连接成可执行的学习闭环。
              </motion.p>
            </div>

            <div className="login-story-launches" aria-hidden="true">
              <span className="login-story-rocket is-escort is-left">
                <img src="/images/profile-launch-rocket-v1.png" alt="" />
                <em>能力画像</em><i />
              </span>
              <span className="login-story-rocket is-main">
                <b /><img src="/images/profile-launch-rocket-v1.png" alt="" />
                <em>今日任务</em><i />
              </span>
              <span className="login-story-rocket is-escort is-right">
                <img src="/images/profile-launch-rocket-v1.png" alt="" />
                <em>训练验收</em><i />
              </span>
            </div>

            <LearningNetwork reduced={Boolean(reduceMotion)} />

            <div className="login-signal-strip" aria-label="平台能力状态">
              <span><i>01</i><b>岗位画像</b><small>目标持续校准</small></span>
              <span><i>07</i><b>协作 Agent</b><small>实时在线</small></span>
              <span><i>∞</i><b>学习闭环</b><small>证据持续回写</small></span>
            </div>
          </section>

          <section className="login-auth-zone" aria-label={mode === "login" ? "登录因材智训" : "注册因材智训"}>
            <div className="login-flight-scene" aria-hidden="true">
              <picture>
                <source media="(max-width: 700px)" srcSet="/landing/assets/skillops-glider-hero-mobile-v1.webp" />
                <img src="/landing/assets/skillops-glider-hero-desktop-v1.webp" alt="" />
              </picture>
              <span className="login-flight-trail"><i /><i /><i /></span>
              <span className="login-flight-aircraft">
                <i className="login-aircraft-exhaust" />
                <img src="/images/learner-transition-route-jet-v1.png" alt="" />
              </span>
              <span className="login-flight-aircraft is-return">
                <i className="login-aircraft-exhaust" />
                <img src="/images/learner-transition-route-jet-v1.png" alt="" />
              </span>
            </div>
            <div className="login-auth-card">
              <div className="login-auth-heading">
                <div className="login-auth-heading-row">
                  <span className="login-security-label"><span />安全邮箱认证</span>
                  <span className="login-auth-icon"><BrainCircuit /></span>
                </div>
                <h2>{mode === "login" ? "继续你的学习旅程" : "创建你的学习星图"}</h2>
                <p>{mode === "login" ? "使用邮箱和密码进入因材智训" : "验证邮箱后，即可建立专属岗位能力画像"}</p>
              </div>

              <div className="login-mode-tabs" role="tablist" aria-label="登录或注册">
                {(["login", "register"] as Mode[]).map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => switchMode(item)}>
                    {mode === item && <motion.span layoutId="light-auth-tab" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />}
                    <b>{item === "login" ? "登录" : "注册"}</b>
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="login-form" aria-busy={loading}>
                <AnimatePresence initial={false} mode="popLayout">
                  {mode === "register" && (
                    <motion.div key="name" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}>
                      <Field label="昵称" icon={<UserRound />} value={name} onChange={setName} placeholder="如何称呼你" autoComplete="name" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode === "register" && (
                  <div className="login-identity-panel">
                    <span className="login-field-label">注册身份</span>
                    <div className="login-choice-grid" role="tablist" aria-label="注册身份">
                      <button type="button" role="tab" aria-selected={accountType === "learner"} onClick={() => setAccountType("learner")}>学习者</button>
                      <button type="button" role="tab" aria-selected={accountType === "enterprise_admin"} onClick={() => setAccountType("enterprise_admin")}>企业管理员</button>
                    </div>
                    {accountType === "learner" ? (
                      <>
                        <div className="login-choice-grid login-choice-grid-secondary" role="tablist" aria-label="学习者类型">
                          <button type="button" role="tab" aria-selected={learnerType === "student"} onClick={() => setLearnerType("student")}>学生</button>
                          <button type="button" role="tab" aria-selected={learnerType === "worker"} onClick={() => setLearnerType("worker")}>从业者</button>
                        </div>
                        {learnerType === "student" ? (
                          <label className="login-field login-identity-field">
                            <span className="login-field-label">学习阶段</span>
                            <span className="login-field-control">
                              <span className="login-field-icon"><GraduationCap /></span>
                              <select value={studyStage} onChange={(event) => setStudyStage(event.target.value)} className={studyStage ? "has-value" : ""} required>
                                <option value="" disabled>请选择学习阶段</option>
                                <option value="本科">本科</option>
                                <option value="研究生">研究生</option>
                                <option value="博士">博士</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 size-4 text-[#8A918F]" />
                            </span>
                          </label>
                        ) : <Field label="所在公司" icon={<UserRound />} value={company} onChange={setCompany} placeholder="例如：星河科技" autoComplete="organization" />}
                        <Field label={learnerType === "worker" ? "当前岗位" : "目标岗位（可稍后补充）"} icon={<Sparkles />} value={targetRole} onChange={setTargetRole} placeholder="例如：前线部署工程师" required={learnerType === "worker"} />
                      </>
                    ) : <Field label="企业名称" icon={<ShieldCheck />} value={company} onChange={setCompany} placeholder="例如：企业名称" autoComplete="organization" />}
                  </div>
                )}

                <Field label="邮箱地址" icon={<Mail />} value={email} onChange={setEmail} placeholder="例如 name@example.com" type="email" autoComplete="email" />

                <AnimatePresence initial={false} mode="popLayout">
                  {mode === "register" && (
                    <motion.div key="code" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }} className="login-code-row">
                      <Field label="邮箱验证码" icon={<ShieldCheck />} value={code} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位验证码" inputMode="numeric" />
                      <Button type="button" variant="outline" disabled={sending || countdown > 0} onClick={sendCode} className="login-send-code">
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
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="login-password-toggle" aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  }
                />

                <AnimatePresence mode="popLayout">
                  {notice && <motion.div role="status" aria-live="polite" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="login-message is-success"><CheckCircle2 />{notice}</motion.div>}
                  {error && <motion.div role="alert" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="login-message is-error"><AlertCircle />{error}</motion.div>}
                </AnimatePresence>

                <Button type="submit" size="lg" disabled={loading} className="login-submit">
                  <span>
                    {loading ? <Loader2 className="animate-spin" /> : <>{mode === "login" ? "进入因材智训" : "验证并创建账号"}<ArrowRight /></>}
                  </span>
                </Button>
              </form>

              <div className="login-auth-footnote">
                <ShieldCheck /> 安全邮箱验证 · 认证信息加密保护
              </div>
            </div>
          </section>
        </motion.div>
      </div>
    </main>
  )
}

function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden>
      <span className="login-aurora login-aurora-one" />
      <span className="login-aurora login-aurora-two" />
      <span className="login-aurora login-aurora-three" />
      <span className="login-grid" />
      <span className="login-horizon" />
    </div>
  )
}

function LearningNetwork({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .68, delay: .24 }}
      className="login-network"
    >
      <div className="login-network-meta">
        <span>LEARNING PATH · SIGNAL FLOW</span>
        <b><i />路径同步中</b>
      </div>
      <svg viewBox="0 0 680 288" role="img" aria-label="从岗位目标出发，经过能力画像、智能体协作与训练验收的学习路径关系图">
        <defs>
          <linearGradient id="login-path-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2379b2" />
            <stop offset=".55" stopColor="#4ebbd5" />
            <stop offset="1" stopColor="#43a88e" />
          </linearGradient>
          <radialGradient id="login-core-gradient" cx="34%" cy="24%">
            <stop offset="0" stopColor="#76d8ec" />
            <stop offset=".42" stopColor="#2c88b7" />
            <stop offset="1" stopColor="#163f69" />
          </radialGradient>
          <filter id="login-node-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#1d6f9d" floodOpacity=".2" />
          </filter>
          <filter id="login-signal-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="login-network-gridlines" aria-hidden>
          <path d="M30 62H650M30 144H650M30 226H650" />
          <path d="M104 28V258M266 28V258M428 28V258M590 28V258" />
        </g>
        <path className="login-network-path" d="M93 160 C155 112 201 111 260 145 S370 200 430 153 S540 104 606 142" />
        <path className="login-network-branch" d="M260 145 C306 102 333 76 375 64" />
        <path className="login-network-branch" d="M430 153 C475 188 501 214 548 224" />
        <path className="login-network-trace" d="M93 160 C155 112 201 111 260 145 S370 200 430 153 S540 104 606 142" />

        {!reduced && (
          <>
            <circle r="5" fill="#dffbff" stroke="#3fc4df" strokeWidth="2" filter="url(#login-signal-glow)"><animateMotion dur="5.8s" repeatCount="indefinite" path="M93 160 C155 112 201 111 260 145 S370 200 430 153 S540 104 606 142" /></circle>
            <circle r="3.5" fill="#ffffff" filter="url(#login-signal-glow)" opacity=".9"><animateMotion dur="5.8s" begin="-2.9s" repeatCount="indefinite" path="M93 160 C155 112 201 111 260 145 S370 200 430 153 S540 104 606 142" /></circle>
          </>
        )}

        <g className="login-network-core" transform="translate(93 160)" filter="url(#login-node-shadow)">
          <circle r="42" /><circle r="31" /><path d="M-14 4L-3 15 18-12" /><text y="58">岗位目标</text>
        </g>
        <g className="login-network-node" transform="translate(260 145)">
          <circle r="21" /><circle r="7" /><text y="40">能力画像</text><text className="login-network-node-index" y="55">01 · PROFILE</text>
        </g>
        <g className="login-network-node is-agent" transform="translate(430 153)">
          <circle r="23" /><path d="M-9 1H9M0-9V11" /><text y="42">Agent 协作</text><text className="login-network-node-index" y="57">07 · ONLINE</text>
        </g>
        <g className="login-network-node is-finish" transform="translate(606 142)">
          <circle r="24" /><path d="M-10 1L-2 9 12-8" /><text y="44">训练验收</text><text className="login-network-node-index" y="59">LOOP · SYNC</text>
        </g>
        <g className="login-network-mini" transform="translate(375 64)"><circle r="10" /><text x="17" y="4">资源生成</text></g>
        <g className="login-network-mini is-mint" transform="translate(548 224)"><circle r="10" /><text x="17" y="4">证据回写</text></g>
      </svg>
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
    <label className="login-field">
      <span className="login-field-label">{label}</span>
      <span className="login-field-control">
        <span className="login-field-icon">{icon}</span>
        <input {...props} required value={value} onChange={(event) => onChange(event.target.value)} />
        {action && <span className="login-field-action">{action}</span>}
      </span>
    </label>
  )
}
