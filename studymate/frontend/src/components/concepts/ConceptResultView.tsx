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

      {/* B 站与公开学习资源 —— 自产讲解之外的外部资源补充 */}
      {!loading && result && lastQuery && (
        <ExternalLearningResources
          keyword={lastQuery}
          conceptTitle={result.title || result.script?.concept || matched?.title}
        />
      )}
    </>
  )
}

function ConceptVideoCard({ video }: { video: ConceptVideoResult }) {
  const ready = video.status === "succeeded" && Boolean(video.video_url)
  const failed = video.status === "failed" || video.status === "partial_failed"
  const segments = video.segments || []
  const failureDetails = segments
    .filter((segment) => segment.status === "failed" && segment.message)
    .map((segment) => `片段 ${segment.index}：${segment.message}`)
  return (
    <div className="mt-1 space-y-4">
      {ready ? (
        <div className="overflow-hidden rounded-[18px] border border-[#C7D2D8] bg-[#18232D]">
          <video className="aspect-video w-full bg-black object-contain" controls preload="metadata" src={video.video_url}>
            您的浏览器不支持视频播放。
          </video>
        </div>
      ) : (
        <div className={`flex items-start gap-2 rounded-xl border px-3 py-3 text-[11px] leading-5 ${failed ? "border-[#DFC8BE] bg-[#FCF7F4] text-[#9A4E35]" : "border-[#D9CFB7] bg-[#F4ECD8] text-[#72551F]"}`}>
          {failed ? <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> : <Settings2 className="mt-0.5 size-3.5 shrink-0" />}
          <span>{failed ? `${failureDetails.length > 0 ? failureDetails.join("；") : "部分视频片段生成失败"}，下面保留已完成片段供复核。` : video.status === "segments_ready" ? "视频片段已生成，但当前环境暂未合成最终视频。" : video.status === "queued" || video.status === "running" ? (video.message || "视频正在后台生成，页面会自动更新进度。") : "尚未配置视频生成服务，已保留岗位视频脚本。"}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#527077]">
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-[#287F8D]" />岗位视频生成</span>
        <span>{video.resolution || "768P"} · {video.completed_segments || 0}/{video.segment_count || segments.length} 个片段 · 合计 {video.total_duration || video.duration || "—"} 秒 · {video.ratio || "16:9"}</span>
        <span className="inline-flex items-center gap-1"><Volume2 className="size-3.5 text-[#287F8D]" />{video.has_audio ? "含中文声音" : "无音频"}</span>
      </div>

      {segments.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {segments.map((segment) => (
            <div key={segment.index} className="rounded-lg border border-[#DDE9E5] bg-[#F8FCFA] px-2.5 py-2 text-[10px] leading-4 text-[#527077]">
              <span className={`font-bold ${segment.status === "succeeded" ? "text-[#287F8D]" : segment.status === "failed" ? "text-[#9A4E35]" : "text-[#8E6925]"}`}>{String(segment.index).padStart(2, "0")} · {segment.title} · {segment.duration} 秒</span>
              <p className="mt-0.5">{segment.status === "succeeded" ? "已生成" : segment.status === "failed" ? (segment.message || "生成失败") : "等待生成"}</p>
              {segment.status === "succeeded" && segment.video_url && <a className="text-[#287F8D] underline" href={segment.video_url} target="_blank" rel="noreferrer">查看片段</a>}
            </div>
          ))}
        </div>
      )}

      {video.script && (
        <div className="rounded-xl border border-[#C7D8D4] bg-white/70 p-3">
          <h3 className="text-xs font-bold text-[#183E46]">{video.script.title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-[#527077]">旁白：{video.script.voiceover}</p>
          {video.duration_reason && <p className="mt-1 text-[10px] leading-4 text-[#6F8A69]">时长说明：{video.duration_reason}</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {video.script.shots.map((shot, index) => (
              <div key={`${shot.description}-${index}`} className="rounded-lg border border-[#DDE9E5] bg-[#F8FCFA] px-2.5 py-2 text-[10px] leading-4 text-[#527077]">
                <span className="font-bold text-[#287F8D]">0{index + 1} · {shot.duration} 秒</span>
                <p className="mt-0.5">{shot.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
