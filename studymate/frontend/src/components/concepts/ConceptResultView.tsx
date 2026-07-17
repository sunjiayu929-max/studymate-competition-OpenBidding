/**
 * 可视讲解结果渲染：AI 动画/黑板讲课 + 外部学习资源。
 * 由 /concept 页（ConceptDemo）与多 Agent 工作台「可视讲解」卡共用，
 * 保证两处表现完全一致（单一真相，改一处两处生效）。
 */
import { Suspense } from "react"
import { Link } from "react-router-dom"
import { Loader2, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CONCEPT_ANIMS } from "@/components/concepts/registry"
import { ConceptPlayer } from "@/components/concepts/ConceptPlayer"
import { GenericConceptAnim } from "@/components/concepts/GenericConceptAnim"
import { BlackboardAnim } from "@/components/concepts/BlackboardAnim"
import { ExternalLearningResources } from "@/components/ExternalLearningResources"
import { ConceptAnimationBoundary, ConceptAnimationLoading } from "@/components/concepts/ConceptAnimationState"
import type { ExplainResult } from "@/lib/concept"

export function ConceptResultView({
  result,
  loading,
  lastQuery,
}: {
  result: ExplainResult | null
  /** 正在请求讲解 */
  loading: boolean
  /** 已提交的问题，用于 B 站视频检索 */
  lastQuery: string
}) {
  const matched = result?.matched && result.key ? CONCEPT_ANIMS.find((c) => c.key === result.key) : null
  const MatchedAnim = matched?.component

  return (
    <>
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> 正在匹配最合适的动画…
        </div>
      )}

      {/* 命中手写精品动画 */}
      {!loading && matched && MatchedAnim && (
        <div className="mb-8">
          <ConceptAnimationBoundary key={matched.key} title={matched.title}>
            <Suspense fallback={<ConceptAnimationLoading title={matched.title} />}>
              <ConceptPlayer
                title={matched.title}
                course={matched.course}
                badgeClass={matched.badgeClass}
                intro={result?.intro}
                lectureReady={matched.lectureReady}
                disablePanZoom={!matched.cssZoom}
              >
                <MatchedAnim />
              </ConceptPlayer>
            </Suspense>
          </ConceptAnimationBoundary>
        </div>
      )}

      {/* 没命中手写动画 → AI 现编排的通用模板动画 */}
      {!loading && result && !result.matched && result.script && (
        <div className="mb-8">
          {result.script.visual === "board" ? (
            // 黑板=视频化讲课，自带课题与播放器外壳，不套 ConceptPlayer 卡片
            <BlackboardAnim script={result.script} />
          ) : (
            <ConceptPlayer
              title={result.script.concept}
              course="AI 现编"
              badgeClass="border border-[#D5CED8] bg-[#EEE9EF] text-[#756579]"
              intro={result.intro}
            >
              <GenericConceptAnim script={result.script} />
            </ConceptPlayer>
          )}
          <p className="mt-2 text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
            这是 AI 根据你的问题现编排的讲解。想再深入？
            <Link to="/tutor" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
              <MessageCircle className="size-3.5" /> 去问 AI 助教
            </Link>
          </p>
        </div>
      )}

      {/* 极端情况：连脚本都没有（理论上不会发生） */}
      {!loading && result && !result.matched && !result.script && (
        <div className="mb-8 rounded-[20px] border border-[#D7D1C4] bg-[#FBF8F0] p-5 text-sm">
          <p className="mb-3 leading-6 text-[#243746]">{result.intro}</p>
          <Link to="/tutor">
            <Button size="sm" variant="outline">
              <MessageCircle className="size-4" /> 去问 AI 助教
            </Button>
          </Link>
        </div>
      )}

      {/* B 站 + 讯飞人才呀 —— 自产讲解之外的外部资源补充 */}
      {!loading && result && lastQuery && (
        <ExternalLearningResources
          keyword={lastQuery}
          conceptTitle={result.title || result.script?.concept || matched?.title}
        />
      )}
    </>
  )
}
