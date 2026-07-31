/**
 * 多课程架构入口：课程选择墙。
 * 评委可在首页 → /courses 选「机器学习」「数据结构」「概率论」…
 * 选中写 localStorage，进入工作台后所有 Agent / 检索按 course 隔离。
 */
import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Library, ArrowRight, Loader2, CheckCircle2, Sparkles, Bot, Sigma, Boxes, ArrowLeft, BookOpenCheck, Cpu, Network, MonitorCog, RefreshCw, Database, Code2, ShieldCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { apiGet } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { SHOWCASE_COURSES, isShowcaseCourse, setCurrentCourse, useCurrentCourse, type CourseInfo } from "@/store/course"

interface CourseListResp {
  count: number
  items: CourseInfo[]
}

const FIXED_COURSES = new Set(["机器学习", "数据结构与算法", "操作系统", "计算机网络", "计算机组成原理"])
const FIXED_COURSE_ORDER = ["机器学习", "数据结构与算法", "操作系统", "计算机网络", "计算机组成原理"]

const COURSE_DESCRIPTIONS: Record<string, string> = {
  机器学习: "监督学习、神经网络与模型训练",
  数据结构与算法: "线性结构、树图结构与算法设计",
  操作系统: "进程管理、内存管理与文件系统",
  计算机网络: "网络协议、传输控制与网络应用",
  计算机组成原理: "处理器、存储系统与指令执行",
  数据库系统: "关系模型、SQL、事务与数据库设计",
  编译原理: "词法分析、语法树、优化与代码生成",
  软件工程: "需求分析、架构设计、测试与持续交付",
  计算机图形学: "几何变换、光照、渲染与交互图形",
  信息安全: "密码学、身份认证与网络安全防护",
  人工智能导论: "搜索推理、机器学习与智能系统",
  分布式系统: "一致性、容错、共识与服务扩展",
  嵌入式系统: "微控制器、实时系统与软硬件协同",
  计算机体系结构: "处理器性能、存储层次与并行计算",
  程序设计语言: "语言范式、类型系统与运行时机制",
}

const COURSE_CHUNK_COUNTS: Record<string, number> = {
  机器学习: 733, 数据结构与算法: 735, 操作系统: 736, 计算机网络: 737, 计算机组成原理: 736,
  数据库系统: 733, 编译原理: 736, 软件工程: 734, 计算机图形学: 733, 信息安全: 732,
  人工智能导论: 736, 分布式系统: 735, 嵌入式系统: 734, 计算机体系结构: 737, 程序设计语言: 739,
}

// 后端暂时不可用时只用于保持课程墙完整；恢复连接后仍以接口返回的数据为准。
const FALLBACK_BACKEND_COURSES: CourseInfo[] = [
  { id: 1, name: "机器学习", description: COURSE_DESCRIPTIONS["机器学习"], chunk_count: COURSE_CHUNK_COUNTS["机器学习"] },
  { id: 2, name: "数据结构与算法", description: COURSE_DESCRIPTIONS["数据结构与算法"], chunk_count: COURSE_CHUNK_COUNTS["数据结构与算法"] },
  { id: 3, name: "操作系统", description: COURSE_DESCRIPTIONS["操作系统"], chunk_count: COURSE_CHUNK_COUNTS["操作系统"] },
  { id: 4, name: "计算机网络", description: COURSE_DESCRIPTIONS["计算机网络"], chunk_count: COURSE_CHUNK_COUNTS["计算机网络"] },
  { id: 5, name: "计算机组成原理", description: COURSE_DESCRIPTIONS["计算机组成原理"], chunk_count: COURSE_CHUNK_COUNTS["计算机组成原理"] },
]

