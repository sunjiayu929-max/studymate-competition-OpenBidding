import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  GripVertical,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
} from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"
import { ModelSelector } from "@/components/ModelSelector"
import { ApiError, apiGet, apiPost } from "@/lib/api"
import type {
  PptCitation,
  PptPalette,
  PptSlideDraft,
} from "@/lib/pptDeck"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentCourse } from "@/store/course"
import { getSelectedKnowledgeBaseId, setSelectedKnowledgeBaseId } from "@/store/knowledgeBase"
import { useTutorModelProvider } from "@/store/tutorModel"

const EditableSlideCanvas = lazy(() => import("@/components/ppt/EditableSlideCanvas").then((module) => ({
  default: module.EditableSlideCanvas,
})))

type SlideDraft = PptSlideDraft

const STYLE_OPTIONS = {
  paper: {
    label: "象牙金·学术叙事",
    background: "F7F1E5",
    primary: "1D4A5F",
    accent: "D08A25",
    text: "12212B",
    panel: "173B4E",
    onPanel: "FFFDF8",
    soft: "DCE7E8",
  },
  graphite: {
    label: "深海蓝·电光演示",
    background: "111827",
    primary: "8EDAF2",
    accent: "F5A524",
    text: "F8FAFC",
    panel: "1E293B",
    onPanel: "F8FAFC",
    soft: "334155",
  },
  sage: {
    label: "苔原青·课堂故事",
    background: "ECF2EC",
    primary: "2F5C55",
    accent: "C2673A",
    text: "172823",
    panel: "214B46",
    onPanel: "F8FBF7",
    soft: "CCDCD4",
  },
} as const satisfies Record<string, PptPalette & { label: string }>

type StyleId = keyof typeof STYLE_OPTIONS

const LAYOUT_LABELS: Record<SlideDraft["layout"], string> = {
  cover: "视觉封面",
  agenda: "叙事路径",
  content: "观点 + 证据",
  case: "情境案例",
  chart: "数据 + 结论",
  process: "流程推进",
  comparison: "双栏对比",
  spotlight: "大字聚焦",
  summary: "行动收束",
  qa: "问题引导",
}

interface PptOutlineResponse {
  mode: "model" | "local_fallback"
  provider: string
  message: string
  slides: Omit<SlideDraft, "id" | "source">[]
}

interface PptRewriteResponse {
  mode: "model" | "local_fallback"
  provider: string
  message: string
  slide: Omit<SlideDraft, "id" | "source">
}

function citationLabel(citations: PptCitation[], fallback: string) {
  if (!citations.length) return fallback
  return citations.map((item) => `${item.source}${item.page ? ` 第 ${item.page} 页` : ""}`).join("；")
}

