import { useMemo, useState, type CSSProperties } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Compass,
  Factory,
  MapPinned,
  Network,
  Sparkles,
  Target,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ApiError, apiGet, apiPost } from "@/lib/api"
import { careerDomains, type CareerDomain, type CareerRole, type DomainId } from "@/lib/domainCareerCatalog"
import { useTrackPage } from "@/lib/useTrackPage"
import { setCurrentCourse, type CourseInfo } from "@/store/course"
import { setTargetRole, useTargetRole } from "@/store/targetRole"
import { clearWorkspaceState } from "@/store/workspace"
import "./Courses.css"

const domainOrder: DomainId[] = ["ai", "software", "industrial", "smart-manufacturing"]
const domainIcons = { ai: Sparkles, software: BriefcaseBusiness, industrial: Network, "smart-manufacturing": Factory }
const domainTones = {
  ai: { cover: "from-[#315E83] to-[#6F8A69]", chip: "bg-[#E7EDF3] text-[#315E83]" },
  software: { cover: "from-[#7E6B83] to-[#315E83]", chip: "bg-[#EEE9EF] text-[#7E6B83]" },
  industrial: { cover: "from-[#8E6925] to-[#3E7774]", chip: "bg-[#F4ECD8] text-[#8E6925]" },
  "smart-manufacturing": { cover: "from-[#3E7774] to-[#315E83]", chip: "bg-[#E3EFEC] text-[#2F6D68]" },
}

const roleCoverImages = {
  "ai-agent": "/career-covers/ai-agent.webp",
  "ai-infra": "/career-covers/ai-infra.webp",
  "embodied-ai": "/career-covers/embodied-ai.webp",
  "llm-security": "/career-covers/llm-security.webp",
  "llm-application": "/career-covers/llm-application.webp",
  fde: "/career-covers/fde.webp",
  devsecops: "/career-covers/devsecops.webp",
  "rag-implementation": "/career-covers/rag-implementation.webp",
  mlops: "/career-covers/mlops.webp",
  "ai-native-frontend": "/career-covers/ai-native-frontend.webp",
  "industrial-architect": "/career-covers/industrial-architect.webp",
  "industrial-data": "/career-covers/industrial-data.webp",
  "edge-ai": "/career-covers/edge-ai.webp",
  "industrial-vision": "/career-covers/industrial-vision.webp",
  "industrial-network": "/career-covers/industrial-network.webp",
  "mes-engineer": "/career-covers/mes-engineer.webp",
  "multimodal-llm": "/career-covers/multimodal-llm.webp",
  "industrial-ai-agent": "/career-covers/industrial-ai-agent.webp",
  "smart-manufacturing-software": "/career-covers/smart-manufacturing-software.webp",
  "iot-specialist": "/career-covers/iot-specialist.webp",
} as const

interface CourseListResponse {
  items: CourseInfo[]
}

function getOrderedDomains(): CareerDomain[] {
  return domainOrder.map((id) => careerDomains.find((domain) => domain.id === id)).filter((domain): domain is CareerDomain => Boolean(domain))
}

