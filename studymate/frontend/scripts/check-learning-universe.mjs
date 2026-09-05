import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import process from "node:process"
import { chromium } from "playwright"

const port = Number(process.env.STUDYMATE_UNIVERSE_PORT || 4182)
const baseUrl = process.env.STUDYMATE_BASE_URL || `http://127.0.0.1:${port}`
const resultDir = fileURLToPath(new URL("../test-results/today-learning-home/", import.meta.url))
let preview = null

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch { /* preview is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  throw new Error(`preview did not become ready: ${url}`)
}

if (!process.env.STUDYMATE_BASE_URL) {
  assert.ok(existsSync(new URL("../dist/index.html", import.meta.url)), "run npm run build before check:universe")
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))
  preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  })
  await waitForServer(`${baseUrl}/`)
}

await mkdir(resultDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const isoNow = new Date().toISOString()
const user = { user_id: 9101, name: "布局测试用户", email: "home.fixture@example.test", role: "student" }
const course = { id: 1, name: "机器学习", description: "机器学习", chunk_count: 269 }

async function installMocks(context, withRealData) {
  const unexpectedWrites = []
  await context.route("**/api/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^\/api/u, ""); const method = request.method()
    const fulfill = (body) => route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) })
    if (method !== "GET" && !path.startsWith("/events")) unexpectedWrites.push(`${method} ${path}`)
    if (path === "/auth/me") return fulfill(user)
    if (path === "/courses") return fulfill({ count: 1, items: [course] })
    if (path === "/rag/stats") return fulfill({ count: 269, vectorized: 269 })
    if (path === "/profile/9101") return fulfill(withRealData ? { user_id: 9101, version: 4, dims: { knowledge_base: { "机器学习": 60 }, cognitive_style: { visual: 70 }, goals: { primary: "理解核心算法", target_topics: ["梯度下降"] }, weak_points: { topics: ["学习率"] }, pace: { hours_per_week: 6 }, preference: { animation: 80 } } } : { user_id: 9101, version: 0, dims: {} })
    if (path.startsWith("/notes")) return fulfill(withRealData ? { count: 2, items: [{ id: 1, course_id: 1, title: "梯度下降复习", source: "manual", created_at: isoNow, updated_at: isoNow }, { id: 2, course_id: 1, title: "学习率关键结论", source: "tutor", created_at: isoNow, updated_at: isoNow }] } : { count: 0, items: [] })
    if (path.startsWith("/quiz-sessions")) return fulfill(withRealData ? [{ id: 2, user_id: 9101, course_id: 1, topic: "梯度下降", mcq_count: 3, fill_count: 0, code_count: 0, total_count: 3, difficulty: 2, mode: "exam", code_grading: "self", status: "submitted", score: 80, duration_ms: 720_000, created_at: isoNow, submitted_at: isoNow, items: [] }] : [])
    if (path.startsWith("/eval/history/")) return fulfill(withRealData ? { count: 1, items: [{ id: 3, suggestions: ["继续巩固学习率"], created_at: isoNow }] } : { count: 0, items: [] })
    if (path.startsWith("/events")) return fulfill({ ok: true, inserted: 0 })
    if (path === "/learner/context") return fulfill({ enterprise: null })
    return fulfill({})
  })
  return unexpectedWrites
}

async function openHome({ withRealData, viewport, screenshotName }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", permissions: [] })
  const unexpectedWrites = await installMocks(context, withRealData)
  await context.addInitScript(({ currentUser, selectedCourse }) => {
    localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
    localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
    if (selectedCourse) localStorage.setItem("sm:current-course", JSON.stringify(selectedCourse)); else localStorage.removeItem("sm:current-course")
    sessionStorage.removeItem("sm:workspace-state")
  }, { currentUser: user, selectedCourse: withRealData ? course : null })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" })
  await page.getByTestId("today-learning-home").waitFor()
  await page.getByTestId("recommendation-reason").waitFor()
  await page.waitForTimeout(100)
  if (screenshotName) await page.screenshot({ path: `${resultDir}/${screenshotName}`, fullPage: true })
  return { context, page, unexpectedWrites }
}

