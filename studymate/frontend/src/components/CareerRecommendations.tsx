import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Route, ShieldCheck, Sparkles, Target } from "lucide-react"

import { ApiError, apiGet } from "@/lib/api"
import { careerDomains, type CareerRole, type DomainId } from "@/lib/domainCareerCatalog"
import { track } from "@/lib/track"
import { setCurrentCourse, type CourseInfo } from "@/store/course"
import { setTargetRole, useTargetRole } from "@/store/targetRole"
import { clearWorkspaceState } from "@/store/workspace"

interface CourseListResponse { items: CourseInfo[] }

interface TransferRole {
  role: CareerRole
  domainId: DomainId
  score: number
  sharedSkills: string[]
  gaps: string[]
}

const ABILITY_GROUPS = [
  ["RAG", "检索", "资料解析", "引用", "评测", "Agent", "大模型", "模型训练", "推理", "感知", "规划", "控制"],
  ["部署", "工程", "监控", "系统集成", "交付", "验收", "运维", "性能", "容器", "流水线", "架构设计", "云边协同"],
  ["数据", "ETL", "时序", "采集", "治理", "实验追踪"],
  ["安全", "权限", "审计", "漏洞", "签名", "SBOM", "红队"],
  ["网络", "协议", "设备", "联调", "边缘", "接口"],
]

function sameAbility(a: string, b: string): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true
  return ABILITY_GROUPS.some((group) => group.some((word) => a.includes(word)) && group.some((word) => b.includes(word)))
}

function transferScore(current: CareerRole, candidate: CareerRole, domainId: DomainId, sameDomain: boolean): TransferRole {
  const sharedSkills = candidate.skills.filter((skill) => current.skills.some((currentSkill) => sameAbility(skill, currentSkill)))
  const gaps = candidate.skills.filter((skill) => !sharedSkills.includes(skill))
  const skillRate = candidate.skills.length ? sharedSkills.length / candidate.skills.length : 0
  const baseRate = candidate.baseCourses.length
    ? candidate.baseCourses.filter((course) => current.baseCourses.includes(course)).length / candidate.baseCourses.length
    : 0
  const score = Math.min(98, Math.round(20 + skillRate * 48 + baseRate * 20 + (sameDomain ? 12 : 0)))
  return { role: candidate, domainId, score, sharedSkills, gaps }
}

const recruitmentKeywords: Record<string, string> = {
  "ai-agent": "AI Agent 开发工程师",
  "ai-infra": "AI Infra 工程师",
  "embodied-ai": "具身智能算法工程师",
  "llm-security": "大模型安全工程师",
  "llm-application": "大模型应用开发工程师",
  fde: "前线部署工程师 FDE",
  devsecops: "DevSecOps 工程师",
  "rag-implementation": "RAG 应用实施工程师",
  mlops: "MLOps 工程师",
  "ai-native-frontend": "AI 前端开发工程师",
  "industrial-architect": "工业互联网架构师",
  "industrial-data": "工业数据工程师",
  "edge-ai": "边缘计算 AI 工程师",
  "industrial-vision": "工业视觉工程师",
  "industrial-network": "工业网络集成工程师",
  "mes-engineer": "MES 工程师",
  "multimodal-llm": "多模态大模型算法工程师",
  "industrial-ai-agent": "工业 AI Agent 工程师",
  "smart-manufacturing-software": "智能制造软件工程师",
  "iot-specialist": "物联网开发工程师",
}

const roleCoverImages: Record<string, string> = {
  "ai-agent": "/career-covers/ai-agent.webp", "ai-infra": "/career-covers/ai-infra.webp", "embodied-ai": "/career-covers/embodied-ai.webp",
  "llm-security": "/career-covers/llm-security.webp", "llm-application": "/career-covers/llm-application.webp", fde: "/career-covers/fde.webp",
  devsecops: "/career-covers/devsecops.webp", "rag-implementation": "/career-covers/rag-implementation.webp", mlops: "/career-covers/mlops.webp",
  "ai-native-frontend": "/career-covers/ai-native-frontend.webp", "industrial-architect": "/career-covers/industrial-architect.webp",
  "industrial-data": "/career-covers/industrial-data.webp", "edge-ai": "/career-covers/edge-ai.webp", "industrial-vision": "/career-covers/industrial-vision.webp",
  "industrial-network": "/career-covers/industrial-network.webp", "mes-engineer": "/career-covers/mes-engineer.webp",
  "multimodal-llm": "/career-covers/multimodal-llm.webp", "industrial-ai-agent": "/career-covers/industrial-ai-agent.webp",
  "smart-manufacturing-software": "/career-covers/smart-manufacturing-software.webp", "iot-specialist": "/career-covers/iot-specialist.webp",
}

