import { Library } from "lucide-react"

import { BiliVideos } from "@/components/BiliVideos"
import { RencaiyaCourses } from "@/components/RencaiyaCourses"
import { useCurrentCourse } from "@/store/course"

export function ExternalLearningResources({
  keyword,
  conceptTitle,
}: {
  keyword: string
  conceptTitle?: string | null
}) {
  const course = useCurrentCourse()
  return (
    <section className="mt-8 border-t border-[#E3DED3] pt-6" aria-label="外部学习资源">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]"><Library className="size-3.5" />外部学习资源 · 精确匹配优先，相关内容补充</div>
      <BiliVideos keyword={keyword} conceptTitle={conceptTitle} courseName={course?.name} />
      <RencaiyaCourses keyword={conceptTitle || keyword} />
    </section>
  )
}
