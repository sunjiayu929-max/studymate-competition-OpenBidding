import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import process from "node:process"
import { chromium } from "playwright"

const port = Number(process.env.STUDYMATE_UNIVERSE_PORT || 4182)
const baseUrl = process.env.STUDYMATE_BASE_URL || `http://127.0.0.1:${port}`
const resultDir = fileURLToPath(new URL("../test-results/learning-universe-command-center/", import.meta.url))
let preview = null

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  throw new Error(`preview did not become ready: ${url}`)
}

if (!process.env.STUDYMATE_BASE_URL) {
  assert.ok(existsSync(new URL("../dist/index.html", import.meta.url)), "run npm run build before check:universe")
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))
  preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  await waitForServer(`${baseUrl}/`)
}

await mkdir(resultDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const now = new Date()
const isoNow = now.toISOString()
const user = { user_id: 9101, name: "布局测试用户", email: "universe.fixture@example.test", role: "student" }
const course = { id: 1, name: "机器学习", description: "机器学习", chunk_count: 269 }

async function installMocks(context, { withRealData }) {
  const unexpectedWrites = []
  await context.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/u, "")
    const method = request.method()
    const fulfill = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(body),
    })

    if (method !== "GET" && !path.startsWith("/events")) unexpectedWrites.push(`${method} ${path}`)
    if (path === "/auth/me") return fulfill(user)
    if (path === "/courses") return fulfill({ count: 5, items: [course, { id: 2, name: "数据结构与算法", chunk_count: 360 }, { id: 3, name: "操作系统", chunk_count: 360 }, { id: 4, name: "计算机网络", chunk_count: 360 }, { id: 5, name: "计算机组成原理", chunk_count: 360 }] })
    if (path === "/rag/stats") return fulfill({ count: 1709, vectorized: 1709, engine: "fixture" })
    if (path === "/profile/9101") {
      return fulfill(withRealData
        ? {
            user_id: 9101,
            version: 4,
            dims: {
              knowledge_base: { "机器学习": 60 },
              cognitive_style: { visual: 70 },
              goals: { primary: "理解核心算法", target_topics: ["梯度下降"] },
              weak_points: { topics: ["学习率"] },
              pace: { hours_per_week: 6 },
              preference: { animation: 80 },
              employment_skills: { programming: 55 },
            },
          }
        : { user_id: 9101, version: 0, dims: {} })
    }
    if (path.startsWith("/notes")) {
      return fulfill(withRealData
        ? { count: 1, items: [{ id: 1, course_id: 1, title: "梯度下降复习", source: "manual", created_at: isoNow, updated_at: isoNow }] }
        : { count: 0, items: [] })
    }
    if (path.startsWith("/quiz-sessions")) {
      return fulfill(withRealData
        ? [{
            id: 2,
            user_id: 9101,
            course_id: 1,
            topic: "梯度下降",
            mcq_count: 3,
            fill_count: 0,
            code_count: 0,
            total_count: 3,
            difficulty: 2,
            mode: "exam",
            code_grading: "self",
            status: "submitted",
            score: 80,
            duration_ms: 720_000,
            created_at: isoNow,
            submitted_at: isoNow,
            items: [],
          }]
        : [])
    }
    if (path.startsWith("/eval/history/")) {
      return fulfill(withRealData
        ? { count: 1, items: [{ id: 3, suggestions: ["继续巩固学习率"], created_at: isoNow }] }
        : { count: 0, items: [] })
    }
    if (path.startsWith("/events")) return fulfill({ ok: true, inserted: 0 })
    return fulfill({})
  })
  return unexpectedWrites
}

async function openHome({ withRealData, viewport, screenshotName, reducedMotion = "reduce" }) {
  const context = await browser.newContext({ viewport, reducedMotion, permissions: [] })
  const unexpectedWrites = await installMocks(context, { withRealData })
  await context.addInitScript(({ currentUser, selectedCourse }) => {
    localStorage.setItem("sm:current-user", JSON.stringify(currentUser))
    localStorage.setItem(`sm:getting-started-seen:v1:${currentUser.user_id}`, "1")
    if (selectedCourse) localStorage.setItem("sm:current-course", JSON.stringify(selectedCourse))
    else localStorage.removeItem("sm:current-course")
    sessionStorage.removeItem("sm:workspace-state")
    sessionStorage.removeItem("sm:judge-demo:v1")
    sessionStorage.setItem("sm:learning-universe-entered", "1")
  }, { currentUser: user, selectedCourse: withRealData ? course : null })
  const page = await context.newPage()
  // 默认首页已升级为浅色品牌首屏；旧版指挥舱保留为回归入口，继续覆盖其真实数据与动效契约。
  await page.goto(`${baseUrl}/?legacy-home=1`, { waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "学习宇宙 · 实时指挥舱" }).waitFor()
  await page.getByTestId("beijing-clock").waitFor()
  if (screenshotName) await page.screenshot({ path: `${resultDir}/${screenshotName}` })
  return { context, page, unexpectedWrites }
}

