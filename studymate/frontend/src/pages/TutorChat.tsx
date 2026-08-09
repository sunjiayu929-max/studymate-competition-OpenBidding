import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, BookOpen, Clock3, ShieldCheck, Target } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import type { ProfileMiniData } from "@/components/ProfileMiniCard"
import { ProfileRadar } from "@/components/ProfileRadar"
import { TutorChatPanel } from "@/components/TutorChatPanel"
import { apiGet } from "@/lib/api"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentCourse } from "@/store/course"
import { useCurrentUser } from "@/store/user"

export function TutorChat() {
  useTrackPage("tutor")
  const user = useCurrentUser()
  const USER_ID = user?.user_id ?? 0
  const course = useCurrentCourse()
  const [searchParams, setSearchParams] = useSearchParams()
  const captureMode = searchParams.get("capture") === "1"
  const [profile, setProfile] = useState<ProfileMiniData | null>(null)
  const [radarView, setRadarView] = useState<"knowledge" | "style" | "preference" | "employment">("knowledge")

  useTutorContext(null)

  useEffect(() => {
    if (!USER_ID) return
    apiGet<ProfileMiniData>(`/profile/${USER_ID}`).then(setProfile).catch(() => {})
  }, [USER_ID])

  const handleCaptureModeChange = useCallback((enabled: boolean) => {
    const next = new URLSearchParams(searchParams)
    if (enabled) next.set("capture", "1")
    else next.delete("capture")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const goal = profile?.dims.goals.primary?.trim() || "等待画像补充"
  const weakPoints = profile?.dims.weak_points.topics?.filter(Boolean) || []
  const targetTopics = profile?.dims.goals.target_topics?.filter(Boolean) || []
  const focus = weakPoints.slice(0, 3).join("、") || targetTopics.slice(0, 3).join("、") || "暂未标记薄弱点"
  const hours = profile?.dims.pace.hours_per_week
  const radarOptions = profile ? {
    knowledge: { label: "知识基础", data: profile.dims.knowledge_base, color: "#315E83" },
    style: { label: "认知风格", data: profile.dims.cognitive_style, color: "#B85C3E" },
    preference: { label: "资源偏好", data: profile.dims.preference, color: "#6F8A69" },
    employment: { label: "就业技能", data: profile.dims.employment_skills, color: "#7E6B83" },
  } : null
  const activeRadar = radarOptions?.[radarView]

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="tutor" appearance="paper" />

        <main className={`mt-4 grid items-stretch gap-4 xl:min-h-[620px] xl:grid-cols-[minmax(0,1fr)_360px] ${captureMode ? "" : "xl:h-[calc(100dvh-108px)]"}`}>
          <section className={`flex min-h-[680px] min-w-0 flex-col rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)] ${captureMode ? "overflow-visible" : "overflow-hidden xl:h-full xl:min-h-0"}`}>
            <TutorChatPanel variant="fullscreen" captureMode={captureMode} onCaptureModeChange={handleCaptureModeChange} />
          </section>

          <aside data-testid="tutor-context-sidebar" className="h-fit space-y-3 xl:flex xl:h-[calc(100dvh-108px)] xl:min-h-[620px] xl:flex-col">
            <section className="rounded-[22px] border border-[#CFC8B9] bg-[#F8F6F0] p-4 shadow-[0_9px_24px_rgba(24,35,45,.045)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]">画像已注入 · v{profile?.version ?? "—"}</span>
                  <h2 className="mt-1 text-sm font-bold text-[#18232D]">本次讲解会如何适配你</h2>
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]">
                  <ShieldCheck className="size-3.5" />
                </span>
              </div>
              <div className="space-y-2">
                <TutorFact icon={Target} label="当前目标" value={goal} tone="blue" />
                <TutorFact icon={AlertTriangle} label="优先关注" value={focus} tone="red" />
                <div className="grid grid-cols-2 gap-2">
                  <TutorFact icon={Clock3} label="学习节奏" value={hours ? `每周 ${hours} 小时` : "等待补充"} tone="gold" compact />
                  <TutorFact icon={BookOpen} label="当前岗位" value={course?.name || "尚未选择岗位"} tone="green" compact />
                </div>
              </div>
            </section>

            {profile ? (
              <section aria-label="画像维度切换" className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
                <div role="tablist" aria-label="选择画像维度" className="mb-2 grid grid-cols-4 rounded-2xl border border-[#CFC8B9] bg-[#F8F6F0] p-1">
                  {(["knowledge", "style", "preference", "employment"] as const).map((key) => {
                    const option = radarOptions![key]
                    return <button key={key} type="button" role="tab" aria-selected={radarView === key} onClick={() => setRadarView(key)} className={`h-8 rounded-xl text-[10px] font-bold transition-colors ${radarView === key ? "bg-[#FFFEFA] text-[#244C66] shadow-[0_3px_9px_rgba(24,35,45,.08)]" : "text-[#7A817F] hover:text-[#244C66]"}`}>{option.label}</button>
                  })}
                </div>
                {activeRadar && <ProfileRadar key={radarView} title={activeRadar.label} data={activeRadar.data} color={activeRadar.color} height={112} fill showScores />}
              </section>
            ) : (
              <div className="rounded-[22px] border border-dashed border-[#C9C2B4] bg-[#F8F6F0] p-6 text-center text-xs leading-6 text-[#66717B] xl:flex-1">
                建立学习画像后，这里会显示助教本轮回答所依据的目标、基础与偏好。
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  )
}

function TutorFact({ icon: Icon, label, value, tone, compact = false }: { icon: typeof Target; label: string; value: string; tone: "blue" | "red" | "gold" | "green"; compact?: boolean }) {
  const colors = {
    blue: "bg-[#E7EDF3] text-[#315E83]",
    red: "bg-[#F4E8E2] text-[#9A4E35]",
    gold: "bg-[#F4ECD8] text-[#8E6925]",
    green: "bg-[#E9EEE6] text-[#557052]",
  }
  return (
    <div className={`flex items-start rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] ${compact ? "gap-2 p-2.5" : "gap-3 p-3"}`}>
      <span className={`grid shrink-0 place-items-center rounded-full ${compact ? "size-7" : "size-8"} ${colors[tone]}`}>
        <Icon className={compact ? "size-3.5" : "size-4"} />
      </span>
      <div className="min-w-0">
        <span className="text-[10px] font-bold text-[#8A8172]">{label}</span>
        <p className={`mt-0.5 line-clamp-2 font-semibold text-[#18232D] ${compact ? "text-[10px] leading-4" : "text-[11px] leading-5"}`}>{value}</p>
      </div>
    </div>
  )
}
