/**
 * 哔哩哔哩讲解视频推荐 · 可视讲解的外部资源块
 * ------------------------------------------------------------------
 * 自产动画/黑板讲解之外，再聚合 B 站真人讲解视频（外链跳转）。
 * 后端 /bili/videos 只返回通过主题相关性校验的真实卡片；无可靠结果时由上方视觉卡提供精确搜索入口。
 */
import { useEffect, useState } from "react"
import { Tv, Play, Loader2 } from "lucide-react"
import { apiPost } from "@/lib/api"
import { track } from "@/lib/track"

export interface BiliVideo {
  bvid: string
  title: string
  author: string
  cover: string
  play: number
  duration: string
  url: string
  match_level?: "exact" | "related"
}
interface VideosResp {
  ok: boolean
  videos: BiliVideo[]
  search_url: string
  resolved_query?: string
  match_level?: "exact" | "related" | "fallback"
}

function fmtPlay(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

export function BiliVideos({
  keyword,
  conceptTitle,
  courseName,
  featuredVideos = [],
  onFirstVideo,
  onSearchUrl,
}: {
  keyword: string
  conceptTitle?: string | null
  courseName?: string | null
  onFirstVideo?: (video: BiliVideo | null) => void
  onSearchUrl?: (url: string | null) => void
  featuredVideos?: BiliVideo[]
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<VideosResp | null>(null)

  useEffect(() => {
    if (featuredVideos.length) {
      setLoading(false)
      setData({ ok: true, videos: featuredVideos, search_url: "" })
      onFirstVideo?.(featuredVideos[0])
      onSearchUrl?.(null)
      return
    }
    const kw = keyword.trim()
    if (!kw) return
    let alive = true
    const frame = window.requestAnimationFrame(() => {
      setLoading(true)
      setData(null)
      onFirstVideo?.(null)
      onSearchUrl?.(null)
      const roleLabel = (courseName || "").replace(/\s*岗位知识库\s*$/, "").trim()
      const fallbackQuery = [conceptTitle?.trim() || kw, roleLabel]
        .filter((value, index, values) => value && values.findIndex((candidate) => candidate === value) === index)
        .join(" ")
      void apiPost<VideosResp>("/bili/videos", {
        keyword: kw,
        limit: 6,
        concept_title: conceptTitle?.trim() || undefined,
        course_name: courseName?.trim() || undefined,
      })
        .then((r) => {
          if (!alive) return
          setData(r)
          onFirstVideo?.(r.ok && r.videos.length ? r.videos[0] : null)
          onSearchUrl?.(r.search_url || null)
        })
        .catch(() => {
          if (!alive) return
          const fallbackUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(fallbackQuery || kw)}`
          setData({ ok: false, videos: [], search_url: fallbackUrl })
          onFirstVideo?.(null)
          onSearchUrl?.(fallbackUrl)
        })
        .finally(() => alive && setLoading(false))
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [conceptTitle, courseName, featuredVideos, keyword, onFirstVideo, onSearchUrl])

  const videos = data?.ok && data.videos.length > 0 ? data.videos : []

  return (
    <div className="mt-6">
      <h2 className="mb-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[#27343D]">
        <span className="grid size-8 place-items-center rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]"><Tv className="size-4" /></span> B 站上的讲解视频
        <span className="text-xs font-normal text-[var(--muted-foreground)]/70">· 仅展示主题相关性校验通过的结果</span>
      </h2>

      {loading && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CFC8B9] bg-[#F8F6F0] py-8 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" /> 正在 B 站找讲解视频…
        </div>
      )}

      {!loading && videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {videos.map((v) => (
            <a
              key={v.bvid}
              href={v.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => track("external_resource_open", "bilibili_video", v.bvid, { keyword, title: v.title })}
              className="paper-lift group overflow-hidden rounded-[18px] border border-[#D7D1C4] bg-[#FFFEFA] hover:border-[#C69A87]"
            >
              <div className="relative aspect-video bg-[var(--muted)] overflow-hidden">
                {v.cover ? (
                  <img src={v.cover} alt={v.title} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#244C66_0%,#315E83_52%,#6F8A69_100%)] p-4 text-white">
                    <span className="block text-[10px] font-bold tracking-[0.14em] text-white/75">FDE FIELD DELIVERY</span>
                    <strong className="mt-3 block max-w-[15rem] text-base leading-6">{v.title}</strong>
                    <span className="absolute bottom-3 left-4 inline-flex items-center gap-1 text-[10px] font-bold text-white/85"><Tv className="size-3" />视频详情</span>
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-[#18232D]/0 opacity-0 transition-all group-hover:bg-[#18232D]/32 group-hover:opacity-100">
                  <span className="grid size-12 place-items-center rounded-full bg-[#FFFEFA]/92 text-[#A65339] shadow-lg"><Play className="ml-0.5 size-5" fill="currentColor" /></span>
                </span>
                {v.duration && (
                  <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/70 rounded px-1 py-0.5">{v.duration}</span>
                )}
                <span className="absolute left-2 top-2 rounded-full border border-white/60 bg-[#244C66]/90 px-2 py-1 text-[9px] font-bold text-white">
                  {v.match_level === "related" ? "相关补充" : "直接相关"}
                </span>
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--foreground)] transition-colors group-hover:text-[#A65339]">{v.title}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)] flex items-center justify-between">
                  <span className="truncate">{v.author}</span>
                  <span className="shrink-0 ml-2">{v.play ? `▶ ${fmtPlay(v.play)}` : "打开视频"}</span>
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 没有真实卡片时不再追加一条纯文字兜底；上方资源卡会保留可点击入口。 */}
    </div>
  )
}
