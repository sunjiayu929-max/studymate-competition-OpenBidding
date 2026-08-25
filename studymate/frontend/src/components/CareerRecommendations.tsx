import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, BriefcaseBusiness, CheckCircle2, ExternalLink, Loader2, Route, ShieldCheck, Sparkles, Target } from "lucide-react"

import { ApiError, apiGet } from "@/lib/api"
import { careerDomains, type CareerRole, type DomainId } from "@/lib/domainCareerCatalog"
import { track } from "@/lib/track"
import { setCurrentCourse, type CourseInfo, useCurrentCourse } from "@/store/course"
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

function transferScore(current: CareerRole, candidate: CareerRole, sameDomain: boolean): TransferRole {
  const sharedSkills = candidate.skills.filter((skill) => current.skills.some((currentSkill) => sameAbility(skill, currentSkill)))
  const gaps = candidate.skills.filter((skill) => !sharedSkills.includes(skill))
  const skillRate = candidate.skills.length ? sharedSkills.length / candidate.skills.length : 0
  const baseRate = candidate.baseCourses.length
    ? candidate.baseCourses.filter((course) => current.baseCourses.includes(course)).length / candidate.baseCourses.length
    : 0
  const score = Math.min(98, Math.round(20 + skillRate * 48 + baseRate * 20 + (sameDomain ? 12 : 0)))
  return { role: candidate, domainId: "ai", score, sharedSkills, gaps }
}

function recruitmentLinks(role: CareerRole) {
  const keyword = encodeURIComponent(role.name.trim())
  return [
    { label: "BOSS 直聘", url: `https://www.zhipin.com/web/geek/job?query=${keyword}&city=100010000`, event: "boss_jobs" },
    { label: "智联招聘", url: `https://sou.zhaopin.com/?jl=530&kw=${keyword}&kt=3`, event: "zhaopin_jobs" },
    { label: "前程无忧", url: `https://we.51job.com/pc/search?keyword=${keyword}&searchType=2`, event: "51job_jobs" },
  ].map((item) => ({ ...item, query: role.name }))
}

export function CareerRecommendations({ profileVersion: _profileVersion = 0, compact = false }: { profileVersion?: number; compact?: boolean }) {
  const navigate = useNavigate()
  const currentRole = useTargetRole()
  const course = useCurrentCourse()
  const [activatingRoleId, setActivatingRoleId] = useState("")
  const [error, setError] = useState("")

  const recommendations = useMemo<TransferRole[]>(() => {
    if (!currentRole) return []
    const currentDomainId = careerDomains.find((item) => item.roles.some((current) => current.id === currentRole.id))?.id
    return careerDomains.flatMap((domain) => domain.roles
      .filter((role) => role.id !== currentRole.id && role.knowledgeBaseState === "ready")
      .map((role) => ({ ...transferScore(currentRole, role, domain.id === currentDomainId), domainId: domain.id })))
      .sort((a, b) => b.score - a.score)
      .slice(0, compact ? 2 : 4)
  }, [compact, currentRole])

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
      <section className="rounded-[22px] border border-dashed border-[#C7D2D8] bg-[#F5F8FA] p-6 text-center">
        <Target className="mx-auto size-6 text-[#315E83]" />
        <h2 className="mt-3 text-base font-bold text-[#18232D]">先选择当前训练岗位</h2>
        <p className="mt-1 text-xs leading-5 text-[#66717B]">转岗匹配会以当前岗位知识库中的能力项为基准计算。</p>
        <Link to="/courses?returnTo=%2Fcareer" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-xs font-bold text-white hover:bg-[#193B50]">选择当前岗位<ArrowRight className="size-3.5" /></Link>
      </section>
    )
  }

  return (
    <section className="rounded-[24px] border border-[#C7D2D8] bg-[#F5F8FA] p-4 shadow-[0_10px_28px_rgba(36,76,102,.06)] sm:p-5" aria-label="转岗岗位推荐">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[#315E83]"><Sparkles className="size-3.5" />知识库岗位匹配</span>
          <h2 className="mt-1 text-base font-bold text-[#18232D]">从「{currentRole.name}」可平移的岗位方向</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#66717B]">匹配度依据两类岗位知识库的共通能力与基础课程计算；开始训练前会再次校验目标岗位知识库。</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-xl border border-[#C9D1CB] bg-[#FFFEFA] px-3 py-1.5 text-[10px] font-bold text-[#557052]"><CheckCircle2 className="size-3" />当前训练 · {currentRole.name || course?.name}</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
        {recommendations.map((item) => (
          <article key={item.role.id} className="rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA] p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><BriefcaseBusiness className="size-4" /></span>
              <span className="rounded-full bg-[#244C66] px-2.5 py-1 text-[10px] font-bold text-white">匹配 {item.score}%</span>
            </div>
            <h3 className="mt-3 text-sm font-bold text-[#18232D]">{item.role.name}</h3>
            <p className="mt-1.5 min-h-9 text-[11px] leading-4 text-[#66717B]">{item.role.summary}</p>
            <div className="mt-3 space-y-2 border-t border-[#E3DED3] pt-3">
              <CareerLine icon={ShieldCheck} label="可复用能力" values={item.sharedSkills} empty="基础课程可衔接" tone="green" />
              <CareerLine icon={Route} label="转岗重点" values={item.gaps.slice(0, 2)} empty="继续积累岗位项目" tone="gold" />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" disabled={Boolean(activatingRoleId)} onClick={() => void enterTraining(item)} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#244C66] px-3 text-[10px] font-bold text-white hover:bg-[#193B50] disabled:opacity-50">{activatingRoleId === item.role.id ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}{activatingRoleId === item.role.id ? "正在进入" : "开始转岗训练"}</button>
              <span className="text-[9px] font-semibold text-[#557052]">知识库已导入</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E3DED3] pt-3">
              {recruitmentLinks(item.role).map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer noopener" onClick={() => track("external_resource_open", link.event, link.query)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-1.5 text-[10px] font-bold text-[#59636B] hover:border-[#9FB1BC] hover:text-[#315E83]">在{link.label}查看需求<ExternalLink className="size-3" /></a>)}
            </div>
          </article>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] px-3 py-2 text-[11px] text-[#9A4E35]">{error}</p>}
      <p className="mt-3 text-[10px] leading-4 text-[#8A8172]">招聘链接会在新标签页打开；职位数量、城市、薪资与任职要求以公开招聘平台实时页面为准。</p>
    </section>
  )
}

function CareerLine({ icon: Icon, label, values, empty, tone }: { icon: typeof Target; label: string; values: string[]; empty: string; tone: "green" | "gold" }) {
  const colors = tone === "green" ? "bg-[#E9EEE6] text-[#557052]" : "bg-[#F4ECD8] text-[#8E6925]"
  return <div className="flex items-start gap-2 text-[10px] leading-4"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ${colors}`}><Icon className="size-3" /></span><span><strong className="mr-1 text-[#59636B]">{label}</strong><span className="text-[#7A817F]">{values.length ? values.join("、") : empty}</span></span></div>
}
