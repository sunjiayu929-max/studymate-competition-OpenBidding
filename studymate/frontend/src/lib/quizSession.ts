/**
 * 题库测验 API client + 类型。
 * 与工作台临时检测题（store/workspace.outputs.quiz）完全隔离。
 */
import { apiGet, apiPost } from "@/lib/api"

export type QuizMode = "exam" | "quest"
export type CodeGrading = "llm" | "self"
export type QuizItemType = "mcq" | "fill" | "code"

export interface QuizSessionItem {
  id: number
  idx: number
  type: QuizItemType
  question: string
  options: string[]
  starter: string
  answer_key: number | string | null  // mcq=index / fill=string / code=ref code
  explanation: string
  difficulty: number
  user_answer: number | string | null
  is_correct: boolean
  score: number
  judge_reason: string
  error_tags: string[]
}

export interface QuizSession {
  id: number
  user_id: number
  course_id: number | null
  topic: string
  mcq_count: number
  fill_count: number
  code_count: number
  total_count: number
  difficulty: number
  mode: QuizMode
  code_grading: CodeGrading
  status: "generating" | "ready" | "submitted" | "error"
  score: number
  duration_ms: number
  created_at: string | null
  submitted_at: string | null
  items: QuizSessionItem[]
}

export interface CreateQuizSessionInput {
  user_id: number
  course_id: number | null
  topic: string
  mcq_count: number
  fill_count: number
  code_count: number
  difficulty: number
  mode: QuizMode
  code_grading: CodeGrading
}

export interface SubmitAnswer {
  item_id: number
  answer?: number | string | null
  self_correct?: boolean
}

export interface QuizRecommendation {
  focus: { tag: string; count: number }[]
  message: string
}

export async function createQuizSession(input: CreateQuizSessionInput) {
  return apiPost<QuizSession>("/quiz-sessions", input)
}

export async function listQuizSessions(params: { user_id: number; course_id?: number | null; limit?: number }) {
  const qs = new URLSearchParams({ user_id: String(params.user_id) })
  if (params.course_id != null) qs.set("course_id", String(params.course_id))
  if (params.limit) qs.set("limit", String(params.limit))
  return apiGet<QuizSession[]>(`/quiz-sessions?${qs}`)
}

export async function getQuizRecommendation(params: { user_id: number; course_id?: number | null }) {
  const qs = new URLSearchParams({ user_id: String(params.user_id) })
  if (params.course_id != null) qs.set("course_id", String(params.course_id))
  return apiGet<QuizRecommendation>(`/quiz-sessions/recommendation?${qs}`)
}

export async function getQuizSession(id: number) {
  return apiGet<QuizSession>(`/quiz-sessions/${id}`)
}

export async function submitQuizSession(id: number, body: { answers: SubmitAnswer[]; duration_ms: number }) {
  return apiPost<QuizSession>(`/quiz-sessions/${id}/submit`, body)
}