async function measureCollisionSample(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect()
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom }
    }
    const union = (first, second) => ({
      left: Math.min(first.left, second.left),
      right: Math.max(first.right, second.right),
      top: Math.min(first.top, second.top),
      bottom: Math.max(first.bottom, second.bottom),
    })
    const intersects = (first, second, clearance = 0) => (
      first.left < second.right + clearance
      && first.right > second.left - clearance
      && first.top < second.bottom + clearance
      && first.bottom > second.top - clearance
    )
    const nodes = Array.from(document.querySelectorAll(".universe-planet")).map((planet) => ({
      id: planet.getAttribute("data-planet"),
      rect: union(
        rect(planet.querySelector(".universe-planet-surface")),
        rect(planet.querySelector(".universe-planet-caption")),
      ),
    }))
    const core = rect(document.querySelector(".universe-learner-core"))
    const heading = rect(document.querySelector(".universe-core-heading"))
    const primary = rect(document.querySelector('[data-testid="universe-primary-cta"]'))
    const courseCtaElement = document.querySelector(".universe-course-cta")
    const courseCta = courseCtaElement ? rect(courseCtaElement) : null
    const stage = rect(document.querySelector(".universe-core-panel"))
    const collisions = []

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      if (intersects(node.rect, core, 4)) collisions.push(`${node.id}:core`)
      if (intersects(node.rect, heading, 4)) collisions.push(`${node.id}:heading`)
      if (intersects(node.rect, primary, 4)) collisions.push(`${node.id}:primary-cta`)
      if (courseCta && intersects(node.rect, courseCta, 4)) collisions.push(`${node.id}:course-cta`)
      if (node.rect.left < stage.left - 1 || node.rect.right > stage.right + 1) collisions.push(`${node.id}:stage-edge`)
      for (let other = index + 1; other < nodes.length; other += 1) {
        if (intersects(node.rect, nodes[other].rect, 8)) collisions.push(`${node.id}:${nodes[other].id}`)
      }
    }

    const lowestNode = Math.max(...nodes.map((node) => node.rect.bottom))
    return {
      collisions,
      ctaClearance: Math.min(primary.top, courseCta?.top ?? primary.top) - lowestNode,
      debug: collisions.length ? { nodes, core, heading, primary, stage } : null,
    }
  })
}

function assertCollisionTimeline(samples, viewport) {
  const times = samples.map((sample) => sample.time)
  const collisions = samples.flatMap((sample) => sample.collisions.map((collision) => `${sample.time}s:${collision}`))
  const minCtaClearance = Math.min(...samples.map((sample) => sample.ctaClearance))
  assert.deepEqual(collisions, [], `planet collision at ${viewport.width}x${viewport.height}: ${collisions.join(", ")}; ${JSON.stringify(samples.filter((sample) => sample.debug).slice(0, 1))}`)
  assert.ok(minCtaClearance >= 72, `CTA safety zone below 72px at ${viewport.width}x${viewport.height}: ${minCtaClearance.toFixed(1)}px`)
  return { times, minCtaClearance }
}

