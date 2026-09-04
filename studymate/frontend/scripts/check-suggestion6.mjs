import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 996, name: "建议6回归用户", email: "suggestion6@example.invalid", role: "student" }
const course = { id: 5, name: "计算机组成原理", description: "计算机组成原理" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 2, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 4, reading: 3, hands_on: 4, auditory: 2 },
  goals: { primary: "掌握计算机组成原理并完成课程设计", deadline: "", target_topics: ["流水线", "Cache"] },
  weak_points: { topics: ["补码运算", "流水线冒险"], error_types: [] },
  pace: { hours_per_week: 8, intensity: "medium" },
  preference: { document: 4, mindmap: 3, quiz: 4, code: 3, video: 2, reading: 4 },
  employment_skills: { programming: 2, algorithms: 2, data_ai: 1, systems: 3, engineering: 2, professional: 2 },
}

const longToken = "StudyMateLongContent".repeat(24)
const messages = Array.from({ length: 9 }, (_, index) => ([
  { role: "user", content: `请解释第 ${index + 1} 个关键点，并说明如何验证。` },
  {
    role: "assistant",
    content: [
      `第 ${index + 1} 个关键点需要先理解数据如何流动。普通正文中的长链接 https://example.com/${longToken} 应在消息区域内自动换行。`,
      "",
      "下面是实际代码，代码块也不能撑宽整条消息：",
      "```text",
      longToken,
      "```",
      "最后用输入、处理、输出三个步骤逐项检查即可。",
    ].join("\n"),
  },
])).flat()

const now = new Date().toISOString()
const conversationState = {
  active: { id: "s61", title: "建议6回归", created_at: now, updated_at: now, messages },
  items: [],
}

const pathNodes = Array.from({ length: 7 }, (_, index) => ({
  id: `n${index + 1}`,
  position: { x: index * 300, y: 0 },
  data: { title: `回归阶段${index + 1}`, desc: `第 ${index + 1} 个阶段`, depth: index },
  type: "default",
}))
const pathEdges = Array.from({ length: 6 }, (_, index) => ({
  id: `e-n${index + 1}-n${index + 2}`,
  source: `n${index + 1}`,
  target: `n${index + 2}`,
  animated: true,
}))
pathEdges.push({ id: "legacy-extra-edge", source: "n4", target: "n6", animated: true })

const workspaceState = {
  topic: "流水线冒险",
  courseId: course.id,
  courseName: course.name,
  status: "done",
  outputs: {
    path: { type: "path", title: "学习路径", nodes: pathNodes, edges: pathEdges, count: pathNodes.length },
  },
  stream: { doc: "", mindmap: "", quiz: "", path: "", reading: "", code: "" },
  agentStatus: {}, agents: [], logs: [], quizAttempts: {}, resourcesConsumed: {}, quizSessionsRecorded: {},
  learningStartedAt: 0, learningDurationMs: 0, startedAt: Date.now(), finishedAt: Date.now(), lastError: "", updatedAt: Date.now(),
}

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!String(error).includes("Executable doesn't exist")) throw error
  browser = await chromium.launch({ channel: "chrome" })
}

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const chartSizeWarnings = []
page.on("console", (message) => {
  if (message.type() === "warning" && message.text().includes("width(-1) and height(-1)")) {
    chartSizeWarnings.push(message.text())
  }
})
const json = (route, value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) })

await page.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === `/api/courses/${course.id}/config`) return json(route, {
    ...course, persona: "计组助教", code_style: "hardware", code_libs: [], reading_sources: [],
    sample_topics: ["流水线冒险"], sample_questions: [], syllabus_hint: "CPU", from_registry: true,
  })
  if (path === `/api/profile/${user.user_id}`) return json(route, { user_id: user.user_id, version: 6, dims })
  if (path === "/api/tutor/conversations") return json(route, conversationState)
  if (path === "/api/tutor/models") return json(route, {
    default: "qwen",
    items: [
      { id: "qwen", label: "Qwen", description: "课程问答与多模态", configured: false, recommended: true },
      { id: "deepseek", label: "DeepSeek", description: "推理与代码讲解", configured: false, recommended: false },
      { id: "mimo", label: "MiMo", description: "自然对话与总结", configured: false, recommended: false },
    ],
  })
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  return json(route, { ok: true })
})

await page.addInitScript(({ currentUser, currentCourse, state }) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem("sm:current-course", JSON.stringify(currentCourse))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
  sessionStorage.setItem("sm:workspace-state", JSON.stringify(state))
}, { currentUser: user, currentCourse: course, state: workspaceState })

