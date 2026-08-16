import { Link } from "react-router-dom"
import { ArrowLeft, BookOpen, Library, Sparkles } from "lucide-react"
import { useCurrentCourse } from "@/store/course"

export function ShowcaseCourseGuard() {
  const course = useCurrentCourse()
  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[980px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <section className="grid min-h-[calc(100dvh-40px)] place-items-center rounded-[28px] border border-[#D7D1C4] bg-[#FFFEFA] p-5 shadow-[0_16px_42px_rgba(24,35,45,.075)] sm:p-8">
          <div className="w-full max-w-xl text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#D8C9A8] bg-[#F4ECD8] text-[#8E6925]"><BookOpen className="size-7" /></span>
            <span className="mt-6 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[.14em] text-[#8E6925]"><Sparkles className="size-3.5" />前端课程目录预览</span>
            <h1 className="mt-2 text-2xl font-bold tracking-[-.03em] text-[#18232D] sm:text-3xl">《{course?.name || "当前岗位"}》正在准备专属数据</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#66717B]">这门课程已加入 StudyMate 课程目录，目前用于展示教材方向与学习场景。知识库、助教、资源生成和测验数据将在课程接入后开放。</p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link to="/courses" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-[#FFFEFA] hover:bg-[#193B50]"><Library className="size-3.5" />返回课程目录</Link>
              <Link to="/" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-5 text-xs font-bold text-[#59636B] hover:bg-[#F1EDE4]"><ArrowLeft className="size-3.5" />回到学习首页</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
