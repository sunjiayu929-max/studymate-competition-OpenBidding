import { useState } from "react"
import { Copy, Check, FileCode, Sparkles } from "lucide-react"
import { CodeRunner, type RunLang } from "@/components/CodeRunner"

export interface CodeOutput {
  language: string
  filename: string
  code: string
  explanation: string
  expected_output: string
}

/** 把 CodeAgent 输出的 language 字段归一到 Piston 支持的语言。
 *  返回 null 表示该语言不能在线运行(算法/伪代码、汇编、Verilog 等) */
function normalizeLang(raw: string): RunLang | null {
  const s = (raw || "").toLowerCase().trim()
  if (s === "python" || s === "py" || s === "python3") return "python"
  if (s === "c") return "c"
  if (s === "cpp" || s === "c++" || s === "cxx" || s === "cc") return "cpp"
  return null
}

export function CodeBlock({ data }: { data: CodeOutput }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle")
  const runLang = normalizeLang(data.language)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code)
      setCopyStatus("copied")
      setTimeout(() => setCopyStatus("idle"), 1500)
    } catch {
      setCopyStatus("failed")
      setTimeout(() => setCopyStatus("idle"), 1800)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#2C3A44] bg-[#111A22] text-[#F8F6F0] shadow-[0_10px_24px_rgba(24,35,45,.12)]">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#1A2731] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="size-3.5 shrink-0 text-[#D6B36A]" />
          <span className="truncate font-mono text-xs text-[#E6E1D8]">{data.filename || "example.py"}</span>
          <span className="shrink-0 rounded-md border border-[#D6B36A]/20 bg-[#D6B36A]/10 px-1.5 py-0.5 text-[10px] text-[#E6C98E]">
            {data.language || "python"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-[#D7D1C4] transition-colors hover:bg-white/10 hover:text-white"
            aria-live="polite"
          >
            {copyStatus === "copied" ? <Check className="size-3 text-[#8FB18B]" /> : <Copy className="size-3" />}
            {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制"}
          </button>
        </div>
      </div>
      {/* 代码体 */}
      <pre className="text-xs leading-relaxed p-4 overflow-x-auto font-mono">
        <code>{data.code}</code>
      </pre>
      {/* 底部说明 */}
      {(data.explanation || data.expected_output) && (
        <div className="space-y-1.5 border-t border-white/10 bg-[#1A2731] px-4 py-2.5 text-xs">
          {data.explanation && (
            <div className="flex gap-1.5">
              <Sparkles className="size-3 text-amber-400 mt-0.5 shrink-0" />
              <span className="text-[#D7D1C4]">{data.explanation}</span>
            </div>
          )}
          {data.expected_output && (
            <div className="text-[#B8B1A6]">
              <span className="text-[#89847C]">预期输出:</span>
              <span className="font-mono">{data.expected_output}</span>
            </div>
          )}
        </div>
      )}
      {/* 在线运行(仅支持的语言显示) */}
      {runLang && (
        <div className="border-t border-white/10 bg-[#1A2731] p-2">
          <CodeRunner source={data.code} language={runLang} allowStdin compact />
        </div>
      )}
    </div>
  )
}
