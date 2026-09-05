import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://127.0.0.1:5174").replace(/\/$/, "")
const outputDir = "test-results/screenshots"

await mkdir(outputDir, { recursive: true })

let browser
try {
  browser = await chromium.launch({ channel: "chrome" })
} catch {
  browser = await chromium.launch({ channel: "msedge" })
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on("pageerror", (error) => console.error("PAGE_ERROR", error.message))

const profile = {
  user_id: 13,
  version: 5,
  intake_complete: true,
  dims: {
    goals: { primary: "应聘前线部署工程师（FDE）", deadline: "三个月", target_topics: ["需求澄清", "系统集成"] },
    weak_points: { topics: ["部署依赖分析", "验收口径设计"], error_types: ["场景判断"] },
    pace: { hours_per_week: 6, intensity: "medium" },
    employment_skills: { programming: 3, algorithms: 1, data_ai: 2, systems: 1, engineering: 2, professional: 2 },
    theory_assessments: { fde: { score: 58, knowledge_level: "基础", weak_topics: ["需求澄清", "系统集成"] } },
    training_rounds: [],
  },
}

await page.route("**/api/auth/me", (route) => route.fulfill({ json: null }))
await page.route("**/api/profile/13", (route) => route.fulfill({ json: profile }))
await page.route("**/api/theory-assessments/status**", (route) => route.fulfill({ json: { role_id: "fde", profile_ready: true, profile_score: 90, required: false, assessment: { id: 1, role_id: "fde", role_name: "前线部署工程师（FDE）", course_id: 6, status: "submitted", score: 58, items: [], result: {} } } }))

await page.addInitScript(() => {
  localStorage.setItem("sm:current-user", JSON.stringify({ user_id: 13, name: "视觉检查", email: "demo@example.com", role: "student" }))
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
  sessionStorage.setItem("sm:workspace-state", JSON.stringify({
    topic: "澄清客户场景与验收口径",
    courseId: 6,
    courseName: "FDE 岗位知识库",
    status: "idle",
    runId: "",
    domain: "软件开发",
    targetRole: "FDE",
    roleSummary: "",
    coreCompetencies: ["需求澄清", "系统集成"],
    stage: "idle",
    generationRound: 0,
    reworkHistory: [],
    diagnosis: null,
    reviews: {},
    decision: null,
    feedback: null,
    outputs: { training_plan: null },
    stream: { doc: "", guide: "", mindmap: "", quiz: "", path: "", reading: "", code: "" },
    agentStatus: {},
    agents: [],
    logs: [],
    quizAttempts: {},
    resourcesConsumed: {},
    quizSessionsRecorded: {},
    learningStartedAt: 0,
    learningDurationMs: 0,
    startedAt: 0,
    finishedAt: 0,
    lastError: "",
    updatedAt: Date.now(),
  }))
  sessionStorage.setItem("sm:learning-universe-entered", "1")
})

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" })
await page.evaluate(async () => {
  document.body.innerHTML = '<div id="report-test-root"></div>'
  const harness = await import("/scripts/learner-report-harness.tsx")
  harness.mountCompetency()
})

const section = page.locator("#training-resources")
await section.waitFor()
await section.scrollIntoViewIfNeeded()
const art = section.locator(".competency-resource-art")
await art.first().waitFor()
await page.waitForFunction(() => [...document.querySelectorAll(".competency-resource-art")].every((image) => image.complete && image.naturalWidth > 0))

const imageFacts = await art.evaluateAll((images) => images.map((image) => ({
  src: image.getAttribute("src"),
  width: image.naturalWidth,
  height: image.naturalHeight,
})))
if (imageFacts.length !== 6) throw new Error(`Expected 6 resource backgrounds, received ${imageFacts.length}`)

await section.screenshot({ path: `${outputDir}/training-resource-backgrounds-desktop.png` })

await page.setViewportSize({ width: 390, height: 844 })
await page.emulateMedia({ reducedMotion: "reduce" })
await section.scrollIntoViewIfNeeded()
const mobileBounds = await section.locator(".competency-resource-card").evaluateAll((cards) => cards.map((card) => {
  const rect = card.getBoundingClientRect()
  return { left: rect.left, right: rect.right, width: rect.width }
}))
if (mobileBounds.some((rect) => rect.left < -1 || rect.right > 391)) {
  throw new Error(`Mobile card overflow: ${JSON.stringify(mobileBounds)}`)
}
await section.screenshot({ path: `${outputDir}/training-resource-backgrounds-mobile.png` })

console.log("TRAINING_RESOURCE_BACKGROUNDS_OK", JSON.stringify({ imageFacts, mobileBounds }))
await browser.close()
