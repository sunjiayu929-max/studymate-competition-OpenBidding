import assert from "node:assert/strict"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "")
const user = { user_id: 999, name: "回归测试用户", email: "smoke@example.invalid", role: "student" }
const course = { id: 5, name: "计算机组成原理", description: "处理器、存储系统与指令执行" }
const dims = {
  knowledge_base: { math: 3, programming: 3, statistics: 3, english: 3, subject_prior: 2 },
  cognitive_style: { visual: 3, reading: 3, hands_on: 3, auditory: 3 },
  goals: { primary: "掌握计算机组成原理", deadline: "", target_topics: [] },
  weak_points: { topics: [], error_types: [] },
  pace: { hours_per_week: 6, intensity: "medium" },
  preference: { document: 3, mindmap: 3, quiz: 3, code: 3, video: 3, reading: 3 },
  employment_skills: { programming: 1, algorithms: 0, data_ai: 0, systems: 1, engineering: 1, professional: 0 },
}
const projectedDims = structuredClone(dims)
projectedDims.knowledge_base.subject_prior = 3
projectedDims.employment_skills.systems = 2

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!String(error).includes("Executable doesn't exist")) throw error
  browser = await chromium.launch({ channel: "chrome" })
}

const viewportWidth = Number(process.env.STUDYMATE_VIEWPORT_WIDTH || 1440)
const viewportHeight = Number(process.env.STUDYMATE_VIEWPORT_HEIGHT || 960)
const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight } })
const page = await context.newPage()
let workspaceGenerateRequests = 0
let conceptExplainRequests = 0
let profileChatBody = null
let applyDeltaBody = null

const json = (route, value, status = 200) => route.fulfill({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
})

async function assertSvgTextInsideChart(root, label) {
  const svg = root.locator("svg").first()
  const svgBox = await svg.boundingBox()
  assert.ok(svgBox, `${label} 应存在可见的 SVG 图表`)

  const texts = svg.locator("text")
  const textCount = await texts.count()
  assert.ok(textCount > 0, `${label} 应显示维度文字`)
  for (let index = 0; index < textCount; index += 1) {
    const text = texts.nth(index)
    const textBox = await text.boundingBox()
    if (!textBox) continue
    const content = (await text.textContent())?.trim() || `第 ${index + 1} 个标签`
    const tolerance = 1
    assert.ok(textBox.x >= svgBox.x - tolerance, `${label} 的“${content}”左侧不应被裁切`)
    assert.ok(textBox.y >= svgBox.y - tolerance, `${label} 的“${content}”顶部不应被裁切`)
    assert.ok(textBox.x + textBox.width <= svgBox.x + svgBox.width + tolerance, `${label} 的“${content}”右侧不应被裁切`)
    assert.ok(textBox.y + textBox.height <= svgBox.y + svgBox.height + tolerance, `${label} 的“${content}”底部不应被裁切`)
  }

  return svgBox
}