try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const { context, page, unexpectedWrites } = await openHome({ withRealData: false, viewport, screenshotName: `empty-${viewport.width}x${viewport.height}.png` })
    const layout = await page.evaluate(() => {
      const box = (selector) => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null }
      const sidebar = document.querySelector(".app-shell-navigation")
      const topbar = document.querySelector(".app-topbar")
      const visualCards = [".home-summary-card.is-capability", ".home-summary-card.is-match", ".home-recent-card", ".home-quick-card"]
      const visualBackgroundCount = visualCards.filter((selector) => getComputedStyle(document.querySelector(selector)).backgroundImage.includes(".png")).length
      const toolButtonColors = new Set([...document.querySelectorAll(".home-quick-card nav a")].map((node) => getComputedStyle(node).backgroundColor)).size
      const capabilityBackground = getComputedStyle(document.querySelector(".home-summary-card.is-capability")).backgroundImage
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, focus: box(".home-focus-card"), cta: box('[data-testid="home-primary-cta"]'), summaries: box(".home-summary-grid"), sidebarVisible: Boolean(sidebar) && getComputedStyle(sidebar).opacity !== "0", topbarPosition: topbar ? getComputedStyle(topbar).position : null, pathStepCount: document.querySelectorAll(".home-path-step").length, visualBackgroundCount, toolButtonColors, capabilityBackground }
    })
    assert.ok(layout.overflow <= 1, `horizontal overflow at ${viewport.width}x${viewport.height}: ${layout.overflow}px`)
    assert.ok(layout.focus?.top >= 0 && layout.cta?.bottom <= viewport.height, `core task and CTA must be visible without scrolling at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.summaries.top > layout.focus.top, "summaries must follow the core task")
    if (viewport.width >= 720) assert.equal(layout.sidebarVisible, true, `desktop sidebar is hidden at ${viewport.width}x${viewport.height}`)
    assert.equal(await page.locator(".learning-universe,.flight-home-shell").count(), 0, "removed universe or launch center still rendered")
    assert.equal(await page.locator("#learner-match-report,[data-testid='role-capability-profile']").count(), 0, "full report or capability graph is still embedded on home")
    assert.equal(layout.topbarPosition, "relative", "home topbar must scroll with the page instead of covering content")
    assert.equal(layout.pathStepCount, 4, "the compact learning-loop actions were not all rendered")
    assert.equal(layout.visualBackgroundCount, 4, "lower dashboard cards must reuse the existing visual assets")
    assert.equal(layout.toolButtonColors, 4, "quick tool buttons must remain visually distinct")
    assert.ok(layout.capabilityBackground.includes("capability-radar-background-v1.png"), "capability summary must use the light visual treatment")
    assert.equal(await page.getByTestId("home-primary-cta").getAttribute("href"), "/courses", "empty state CTA must select a target role")
    assert.equal(await page.getByRole("link", { name: /查看完整图谱/ }).getAttribute("href"), "/capability-profile")
    assert.equal(await page.getByRole("link", { name: /查看完整报告/ }).getAttribute("href"), "/learner-report")
    await page.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" }))
    await page.waitForTimeout(50)
    const scrolledTopbarBottom = await page.locator(".app-topbar").evaluate((node) => node.getBoundingClientRect().bottom)
    assert.ok(scrolledTopbarBottom < 0, `home topbar remained over content while scrolling at ${viewport.width}x${viewport.height}`)
    assert.deepEqual(unexpectedWrites, [], "opening home triggered a business write")
    await context.close()
  }

  const { context, page, unexpectedWrites } = await openHome({ withRealData: true, viewport: { width: 1366, height: 768 }, screenshotName: "real-1366x768.png" })
  assert.equal(await page.getByText("12 分钟", { exact: true }).count(), 1, "real quiz duration did not reach today's progress")
  assert.equal(await page.getByText("75%", { exact: true }).count(), 1, "real note, quiz and evaluation signals did not reach today's progress")
  assert.equal(await page.getByText(/来自你的薄弱能力画像/).count(), 1, "real profile weakness did not explain the recommendation")
  assert.equal(await page.getByTestId("home-primary-cta").getAttribute("href"), "/competency", "real role without pending quiz must lead to training")
  const recentCardVisuals = await page.locator(".home-recent-list > a").evaluateAll((nodes) => nodes.map((node) => ({ height: node.getBoundingClientRect().height, backgroundImage: getComputedStyle(node).backgroundImage })))
  assert.ok(recentCardVisuals.length > 0 && recentCardVisuals.every(({ height, backgroundImage }) => height >= 86 && backgroundImage.includes(".png")), "recent-learning cards must be larger and carry visual backgrounds")
  assert.deepEqual(unexpectedWrites, [], "real-data home triggered a business write")
  await context.close()
  console.log("today-learning-home-check: PASS; task and CTA visible at 1366x768 and 390x844; real-data progress and compact report links verified")
} finally {
  await browser.close()
  if (preview) preview.kill()
}
