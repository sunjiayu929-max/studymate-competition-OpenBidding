import { useState } from "react"
import { Compass, Search } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ExternalLearningResources } from "@/components/ExternalLearningResources"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"

export function LearningResources() {
  useTrackPage("learning_resources")
  const course = useCurrentCourse()
  const [draft, setDraft] = useState(course?.name || "梯度下降")
  const [keyword, setKeyword] = useState(course?.name || "梯度下降")

  return (
    <main className="app-page paper-theme min-h-dvh px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AppTopbar current="resources" appearance="paper" />
        <section className="mt-5 rounded-[28px] border border-[#D7D1C4] bg-[#FFFEFA] p-5 shadow-[0_18px_48px_rgba(24,35,45,.07)] sm:p-7">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[.12em] text-[#6F8A69]"><Compass className="size-4" />DISCOVER</span>
            <h1 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#18232D]">按知识点寻找真实学习资源</h1>
            <p className="mt-2 text-xs leading-6 text-[#66717B]">聚合高相关视频与课程，保留外部来源；关键词默认继承当前课程，也可以单独探索。</p>
          </div>
          <form
            className="mt-5 flex max-w-2xl gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (draft.trim()) setKeyword(draft.trim())
            }}
          >
            <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#FAF8F2] px-3">
              <Search className="size-4 text-[#7A817F]" />
              <input value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-[#18232D] outline-none" aria-label="学习资源关键词" />
            </label>
            <button type="submit" className="rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white hover:bg-[#1D4058]">搜索资源</button>
          </form>
          <ExternalLearningResources keyword={keyword} conceptTitle={keyword} />
        </section>
      </div>
    </main>
  )
}
