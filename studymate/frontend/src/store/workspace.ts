/**
 * 工作台单例 store。
 *
 * 关键设计：SSE 流不放在 React 组件里，而是放在这个模块级单例里。
 * 否则 Workspace unmount（用户点详情页）后 setState 失效，
 * 后续 agent_done 事件会全部丢失，看起来就是「其他 agent 一直加载」。
 *
 * 组件用 useSyncExternalStore 订阅 store 变化，
 * sessionStorage 仅做刷新兜底。
 */

import { fetchEventSource } from "@microsoft/fetch-event-source"
import { useSyncExternalStore } from "react"
import { apiPost, sseHeaders } from "@/lib/api"
import type { QuizItem } from "@/components/QuizCard"
import type { ReadingItem } from "@/components/ReadingList"
import type { CodeOutput } from "@/components/CodeBlock"
import type { PathNode, PathEdge } from "@/components/PathView"
import type { AgentState, AgentMeta } from "@/components/AgentTimeline"

export interface Citation {
  index: number
  chunk_id: string
  source: string
  page: number | null
  url: string | null
  snippet: string
}

export interface RetrievedChunk {
  chunk_id: string
  content: string
  source: string
  page: number | null
  url: string | null
  meta?: Record<string, unknown>
  course_id?: number | null
  score?: number
}

export interface WorkspaceOutputs {
  diagnosis?: TrainingDiagnosis
  retriever?: { chunks: RetrievedChunk[] }
  domain_expert?: TrainingProposal
  learning_strategy?: TrainingProposal
  training_plan?: PersonalizedTrainingPlan
  doc?: { type: string; title: string; content: string; citations: Citation[]; version?: number; revision_response?: string[] }
  guide?: { type: string; title: string; content: string; citations: Citation[]; version?: number; revision_response?: string[] }
  mindmap?: { type: string; title: string; content: string }
  quiz?: { type: string; title: string; items: QuizItem[]; count: number; citations?: Citation[]; version?: number; revision_response?: string[] }
  path?: { type: string; title: string; nodes: PathNode[]; edges: PathEdge[]; count: number }
  reading?: { type: string; title: string; items: ReadingItem[]; count: number }
  code?: CodeOutput & { type: string; title: string }
  video?: {
    type: string
    title: string
    provider: string
    model: string
    status: "unconfigured" | "succeeded" | "failed" | string
    message?: string
    video_url: string
    assembled_video_url?: string
    task_id?: string
    resolution: string
    duration: number
    ratio: string
    has_audio: boolean
    script: {
      title: string
      voiceover: string
      prompt: string
      shots: Array<{ duration: number; description: string }>
      citations?: Citation[]
    }
    usage?: Record<string, unknown>
    version?: number
    complexity?: "focused" | "workflow" | "complex" | string
    scope?: string
    duration_reason?: string
    estimated_cost_rmb?: number
    actual_cost_rmb?: number
    total_duration?: number
    segment_count?: number
    completed_segments?: number
    assembly_status?: string
    segment_urls?: string[]
    segments?: Array<{
      index: number
      title: string
      purpose: string
      voiceover: string
      duration: number
      status: string
      task_id?: string
      video_url?: string
      message?: string
    }>
  }
}

export interface TrainingProposal {
  type: "expert_proposal" | "strategy_proposal"
  role: string
  position: string
  risk: string
  priority_competencies?: string[]
  weekly_hours?: number
  capacity?: number
  preferred_mode?: string
  debate_round?: number
  response_to_feedback?: string[]
}

export interface PersonalizedTrainingPlan {
  type: "training_plan"
  title: string
  cycle: number
  rationale: string
  priority_competencies: string[]
  deferred_competencies: string[]
  weekly_hours: number
  target_difficulty: number
  preferred_mode: string
  stages: Array<{ id: string; resource: string; goal: string; evidence: string }>
  acceptance_criteria: string[]
  debate: {
    expert_position: string
    strategy_position: string
    conflict: string
    resolution: string
    decision?: "accept" | "rework"
  }
  decision?: "accept" | "rework"
  planning_round?: number
  rework_targets?: string[]
  required_fixes?: string[]
  release_gate: string
  next_round_rule: string
}

