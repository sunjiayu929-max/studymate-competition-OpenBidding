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
    label: "苔原青·岗位故事",
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

const FDE_SHOWCASE_DECK: SlideDraft[] = [
  {
    id: "fde-showcase-cover",
    layout: "cover",
    kicker: "FDE ROLE BRIEFING",
    title: "前线部署工程师的岗位闭环",
    subtitle: "从客户现场问题到可验收的交付方案",
    takeaway: "把能力、数据和业务流程连成可交付方案",
    bullets: [],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 1, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-agenda",
    layout: "agenda",
    kicker: "TRAINING ROADMAP",
    title: "本次训练如何推进",
    subtitle: "用岗位任务组织学习、演练与复盘",
    takeaway: "理解场景，拆解任务，验证交付，沉淀复盘",
    bullets: [],
    blocks: [
      { heading: "场景理解", body: "识别客户目标、约束与验收标准" },
      { heading: "方案拆解", body: "拆成数据、能力、流程与协作项" },
      { heading: "现场验证", body: "通过证据确认方案可执行、可交付" },
      { heading: "复盘沉淀", body: "记录风险、决策与下一次复用方法" },
    ],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 2, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-case",
    layout: "case",
    kicker: "FIELD CASE",
    title: "现场交付不是单点排障",
    subtitle: "以业务目标为锚点，组织跨角色协同",
    takeaway: "每一个技术选择都要能回答业务价值与验收依据",
    bullets: [],
    blocks: [
      { heading: "发现", body: "客户反馈流程断点，先还原真实使用路径" },
      { heading: "判断", body: "明确数据、系统接口和现场协作的优先级" },
      { heading: "交付", body: "用可验证的指标交付方案，而非仅交付代码" },
    ],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 6, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-value",
    layout: "content",
    kicker: "VALUE HYPOTHESIS",
    title: "先证明值得做，再扩大交付范围",
    subtitle: "把现场问题转成可观察、可验证的业务假设",
    takeaway: "技术可行不等于业务有效，证据链决定交付优先级",
    bullets: ["明确谁在什么场景遇到什么阻塞", "列出数据、系统、权限和协作依赖", "约定业务指标、验收样例与责任人"],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 3, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-process",
    layout: "process",
    kicker: "DELIVERY LOOP",
    title: "FDE 的现场交付闭环",
    subtitle: "从发现问题到复盘复用，每一步都留下验证证据",
    takeaway: "交付过程可追溯，客户团队才能独立使用",
    bullets: [],
    blocks: [
      { heading: "调研", body: "还原业务流程、痛点与约束" },
      { heading: "联调", body: "验证数据、接口、网络与权限" },
      { heading: "验收", body: "确认关键任务与业务结果达标" },
      { heading: "复盘", body: "沉淀风险、反馈和可复用能力" },
    ],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 4, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-comparison",
    layout: "comparison",
    kicker: "ROLE BOUNDARY",
    title: "FDE 与售前、驻场外包的区别",
    subtitle: "FDE 对生产或准生产环境中的业务结果负责",
    takeaway: "不止提出建议，更要把方案验证为客户可独立使用的能力",
    bullets: [],
    blocks: [
      { heading: "售前与传统驻场", body: "重点通常是方案说明、签约支持或按需求完成驻场任务。" },
      { heading: "FDE", body: "围绕客户真实流程推进集成、验证、采用与产品反馈的完整闭环。" },
    ],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 1, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-integration",
    layout: "content",
    kicker: "INTEGRATION CHECKLIST",
    title: "把联调风险变成可执行清单",
    subtitle: "现场工程工作应显式管理依赖，而不是在问题发生后被动排障",
    takeaway: "数据、接口、身份、网络、配置和责任人缺一不可",
    bullets: ["每项依赖标注负责人、完成条件和验证方式", "按数据、接口、环境、业务规则定位阻塞", "在变更前保留回滚路径与影响范围"],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 7, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-acceptance",
    layout: "spotlight",
    kicker: "ACCEPTANCE EVIDENCE",
    title: "验收不是“功能演示完成”",
    subtitle: "以事先约定的业务结果、运行记录和关键用户任务为依据",
    takeaway: "能运行、能使用、能追溯，才是可交付的现场结果",
    bullets: [],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 9, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-action",
    layout: "summary",
    kicker: "NEXT ACTIONS",
    title: "下一轮训练：用一个最小交付闭环验证能力",
    subtitle: "从真实业务场景开始，完整走过一次发现、联调、验收与复盘",
    takeaway: "把岗位知识变成可执行、可验证、可复用的行动",
    bullets: ["完成一份现场调研与依赖清单", "设计一个最小可验收的交付方案", "形成复盘报告并沉淀产品反馈"],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 11, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
  {
    id: "fde-showcase-qa",
    layout: "qa",
    kicker: "REVIEW QUESTION",
    title: "如何证明这套方案在客户现场真正产生价值？",
    subtitle: "用任务完成率、运行证据、用户反馈和复盘记录回答，而不是只展示功能页面。",
    takeaway: "评审每一个结论，都能回到岗位资料和交付证据。",
    bullets: [],
    blocks: [],
    chart_data: [],
    citations: [{ source: "FDE 岗位知识库", page: 12, chunk_id: null, kind: "course" }],
    source: "FDE 岗位知识库",
  },
]

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
  const [topic, setTopic] = useState("FDE 岗位讲解与训练汇报")
  const [audience, setAudience] = useState("岗位训练学习者")
  const [purpose, setPurpose] = useState("岗位讲解")
  const [pageCount, setPageCount] = useState(10)
  const [styleId, setStyleId] = useState<StyleId>("paper")
  const [slides, setSlides] = useState<SlideDraft[]>(FDE_SHOWCASE_DECK)
  const [confirmed, setConfirmed] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(FDE_SHOWCASE_DECK[0].id)
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
        ? `当前岗位 · ${course.name}`
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
              <h1 className="mt-1 text-xl font-bold tracking-[-.03em] text-[#18232D] sm:text-2xl">岗位讲解、训练汇报与答辩展示，一页看清</h1>
            </div>
          </header>

          <section className="grid gap-3 border-b border-[#D7D1C4] bg-[#FFFEFA] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E7EDF3] text-[#315E83]"><Presentation className="size-4" /></span><div><p className="text-xs font-bold text-[#18232D]">示例作品：FDE 岗位讲解与训练汇报</p><p className="mt-0.5 text-[11px] text-[#66717B]">完整展示岗位边界、场景调研、系统联调、验收证据与训练复盘，共 10 页。</p></div></div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-[#315E83]"><span className="rounded-full bg-[#E7EDF3] px-2.5 py-1.5">岗位讲解</span><span className="rounded-full bg-[#E9EEE6] px-2.5 py-1.5 text-[#557052]">训练汇报</span><span className="rounded-full bg-[#F4ECD8] px-2.5 py-1.5 text-[#8E6925]">答辩展示</span><span className="rounded-full bg-[#EEE9EF] px-2.5 py-1.5 text-[#7E6B83]">能力复盘</span></div>
          </section>

          <section className="grid gap-4 border-b border-[#D7D1C4] p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,.6fr)_auto]">
              <label><span className="mb-1 block text-[11px] font-bold text-[#8A8172]">主题</span><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：梯度下降的直觉与应用" className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-sm outline-none focus:border-[#9FB1BC]" /></label>
              <label><span className="mb-1 block text-[11px] font-bold text-[#8A8172]">受众</span><input value={audience} onChange={(event) => setAudience(event.target.value)} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-sm outline-none" /></label>
              <label><span className="mb-1 block text-[11px] font-bold text-[#8A8172]">页数</span><input type="number" min={7} max={18} value={pageCount} onChange={(event) => setPageCount(Math.max(7, Math.min(18, Number(event.target.value))))} className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FDFBF6] px-3 text-sm" /></label>
            </div>
            <div><span className="mb-2 block text-[11px] font-bold text-[#8A8172]">用途</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["岗位讲解", "训练汇报", "答辩展示", "能力复盘"].map((item) => <button key={item} type="button" onClick={() => setPurpose(item)} className={`h-10 rounded-xl border px-3 text-sm font-bold transition ${purpose === item ? "border-[#315E83] bg-[#E7EDF3] text-[#244C66]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#66717B] hover:bg-[#F8F6F0]"}`}>{item}</button>)}</div></div>
            <div><span className="mb-2 block text-[11px] font-bold text-[#8A8172]">视觉风格</span><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{Object.entries(STYLE_OPTIONS).map(([id, option]) => <button key={id} type="button" onClick={() => setStyleId(id as StyleId)} className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-bold transition ${styleId === id ? "border-[#315E83] bg-[#E7EDF3] text-[#244C66]" : "border-[#D7D1C4] bg-[#FFFEFA] text-[#66717B] hover:bg-[#F8F6F0]"}`}><span className="flex gap-1"><i className="size-3 rounded-full border border-black/10" style={{ backgroundColor: `#${option.background}` }} /><i className="size-3 rounded-full" style={{ backgroundColor: `#${option.primary}` }} /><i className="size-3 rounded-full" style={{ backgroundColor: `#${option.accent}` }} /></span>{option.label}</button>)}</div></div>
            <div><span className="mb-2 block text-[11px] font-bold text-[#8A8172]">生成模型</span><ModelSelector expanded /></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-[#7A817F]">资料来源：{sourceLabel}</span><button type="button" onClick={() => void generateOutline(false)} disabled={!topic.trim() || generating} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-4 text-xs font-bold text-white disabled:opacity-40">{generating ? <Loader2 className="ppt-generation-spinner size-3.5" /> : <Sparkles className="size-3.5" />}使用所选模型生成</button></div>
          </section>

          {message && <div role="status" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#C7D2D8] bg-[#EDF2F5] px-3 py-2 text-[10px] font-semibold text-[#315E83] sm:mx-5"><span>{message}</span>{fallbackAction && <button type="button" disabled={generating} onClick={() => void (fallbackAction === "outline" ? generateOutline(true) : rewriteSlide(true))} className="h-8 rounded-lg border border-[#9FB1BC] bg-white px-3 text-[9px] font-bold text-[#244C66] hover:bg-[#E7EDF3]">明确使用本地策略</button>}</div>}

          {slides.length === 0 ? (
            <div className="grid min-h-[420px] place-items-center p-8 text-center">
              <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#F4ECD8] text-[#8E6925]"><Presentation className="size-6" /></span><h2 className="mt-4 text-base font-bold text-[#18232D]">先让模型策划整套叙事</h2><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-[#66717B]">它会选择封面、聚焦、流程、对比、案例、图表等不同构图；图表只使用有依据的数据。</p></div>
            </div>
          ) : (
            <div className="grid lg:min-h-[560px] lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-b border-[#D7D1C4] bg-[#F8F6F0] p-3 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center justify-between px-1"><strong className="text-[11px] text-[#18232D]">{confirmed ? "页面缩略图" : "可编辑大纲"}</strong><span className="text-[9px] text-[#7A817F]">{slides.length} 页</span></div>
                <div className="nav-scroll flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[500px] lg:space-y-2 lg:overflow-y-auto lg:pr-1">
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
                      className={`group min-w-[178px] shrink-0 rounded-2xl border p-2.5 transition-colors lg:min-w-0 ${selected?.id === slide.id ? "border-[#9FB1BC] bg-[#E7EDF3]" : "border-[#D7D1C4] bg-[#FFFEFA]"}`}
                    >
                      <button type="button" onClick={() => setSelectedId(slide.id)} className="flex w-full items-start gap-2 text-left">
                        <span className="mt-0.5 text-[9px] font-bold tabular-nums text-[#8A8172]">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1"><strong className="line-clamp-2 text-[10px] leading-4 text-[#18232D]">{slide.title}</strong><small className="mt-1 block truncate text-[8px] text-[#7A817F]">{LAYOUT_LABELS[slide.layout]}</small></span>
                        <GripVertical className="size-3.5 shrink-0 text-[#A3A39D]" />
                      </button>
                      <div className="mt-1 flex justify-end gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
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
                    <div className="mx-auto mt-3 max-w-[900px] space-y-2">
                      <div><span className="mb-1.5 block text-[10px] font-bold text-[#59636B]">页面构图</span><div className="flex flex-wrap gap-1.5">{Object.entries(LAYOUT_LABELS).map(([layout, label]) => <button key={layout} type="button" onClick={() => updateSelected({ layout: layout as SlideDraft["layout"] })} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${selected.layout === layout ? "border-[#315E83] bg-[#E7EDF3] text-[#244C66]" : "border-[#D7D1C4] bg-[#F8F6F0] text-[#66717B] hover:bg-[#FFFEFA]"}`}>{label}</button>)}</div></div>
                      <details className="min-w-[260px] flex-1 rounded-xl border border-[#D7D1C4] bg-[#F8F6F0] px-3 py-2 text-[9px] text-[#59636B]">
                        <summary className="cursor-pointer font-bold text-[#315E83]">查看引用来源（{selected.citations.length}）</summary>
                        <div className="mt-2 space-y-1.5">{selected.citations.length ? selected.citations.map((citation, index) => <div key={`${citation.source}-${index}`} className="rounded-lg bg-white px-2 py-1.5"><strong>{citation.source}</strong>{citation.page ? ` · 第 ${citation.page} 页` : ""}<span className="ml-2 text-[#8A8172]">{citation.kind === "private" ? "私有资料" : citation.kind === "course" ? "岗位知识库" : "用户主题"}</span></div>) : <span>本页没有外部引用；不会伪造来源。</span>}</div>
                      </details>
                    </div>
                    <div className="mx-auto mt-4 flex max-w-[900px] flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] text-[#66717B]">标题、结论、内容分区和图表均可直接编辑</div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <button type="button" onClick={() => void rewriteSlide(false)} disabled={generating} className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] px-3 text-[10px] font-bold text-[#315E83] hover:bg-[#E7EDF3] disabled:opacity-40 sm:flex-none">{generating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}使用所选模型重写</button>
                        <button type="button" onClick={exportPptx} disabled={!confirmed || exporting} className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#244C66] px-3.5 text-[10px] font-bold text-white disabled:opacity-40 sm:flex-none">{exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}导出可编辑 .pptx</button>
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
