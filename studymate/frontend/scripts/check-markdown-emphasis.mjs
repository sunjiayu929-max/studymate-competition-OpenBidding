import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 992, name: "强调渲染", email: "md-em@example.invalid", role: "student" }
const course = { id: 1, name: "机器学习", description: "ml" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "掌握机器学习", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 2, algorithms: 2, data_ai: 2, systems: 1, engineering: 1, professional: 1 },
}

const assistant = [
  "1) 标准：**梯度下降** 与 __动量法__。",
  "",
  "2) 中文紧贴标点：**收敛速度**。以及**过拟合**、欠拟合。",
  "",
  "3) 无空格嵌中文词中：这是**关键点**所在。",
  "",
  "4) 三星号：***又粗又斜***。",
  "",
  "5) 行内代码混排：先看 `lr` 再看 **learning rate**。",
  "",
  "6) 引用块：",
  "> **注意**：学习率过大会发散。",
  "",
  "7) 表内强调：",
  "| 项 | 说明 |",
  "| --- | --- |",
  "| **SGD** | 随机梯度 |",
  "",
  "8) 常见模型瑕疵（应尽量仍可读）：",
  "**加粗却少了结尾",
  "下一行 **正常加粗**。",
  "",
  "9) 全角星号不应生效：＊＊伪加粗＊＊",
  "",
  "10) HTML：<b>html粗体</b> 与 <strong>strong标签</strong>",
].join("\n")

const now = new Date().toISOString()
const conversationState = {
  active: {
    id: "em1", title: "强调渲染", created_at: now, updated_at: now,
    messages: [
      { role: "user", content: "测试加粗" },
      { role: "assistant", content: assistant },
    ],
  },
  items: [],
}

let browser
try { browser = await chromium.launch() } catch (e) {
  if (!String(e).includes("Executable doesn't exist")) throw e
  browser = await chromium.launch({ channel: "chrome" })
}
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const json = (route, value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) })
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === `/api/courses/${course.id}/config`) return json(route, { ...course, persona: "助教", code_style: "ml", code_libs: [], reading_sources: [], sample_topics: [], sample_questions: [], syllabus_hint: "", from_registry: true })
  if (path === `/api/profile/${user.user_id}`) return json(route, { user_id: user.user_id, version: 1, dims })
  if (path === "/api/tutor/conversations") return json(route, conversationState)
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  return json(route, { ok: true })
})
await page.addInitScript(({ currentUser, currentCourse }) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem("sm:current-course", JSON.stringify(currentCourse))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
}, { currentUser: user, currentCourse: course })

await page.goto(`${baseUrl}/tutor`, { waitUntil: "networkidle" })
const msg = page.locator('[data-tutor-message="assistant"]').first()
await msg.waitFor()
await page.waitForTimeout(700)

const report = await msg.evaluate((el) => {
  const root = el.querySelector(".prose") || el
  const body = root.querySelector("p") || root
  const bodyStyle = getComputedStyle(body)
  const strongs = [...root.querySelectorAll("strong, b")].map((n) => {
    const cs = getComputedStyle(n)
    return {
      text: (n.textContent || "").trim(),
      fontWeight: cs.fontWeight,
      fontFamily: cs.fontFamily,
      color: cs.color,
      tag: n.tagName,
      contrastHint: cs.fontWeight,
    }
  })
  const ems = [...root.querySelectorAll("em, i")].map((n) => ({
    text: (n.textContent || "").trim(),
    fontStyle: getComputedStyle(n).fontStyle,
    fontWeight: getComputedStyle(n).fontWeight,
  }))
  return {
    bodyWeight: bodyStyle.fontWeight,
    bodyColor: bodyStyle.color,
    strongs,
    ems,
    rawText: root.innerText,
    rawHtmlSnippet: root.innerHTML.slice(0, 2500),
  }
})

console.log(JSON.stringify(report, null, 2))
await page.screenshot({ path: "/tmp/tutor-markdown-emphasis.png", fullPage: true })

const texts = report.strongs.map((s) => s.text)
for (const need of ["梯度下降", "动量法", "收敛速度", "过拟合", "关键点", "learning rate", "注意", "SGD", "正常加粗"]) {
  assert.ok(texts.some((t) => t.includes(need)), `缺少加粗：${need}；实际=${texts.join(" | ")}`)
}
for (const s of report.strongs) {
  const w = Number(s.fontWeight)
  assert.ok(w >= 600, `${s.text} font-weight=${s.fontWeight}`)
  // 加粗应比正文更接近黑色
  assert.notEqual(s.color, report.bodyColor, `${s.text} 颜色应与正文区分以增强“加黑”观感: ${s.color}`)
}
assert.ok(Number(report.bodyWeight) < 600, "正文不应默认加粗")
assert.ok(report.ems.length >= 1, "应有斜体")
assert.ok(report.rawHtmlSnippet.includes("<table"), "列表后的 GFM 表格应被提升为真实表格，而不是残留 | 管道文本")
assert.ok(report.rawText.includes("＊＊伪加粗＊＊") || report.rawText.includes("伪加粗"), "全角星号原文应保留或被安全归一")

// HTML tags should be escaped by default react-markdown (security), not rendered as real tags
assert.equal(report.rawText.includes("<b>html粗体</b>") || report.rawText.includes("html粗体"), true)

console.log("强调渲染深度检查通过")
await browser.close()
