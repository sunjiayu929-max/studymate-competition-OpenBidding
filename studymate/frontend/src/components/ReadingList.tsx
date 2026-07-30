import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { BookOpen, FileText, Globe, Video, FileCode, ExternalLink, GraduationCap, Loader2, ShieldCheck } from "lucide-react"
import { apiGet, apiPost } from "@/lib/api"
import { resolveReadingLinks } from "@/lib/readingLinks"
import { useCurrentCourse } from "@/store/course"

export interface ReadingItem {
  title: string
  type: "book" | "paper" | "blog" | "video" | "doc" | "course"
  url: string
  source: string
  difficulty: "入门" | "进阶" | "深入"
  summary: string
  /** 资源语言：zh 中文 / en 英文。论文据此决定跳知网还是 arXiv */
  lang?: "zh" | "en"
}

const LANG_LABEL: Record<"zh" | "en", string> = { zh: "中文", en: "EN" }

const TYPE_META: Record<ReadingItem["type"], { icon: React.ElementType; label: string; color: string }> = {
  course: { icon: GraduationCap, label: "讯飞人才呀课程", color: "border-[#B9C9D3] bg-[#E7EDF3] text-[#315E83]" },
  book: { icon: BookOpen, label: "书籍", color: "border-[#D8C9A8] bg-[#F7F2E7] text-[#8E6925]" },
  paper: { icon: FileText, label: "论文", color: "border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]" },
  blog: { icon: Globe, label: "博客", color: "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]" },
  doc: { icon: FileCode, label: "文档", color: "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" },
  video: { icon: Video, label: "视频", color: "border-[#D5CFD8] bg-[#EEE9EF] text-[#706178]" },
}

// 可验证直达来源优先，其余资源保留明确的搜索入口。
const CATEGORY_ORDER: ReadingItem["type"][] = ["course", "doc", "book", "paper", "blog", "video"]

interface RencaiyaCourse {
  course_id: number
  title: string
  summary: string
  difficulty: string
  url: string
  match_level?: "exact" | "related" | "course"
}

interface RencaiyaCoursesResponse {
  provider: string
  match_level: "exact" | "related" | "course" | "fallback"
  items: RencaiyaCourse[]
}

interface ReadingResolvedItem {
  index: number
  url: string
  provider: string
  label: string
  score: number
}

interface ReadingResolveResponse {
  count: number
  items: ReadingResolvedItem[]
}

interface BiliVideo {
  bvid: string
  title: string
  author: string
  play: number
  url: string
}

interface BiliVideosResponse {
  ok: boolean
  videos?: BiliVideo[]
}

function readingItemKey(item: ReadingItem): string {
  return [item.type, item.title, item.source].map((value) => value.trim().toLowerCase()).join(":")
}

function courseDifficulty(value: string): ReadingItem["difficulty"] {
  if (value === "高级") return "深入"
  if (value === "中级") return "进阶"
  return "入门"
}

