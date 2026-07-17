import type { QuizItemType } from "@/lib/quizSession"

const CALCULATION_HINTS = ["计算", "求", "公式", "数值", "概率", "复杂度", "梯度", "矩阵", "方差", "均值"]
const METHOD_HINTS = ["适合", "应当", "应该", "选择", "采用", "方法", "算法", "策略", "场景"]
const BOUNDARY_HINTS = ["边界", "极端", "为空", "空数组", "溢出", "异常", "鲁棒", "特殊情况"]
const COMPLEXITY_HINTS = ["复杂度", "性能", "时间开销", "空间开销", "效率"]
const DEBUG_HINTS = ["语法", "报错", "异常", "运行", "未定义", "类型", "缩进", "编译"]

export function isBlankQuizAnswer(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim())
}

export function classifyQuizErrorTags(
  question: string,
  itemType: QuizItemType,
  userAnswer?: unknown,
  judgeReason = "",
): string[] {
  if (isBlankQuizAnswer(userAnswer)) return ["未作答"]

  const text = `${question} ${judgeReason}`.toLowerCase()
  const tags: string[] = []

  if (itemType === "code") {
    tags.push("编程实现")
    if (DEBUG_HINTS.some((hint) => text.includes(hint))) tags.push("代码调试")
    if (BOUNDARY_HINTS.some((hint) => text.includes(hint))) tags.push("边界条件")
    if (COMPLEXITY_HINTS.some((hint) => text.includes(hint))) tags.push("复杂度分析")
  } else if (CALCULATION_HINTS.some((hint) => text.includes(hint))) {
    tags.push("公式计算")
  } else if (itemType === "fill") {
    tags.push("知识记忆")
  } else if (METHOD_HINTS.some((hint) => text.includes(hint))) {
    tags.push("方法选择")
  } else {
    tags.push("概念辨析")
  }

  return [...new Set(tags)].slice(0, 3)
}

export function effectiveQuizErrorTags(
  question: string,
  itemType: QuizItemType,
  userAnswer: unknown,
  judgeReason = "",
  storedTags: string[] = [],
): string[] {
  if (isBlankQuizAnswer(userAnswer)) return ["未作答"]
  const clean = [...new Set(storedTags.map((tag) => tag.trim()).filter((tag) => tag && tag !== "未作答"))].slice(0, 3)
  return clean.length > 0 ? clean : classifyQuizErrorTags(question, itemType, userAnswer, judgeReason)
}
