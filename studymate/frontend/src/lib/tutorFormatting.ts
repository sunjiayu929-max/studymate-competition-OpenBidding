/**
 * 历史回答可能以“直觉不对。解释……”连在同一段。只对回答开头的短判断语
 * 做展示层分段，不改会话存储原文，也不触碰正文、代码块或普通“直觉”用法。
 */
export function formatTutorDisplayContent(content: string): string {
  return content.replace(
    /^((?:(?:这个|你的)\s*)?直觉(?:是)?(?:正确|基本正确|方向正确|不对|有偏差|需要调整)[。！？!?])[ \t]*(?=\S)/u,
    "$1\n\n",
  )
}