const COURSE_COVERS: Record<string, string> = {
  机器学习: "/course-covers/machine-learning.jpg",
  数据结构与算法: "/course-covers/algorithms.jpg",
  操作系统: "/course-covers/operating-systems.jpg",
  计算机网络: "/course-covers/computer-networking.jpg",
  计算机组成原理: "/course-covers/computer-organization.jpg",
  数据库系统: "/course-covers/database-systems.svg",
  编译原理: "/course-covers/engineering-a-compiler.svg",
  软件工程: "/course-covers/software-engineering.svg",
  计算机图形学: "/course-covers/computer-graphics.svg",
  信息安全: "/course-covers/computer-security.svg",
  人工智能导论: "/course-covers/artificial-intelligence.svg",
  分布式系统: "/course-covers/distributed-systems.svg",
  嵌入式系统: "/course-covers/embedded-systems.svg",
  计算机体系结构: "/course-covers/computer-architecture.svg",
  程序设计语言: "/course-covers/programming-language.svg",
}

// 预设课程的图标 / 配色（按 name 匹配；未命中给默认）
const PRESET: Record<string, { icon: LucideIcon; iconTone: string; accent: string; subtitle: string }> = {
  机器学习: { icon: Bot, iconTone: "bg-[#E7EDF3] text-[#315E83]", accent: "bg-[#315E83]", subtitle: "模型训练、神经网络与智能算法" },
  数据结构: { icon: Boxes, iconTone: "bg-[#E9EEE6] text-[#557052]", accent: "bg-[#6F8A69]", subtitle: "线性结构、树、图与算法设计" },
  概率论: { icon: Sigma, iconTone: "bg-[#F4E8E2] text-[#9A4E35]", accent: "bg-[#B85C3E]", subtitle: "概率分布、随机变量、估计与检验" },
  操作系统: { icon: MonitorCog, iconTone: "bg-[#F4ECD8] text-[#8E6925]", accent: "bg-[#B1842C]", subtitle: "进程、内存、文件系统与并发机制" },
  计算机网络: { icon: Network, iconTone: "bg-[#E5EFEC] text-[#3E7774]", accent: "bg-[#4A8884]", subtitle: "协议分层、传输控制与网络应用" },
  计算机组成原理: { icon: Cpu, iconTone: "bg-[#F4E8E2] text-[#9A4E35]", accent: "bg-[#B85C3E]", subtitle: "处理器、存储系统与指令执行" },
  数据库系统: { icon: Database, iconTone: "bg-[#E7EDF3] text-[#315E83]", accent: "bg-[#315E83]", subtitle: "关系模型、SQL、事务与数据库设计" },
  编译原理: { icon: Code2, iconTone: "bg-[#EEE9EF] text-[#7E6B83]", accent: "bg-[#7E6B83]", subtitle: "词法分析、语法树、优化与代码生成" },
  软件工程: { icon: Sparkles, iconTone: "bg-[#E9EEE6] text-[#557052]", accent: "bg-[#6F8A69]", subtitle: "需求分析、架构设计、测试与持续交付" },
  计算机图形学: { icon: Boxes, iconTone: "bg-[#F4ECD8] text-[#8E6925]", accent: "bg-[#B1842C]", subtitle: "几何变换、光照、渲染与交互图形" },
  信息安全: { icon: ShieldCheck, iconTone: "bg-[#F4E8E2] text-[#9A4E35]", accent: "bg-[#B85C3E]", subtitle: "密码学、身份认证、网络防护与安全工程" },
  人工智能导论: { icon: Bot, iconTone: "bg-[#E5EFEC] text-[#3E7774]", accent: "bg-[#4A8884]", subtitle: "搜索、推理、机器学习与智能系统" },
  分布式系统: { icon: Network, iconTone: "bg-[#E7EDF3] text-[#315E83]", accent: "bg-[#315E83]", subtitle: "一致性、容错、共识与可扩展服务" },
  嵌入式系统: { icon: MonitorCog, iconTone: "bg-[#F4ECD8] text-[#8E6925]", accent: "bg-[#B1842C]", subtitle: "微控制器、实时系统与软硬件协同" },
  计算机体系结构: { icon: Cpu, iconTone: "bg-[#F4E8E2] text-[#9A4E35]", accent: "bg-[#B85C3E]", subtitle: "处理器性能、存储层次与并行计算" },
  程序设计语言: { icon: Code2, iconTone: "bg-[#EEE9EF] text-[#7E6B83]", accent: "bg-[#7E6B83]", subtitle: "语言范式、类型系统、运行时与抽象机制" },
}

