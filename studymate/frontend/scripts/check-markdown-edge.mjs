import assert from "node:assert/strict"
import { chromium } from "playwright"
const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 993, name: "md-edge", email: "md-edge@example.invalid", role: "student" }
const course = { id: 1, name: "机器学习", description: "ml" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "x", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 2, algorithms: 2, data_ai: 2, systems: 1, engineering: 1, professional: 1 },
}
const assistant = [
  "代码中的星号不应被改：",
  "```python",
  "s = '＊＊不要改＊＊'",
  "print('**keep**')",
  "```",
  "",
  "行内代码：`**也不要改**` 与正文 **要改成粗体**。",
  "",
  "寄存器不被公式吞：$t0, $sp 与公式 $a+b$。",
  "",
  "紧贴表格：",
  "结果如下：",
  "| 名称 | 值 |",
  "| --- | --- |",
  "| **准确率** | 0.9 |",
  "",
  "空加粗边界：**** 与 ** 单独星号。",
  "",
  "未闭合：**从头到尾",
  "下一行正常。",
].join("\n")
const now = new Date().toISOString()
const conversationState = { active: { id: "e", title: "e", created_at: now, updated_at: now, messages: [
  { role: "user", content: "edge" }, { role: "assistant", content: assistant },
]}, items: [] }
let browser
try { browser = await chromium.launch() } catch (e) {
  if (!String(e).includes("Executable doesn't exist")) throw e
  browser = await chromium.launch({ channel: "chrome" })
}
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const json = (route, value, status=200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) })
await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === `/api/courses/${course.id}/config`) return json(route, { ...course, persona: "t", code_style: "ml", code_libs: [], reading_sources: [], sample_topics: [], sample_questions: [], syllabus_hint: "", from_registry: true })
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
await msg.waitFor(); await page.waitForTimeout(500)
const r = await msg.evaluate((el) => {
  const root = el.querySelector(".prose") || el
  return {
    text: root.innerText,
    html: root.innerHTML,
    strongs: [...root.querySelectorAll("strong")].map(n => n.textContent),
    codeTexts: [...root.querySelectorAll("code")].map(n => n.textContent),
    hasTable: !!root.querySelector("table"),
    katexCount: root.querySelectorAll(".katex").length,
  }
})
console.log(JSON.stringify(r, null, 2))
// code fence should keep fullwidth stars literally
assert.ok(r.codeTexts.some(t => t.includes("＊＊不要改＊＊")), "代码块全角星号不应被规范化")
assert.ok(r.codeTexts.some(t => t.includes("**keep**")), "代码块半角星号应保留")
assert.ok(r.codeTexts.some(t => t.includes("**也不要改**")), "行内代码星号应保留")
assert.ok(r.strongs.includes("要改成粗体"), "正文加粗应生效")
assert.ok(r.hasTable, "紧贴表格应渲染")
assert.ok(r.strongs.includes("准确率"), "表内加粗应生效")
// registers escaped: should not explode whole paragraph into one formula
assert.ok(r.katexCount >= 1, "应有公式")
assert.ok(r.text.includes("$t0") || r.text.includes("t0"), "寄存器文本应可见")
assert.ok(r.text.includes("$sp") || r.text.includes("sp"), "sp 寄存器应可见")
// $sp 后接中文时不应把“与公式”吞进 KaTeX
assert.equal((r.html.match(/cjk_fallback">与公式/g) || []).length, 0, "中文“与公式”不应被卷进寄存器后的伪公式")
assert.ok(r.html.includes("a+b") || r.text.includes("a+b"), "真正的 $a+b$ 公式应保留")
console.log("edge review passed")
await browser.close()
