/**
 * Monaco Editor 封装 —— LeetCode 同款代码编辑器。
 *
 * 用法:
 *   <CodeEditor value={code} onChange={setCode} language="cpp" height="400px" />
 *
 * 特性:
 * - 语法高亮 / 自动缩进 / 行号 / 折叠 / 智能括号
 * - 字号 14,等宽字体；Tab=2 空格(C/C++ 习惯,Python 也兼容)
 * - 自适应高度 + minimap 关闭(题目区域用不上)
 * - 顶部工具栏两个全局偏好(只读模式不显示,见 store/editorPrefs):
 *     · 配色:浅色(默认,与整体浅色界面一致) / 深色,用户可切
 *     · 代码补全:开=输入即弹建议、Tab/Enter 接受;关=纯手敲、Tab 只缩进
 * - fixedOverflowWidgets:建议浮层渲染到 body 层,不再被上方题面框/容器 overflow 裁切
 */
import { useEffect, useRef } from "react"
import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { Code2, Sparkles, PenLine, Sun, Moon } from "lucide-react"
import type { RunLang } from "@/components/CodeRunner"
import { useAutocomplete, setAutocomplete, useEditorTheme, setEditorTheme, type EditorTheme } from "@/store/editorPrefs"

interface CodeEditorProps {
  value: string
  onChange: (next: string) => void
  language: RunLang
  /** css 高度,默认 400px;放在 modal 里时给 100% 让父容器决定 */
  height?: string | number
  /** 只读模式(回看用) */
  readOnly?: boolean
  /** 字号,默认 14 */
  fontSize?: number
  className?: string
}

const LANG_TO_MONACO: Record<RunLang, string> = {
  python: "python",
  c: "c",
  cpp: "cpp",
}

// Monaco 默认从 jsDelivr 拉取运行时，国内网络下会长时间卡在“加载编辑器”。
// 构建时由 Vite 把固定版本资源复制到站内，开发与生产统一走同源路径。
loader.config({ paths: { vs: "/monaco/0.55.1/vs" } })

const MONACO_THEME: Record<EditorTheme, string> = {
  light: "studymate-light",
  dark: "studymate-dark",
}

/** 按「补全开/关」给出建议相关选项 —— 同时用于初始 options 与切换后的 updateOptions */
function suggestOptions(on: boolean): editor.IEditorOptions {
  return on
    ? {
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: "on",
        tabCompletion: "on", // 建议浮层打开时 Tab 接受,否则 Tab 缩进
        parameterHints: { enabled: true },
      }
    : {
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "off",
        tabCompletion: "off", // 纯手敲:Tab 永远只缩进
        parameterHints: { enabled: false },
      }
}