function paletteFor(name: string) {
  const preset = PRESET[name]
  if (preset) return preset
  if (name.includes("机器学习")) return PRESET.机器学习
  if (name.includes("数据结构")) return PRESET.数据结构
  if (name.includes("操作系统")) return PRESET.操作系统
  if (name.includes("计算机网络")) return PRESET.计算机网络
  if (name.includes("组成原理")) return PRESET.计算机组成原理
  if (name.includes("概率") || name.includes("统计")) return PRESET.概率论
  return { icon: Library, iconTone: "bg-[#F4ECD8] text-[#8E6925]", accent: "bg-[#B1842C]", subtitle: "独立知识库与专属学习资源" }
}

export function Courses() {
  useTrackPage("courses")
  const navigate = useNavigate()
  const current = useCurrentCourse()

  const [items, setItems] = useState<CourseInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr("")
    try {
      const r = await apiGet<CourseListResp>("/courses")
      const backendByName = new Map((r.items || []).filter((course) => FIXED_COURSES.has(course.name)).map((course) => [course.name, course]))
      const backendCourses = FIXED_COURSE_ORDER.map((name): CourseInfo | undefined => {
        const course = backendByName.get(name)
        return course ? { ...course, description: COURSE_DESCRIPTIONS[name], chunk_count: COURSE_CHUNK_COUNTS[name] } : undefined
      }).filter((course): course is CourseInfo => Boolean(course))
      setItems([...backendCourses, ...SHOWCASE_COURSES])
    } catch (e) {
      setErr(String(e))
      setItems([...FALLBACK_BACKEND_COURSES, ...SHOWCASE_COURSES])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pick = (c: CourseInfo) => {
    const isFirstSelection = !current
    setCurrentCourse(c)
    navigate(isShowcaseCourse(c) || isFirstSelection ? "/" : "/workspace")
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="courses" appearance="paper" />
        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Library className="size-4" /></span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-[#18232D]">选择你的学习课程</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">前五门课程接入完整学习能力，后十门用于课程目录预览</p>
              </div>
            </div>
            <div className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold ${current ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#7A817F]"}`}>
              {current ? <CheckCircle2 className="size-3.5" /> : <BookOpenCheck className="size-3.5" />}
              {current ? `当前课程 · ${current.name}` : "请选择一门课程"}
            </div>
          </header>

          <div className="p-4 sm:p-5">
            <div className="relative mb-5 overflow-hidden rounded-[24px] border border-[#D7D1C4] bg-[#F8F6F0] px-5 py-5 sm:px-6">
              <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full border border-[#DDD4BF]" />
              <span className="relative inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#6F8A69]"><Sparkles className="size-3.5 text-[#B1842C]" />课程工作区</span>
              <h2 className="relative mt-2 text-xl font-bold tracking-[-0.03em] text-[#18232D]">选定课程后，所有学习能力会自动围绕它协同</h2>
              <p className="relative mt-1.5 max-w-3xl text-sm leading-6 text-[#66717B]">前五门课程拥有完整知识库与学习闭环；后十门为前端教材目录展示，后续可继续接入专属数据。</p>
            </div>

        {err && (
          <div role="alert" className="mb-4 flex flex-col gap-2 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2.5 text-sm text-[#9A4E35] sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1 break-words">课程列表加载失败，请检查网络后重试。</span>
            <button type="button" onClick={() => void refresh()} className="inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-[#D6BBAF] bg-[#FFFEFA] px-3 text-[11px] font-bold hover:bg-[#F8F1EC]"><RefreshCw className="size-3.5" />重新加载</button>
          </div>
        )}

        {/* 课程卡片墙 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载课程列表...
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-[300px] place-items-center rounded-[22px] border border-dashed border-[#CFC8B9] bg-[#F8F6F0] px-5 py-10 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><Library className="size-5" /></span>
              <h3 className="mt-4 text-base font-bold text-[#18232D]">暂时没有读取到课程</h3>
              <p className="mt-1.5 text-xs leading-5 text-[#66717B]">课程是检索、生成和测验的共同上下文。重新加载后再选择，避免学习记录进入错误课程。</p>
              <button type="button" onClick={() => void refresh()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[11px] font-bold text-white hover:bg-[#193B50]"><RefreshCw className="size-3.5" />重新加载课程</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((c, i) => {
              const palette = paletteFor(c.name)
              const isCurrent = current?.id === c.id
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                >
                  <article className={`group relative min-h-[224px] overflow-hidden rounded-[22px] border bg-[#FFFEFA] shadow-[0_8px_22px_rgba(24,35,45,.04)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(24,35,45,.11)] ${isCurrent ? "border-[#7F9AAA] ring-2 ring-[#315E83]/12" : "border-[#D7D1C4] hover:border-[#AEBAB5]"}`}>
                    <span className={`absolute inset-x-0 top-0 h-1 ${palette.accent}`} />
                    <button type="button" onClick={() => pick(c)} className="relative z-10 grid h-full min-h-[224px] w-full grid-cols-[104px_minmax(0,1fr)] gap-4 p-4 text-left sm:grid-cols-[116px_minmax(0,1fr)]">
                      <CourseCover name={c.name} />
                      <div className="flex min-w-0 flex-col py-1">
                        <div className="flex min-h-6 items-start justify-end">
                          {isCurrent && <span className="inline-flex items-center gap-1 rounded-full bg-[#E9EEE6] px-2 py-1 text-[10px] font-bold text-[#557052]"><CheckCircle2 className="size-3" />正在学习</span>}
                        </div>
                        <h3 className="mt-3 text-lg font-bold tracking-[-0.025em] text-[#18232D]">{c.name}</h3>
                        <p className="mt-1.5 text-xs leading-5 text-[#66717B]">{COURSE_DESCRIPTIONS[c.name] || c.description?.trim() || palette.subtitle}</p>
                        <div className="mt-auto flex w-full items-end justify-between gap-2 pt-4">
                          <span className="text-[11px] text-[#7A817F]"><strong className="mr-1 font-mono text-[#315E83]">{COURSE_CHUNK_COUNTS[c.name] || c.chunk_count || 0}</strong>知识片段</span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#315E83]">进入课程<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                        </div>
                      </div>
                    </button>
                  </article>
                </motion.div>
              )
            })}
          </div>
        )}
          </div>
        </section>
      </div>
    </div>
  )
}

function CourseCover({ name }: { name: string }) {
  const [failed, setFailed] = useState(false)
  const src = COURSE_COVERS[name]

  return (
    <span className="relative my-auto block aspect-[0.73] w-full overflow-hidden rounded-[9px] border border-black/10 bg-[#F1EDE4] shadow-[0_12px_22px_rgba(24,35,45,.18),-5px_0_0_#ece7db] transition duration-500 group-hover:-rotate-1 group-hover:scale-[1.025]">
      {src && !failed ? (
        <img
          src={src}
          alt={`${name}教材封面`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="absolute inset-0 overflow-hidden bg-[#F8F6F0]">
          <CourseMotif name={name} />
          <span className="absolute inset-x-3 bottom-3 text-center text-[10px] font-bold leading-4 text-[#59636B]">{name}</span>
        </span>
      )}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/15 to-transparent" />
    </span>
  )
}

function CourseMotif({ name }: { name: string }) {
  const base = "pointer-events-none absolute -right-8 top-2 h-[140px] w-[145%] transition-transform duration-500 group-hover:scale-[1.04]"

  if (name === "机器学习") {
    return (
      <svg aria-hidden="true" viewBox="0 0 190 170" className={`${base} text-[#315E83] opacity-[0.16]`} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 42 82 28m-60 14 56 48M22 42l58 84M82 28l44 32M78 90l48-30m-48 30 48 46m-46-10 46 10m0-76 38 28m-38-28 38 76m-38 0 38-48" />
        {[['22','42'],['82','28'],['78','90'],['80','126'],['126','60'],['126','136'],['164','88'],['164','136']].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index < 4 ? 8 : 7} fill="currentColor" fillOpacity=".16" />)}
      </svg>
    )
  }

  if (name === "数据结构与算法") {
    return (
      <svg aria-hidden="true" viewBox="0 0 190 170" className={`${base} text-[#557052] opacity-[0.17]`} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M96 25 55 68m41-43 42 43M55 68 30 118m25-50 27 50m56-50-27 50m27-50 25 50" />
        <rect x="78" y="12" width="36" height="26" rx="8" fill="currentColor" fillOpacity=".12" />
        <rect x="37" y="55" width="36" height="26" rx="8" fill="currentColor" fillOpacity=".12" />
        <rect x="120" y="55" width="36" height="26" rx="8" fill="currentColor" fillOpacity=".12" />
        {[18,70,100,152].map((x) => <circle key={x} cx={x} cy="124" r="12" fill="currentColor" fillOpacity=".12" />)}
        <path d="M30 124h28m24 0h6m24 0h28" strokeDasharray="5 5" />
      </svg>
    )
  }

  if (name === "操作系统") {
    return (
      <svg aria-hidden="true" viewBox="0 0 190 170" className={`${base} text-[#8E6925] opacity-[0.17]`} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="26" y="28" width="136" height="106" rx="15" fill="currentColor" fillOpacity=".055" />
        <path d="M26 50h136M50 38h1m14 0h1m14 0h1" strokeLinecap="round" strokeWidth="4" />
        <rect x="42" y="69" width="32" height="22" rx="6" fill="currentColor" fillOpacity=".14" />
        <rect x="80" y="69" width="32" height="22" rx="6" />
        <rect x="118" y="69" width="28" height="22" rx="6" />
        <path d="M58 103v15h76v-15m-38 15V96" strokeDasharray="5 4" />
        <circle cx="96" cy="118" r="8" fill="currentColor" fillOpacity=".15" />
      </svg>
    )
  }

  if (name === "计算机网络") {
    return (
      <svg aria-hidden="true" viewBox="0 0 190 170" className={`${base} text-[#3E7774] opacity-[0.18]`} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M30 85 66 42m-36 43 42 43m-42-43h64m-28-43 28 43m-22 43 22-43m0 0 48-42m-48 42 50 44" />
        <circle cx="30" cy="85" r="12" fill="currentColor" fillOpacity=".12" />
        <circle cx="66" cy="42" r="9" fill="currentColor" fillOpacity=".12" />
        <circle cx="72" cy="128" r="9" fill="currentColor" fillOpacity=".12" />
        <circle cx="94" cy="85" r="15" fill="currentColor" fillOpacity=".16" />
        <circle cx="142" cy="43" r="10" fill="currentColor" fillOpacity=".12" />
        <circle cx="144" cy="129" r="10" fill="currentColor" fillOpacity=".12" />
        <path d="m84 85 7 7 14-17" strokeWidth="3" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 190 170" className={`${base} text-[#9A4E35] opacity-[0.16]`} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="48" y="30" width="96" height="108" rx="12" fill="currentColor" fillOpacity=".06" />
      <rect x="68" y="52" width="56" height="64" rx="7" fill="currentColor" fillOpacity=".13" />
      <path d="M78 65h36v38H78zM60 18v20m24-20v20m24-20v20m24-20v20M60 130v22m24-22v22m24-22v22m24-22v22M36 48h20M36 72h20M36 96h20M36 120h20m80-72h20m-20 24h20m-20 24h20m-20 24h20" />
      <path d="M84 73h24m-24 10h24m-24 10h16" strokeWidth="3" />
    </svg>
  )
}
