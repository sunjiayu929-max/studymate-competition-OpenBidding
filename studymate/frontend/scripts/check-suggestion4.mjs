import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 999, name: "建议4回归用户", email: "suggestion4@example.invalid", role: "student" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "掌握计算机组成原理", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 0, algorithms: 0, data_ai: 0, systems: 0, engineering: 0, professional: 0 },
}
const updatedDims = structuredClone(dims)
updatedDims.employment_skills.programming = 3
updatedDims.employment_skills.engineering = 3

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!String(error).includes("Executable doesn't exist")) throw error
  browser = await chromium.launch({ channel: "chrome" })
}

const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
const profileBodies = []

const json = (route, value, status = 200) => route.fulfill({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
})

await page.route("**/api/**", async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname

  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/profile/999") return json(route, { user_id: 999, version: 1, dims })
  if (path === "/api/careers/recommendations") return json(route, {
    provider: "回归测试",
    source_state: "fallback",
    platform_url: "#",
    current_course: "计算机组成原理",
    historical_courses: [],
    evidence_note: "建议4隔离回归",
    items: [],
  })
  if (path === "/api/profile/chat") {
    profileBodies.push(request.postDataJSON())
    const firstTurn = profileBodies.length === 1
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: firstTurn
        ? [
            "event: delta\ndata: 项目经历已记录，再确认一下你的学习节奏。\n\n",
            `event: patch\ndata: ${JSON.stringify({ patch: {}, version: 1, dims, changed: false, changed_fields: [], warning: null })}\n\n`,
            "event: done\ndata: [DONE]\n\n",
          ].join("")
        : [
            "event: delta\ndata: 信息已补齐，就业技能也已根据项目经历更新。\n\n",
            `event: patch\ndata: ${JSON.stringify({ patch: { reasoning: "根据前轮明确项目经历更新就业技能" }, version: 2, dims: updatedDims, changed: true, changed_fields: ["employment_skills.programming", "employment_skills.engineering"], warning: null })}\n\n`,
            "event: done\ndata: [DONE]\n\n",
          ].join(""),
    })
  }
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  return json(route, { ok: true })
})

await page.addInitScript((currentUser) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
}, user)

await page.goto(`${baseUrl}/profile`, { waitUntil: "networkidle" })
await page.waitForTimeout(700)

assert.equal(await page.getByText("5 画像维度", { exact: true }).count(), 1)
assert.equal(await page.getByText("4 画像维度", { exact: true }).count(), 1)
assert.equal(await page.getByText("6 画像维度", { exact: true }).count(), 2)
assert.equal(await page.getByText("0–5 画像维度", { exact: true }).count(), 0)

const radarPaths = page.locator('path[class="recharts-polygon"]')
assert.equal(await radarPaths.count(), 4)
const employmentBefore = await radarPaths.nth(3).getAttribute("d")

const projectMessage = "我在项目中使用过 Python 和 FastAPI，完成了接口测试并部署上线。"
await page.getByLabel("画像对话内容").fill(projectMessage)
await page.getByRole("button", { name: "发送画像对话" }).click()
await page.getByText("本轮没有发现需要修改的画像信息，现有画像保持不变").waitFor()

const completionMessage = "每周学习 8 小时，没有其他信息了。"
await page.getByLabel("画像对话内容").fill(completionMessage)
await page.getByRole("button", { name: "发送画像对话" }).click()
await page.getByText("画像已更新，本轮调整 2 个字段").waitFor()
await page.getByText("当前画像 · v2").waitFor()
await page.waitForTimeout(700)

const employmentAfter = await page.locator('path[class="recharts-polygon"]').nth(3).getAttribute("d")
assert.notEqual(employmentAfter, employmentBefore, "就业技能数据变化后雷达图应立即重绘")
assert.equal(profileBodies[1]?.history?.some((item) => item.role === "user" && item.content === projectMessage), true)
assert.equal(profileBodies[1]?.history?.some((item) => item.role === "user" && item.content === completionMessage), false)

console.log("建议4前端回归通过：画像维度数量准确，历史项目证据可在完成轮驱动就业雷达实时更新。")
await browser.close()
