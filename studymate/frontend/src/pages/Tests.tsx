/**
 * 测试 case 管理页 `/tests`
 *
 * 挑战杯硬性交付物：典型问答测试集 + 准确性论证。
 *
 * 功能：
 * - 列出所有 case（id / category / target_agent / status / score）
 * - 新增 / 编辑 / 删除
 * - 单跑（跑某一条）/ 全跑（串行跑全部，前端实时插队展示）
 * - 一键灌入 10 条示例
 * - 导出 PDF（html2canvas-pro + jsPDF）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ClipboardCheck, Loader2, Play, PlayCircle, Plus, RefreshCw, Trash2, Edit3,
  CheckCircle2, XCircle, AlertCircle, Sparkles, Download, ChevronDown, ChevronUp, Save, X,
  Filter, ArrowUpDown, Activity, ArrowLeft,
} from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { Button } from "@/components/ui/button"
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api"
import { usePostSSE } from "@/hooks/usePostSSE"
import { useTrackPage } from "@/lib/useTrackPage"
import { useTutorContext } from "@/hooks/useTutorContext"
import { useCurrentCourse } from "@/store/course"

interface TestCase {
  id: number
  course_id: number | null
  question: string
  expected: string
  category: string
  target_agent: "tutor" | "doc" | "quiz"
  actual: string
  score: number
  judge_reason: string
  status: "pending" | "running" | "passed" | "failed" | "error"
  last_run_at: string | null
  created_at: string | null
}

interface ListResp {
  count: number
  passed: number
  failed: number
  pending: number
  recovered?: number
  items: TestCase[]
}

const STATUS_META: Record<TestCase["status"], { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "待跑", color: "text-[#66717B] bg-[#F1EDE4]", icon: AlertCircle },
  running: { label: "运行中", color: "text-[#315E83] bg-[#E7EDF3]", icon: Loader2 },
  passed: { label: "通过", color: "text-[#557052] bg-[#E9EEE6]", icon: CheckCircle2 },
  failed: { label: "未通过", color: "text-[#9A4E35] bg-[#F4E8E2]", icon: XCircle },
  error: { label: "异常", color: "text-[#8E6925] bg-[#F4ECD8]", icon: AlertCircle },
}

const AGENT_LABEL: Record<TestCase["target_agent"], string> = {
  tutor: "助教",
  doc: "讲解文档",
  quiz: "出题",
}

type SortKey = "id" | "score_desc" | "score_asc" | "status" | "last_run"
type StatusFilter = "all" | TestCase["status"]

const SORT_LABEL: Record<SortKey, string> = {
  id: "最新优先",
  score_desc: "分数 高→低",
  score_asc: "分数 低→高",
  status: "按状态分组",
  last_run: "最近运行",
}

const STATUS_RANK: Record<TestCase["status"], number> = {
  failed: 0, error: 1, running: 2, pending: 3, passed: 4,
}

interface RunProgress {
  index: number   // 当前正在跑的第几条（从 1 开始；0 表示还在 start 阶段）
  total: number
  question: string
  passedSoFar: number
  failedSoFar: number
}

export function Tests() {
  useTrackPage("tests")
  const course = useCurrentCourse()
  useTutorContext({
    page: "tests",
    title: `测试用例管理${course?.name ? ` · ${course.name}` : ""}`,
  })
  const reportRef = useRef<HTMLDivElement>(null)
  const [cases, setCases] = useState<TestCase[]>([])
  // summary 直接从 cases 派生，避免 SSE 跑完还要二次拉取
  const summary = useMemo(() => ({
    count: cases.length,
    passed: cases.filter((c) => c.status === "passed").length,
    failed: cases.filter((c) => c.status === "failed").length,
    pending: cases.filter((c) => c.status === "pending" || c.status === "running").length,
  }), [cases])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [runningAll, setRunningAll] = useState(false)
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null)
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState<TestCase | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // 筛选 + 排序（客户端）
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all")
  const [sortBy, setSortBy] = useState<SortKey>("id")

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const url = course ? `/tests?course_id=${course.id}` : "/tests"
      const r = await apiGet<ListResp>(url)
      setCases(r.items)
      if (r.recovered) {
        setNotice(`已自动恢复 ${r.recovered} 条意外中断的测试任务，可直接重新运行`)
        window.setTimeout(() => setNotice(null), 4500)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [course])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void fetchList())
    return () => window.cancelAnimationFrame(frame)
  }, [fetchList])

  const passRate = useMemo(() => {
    const run = summary.passed + summary.failed
    return run > 0 ? Math.round((summary.passed / run) * 100) : 0
  }, [summary])

  // 客户端筛选 + 排序
  const categories = useMemo(
    () => Array.from(new Set(cases.map((c) => c.category).filter(Boolean))).sort(),
    [cases]
  )

  const filteredCases = useMemo(() => {
    let list = cases
    if (filterCategory !== "all") list = list.filter((c) => c.category === filterCategory)
    if (filterStatus !== "all") list = list.filter((c) => c.status === filterStatus)
    const sorted = [...list]
    switch (sortBy) {
      case "id":
        sorted.sort((a, b) => b.id - a.id)
        break
      case "score_desc":
        sorted.sort((a, b) => b.score - a.score)
        break
      case "score_asc":
        sorted.sort((a, b) => a.score - b.score)
        break
      case "status":
        sorted.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.id - a.id)
        break
      case "last_run":
        sorted.sort((a, b) => (b.last_run_at || "").localeCompare(a.last_run_at || ""))
        break
    }
    return sorted
  }, [cases, filterCategory, filterStatus, sortBy])

  // 筛选后子集（用于「跑全部」按当前筛选条件跑）
  const willRunCount = filterCategory === "all" ? cases.length : filteredCases.length

  const seed = async () => {
    setError(null)
    setNotice(null)
    try {
      // 当前选了课就绑当前课，没选就走「全库未分类」桶
      const url = course ? `/tests/seed?course_id=${course.id}` : "/tests/seed"
      const r = await apiPost<{ created: number; skipped: number; message?: string }>(url)
      if (r.message) {
        // 课程没配置题库
        setError(r.message)
      } else if (r.created > 0) {
        setNotice(`已载入 ${r.created} 条示例用例${course ? `到「${course.name}」` : ""}`)
      } else {
        setNotice(`${r.skipped} 条示例已存在${course ? `（${course.name}）` : ""}，未新增`)
      }
      setTimeout(() => setNotice(null), 3500)
      await fetchList()
    } catch (e) {
      setError(String(e))
    }
  }

  const runOne = async (id: number) => {
    setRunningId(id)
    setError(null)
    // 乐观更新：先把状态置 running
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, status: "running" } : c)))
    try {
      const r = await apiPost<TestCase>(`/tests/${id}/run`)
      setCases((cs) => cs.map((c) => (c.id === id ? r : c)))
      // 自动展开看结果
      setExpanded((s) => new Set(s).add(id))
    } catch (e) {
      setError(String(e))
    } finally {
      setRunningId(null)
    }
  }

  // SSE 跑全部：start / case_start / case_done / done 事件
  const handleSSE = useCallback((ev: { event: string; data: unknown }) => {
    if (ev.event === "start") {
      const d = ev.data as { total: number; ids: number[] }
      setRunProgress({ index: 0, total: d.total, question: "", passedSoFar: 0, failedSoFar: 0 })
      // 把要跑的全部置为 running，给视觉反馈
      const idSet = new Set(d.ids)
      setCases((cs) => cs.map((c) => (idSet.has(c.id) ? { ...c, status: "running" } : c)))
    } else if (ev.event === "case_start") {
      const d = ev.data as { id: number; index: number; total: number; question: string }
      setRunProgress((prev) =>
        prev ? { ...prev, index: d.index, question: d.question } : prev
      )
    } else if (ev.event === "case_done") {
      const d = ev.data as { id: number; item: TestCase }
      setCases((cs) => cs.map((c) => (c.id === d.id ? d.item : c)))
      setRunProgress((prev) => {
        if (!prev) return null
        if (d.item.status === "passed") return { ...prev, passedSoFar: prev.passedSoFar + 1 }
        if (d.item.status === "failed" || d.item.status === "error") return { ...prev, failedSoFar: prev.failedSoFar + 1 }
        return prev
      })
    } else if (ev.event === "done") {
      setRunningAll(false)
      // 1.2s 后清掉进度条，让用户看到「X/X 完成」的最后状态
      setTimeout(() => setRunProgress(null), 1200)
    } else if (ev.event === "error") {
      setRunningAll(false)
      setRunProgress(null)
      setError(typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data))
    }
  }, [])

  const sse = usePostSSE({ onEvent: handleSSE })

  const runAll = () => {
    if (cases.length === 0) return
    setRunningAll(true)
    setError(null)
    const params = new URLSearchParams()
    if (course) params.set("course_id", String(course.id))
    if (filterCategory !== "all") params.set("category", filterCategory)
    const qs = params.toString()
    sse.send(`/api/tests/run-all/stream${qs ? `?${qs}` : ""}`, {})
  }

  const remove = async (id: number) => {
    setDeleting(true)
    setError(null)
    try {
      await apiDelete(`/tests/${id}`)
      setCases((cs) => cs.filter((c) => c.id !== id))
      setDeleteTarget(null)
      setNotice(`测试用例 #${id} 已删除`)
      window.setTimeout(() => setNotice(null), 3600)
    } catch (e) {
      setError(String(e))
    } finally {
      setDeleting(false)
    }
  }

  const exportPDF = async () => {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ])
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW - 20
      const imgH = (canvas.height * imgW) / canvas.width
      let heightLeft = imgH
      let position = 10
      pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
      heightLeft -= pageH - 20
      while (heightLeft > 0) {
        position = heightLeft - imgH + 10
        pdf.addPage()
        pdf.addImage(imgData, "PNG", 10, position, imgW, imgH)
        heightLeft -= pageH - 20
      }
      pdf.save(`StudyMate-测试报告-${new Date().toISOString().slice(0, 10)}.pdf`)
      setNotice("测试报告 PDF 已导出")
      window.setTimeout(() => setNotice(null), 3600)
    } catch (e) {
      setError(`导出失败：${e}`)
    } finally {
      setExporting(false)
    }
  }

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="app-page paper-theme">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="tests" appearance="paper" />
        <section className="mt-4 min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] transition-colors hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" /><span className="hidden sm:inline">返回首页</span></Link>
              <span className="h-6 w-px bg-[#D7D1C4]" />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><ClipboardCheck className="size-4" /></span>
              <div><h1 className="text-[15px] font-bold text-[#18232D]">StudyMate 测试管理</h1><p className="mt-0.5 text-[11px] text-[#6F787A]">管理典型问答测试集，运行自动评分并导出准确性报告</p></div>
            </div>
            <div className="nav-scroll flex w-full items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto sm:overflow-visible sm:pb-0">
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> 新增
              </Button>
              <Button size="sm" variant="outline" onClick={seed}>
                <Sparkles className="size-4" /> 一键载入示例
              </Button>
              <Button size="sm" variant="outline" onClick={fetchList} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                <span className="sr-only">刷新测试列表</span>
              </Button>
              <Button size="sm" onClick={runAll} disabled={runningAll || willRunCount === 0}>
                {runningAll ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                跑全部{filterCategory !== "all" ? `（筛选 ${willRunCount}）` : ""}
              </Button>
              <Button size="sm" variant="outline" onClick={exportPDF} disabled={exporting || cases.length === 0}>
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                导出 PDF
              </Button>
            </div>
          </header>
          <div className="p-4 sm:p-5">

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] p-3 text-sm text-[#9A4E35]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-[#EBDAD1]" aria-label="关闭错误提示"><X className="size-3.5" /></button>
          </div>
        )}
        {notice && (
          <div role="status" aria-live="polite" className="mb-3 flex items-center gap-2 rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] p-3 text-sm font-medium text-[#557052]">
            <CheckCircle2 className="size-4 shrink-0" /><span className="min-w-0 flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-[#DDE6DA]" aria-label="关闭成功提示"><X className="size-3.5" /></button>
          </div>
        )}

        <div ref={reportRef} className="bg-[#FFFEFA]">
          {/* 顶部统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label="总数"     value={summary.count}   color="indigo" />
            <StatBox label="通过"     value={summary.passed}  color="emerald" />
            <StatBox label="未通过"   value={summary.failed}  color="rose" />
            <StatBox label="通过率"   value={`${passRate}%`}  color="amber" />
          </div>

          {/* 跑全部进度 banner */}
          <AnimatePresence>
            {runProgress && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-3 rounded-xl border border-[#C7D2D8] bg-[#E7EDF3] p-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="size-4 animate-pulse text-[#315E83]" />
                  <span className="font-semibold text-[#315E83]">
                    正在跑全部 {runProgress.index}/{runProgress.total}
                  </span>
                  <span className="text-xs text-[#557052]">✓ {runProgress.passedSoFar}</span>
                  <span className="text-xs text-[#9A4E35]">✗ {runProgress.failedSoFar}</span>
                  {runProgress.index === runProgress.total && runProgress.total > 0 && (
                    <span className="ml-2 text-xs font-medium text-[#315E83]">全部完成</span>
                  )}
                </div>
                {runProgress.question && (
                  <div className="mt-1 text-xs text-[var(--muted-foreground)] truncate">
                    当前：{runProgress.question}
                  </div>
                )}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#C7D2D8]">
                  <motion.div
                    className="h-full bg-[#315E83]"
                    initial={{ width: 0 }}
                    animate={{
                      width: runProgress.total > 0
                        ? `${(runProgress.index / runProgress.total) * 100}%`
                        : "0%",
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 筛选 + 排序工具栏 */}
          {cases.length > 0 && (
            <div className="paper-toolstrip mb-3 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-xs">
              <Filter className="size-3.5 text-[var(--muted-foreground)]" />
              <span className="text-[var(--muted-foreground)]">筛选</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-7 px-2 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              >
                <option value="all">全部分类</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                className="h-7 px-2 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              >
                <option value="all">全部状态</option>
                <option value="passed">仅通过</option>
                <option value="failed">仅未通过</option>
                <option value="error">仅异常</option>
                <option value="pending">仅待跑</option>
                <option value="running">仅运行中</option>
              </select>
              <span className="text-[var(--muted-foreground)] ml-2 inline-flex items-center gap-1">
                <ArrowUpDown className="size-3.5" /> 排序
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-7 px-2 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABEL[k]}</option>
                ))}
              </select>
              {(filterCategory !== "all" || filterStatus !== "all" || sortBy !== "id") && (
                <button
                  onClick={() => { setFilterCategory("all"); setFilterStatus("all"); setSortBy("id") }}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
                >
                  重置
                </button>
              )}
              <span className="ml-auto text-[var(--muted-foreground)]">
                显示 {filteredCases.length} / {cases.length}
              </span>
            </div>
          )}

          {loading && cases.length === 0 ? (
            <TestListLoading />
          ) : cases.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-[22px] border border-dashed border-[#D7D1C4] bg-[#FBF8F0] px-5 py-12 text-center">
              <div><span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]"><ClipboardCheck className="size-5" /></span><strong className="mt-3 block text-sm text-[#243746]">还没有测试用例</strong><p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-[#7A817F]">可以载入典型示例快速形成评测集，也可按课程目标自行创建。</p><div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={() => setAddOpen(true)} className="border-[#D7D1C4] bg-[#FFFEFA]"><Plus className="size-4" />新增用例</Button><Button onClick={seed} className="bg-[#244C66] text-white hover:bg-[#193B50]"><Sparkles className="size-4" />载入示例</Button></div></div>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">
              <Filter className="size-8 mx-auto mb-2 opacity-40" />
              当前筛选条件下没有测试用例，可点「重置」或更换分类与状态。
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCases.map((c) => (
                <CaseRow
                  key={c.id}
                  data={c}
                  expanded={expanded.has(c.id)}
                  onToggle={() => toggleExpand(c.id)}
                  onRun={() => runOne(c.id)}
                  onEdit={() => setEditing(c)}
                  onDelete={() => setDeleteTarget(c)}
                  running={runningId === c.id || c.status === "running"}
                />
              ))}
            </div>
          )}

          {cases.length > 0 && (
            <div className="text-[10px] text-[var(--muted-foreground)] text-center pt-4">
              测试报告由 StudyMate 自动生成 · 自动评分并保留判定依据 · {new Date().toLocaleString("zh-CN")}
            </div>
          )}
        </div>

        {(addOpen || editing) && (
          <EditModal
            initial={editing}
            onClose={() => { setAddOpen(false); setEditing(null) }}
            onSaved={async () => {
              setAddOpen(false)
              setEditing(null)
              await fetchList()
            }}
          />
        )}

        {deleteTarget && (
          <DeleteCaseModal data={deleteTarget} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={() => void remove(deleteTarget.id)} />
        )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: "indigo" | "emerald" | "rose" | "amber" }) {
  const cmap = {
    indigo: "bg-[#E7EDF3] text-[#315E83] border-[#C7D2D8]",
    emerald: "bg-[#E9EEE6] text-[#557052] border-[#C9D1CB]",
    rose: "bg-[#F4E8E2] text-[#9A4E35] border-[#DFC8BE]",
    amber: "bg-[#F4ECD8] text-[#8E6925] border-[#DDD4BF]",
  }[color]
  return (
    <div className={`paper-lift rounded-[18px] border p-3 ${cmap}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  )
}

function CaseRow({
  data, expanded, onToggle, onRun, onEdit, onDelete, running,
}: {
  data: TestCase
  expanded: boolean
  onToggle: () => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  running: boolean
}) {
  const sm = STATUS_META[data.status] || STATUS_META.pending
  const SIcon = sm.icon
  const railColor = {
    passed: "#6F8A69",
    failed: "#B85C3E",
    error: "#B1842C",
    running: "#315E83",
    pending: "#B8B0A1",
  }[data.status] || "#B8B0A1"
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ borderLeftColor: railColor }}
      className="paper-lift overflow-hidden rounded-2xl border border-l-[3px] border-[#D7D1C4] bg-[#FFFEFA] shadow-[0_7px_18px_rgba(24,35,45,.035)]"
    >
      <div className="flex items-start gap-2.5 p-3 sm:items-center sm:gap-3">
        <span className="w-8 shrink-0 pt-1 font-mono text-xs text-[#8A8172] sm:pt-0">#{data.id}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${sm.color}`}><SIcon className={`size-3 ${data.status === "running" ? "animate-spin" : ""}`} />{sm.label}</span>
            <span className="shrink-0 rounded border border-[#D7D1C4] bg-[#F1EDE4] px-1.5 py-0.5 text-[10px] text-[#66717B]">{data.category}</span>
            <span className="shrink-0 rounded border border-[#C7D2D8] bg-[#E7EDF3] px-1.5 py-0.5 text-[10px] text-[#315E83]">{AGENT_LABEL[data.target_agent]}</span>
            {data.status !== "pending" && data.status !== "running" && (
              <span className={`inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold ${data.score >= 60 ? "text-[#557052]" : "text-[#9A4E35]"}`}><span className={`size-1.5 rounded-full ${data.score >= 60 ? "bg-[#6F8A69]" : "bg-[#B85C3E]"}`} />{data.score.toFixed(0)} 分</span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#243746] sm:truncate">{data.question}</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row sm:gap-1">
          <Button size="sm" variant="ghost" onClick={onRun} disabled={running} aria-label={`运行测试 #${data.id}`} title="运行">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`编辑测试 #${data.id}`} title="编辑">
            <Edit3 className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`删除测试 #${data.id}`} title="删除">
            <Trash2 className="size-3.5 text-[#9A4E35]" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle} aria-label={`${expanded ? "收起" : "展开"}测试 #${data.id}`} title={expanded ? "收起详情" : "查看详情"}>
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-3 border-t border-[#D7D1C4] bg-[#F8F6F0] p-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">✅ 期望答案 (expected)</div>
            <div className="whitespace-pre-wrap rounded-xl border border-[#C9D1CB] bg-[#E9EEE6] p-2.5 text-xs leading-5">
              {data.expected || <span className="italic text-[var(--muted-foreground)]">（未填）</span>}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">🤖 实际输出 (actual)</div>
            <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#D7D1C4] bg-[#FFFEFA] p-2.5 text-xs leading-5">
              {data.actual || <span className="italic text-[var(--muted-foreground)]">{data.status === "running" ? "运行中..." : "尚未运行"}</span>}
            </div>
          </div>
          {data.judge_reason && (
            <div className="md:col-span-2">
              <div className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">⚖️ 评分理由</div>
              <div className="rounded-xl border border-[#DDD4BF] bg-[#F4ECD8] p-2.5 text-xs leading-5">
                {data.judge_reason}
              </div>
            </div>
          )}
          {data.last_run_at && (
            <div className="md:col-span-2 text-[10px] text-[var(--muted-foreground)]">
              上次运行：{new Date(data.last_run_at).toLocaleString("zh-CN")}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

function TestListLoading() {
  return <div role="status" aria-label="正在加载测试用例" className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl border border-[#E2DDD3] bg-[#FFFEFA] p-4"><span className="h-4 w-8 rounded bg-[#E8E3D9]" /><span className="h-5 w-14 rounded-full bg-[#E7EDF3]" /><div className="flex-1"><div className="h-3 w-2/3 rounded-full bg-[#EEE9DF]" /><div className="mt-2 h-2.5 w-1/3 rounded-full bg-[#F4F1EA]" /></div></div>)}</div>
}

function DeleteCaseModal({ data, busy, onClose, onConfirm }: { data: TestCase; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#18232D]/35 p-4 backdrop-blur-[2px]" onMouseDown={() => !busy && onClose()}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="test-delete-title" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.2)]">
        <div className="flex items-start gap-3 border-b border-[#E2DDD3] bg-[#FCF7F4] px-5 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]"><Trash2 className="size-4" /></span><div className="min-w-0 flex-1"><h2 id="test-delete-title" className="text-sm font-bold text-[#18232D]">删除测试用例 #{data.id}？</h2><p className="mt-1 text-[11px] leading-5 text-[#66717B]">将同时移除该用例的实际输出、自动评分与历史判定依据。</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭删除确认" className="grid size-8 shrink-0 place-items-center rounded-xl text-[#7A817F] hover:bg-[#F1EDE4] disabled:opacity-40"><X className="size-4" /></button></div>
        <div className="px-5 py-4"><div className="rounded-xl border border-[#D7D1C4] bg-[#FBF8F0] px-3 py-2.5"><span className="block text-[10px] font-bold text-[#9A4E35]">{data.category} · {AGENT_LABEL[data.target_agent]}</span><p className="mt-1 line-clamp-3 text-xs leading-5 text-[#4E5B63]">{data.question}</p></div></div>
        <div className="flex justify-end gap-2 border-t border-[#E2DDD3] bg-[#F8F6F0] px-5 py-3.5"><Button variant="outline" onClick={onClose} disabled={busy} className="border-[#D7D1C4] bg-[#FFFEFA]">保留用例</Button><Button onClick={onConfirm} disabled={busy} className="bg-[#9A4E35] text-white hover:bg-[#7F3F2D]">{busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{busy ? "删除中" : "确认删除"}</Button></div>
      </motion.section>
    </div>
  )
}

function EditModal({
  initial, onClose, onSaved,
}: {
  initial: TestCase | null
  onClose: () => void
  onSaved: () => void
}) {
  const course = useCurrentCourse()
  const [question, setQuestion] = useState(initial?.question || "")
  const [expected, setExpected] = useState(initial?.expected || "")
  const [category, setCategory] = useState(initial?.category || "通用")
  const [target, setTarget] = useState<TestCase["target_agent"]>(initial?.target_agent || "tutor")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, saving])

  const save = async () => {
    if (!question.trim() || !expected.trim()) {
      setErr("question 和 expected 都不能为空")
      return
    }
    setSaving(true)
    try {
      // 新建时绑当前课程；编辑时不动 course_id（保留原值）
      const body: Record<string, unknown> = { question, expected, category, target_agent: target }
      if (!initial && course) body.course_id = course.id
      if (initial) {
        await apiPut(`/tests/${initial.id}`, body)
      } else {
        await apiPost("/tests", body)
      }
      onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18232D]/35 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-edit-title"
        className="flex max-h-[min(92dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_24px_70px_rgba(24,35,45,.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-4">
          <div><h2 id="test-edit-title" className="text-base font-semibold text-[#18232D]">{initial ? `编辑测试用例 #${initial.id}` : "新增测试用例"}</h2><p className="mt-0.5 text-[10px] text-[#7A817F]">定义输入与关键期望，系统将保留实际输出和自动判定依据。</p></div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-[#66717B] hover:bg-[#F1EDE4] disabled:opacity-40" aria-label="关闭测试编辑弹窗">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <Field label="问题（喂给 Agent 的输入）" required>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] p-3 text-sm focus:border-[#315E83] focus:outline-none focus:ring-2 focus:ring-[#315E83]/10"
              placeholder="例如：什么是梯度下降？/ 红黑树和 AVL 区别？/ TCP 三次握手过程？"
            />
          </Field>
          <Field label="期望答案（judge 时和 actual 比对）" required>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] p-3 text-sm focus:border-[#315E83] focus:outline-none focus:ring-2 focus:ring-[#315E83]/10"
              placeholder="不要求字面，给出关键要点即可。"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分类">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] px-3 text-sm focus:border-[#315E83] focus:outline-none focus:ring-2 focus:ring-[#315E83]/10"
                placeholder="优化算法 / 树模型 / ..."
              />
            </Field>
            <Field label="测试目标 Agent">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as TestCase["target_agent"])}
                className="h-10 w-full rounded-xl border border-[#D7D1C4] bg-[#FBFAF6] px-3 text-sm focus:border-[#315E83] focus:outline-none focus:ring-2 focus:ring-[#315E83]/10"
              >
                <option value="tutor">课程助教</option>
                <option value="doc">讲解文档</option>
                <option value="quiz">智能出题</option>
              </select>
            </Field>
          </div>

          {err && <div role="alert" className="rounded-xl border border-[#DFC8BE] bg-[#F4E8E2] px-3 py-2 text-xs text-[#9A4E35]">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="border-[#D7D1C4] bg-[#FFFEFA]">取消</Button>
            <Button onClick={save} disabled={saving} className="bg-[#244C66] text-white hover:bg-[#193B50]">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1">{label}{required && <span className="text-rose-500">*</span>}</div>
      {children}
    </label>
  )
}
