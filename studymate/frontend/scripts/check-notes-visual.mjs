import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

await mkdir("test-results/screenshots", { recursive: true })

let browser
try { browser = await chromium.launch({ channel: "chrome" }) }
catch { browser = await chromium.launch({ channel: "msedge" }) }

const user = { user_id: 13, name: "视觉检查", email: "notes@example.test", role: "student" }
const notes = [
  { id: 101, user_id: 13, course_id: 6, folder: "岗位方法", title: "需求澄清与验收口径", content_md: "# 需求澄清\n\n先确认业务目标、用户角色与验收边界。\n\n## 关键检查\n\n- 明确输入与输出\n- 记录风险和依赖\n- 用可复现步骤完成验收", tags: ["FDE", "验收"], source: "manual", created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-03T10:00:00Z" },
  { id: 102, user_id: 13, course_id: 6, folder: "岗位方法", title: "现场部署复盘", content_md: "## 部署流程\n\n环境检查 → 数据接入 → 灰度验证 → 结果回写。", tags: ["部署"], source: "doc", created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-02T10:00:00Z" },
  { id: 103, user_id: 13, course_id: 6, folder: "", title: "错题：最小交付闭环", content_md: "需要同时覆盖交付物、验收标准与回滚策略。", tags: ["错题"], source: "quiz", created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T10:00:00Z" },
]

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) })
}

async function installMocks(context) {
  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/u, "")
    if (path === "/auth/me") return json(route, user)
    if (path === "/notes/folders") return json(route, { total: 3, unfiled: 1, folders: [{ name: "岗位方法", count: 2 }] })
    if (path === "/notes") return json(route, { count: 3, by_source: { manual: 1, doc: 1, quiz: 1, tutor: 0, mindmap: 0 }, items: notes })
    if (path === "/track" || path === "/analytics/page-view") return json(route, { ok: true })
    return json(route, {})
  })
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" })
await installMocks(context)
await context.addInitScript(() => {
  localStorage.setItem("sm:current-course", JSON.stringify({ id: 6, name: "FDE 岗位知识库", chunk_count: 11 }))
  localStorage.setItem("sm:target-role", JSON.stringify({ domainId: "software", roleId: "fde" }))
  localStorage.setItem("sm:digital-human-hidden", "true")
})
const page = await context.newPage()
page.on("pageerror", (error) => console.error("PAGE_ERROR", error.message))
await page.goto("http://localhost:5173/notes", { waitUntil: "networkidle" })
await page.getByText("因材智训智能笔记", { exact: true }).waitFor()

const topbarPosition = await page.locator(".notes-studio .app-topbar").evaluate((node) => getComputedStyle(node).position)
if (topbarPosition !== "relative") throw new Error(`顶部定位错误: ${topbarPosition}`)
const panelCount = await page.locator(".notes-studio-panel").count()
if (panelCount !== 3) throw new Error(`业务模块数量错误: ${panelCount}`)
const fictionalImageCount = await page.locator([
  'img[src*="notes-data-quill-instrument"]',
  'img[src*="knowledge-ingestion-engine"]',
  'img[src*="concept-knowledge-processor"]',
  'img[src*="training-launch-rocket"]',
].join(",")).count()
if (fictionalImageCount !== 0) throw new Error(`仍存在虚构物件图片: ${fictionalImageCount}`)
const statusScenes = await page.locator(".notes-studio-status-scene").evaluateAll((nodes) => nodes.map((node) => {
  const scan = getComputedStyle(node, "::after")
  const object = node.querySelector(".notes-studio-scene-object")
  const title = node.querySelector(".notes-studio-status-copy b")
  const detail = node.querySelector(".notes-studio-status-copy small")
  return {
    background: getComputedStyle(node).backgroundImage,
    scan: `${scan.animationName}/${scan.animationDuration}`,
    object: object ? `${getComputedStyle(object).animationName}/${getComputedStyle(object).animationDuration}` : "missing",
    titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
    detailSize: detail ? parseFloat(getComputedStyle(detail).fontSize) : 0,
  }
}))
if (statusScenes.length !== 4 || statusScenes.some((scene) => !scene.background.includes("url(") || scene.titleSize < 14 || scene.detailSize < 11)) {
  throw new Error(`状态场景背景缺失: ${JSON.stringify(statusScenes)}`)
}
if (new Set(statusScenes.map((scene) => scene.scan)).size !== 1 || new Set(statusScenes.map((scene) => scene.object)).size !== 1) {
  throw new Error(`状态场景动效未同步: ${JSON.stringify(statusScenes)}`)
}
const actionAnimations = await page.locator(".notes-studio-action-button").evaluateAll((nodes) => nodes.map((node) => {
  const style = getComputedStyle(node, "::after")
  return `${style.animationName}/${style.animationDuration}`
}))
if (actionAnimations.length !== 3 || new Set(actionAnimations).size !== 1) {
  throw new Error(`顶部操作按钮动效未同步: ${JSON.stringify(actionAnimations)}`)
}
const previewTypography = await page.locator(".notes-studio-preview-copy").evaluate((node) => {
  const article = node.closest(".notes-studio-preview-article")
  const preview = node.closest(".notes-studio-preview")
  return {
    fontSize: parseFloat(getComputedStyle(node).fontSize),
    articleWidth: article?.getBoundingClientRect().width ?? 0,
    previewWidth: preview?.getBoundingClientRect().width ?? 0,
  }
})
if (
  previewTypography.fontSize < 16
  || previewTypography.articleWidth < previewTypography.previewWidth * .78
) {
  throw new Error(`右侧预览排版过小: ${JSON.stringify(previewTypography)}`)
}
const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
if (overflow.scrollWidth > overflow.width + 1) throw new Error(`桌面横向溢出: ${JSON.stringify(overflow)}`)

