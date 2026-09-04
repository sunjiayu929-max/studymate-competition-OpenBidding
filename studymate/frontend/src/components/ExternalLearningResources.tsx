import { useCallback, useState } from "react"
import { BookOpen, ExternalLink, FileText, Library, Play, Video } from "lucide-react"

import { BiliVideos, type BiliVideo } from "@/components/BiliVideos"
import { useCurrentCourse } from "@/store/course"
import { useTargetRole } from "@/store/targetRole"
import { track } from "@/lib/track"

type ResourceKind = "book" | "paper" | "video" | "document"
type CatalogKind = "all" | ResourceKind
type CatalogSource = "all" | "verified" | "video"

const RESOURCE_STYLE: Record<ResourceKind, { label: string; icon: typeof BookOpen; cover: string; text: string }> = {
  book: { label: "书籍", icon: BookOpen, cover: "from-[#A77A32] to-[#E9C77A]", text: "text-[#8E6925]" },
  paper: { label: "论文", icon: FileText, cover: "from-[#315E83] to-[#7C9DB5]", text: "text-[#315E83]" },
  video: { label: "视频", icon: Video, cover: "from-[#A44F3A] to-[#E69B79]", text: "text-[#A44F3A]" },
  document: { label: "文档", icon: FileText, cover: "from-[#52704D] to-[#9CAF8D]", text: "text-[#52704D]" },
}

const FDE_FEATURED_VIDEOS: BiliVideo[] = [
  {
    bvid: "BV1AJMq6eEum",
    title: "两个月，从 0 到 1 交付一个企业级 AI 智能体｜FDE 驻场复盘",
    author: "Leon同学哟",
    cover: "/resource-covers/fde-delivery-retrospective.jpg",
    play: 1919,
    duration: "16:09",
    url: "https://www.bilibili.com/video/BV1AJMq6eEum",
    match_level: "exact",
  },
  {
    bvid: "BV18GbZ6HE7P",
    title: "从老板一句话，到可落地的 AI 方案：FDE 如何实现落地？",
    author: "二次元的Datawhale",
    cover: "/resource-covers/fde-solution-delivery.jpg",
    play: 838,
    duration: "62:47",
    url: "https://www.bilibili.com/video/BV18GbZ6HE7P",
    match_level: "exact",
  },
  {
    bvid: "BV1MzEM6WEY5",
    title: "如何更好地理解 Palantir 的 FDE：前沿部署工程师",
    author: "人月聊IT",
    cover: "/resource-covers/palantir-fde-explainer.jpg",
    play: 3975,
    duration: "5:45",
    url: "https://www.bilibili.com/video/BV1MzEM6WEY5",
    match_level: "exact",
  },
  {
    bvid: "BV11M826EEoa",
    title: "FDE 如何实现：腾讯《FDE 行业观察与实践》第一集解读",
    author: "朗读君程修远",
    cover: "https://i0.hdslb.com/bfs/archive/e811b6c3a14f4121b5372c718e264048f53f9839.jpg",
    play: 647,
    duration: "22:37",
    url: "https://www.bilibili.com/video/BV11M826EEoa",
    match_level: "exact",
  },
  {
    bvid: "BV1sM826EE9x",
    title: "FDE 如何实现：腾讯《FDE 行业观察与实践》第二集解读",
    author: "朗读君程修远",
    cover: "https://i0.hdslb.com/bfs/archive/244027f0e50449e6946ba409ed0f7a9a7f3836b1.jpg",
    play: 96,
    duration: "17:07",
    url: "https://www.bilibili.com/video/BV1sM826EE9x",
    match_level: "exact",
  },
  {
    bvid: "BV16J8v63EK9",
    title: "FDE 实战营：用 AI 重构传统行业的业务交付",
    author: "二次元的Datawhale",
    cover: "https://i2.hdslb.com/bfs/archive/876f74f36dc709dbf244a896a4cf96664e145728.jpg",
    play: 729,
    duration: "57:17",
    url: "https://www.bilibili.com/video/BV16J8v63EK9",
    match_level: "related",
  },
  {
    bvid: "BV1KBbe6jEwF",
    title: "FDE 进场以后，AI 为什么仍然难以落地？",
    author: "AI林湛星",
    cover: "https://i0.hdslb.com/bfs/archive/2db98e4b82a4f2e93af0548e4d8c424e661ea107.jpg",
    play: 762,
    duration: "4:42",
    url: "https://www.bilibili.com/video/BV1KBbe6jEwF",
    match_level: "exact",
  },
  {
    bvid: "BV1CsSUBPEko",
    title: "FDE 实战：岗位能力、工作模式与可上线交付全讲透",
    author: "卢菁博士",
    cover: "https://i0.hdslb.com/bfs/archive/6fbd3299d71918b496eaa0d0912b9c4f88966b64.jpg",
    play: 235654,
    duration: "119:33",
    url: "https://www.bilibili.com/video/BV1CsSUBPEko",
    match_level: "exact",
  },
  {
    bvid: "BV1gHbr63EZX",
    title: "过去半年多，我一直在做 FDE：客户交付与 Agent 沉淀",
    author: "雪梅的AI学习日记",
    cover: "https://i2.hdslb.com/bfs/archive/cb369b2230d47f365c6fc1cfa79649fd94cb8aae.jpg",
    play: 447,
    duration: "6:35",
    url: "https://www.bilibili.com/video/BV1gHbr63EZX",
    match_level: "related",
  },
]

