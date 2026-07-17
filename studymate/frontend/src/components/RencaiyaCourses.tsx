import { useEffect, useState } from "react"
import { BookOpenCheck, ExternalLink, GraduationCap, Loader2, Users } from "lucide-react"

import { apiGet } from "@/lib/api"
import { track } from "@/lib/track"
import { useCurrentCourse } from "@/store/course"

interface RencaiyaCourse {
  course_id: number
  title: string
  summary: string
  cover: string
  difficulty: string
  learned_person: number
  teachers: string[]
  provider: string
  url: string
}

interface RencaiyaCoursesResponse {
  provider: string
  source_state: "live" | "cache" | "fallback"
  match_level: "exact" | "related" | "course" | "fallback"
  resolved_query: string
  course_name: string
  platform_url: string
  items: RencaiyaCourse[]
}

export function RencaiyaCourses({ keyword }: { keyword: string }) {
  const course = useCurrentCourse()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RencaiyaCoursesResponse | null>(null)

  useEffect(() => {
    let alive = true
    const frame = window.requestAnimationFrame(() => {
      setLoading(true)
      const query = new URLSearchParams({ limit: "6" })
      if (course?.id) query.set("course_id", String(course.id))
      if (keyword.trim()) query.set("keyword", keyword.trim())
      void apiGet<RencaiyaCoursesResponse>(`/rencaiya/courses?${query}`)
        .then((result) => { if (alive) setData(result) })
        .catch(() => {
          if (alive) setData({
            provider: "讯飞人才呀",
            source_state: "fallback",
            match_level: "fallback",
            resolved_query: keyword.trim(),
            course_name: course?.name || "当前课程",
            platform_url: "http://rencaiya.vip/college/allcourse",
            items: [],
          })
        })
        .finally(() => { if (alive) setLoading(false) })
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [course?.id, course?.name, keyword])

  const platformUrl = data?.platform_url || "http://rencaiya.vip/college/allcourse"

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[#27343D]">
          <span className="grid size-8 place-items-center rounded-xl border border-[#B9C9D3] bg-[#E7EDF3] text-[#315E83]"><GraduationCap className="size-4" /></span>
          讯飞人才呀课程
          <span className="text-xs font-normal text-[var(--muted-foreground)]/70">
            · {data?.match_level === "exact" ? "知识点直接匹配" : data?.match_level === "related" ? "知识点相关匹配" : "精确匹配优先"}
          </span>
        </h2>
        <a href={platformUrl} target="_blank" rel="noreferrer noopener" onClick={() => track("external_resource_open", "rencaiya_platform", data?.course_name || course?.name || null)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#315E83] hover:underline">
          查看全部课程<ExternalLink className="size-3" />
        </a>
      </div>

      {loading && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CFC8B9] bg-[#F8F6F0] py-8 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" /> 正在人才呀匹配课程…
        </div>
      )}

      {!loading && data?.items.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <a
              key={item.course_id}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => track("external_resource_open", "rencaiya_course", String(item.course_id), { course_name: data.course_name, title: item.title })}
              className="paper-lift group overflow-hidden rounded-[18px] border border-[#C7D2D8] bg-[#FFFEFA] hover:border-[#8FA8B6]"
            >
              <div className="relative aspect-[16/8.5] overflow-hidden bg-[#E7EDF3]">
                {item.cover ? (
                  <img src={item.cover} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="grid size-full place-items-center text-[#315E83]"><BookOpenCheck className="size-8" /></div>
                )}
                <span className="absolute left-2 top-2 rounded-full border border-white/60 bg-[#244C66]/92 px-2 py-1 text-[9px] font-bold text-white">讯飞人才呀</span>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-semibold leading-5 text-[#18232D] group-hover:text-[#315E83]">{item.title}</p>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-[#8A918F]" />
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-8 text-[11px] leading-4 text-[#66717B]">{item.summary || "前往人才呀平台查看课程介绍与学习路径。"}</p>
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-[#7A817F]">
                  <span className="rounded-full bg-[#E7EDF3] px-2 py-0.5 font-bold text-[#315E83]">{item.difficulty}</span>
                  <span className="inline-flex items-center gap-1"><Users className="size-3" />{item.learned_person > 0 ? `${item.learned_person} 人学习` : "外部平台课程"}</span>
                </div>
                {item.teachers.length > 0 && <p className="mt-1.5 truncate text-[10px] text-[#8A8172]">讲师：{item.teachers.join("、")}</p>}
              </div>
            </a>
          ))}
        </div>
      ) : null}

      {!loading && (!data || data.items.length === 0) && (
        <a href={platformUrl} target="_blank" rel="noreferrer noopener" className="paper-lift flex items-center gap-3 rounded-[18px] border border-[#C7D2D8] bg-[#FFFEFA] p-4 hover:bg-[#F5F8FA]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><GraduationCap className="size-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm text-[#18232D]">暂未找到与「{data?.resolved_query || keyword}」直接相关的课程</strong><span className="mt-0.5 block text-xs text-[#66717B]">已隐藏课程级泛化结果，可前往人才呀平台继续查找</span></span>
          <ExternalLink className="size-4 text-[#66717B]" />
        </a>
      )}

      <p className="mt-2 text-[10px] leading-4 text-[#8A8172]">课程来源于外部人才培养平台，点击后将在新标签页打开，具体内容与登录状态以人才呀平台为准。</p>
    </div>
  )
}