await page.screenshot({ path: "test-results/screenshots/notes-desktop-top.png", fullPage: false })
await page.evaluate(() => scrollTo(0, Math.max(0, document.documentElement.scrollHeight / 2 - innerHeight / 2)))
await page.waitForTimeout(180)
await page.screenshot({ path: "test-results/screenshots/notes-desktop-middle.png", fullPage: false })
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(180)
await page.screenshot({ path: "test-results/screenshots/notes-desktop-bottom.png", fullPage: false })

await page.setViewportSize({ width: 1440, height: 600 })
await page.evaluate(() => scrollTo(0, 0))
const topbarInitialTop = await page.locator(".notes-studio .app-topbar").evaluate((node) => node.getBoundingClientRect().top)
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(180)
const topbarScrolledTop = await page.locator(".notes-studio .app-topbar").evaluate((node) => node.getBoundingClientRect().top)
if (topbarScrolledTop >= -40 || topbarScrolledTop >= topbarInitialTop) throw new Error(`顶部未随页面离开视口: ${JSON.stringify({ topbarInitialTop, topbarScrolledTop })}`)

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => scrollTo(0, 0))
const mobileOverflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
if (mobileOverflow.scrollWidth > mobileOverflow.width + 1) throw new Error(`移动端横向溢出: ${JSON.stringify(mobileOverflow)}`)
await page.screenshot({ path: "test-results/screenshots/notes-mobile.png", fullPage: true })

const reducedContext = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: "reduce" })
await installMocks(reducedContext)
await reducedContext.addInitScript(() => localStorage.setItem("sm:digital-human-hidden", "true"))
const reducedPage = await reducedContext.newPage()
await reducedPage.goto("http://localhost:5173/notes", { waitUntil: "networkidle" })
const routeAnimation = await reducedPage.locator(".notes-studio-route-signal").evaluate((node) => getComputedStyle(node).animationName)
const scanAnimation = await reducedPage.locator(".notes-studio-editor").evaluate((node) => getComputedStyle(node, "::before").animationName)
const actionAnimation = await reducedPage.locator(".notes-studio-action-button").first().evaluate((node) => getComputedStyle(node, "::after").animationName)
const sceneAnimation = await reducedPage.locator(".notes-studio-status-scene").first().evaluate((node) => getComputedStyle(node, "::after").animationName)
const statusFrameAnimation = await reducedPage.locator(".notes-studio-status-rail").evaluate((node) => getComputedStyle(node, "::before").animationName)
if (routeAnimation !== "none" || scanAnimation !== "none" || actionAnimation !== "none" || sceneAnimation !== "none" || statusFrameAnimation !== "none") throw new Error(`reduce motion 未生效: ${routeAnimation}/${scanAnimation}/${actionAnimation}/${sceneAnimation}/${statusFrameAnimation}`)

console.log(`NOTES_VISUAL_OK panels=${panelCount} topbar=${topbarPosition}/${Math.round(topbarScrolledTop)}px desktop=1440x900 compact=1440x600 mobile=390x844 reduced-motion=pass`)
await browser.close()