type ExtendedReadingItem = {
  kind: Exclude<ResourceKind, "video">
  title: string
  source: string
  description: string
  href: string
  cover?: string
}

const FDE_EXTENDED_READING: ExtendedReadingItem[] = [
  { kind: "book", title: "The Mom Test", source: "Rob Fitzpatrick · 书籍官网", description: "把模糊需求访谈转成可验证事实，适合 FDE 做客户需求澄清。", href: "https://momtestbook.com/", cover: "/resource-covers/the-mom-test-real-v2.jpg" },
  { kind: "book", title: "Continuous Discovery Habits", source: "Teresa Torres · 产品页", description: "用持续访谈、机会树和小实验把客户问题转为可验证价值假设。", href: "https://www.producttalk.org/continuous-discovery-habits/" },
  { kind: "book", title: "Accelerate", source: "IT Revolution · 图书页", description: "以交付速度、稳定性与组织能力衡量工程实践，帮助设计上线与复盘指标。", href: "https://itrevolution.com/product/accelerate/" },
  { kind: "book", title: "Site Reliability Engineering", source: "Google SRE · 在线书", description: "从服务目标、错误预算到事故复盘，建立可运营的生产交付能力。", href: "https://sre.google/sre-book/table-of-contents/" },
  { kind: "paper", title: "Hidden Technical Debt in Machine Learning Systems", source: "NeurIPS 2015 · 论文", description: "识别数据依赖、反馈环和配置膨胀等会阻碍规模化交付的隐性债务。", href: "https://papers.nips.cc/paper_files/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html", cover: "/resource-covers/hidden-technical-debt-real-v2.jpg" },
  { kind: "paper", title: "The ML Test Score: A Rubric for ML Production Readiness", source: "Google Research · 论文", description: "用生产就绪度量表检查监控、数据、部署与工程质量。", href: "https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/" },
  { kind: "paper", title: "Data Cascades in High-Stakes AI", source: "ACM FAccT · 论文", description: "理解需求、数据与组织决策如何层层放大风险，适合作为项目风险识别材料。", href: "https://dl.acm.org/doi/10.1145/3411764.3445512" },
  { kind: "document", title: "Production Readiness Review", source: "Google SRE Workbook · 官方文档", description: "上线前逐项核对容量、监控、故障处置与责任边界。", href: "https://sre.google/workbook/production-readiness-review/", cover: "/resource-covers/production-readiness-review-real-v2.jpg" },
  { kind: "document", title: "Rules of Machine Learning", source: "Google Developers · 官方指南", description: "从第一个模型到持续迭代，提供面向真实业务的机器学习工程规则。", href: "https://developers.google.com/machine-learning/guides/rules-of-ml" },
  { kind: "document", title: "The Twelve-Factor App", source: "12factor.net · 工程实践", description: "用配置、依赖、日志与环境一致性降低部署和运维的不确定性。", href: "https://12factor.net/" },
  { kind: "document", title: "NIST AI Risk Management Framework", source: "NIST · 官方框架", description: "将 AI 风险治理纳入方案设计、交付验收与持续监控。", href: "https://www.nist.gov/itl/ai-risk-management-framework" },
  { kind: "document", title: "OWASP Top 10 for LLM Applications", source: "OWASP · 安全指南", description: "在客户交付中检查提示注入、数据泄露和过度权限等常见风险。", href: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/" },
]

export function ExternalLearningResources({
  keyword,
  conceptTitle,
  variant = "default",
  catalogQuery = "",
}: {
  keyword: string
  conceptTitle?: string | null
  variant?: "default" | "catalog"
  catalogQuery?: string
}) {
  const course = useCurrentCourse()
  const targetRole = useTargetRole()
  const [biliVideo, setBiliVideo] = useState<BiliVideo | null>(null)
  const onFirstVideo = useCallback((video: BiliVideo | null) => setBiliVideo(video), [])
  const topic = keyword.trim() || targetRole?.name || course?.name || "岗位能力训练"
  const roleContext = course?.name || targetRole?.name
  const isFde = /\bFDE\b|前线部署|现场交付|部署验收/i.test(`${topic} ${roleContext || ""}`)
  const featuredVideos = isFde ? FDE_FEATURED_VIDEOS : []
  if (variant === "catalog") {
    return (
      <CatalogResources
        keyword={keyword || topic}
        conceptTitle={conceptTitle}
        roleContext={roleContext}
        isFde={isFde}
        featuredVideos={featuredVideos}
        catalogQuery={catalogQuery}
      />
    )
  }
  return (
    <section className="lr-resource-suite mt-8 border-t border-[#E3DED3] pt-6" aria-label="学习资源">
      <div className="lr-resource-heading flex items-center gap-3"><strong>01</strong><span><b>精选资源总览</b><small>书籍、论文、文档与视频</small></span><i aria-hidden="true"><em /><em /><em /></i></div>
      <VisualResourceCards biliVideo={biliVideo || featuredVideos[0] || null} />
      <BiliVideos keyword={keyword || topic} conceptTitle={conceptTitle} courseName={roleContext} onFirstVideo={onFirstVideo} featuredVideos={featuredVideos} />
      <ExtendedReading items={FDE_EXTENDED_READING} />
    </section>
  )
}

const CATALOG_KIND_OPTIONS: Array<{ value: CatalogKind; label: string }> = [
  { value: "all", label: "全部" },
  { value: "book", label: "书籍" },
  { value: "paper", label: "论文" },
  { value: "document", label: "文档" },
  { value: "video", label: "视频" },
]

type CatalogCardItem = {
  kind: ResourceKind
  title: string
  source: string
  description: string
  href: string
  cover?: string
  trackId: string
}

function matchesCatalogQuery(query: string, values: Array<string | undefined>): boolean {
  const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase().trim()
  if (!normalizedQuery) return true
  const tokens = normalizedQuery.split(/[\s,，。;；、/|]+/).filter(Boolean)
  const searchableText = values.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase()
  return tokens.some((token) => searchableText.includes(token))
}

function CatalogResources({
  keyword,
  conceptTitle,
  roleContext,
  isFde,
  featuredVideos,
  catalogQuery,
}: {
  keyword: string
  conceptTitle?: string | null
  roleContext?: string | null
  isFde: boolean
  featuredVideos: BiliVideo[]
  catalogQuery: string
}) {
  const [kindFilter, setKindFilter] = useState<CatalogKind>("all")
  const [sourceFilter, setSourceFilter] = useState<CatalogSource>("all")
  const readings = isFde
    ? FDE_EXTENDED_READING.filter((item) => matchesCatalogQuery(catalogQuery, [item.title, item.source, item.description]))
    : []
  const videos = isFde
    ? featuredVideos.filter((video) => matchesCatalogQuery(catalogQuery, [
        video.title,
        video.author,
        "B站 视频",
        video.match_level === "related" ? "岗位相关补充 拓展交付视角" : "直接匹配当前岗位 真实交付任务",
      ]))
    : featuredVideos
  const showVideos = sourceFilter !== "verified" && (kindFilter === "all" || kindFilter === "video")
  const showReadings = sourceFilter !== "video" && kindFilter !== "video"
  const filteredReadings = showReadings
    ? readings.filter((item) => kindFilter === "all" || item.kind === kindFilter)
    : []
  const showMixedLead = isFde && kindFilter === "all" && sourceFilter === "all"
  const leadReadings = showMixedLead
    ? (["book", "paper", "document"] as const)
        .map((kind) => filteredReadings.find((item) => item.kind === kind))
        .filter((item): item is ExtendedReadingItem => Boolean(item))
    : []
  const leadReadingTitles = new Set(leadReadings.map((item) => item.title))
  const remainingReadings = filteredReadings.filter((item) => !leadReadingTitles.has(item.title))
  const leadVideo = showMixedLead ? videos[0] : null
  const listedVideos = leadVideo ? videos.slice(1) : videos
  const hasVideoDirectory = showVideos && (!isFde || listedVideos.length > 0)
  const knownCount = filteredReadings.length + (showVideos && isFde ? videos.length : 0)
  const countText = isFde || !showVideos ? `${knownCount} 项结果` : "视频结果实时更新"
  const resultLabel = catalogQuery ? `“${catalogQuery}” · ${countText}` : countText
  const leadItems: CatalogCardItem[] = [
    ...leadReadings.map((item) => ({
      ...item,
      trackId: `catalog_${item.kind}`,
    })),
    ...(leadVideo
      ? [{
          kind: "video" as const,
          title: leadVideo.title,
          source: `B站 · ${leadVideo.author}`,
          description: leadVideo.match_level === "related" ? "岗位相关补充，适合拓展交付视角。" : "直接匹配当前岗位的真实交付任务。",
          href: leadVideo.url,
          cover: leadVideo.cover,
          trackId: "catalog_video",
        }]
      : []),
  ]
  const hasVisibleDirectory = leadItems.length > 0 || remainingReadings.length > 0 || hasVideoDirectory

  return (
    <section className="lr-catalog-directory" aria-label="学习资源筛选结果">
      <div className="lr-catalog-toolbar">
        <div className="lr-catalog-kind-filter" role="group" aria-label="资源类型筛选">
          {CATALOG_KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={kindFilter === option.value ? "is-active" : ""}
              aria-pressed={kindFilter === option.value}
              onClick={() => setKindFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="lr-catalog-source-filter">
          <span>来源</span>
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as CatalogSource)}
            aria-label="资源来源筛选"
          >
            <option value="all">全部来源</option>
            <option value="verified">出版 / 研究 / 官方</option>
            <option value="video">B站讲解</option>
          </select>
        </label>
        <output className="lr-catalog-count" aria-live="polite">{resultLabel}</output>
      </div>

      {leadItems.length > 0 && (
        <div className="lr-catalog-grid lr-catalog-lead-grid">
          {leadItems.map((item) => <CatalogResourceCard key={item.href} item={item} />)}
        </div>
      )}

      {hasVideoDirectory && (
        <div className="lr-catalog-videos">
          <BiliVideos
            keyword={keyword}
            conceptTitle={conceptTitle}
            courseName={roleContext}
            featuredVideos={listedVideos}
          />
        </div>
      )}

      {remainingReadings.length > 0 && (
        <div className="lr-catalog-reading">
          <div className="lr-catalog-section-heading">
            <div><Library /><span><strong>书籍、论文与公开文档</strong><small>来源与推荐理由均可核验</small></span></div>
            <span>{remainingReadings.length} 项</span>
          </div>
          <div className="lr-catalog-grid">
            {remainingReadings.map((item) => (
              <CatalogResourceCard
                key={item.href}
                item={{ ...item, trackId: `catalog_${item.kind}` }}
              />
            ))}
          </div>
        </div>
      )}

      {!hasVisibleDirectory && (
        <div className="lr-catalog-empty" role="status">
          {catalogQuery
            ? `没有找到与“${catalogQuery}”匹配的资源，请尝试更短的关键词或调整筛选。`
            : "当前类型与来源组合暂无结果，请切换筛选条件。"}
        </div>
      )}
    </section>
  )
}

function CatalogResourceCard({ item }: { item: CatalogCardItem }) {
  const style = RESOURCE_STYLE[item.kind]
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={() => track("external_resource_open", item.trackId, item.title)}
      className={`lr-catalog-card lr-resource-${item.kind}`}
    >
      <ResourcePreview kind={item.kind} title={item.title} cover={item.cover} compact />
      <div className="lr-catalog-card-copy">
        <div className="lr-catalog-card-meta"><span className={style.text}>{style.label}</span><small>{item.source}</small></div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <span className={style.text}>{item.kind === "video" ? "打开视频" : "打开原文"} <ExternalLink /></span>
      </div>
    </a>
  )
}

