import { chromium } from "playwright"

let browser
try { browser = await chromium.launch({ channel: "chrome" }) }
catch { browser = await chromium.launch({ channel: "msedge" }) }

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" })
const page = await context.newPage()
page.on("pageerror", (error) => console.error("PAGE_ERROR", error.message))
await page.route("**/api/interviews/attempts", (route) => route.fulfill({ json: { items: [
  { id: "active-1", role_id: "fde", role_name: "前线部署工程师（FDE）", status: "in_progress", created_at: "2026-09-03T10:30:00Z" },
  { id: "done-1", role_id: "fde", role_name: "前线部署工程师（FDE）", status: "completed", created_at: "2026-09-01T09:00:00Z", score_summary: { overall_score: 86.5 }, report: { summary: "表达结构清晰，能够结合项目证据回答。", competency_scores: [{ competency: "需求澄清", score: 88, evidence: "主动确认验收口径", improvement: "补充风险优先级" }], strengths: ["结构化表达"], improvements: ["量化结果"] } },
] } }))

await page.addInitScript(() => {
  localStorage.setItem("sm:current-user", JSON.stringify({ user_id: 13, name: "视觉检查", email: "demo@example.com", role: "student" }))
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
})

await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" })
await page.evaluate(async () => {
  document.body.innerHTML = '<div id="interview-visual-root"></div>'
  await import("/scripts/interview-visual-harness.tsx")
})
await page.getByText("面试备战中心", { exact: true }).first().waitFor()
const stageImages = page.locator(".interview-prep-stage > img")
if (await stageImages.count() !== 4) throw new Error("四个流程实景背景未完整渲染")
await page.waitForFunction(() => Array.from(document.querySelectorAll(".interview-prep-stage > img")).every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))
const primaryAction = page.getByRole("button", { name: "进入独立 AI 面试" })
const controlTimelines = await page.locator(".interview-prep-primary, .interview-prep-skill, .interview-prep-secondary, .interview-prep-danger, .interview-prep-report summary").evaluateAll((nodes) => nodes.map((node) => ({
  className: node.className,
  name: getComputedStyle(node).animationName,
  duration: getComputedStyle(node).animationDuration,
  delay: getComputedStyle(node).animationDelay,
  effectName: getComputedStyle(node, "::after").animationName,
  effectDuration: getComputedStyle(node, "::after").animationDuration,
  effectDelay: getComputedStyle(node, "::after").animationDelay,
})))
if (controlTimelines.some((item) => item.name !== "interview-prep-control-border" || item.duration !== "3.2s" || item.delay !== "0s" || item.effectName !== "interview-prep-control-glint" || item.effectDuration !== "3.2s" || item.effectDelay !== "0s")) {
  throw new Error(`按钮动效未同步: ${JSON.stringify(controlTimelines)}`)
}
const primaryBounds = await primaryAction.evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight }
})
if (primaryBounds.top < 0 || primaryBounds.bottom > primaryBounds.viewportHeight) throw new Error(`桌面首屏主操作不可见: ${JSON.stringify(primaryBounds)}`)

const verifyBounds = async (label) => {
  const bounds = await page.locator(".interview-prep-shell").evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { left: rect.left, right: rect.right, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }
  })
  if (bounds.left < -1 || bounds.right > bounds.viewport + 1 || bounds.scrollWidth > bounds.viewport + 1) {
    throw new Error(`${label} 页面横向溢出: ${JSON.stringify(bounds)}`)
  }
}

await verifyBounds("desktop")
const topbarPosition = await page.locator(".app-topbar").evaluate((node) => getComputedStyle(node).position)
if (topbarPosition !== "relative") throw new Error(`顶部定位错误: ${topbarPosition}`)
const topbarInitialTop = await page.locator(".app-topbar").evaluate((node) => node.getBoundingClientRect().top)
await page.evaluate(() => scrollTo(0, 700))
await page.waitForTimeout(120)
const topbarScrolledTop = await page.locator(".app-topbar").evaluate((node) => node.getBoundingClientRect().top)
if (topbarScrolledTop > -100 || topbarScrolledTop >= topbarInitialTop) throw new Error(`顶部未随页面离开视口: ${JSON.stringify({ topbarInitialTop, topbarScrolledTop })}`)
await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: "test-results/screenshots/ai-interview-desktop.png", fullPage: true })
await page.locator(".interview-prep-support").scrollIntoViewIfNeeded()
await page.screenshot({ path: "test-results/screenshots/ai-interview-middle.png", fullPage: false })
await page.locator(".interview-prep-history").scrollIntoViewIfNeeded()
await page.screenshot({ path: "test-results/screenshots/ai-interview-bottom.png", fullPage: false })
await page.evaluate(() => scrollTo(0, 0))
await page.setViewportSize({ width: 390, height: 844 })
await verifyBounds("mobile")
const mobilePrimaryBounds = await primaryAction.evaluate((node) => {
  const rect = node.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight }
})
if (mobilePrimaryBounds.top < 0 || mobilePrimaryBounds.bottom > mobilePrimaryBounds.viewportHeight + 1) throw new Error(`移动端首屏主操作不可见: ${JSON.stringify(mobilePrimaryBounds)}`)
await page.screenshot({ path: "test-results/screenshots/ai-interview-mobile.png", fullPage: true })

if (await page.getByRole("button", { name: "进入独立 AI 面试" }).count() !== 1) throw new Error("主操作入口缺失")
if (await page.locator(".interview-prep-signal").count() !== 1) throw new Error("声波主题区缺失")

const reducedContext = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce" })
const reducedPage = await reducedContext.newPage()
await reducedPage.addInitScript(() => {
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
})
await reducedPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" })
await reducedPage.evaluate(async () => {
  document.body.innerHTML = '<div id="interview-visual-root"></div>'
  await import("/scripts/interview-visual-harness.tsx")
})
await reducedPage.getByText("面试备战中心", { exact: true }).first().waitFor()
const animation = await reducedPage.locator(".interview-prep-mic-product").evaluate((node) => getComputedStyle(node).animationName)
if (animation !== "none") throw new Error(`reduce motion 未生效: ${animation}`)
const routeAnimation = await reducedPage.locator(".interview-prep-route-signal").evaluate((node) => getComputedStyle(node).animationName)
if (routeAnimation !== "none") throw new Error(`流程动效 reduce motion 未生效: ${routeAnimation}`)
const stageAnimation = await reducedPage.locator(".interview-prep-stage > img").first().evaluate((node) => getComputedStyle(node).animationName)
if (stageAnimation !== "none") throw new Error(`流程背景 reduce motion 未生效: ${stageAnimation}`)
const reducedControlAnimation = await reducedPage.locator(".interview-prep-primary").evaluate((node) => getComputedStyle(node).animationName)
if (reducedControlAnimation !== "none") throw new Error(`按钮 reduce motion 未生效: ${reducedControlAnimation}`)
await reducedPage.screenshot({ path: "test-results/screenshots/ai-interview-landscape.png", fullPage: true })

console.log(`AI_INTERVIEW_OK desktop=1440x900 mobile=390x844 landscape=844x390 controls=${controlTimelines.length}/synced primary=${Math.round(primaryBounds.bottom)}px/${Math.round(mobilePrimaryBounds.bottom)}px topbar=${topbarPosition}/${Math.round(topbarScrolledTop)}px reduced-motion=pass`)
await reducedContext.close()
await context.close()
await browser.close()