await page.route("**/api/**", async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname

  if (path === "/api/auth/me") return json(route, user)
  if (path === "/api/courses/5/config") return json(route, {
    ...course,
    persona: "计算机组成原理课程助教",
    code_style: "hardware",
    code_libs: [],
    reading_sources: [],
    sample_topics: ["流水线冒险", "Cache 替换策略", "虚地址翻译", "浮点数 IEEE 754", "CPU 取指执行周期", "原码反码补码"],
    sample_questions: [],
    syllabus_hint: "CPU / 存储器 / 指令系统",
    from_registry: true,
  })
  if (path === "/api/courses") return json(route, { count: 1, items: [course] })
  if (path === "/api/profile/999") return json(route, { user_id: 999, version: 1, dims })
  if (path === "/api/profile/snapshots/999") return json(route, { user_id: 999, count: 0, items: [] })
  if (path === "/api/eval/history/999") return json(route, { user_id: 999, count: 0, items: [] })
  if (path === "/api/careers/recommendations") return json(route, {
    provider: "讯飞人才呀",
    source_state: "fallback",
    platform_url: "http://rencaiya.vip/college/postcourse",
    current_course: course.name,
    historical_courses: [],
    evidence_note: "回归测试",
    items: [],
  })
  if (path === "/api/events" || path === "/api/events/batch") return json(route, { ok: true })
  if (path === "/api/workspace/generate") {
    workspaceGenerateRequests += 1
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: meta\ndata: {\"agents\":[{\"id\":\"doc\",\"name\":\"讲解文档\",\"icon\":\"\",\"color\":\"sky\",\"description\":\"回归测试\"}]}\n\nevent: done\ndata: [DONE]\n\n",
    })
  }
  if (path === "/api/concept/explain") {
    conceptExplainRequests += 1
    return json(route, {
      matched: false,
      key: null,
      title: "CPU 取指执行周期",
      intro: "分步理解取指、译码与执行。",
      script: {
        concept: "CPU 取指执行周期",
        summary: "指令在 CPU 中依次流转",
        visual: "board",
        steps: [{ title: "取指", desc: "从存储器读取指令", nodes: [] }],
      },
      generated: true,
      mock: false,
    })
  }
  if (path === "/api/bili/videos") return json(route, {
    ok: false,
    videos: [],
    search_url: "https://search.bilibili.com/all?keyword=CPU%20%E5%8F%96%E6%8C%87%E6%89%A7%E8%A1%8C%E5%91%A8%E6%9C%9F",
    resolved_query: "CPU 取指执行周期",
  })
  if (path === "/api/rencaiya/courses") return json(route, {
    provider: "讯飞人才呀",
    source_state: "live",
    match_level: "course",
    resolved_query: "CPU 取指执行周期",
    course_name: course.name,
    platform_url: "http://rencaiya.vip/college/allcourse",
    items: [],
  })
  if (path === "/api/profile/chat") {
    profileChatBody = request.postDataJSON()
    const nextDims = structuredClone(dims)
    nextDims.employment_skills.programming = 3
    nextDims.employment_skills.engineering = 3
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: delta\ndata: 项目经历已记录。\n\n",
        `event: patch\ndata: ${JSON.stringify({ patch: { reasoning: "根据明确项目经历更新就业技能" }, version: 2, dims: nextDims, changed: true, changed_fields: ["employment_skills.programming", "employment_skills.engineering"], warning: null })}\n\n`,
        "event: done\ndata: [DONE]\n\n",
      ].join(""),
    })
  }
  if (path === "/api/profile/apply-delta") {
    applyDeltaBody = request.postDataJSON()
    return json(route, { user_id: 999, version: 1, dims, applied_delta: {}, changed: false, changed_fields: [] })
  }

  return json(route, { ok: true })
})

await page.addInitScript(({ currentUser, currentCourse }) => {
  localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
  localStorage.setItem("sm:current-course", JSON.stringify(currentCourse))
  localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
}, { currentUser: user, currentCourse: course })

await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" })
await page.getByRole("button", { name: "CPU 取指执行周期" }).click()
await page.waitForTimeout(200)
assert.equal(workspaceGenerateRequests, 0, "点击课程示例不应启动生成")
assert.equal(conceptExplainRequests, 0, "点击课程示例不应预取可视讲解")
assert.equal(await page.getByLabel("生成主题").inputValue(), "CPU 取指执行周期")
await page.getByText("课程示例 · 点击填入").waitFor()

await page.getByRole("button", { name: "启动协同生成" }).click()
await page.waitForFunction(() => document.body.textContent?.includes("资源生成完成"), null, { timeout: 5_000 }).catch(() => {})
await page.waitForTimeout(300)
assert.equal(workspaceGenerateRequests, 1, "显式提交应只启动一次生成")
assert.equal(conceptExplainRequests, 1, "显式生成应预取一次可视讲解")

await page.locator("button").filter({ hasText: "可视讲解" }).last().click()
await page.waitForURL("**/workspace/r/concept")
await page.getByText("CPU 取指执行周期", { exact: true }).first().waitFor()
assert.equal(conceptExplainRequests, 1, "打开可视讲解应复用预取结果")
await page.getByText("暂未找到高相关卡片，已隐藏可能跑题的结果").waitFor()
await page.getByText("已隐藏课程级泛化结果，可前往人才呀平台继续查找").waitFor()

