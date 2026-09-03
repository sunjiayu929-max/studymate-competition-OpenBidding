/**
 * 动画库 · 独立浏览页（/concept/library）
 * ------------------------------------------------------------------
 * 进动画讲解 → 点「动画库」入口 → 进这里慢慢逛。
 * - 按岗位能力方向分类，每个方向一组卡片。
 * - 顶部搜索框，按标题/能力方向/关键词过滤。
 * - 点卡片在上方展开播放器，用户自己调控自己看；下方给一句话文字说明（不朗读）。
 */
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Library, Film, Search, Sparkles, Play, X } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { Button } from "@/components/ui/button"
import { useTrackPage } from "@/lib/useTrackPage"
import { CONCEPT_ANIMS, conceptMatchScore } from "@/components/concepts/registry"
import { useTargetRole } from "@/store/targetRole"

const CAPABILITY_DIRECTIONS = ["机器学习", "数据结构与算法", "操作系统", "计算机网络", "计算机组成原理"]
const DIRECTION_LABELS: Record<string, string> = {
  机器学习: "模型与数据能力",
  数据结构与算法: "算法与工程基础",
  操作系统: "系统与部署基础",
  计算机网络: "网络与系统集成",
  计算机组成原理: "计算平台基础",
}

function directionRank(direction: string): number {
  const i = CAPABILITY_DIRECTIONS.indexOf(direction)
  return i === -1 ? CAPABILITY_DIRECTIONS.length : i
}