export type StreamMap = { doc: string; guide: string; mindmap: string; quiz: string; path: string; reading: string; code: string; video: string }
export type RunStatus = "idle" | "running" | "done" | "error" | "interrupted"

export interface TrainingDiagnosis {
  type: "diagnosis"
  title: string
  current_level: string
  target_difficulty: number
  knowledge_score: number | null
  evidence_confidence: number
  training_cycle?: number
  adaptation_reason?: string
  knowledge_gaps: string[]
  training_goal: string
  training_contract: Record<string, unknown>
}

export interface ReviewFinding {
  code?: string
  severity: "blocker" | "high" | "medium" | string
  message: string
  suggestion: string
  target_agent: "doc" | "guide" | "quiz" | string
}

export interface TrainingReview {
  type?: "review"
  reviewer?: string
  status: "pass" | "warn" | "fail"
  score: number
  findings: ReviewFinding[]
  metrics?: Record<string, unknown>
  target_agent?: string
  decision?: "accept" | "rework"
}

export interface QualityMetric {
  label: string
  value: number
  operator: "<" | ">=" | string
  threshold: number
  passed: boolean
}

export interface TrainingDecision {
  decision: "publish" | "rework" | "failed"
  summary: string
  quality_score: number
  generation_round: number
  rework_targets: string[]
  required_fixes: string[]
  review_scores: Record<string, number>
  quality_metrics?: Record<string, QualityMetric>
  hallucination_rate?: number
  profile_difficulty_accuracy?: number
  core_knowledge_coverage?: number
  max_reworks_reached?: boolean
  release_gate: {
    review_count: number
    blocker_count: number
    all_reviews_present: boolean
    all_metrics_passed?: boolean
    thresholds?: Record<string, string>
  }
}

export interface DebateExchange {
  generator: string
  reviewer: string
  generator_position: string
  generator_response: string[]
  reviewer_challenges: ReviewFinding[]
  reviewer_decision: "accept" | "rework"
  review_score: number
}

export interface DebateRecord {
  phase: "planning" | "resource"
  round: number
  title: string
  participants: string[]
  positions?: Record<string, string>
  conflict?: string
  resolution?: string
  decision: "accept" | "rework"
  rework_targets?: string[]
  required_fixes?: string[]
  exchanges?: DebateExchange[]
}

export interface TrainingFeedback {
  run_id: string
  accuracy: number | null
  answered_count: number
  wrong_items: string[]
  next_action: string
  message: string
  profile_update: { evidence_source: string; suggested_difficulty_delta: number; confidence_delta: number }
}

export interface QuizAttempt {
  id: string
  question: string
  type: "mcq" | "fill" | "code"
  user_answer: string
  correct_answer: string
  is_correct: boolean
  topic: string
  difficulty: number
}

export interface ReworkRecord {
  phase: "planning" | "resource"
  reworkAttempt: number
  generationRound: number
  targets: string[]
  requiredFixes: string[]
  createdAt: number
}

export interface WorkspaceState {
  topic: string
  courseId: number | null
  courseName: string
  status: RunStatus
  runId: string
  domain: string
  targetRole: string
  roleSummary: string
  coreCompetencies: string[]
  stage: string
  generationRound: number
  reworkHistory: ReworkRecord[]
  debates: DebateRecord[]
  diagnosis: TrainingDiagnosis | null
  reviews: Record<string, TrainingReview>
  decision: TrainingDecision | null
  feedback: TrainingFeedback | null
  outputs: WorkspaceOutputs
  stream: StreamMap
  agentStatus: Record<string, string>
  agents: AgentState[]
  logs: string[]
  quizAttempts: Record<string, QuizAttempt>
  /** 用户真正打开过、保存过或完成过的学习资源，而不是 Agent 仅生成出的资源。 */
  resourcesConsumed: Record<string, number>
  /** 已同步进报告证据的独立测验，防止刷新页面后重复累计用时。 */
  quizSessionsRecorded: Record<string, number>
  learningStartedAt: number
  learningDurationMs: number
  startedAt: number
  finishedAt: number
  /** 最近一次整轮运行失败或中断的可读原因，用于恢复提示。 */
  lastError: string
  updatedAt: number
}