export function Courses() {
  useTrackPage("target_role_selection")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const storedRole = useTargetRole()
  const domains = useMemo(getOrderedDomains, [])
  const storedDomain = careerDomains.find((item) => item.roles.some((role) => role.id === storedRole?.id))?.id
  const [domainId, setDomainId] = useState<DomainId>(storedDomain ?? "ai")
  const [activationError, setActivationError] = useState("")
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [activatingRoleId, setActivatingRoleId] = useState("")
  const domain = domains.find((item) => item.id === domainId) ?? domains[0]
  const requestedReturnTo = searchParams.get("returnTo")
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : "/profile"
  const returnLabel = returnTo.startsWith("/workspace") ? "返回训练资源" : returnTo.startsWith("/competency") ? "返回训练中心" : "建立岗位画像"

  async function selectRole(role: CareerRole) {
    setActivationError("")
    setRequiresLogin(false)
    const roleChanged = storedRole?.id !== role.id
    setActivatingRoleId(role.id)
    try {
      const response = await apiGet<CourseListResponse>("/courses")
      const roleCourse = response.items.find((course) => course.name === role.courseName)
      if (!roleCourse) throw new Error(`${role.name} 知识库尚未加载`)
      setTargetRole({ domainId: domain.id, roleId: role.id })
      setCurrentCourse(roleCourse)
      if (role.id === "fde") {
        void apiPost("/theory-assessments/prepare", {
          role_id: role.id,
          role_name: role.name,
          course_id: roleCourse.id,
          competencies: role.skills,
        }).catch(() => undefined)
      }
      if (roleChanged) clearWorkspaceState()
      navigate(returnTo, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setRequiresLogin(true)
        setActivationError("登录会话已失效，尚未读取岗位知识库。请重新登录后再选择岗位。")
      } else {
        setActivationError(`${role.name} 的岗位资料加载失败：${error instanceof Error ? error.message : "请稍后重试"}`)
      }
    } finally {
      setActivatingRoleId("")
    }
  }

  return (
    <main className="app-page paper-theme career-route-page min-h-dvh">
      <div className="career-route-shell">
        <AppTopbar current="courses" appearance="paper" labelOverride="岗位空间" groupOverride="职业航线导航" selectionLabel={storedRole?.name ?? "等待选择目标岗位"} iconImage="/images/courses-career-route-compass-v1.png" />
        <section className="career-route-section career-route-selector" aria-labelledby="domain-heading">
          <div className="career-route-section-heading"><span className="career-route-heading-symbol is-compass"><Compass /></span><div><small>01 · 立即选择 / SELECT ROLE</small><h1 id="domain-heading">选择目标岗位</h1><p>先切换职业领域，再直接点击下方岗位卡片确认。</p></div><aside><Target />当前：{storedRole?.name ?? "尚未选择"}</aside></div>
          <div className="career-route-domain-grid">
                {domains.map((item) => {
                  const Icon = domainIcons[item.id]
                  const selected = item.id === domain.id
                  return <button key={item.id} type="button" onClick={() => setDomainId(item.id)} className={selected ? "is-selected" : ""}>
                    <span><Icon /></span><b>{String(domainOrder.indexOf(item.id) + 1).padStart(2, "0")}</b>
                    <div><strong>{item.name}</strong><small>{item.roles.length} 条岗位航线</small></div>{selected && <CheckCircle2 />}
                  </button>
                })}
              </div>
        </section>

        <CareerRouteTransfer
          from={`职业领域 · ${domain.name}`}
          to="可选岗位航线"
          label="ROUTE TRANSFER · 01"
          variant="aircraft"
        />

        <section className="career-route-section career-route-role-section" aria-labelledby="role-heading">
          <div className="career-route-section-heading"><span className="career-route-heading-symbol is-destination"><MapPinned /></span><div><small>02 · 岗位航线 / DESTINATION</small><h2 id="role-heading">「{domain.name}」可选岗位</h2><p>{domain.description}</p></div><aside><BriefcaseBusiness />{domain.roles.length} 个可选岗位</aside></div>
          <div className="career-route-role-grid">
                {domain.roles.map((role, index) => <RoleBook key={role.id} role={role} domainId={domain.id} index={index} selected={storedRole?.id === role.id} activating={activatingRoleId === role.id} onSelect={() => void selectRole(role)} />)}
              </div>
          {activationError && <div role="alert" className="career-route-alert"><span>{activationError}</span>{requiresLogin && <Link to="/login">前往登录</Link>}</div>}
        </section>

        <CareerRouteTransfer
          from={`岗位目录 · ${domain.roles.length} 条航线`}
          to="航向状态同步"
          label="ORBIT TELEMETRY · 02"
          variant="satellite"
        />

        <section className="career-route-hero career-route-summary">
          <span className="career-route-summary-radar" aria-hidden="true"><i /><i /><i /></span>
          <div className="career-route-live"><span className="career-route-live-dot" />CAREER ROUTE · ONLINE <i>岗位导航状态</i></div>
          <div className="career-route-hero-grid">
            <div className="career-route-identity">
              <div className="career-route-index"><strong>03</strong><span>职业航线状态</span><i>ROUTE STATUS</i></div>
              <h2>岗位上下文<br /><em>{storedRole ? "已经就绪" : "等待确认"}</em></h2>
              <p>确认岗位后，画像、学习资源和测验将自动切换至同一训练航向。</p>
              <div className="career-route-summary-metrics" aria-label="航线同步信息">
                <span><small>领域航向</small><strong>{domain.name}</strong></span>
                <span><small>同步模块</small><strong>画像 · 资源 · 测验</strong></span>
              </div>
            </div>
            <div className="career-route-status">
              <span className="career-route-status-icon"><Target /></span>
              <div><small>当前导航状态</small><strong>{storedRole ? storedRole.name : "航向待确认"}</strong><p>{storedRole ? "岗位上下文已就绪，可重新选择航向" : "返回上方选择领域与岗位"}</p></div>
              <span className="career-route-status-signal" aria-hidden="true"><i /><b>{storedRole ? "ROUTE SYNCED" : "ROUTE STANDBY"}</b></span>
              <Link to={returnTo}><ArrowLeft />{returnLabel}</Link>
            </div>
          </div>
          <div className="career-route-track" aria-label="岗位选择路径"><i /><span className="is-active"><b>01</b>选择领域</span><span><b>02</b>浏览岗位</span><span className={storedRole ? "is-done" : ""}><b>03</b>确认航向</span><span className={storedRole ? "is-done" : ""}><b>04</b>进入训练</span></div>
        </section>
      </div>
    </main>
  )
}