function VisualResourceCards({ biliVideo }: { biliVideo: BiliVideo | null }) {
  const items: Array<{ kind: ResourceKind; title: string; source: string; href: string; description: string; cover?: string }> = [
    { kind: "book", title: "The Mom Test", source: "Rob Fitzpatrick · 书籍官网", href: "https://momtestbook.com/", description: "客户访谈与需求澄清的实战书籍。", cover: "/resource-covers/the-mom-test-real-v2.jpg" },
    { kind: "paper", title: "Hidden Technical Debt in Machine Learning Systems", source: "NeurIPS 2015 · 公开论文 PDF", href: "https://papers.nips.cc/paper_files/paper/2015/file/86df7dcfd896fcaf2674f757a2463eba-Paper.pdf", description: "理解机器学习系统交付中的隐性技术债务。", cover: "/resource-covers/hidden-technical-debt-real-v2.jpg" },
    { kind: "document", title: "Production Readiness Review", source: "Google SRE Workbook · 官方文档", href: "https://sre.google/workbook/production-readiness-review/", description: "面向部署验收、监控与故障处置的检查清单。", cover: "/resource-covers/production-readiness-review-real-v2.jpg" },
    { kind: "video", title: biliVideo?.title || "FDE 现场交付复盘", source: biliVideo?.author ? `B站 · ${biliVideo.author}` : "B站 · 真实视频", href: biliVideo?.url || "https://www.bilibili.com/video/BV1AJMq6eEum", description: "从需求澄清到方案落地的真实驻场复盘。", cover: biliVideo?.cover || FDE_FEATURED_VIDEOS[0].cover },
  ]
  return (
    <div className="lr-resource-overview mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const style = RESOURCE_STYLE[item.kind]
        return <a key={item.kind} href={item.href} target="_blank" rel="noreferrer noopener" onClick={() => track("external_resource_open", item.kind, item.title)} className={`lr-resource-card lr-resource-${item.kind} group overflow-hidden rounded-[20px] border border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_8px_22px_rgba(24,35,45,.045)] transition hover:-translate-y-0.5 hover:border-[#9FB1BC]`}>
          <ResourcePreview kind={item.kind} title={item.title} cover={item.cover} />
          <div className="p-3"><h3 className="line-clamp-2 text-sm font-bold text-[#18232D]">{item.title}</h3><p className="mt-1 text-[10px] font-semibold text-[#66717B]">{item.source}</p><p className="mt-2 text-[11px] leading-4 text-[#7A817F]">{item.description}</p><span className={`mt-3 inline-flex items-center gap-1 text-[10px] font-bold ${style.text}`}>{item.kind === "video" ? "打开视频" : "打开原文"}<ExternalLink className="size-3" /></span></div>
        </a>
      })}
    </div>
  )
}

