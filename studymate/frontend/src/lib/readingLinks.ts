export interface ReadingLinkInput {
  title: string
  type: "book" | "paper" | "blog" | "video" | "doc" | "course"
  url?: string
  source?: string
  lang?: "zh" | "en"
  resolvedUrl?: string
  resolvedLabel?: string
}

export interface ReadingResolvedLink {
  url: string
  label: string
  kind: "direct" | "search"
}

export interface ReadingLinkSet {
  primary: ReadingResolvedLink
  fallback?: ReadingResolvedLink
}

const enc = (value: string) => encodeURIComponent(value.trim())
const bing = (query: string) => `https://cn.bing.com/search?q=${enc(query)}`
const bingSite = (domain: string, topic: string) => bing(`site:${domain} ${topic}`)

const OFFICIAL_DOC_DOMAINS = [
  "python.org",
  "numpy.org",
  "scipy.org",
  "scikit-learn.org",
  "pytorch.org",
  "tensorflow.org",
  "mozilla.org",
  "w3.org",
  "ietf.org",
  "rfc-editor.org",
  "wireshark.org",
  "riscv.org",
  "mit.edu",
  "wisc.edu",
  "visualgo.net",
  "distill.pub",
  "paperswithcode.com",
  "xfyun.cn",
]

function officialDocumentUrl(value?: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:") return null
    const host = parsed.hostname.toLowerCase()
    const allowed = OFFICIAL_DOC_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
    return allowed ? parsed.toString() : null
  } catch {
    return null
  }
}

function talentCourseUrl(item: ReadingLinkInput): string | null {
  if (item.type !== "course" || !item.url || !(item.source || "").includes("人才呀")) return null
  try {
    const parsed = new URL(item.url)
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.hostname !== "rencaiya.vip") return null
    return /^\/college\/courseinfo\/\d+\/?$/.test(parsed.pathname) ? parsed.toString() : null
  } catch {
    return null
  }
}

function verifiedResolvedUrl(item: ReadingLinkInput): string | null {
  if (!item.resolvedUrl) return null
  try {
    const parsed = new URL(item.resolvedUrl)
    if (parsed.protocol !== "https:") return null
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    const allowed = item.type === "paper"
      ? ((host === "arxiv.org" || host === "www.arxiv.org") && path.startsWith("/abs/"))
        || (host === "doi.org" && /^\/10\.\d{4,9}\/.+/.test(path))
      : item.type === "book"
        ? host === "book.douban.com" && /^\/subject\/\d+\/?$/.test(path)
        : item.type === "blog"
          ? (host === "blog.csdn.net" && /^\/[^/]+\/article\/details\/\d+\/?$/.test(path))
            || (host === "juejin.cn" && /^\/post\/\d+\/?$/.test(path))
          : false
    return allowed ? parsed.toString() : null
  } catch {
    return null
  }
}

export function resolveReadingLinks(item: ReadingLinkInput, selectedTopic: string): ReadingLinkSet {
  const topic = selectedTopic.trim() || item.title.trim() || "课程主题"
  const title = item.title.trim() || topic
  const source = (item.source || "").trim()
  const genericFallback: ReadingResolvedLink = { url: bing(`${topic} ${source || title}`), label: "备用搜索", kind: "search" }
  const courseUrl = talentCourseUrl(item)
  if (courseUrl) {
    return {
      primary: { url: courseUrl, label: "打开人才呀课程", kind: "direct" },
      fallback: genericFallback,
    }
  }

  const official = item.type === "doc" ? officialDocumentUrl(item.url) : null
  if (official) {
    return {
      primary: { url: official, label: "打开官方原文", kind: "direct" },
      fallback: genericFallback,
    }
  }

  const resolved = verifiedResolvedUrl(item)
  if (resolved) {
    return {
      primary: { url: resolved, label: item.resolvedLabel?.trim() || "打开原文", kind: "direct" },
      fallback: genericFallback,
    }
  }

  if (item.type === "paper") {
    if (item.lang === "en") {
      return {
        primary: { url: `https://arxiv.org/search/?query=${enc(title)}&searchtype=all`, label: "arXiv 搜论文", kind: "search" },
        fallback: { url: bing(`${title} paper`), label: "备用论文搜索", kind: "search" },
      }
    }
    return {
      primary: { url: `https://kns.cnki.net/kns8s/defaultresult/index?kw=${enc(topic)}`, label: "知网搜主题（可能需验证）", kind: "search" },
      fallback: { url: bing(`${topic} 论文`), label: "备用论文搜索", kind: "search" },
    }
  }

  if (item.type === "book") {
    return {
      primary: { url: `https://search.douban.com/book/subject_search?search_text=${enc(title)}`, label: "豆瓣找书", kind: "search" },
      fallback: { url: bing(`${title} 书籍`), label: "备用找书", kind: "search" },
    }
  }

  if (item.type === "video") {
    return {
      primary: { url: `https://search.bilibili.com/all?keyword=${enc(topic)}`, label: "B 站搜主题", kind: "search" },
      fallback: { url: bing(`${topic} 视频`), label: "备用视频搜索", kind: "search" },
    }
  }

  if (item.type === "blog") {
    const normalizedSource = source.toLowerCase()
    if (normalizedSource.includes("csdn")) {
      return {
        primary: { url: bingSite("blog.csdn.net", topic), label: "搜索 CSDN 相关文章", kind: "search" },
        fallback: genericFallback,
      }
    }
    if (normalizedSource.includes("知乎")) {
      return {
        primary: { url: bingSite("zhihu.com", topic), label: "搜索知乎相关文章", kind: "search" },
        fallback: genericFallback,
      }
    }
    if (normalizedSource.includes("掘金")) {
      return {
        primary: { url: `https://juejin.cn/search?query=${enc(topic)}`, label: "掘金搜主题", kind: "search" },
        fallback: genericFallback,
      }
    }
    if (normalizedSource.includes("博客园") || normalizedSource.includes("cnblogs")) {
      return {
        primary: { url: `https://zzk.cnblogs.com/s/blogpost?w=${enc(topic)}`, label: "博客园搜主题", kind: "search" },
        fallback: genericFallback,
      }
    }
    return { primary: { url: genericFallback.url, label: "搜索相关文章", kind: "search" } }
  }

  return {
    primary: { url: bing(`${topic} ${source || title} 官方文档`), label: "搜索官方文档", kind: "search" },
    fallback: genericFallback,
  }
}