await page.goto(`${baseUrl}/tutor`, { waitUntil: "networkidle" })
await page.locator('[data-tutor-message="assistant"]').first().waitFor()
await page.waitForTimeout(700)

const messageScroller = page.getByTestId("tutor-message-scroll")
const normalMetrics = await messageScroller.evaluate((element) => ({
  clientWidth: element.clientWidth,
  scrollWidth: element.scrollWidth,
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
  overflowY: getComputedStyle(element).overflowY,
}))
assert.ok(normalMetrics.scrollWidth <= normalMetrics.clientWidth + 1, "助教消息区域不应出现整体横向滚动")
assert.ok(normalMetrics.scrollHeight > normalMetrics.clientHeight, "普通模式应保留对话区内部纵向滚动")
assert.equal(normalMetrics.overflowY, "auto")

for (const assistant of await page.locator('[data-tutor-message="assistant"]').all()) {
  const width = await assistant.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
  assert.ok(width.scroll <= width.client + 1, "长链接和长代码不应撑宽助教消息")
}

const sidebar = page.getByTestId("tutor-digital-human-sidebar")
const sidebarBox = await sidebar.boundingBox()
assert.ok(sidebarBox)
assert.ok(sidebarBox.height > 600, "数字人应占满助教右侧栏")
assert.equal(await sidebar.locator("video").count(), 2, "数字人应复用待机与讲解视频轨道")
assert.equal(await page.getByText("进入实时语音", { exact: false }).count(), 0, "AI 助教页面不应再展示实时语音入口")
assert.equal(await page.getByRole("button", { name: "数字人对话" }).count(), 1, "语音输入旁应提供当前页数字人对话按钮")
if (process.env.STUDYMATE_RADAR_SCREENSHOT) {
  await sidebar.screenshot({ path: process.env.STUDYMATE_RADAR_SCREENSHOT })
}

await page.getByRole("button", { name: "长截图模式" }).click()
await page.waitForURL(/\/tutor\?capture=1$/)
await page.waitForTimeout(300)
const captureMetrics = await messageScroller.evaluate((element) => ({
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
  overflowY: getComputedStyle(element).overflowY,
}))
assert.equal(captureMetrics.overflowY, "visible")
assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
assert.ok(captureMetrics.clientHeight >= captureMetrics.scrollHeight - 1, "长截图模式应把完整对话展开到文档流")
const captureSidebarBox = await sidebar.boundingBox()
assert.ok(captureSidebarBox)
assert.ok(captureSidebarBox.height > 600, "长截图模式下应保留完整数字人侧栏")

await page.getByRole("button", { name: "退出长截图" }).click()
await page.waitForURL((url) => url.pathname === "/tutor" && !url.searchParams.has("capture"))
await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="tutor-message-scroll"]')).overflowY === "auto")
assert.equal(await messageScroller.evaluate((element) => getComputedStyle(element).overflowY), "auto")

await page.goto(`${baseUrl}/workspace/r/path`, { waitUntil: "networkidle" })
await page.locator("[data-path-depth='6']").waitFor()
await page.waitForTimeout(900)
const pathBoxes = []
for (let depth = 0; depth < 7; depth += 1) {
  const box = await page.locator(`[data-path-depth='${depth}']`).boundingBox()
  assert.ok(box)
  pathBoxes.push(box)
}
const close = (a, b, tolerance = 6) => Math.abs(a - b) <= tolerance
assert.ok(pathBoxes.slice(0, 4).every((box) => close(box.y, pathBoxes[0].y)), "首行四个阶段应保持同一行")
assert.ok(pathBoxes[0].x < pathBoxes[1].x && pathBoxes[1].x < pathBoxes[2].x && pathBoxes[2].x < pathBoxes[3].x, "首行应从左向右")
assert.ok(pathBoxes.slice(4).every((box) => close(box.y, pathBoxes[4].y)), "第二行阶段应保持同一行")
assert.ok(pathBoxes[4].x > pathBoxes[5].x && pathBoxes[5].x > pathBoxes[6].x, "第二行应从右向左回折")
assert.ok(close(pathBoxes[3].x, pathBoxes[4].x, 10), "第四与第五阶段应在右侧垂直转弯")
assert.equal(await page.locator(".react-flow__edge").count(), 6, "历史多余依赖边应归一化为相邻阶段")
assert.deepEqual(chartSizeWarnings, [], "弹性雷达图不应产生无效尺寸警告")

console.log("建议6前端回归通过：助教正文换行、长截图模式、雷达等高与分值标签、蛇形学习路径均正常。")
await browser.close()
