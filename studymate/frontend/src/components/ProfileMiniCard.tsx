import { Link } from "react-router-dom"
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts"
import { motion } from "framer-motion"
import { UserCircle2, ExternalLink, Target, AlertTriangle, Clock, Zap } from "lucide-react"

interface Goals {
  primary?: string
  deadline?: string
  target_topics?: string[]
}
interface WeakPoints {
  topics?: string[]
  error_types?: string[]
}
interface Pace {
  hours_per_week?: number
  intensity?: string
}

export interface ProfileMiniData {
  version: number
  dims: {
    knowledge_base: Record<string, number>
    cognitive_style: Record<string, number>
    preference: Record<string, number>
    employment_skills: Record<string, number>
    goals: Goals
    weak_points: WeakPoints
    pace: Pace
  }
}

const labelMap: Record<string, string> = {
  math: "数学", programming: "编程", statistics: "统计", english: "英语",
  subject_prior: "领域先验", ml_prior: "ML 先验",  // ml_prior 兼容旧画像
  visual: "视觉", reading: "阅读", hands_on: "实操", auditory: "听觉",
  document: "文档", mindmap: "导图", quiz: "题目", code: "代码", video: "视频",
  algorithms: "算法建模", data_ai: "数据AI", systems: "系统网络", engineering: "工程实践", professional: "职业素养",
}

const employmentLabelMap: Record<string, string> = {
  programming: "编程实现", algorithms: "算法建模", data_ai: "数据AI",
  systems: "系统网络", engineering: "工程实践", professional: "职业素养",
}

const intensityLabel: Record<string, string> = {
  low: "轻量",
  medium: "适中",
  high: "强化",
}

const RADARS: Array<{ key: keyof ProfileMiniData["dims"]; title: string; emoji: string; color: string }> = [
  { key: "knowledge_base", title: "知识基础", emoji: "📚", color: "#315E83" },
  { key: "cognitive_style", title: "认知风格", emoji: "🧠", color: "#B85C3E" },
  { key: "preference", title: "资源偏好", emoji: "🎯", color: "#6F8A69" },
  { key: "employment_skills", title: "就业技能", emoji: "💼", color: "#7E6B83" },
]

interface ProfileMiniCardProps {
  profile: ProfileMiniData | null
  /** compact: 侧边栏窄场景（雷达竖排 + 标签竖排） */
  variant?: "full" | "compact"
}

