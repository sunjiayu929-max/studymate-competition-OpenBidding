/**
 * 动画讲解 Agent 客户端。
 * 把前端动画目录（key/title/course）随问题传给后端，后端做双层覆盖：
 *   - 命中手写动画 → 返回 key + 开场白（确定性、像素级）。
 *   - 没命中 → 后端 LLM 现编排一份「分步动画脚本」script，前端用通用模板播放，
 *     让任意概念都有图画讲解（generated=true）。
 * 前端先做关键词初筛 matchConcept，命中就当 hint 传上去（也作 LLM 失败兜底）。
 */
import { apiPost } from "@/lib/api"
import { CONCEPT_ANIMS, matchConcept } from "@/components/concepts/registry"

/** 通用模板里的一个对象/状态节点（数组元素、协议阶段、树节点…） */
export interface ScriptNode {
  label: string
  state?: "active" | "done" | "idle"
}

/** 一步讲解：标题 + 说明 +（可选）该步的节点状态 */
export interface ScriptStep {
  title: string
  desc: string
  nodes?: ScriptNode[]
}

/** LLM 现编排的分步动画脚本（也是后续「讲课模式 / TTS 连播」的原料） */
export interface ConceptScript {
  concept: string
  summary: string
  steps: ScriptStep[]
  pitfall?: string
  /** 渲染方式：model=节点模板动画（概念有对象/阶段）；board=黑板老师逐行板书（无模型，通用兜底） */
  visual?: "model" | "board"
}

export interface ExplainResult {
  matched: boolean
  key: string | null
  title: string | null
  intro: string
  /** 未命中手写动画时，通用模板播放用的脚本 */
  script?: ConceptScript | null
  /** true = 这是 AI 现编排的通用动画（需带 AI 生成标识） */
  generated?: boolean
  mock: boolean
}

export interface ConceptRoleContext {
  target_role: string
  role_summary?: string
  core_competencies?: string[]
  sample_tasks?: string[]
}

export interface ConceptVideoResult {
  type: "video"
  title: string
  provider: string
  model: string
  status: "unconfigured" | "succeeded" | "failed" | string
  job_id?: string
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
  }
  complexity?: "focused" | "workflow" | "complex" | string
  scope?: string
  duration_reason?: string
  estimated_cost_rmb?: number
  actual_cost_rmb?: number
  total_duration?: number
  segment_count?: number
  completed_segments?: number
  assembly_status?: "pending" | "assembled" | "unavailable" | "failed" | "not_started" | string
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

export interface ConceptVideoPlan {
  duration: number
  resolution: string
  ratio: string
  complexity: "focused" | "workflow" | "complex" | string
  scope: string
  duration_reason: string
  estimated_cost_rmb: number
  total_duration: number
  segment_count: number
  segments: Array<{ index: number; title: string; purpose: string; voiceover: string; duration: number; status: string }>
}

interface ExplainCacheEntry {
  promise: Promise<ExplainResult>
  expiresAt: number
}

const CONCEPT_CATALOG_VERSION = `v1-${CONCEPT_ANIMS.length}`
const EXPLAIN_CACHE_TTL = 10 * 60 * 1000
const MOCK_CACHE_TTL = 60 * 1000
const EXPLAIN_CACHE_LIMIT = 20
const explainCache = new Map<string, ExplainCacheEntry>()

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN")
}

function cacheKey(question: string, userId: number, roleContext?: ConceptRoleContext): string {
  const roleKey = roleContext?.target_role ? normalizeQuestion(roleContext.target_role) : ""
  return `${CONCEPT_CATALOG_VERSION}:${userId}:${roleKey}:${normalizeQuestion(question)}`
}

function trimExplainCache() {
  while (explainCache.size > EXPLAIN_CACHE_LIMIT) {
    const oldestKey = explainCache.keys().next().value
    if (typeof oldestKey !== "string") return
    explainCache.delete(oldestKey)
  }
}

/** 后端不可用时的纯前端通用骨架脚本，保证当场必出、不空白 */
function mockScript(question: string): ConceptScript {
  const q = question.trim().slice(0, 30) || "这个概念"
  return {
    concept: q,
    summary: `分四步看懂「${q}」`,
    steps: [
      { title: "是什么", desc: `先弄清「${q}」要解决什么问题、基本定义是什么。`, nodes: [] },
      { title: "关键机制", desc: "抓住它最核心的一两个原理或组成部分。", nodes: [] },
      { title: "怎么运作", desc: "按顺序走一遍它的完整工作流程。", nodes: [] },
      { title: "易错点", desc: "留意最容易混淆或出错的地方。", nodes: [] },
    ],
    pitfall: "",
    visual: "board", // 骨架兜底没有模型，走黑板讲解
  }
}

function fallbackExplainResult(question: string): ExplainResult {
  const matched = matchConcept(question)
  if (matched) {
    return {
      matched: true,
      key: matched.key,
      title: matched.title,
      intro: `我用动画给你讲讲「${matched.title}」。`,
      script: null,
      generated: false,
      mock: true,
    }
  }
  return {
    matched: false,
    key: null,
    title: question,
    intro: "动画库里还没有这个概念的专属动画，我现编排了一个分步讲解给你看 👇",
    script: mockScript(question),
    generated: true,
    mock: true,
  }
}

function requestConcept(question: string, userId: number, roleContext?: ConceptRoleContext): Promise<ExplainResult> {
  const key = cacheKey(question, userId, roleContext)
  const now = Date.now()
  const cached = explainCache.get(key)
  if (cached && cached.expiresAt > now) {
    explainCache.delete(key)
    explainCache.set(key, cached)
    return cached.promise
  }
  if (cached) explainCache.delete(key)

  const matched = matchConcept(question)
  const concepts = CONCEPT_ANIMS.map((c) => ({ key: c.key, title: c.title, course: c.course }))
  const entry: ExplainCacheEntry = {
    expiresAt: now + EXPLAIN_CACHE_TTL,
    promise: apiPost<ExplainResult>("/concept/explain", {
      user_id: userId,
      question,
      concepts,
      matched_key: matched?.key ?? null,
      ...roleContext,
    }).then((result) => {
      entry.expiresAt = Date.now() + (result.mock ? MOCK_CACHE_TTL : EXPLAIN_CACHE_TTL)
      return result
    }).catch((error) => {
      if (explainCache.get(key) === entry) explainCache.delete(key)
      throw error
    }),
  }
  explainCache.set(key, entry)
  trimExplainCache()
  return entry.promise
}

/**
 * 在用户明确启动工作台生成后预取讲解。失败只清理缓存，进入页面时仍会正常重试。
 */
export function prefetchConcept(question: string, userId: number): Promise<void> {
  const normalized = question.trim()
  if (!normalized) return Promise.resolve()
  return requestConcept(normalized, userId).then(() => undefined).catch(() => undefined)
}

export async function explainConcept(question: string, userId: number, roleContext?: ConceptRoleContext): Promise<ExplainResult> {
  const normalized = question.trim()
  if (!normalized) return fallbackExplainResult(question)
  try {
    return await requestConcept(normalized, userId, roleContext)
  } catch {
    // 后端不可用 → 纯前端兜底，保证可视讲解不空白。
    return fallbackExplainResult(normalized)
  }
}