try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const { context, page, unexpectedWrites } = await openHome({
      withRealData: false,
      viewport,
      screenshotName: `${viewport.width}x${viewport.height}-regression.png`,
    })
    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
      }
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        topbar: box(".universe-command-topbar"),
        primary: box('[data-testid="universe-primary-cta"]'),
        agentCount: document.querySelectorAll(".universe-agent-row").length,
        planetCount: document.querySelectorAll(".universe-planet").length,
        agentStates: Array.from(document.querySelectorAll(".universe-agent-state")).map((element) => element.textContent?.trim()),
        fontSizes: {
          panelTitle: Number.parseFloat(getComputedStyle(document.querySelector(".universe-panel-heading h2")).fontSize),
          metricLabel: Number.parseFloat(getComputedStyle(document.querySelector(".universe-metric > span")).fontSize),
          agentName: Number.parseFloat(getComputedStyle(document.querySelector(".universe-agent-row strong")).fontSize),
          planetLabel: Number.parseFloat(getComputedStyle(document.querySelector(".universe-planet-caption strong")).fontSize),
          pulseStep: Number.parseFloat(getComputedStyle(document.querySelector(".universe-flow-steps > span")).fontSize),
        },
        reducedPlanetAnimation: getComputedStyle(document.querySelector(".universe-planet")).animationName,
      }
    })
    assert.ok(layout.overflow <= 1, `horizontal overflow at ${viewport.width}x${viewport.height}: ${layout.overflow}px`)
    assert.ok(layout.topbar && layout.topbar.height <= 54, `topbar exceeded 54px at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.primary && layout.primary.top >= 0 && layout.primary.bottom <= viewport.height, `primary CTA clipped at ${viewport.width}x${viewport.height}`)
    assert.equal(layout.agentCount, 7, `expected 7 Agents at ${viewport.width}x${viewport.height}`)
    assert.equal(layout.planetCount, 7, `expected 7 capability planets at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.fontSizes.panelTitle >= 16, `panel title is too small at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.fontSizes.metricLabel >= 11, `metric label is too small at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.fontSizes.agentName >= 11.5, `Agent name is too small at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.fontSizes.planetLabel >= 11.5, `planet label is too small at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.fontSizes.pulseStep >= 9.5, `pulse step is too small at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.agentStates.every((state) => state === "待命"), `idle store rendered a fake business state at ${viewport.width}x${viewport.height}`)
    assert.equal(layout.reducedPlanetAnimation, "none", `reduced motion did not stop planet animation at ${viewport.width}x${viewport.height}`)
    assert.equal(await page.getByText("演示数据", { exact: false }).count(), 0, "formal universe showed an artificial demo-data badge")
    assert.equal(await page.getByText("模拟观测", { exact: false }).count(), 0, "formal universe showed simulated observations")
    assert.equal(await page.getByTestId("universe-empty-state").count(), 1, "empty account did not show a real-data empty state")
    assert.equal(await page.getByText("暂无历史，不绘制虚假曲线", { exact: true }).count(), 1, "empty trend did not explain its real-data boundary")
    assert.equal(await page.getByTestId("learning-universe-command-center").getByRole("link", { name: "选择课程", exact: true }).count(), 1, "empty account is missing the course CTA")
    assert.deepEqual(unexpectedWrites, [], "opening the universe triggered a business write request")

    await page.getByTestId("universe-primary-cta").click()
    await page.locator("#learning-desk").waitFor()
    await page.waitForTimeout(120)
    const afterEntry = await page.evaluate(() => ({
      deskTop: document.querySelector("#learning-desk")?.getBoundingClientRect().top,
      universeActive: document.querySelector(".learning-universe")?.getAttribute("data-active"),
    }))
    assert.ok(afterEntry.deskTop >= 0 && afterEntry.deskTop < viewport.height, `today desk did not enter viewport at ${viewport.width}x${viewport.height}`)
    assert.equal(afterEntry.universeActive, "false", `universe animation did not pause after leaving first screen at ${viewport.width}x${viewport.height}`)
    await context.close()
  }

  const motionViewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]
  const motionSessions = await Promise.all(motionViewports.map(async (viewport) => ({
    viewport,
    ...await openHome({
      withRealData: false,
      viewport,
      screenshotName: null,
      reducedMotion: "no-preference",
    }),
  })))
  const collisionSamples = new Map(motionSessions.map((session) => [session.viewport.width, []]))
  const sampleTimes = [0, 2, 4, 6, 8, 10, 15, 20]
  const timelineStops = [0, 2, 2.9, 4, 5.2, 6, 8, 10, 15, 20]
  await new Promise((resolve) => setTimeout(resolve, 350))
  let elapsedSeconds = 0
  for (const time of timelineStops) {
    if (time > elapsedSeconds) await new Promise((resolve) => setTimeout(resolve, (time - elapsedSeconds) * 1000))
    elapsedSeconds = time
    if (sampleTimes.includes(time)) {
      const measurements = await Promise.all(motionSessions.map((session) => measureCollisionSample(session.page)))
      measurements.forEach((measurement, index) => {
        collisionSamples.get(motionSessions[index].viewport.width).push({ time, ...measurement })
      })
    }
    if (time === 2.9 || time === 5.2 || time === 6) {
      await Promise.all(motionSessions
        .filter((session) => session.viewport.width >= 1440)
        .map((session) => session.page.screenshot({
          path: `${resultDir}/${session.viewport.width}x${session.viewport.height}-visual-v5-${time === 2.9 ? "pulse" : time === 5.2 ? "meteor-5s" : "motion-6s"}.png`,
        })))
    }
  }
  const collisionResults = motionSessions.map((session) => ({
    viewport: `${session.viewport.width}x${session.viewport.height}`,
    ...assertCollisionTimeline(collisionSamples.get(session.viewport.width), session.viewport),
  }))
  for (const session of motionSessions) {
    assert.deepEqual(session.unexpectedWrites, [], `motion audit triggered a business write at ${session.viewport.width}x${session.viewport.height}`)
    await session.context.close()
  }

  const { context, page, unexpectedWrites } = await openHome({
    withRealData: true,
    viewport: { width: 1440, height: 900 },
    screenshotName: "1440x900-real-data-regression.png",
  })
  assert.equal(await page.getByTestId("universe-empty-state").count(), 0, "real activity was replaced by the empty state")
  assert.ok(await page.locator(".universe-event-item").count() >= 3, "real notes, quiz and evaluation timestamps did not reach the event stream")
  assert.equal(await page.getByText("12 分钟", { exact: true }).count(), 1, "real quiz duration did not reach today's metric")
  assert.equal(await page.getByText("演示数据", { exact: false }).count(), 0, "real state showed demo personal data")
  assert.equal(await page.getByText("模拟观测", { exact: false }).count(), 0, "real state showed simulated observations")
  assert.deepEqual(unexpectedWrites, [], "real-data home triggered a business write request")
  await context.close()

  console.log(`learning-universe-check: PASS; 3 desktop viewports × 8 motion samples have no collisions; CTA clearances ${collisionResults.map((result) => `${result.viewport}=${result.minCtaClearance.toFixed(1)}px`).join(", ")}`)
} finally {
  await browser.close()
  if (preview) preview.kill()
}