function ResourcePreview({ kind, title, cover, compact = false }: { kind: ResourceKind; title: string; cover?: string; compact?: boolean }) {
  const frame = compact ? "h-28" : "aspect-[16/8]"
  if (kind === "video") {
    return <div className={`relative overflow-hidden bg-[#18232D] ${frame}`}><img src={cover} alt={`${title} 视频封面`} loading="lazy" className="size-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-[#18232D]/10"><span className="grid size-12 place-items-center rounded-full bg-white/90 text-[#A44F3A] shadow-lg"><Play className="ml-0.5 size-5" fill="currentColor" /></span></span><span className="absolute left-3 top-3 rounded-full bg-[#A44F3A] px-2 py-1 text-[9px] font-bold text-white">视频</span></div>
  }
  if (cover) {
    return <div className={`relative overflow-hidden bg-[#DCE7ED] ${frame}`}><img src={cover} alt={`${title} 真实封面`} loading="lazy" className="size-full object-cover" /><span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#102D3D]/45 to-transparent" /><span className="absolute left-3 top-3 rounded-full bg-[#173D5B]/90 px-2 py-1 text-[9px] font-bold text-white shadow-sm">{RESOURCE_STYLE[kind].label}</span></div>
  }
  if (kind === "book") {
    return <div className={`relative overflow-hidden bg-[#D3AA58] ${frame}`}><div className="absolute -right-8 -top-8 size-32 rounded-full border-[18px] border-[#EFD590]/65" /><div className="absolute bottom-0 left-1/2 h-[78%] w-[44%] -translate-x-1/2 rounded-sm border-l-[7px] border-[#5C3B1A] bg-[#F8E6B8] px-3 py-3 shadow-[8px_8px_0_rgba(91,59,26,.22)]"><span className="block text-[8px] font-bold tracking-[.14em] text-[#845E24]">FIELD NOTES</span><strong className="mt-3 block text-xs leading-4 text-[#392611]">{title}</strong><span className="absolute bottom-3 block text-[8px] font-bold text-[#845E24]">书籍</span></div><span className="absolute left-3 top-3 rounded-full bg-[#5C3B1A] px-2 py-1 text-[9px] font-bold text-white">书籍</span></div>
  }
  if (kind === "paper") {
    return <div className={`relative overflow-hidden bg-[#DCE7ED] ${frame}`}><img src="/resource-covers/fde-industry-report.jpg" alt="论文资料缩略图" className="absolute inset-0 size-full object-cover opacity-35" /><div className="absolute bottom-3 left-1/2 h-[82%] w-[58%] -translate-x-1/2 border border-[#AFC0CC] bg-white px-3 py-3 shadow-lg"><span className="block text-[8px] font-bold tracking-[.12em] text-[#315E83]">RESEARCH PAPER</span><strong className="mt-3 block line-clamp-3 text-[10px] leading-4 text-[#223C50]">{title}</strong><div className="mt-3 h-px w-full bg-[#B4C7D3]" /><div className="mt-2 h-1 w-4/5 bg-[#D8E3E9]" /><div className="mt-1 h-1 w-3/5 bg-[#D8E3E9]" /></div><span className="absolute left-3 top-3 rounded-full bg-[#315E83] px-2 py-1 text-[9px] font-bold text-white">论文</span></div>
  }
  return <div className={`relative overflow-hidden bg-[#DCE8DA] ${frame}`}><img src={cover || "/resource-covers/fde-industry-report.jpg"} alt="文档资料缩略图" className="absolute inset-0 size-full object-cover opacity-35" /><div className="absolute bottom-3 left-1/2 h-[82%] w-[58%] -translate-x-1/2 rounded-sm border border-[#9AB094] bg-[#FFFEFA] px-3 py-3 shadow-lg"><span className="block text-[8px] font-bold tracking-[.12em] text-[#52704D]">DELIVERY CHECKLIST</span><strong className="mt-2 block line-clamp-2 text-[10px] leading-4 text-[#29452D]">{title}</strong>{["Capacity", "Monitoring", "Rollback"].map((line) => <span key={line} className="mt-2 flex items-center gap-1.5 text-[8px] font-semibold text-[#52704D]"><i className="grid size-2 place-items-center rounded-sm border border-[#6F8A69] text-[6px]">✓</i>{line}</span>)}</div><span className="absolute left-3 top-3 rounded-full bg-[#52704D] px-2 py-1 text-[9px] font-bold text-white">文档</span></div>
}