const quizState = {
  topic: "CPU 取指执行周期",
  courseId: 5,
  courseName: course.name,
  status: "done",
  outputs: {
    quiz: {
      type: "quiz",
      title: "检测题",
      count: 1,
      items: [{ id: "q1", type: "mcq", question: "取指之后通常进入哪个阶段？", options: ["译码", "关机"], answer: 0, explanation: "取指后进入译码。", difficulty: 1 }],
    },
  },
  stream: { doc: "", mindmap: "", quiz: "", path: "", reading: "", code: "" },
  agentStatus: {}, agents: [], logs: [], quizAttempts: {}, resourcesConsumed: {}, quizSessionsRecorded: {},
  learningStartedAt: 0, learningDurationMs: 0, startedAt: Date.now(), finishedAt: Date.now(), lastError: "", updatedAt: Date.now(),
}
await page.evaluate((state) => sessionStorage.setItem("sm:workspace-state", JSON.stringify(state)), quizState)
await page.goto(`${baseUrl}/workspace/r/quiz`, { waitUntil: "networkidle" })
assert.equal(await page.getByText(/点右上/).count(), 0, "误导性的专注模式提示应删除")
await page.getByRole("button", { name: "全屏专注答题" }).click()
await page.getByRole("dialog", { name: "专注答题模式" }).waitFor()
await page.keyboard.press("Escape")
assert.equal(await page.getByRole("dialog", { name: "专注答题模式" }).count(), 0, "专注模式仍应能正常关闭")

const report = {
  user_id: 999,
  profile_version: 1,
  current_dims: dims,
  projected_dims: projectedDims,
  scores: { overall_correct_rate: 1, by_topic: {}, engagement_score: 80, total_attempts: 1, total_correct: 1 },
  profile_delta: { knowledge_base: { subject_prior: 1 }, employment_skills: { systems: 1 } },
  suggestions: [], next_topics: [], summary_markdown: "## 总结\n表现稳定。",
  generated_at: new Date().toISOString(),
}
await page.evaluate((value) => localStorage.setItem("sm:eval-report:999", JSON.stringify(value)), report)
await page.goto(`${baseUrl}/report`, { waitUntil: "networkidle" })
await page.getByText("评估前", { exact: true }).first().waitFor()
await page.getByText("建议应用后", { exact: true }).first().waitFor()
const compareCards = page.getByTestId("radar-compare-card")
const compareCardCount = await compareCards.count()
assert.ok(compareCardCount > 0, "学习报告应显示画像对比雷达图")
for (let index = 0; index < compareCardCount; index += 1) {
  const card = compareCards.nth(index)
  const svgBox = await assertSvgTextInsideChart(card, `学习报告第 ${index + 1} 张雷达图`)
  const legendBox = await card.getByTestId("radar-compare-legend").boundingBox()
  assert.ok(legendBox, `学习报告第 ${index + 1} 张雷达图应显示图例`)
  assert.ok(legendBox.y >= svgBox.y + svgBox.height - 1, `学习报告第 ${index + 1} 张雷达图的图例不应遮挡坐标文字`)
}
if (process.env.STUDYMATE_REPORT_SCREENSHOT) {
  await page.screenshot({
    path: process.env.STUDYMATE_REPORT_SCREENSHOT,
    fullPage: process.env.STUDYMATE_SCREENSHOT_VIEWPORT_ONLY !== "1",
  })
}
await page.getByRole("button", { name: "应用到画像" }).click()
await page.waitForTimeout(150)
assert.equal(applyDeltaBody?.source_version, 1, "报告应用必须携带来源画像版本")

await page.goto(`${baseUrl}/profile`, { waitUntil: "networkidle" })
const profileMessage = "我在项目中使用过 Python 和 FastAPI，完成了接口测试并部署上线。"
await page.getByLabel("画像对话内容").fill(profileMessage)
await page.getByRole("button", { name: "发送画像对话" }).click()
await page.getByText("画像已更新，本轮调整 2 个字段").waitFor()
assert.equal(profileChatBody?.message, profileMessage)
assert.equal(profileChatBody?.history?.some((item) => item.role === "user" && item.content === profileMessage), false, "当前用户消息不应在 history 中重复")

console.log("建议2前端回归通过：示例填入、预取复用、专注模式、报告图表文字、画像消息与外部空状态均正常。")
await browser.close()