const STORAGE_KEY = "sm:workspace-state"

const EMPTY_STREAM: StreamMap = { doc: "", guide: "", mindmap: "", quiz: "", path: "", reading: "", code: "", video: "" }

function settleActiveAgents(agents: AgentState[], message: string): AgentState[] {
  return agents.map((agent) => agent.status === "running" || agent.status === "streaming"
    ? { ...agent, status: "error" as const, message }
    : agent)
}

function settleActiveStatusMap(agentStatus: Record<string, string>, agents: AgentState[]) {
  const next = { ...agentStatus }
  agents.forEach((agent) => {
    if (agent.status === "running" || agent.status === "streaming") next[agent.meta.id] = "error"
  })
  return next
}

function makeInitialState(): WorkspaceState {
  return {
    topic: "",
    courseId: null,
    courseName: "",
    status: "idle",
    runId: "",
    domain: "",
    targetRole: "",
    roleSummary: "",
    coreCompetencies: [],
    stage: "idle",
    generationRound: 1,
    reworkHistory: [],
    debates: [],
    diagnosis: null,
    reviews: {},
    decision: null,
    feedback: null,
    outputs: {},
    stream: { ...EMPTY_STREAM },
    agentStatus: {},
    agents: [],
    logs: [],
    quizAttempts: {},
    resourcesConsumed: {},
    quizSessionsRecorded: {},
    learningStartedAt: 0,
    learningDurationMs: 0,
    startedAt: 0,
    finishedAt: 0,
    lastError: "",
    updatedAt: 0,
  }
}

function loadFromStorage(): WorkspaceState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceState
    const legacyDecision = parsed.decision as (Omit<TrainingDecision, "decision"> & { decision?: string }) | null
    const hadLegacyManualReview = parsed.stage === "manual_review" || legacyDecision?.decision === "manual_review"
    if (hadLegacyManualReview) {
      const normalizedFixes = (legacyDecision?.required_fixes ?? []).map((item) =>
        item.replace(/导师人工复核|人工复核|人工审核|转人工/g, "自动返工")
      )
      parsed.stage = "rework"
      parsed.status = "interrupted"
      parsed.lastError = "旧版待处理状态已取消；请重新启动本轮训练，系统会自动返工并重新审核。"
      parsed.decision = legacyDecision ? {
        ...legacyDecision,
        decision: "rework",
        summary: "旧版未通过裁决的资源不会发布；重新启动后将进入自动返工闭环。",
        rework_targets: legacyDecision.rework_targets?.length ? legacyDecision.rework_targets : ["doc", "guide", "quiz"],
        required_fixes: normalizedFixes,
      } : null
      parsed.reworkHistory = [...(parsed.reworkHistory ?? []), {
        phase: "resource" as const,
        reworkAttempt: 1,
        generationRound: parsed.generationRound ?? 1,
        targets: parsed.decision?.rework_targets ?? ["doc", "guide", "quiz"],
        requiredFixes: parsed.decision?.required_fixes ?? [],
        createdAt: Date.now(),
      }].slice(-8)
      parsed.logs = [...(parsed.logs ?? []), "旧版待处理状态已迁移为自动返工待重启"].slice(-40)
    }
    // 浏览器刷新会中断 SSE，但已经生成的成果仍然有效；明确标记为中断，避免静默伪装成空闲。
    if (parsed.status === "running") {
      const activeAgents = parsed.agents ?? []
      parsed.status = "interrupted"
      parsed.finishedAt = Date.now()
      parsed.lastError = "页面刷新后，生成连接已中断；已完成的资源仍为你保留。"
      parsed.agents = settleActiveAgents(activeAgents, "页面刷新，连接已中断")
      parsed.agentStatus = settleActiveStatusMap(parsed.agentStatus ?? {}, activeAgents)
      parsed.logs = [
        ...(parsed.logs ?? []),
        "生成连接因页面刷新而中断，已保留现有成果",
      ].slice(-40)
    }
    // 兼容旧版 sessionStorage；旧数据没有行为证据时绝不反推成“已学习”。
    return {
      ...makeInitialState(),
      ...parsed,
      courseId: parsed.courseId ?? null,
      courseName: parsed.courseName ?? "",
      runId: parsed.runId ?? "",
      domain: parsed.domain ?? "",
      targetRole: parsed.targetRole ?? "",
      roleSummary: parsed.roleSummary ?? "",
      coreCompetencies: parsed.coreCompetencies ?? [],
      stage: parsed.stage ?? "idle",
      generationRound: parsed.generationRound ?? 1,
      reworkHistory: (parsed.reworkHistory ?? []).map((item, index) => ({
        ...item,
        phase: item.phase ?? ("resource" as const),
        reworkAttempt: item.reworkAttempt ?? index + 1,
      })),
      debates: parsed.debates ?? [],
      diagnosis: parsed.diagnosis ?? null,
      reviews: parsed.reviews ?? {},
      decision: parsed.decision ?? null,
      feedback: parsed.feedback ?? null,
      resourcesConsumed: parsed.resourcesConsumed ?? {},
      quizSessionsRecorded: parsed.quizSessionsRecorded ?? {},
      learningStartedAt: parsed.learningStartedAt ?? 0,
      learningDurationMs: parsed.learningDurationMs ?? 0,
      lastError: parsed.lastError ?? "",
    }
  } catch {
    return null
  }
}

