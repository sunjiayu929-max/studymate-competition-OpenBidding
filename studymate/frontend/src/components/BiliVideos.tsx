/**
 * 哔哩哔哩讲解视频推荐 · 可视讲解的外部资源块
 * ------------------------------------------------------------------
 * 自产动画/黑板讲解之外，再聚合 B 站真人讲解视频（外链跳转）。
 * 后端 /bili/videos 拿卡片；拿不到（风控/失败）则退回「去 B 站搜」按钮，永不开天窗。
 */
import { useEffect, useState } from "react"
import { Tv, ExternalLink, Play, Loader2 } from "lucide-react"
import { apiPost } from "@/lib/api"
import { track } from "@/lib/track"

interface BiliVideo {
  bvid: string
  title: string
  author: string
  cover: string
  play: number
  duration: string
  url: string
}
interface VideosResp {
  ok: boolean
  videos: BiliVideo[]
  search_url: string
  resolved_query?: string
}

function fmtPlay(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

export function BiliVideos({
  keyword,
  conceptTitle,
  courseName,
}: {
  keyword: string
  conceptTitle?: string | null
  courseName?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<VideosResp | null>(null)

  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) return
    let alive = true
    const frame = window.requestAnimationFrame(() => {
      setLoading(true)
      setData(null)
      void apiPost<VideosResp>("/bili/videos", {
        keyword: kw,
        limit: 6,
        concept_title: conceptTitle?.trim() || undefined,
        course_name: courseName?.trim() || undefined,
      })
        .then((r) => alive && setData(r))
        .catch(() => alive && setData({ ok: false, videos: [], search_url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(kw)}` }))
        .finally(() => alive && setLoading(false))
    })
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [conceptTitle, courseName, keyword])

  const searchUrl = data?.search_url ?? `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`
  const resolvedQuery = data?.resolved_query || conceptTitle || keyword

  return (
    <div className="mt-6">
      <h2 className="mb-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[#27343D]">
        <span className="grid size-8 place-items-center rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]"><Tv className="size-4" /></span> B 站上的讲解视频
        <span className="text-xs font-normal text-[var(--muted-foreground)]/70">· 真人讲解，外部补充</span>
      </h2>

      {loading && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CFC8B9] bg-[#F8F6F0] py-8 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" /> 正在 B 站找讲解视频…
        </div>
      )}

      {!loading && data?.ok && data.videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.videos.map((v) => (
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
                  <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
                    <Tv className="size-6" />
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-[#18232D]/0 opacity-0 transition-all group-hover:bg-[#18232D]/32 group-hover:opacity-100">
                  <span className="grid size-12 place-items-center rounded-full bg-[#FFFEFA]/92 text-[#A65339] shadow-lg"><Play className="ml-0.5 size-5" fill="currentColor" /></span>
                </span>
                {v.duration && (
                  <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/70 rounded px-1 py-0.5">{v.duration}</span>
                )}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--foreground)] transition-colors group-hover:text-[#A65339]">{v.title}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)] flex items-center justify-between">
                  <span className="truncate">{v.author}</span>
                  <span className="shrink-0 ml-2">▶ {fmtPlay(v.play)}</span>
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 兜底：拿不到卡片 → 去 B 站搜 */}
      {!loading && (!data?.ok || data.videos.length === 0) && (
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={() => track("external_resource_open", "bilibili_search", keyword)}
          className="paper-lift group flex items-center gap-3 rounded-[18px] border border-[#D7D1C4] bg-[#FFFEFA] p-4 hover:border-[#C69A87] hover:bg-[#FBFAF6]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#DFC9BE] bg-[#F6ECE7] text-[#A65339]">
            <Tv className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-[var(--foreground)] transition-colors group-hover:text-[#A65339]">
              去 B 站精确搜索「{resolvedQuery}」
            </span>
            <span className="block text-xs text-[var(--muted-foreground)]">暂未找到高相关卡片，已隐藏可能跑题的结果</span>
          </span>
          <ExternalLink className="size-4 text-[var(--muted-foreground)] transition-colors group-hover:text-[#A65339]" />
        </a>
      )}
    </div>
  )
}