function CareerRouteTransfer({ from, to, label, variant }: { from: string; to: string; label: string; variant: "aircraft" | "satellite" }) {
  return <div className={`career-route-transfer is-${variant}`} aria-label={`${from}与${to}之间的双向航线`}>
    <div className="career-route-flight-lane" aria-hidden="true"><i className="is-eastbound" /><i className="is-westbound" /><b>{label} · BIDIRECTIONAL</b></div>
  </div>
}

function RoleBook({ role, domainId, index, selected, activating, onSelect }: { role: CareerRole; domainId: DomainId; index: number; selected: boolean; activating: boolean; onSelect: () => void }) {
  const tone = domainTones[domainId]
  const cover = roleCoverImages[role.id as keyof typeof roleCoverImages]
  return <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.05 }} className={`career-route-role-card career-route-role-card--${index + 1} ${role.knowledgeBaseState === "ready" ? "is-ready" : "is-building"} ${selected ? "is-selected" : ""} ${activating ? "is-activating" : ""}`} style={{ "--route-accent": tone.cover.includes("315E83") ? "#315e83" : "#3e7774" } as CSSProperties}>
    <button type="button" onClick={onSelect} disabled={activating}>
      <span className="career-route-role-image"><img src={cover} alt={`${role.name}职业场景封面`} loading="lazy" /></span>
      <span className="career-route-role-copy"><span className="career-route-role-meta"><b>{String(index + 1).padStart(2, "0")}</b><i><span className="career-route-state-beacon" />{selected ? "CURRENT ROUTE" : role.knowledgeBaseState === "ready" ? "READY TO BOARD" : "BUILDING"}</i></span><strong>{role.name}</strong><p>{role.summary}</p><span className="career-route-skill-row">{role.skills.slice(0, 3).map((skill) => <small key={skill}>{skill}</small>)}</span><span className="career-route-role-action">{activating ? <><Sparkles />航线校准中</> : selected ? <><CheckCircle2 />当前目标岗位</> : <>{role.id === "fde" ? "进入岗位训练" : "确认目标岗位"}<ArrowRight /></>}</span></span>
    </button>
  </motion.article>
}
