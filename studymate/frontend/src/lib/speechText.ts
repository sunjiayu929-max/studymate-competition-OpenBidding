/** 移除展示用 Markdown，但保留公式正文，交给后端转换成可朗读文本。 */
export function prepareSpeechText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "（此处省略代码块）")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
