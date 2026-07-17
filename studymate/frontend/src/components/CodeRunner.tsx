/**
 * 在线代码运行组件。
 *
 * - 后端走 /api/run → 内网 Piston 沙箱（C / C++17 / Python）
 * - 全程不出公网，安全沙箱执行
 *
 * 两种用法：
 *   1. <CodeRunner source={code} language="python" />            // CodeBlock 用，语言已知锁死
 *   2. <CodeRunner source={code} defaultLanguage="cpp" allowLanguageSwitch />  // QuizCard 用，可切换语言
 */
import { useCallback, useState } from "react"
import { Play, Loader2, Check, X, Clock, Terminal, AlertTriangle } from "lucide-react"
import { apiPost } from "@/lib/api"

export type RunLang = "python" | "c" | "cpp"

const LANG_LABELS: Record<RunLang, string> = {
  python: "Python 3.10",
  c: "C (gcc -std=c11)",
  cpp: "C++ (g++ -std=c++17)",
}

interface RunResponse {
  stdout: string
  stderr: string
  exit_code: number
  signal: string | null
  language: string
  version: string
  compile?: { stdout: string; stderr: string; code: number; signal: string | null } | null
  duration_ms: number
  mock: boolean
}

interface CodeRunnerProps {
  /** 要运行的源码 */
  source: string
  /** 强制锁定语言（CodeBlock 用） */
  language?: RunLang
  /** 默认语言（仅 allowLanguageSwitch 时生效） */
  defaultLanguage?: RunLang
  /** 是否允许下拉切换语言 */
  allowLanguageSwitch?: boolean
  /** 是否允许输入 stdin */
  allowStdin?: boolean
  className?: string
  /** 紧凑模式（输出面板更小） */
  compact?: boolean
}

export function CodeRunner({
  source,
  language,
  defaultLanguage = "python",
  allowLanguageSwitch = false,
  allowStdin = false,
  className = "",
  compact = false,
}: CodeRunnerProps) {
  const [lang, setLang] = useState<RunLang>(language ?? defaultLanguage)
  const [stdin, setStdin] = useState("")
  const [showStdin, setShowStdin] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [err, setErr] = useState("")

  const effectiveLang = language ?? lang

  const handleRun = useCallback(async () => {
    if (!source.trim() || running) return
    setRunning(true)
    setErr("")
    setResult(null)
    try {
      const r = await apiPost<RunResponse>("/run", {
        language: effectiveLang,
        source,
        stdin,
      })
      setResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [source, effectiveLang, stdin, running])

  const compileFail = !!result?.compile && result.compile.code !== 0
  const runOK = !!result && !compileFail && result.exit_code === 0
  const runFail = !!result && (compileFail || result.exit_code !== 0)

  return (
    <div className={`border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)] ${className}`}>
      {/* 顶部操作栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30 flex-wrap">
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !source.trim()}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {running ? "运行中" : "运行"}
        </button>

        {allowLanguageSwitch && !language && (
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as RunLang)}
            disabled={running}
            className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            {(Object.keys(LANG_LABELS) as RunLang[]).map((k) => (
              <option key={k} value={k}>
                {LANG_LABELS[k]}
              </option>
            ))}
          </select>
        )}

        {!allowLanguageSwitch && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-mono">
            {LANG_LABELS[effectiveLang]}
          </span>
        )}

        {allowStdin && (
          <button
            type="button"
            onClick={() => setShowStdin((v) => !v)}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--muted)] inline-flex items-center gap-1"
          >
            <Terminal className="size-3" /> stdin{stdin ? ` (${stdin.length})` : ""}
          </button>
        )}

        {result && !running && (
          <div className="ml-auto flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
            {runOK && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="size-3" /> 成功
              </span>
            )}
            {runFail && (
              <span className="inline-flex items-center gap-1 text-rose-600">
                <X className="size-3" />
                {compileFail ? "编译失败" : `退出码 ${result.exit_code}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {result.duration_ms} ms
            </span>
          </div>
        )}
      </div>

      {/* stdin 输入框 */}
      {allowStdin && showStdin && (
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--muted)]/20">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">标准输入(每行一条):</div>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="例如:&#10;3&#10;1 2 3"
            spellCheck={false}
            className="w-full min-h-[60px] p-2 rounded border border-[var(--border)] bg-[var(--background)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-y"
          />
        </div>
      )}

      {/* 输出区 */}
      {(result || err) && (
        <div className={`text-xs ${compact ? "max-h-[200px]" : "max-h-[320px]"} overflow-y-auto`}>
          {/* 编译错误优先显示 */}
          {compileFail && result?.compile?.stderr && (
            <OutputSection
              label="编译错误"
              content={result.compile.stderr}
              tone="error"
              icon={<AlertTriangle className="size-3" />}
            />
          )}
          {/* 运行 stdout */}
          {result?.stdout && (
            <OutputSection
              label="标准输出"
              content={result.stdout}
              tone="success"
              icon={<Terminal className="size-3" />}
            />
          )}
          {/* 运行 stderr */}
          {result?.stderr && (
            <OutputSection
              label="标准错误"
              content={result.stderr}
              tone="error"
              icon={<AlertTriangle className="size-3" />}
            />
          )}
          {/* 没有任何输出（exit 0 + 空 stdout） */}
          {result && !compileFail && !result.stdout && !result.stderr && (
            <div className="px-3 py-3 text-[var(--muted-foreground)] italic">
              (程序运行结束，无输出)
            </div>
          )}
          {/* 请求层错误 */}
          {err && (
            <OutputSection
              label="运行失败"
              content={err}
              tone="error"
              icon={<AlertTriangle className="size-3" />}
            />
          )}
          {/* 沙箱未起 */}
          {result?.mock && (
            <div className="px-3 py-2 text-amber-600 text-[11px] bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900">
              提示：沙箱未启动，运行未真实执行。请运行 scripts/init-piston.sh
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OutputSection({
  label,
  content,
  tone,
  icon,
}: {
  label: string
  content: string
  tone: "success" | "error"
  icon: React.ReactNode
}) {
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <div
        className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium ${
          tone === "error"
            ? "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30"
            : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
        }`}
      >
        {icon}
        {label}
      </div>
      <pre className="px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-[var(--foreground)]">
        {content}
      </pre>
    </div>
  )
}