function persist(state: WorkspaceState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === "string" && error.trim() && error !== "[object Object]") return error
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

class WorkspaceStore {
  private state: WorkspaceState
  private listeners = new Set<() => void>()
  private abort: AbortController | null = null

  constructor() {
    this.state = loadFromStorage() || makeInitialState()
    persist(this.state)
  }

  getState = (): WorkspaceState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private setState(patch: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch
    this.state = { ...this.state, ...p, updatedAt: Date.now() }
    persist(this.state)
    this.listeners.forEach((fn) => fn())
  }

  private isRunActive() {
    return this.state.status === "running"
  }

  private finishWithIssue(status: "error" | "interrupted", message: string, logMessage: string) {
    this.setState((s) => ({
      status,
      finishedAt: Date.now(),
      lastError: message,
      agents: settleActiveAgents(s.agents, status === "interrupted" ? "生成已停止" : "连接异常，生成中断"),
      agentStatus: settleActiveStatusMap(s.agentStatus, s.agents),
      logs: [...s.logs, logMessage].slice(-40),
    }))
  }

  /** 重置所有数据 */
  reset() {
    this.abort?.abort()
    this.abort = null
    this.state = makeInitialState()
    persist(this.state)
    this.listeners.forEach((fn) => fn())
  }

  /** 取消正在运行的 SSE（保留已生成的数据） */
  cancel() {
    this.abort?.abort()
    this.abort = null
    if (this.state.status === "running") {
      this.finishWithIssue(
        "interrupted",
        "你已停止本轮生成；已完成的资源仍为你保留。",
        "用户停止生成，已保留现有成果",
      )
    }
  }

