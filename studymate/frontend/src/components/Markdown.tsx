import { Children, cloneElement, isValidElement, lazy, Suspense, type ReactNode, type ComponentType, type HTMLAttributes } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { formatSourceLabel } from "@/lib/ragSource"
import { cn } from "@/lib/utils"

const MathMarkdownRenderer = lazy(() =>
  import("@/components/MathMarkdownRenderer").then((module) => ({ default: module.MathMarkdownRenderer })),
)

export interface Citation {
  index: number
  chunk_id?: string
  source?: string
  page?: number | null
  url?: string | null
  snippet?: string
}

interface MarkdownProps {
  content: string
  className?: string
  citations?: Citation[]
  onCitationClick?: (index: number) => void
}

/** 把 children 树里所有字符串节点拆出 [n] 替换为 badge。其它节点原样保留并递归。 */
function transformChildren(
  children: ReactNode,
  render: (text: string) => ReactNode
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return render(child)
    if (typeof child === "number") return child
    if (Array.isArray(child)) return transformChildren(child, render)
    if (isValidElement(child)) {
      // a/code 等元素内的 [n] 不替换（避免影响链接 / 代码块）
      const type = child.type as string | ComponentType
      const tag = typeof type === "string" ? type : ""
      if (tag === "a" || tag === "code" || tag === "pre") return child
      const props = child.props as { children?: ReactNode } & Record<string, unknown>
      if (props.children == null) return child
      return cloneElement(
        child,
        {},
        transformChildren(props.children, render)
      )
    }
    return child
  })
}

function splitTextWithCitations(
  text: string,
  citations: Citation[],
  onClick?: (i: number) => void
): ReactNode {
  const parts = text.split(/(\[\d+\])/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return part
    const idx = parseInt(m[1], 10)
    const cit = citations.find((c) => c.index === idx)
    if (!cit) return part
    return <CitationBadge key={`cit-${i}-${idx}`} citation={cit} onClick={() => onClick?.(idx)} />
  })
}

function CitationBadge({ citation, onClick }: { citation: Citation; onClick?: () => void }) {
  const titleParts = [formatSourceLabel(citation.source || ""), citation.page ? `p.${citation.page}` : null]
    .filter(Boolean)
    .join(" · ")
  return (
    <span className="group relative inline-block align-baseline">
      <button
        type="button"
        onClick={onClick}
        className="mx-0.5 inline-flex h-4 min-w-[1.25rem] cursor-pointer items-center justify-center rounded-md border border-[#C7D2D8] bg-[#E7EDF3] px-1 align-baseline font-mono text-[10px] font-bold text-[#315E83] transition-colors hover:border-[#9FB1BC] hover:bg-[#DCE6EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315E83]/30"
        aria-label={`引用 ${citation.index}：${titleParts || "未知出处"}`}
      >
        [{citation.index}]
      </button>
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-72 max-w-[80vw] -translate-x-1/2 rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] p-3 text-left text-xs shadow-[0_14px_34px_rgba(24,35,45,.14)] group-hover:block group-focus-within:block"
      >
        <span className="mb-1 block truncate font-semibold text-[#315E83]">
引用来源 · {titleParts || "未知出处"}
        </span>
        <span className="line-clamp-4 block leading-5 text-[#66717B]">{citation.snippet || "暂无原文摘要"}</span>
        <span className="mt-1.5 block text-[10px] text-[#8E6925]">{onClick ? "点击定位到可追溯来源 →" : "该引用已记录在内容中"}</span>
      </span>
    </span>
  )
}

type SegmentTransform = (value: string) => string

/**
 * 只处理 Markdown 正文，围栏代码块和行内代码保持原样。
 * 这样既不会给代码内容插入转义符，也能避免代码里的 `$` 触发 KaTeX 懒加载。
 */