export function ConceptLibrary() {
  useTrackPage("concept")
  const navigate = useNavigate()
  const targetRole = useTargetRole()
  const [query, setQuery] = useState("")
  const [selectedDirection, setSelectedDirection] = useState("all")

  const directionCounts = useMemo(
    () =>
      new Map(
        CAPABILITY_DIRECTIONS.map((direction) => [direction, CONCEPT_ANIMS.filter((concept) => concept.course === direction).length]),
      ),
    [],
  )

  // 底层动画仍保留来源分类字段，界面统一呈现为岗位能力方向。
  const groups = useMemo(() => {
    const q = query.trim()
    const inSelectedDirection =
      selectedDirection === "all"
        ? CONCEPT_ANIMS
        : CONCEPT_ANIMS.filter((concept) => concept.course === selectedDirection)
    const filtered = q
      ? inSelectedDirection.map((concept, index) => ({
          concept,
          index,
          score: conceptMatchScore(concept, q, true),
        }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .map((item) => item.concept)
      : inSelectedDirection
    const byDirection = new Map<string, typeof CONCEPT_ANIMS>()
    for (const c of filtered) {
      const arr = byDirection.get(c.course) ?? []
      arr.push(c)
      byDirection.set(c.course, arr)
    }
    const grouped = Array.from(byDirection.entries())
    return q ? grouped : grouped.sort((a, b) => directionRank(a[0]) - directionRank(b[0]))
  }, [query, selectedDirection])

  const total = CONCEPT_ANIMS.length
  const visibleCount = groups.reduce((sum, [, anims]) => sum + anims.length, 0)
  const selectedDirectionLabel = selectedDirection === "all" ? "全部能力方向" : DIRECTION_LABELS[selectedDirection] || selectedDirection

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="concept" appearance="paper" />

        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-col gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/concept" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]">
                <ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回可视讲解</span>
              </Link>
              <span className="h-6 w-px shrink-0 bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Library className="size-4" /></span>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-[#18232D]">因材智训动画库</h1>
                <p className="mt-0.5 truncate text-[11px] leading-4 text-[#6F787A]">{total} 个精品动画 · 围绕{targetRole?.name || "目标岗位"}按能力方向检索、自由播放和单步拆解</p>
              </div>
            </div>
          </header>

          <div className="p-4 sm:p-5">
            <div className="mb-6 rounded-2xl border border-[#D7D1C4] bg-[#FBF8F0] p-3.5 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold text-[#243746]">按岗位能力方向浏览</p>
                  <p className="mt-1 text-[11px] leading-4 text-[#6F787A]">
                    当前展示 {selectedDirectionLabel} · {visibleCount} 个动画，点选后直接进入完整播放页
                  </p>
                </div>
                <div className="relative w-full lg:max-w-[430px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7B817D]" />
                  <input
                    value={query}
                    onChange={(e) => {
                      const nextQuery = e.target.value
                      if (nextQuery.trim() && !query.trim()) setSelectedDirection("all")
                      setQuery(nextQuery)
                    }}
                    placeholder="搜索 300 个动画，如红黑树 / 虚拟内存 / HTTP2…"
                    aria-label="搜索动画"
                    className="h-11 w-full rounded-xl border border-[#CEC6B7] bg-[#FFFEFA] pl-9 pr-10 text-sm outline-none transition-shadow placeholder:text-[#98958D] focus:border-[#7894A7] focus:ring-2 focus:ring-[#315E83]/10"
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label="清除搜索"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#737B7E] transition-colors hover:bg-[#E9E3D7] hover:text-[#244C66]"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label="按岗位能力方向筛选动画">
                <button
                  type="button"
                  aria-pressed={selectedDirection === "all"}
                  onClick={() => setSelectedDirection("all")}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    selectedDirection === "all"
                      ? "border-[#244C66] bg-[#244C66] text-white"
                      : "border-[#D2CABD] bg-[#FFFEFA] text-[#59666E] hover:border-[#9FB1BC] hover:text-[#244C66]"
                  }`}
                >
                  全部能力方向 <span className={selectedDirection === "all" ? "text-white/70" : "text-[#98958D]"}>{total}</span>
                </button>
                {CAPABILITY_DIRECTIONS.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={selectedDirection === direction}
                    onClick={() => setSelectedDirection(direction)}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                      selectedDirection === direction
                        ? "border-[#244C66] bg-[#244C66] text-white"
                        : "border-[#D2CABD] bg-[#FFFEFA] text-[#59666E] hover:border-[#9FB1BC] hover:text-[#244C66]"
                    }`}
                  >
                    {DIRECTION_LABELS[direction]} <span className={selectedDirection === direction ? "text-white/70" : "text-[#98958D]"}>{directionCounts.get(direction) ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>

        {/* 按岗位能力方向分组的卡片 */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-[#CFC8B9] bg-[#FBF8F0] px-5 py-12 text-center">
            <span className="grid size-11 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><Search className="size-4" /></span>
            <p className="text-sm font-semibold text-[#243746]">
              动画库里还没有「{query}」的专属动画
            </p>
            <Button className="bg-[#244C66] text-[#FFFEFA] hover:bg-[#193B50]" onClick={() => navigate(`/concept?q=${encodeURIComponent(query.trim())}`)}>
              <Sparkles className="size-4" /> 让 AI 现场给你讲「{query.trim()}」
            </Button>
            <p className="text-[11px] leading-5 text-[#6F787A]">
              AI 会现编排一个分步动画讲解 —— 任何概念都不会空手而归
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([direction, anims]) => (
              <section key={direction}>
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${anims[0].badgeClass}`}>{DIRECTION_LABELS[direction] || direction}</span>
                    <span className="font-normal text-[var(--muted-foreground)]">{anims.length} 个</span>
                  </h2>
                  {query.trim() ? <span className="text-[11px] text-[#7A817F]">匹配「{query.trim()}」</span> : null}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {anims.map((c) => {
                    return (
                      <button
                        key={c.key}
                        type="button"
                        aria-label={`播放动画：${c.title}`}
                        onClick={() => navigate(`/concept?anim=${encodeURIComponent(c.key)}`)}
                        className="group flex min-w-0 items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#C2A76C] hover:bg-[#F8F6F0] hover:shadow-[0_7px_18px_rgba(24,35,45,.07)]"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                          <Film className="size-3.5 shrink-0 text-[#8A8172] group-hover:text-[#8E6925]" />
                          <span className="truncate min-w-0">{c.title}</span>
                        </span>
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#F4ECD8] text-[#8E6925] opacity-70 transition-all group-hover:opacity-100">
                          <Play className="ml-0.5 size-3 fill-current" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
          </div>
        </section>
      </div>
    </div>
  )
}
