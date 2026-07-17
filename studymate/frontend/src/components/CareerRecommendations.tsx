import { useEffect, useState } from "react"
import { BriefcaseBusiness, ExternalLink, Loader2, Route, Sparkles, Target } from "lucide-react"

import { apiGet } from "@/lib/api"
import { track } from "@/lib/track"
import { useCurrentCourse } from "@/store/course"

interface CareerItem {
  post_id: number
  title: string
  summary: string
  course_count: number
  project_count: number
  learned_person: number
  match_score: number
  strengths: string[]
  gaps: string[]
  provider: string
  url: string
}
interface CareerResponse {
  provider: string
  source_state: "live" | "cache" | "fallback"
  platform_url: string
  current_course: string
  historical_courses: string[]
  evidence_note: string
  items: CareerItem[]
}

export function CareerRecommendations({ profileVersion = 0, compact = false }: { profileVersion?: number; compact?: boolean }) {
  const course = useCurrentCourse()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<CareerResponse | null>(null)

  useEffect(() => {
    let alive = true
    const frame = window.requestAnimationFrame(() => {
      setLoading(true)
      const query = new URLSearchParams({ limit: compact ? "3" : "3" })
      if (course?.id) query.set("course_id", String(course.id))
      void apiGet<CareerResponse>(`/careers/recommendations?${query}`)
        .then((result) => { if (alive) setData(result) })
        .catch(() => { if (alive) setData(null) })
        .finally(() => { if (alive) setLoading(false) })
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [compact, course?.id, profileVersion])

  if (loading) {
    return (
      <section className="rounded-[22px] border border-dashed border-[#C7D2D8] bg-[#F8F6F0] p-5" role="status">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#66717B]"><Loader2 className="size-4 animate-spin" />正在结合课程与画像匹配岗位…</div>
      </section>
    )
  }

  if (!data) {
    return (
      <a href="http://rencaiya.vip/college/postcourse" target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 rounded-[22px] border border-[#C7D2D8] bg-[#E7EDF3] p-4 hover:bg-[#DCE6EC]">
        <span className="grid size-10 place-items-center rounded-xl bg-[#244C66] text-[#F2C968]"><BriefcaseBusiness className="size-5" /></span>
        <span className="min-w-0 flex-1"><strong className="block text-sm text-[#18232D]">查看讯飞人才呀岗位课程</strong><span className="mt-0.5 block text-xs text-[#596A75]">岗位推荐暂时不可用，可前往外部平台浏览</span></span>
        <ExternalLink className="size-4 text-[#315E83]" />
      </a>
    )
  }

  return (
    <section className="rounded-[24px] border border-[#C7D2D8] bg-[#F5F8FA] p-4 shadow-[0_10px_28px_rgba(36,76,102,.06)] sm:p-5" aria-label="就业岗位推荐">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-[#315E83]"><Sparkles className="size-3.5" />讯飞人才呀 · 就业导向</span>
          <h2 className="mt-1 text-base font-bold text-[#18232D]">适配《{data.current_course}》的岗位方向</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#66717B]">{data.evidence_note}</p>
        </div>
        <a href={data.platform_url} target="_blank" rel="noreferrer noopener" onClick={() => track("external_resource_open", "rencaiya_career_platform", data.current_course)} className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#B9C9D3] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#315E83] hover:bg-[#E7EDF3]">岗位课程库<ExternalLink className="size-3" /></a>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
        {data.items.map((item, index) => (
          <a
            key={item.post_id}
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => track("career_recommendation_open", "rencaiya_job", String(item.post_id), { title: item.title, match_score: item.match_score, rank: index + 1 })}
            className="paper-lift group rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 hover:border-[#9FB1BC]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><BriefcaseBusiness className="size-4" /></span>
              <span className="rounded-full bg-[#244C66] px-2.5 py-1 text-[10px] font-bold text-white">匹配 {item.match_score}%</span>
            </div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-[#18232D] group-hover:text-[#315E83]">{item.title}</h3>
              <ExternalLink className="size-3.5 shrink-0 text-[#8A918F]" />
            </div>
            <p className="mt-1.5 line-clamp-3 min-h-12 text-[11px] leading-4 text-[#66717B]">{item.summary}</p>
            <div className="mt-3 space-y-2 border-t border-[#E3DED3] pt-3">
              <CareerLine icon={Target} label="已有优势" values={item.strengths} empty="等待画像补充" tone="green" />
              <CareerLine icon={Route} label="建议补齐" values={item.gaps} empty="继续积累课程证据" tone="gold" />
            </div>
            <p className="mt-3 text-[10px] text-[#8A8172]">人才呀包含 {item.course_count} 门岗位课程{item.project_count > 0 ? ` · ${item.project_count} 个实训项目` : ""}</p>
          </a>
        ))}
      </div>
    </section>
  )
}

function CareerLine({ icon: Icon, label, values, empty, tone }: { icon: typeof Target; label: string; values: string[]; empty: string; tone: "green" | "gold" }) {
  const colors = tone === "green" ? "bg-[#E9EEE6] text-[#557052]" : "bg-[#F4ECD8] text-[#8E6925]"
  return (
    <div className="flex items-start gap-2 text-[10px] leading-4">
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ${colors}`}><Icon className="size-3" /></span>
      <span><strong className="mr-1 text-[#59636B]">{label}</strong><span className="text-[#7A817F]">{values.length ? values.join("、") : empty}</span></span>
    </div>
  )
}
