import { useState } from "react"
import { ArrowRight, BookOpenCheck, Search } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ExternalLearningResources } from "@/components/ExternalLearningResources"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import "./LearningResources.css"

export function LearningResources() {
  useTrackPage("learning_resources")
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const isFde = targetRole?.id === "fde" || /FDE|前线部署工程师/.test(course?.name || "")
  const roleName = targetRole?.name || course?.name || "目标岗位"
  const initialKeyword = isFde
    ? "FDE 前线部署工程师 现场交付 部署验收"
    : targetRole?.sampleTasks?.[0] || targetRole?.skills?.[0] || course?.name || "岗位能力训练"
  const [draft, setDraft] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [hasSearched, setHasSearched] = useState(false)

  return (
    <main className="app-page paper-theme lr-station min-h-dvh pb-10">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="resources" appearance="paper" />

        <section className="lr-catalog-hero mt-3 rounded-[20px] border px-4 py-5 sm:px-6" aria-labelledby="learning-resources-title">
          <div className="lr-catalog-intro min-w-0">
            <div className="lr-catalog-eyebrow"><BookOpenCheck /> 岗位资源目录 <span>{roleName}</span></div>
            <h1 id="learning-resources-title">为当前岗位找到可信学习资料</h1>
            <p>搜索真实书籍、论文、公开文档与讲解视频，按来源和相关度快速筛选。</p>
          </div>
          <form
            className="lr-catalog-search"
            onSubmit={(event) => {
              event.preventDefault()
              if (draft.trim()) {
                setKeyword(draft.trim())
                setHasSearched(true)
              }
            }}
          >
            <label>
              <Search aria-hidden="true" />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="岗位能力资源关键词"
                placeholder="输入岗位技能或任务，例如：部署验收"
              />
            </label>
            <button type="submit">搜索资源 <ArrowRight aria-hidden="true" /></button>
          </form>
        </section>

        <section className="lr-station-content mt-3 rounded-[20px] border px-4 pb-6 sm:px-6" aria-label="岗位学习资源目录">
          <ExternalLearningResources
            keyword={keyword}
            conceptTitle={keyword}
            variant="catalog"
            catalogQuery={hasSearched ? keyword : ""}
          />
        </section>
      </div>
    </main>
  )
}
