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
  return cleaned || "岗位资料"
}

export function externalSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith("doi://")) return `https://doi.org/${url.slice("doi://".length)}`
  return null
}

export function sourceLink(chunkId: string, url: string | null | undefined) {
  // 检索结果先打开站内来源页：即使 GitHub 等外部站点暂时不可达，
  // 用户仍能核对已入库的命中片段、来源章节与相邻上下文。
  void url
  return { href: `/rag/source/${encodeURIComponent(chunkId)}`, external: false }
}

export function formatInternalLocator(url: string | null | undefined): string {
  if (!url) return "岗位知识库内部索引"
  if (url.startsWith("doc://")) return `岗位资料 / ${url.slice(6).replace(/#/g, " / ")}`
  if (url.startsWith("ai://")) return "岗位知识库内部索引"
  if (url.startsWith("doi://")) return `DOI ${url.slice(6)}`
  return externalSourceUrl(url) ? "外部权威来源" : "岗位知识库内部索引"
}

export function visibleMetadata(meta: Record<string, unknown>) {
  return Object.entries(meta).filter(([key, value]) => {
    const normalized = key.toLowerCase().replace(/[-\s]/g, "_")
    return (
      !normalized.includes("ai_generated") &&
      !normalized.includes("generated_by") &&
      !["generated", "citations", "source_notice", "source_status", "catalog_version"].includes(normalized) &&
      ["string", "number", "boolean"].includes(typeof value)
    )
  })
}
