export function cleanSourceLabel(source: string | null | undefined) {
  return (source || "")
    .replace(/^AI\s*生成\s*[·._—-]?\s*/i, "")
    .replace(/^AI\s*generated\s*[·._—-]?\s*/i, "")
    .trim()
}

export function formatSourceLabel(source: string) {
  const cleaned = cleanSourceLabel(source)
    .replace(/^教材(?:原文)?\s*[·._—-]?\s*/i, "")
    .trim()
  return `教材原文 · ${cleaned || "课程资料"}`
}

export function externalSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith("doi://")) return `https://doi.org/${url.slice("doi://".length)}`
  return null
}

export function sourceLink(chunkId: string, url: string | null | undefined) {
  const external = externalSourceUrl(url)
  return external
    ? { href: external, external: true }
    : { href: `/rag/source/${encodeURIComponent(chunkId)}`, external: false }
}

export function formatInternalLocator(url: string | null | undefined): string {
  if (!url) return "课程知识库内部索引"
  if (url.startsWith("doc://")) return `课程资料 / ${url.slice(6).replace(/#/g, " / ")}`
  if (url.startsWith("ai://")) return "课程知识库内部索引"
  if (url.startsWith("doi://")) return `DOI ${url.slice(6)}`
  return externalSourceUrl(url) ? "外部权威来源" : "课程知识库内部索引"
}

export function visibleMetadata(meta: Record<string, unknown>) {
  return Object.entries(meta).filter(([key]) => {
    const normalized = key.toLowerCase().replace(/[-\s]/g, "_")
    return !normalized.includes("ai_generated") && !normalized.includes("generated_by") && normalized !== "generated"
  })
}