function mapMarkdownSegments(
  content: string,
  proseTransform: SegmentTransform,
  codeTransform: SegmentTransform = (value) => value,
): string {
  let fence: { char: string; length: number } | null = null

  return content.split("\n").map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1]
    if (marker) {
      if (!fence) fence = { char: marker[0], length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      return codeTransform(line)
    }
    if (fence) return codeTransform(line)

    const inlineCode = /(`+)([\s\S]*?)\1/gu
    let cursor = 0
    let result = ""
    for (const match of line.matchAll(inlineCode)) {
      const index = match.index ?? 0
      result += proseTransform(line.slice(cursor, index))
      result += codeTransform(match[0])
      cursor = index + match[0].length
    }
    result += proseTransform(line.slice(cursor))
    return result
  }).join("\n")
}

// MIPS/汇编寄存器在正文里常写成 `$1`、`$t0`、`$sp`。remark-math 会把相邻
// 两个寄存器误当成 `$...$` 公式，因此只在典型操作数边界处做展示层转义。
const ASSEMBLY_REGISTER = /(^|[^\\])(\$(?:3[01]|[12]\d|\d|zero|at|v[01]|a[0-3]|t\d|s[0-8]|k[01]|gp|sp|fp|ra))(?=\s*[,，;；:：)\]}。！？!?]|$)/giu

function prepareMarkdownContent(content: string): string {
  return mapMarkdownSegments(content, (segment) => (
    segment.replace(ASSEMBLY_REGISTER, (_match, prefix: string, register: string) => `${prefix}\\${register}`)
  ))
}

function containsMath(content: string): boolean {
  const proseOnly = mapMarkdownSegments(content, (value) => value, () => "")
  return /(^|[^\\])\$\$?[\s\S]*?\$\$?/.test(proseOnly)
}

function FormulaLoading() {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-[#D9CFB7] bg-[#FBF8F0] px-4 py-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#F4ECD8] font-serif text-sm font-bold text-[#8E6925]">Σ</span>
        <div className="min-w-0 flex-1">
          <strong className="block text-xs text-[#243746]">正在排版公式与正文</strong>
          <div className="mt-2 flex gap-1.5" aria-hidden="true"><span className="h-1.5 flex-1 animate-pulse rounded-full bg-[#315E83]" /><span className="h-1.5 w-1/3 animate-pulse rounded-full bg-[#B1842C] [animation-delay:120ms]" /><span className="h-1.5 w-1/5 animate-pulse rounded-full bg-[#6F8A69] [animation-delay:240ms]" /></div>
        </div>
      </div>
    </div>
  )
}

/** 通用 Markdown 渲染：GFM + 公式（KaTeX）+ 代码块 + [n] 可交互引用气泡。 */
export function Markdown({ content, className, citations, onCitationClick }: MarkdownProps) {
  const enableCitations = !!citations && citations.length > 0
  const wrap = enableCitations
    ? (Tag: keyof HTMLElementTagNameMap) => {
        const Wrapper = (props: HTMLAttributes<HTMLElement> & { children?: ReactNode }) => {
          const { children, ...rest } = props
          const transformed = transformChildren(children, (t) =>
            splitTextWithCitations(t, citations!, onCitationClick)
          )
          return <Tag {...rest}>{transformed}</Tag>
        }
        return Wrapper
      }
    : null

  const components: Components = {
    table: ({ children, ...props }) => (
      <div className="my-4 w-full overflow-x-auto rounded-xl border border-[#D7D1C4]">
        <table {...props} className="m-0 min-w-full">{children}</table>
      </div>
    ),
    a: ({ href, children, ...props }) => (
      <a {...props} href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noreferrer" : undefined}>{children}</a>
    ),
    ...(wrap
      ? {
        p: wrap("p"),
        li: wrap("li"),
        td: wrap("td"),
        th: wrap("th"),
        strong: wrap("strong"),
        em: wrap("em"),
        blockquote: wrap("blockquote"),
      }
      : {}),
  }

  const preparedContent = prepareMarkdownContent(content)
  const math = containsMath(preparedContent)

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-[#35424B]",
        "[&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[#D7D1C4] [&_pre]:bg-[#F4F1EA] [&_pre]:p-4 [&_pre]:shadow-[inset_3px_0_0_#315E83]",
        "[&_code]:break-words [&_code]:rounded-md [&_code]:bg-[#F1EDE4] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:text-[#7B4E31]",
        "[&_pre_code]:break-normal [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[#243746]",
        "[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:scroll-mt-5 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-[-0.025em] [&_h1]:text-[#18232D]",
        "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:scroll-mt-5 [&_h2]:border-b [&_h2]:border-[#E2DDD3] [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#243746]",
        "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:scroll-mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[#315E83]",
        "[&_p]:my-2.5 [&_p]:whitespace-pre-wrap [&_p]:leading-7",
        "[&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal",
        "[&_li]:my-1 [&_li]:whitespace-pre-wrap [&_li]:leading-6 [&_td]:whitespace-pre-wrap [&_th]:whitespace-pre-wrap",
        "[&_a]:font-medium [&_a]:text-[#315E83] [&_a]:underline [&_a]:decoration-[#9FB1BC] [&_a]:underline-offset-2 hover:[&_a]:text-[#244C66]",
        "[&_blockquote]:my-4 [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-4 [&_blockquote]:border-[#B1842C] [&_blockquote]:bg-[#FBF8F0] [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:pr-3 [&_blockquote]:not-italic [&_blockquote]:text-[#5F5B52]",
        "[&_hr]:my-6 [&_hr]:border-[#D7D1C4] [&_th]:bg-[#F1EDE4] [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[#243746] [&_td]:border-[#E2DDD3] [&_td]:px-3 [&_td]:py-2.5",
        "[&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2",
        className
      )}
    >
      {math ? (
        <Suspense fallback={<FormulaLoading />}>
          <MathMarkdownRenderer content={preparedContent} components={components} />
        </Suspense>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{preparedContent}</ReactMarkdown>
      )}
    </div>
  )
}
