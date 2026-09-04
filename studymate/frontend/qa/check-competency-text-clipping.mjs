import { chromium } from "playwright"

const baseUrl = process.env.STUDYMATE_BASE_URL || "http://localhost:5173"
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch({ channel: "msedge" }))
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()

await page.route("**/api/profile/13", (route) => route.fulfill({
  json: {
    user_id: 13,
    version: 1,
    intake_complete: true,
    dims: {
      goals: { primary: "应聘前线部署工程师（FDE）", deadline: "三个月", target_topics: ["需求澄清"] },
      weak_points: { topics: ["需求澄清"], error_types: [] },
      pace: { hours_per_week: 6, intensity: "medium" },
      employment_skills: {},
      theory_assessments: { fde: { score: 100, knowledge_level: "熟练", weak_topics: [] } },
      training_rounds: [],
    },
  },
}))
await page.route("**/api/theory-assessments/status**", (route) => route.fulfill({
  json: {
    role_id: "fde",
    profile_ready: true,
    profile_score: 100,
    required: false,
    assessment: { id: 1, role_id: "fde", role_name: "前线部署工程师（FDE）", course_id: 6, status: "submitted", score: 100, items: [], result: {} },
  },
}))

await page.addInitScript(() => {
  localStorage.setItem("sm:current-user", JSON.stringify({ user_id: 13, name: "视觉检查", email: "visual@example.com", role: "student" }))
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
})

await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" })
await page.evaluate(async () => {
  document.body.innerHTML = '<div id="report-test-root"></div>'
  const harness = await import("/scripts/learner-report-harness.tsx")
  harness.mountCompetency()
})
await page.locator(".competency-role-title").waitFor()
await page.waitForTimeout(900)

const clipping = await page.evaluate(() => {
  const title = document.querySelector(".competency-role-title")
  const button = document.querySelector(".competency-primary-cta")
  const buttonTitle = document.querySelector(".competency-cta-copy > span:first-child")
  if (!(title instanceof HTMLElement) || !(button instanceof HTMLElement) || !(buttonTitle instanceof HTMLElement)) {
    throw new Error("岗位训练中心的标题或启动按钮未渲染")
  }
  const titleBounds = title.getBoundingClientRect()
  const buttonBounds = button.getBoundingClientRect()
  const buttonTitleBounds = buttonTitle.getBoundingClientRect()
  const titleLines = [...title.children].map((node) => node.getBoundingClientRect())
  return {
    titleLineCount: titleLines.length,
    titleOverflow: title.scrollWidth > title.clientWidth + 1,
    titleLineClipped: titleLines.some((bounds) => bounds.left < titleBounds.left - 1 || bounds.right > titleBounds.right + 1),
    buttonTitleClipped: buttonTitleBounds.left < buttonBounds.left - 1 || buttonTitleBounds.right > buttonBounds.right + 1,
    buttonTitleWrapped: buttonTitleBounds.height > Number.parseFloat(getComputedStyle(buttonTitle).lineHeight) * 1.25,
  }
})

if (clipping.titleLineCount !== 2 || clipping.titleOverflow || clipping.titleLineClipped || clipping.buttonTitleClipped || clipping.buttonTitleWrapped) {
  throw new Error(`岗位训练中心仍有文字裁切：${JSON.stringify(clipping)}`)
}

await page.screenshot({ path: "test-results/screenshots/competency-text-clipping.png", fullPage: false })
console.log("COMPETENCY_TEXT_CLIPPING_OK", clipping)
await browser.close()