export function CodeEditor({
  value,
  onChange,
  language,
  height = "400px",
  readOnly = false,
  fontSize = 14,
  className = "",
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const autocomplete = useAutocomplete()
  const theme = useEditorTheme()
  const isDark = theme === "dark"

  const handleMount: OnMount = (ed, monaco: Monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    // Tab = 2 空格(C/C++ 风格,Python 也通)
    ed.updateOptions({
      tabSize: language === "python" ? 4 : 2,
      insertSpaces: true,
    })
    // 注册浅色 / 深色两套主题
    monaco.editor.defineTheme("studymate-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#fffefa",
        "editor.foreground": "#24323a",
        "editor.lineHighlightBackground": "#f1ede4",
        "editorLineNumber.foreground": "#9a958c",
        "editorLineNumber.activeForeground": "#315e83",
        "editor.selectionBackground": "#cddce5",
      },
    })
    monaco.editor.defineTheme("studymate-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#111a22",
        "editor.foreground": "#ece8de",
        "editor.lineHighlightBackground": "#1a2731",
        "editorLineNumber.foreground": "#71808a",
        "editorLineNumber.activeForeground": "#e6c98e",
        "editor.selectionBackground": "#315e8380",
      },
    })
    monaco.editor.setTheme(MONACO_THEME[theme])
  }

  // 补全开关切换时,实时应用到已挂载的编辑器
  useEffect(() => {
    editorRef.current?.updateOptions(suggestOptions(autocomplete))
  }, [autocomplete])

  // 配色切换时,实时换主题(setTheme 是全局的,所有编辑器一起切)
  useEffect(() => {
    monacoRef.current?.editor.setTheme(MONACO_THEME[theme])
  }, [theme])

  // height 为 "100%" 时交给父级 flex 决定;否则容器吃定高,工具栏 + 编辑器纵向排布
  const fillParent = height === "100%"

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border shadow-[0_8px_20px_rgba(24,35,45,.05)] ${isDark ? "border-[#2C3A44] bg-[#111A22]" : "border-[#D7D1C4] bg-[#FFFEFA]"} ${className}`}
      style={fillParent ? undefined : { height }}
    >
      {/* 顶部工具栏:配色 + 代码补全开关(只读模式不显示) */}
      {!readOnly && (
        <div
          className={`flex min-h-10 shrink-0 items-center gap-1.5 border-b px-2.5 py-1 ${
            isDark ? "border-white/10 bg-[#1A2731]" : "border-[#DED8CC] bg-[#F8F6F0]"
          }`}
        >
          <span className={`mr-auto inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold ${isDark ? "text-[#D7D1C4]" : "text-[#66717B]"}`}>
            <Code2 className="size-3.5 shrink-0" />
            <span className="truncate">代码编辑器 · {language === "cpp" ? "C++" : language.toUpperCase()}</span>
          </span>
          {/* 配色切换 */}
          <button
            type="button"
            onClick={() => setEditorTheme(isDark ? "light" : "dark")}
            title={isDark ? "当前墨蓝模式，点击切换纸张模式" : "当前纸张模式，点击切换墨蓝模式"}
            className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
              isDark
                ? "border-white/15 bg-white/5 text-[#D7D1C4] hover:bg-white/10"
                : "border-[#D7D1C4] bg-[#FFFEFA] text-[#59645F] hover:bg-[#ECE8DE]"
            }`}
          >
            {isDark ? <Moon className="size-3" /> : <Sun className="size-3" />}
            {isDark ? "墨蓝" : "纸张"}
          </button>

          {/* 代码补全开关 */}
          <button
            type="button"
            onClick={() => setAutocomplete(!autocomplete)}
            title={
              autocomplete
                ? "代码补全已开启：输入即弹建议，Tab / Enter 接受。点击切换为纯手敲。"
                : "纯手敲模式：不弹建议，Tab 只缩进。点击开启代码补全。"
            }
            className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
              autocomplete
                ? isDark
                  ? "border-[#D6B36A]/35 bg-[#D6B36A]/10 text-[#E6C98E] hover:bg-[#D6B36A]/15"
                  : "border-[#D8C9A8] bg-[#F7F2E7] text-[#8E6925] hover:bg-[#F1E7D2]"
                : isDark
                  ? "border-white/15 bg-white/5 text-[#AEB6B9] hover:bg-white/10"
                  : "border-[#D7D1C4] bg-[#FFFEFA] text-[#66717B] hover:bg-[#ECE8DE]"
            }`}
          >
            {autocomplete ? <Sparkles className="size-3" /> : <PenLine className="size-3" />}
            {autocomplete ? "补全 开" : "补全 关"}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Editor
          value={value}
          onChange={(v) => onChange(v ?? "")}
          language={LANG_TO_MONACO[language]}
          height="100%"
          onMount={handleMount}
          options={{
            fontSize,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            renderLineHighlight: "all",
            padding: { top: 12, bottom: 12 },
            readOnly,
            automaticLayout: true,    // 容器尺寸变化自动 relayout
            wordWrap: "on",
            tabSize: language === "python" ? 4 : 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            // 建议浮层渲染到 body 层 → 第一行/容器边缘不再被上方题面框裁切
            fixedOverflowWidgets: true,
            ...suggestOptions(autocomplete),
          }}
          loading={
            <BasicEditorFallback
              value={value}
              onChange={onChange}
              readOnly={readOnly}
              fontSize={fontSize}
              isDark={isDark}
            />
          }
        />
      </div>
    </div>
  )
}

function BasicEditorFallback({
  value,
  onChange,
  readOnly,
  fontSize,
  isDark,
}: {
  value: string
  onChange: (next: string) => void
  readOnly: boolean
  fontSize: number
  isDark: boolean
}) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${isDark ? "bg-[#111A22]" : "bg-[#FFFEFA]"}`}>
      <div className={`shrink-0 border-b px-3 py-2 text-[10px] font-semibold ${isDark ? "border-white/10 text-[#AEB6B9]" : "border-[#E4DED2] text-[#7A817F]"}`} role="status">
        增强编辑器正在加载，可先在基础编辑模式中输入，内容会自动保留
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        aria-label={readOnly ? "代码内容" : "基础代码编辑器"}
        className={`min-h-0 flex-1 resize-none px-4 py-3 font-mono leading-6 outline-none ${isDark ? "bg-[#111A22] text-[#ECE8DE]" : "bg-[#FFFEFA] text-[#24323A]"}`}
        style={{ fontSize }}
      />
    </div>
  )
}
