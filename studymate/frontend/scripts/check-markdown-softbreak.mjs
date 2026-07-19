import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 991, name: "Markdown审查", email: "md-review@example.invalid", role: "student" }
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

// LLM-like wrapped prose (single newlines) + proper markdown structures
const assistant = [
  "梯度下降是一种迭代优化算法，",
  "它通过不断沿着损失函数的负梯度方向更新参数，",
  "从而逐步逼近最小值。",
  "",
  "## 核心步骤",
  "",
  "1. 计算当前梯度",
  "2. 选择学习率并更新参数",
  "3. 重复直到收敛",
  "",
  "关键公式是 $θ = θ - η∇J(θ)$。",
  "",
  "普通链接 https://example.com/" + "VeryLongToken".repeat(20) + " 应自动换行。",
  "",
  "```python",
  "for i in range(10):",
  "    print(i)",
  "```",
  "",
  "| 方法 | 特点 |",
  "| --- | --- |",
  "| SGD | 随机采样 |",
  "| Adam | 自适应学习率 |",
].join("\n")

const now = new Date().toISOString()
const conversationState = {
  active: {
    id: "md1",
    title: "Markdown审查",
    created_at: now,
    updated_at: now,
    messages: [
      { role: "user", content: "请解释梯度下降" },
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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
await page.waitForTimeout(500)

const metrics = await msg.evaluate((el) => {
  const root = el.querySelector(".prose") || el
  const p = root.querySelector("p")
  const h2 = root.querySelector("h2")
  const ol = root.querySelector("ol")
  const pre = root.querySelector("pre")
  const table = root.querySelector("table")
  const katex = root.querySelector(".katex")
  const pStyle = p ? getComputedStyle(p) : null
  const pBox = p?.getBoundingClientRect()
  const lines = p ? Math.round(pBox.height / parseFloat(pStyle.lineHeight || "20")) : 0
  return {
    pWhiteSpace: pStyle?.whiteSpace,
    pOverflowWrap: pStyle?.overflowWrap,
    pLines: lines,
    pText: p?.textContent,
    hasH2: !!h2,
    hasOl: !!ol,
    olItems: ol ? ol.querySelectorAll("li").length : 0,
    hasPre: !!pre,
    hasTable: !!table,
    hasKatex: !!katex,
    rootScrollWidth: root.scrollWidth,
    rootClientWidth: root.clientWidth,
    preWhiteSpace: pre ? getComputedStyle(pre).whiteSpace : null,
  }
})

console.log(JSON.stringify(metrics, null, 2))

assert.equal(metrics.pWhiteSpace === "pre-wrap" || metrics.pWhiteSpace === "pre-line", false, "对话段落不应使用 pre-wrap/pre-line，否则模型软换行会碎裂")
assert.ok(metrics.pLines <= 2, `首段应由软换行折叠为连续段落，当前约 ${metrics.pLines} 行`)
assert.ok(metrics.hasH2 && metrics.hasOl && metrics.olItems === 3, "标题与有序列表应正常渲染")
assert.ok(metrics.hasPre && metrics.hasTable && metrics.hasKatex, "代码块、表格与公式应正常渲染")
assert.ok(metrics.rootScrollWidth <= metrics.rootClientWidth + 1, "对话 Markdown 容器不应横向撑破")

await page.screenshot({ path: "/tmp/tutor-markdown-review.png", fullPage: false })
console.log("对话 Markdown 软换行与结构渲染检查通过")
await browser.close()