function recruitmentLinks(role: CareerRole) {
  const query = recruitmentKeywords[role.id] ?? role.name
  const encodedQuery = encodeURIComponent(query)
  return [
    { label: "BOSS 直聘", url: `https://www.zhipin.com/web/geek/job?query=${encodedQuery}&city=100010000`, event: "boss_jobs" },
    { label: "智联招聘", url: `https://sou.zhaopin.com/?jl=489&kw=${encodedQuery}`, event: "zhaopin_jobs" },
  ].map((item) => ({ ...item, query }))
}

export function CareerRecommendations({ compact = false }: { profileVersion?: number; compact?: boolean }) {
  const navigate = useNavigate()
  const currentRole = useTargetRole()
  const [activatingRoleId, setActivatingRoleId] = useState("")
  const [error, setError] = useState("")

  const recommendations = useMemo<TransferRole[]>(() => {
    if (!currentRole) return []
    const currentDomainId = careerDomains.find((item) => item.roles.some((current) => current.id === currentRole.id))?.id
    return careerDomains.flatMap((domain) => domain.roles
      .filter((role) => role.id !== currentRole.id && role.knowledgeBaseState === "ready")
      .map((role) => transferScore(currentRole, role, domain.id, domain.id === currentDomainId)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [currentRole])

  const enterTraining = async (candidate: TransferRole) => {
    setError("")
    setActivatingRoleId(candidate.role.id)
    try {
      const response = await apiGet<CourseListResponse>("/courses")
      const roleCourse = response.items.find((item) => item.name === candidate.role.courseName)
      if (!roleCourse) throw new Error("该岗位知识库尚未准备完成")
      setTargetRole({ domainId: candidate.domainId, roleId: candidate.role.id })
      setCurrentCourse(roleCourse)
      clearWorkspaceState()
      navigate("/competency")
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setError("登录状态已失效，请重新登录后再开始转岗训练。")
      } else {
        setError(`${candidate.role.name} 暂时无法进入训练：${reason instanceof Error ? reason.message : "请稍后重试"}`)
      }
    } finally {
      setActivatingRoleId("")
    }
  }

  if (!currentRole) {
    return (
      <section className="career-match-empty" aria-label="尚未选择当前岗位">
        <Target aria-hidden="true" />
        <div>
          <h2>先选择当前训练岗位</h2>
          <p>转岗匹配需要以当前岗位知识库中的能力项为计算基准。</p>
        </div>
        <Link to="/courses?returnTo=%2Fcareer" className="career-match-select-role">选择当前岗位<ArrowRight aria-hidden="true" /></Link>
      </section>
    )
  }

  if (!recommendations.length) {
    return (
      <section className="career-match-empty" aria-label="暂无可训练的转岗推荐">
        <Target aria-hidden="true" />
        <div>
          <h2>暂无可立即训练的匹配岗位</h2>
          <p>当前岗位画像已读取，但暂未找到知识库就绪的其他方向。</p>
        </div>
        <Link to="/courses" className="career-match-select-role">查看当前岗位<ArrowRight aria-hidden="true" /></Link>
      </section>
    )
  }

  const [featured, ...secondary] = recommendations
  const isBusy = Boolean(activatingRoleId)

  return (
    <section className="career-match-panel" aria-label="画像驱动的转岗岗位推荐">
      <header className="career-match-context">
        <div>
          <span className="career-match-eyebrow"><Sparkles aria-hidden="true" />画像匹配结果</span>
          <h2>从「{currentRole.name}」出发的更短转岗路径</h2>
          <p>已比较 {currentRole.skills.length} 项岗位能力，找到 {recommendations.length} 个知识库就绪的训练方向。</p>
        </div>
        <span className="career-match-current"><CheckCircle2 aria-hidden="true" />当前岗位 · {currentRole.name}</span>
      </header>

      <article className="career-match-featured" aria-label={`最佳匹配岗位：${featured.role.name}`}>
        <div className="career-match-featured-cover">
          <img src={roleCoverImages[featured.role.id]} alt={`${featured.role.name}职业场景`} />
          <span className="career-match-cover-shade" aria-hidden="true" />
          <span className="career-match-best-label">最佳匹配</span>
          <strong>{featured.score}%</strong>
        </div>

        <div className="career-match-featured-body">
          <div className="career-match-role-heading">
            <div>
              <span>推荐转岗方向</span>
              <h3>{featured.role.name}</h3>
            </div>
            <strong>{featured.score}%<small>能力匹配</small></strong>
          </div>
          <p className="career-match-summary">{featured.role.summary}</p>
          <MatchBar score={featured.score} roleName={featured.role.name} />

          <div className="career-match-evidence-grid">
            <CareerLine icon={ShieldCheck} label="可复用能力" values={featured.sharedSkills} empty="基础课程可直接衔接" tone="green" limit={4} />
            <CareerLine icon={Route} label="关键差距" values={featured.gaps} empty="继续积累目标岗位项目" tone="gold" limit={4} />
          </div>

          <div className="career-match-featured-actions">
            <button type="button" disabled={isBusy} onClick={() => void enterTraining(featured)} className="career-match-primary">
              {activatingRoleId === featured.role.id ? <Loader2 className="career-match-spinner" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {activatingRoleId === featured.role.id ? "正在进入训练" : "进入该岗位训练"}
            </button>
            <RecruitmentLinks role={featured.role} />
          </div>
        </div>
      </article>

      {secondary.length > 0 && (
        <section className="career-match-secondary" aria-labelledby="career-match-secondary-title">
          <div className="career-match-secondary-heading">
            <div>
              <span>继续比较</span>
              <h3 id="career-match-secondary-title">其他匹配岗位</h3>
            </div>
            <small>{secondary.length} 个方向</small>
          </div>

          <div className={`career-match-secondary-grid ${compact ? "is-compact" : ""}`}>
            {secondary.map((item) => (
              <article key={item.role.id} className={`career-match-card ${activatingRoleId === item.role.id ? "is-activating" : ""}`}>
                <div className="career-match-card-cover">
                  <img src={roleCoverImages[item.role.id]} alt={`${item.role.name}职业场景`} loading="lazy" />
                  <span className="career-match-cover-shade" aria-hidden="true" />
                  <strong>{item.score}%</strong>
                </div>
                <div className="career-match-card-body">
                  <div className="career-match-card-title">
                    <h4>{item.role.name}</h4>
                    <span>{item.score}% 匹配</span>
                  </div>
                  <p>{item.role.summary}</p>
                  <MatchBar score={item.score} roleName={item.role.name} compact />
                  <div className="career-match-card-evidence">
                    <CareerLine icon={ShieldCheck} label="可复用" values={item.sharedSkills} empty="基础课程可衔接" tone="green" limit={3} />
                    <CareerLine icon={Route} label="需补齐" values={item.gaps} empty="继续积累岗位项目" tone="gold" limit={2} />
                  </div>
                </div>
                <div className="career-match-card-footer">
                  <button type="button" disabled={isBusy} onClick={() => void enterTraining(item)} className="career-match-secondary-action">
                    {activatingRoleId === item.role.id && <Loader2 className="career-match-spinner" aria-hidden="true" />}
                    {activatingRoleId === item.role.id ? "正在进入" : "进入训练"}
                  </button>
                  <RecruitmentLinks role={item.role} compact />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {error && <p role="alert" className="career-match-error">{error}</p>}
      <p className="career-match-disclaimer">招聘信息在新标签页打开，职位与任职要求以公开招聘平台实时页面为准。</p>
    </section>
  )
}

function MatchBar({ score, roleName, compact = false }: { score: number; roleName: string; compact?: boolean }) {
  return (
    <div className={`career-match-scorebar ${compact ? "is-compact" : ""}`} role="img" aria-label={`${roleName}能力匹配度 ${score}%`}>
      <i><b style={{ width: `${score}%` }} /></i>
    </div>
  )
}

function RecruitmentLinks({ role, compact = false }: { role: CareerRole; compact?: boolean }) {
  return (
    <div className={`career-match-links ${compact ? "is-compact" : ""}`} aria-label={`${role.name}招聘需求`}>
      {recruitmentLinks(role).map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`在${link.label}搜索${link.query}职位`}
          title={`搜索：${link.query}`}
          onClick={() => track("external_resource_open", link.event, link.query)}
        >
          {compact ? link.label : `在${link.label}查看需求`}<ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  )
}

function CareerLine({ icon: Icon, label, values, empty, tone, limit }: { icon: typeof Target; label: string; values: string[]; empty: string; tone: "green" | "gold"; limit: number }) {
  const visibleValues = values.slice(0, limit)
  const remaining = values.length - visibleValues.length
  const valueText = values.length ? `${visibleValues.join("、")}${remaining > 0 ? ` 等 ${values.length} 项` : ""}` : empty

  return (
    <div className={`career-match-line is-${tone}`}>
      <span><Icon aria-hidden="true" /></span>
      <div><strong>{label}</strong><p>{valueText}</p></div>
    </div>
  )
}