export function PptGenerator() {
  useTrackPage("ppt")
  const course = useCurrentCourse()
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(getSelectedKnowledgeBaseId)
  const [knowledgeBaseName, setKnowledgeBaseName] = useState("")
  const provider = useTutorModelProvider()
  const [topic, setTopic] = useState("")
  const [audience, setAudience] = useState("高校课程学习者")
  const [purpose, setPurpose] = useState("课堂讲解")
  const [pageCount, setPageCount] = useState(10)
  const [styleId, setStyleId] = useState<StyleId>("paper")
  const [slides, setSlides] = useState<SlideDraft[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [fallbackAction, setFallbackAction] = useState<"outline" | "rewrite" | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!knowledgeBaseId) return
    let cancelled = false
    apiGet<{ items: Array<{ id: number; name: string }> }>("/knowledge-bases")
      .then(({ items }) => {
        if (cancelled) return
        const selectedLibrary = items.find((item) => item.id === knowledgeBaseId)
        if (selectedLibrary) {
          setKnowledgeBaseName(selectedLibrary.name)
          return
        }
        setKnowledgeBaseId(null)
        setSelectedKnowledgeBaseId(null)
      })
      .catch(() => {
        /* Keep the last selection when validation is temporarily unavailable. */
      })
    return () => {
      cancelled = true
    }
  }, [knowledgeBaseId])

  const sourceLabel = useMemo(
    () => knowledgeBaseId
      ? `当前私有知识库 · ${knowledgeBaseName || `资料库 ${knowledgeBaseId}`}${course ? ` · ${course.name}` : ""}`
      : course
        ? `当前课程 · ${course.name}`
        : "用户输入主题",
    [course, knowledgeBaseId, knowledgeBaseName],
  )

  const selected = slides.find((slide) => slide.id === selectedId) || slides[0] || null

  const generateOutline = async (allowLocalFallback = false) => {
    const cleanTopic = topic.trim()
    if (!cleanTopic) return
    setGenerating(true)
    setFallbackAction(null)
    try {
      const response = await apiPost<PptOutlineResponse>("/ppt/outline", {
        topic: cleanTopic,
        audience,
        purpose,
        visual_style: styleId,
        page_count: pageCount,
        provider,
        course_id: course?.id ?? null,
        knowledge_base_id: knowledgeBaseId,
        allow_local_fallback: allowLocalFallback,
      })
      const next = response.slides.map((slide) => ({
        ...slide,
        id: crypto.randomUUID(),
        source: citationLabel(slide.citations, sourceLabel),
      }))
      setSlides(next)
      setSelectedId(next[0]?.id || null)
      setConfirmed(false)
      setMessage(response.message)
    } catch (error) {
      setFallbackAction(error instanceof ApiError && error.status === 503 ? "outline" : null)
      setMessage(String(error))
    } finally {
      setGenerating(false)
    }
  }

  const updateSelected = (patch: Partial<SlideDraft>) => {
    if (!selected) return
    setSlides((current) => current.map((slide) => slide.id === selected.id ? { ...slide, ...patch } : slide))
  }

  const move = (id: string, direction: -1 | 1) => {
    setSlides((current) => {
      const index = current.findIndex((slide) => slide.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const rewriteSlide = async (allowLocalFallback = false) => {
    if (!selected) return
    setGenerating(true)
    setFallbackAction(null)
    try {
      const response = await apiPost<PptRewriteResponse>("/ppt/rewrite", {
        topic: topic.trim(),
        audience,
        purpose,
        visual_style: styleId,
        provider,
        course_id: course?.id ?? null,
        knowledge_base_id: knowledgeBaseId,
        allow_local_fallback: allowLocalFallback,
        instruction: "按结论—证据—行动重写，减少堆字并保留可靠引用",
        slide: {
          title: selected.title,
          kicker: selected.kicker,
          subtitle: selected.subtitle,
          takeaway: selected.takeaway,
          bullets: selected.bullets,
          layout: selected.layout,
          blocks: selected.blocks,
          citations: selected.citations,
          chart_data: selected.chart_data,
        },
      })
      updateSelected({
        ...response.slide,
        source: citationLabel(response.slide.citations, sourceLabel),
      })
      setMessage(response.message)
    } catch (error) {
      setFallbackAction(error instanceof ApiError && error.status === 503 ? "rewrite" : null)
      setMessage(String(error))
    } finally {
      setGenerating(false)
    }
  }

  const exportPptx = async () => {
    if (!slides.length) return
    setExporting(true)
    setMessage("")
    try {
      const [{ default: PptxGenJS }, { populateEditableDeck }] = await Promise.all([
        import("pptxgenjs"),
        import("@/lib/pptDeck"),
      ])
      const pptx = new PptxGenJS()
      const palette = STYLE_OPTIONS[styleId]
      populateEditableDeck(pptx, slides, { topic, palette })
      const safeName = (topic || "StudyMate-演示文稿").replace(/[\\/:*?"<>|]/g, "-")
      await pptx.writeFile({ fileName: `${safeName}.pptx` })
      setMessage("可编辑 .pptx 已导出，标题、正文和版式元素均可在 PowerPoint 中继续修改")
    } catch (error) {
      setMessage(`导出失败：${String(error)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="ppt" appearance="paper" />
        <main className="mt-4 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.07)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-4 py-4 sm:px-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.11em] text-[#8E6925]"><Presentation className="size-3.5" />EDITABLE PPTX WORKFLOW</div>
              <h1 className="mt-1 text-lg font-bold tracking-[-.03em] text-[#18232D]">让模型先讲好故事，再生成可编辑演示文稿</h1>
              <p className="mt-1 text-[11px] text-[#66717B]">模型负责叙事、结论与页面构图；你仍可逐页编辑、排序、重写并导出真实 .pptx。</p>
            </div>
            <ModelSelector />
          </header>

          <section className="grid gap-3 border-b border-[#D7D1C4] p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(130px,.65fr))_auto] sm:p-5">
            <label className="sm:col-span-2 lg:col-span-1"><span className="mb-1 block text-[9px] font-bold text-[#8A8172]">主题</span><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：梯度下降的直觉与应用" className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px] outline-none focus:border-[#9FB1BC]" /></label>
            <label><span className="mb-1 block text-[9px] font-bold text-[#8A8172]">受众</span><input value={audience} onChange={(event) => setAudience(event.target.value)} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px] outline-none" /></label>
            <label><span className="mb-1 block text-[9px] font-bold text-[#8A8172]">用途</span><select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px]"><option>课堂讲解</option><option>学习汇报</option><option>答辩展示</option><option>复习总结</option></select></label>
            <label><span className="mb-1 block text-[9px] font-bold text-[#8A8172]">页数</span><input type="number" min={7} max={18} value={pageCount} onChange={(event) => setPageCount(Math.max(7, Math.min(18, Number(event.target.value))))} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px]" /></label>
            <label><span className="mb-1 block text-[9px] font-bold text-[#8A8172]">视觉风格</span><select value={styleId} onChange={(event) => setStyleId(event.target.value as StyleId)} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-[11px]">{Object.entries(STYLE_OPTIONS).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}</select></label>
            <button type="button" onClick={() => void generateOutline(false)} disabled={!topic.trim() || generating} className="mt-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-[10px] font-bold text-white disabled:opacity-40">{generating ? <Loader2 className="ppt-generation-spinner size-3.5" /> : <Sparkles className="size-3.5" />}使用所选模型生成</button>
            <div className="sm:col-span-2 lg:col-span-full text-[9px] text-[#7A817F]">资料来源：{sourceLabel}</div>
          </section>

          {message && <div role="status" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#C7D2D8] bg-[#EDF2F5] px-3 py-2 text-[10px] font-semibold text-[#315E83] sm:mx-5"><span>{message}</span>{fallbackAction && <button type="button" disabled={generating} onClick={() => void (fallbackAction === "outline" ? generateOutline(true) : rewriteSlide(true))} className="h-8 rounded-lg border border-[#9FB1BC] bg-white px-3 text-[9px] font-bold text-[#244C66] hover:bg-[#E7EDF3]">明确使用本地策略</button>}</div>}

          {slides.length === 0 ? (
            <div className="grid min-h-[420px] place-items-center p-8 text-center">
              <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><Presentation className="size-6" /></span><h2 className="mt-4 text-base font-bold text-[#18232D]">先让模型策划整套叙事</h2><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-[#66717B]">它会选择封面、聚焦、流程、对比、案例、图表等不同构图；图表只使用有依据的数据。</p></div>
            </div>
          ) : (
            <div className="grid min-h-[560px] lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-r border-[#D7D1C4] bg-[#F8F6F0] p-3">
                <div className="mb-3 flex items-center justify-between px-1"><strong className="text-[11px] text-[#18232D]">{confirmed ? "页面缩略图" : "可编辑大纲"}</strong><span className="text-[9px] text-[#7A817F]">{slides.length} 页</span></div>
                <div className="nav-scroll max-h-[500px] space-y-2 overflow-y-auto pr-1">
                  {slides.map((slide, index) => (
                    <div
                      key={slide.id}
                      draggable
                      onDragStart={() => setDraggedId(slide.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!draggedId || draggedId === slide.id) return
                        setSlides((current) => {
                          const from = current.findIndex((item) => item.id === draggedId)
                          const to = current.findIndex((item) => item.id === slide.id)
                          const next = [...current]
                          const [item] = next.splice(from, 1)
                          next.splice(to, 0, item)
                          return next
                        })
                        setDraggedId(null)
                      }}
                      className={`group rounded-2xl border p-2.5 transition-colors ${selected?.id === slide.id ? "border-[#9FB1BC] bg-[#E7EDF3]" : "border-[#D7D1C4] bg-[#FFFEFA]"}`}
                    >
                      <button type="button" onClick={() => setSelectedId(slide.id)} className="flex w-full items-start gap-2 text-left">
                        <span className="mt-0.5 text-[9px] font-bold tabular-nums text-[#8A8172]">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1"><strong className="line-clamp-2 text-[10px] leading-4 text-[#18232D]">{slide.title}</strong><small className="mt-1 block truncate text-[8px] text-[#7A817F]">{LAYOUT_LABELS[slide.layout]}</small></span>
                        <GripVertical className="size-3.5 shrink-0 text-[#A3A39D]" />
                      </button>
                      <div className="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => move(slide.id, -1)} disabled={index === 0} className="grid size-6 place-items-center rounded-lg hover:bg-[#ECE8DE] disabled:opacity-30" aria-label="上移"><ArrowUp className="size-3" /></button>
                        <button type="button" onClick={() => move(slide.id, 1)} disabled={index === slides.length - 1} className="grid size-6 place-items-center rounded-lg hover:bg-[#ECE8DE] disabled:opacity-30" aria-label="下移"><ArrowDown className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {!confirmed && <button type="button" onClick={() => { setConfirmed(true); setMessage("视觉叙事已确认，现在可以逐页调整构图、文案和强调重点") }} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#6F8A69] text-[10px] font-bold text-white"><CheckCircle2 className="size-3.5" />确认叙事并生成页面</button>}
              </aside>

              <section className="p-4 sm:p-6">
                {selected && (
                  <>
                    <Suspense fallback={<div className="mx-auto aspect-video w-full max-w-[900px] animate-pulse rounded-[22px] bg-[#F0ECE3]" />}>
                      <EditableSlideCanvas slide={selected} palette={STYLE_OPTIONS[styleId]} onChange={updateSelected} />
                    </Suspense>
                    <div className="mx-auto mt-3 flex max-w-[900px] flex-wrap items-start gap-2">
                      <label className="inline-flex items-center gap-2 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2 text-[9px] font-bold text-[#59636B]">页面构图<select value={selected.layout} onChange={(event) => updateSelected({ layout: event.target.value as SlideDraft["layout"] })} className="border-0 bg-transparent text-[10px] text-[#244C66] outline-none"><option value="cover">视觉封面</option><option value="agenda">叙事路径</option><option value="content">观点 + 证据</option><option value="case">情境案例</option><option value="process">流程推进</option><option value="comparison">双栏对比</option><option value="spotlight">大字聚焦</option><option value="chart">数据 + 结论</option><option value="summary">行动收束</option><option value="qa">问题引导</option></select></label>
                      <details className="min-w-[260px] flex-1 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2 text-[9px] text-[#59636B]">
                        <summary className="cursor-pointer font-bold text-[#315E83]">查看引用来源（{selected.citations.length}）</summary>
                        <div className="mt-2 space-y-1.5">{selected.citations.length ? selected.citations.map((citation, index) => <div key={`${citation.source}-${index}`} className="rounded-lg bg-white px-2 py-1.5"><strong>{citation.source}</strong>{citation.page ? ` · 第 ${citation.page} 页` : ""}<span className="ml-2 text-[#8A8172]">{citation.kind === "private" ? "私有资料" : citation.kind === "course" ? "课程知识库" : "用户主题"}</span></div>) : <span>本页没有外部引用；不会伪造来源。</span>}</div>
                      </details>
                    </div>
                    <div className="mx-auto mt-4 flex max-w-[900px] flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-[#66717B]">标题、结论、内容分区和图表均可直接编辑</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void rewriteSlide(false)} disabled={generating} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#315E83] hover:bg-[#E7EDF3] disabled:opacity-40">{generating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}使用所选模型重写</button>
                        <button type="button" onClick={exportPptx} disabled={!confirmed || exporting} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[10px] font-bold text-white disabled:opacity-40">{exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}导出可编辑 .pptx</button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