  /** 启动多 Agent。SSE 在 store 内部跑，不随 Workspace 组件挂载/卸载。
   *  courseId 给定时所有 Agent 的 RAG 检索按该课程过滤（多课程架构）。
   */
  async start(topic: string, userId: number, courseId?: number | null, courseName = "") {
    if (!topic.trim() || this.state.status === "running") return

    // 取消上一次的连接
    this.abort?.abort()
    const ctrl = new AbortController()
    this.abort = ctrl

    // 清空旧数据，进入 running
    this.setState({
      topic,
      courseId: courseId ?? null,
      courseName,
      status: "running",
      runId: "",
      domain: "",
      targetRole: "",
      roleSummary: "",
      coreCompetencies: [],
      stage: "diagnosis",
      generationRound: 1,
      reworkHistory: [],
      debates: [],
      diagnosis: null,
      reviews: {},
      decision: null,
      feedback: null,
      outputs: {},
      stream: { ...EMPTY_STREAM },
      agentStatus: {},
      agents: [],
      logs: [],
      quizAttempts: {},
      resourcesConsumed: {},
      quizSessionsRecorded: {},
      learningStartedAt: 0,
      learningDurationMs: 0,
      startedAt: Date.now(),
      finishedAt: 0,
      lastError: "",
    })

    try {
      await fetchEventSource("/api/workspace/generate", {
        method: "POST",
        headers: sseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ user_id: userId, topic, course_id: courseId ?? null, persist: true }),
        signal: ctrl.signal,
        openWhenHidden: true,
        onmessage: (msg) => {
          const eventName = msg.event || "message"
          let data: unknown = msg.data
          try {
            data = JSON.parse(msg.data)
          } catch {
            /* keep raw */
          }
          this.handleEvent(eventName, data)
        },
        onerror: (err) => {
          if (ctrl.signal.aborted) throw err
          const message = readableError(err, "生成连接异常，请检查服务状态后重试。")
          this.finishWithIssue("error", message, `错误: ${message}`)
          throw err
        },
      })
      if (!ctrl.signal.aborted && this.isRunActive()) {
        const message = "生成连接提前结束；已完成的资源仍为你保留。"
        this.finishWithIssue("error", message, `错误: ${message}`)
      }
    } catch (error) {
      if (!ctrl.signal.aborted && this.isRunActive()) {
        const message = readableError(error, "生成过程中出现异常，请稍后重试。")
        this.finishWithIssue("error", message, `错误: ${message}`)
      }
    } finally {
      if (this.abort === ctrl) this.abort = null
    }
  }

  private handleEvent(eventName: string, raw: unknown) {
    const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    switch (eventName) {
      case "meta": {
        const data = raw as {
          agents: AgentMeta[]; run_id?: string; domain?: string; target_role?: string
          role_summary?: string; core_competencies?: string[]
        }
        this.setState({
          agents: data.agents.map((m) => ({ meta: m, status: "pending" as const })),
          runId: data.run_id ?? "",
          domain: data.domain ?? "",
          targetRole: data.target_role ?? "",
          roleSummary: data.role_summary ?? "",
          coreCompetencies: data.core_competencies ?? [],
        })
        break
      }
      case "stage": {
        const stage = String(d.stage ?? "")
        const generationRound = Number(d.generation_round ?? 1)
        this.setState((s) => ({
          stage,
          generationRound,
          // 新一轮资源生成开始后，上一轮审核不能继续显示为本轮实时结果。
          ...(stage === "generation" && generationRound > s.generationRound
            ? { reviews: {}, decision: null }
            : {}),
        }))
        if (d.message) this.appendLog(String(d.message))
        break
      }
      case "diagnosis": {
        const diagnosis = raw as TrainingDiagnosis
        this.setState((s) => ({ diagnosis, outputs: { ...s.outputs, diagnosis } }))
        break
      }
      case "proposal": {
        const aid = String(d.agent ?? "")
        if (aid === "domain_expert" || aid === "learning_strategy") {
          this.setState((s) => ({
            outputs: { ...s.outputs, [aid]: raw as TrainingProposal },
          }))
        }
        break
      }
      case "plan": {
        this.setState((s) => ({
          outputs: { ...s.outputs, training_plan: raw as PersonalizedTrainingPlan },
        }))
        break
      }
      case "review": {
        const aid = String(d.agent ?? "")
        this.setState((s) => ({
          reviews: { ...s.reviews, [aid]: raw as TrainingReview },
        }))
        break
      }
      case "decision": {
        this.setState({ decision: raw as TrainingDecision })
        break
      }
      case "debate": {
        const debate = raw as DebateRecord
        this.setState((s) => ({ debates: [...s.debates, debate].slice(-12) }))
        this.appendLog(`${debate.title}：${debate.decision === "accept" ? "通过" : "退回返工"}`)
        break
      }
      case "rework": {
        this.setState((s) => ({
          stage: "rework",
          generationRound: Number(d.generation_round ?? 1),
          reworkHistory: [...s.reworkHistory, {
            phase: (d.phase === "planning" ? "planning" : "resource") as ReworkRecord["phase"],
            reworkAttempt: Number(d.rework_attempt ?? 1),
            generationRound: Number(d.generation_round ?? 1),
            targets: (d.targets as string[]) ?? [],
            requiredFixes: (d.required_fixes as string[]) ?? [],
            createdAt: Date.now(),
          }].slice(-8),
        }))
        this.appendLog(`${d.phase === "planning" ? "计划仲裁" : "资源审核"}退回：${((d.targets as string[]) ?? []).join("、")}`)
        break
      }
      case "rework_exhausted": {
        this.appendLog(String(d.summary ?? "已达到 3 次返工上限，保持真实结果并停止发布"))
        break
      }
      case "agent_status": {
        const aid = d.agent as string
        const st = d.status as AgentState["status"]
        const message = d.message as string | undefined
        this.setState((s) => ({
          agents: s.agents.map((a) => (a.meta.id === aid ? { ...a, status: st, message } : a)),
          agentStatus: { ...s.agentStatus, [aid]: st },
        }))
        if (st === "running") this.appendLog(`${aid} 开始执行`)
        else if (st === "done") this.appendLog(`${aid} 完成`)
        else if (st === "error") this.appendLog(`${aid} 失败: ${message ?? ""}`)
        break
      }
      case "agent_delta": {
        const aid = d.agent as string
        const delta = d.delta as string
        this.setState((s) => ({
          agents: s.agents.map((a) => (a.meta.id === aid ? { ...a, status: "streaming" as const } : a)),
          stream: { ...s.stream, [aid]: ((s.stream as Record<string, string>)[aid] ?? "") + delta },
        }))
        break
      }
      case "agent_done": {
        const aid = d.agent as string
        const out = d.output as Record<string, unknown>
        this.setState((s) => ({
          outputs: { ...s.outputs, [aid]: out as unknown as WorkspaceOutputs[keyof WorkspaceOutputs] },
        }))
        break
      }
      case "log": {
        this.appendLog(String(d.message))
        break
      }
      case "done": {
        const data = raw as {
          run_id?: string; stage?: string; generation_round?: number
          diagnosis?: TrainingDiagnosis; reviews?: Record<string, TrainingReview>; decision?: TrainingDecision
          outputs?: WorkspaceOutputs; debates?: DebateRecord[]
        }
        this.setState((s) => ({
          status: data.decision?.decision === "failed" ? "error" : "done",
          finishedAt: Date.now(),
          lastError: data.decision?.decision === "failed" ? data.decision.summary : "",
          runId: data.run_id ?? s.runId,
          stage: data.stage ?? s.stage,
          generationRound: data.generation_round ?? s.generationRound,
          diagnosis: data.diagnosis ?? s.diagnosis,
          reviews: data.reviews ?? s.reviews,
          decision: data.decision ?? s.decision,
          outputs: data.outputs ?? s.outputs,
          debates: data.debates ?? s.debates,
        }))
        this.abort = null
        break
      }
      case "error": {
        const message = typeof d.message === "string" && d.message.trim()
          ? d.message
          : readableError(raw, "生成过程中出现异常，请稍后重试。")
        this.finishWithIssue("error", message, `错误: ${message}`)
        this.abort = null
        break
      }
    }
  }

  private appendLog(msg: string) {
    this.setState((s) => ({ logs: [...s.logs, msg].slice(-40) }))
  }

  /** 记录一次答题（供 QuizCard 提交时调用）。同一题再次提交会覆盖。 */
  recordQuizAttempt(attempt: QuizAttempt) {
    const now = Date.now()
    this.setState((s) => ({
      quizAttempts: { ...s.quizAttempts, [attempt.id]: attempt },
      resourcesConsumed: { ...s.resourcesConsumed, quiz: s.resourcesConsumed.quiz || now },
      learningStartedAt: s.learningStartedAt || now,
    }))
  }

  /** 记录用户实际查看/沉淀过的资源类型。 */
  recordResourceConsumed(resource: string) {
    if (!resource) return
    const now = Date.now()
    this.setState((s) => ({
      resourcesConsumed: { ...s.resourcesConsumed, [resource]: s.resourcesConsumed[resource] || now },
      learningStartedAt: s.learningStartedAt || now,
    }))
  }

  /** 累计可解释的前台学习时长；单次最多计 30 分钟，避免休眠标签页制造虚高数据。 */
  recordLearningDuration(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    const bounded = Math.min(Math.round(durationMs), 30 * 60 * 1000)
    const now = Date.now()
    this.setState((s) => ({
      learningStartedAt: s.learningStartedAt || now,
      learningDurationMs: s.learningDurationMs + bounded,
    }))
  }

  /** 把独立测验的真实提交结果并入本次报告证据，且同一 session 只累计一次用时。 */
  recordQuizSessionAttempts(params: {
    sessionId: number
    attempts: QuizAttempt[]
    durationMs: number
    topic: string
    courseId: number | null
    courseName: string
  }) {
    if (!params.attempts.length) return
    const now = Date.now()
    this.setState((s) => {
      const sessionKey = String(params.sessionId)
      const firstImport = !s.quizSessionsRecorded[sessionKey]
      const incoming = Object.fromEntries(params.attempts.map((attempt) => [attempt.id, attempt]))
      const boundedDuration = firstImport
        ? Math.min(Math.max(Math.round(params.durationMs || 0), 0), 2 * 60 * 60 * 1000)
        : 0
      const hasExistingEvidence = Object.keys(s.resourcesConsumed).length > 0 || Object.keys(s.quizAttempts).length > 0
      return {
        topic: s.topic || params.topic,
        courseId: hasExistingEvidence ? s.courseId : params.courseId,
        courseName: hasExistingEvidence ? s.courseName : params.courseName,
        quizAttempts: { ...s.quizAttempts, ...incoming },
        resourcesConsumed: { ...s.resourcesConsumed, quiz: s.resourcesConsumed.quiz || now },
        quizSessionsRecorded: { ...s.quizSessionsRecorded, [sessionKey]: s.quizSessionsRecorded[sessionKey] || now },
        learningStartedAt: s.learningStartedAt || now,
        learningDurationMs: s.learningDurationMs + boundedDuration,
      }
    })
  }

  /** 把追加的测验题拼到 outputs.quiz.items 末尾。
   *  调用方负责调 POST /api/workspace/append-quiz 拿 items 后传进来。 */
  appendQuizItems(items: QuizItem[]) {
    if (!items.length) return
    this.setState((s) => {
      const oldQuiz = s.outputs.quiz
      if (!oldQuiz) {
        return {
          outputs: {
            ...s.outputs,
            quiz: { type: "quiz", title: "测验题", items, count: items.length },
          },
        }
      }
      const merged = [...oldQuiz.items, ...items]
      return {
        outputs: {
          ...s.outputs,
          quiz: { ...oldQuiz, items: merged, count: merged.length },
        },
      }
    })
  }

  async submitTrainingFeedback(satisfaction?: number): Promise<TrainingFeedback> {
    if (!this.state.runId) throw new Error("没有可反馈的训练记录")
    const attempts = Object.values(this.state.quizAttempts).map((item) => ({
      question_id: item.id,
      correct: item.is_correct,
      difficulty: item.difficulty,
    }))
    const result = await apiPost<TrainingFeedback>("/workspace/feedback", {
      run_id: this.state.runId,
      attempts,
      time_spent_min: Math.round(this.state.learningDurationMs / 60000),
      satisfaction,
    })
    this.setState({ feedback: result, stage: "feedback_updated" })
    return result
  }
}

export const workspaceStore = new WorkspaceStore()

if (typeof window !== "undefined") {
  window.addEventListener("studymate:user-session-reset", () => workspaceStore.reset())
}

/** React hook: 订阅 store，组件挂载/卸载不影响 SSE */
export function useWorkspaceStore(): WorkspaceState {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getState, workspaceStore.getState)
}

// 兼容旧 API（详情页轮询用）
export function loadWorkspaceState(): WorkspaceState | null {
  return workspaceStore.getState()
}
export function clearWorkspaceState() {
  workspaceStore.reset()
}