export function ProfileMiniCard({ profile, variant = "full" }: ProfileMiniCardProps) {
  const compact = variant === "compact"

  if (!profile) {
    return (
      <div className={`rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] ${compact ? "p-4" : "p-6"}`}>
        <div className="flex items-center gap-2 mb-2">
          <UserCircle2 className={compact ? "size-4 text-[#315E83]" : "size-5 text-[#315E83]"} />
          <h2 className={`font-semibold ${compact ? "text-sm" : ""}`}>
            {compact ? "学习者画像" : "学习者画像 · 驱动 Agent 生成"}
          </h2>
        </div>
        <p className={`${compact ? "text-xs" : "text-sm"} text-[var(--muted-foreground)] mb-3`}>
          {compact ? "建立画像后助教能更精准辅导你" : "画像还没建立。Agent 当前会用默认参数生成内容；建立画像后，难度、风格、资源偏好都会个性化。"}
        </p>
        <Link
          to="/profile"
          className={`inline-flex items-center gap-1.5 ${compact ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5"} rounded-lg bg-[#244C66] text-white transition-colors hover:bg-[#193A50]`}
        >
          去对话建画像 <ExternalLink className={compact ? "size-3" : "size-3.5"} />
        </Link>
      </div>
    )
  }

  const { dims, version } = profile

  return (
    <motion.div
      key={`profile-${version}`}
      initial={{ scale: 0.98, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] ${compact ? "p-3" : "p-5"}`}
    >
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-4"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <UserCircle2 className={compact ? "size-4 shrink-0 text-[#315E83]" : "size-5 text-[#315E83]"} />
          <h2 className={`font-semibold ${compact ? "text-sm truncate" : "text-base"}`}>学习者画像</h2>
          <span className="shrink-0 rounded-full bg-[#E7EDF3] px-2 py-0.5 font-mono text-xs text-[#315E83]">
            v{version}
          </span>
          {!compact && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] ml-1">
              <Zap className="size-3 text-amber-500" />
              将自动调整各项学习能力的内容策略
            </span>
          )}
        </div>
        <Link
          to="/profile"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[#315E83]"
        >
          {compact ? "" : "调整画像 "}<ExternalLink className="size-3" />
        </Link>
      </div>

      <div className={compact ? "mb-2 grid grid-cols-1 gap-2" : "mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4"}>
        {RADARS.map(({ key, title, emoji, color }) => {
          const raw = (dims[key] as Record<string, number> | undefined) || {}
          const labels = key === "employment_skills" ? employmentLabelMap : labelMap
          const chartData = Object.entries(raw).map(([k, v]) => ({
            dim: labels[k] || labelMap[k] || k,
            value: typeof v === "number" ? v : 0,
          }))
          return (
            <div key={key} className={`rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] ${compact ? "p-2" : "p-3"}`}>
              <div className={`${compact ? "text-xs" : "text-sm"} font-medium mb-1 text-center`}>
                <span className="mr-1">{emoji}</span>{title}
              </div>
              <ResponsiveContainer width="100%" height={compact ? 130 : 180} minWidth={0}>
                <RadarChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="dim" tick={{ fontSize: compact ? 9 : 11, fill: "var(--muted-foreground)" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.35} animationDuration={500} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>

      <div className={compact ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-3 md:grid-cols-3"}>
        <TagCard
          icon={<Target className="size-4" />}
          color="indigo"
          label="学习目标"
          primary={dims.goals?.primary}
          secondary={dims.goals?.deadline}
          chips={dims.goals?.target_topics}
          compact={compact}
        />
        <TagCard
          icon={<AlertTriangle className="size-4" />}
          color="amber"
          label="薄弱点"
          chips={dims.weak_points?.topics}
          extraChips={dims.weak_points?.error_types}
          compact={compact}
        />
        <TagCard
          icon={<Clock className="size-4" />}
          color="emerald"
          label="学习节奏"
          primary={dims.pace?.hours_per_week ? `每周 ${dims.pace.hours_per_week} 小时` : undefined}
          secondary={dims.pace?.intensity ? (intensityLabel[dims.pace.intensity] || dims.pace.intensity) : undefined}
          compact={compact}
        />
      </div>
    </motion.div>
  )
}

function TagCard({
  icon, color, label, primary, secondary, chips, extraChips, compact,
}: {
  icon: React.ReactNode
  color: "indigo" | "amber" | "emerald"
  label: string
  primary?: string
  secondary?: string
  chips?: string[]
  extraChips?: string[]
  compact?: boolean
}) {
  const colorMap = {
    indigo: { text: "text-[#315E83]", bg: "bg-[#E7EDF3]", chip: "bg-[#DCE6EE] text-[#315E83]" },
    amber: { text: "text-[#9A4E35]", bg: "bg-[#F4E8E2]", chip: "bg-[#EFDCD2] text-[#9A4E35]" },
    emerald: { text: "text-[#557052]", bg: "bg-[#E9EEE6]", chip: "bg-[#DDE7D9] text-[#557052]" },
  }[color]
  const hasAny = primary || secondary || (chips && chips.length) || (extraChips && extraChips.length)
  return (
    <div className={`${colorMap.bg} rounded-xl border border-[#D7D1C4] ${compact ? "p-2" : "p-3"}`}>
      <div className={`flex items-center gap-1.5 ${compact ? "text-[11px]" : "text-xs"} font-semibold mb-1 ${colorMap.text}`}>
        {icon}
        {label}
      </div>
      {!hasAny ? (
        <div className="text-xs text-[var(--muted-foreground)] italic">等待对话补全</div>
      ) : (
        <>
          {primary && <div className="text-sm font-medium leading-snug">{primary}</div>}
          {secondary && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{secondary}</div>}
          {chips && chips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {chips.map((c, i) => (
                <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded ${colorMap.chip}`}>{c}</span>
              ))}
            </div>
          )}
          {extraChips && extraChips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {extraChips.map((c, i) => (
                <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded ${colorMap.chip} opacity-80`}>{c}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