function ExtendedReading({ items }: { items: ExtendedReadingItem[] }) {
  return (
    <section className="lr-resource-reading mt-10 border-t border-[#E3DED3] pt-8" aria-label="拓展阅读">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-[#6F8A69]"><Library className="size-3.5" />拓展阅读</div>
          <h2 className="mt-1 text-base font-bold text-[#18232D]">从需求澄清到生产交付的真实资料</h2>
        </div>
        <span className="text-[10px] font-semibold text-[#7A817F]">{items.length} 项已核验外部资料</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const style = RESOURCE_STYLE[item.kind]
          const Icon = style.icon
          return (
            <a key={item.title} href={item.href} target="_blank" rel="noreferrer noopener" onClick={() => track("external_resource_open", `extended_${item.kind}`, item.title)} className={`lr-reading-card lr-resource-${item.kind} group flex min-h-40 flex-col rounded-[16px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 transition hover:-translate-y-0.5 hover:border-[#9FB1BC]`}>
              <ResourcePreview kind={item.kind} title={item.title} cover={item.cover} compact />
              <div className="mt-3 flex items-start justify-between gap-3">
                <span className={`grid size-8 place-items-center rounded-lg bg-[#F3F0E8] ${style.text}`}><Icon className="size-3.5" /></span>
                <span className={`rounded-full bg-[#F3F0E8] px-2 py-1 text-[9px] font-bold ${style.text}`}>{style.label}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold leading-5 text-[#18232D]">{item.title}</h3>
              <p className="mt-1 text-[10px] font-semibold text-[#66717B]">{item.source}</p>
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#7A817F]">{item.description}</p>
              <span className={`mt-auto pt-3 inline-flex items-center gap-1 text-[10px] font-bold ${style.text}`}>打开原文 <ExternalLink className="size-3" /></span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
