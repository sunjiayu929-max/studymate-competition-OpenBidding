import { motion } from "framer-motion"
import { Target, AlertTriangle, Clock } from "lucide-react"

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

interface ProfileTagsProps {
  goals: Goals
  weakPoints: WeakPoints
  pace: Pace
}

const intensityLabel: Record<string, string> = {
  low: "轻量",
  medium: "适中",
  high: "强化",
}

export function ProfileTags({ goals, weakPoints, pace }: ProfileTagsProps) {
  return (
    <div className="space-y-3">
      <Section icon={<Target className="size-4" />} title="目标">
        {goals.primary ? (
          <>
            <div className="text-sm">{goals.primary}</div>
            {goals.deadline && (
              <div className="text-xs text-[#7A817F]">{goals.deadline}</div>
            )}
            <TagRow tags={goals.target_topics} />
          </>
        ) : (
          <Empty />
        )}
      </Section>

      <Section icon={<AlertTriangle className="size-4" />} title="薄弱点">
        {(weakPoints.topics?.length || 0) > 0 ? (
          <>
            <TagRow tags={weakPoints.topics} color="amber" />
            <TagRow tags={weakPoints.error_types} color="rose" />
          </>
        ) : (
          <Empty />
        )}
      </Section>

      <Section icon={<Clock className="size-4" />} title="节奏">
        {pace.hours_per_week ? (
          <div className="text-sm">
            每周 <strong>{pace.hours_per_week} 小时</strong> · <span className="text-[#7A817F]">{intensityLabel[pace.intensity || "medium"] || pace.intensity}</span>
          </div>
        ) : (
          <Empty />
        )}
      </Section>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#CFC8B9] bg-[#FFFEFA] p-3.5">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#7A817F]">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function TagRow({ tags, color = "indigo" }: { tags?: string[]; color?: "indigo" | "amber" | "rose" }) {
  if (!tags?.length) return null
  const colorMap = {
    indigo: "bg-[#E7EDF3] text-[#315E83]",
    amber: "bg-[#F4ECD8] text-[#8E6925]",
    rose: "bg-[#F4E8E2] text-[#9A4E35]",
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
        <motion.span
          key={`${t}-${i}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${colorMap[color]}`}
        >
          {t}
        </motion.span>
      ))}
    </div>
  )
}

function Empty() {
  return <div className="text-xs italic text-[#8A8172]">等待对话补全</div>
}