function mergeReadingItems(preferred: ReadingItem[], generated: ReadingItem[]): ReadingItem[] {
  const merged: ReadingItem[] = []
  const seen = new Set<string>()
  for (const item of [...preferred, ...generated]) {
    const key = item.url?.trim() ? `url:${item.url.trim().toLowerCase()}` : `title:${item.title.trim().toLowerCase()}`
    if (!item.title.trim() || seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

const DIFFICULTY_COLOR: Record<ReadingItem["difficulty"], string> = {
  入门: "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]",
  进阶: "border-[#C7D2D8] bg-[#E7EDF3] text-[#315E83]",
  深入: "border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]",
}

/** 单条推荐（类型已由分类标题表达，行内不再重复 type 标签） */
function ItemRow({ it, topic, resolved }: { it: ReadingItem; topic: string; resolved?: ReadingResolvedItem }) {
  const links = resolveReadingLinks({ ...it, resolvedUrl: resolved?.url, resolvedLabel: resolved?.label }, topic)
  return (
    <article className="paper-lift rounded-2xl border border-[#D7D1C4] bg-[#FFFEFA] p-3.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-medium text-sm leading-tight">{it.title}</span>
        {(it.type === "paper" || it.type === "book") && it.lang && (
          <span className="rounded-full border border-[#D7D1C4] bg-[#F1EDE4] px-1.5 py-0.5 text-[10px] text-[#66717B]">
            {LANG_LABEL[it.lang]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${DIFFICULTY_COLOR[it.difficulty]}`}>
          {it.difficulty}
        </span>
        {it.source && (
          <>
            <span className="text-[10px] text-[var(--muted-foreground)]">·</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">{it.source}</span>
          </>
        )}
        {resolved && (
          <span className="text-[10px] font-medium text-[#557052]">· 已匹配：{resolved.provider}</span>
        )}
      </div>
      {it.summary && (
        <p className="text-xs text-[var(--muted-foreground)] mt-1.5 leading-relaxed">{it.summary}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        <a href={links.primary.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[11px] font-semibold hover:underline ${links.primary.kind === "direct" ? "text-[#557052]" : "text-[#315E83]"}`}>
          <ExternalLink className="size-3" /> {links.primary.label}
        </a>
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${links.primary.kind === "direct" ? "border-[#C9D1CB] bg-[#E9EEE6] text-[#557052]" : "border-[#D7D1C4] bg-[#F1EDE4] text-[#7A817F]"}`}>
          {links.primary.kind === "direct" ? "可直达" : "搜索入口"}
        </span>
        {links.fallback && links.fallback.url !== links.primary.url && (
          <a href={links.fallback.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6F787A] hover:text-[#315E83] hover:underline">{links.fallback.label}</a>
        )}
      </div>
    </article>
  )
}

export function ReadingList({ items, topic = "" }: { items: ReadingItem[]; topic?: string }) {
  const course = useCurrentCourse()
  const [externalItems, setExternalItems] = useState<ReadingItem[]>([])
  const [externalLoading, setExternalLoading] = useState(false)
  const [verifiedVideoItems, setVerifiedVideoItems] = useState<ReadingItem[]>([])
  const [videoLoading, setVideoLoading] = useState(false)
  const [resolvedLinks, setResolvedLinks] = useState<Record<string, ReadingResolvedItem>>({})
  const [resolvingLinks, setResolvingLinks] = useState(false)

  useEffect(() => {
    let alive = true
    const frame = window.requestAnimationFrame(() => {
      const keyword = topic.trim()
      if (!keyword) {
        setExternalItems([])
        setExternalLoading(false)
        return
      }

      setExternalLoading(true)
      const load = async () => {
        const exactQuery = new URLSearchParams({ keyword, limit: "3" })
        if (course?.id) exactQuery.set("course_id", String(course.id))
        const result = await apiGet<RencaiyaCoursesResponse>(`/rencaiya/courses?${exactQuery}`)

        if (!alive) return
        const matched = result.match_level === "exact" || result.match_level === "related" || result.match_level === "course"
          ? result.items
          : []
        setExternalItems(matched.slice(0, 3).map((item) => ({
          title: item.title,
          type: "course",
          lang: "zh",
          url: item.url,
          source: `${result.provider} · ${(item.match_level || result.match_level) === "course" ? "课程方向补充" : "知识点匹配"}`,
          difficulty: courseDifficulty(item.difficulty),
          summary: item.summary || "前往人才呀查看课程介绍与学习内容。",
        })))
      }

      void load()
        .catch(() => { if (alive) setExternalItems([]) })
        .finally(() => { if (alive) setExternalLoading(false) })
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [course?.id, topic])

  useEffect(() => {
    const keyword = topic.trim()
    if (!keyword) {
      setVerifiedVideoItems([])
      setVideoLoading(false)
      return
    }

    let alive = true
    const frame = window.requestAnimationFrame(() => {
      setVideoLoading(true)
      setVerifiedVideoItems([])
      void apiPost<BiliVideosResponse>("/bili/videos", {
        keyword,
        limit: 2,
        concept_title: keyword,
        course_name: course?.name || undefined,
      })
        .then((result) => {
          if (!alive || !result.ok) return
          setVerifiedVideoItems((result.videos || []).slice(0, 2).map((video) => ({
            title: video.title,
            type: "video",
            lang: "zh",
            url: video.url,
            source: `B站${video.author ? ` · ${video.author}` : ""}`,
            difficulty: "入门",
            summary: "B站公开讲解视频，已按当前知识点完成相关性筛选。",
          })))
        })
        .catch(() => { if (alive) setVerifiedVideoItems([]) })
        .finally(() => { if (alive) setVideoLoading(false) })
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [course?.name, topic])

  useEffect(() => {
    let alive = true
    const candidates = (items || [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === "paper" || item.type === "book" || item.type === "blog")
      .slice(0, 12)

    setResolvedLinks({})
    if (candidates.length === 0) {
      setResolvingLinks(false)
      return () => { alive = false }
    }

    setResolvingLinks(true)
    void apiPost<ReadingResolveResponse>("/reading/resolve", {
      items: candidates.map(({ item, index }) => ({
        index,
        title: item.title,
        type: item.type,
        source: item.source || "",
        lang: item.lang,
      })),
    })
      .then((result) => {
        if (!alive) return
        const next: Record<string, ReadingResolvedItem> = {}
        for (const match of result.items || []) {
          const original = items[match.index]
          if (!original) continue
          next[readingItemKey(original)] = match
        }
        setResolvedLinks(next)
      })
      .catch(() => { if (alive) setResolvedLinks({}) })
      .finally(() => { if (alive) setResolvingLinks(false) })

    return () => { alive = false }
  }, [items])

  const verifiedVideoLinks = useMemo(() => {
    const links: Record<string, ReadingResolvedItem> = {}
    for (const item of verifiedVideoItems) {
      links[readingItemKey(item)] = {
        index: -1,
        url: item.url,
        provider: "哔哩哔哩",
        label: "打开 B站视频",
        score: 1,
      }
    }
    return links
  }, [verifiedVideoItems])

  const combinedItems = useMemo(() => {
    const generated = verifiedVideoItems.length > 0
      ? (items || []).filter((item) => item.type !== "video")
      : (items || [])
    return mergeReadingItems([...externalItems, ...verifiedVideoItems], generated)
  }, [externalItems, items, verifiedVideoItems])

  if (!combinedItems.length && !externalLoading && !videoLoading) {
    return <div className="rounded-2xl border border-dashed border-[#CFC8B9] bg-[#F8F6F0] py-8 text-center text-xs text-[var(--muted-foreground)]">暂无推荐资源</div>
  }
  // 按类型分组，只展示有内容的分类，顺序固定
  const groups = CATEGORY_ORDER.map((type) => ({
    type,
    list: combinedItems.filter((it) => it.type === type),
  })).filter((g) => g.list.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-2xl border border-[#C9D1CB] bg-[#E9EEE6] px-3.5 py-3 text-[11px] leading-5 text-[#557052]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>已优先展示可验证的官方原文、知识点或课程方向匹配的人才呀课程和真实 B站视频，并尝试匹配论文、书籍和博客的详情页；未可靠匹配的资源仍会明确标记为搜索入口。</span>
      </div>
      {externalLoading && <div role="status" className="inline-flex items-center gap-1.5 text-[11px] text-[#66717B]"><Loader2 className="size-3.5 animate-spin" />正在匹配人才呀课程…</div>}
      {videoLoading && <div role="status" className="inline-flex items-center gap-1.5 text-[11px] text-[#66717B]"><Loader2 className="size-3.5 animate-spin" />正在匹配 B站真实视频…</div>}
      {resolvingLinks && <div role="status" className="inline-flex items-center gap-1.5 text-[11px] text-[#66717B]"><Loader2 className="size-3.5 animate-spin" />正在解析论文、书籍和博客直达地址…</div>}
      {groups.map((g, gi) => {
        const meta = TYPE_META[g.type]
        const Icon = meta.icon
        return (
          <motion.section
            key={g.type}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: gi * 0.06 }}
          >
            {/* 分类标题：图标 + 名称 + 数量，一眼看清这一组是什么 */}
            <h3 className="mb-2.5 flex items-center gap-2">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${meta.color}`}>
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-semibold text-[var(--foreground)]">{meta.label}</span>
              <span className="text-[11px] text-[var(--muted-foreground)]">{g.list.length} 项</span>
            </h3>
            <div className="space-y-2 pl-1">
              {g.list.map((it, i) => (
                <ItemRow key={`${it.title}-${i}`} it={it} topic={topic} resolved={resolvedLinks[readingItemKey(it)] || verifiedVideoLinks[readingItemKey(it)]} />
              ))}
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}
