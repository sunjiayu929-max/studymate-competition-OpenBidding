import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import process from "node:process"
import { chromium } from "playwright"

const port = Number(process.env.STUDYMATE_E2E_PORT || 4179)
const baseUrl = process.env.STUDYMATE_BASE_URL || `http://127.0.0.1:${port}`
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
  assert.ok(existsSync(new URL("../dist/index.html", import.meta.url)), "run npm run build before check:e2e")
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))
  preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  await waitForServer(`${baseUrl}/landing/index.html`)
}

const courses = [
  { id: 1, name: "机器学习", description: "模型训练、神经网络与智能算法", chunk_count: 269 },
  { id: 2, name: "数据结构与算法", description: "线性结构、树、图与算法设计", chunk_count: 360 },
  { id: 3, name: "操作系统", description: "进程、内存与文件系统", chunk_count: 360 },
  { id: 4, name: "计算机网络", description: "协议与传输控制", chunk_count: 360 },
  { id: 5, name: "计算机组成原理", description: "处理器与存储系统", chunk_count: 360 },
]

const user = { user_id: 9001, name: "E2E 评委", email: "judge.fixture@example.test", role: "admin", created: false }
let loggedIn = false

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  })
}

async function installApiMocks(context) {
  await context.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/u, "")

    if (path === "/auth/me") return json(route, loggedIn ? user : null)
    if (path === "/auth/login") {
      loggedIn = true
      return json(route, user)
    }
    if (path === "/auth/logout") {
      loggedIn = false
      return json(route, { ok: true })
    }
    if (path === "/courses") return json(route, { count: courses.length, items: courses })
    if (/^\/courses\/1\/config$/u.test(path)) {
      return json(route, {
        id: 1,
        name: "机器学习",
        description: "机器学习",
        persona: "课程助教",
        code_style: "ml",
        code_libs: [],
        reading_sources: [],
        sample_topics: ["梯度下降", "PCA"],
        sample_questions: ["梯度下降如何工作？"],
        syllabus_hint: "",
        from_registry: true,
      })
    }
    if (/^\/profile\/9001$/u.test(path)) {
      return json(route, {
        user_id: 9001,
        version: 3,
        dims: {
          knowledge_base: { "机器学习": 62 },
          cognitive_style: { visual: 70, verbal: 58 },
          preference: { animation: 75, example: 68 },
          employment_skills: { programming: 60, algorithm: 55 },
          goals: { primary: "理解机器学习核心算法", target_topics: ["梯度下降"] },
          weak_points: { topics: ["学习率"] },
          pace: { hours_per_week: 6, intensity: "steady" },
        },
      })
    }
    if (path.startsWith("/profile/snapshots/9001")) return json(route, { count: 0, items: [] })
    if (path.startsWith("/notes")) return json(route, { count: 0, items: [] })
    if (path.startsWith("/quiz-sessions")) return json(route, [])
    if (path.startsWith("/eval/history/")) return json(route, { count: 0, items: [] })
    if (path.startsWith("/rag/stats")) return json(route, { count: 1709, engine: "BM25 + Vector + RRF", course_id: 1 })
    if (path.startsWith("/rag/search")) {
      return json(route, {
        query: url.searchParams.get("q") || "梯度下降",
        k: 8,
        count: 1,
        score_meta: {
          method: "rrf",
          mode: "hybrid",
          active_branches: 2,
          label: "相对匹配度",
          note: "仅用于区分本次结果先后，不代表答案正确概率。",
        },
        results: [{
          chunk_id: "101",
          content: "梯度下降沿损失函数负梯度方向迭代更新参数，学习率控制每一步的长度。",
          source: "机器学习课程讲义",
          page: 12,
          url: null,
          meta: { topic: "梯度下降" },
          score: 0.031,
          rank: 1,
          relevance_percent: 96,
          retrieval_mode: "hybrid",
        }],
      })
    }
    if (path === "/rag/chunks/101") {
      return json(route, {
        chunk_id: "101",
        course_id: 1,
        course_name: "机器学习",
        source: "机器学习课程讲义",
        page: 12,
        url: null,
        external_url: null,
        meta: { topic: "梯度下降" },
        context: [{
          chunk_id: "101",
          content: "梯度下降沿损失函数负梯度方向迭代更新参数。",
          page: 12,
          meta: { topic: "梯度下降" },
          is_current: true,
        }],
      })
    }
    if (path === "/tutor/models") {
      return json(route, {
        default: "qwen",
        items: [
          { id: "qwen", label: "Qwen", description: "课程问答与多模态", configured: false, recommended: true },
          { id: "deepseek", label: "DeepSeek", description: "推理与代码讲解", configured: false, recommended: false },
          { id: "mimo", label: "MiMo", description: "自然对话与总结", configured: false, recommended: false },
        ],
      })
    }
    if (path === "/voice/status") {
      return json(route, {
        asr_configured: false,
        tts_configured: false,
        tts_engine: "cosyvoice",
        permission_policy: "user_gesture_only",
      })
    }
    if (path === "/voice/voices") {
      return json(route, { voices: [{ id: "fixture", label: "测试音色", tone: "不调用", gender: "female" }], default: "fixture", mode: "fixture" })
    }
    if (path === "/voice/tts" || path === "/voice/asr-url") {
      return json(route, { detail: "演示降级：语音服务未配置" }, 503)
    }
    if (path.startsWith("/tutor/conversations")) {
      const now = "2026-07-29T12:00:00Z"
      const active = {
        id: "s1",
        title: "语音降级示例",
        created_at: now,
        updated_at: now,
        messages: [
          { role: "user", content: "语音不可用时还能学习吗？", delivery: "complete" },
          { role: "assistant", content: "可以。语音服务未配置时，完整文字回答仍然保留并可继续阅读。", delivery: "complete" },
        ],
      }
      return json(route, { active, items: [active] })
    }
    if (path === "/knowledge-bases") return json(route, { items: [] })
    if (path === "/tests" || path.startsWith("/tests?")) {
      return json(route, { count: 0, passed: 0, failed: 0, pending: 0, recovered: 0, items: [] })
    }
    if (path === "/admin/data-health") {
      return json(route, {
        courses: 5,
        knowledge_chunks: 1709,
        knowledge_vectors: 1709,
        private_libraries: 0,
        private_chunks: 0,
        private_tasks: { pending: 0, running: 0, completed: 0, failed: 0 },
        ocr: { mode: "not_configured", available: false, note: "E2E 不启动生产 OCR" },
        migrations: [{ version: "phase2", description: "安全测试夹具", applied_at: "2026-07-29T12:00:00Z" }],
      })
    }
    if (path.startsWith("/careers/recommendations")) {
      return json(route, {
        provider: "fixture",
        source_state: "fallback",
        platform_url: "https://example.test/careers",
        current_course: "机器学习",
        historical_courses: [],
        evidence_note: "E2E 安全夹具",
        items: [],
      })
    }
    if (path.startsWith("/bili/videos")) return json(route, { ok: false, videos: [], search_url: "https://example.test/search", resolved_query: "梯度下降" })
    if (path.startsWith("/rencaiya/courses")) {
      return json(route, {
        provider: "fixture",
        source_state: "fallback",
        match_level: "fallback",
        resolved_query: "梯度下降",
        course_name: "机器学习",
        platform_url: "https://example.test/courses",
        items: [],
      })
    }
    if (path.startsWith("/events")) return json(route, { ok: true })
    if (path === "/ping") return json(route, { status: "ok", llm_configured: false })

    return json(route, {})
  })
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  permissions: [],
  reducedMotion: "reduce",
})

await context.addInitScript(() => {
  window.__studyMatePermissionCalls = { microphone: 0, fullscreen: 0 }
  const mediaDevices = navigator.mediaDevices || {}
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      ...mediaDevices,
      getUserMedia: async () => {
        window.__studyMatePermissionCalls.microphone += 1
        throw new DOMException("mocked by phase-3 E2E", "NotAllowedError")
      },
    },
  })
  Element.prototype.requestFullscreen = async function requestFullscreenMock() {
    window.__studyMatePermissionCalls.fullscreen += 1
    throw new DOMException("mocked by phase-3 E2E", "NotAllowedError")
  }
  window.__studyMatePerf = { lcp: 0, longTasks: [] }
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries.at(-1)
      if (last) window.__studyMatePerf.lcp = last.startTime
    }).observe({ type: "largest-contentful-paint", buffered: true })
    new PerformanceObserver((list) => {
      window.__studyMatePerf.longTasks.push(...list.getEntries().map((entry) => entry.duration))
    }).observe({ type: "longtask", buffered: true })
  } catch {
    // Browser may not expose every observer type.
  }
})

await installApiMocks(context)
const page = await context.newPage()
page.on("pageerror", (error) => console.error("browser-pageerror:", error.message))
page.on("console", (message) => {
  if (message.type() === "error") console.error("browser-console:", message.text())
})

try {
  await page.goto(`${baseUrl}/landing/index.html`, { waitUntil: "domcontentloaded" })
  await page.locator(".top-entry").click()
  await page.waitForURL("**/login")

  await page.getByPlaceholder("例如 name@example.com").fill("judge.fixture@example.test")
  await page.getByPlaceholder("输入你的密码").fill("safe-test-password")
  await page.getByRole("button", { name: "进入 StudyMate" }).click()
  await page.waitForURL((url) => url.pathname === "/")

  await page.getByRole("heading", { name: "学习宇宙 · 实时指挥舱" }).waitFor()
  await page.getByTestId("beijing-clock").waitFor()
  await page.getByTestId("platform-capabilities").getByText("1,709", { exact: true }).waitFor()
  assert.equal(await page.getByTestId("agents-live").locator(".universe-agent-row").count(), 7, "learning universe must show all 7 Agents")
  assert.equal(await page.locator(".universe-planet").count(), 7, "learning universe must show all 7 capability planets")
  assert.equal(await page.getByRole("button", { name: /打开 StudyMate 真人学习助手/u }).count(), 0, "global digital human must be hidden over the learning universe")
  assert.equal(await page.getByText("演示数据", { exact: false }).count(), 0, "formal home must not show simulated personal data")
  assert.equal(await page.getByText("模拟观测", { exact: false }).count(), 0, "formal home must not show simulated observations")
  const skipGuide = page.getByRole("button", { name: /暂时跳过/u })
  if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click()
  await page.getByRole("button", { name: "进入今日学习" }).last().click()
  await page.locator("#learning-desk").waitFor()
  assert.ok(await page.locator("#learning-desk").evaluate((element) => element.getBoundingClientRect().top < window.innerHeight), "learning desk did not enter viewport")

  await page.goto(`${baseUrl}/courses`)
  await page.getByRole("button", { name: /机器学习/u }).click()
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/workspace")

  await page.goto(`${baseUrl}/rag`)
  const ragInput = page.getByPlaceholder("搜索知识点、公式或问题…")
  await ragInput.fill("梯度下降")
  await page.getByRole("button", { name: "开始检索" }).click()
  await page.getByText("相对匹配 96%").waitFor()
  await page.getByRole("link", { name: "查看原文" }).click()
  await page.waitForURL("**/rag/source/101")
  await page.getByRole("heading", { name: "机器学习课程讲义" }).waitFor()

  await page.goto(`${baseUrl}/profile`)
  const profileInput = page.getByPlaceholder("告诉我你的目标、基础或最近遇到的困难…")
  await profileInput.waitFor()
  assert.ok(await profileInput.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  }), "profile input is not visible in the first desktop viewport")

  await page.goto(`${baseUrl}/concept?anim=gradient-descent`)
  let lectureStarted = false
  for (let attempt = 0; attempt < 60 && !lectureStarted; attempt += 1) {
    lectureStarted = await page.evaluate(() => {
      if (document.querySelector('button[title="暂停"], button[title="继续"]')) return true
      const button = Array.from(document.querySelectorAll("button")).find((item) => item.getAttribute("aria-label")?.includes("AI 视频讲解"))
      button?.click()
      return false
    })
    if (!lectureStarted) await page.waitForTimeout(250)
  }
  if (!lectureStarted) {
    console.error((await page.locator("body").innerText()).slice(0, 1800))
  }
  assert.ok(lectureStarted, "AI video controls did not become available")
  const pauseButton = page.getByTitle("暂停").last()
  await pauseButton.click()
  const timeline = page.locator('input[type="range"]').first()
  await timeline.evaluate((element) => {
    const input = element
    input.value = String(Number(input.max || 100) * 0.45)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await page.getByLabel("讲解播放速度").last().selectOption("1.25")
  assert.equal(await page.getByLabel("讲解播放速度").last().inputValue(), "1.25")

  const avatarButton = page.getByRole("button", { name: /打开 StudyMate 真人学习助手/u })
  assert.equal(await avatarButton.count(), 0, "Dense concept controls should not be covered by the global avatar")
  await page.goto(`${baseUrl}/courses`)
  await avatarButton.click()
  await page.locator('aside[aria-label="StudyMate 学习助手"]').waitFor()
  await page.getByRole("button", { name: "关闭（Esc）" }).click()

  await page.goto(`${baseUrl}/tutor/voice`)
  await page.getByText("演示降级：", { exact: false }).waitFor()
  await page.getByText("完整文字回答仍然保留并可继续阅读。", { exact: false }).waitFor()
  const permissionCalls = await page.evaluate(() => window.__studyMatePermissionCalls)
  assert.deepEqual(permissionCalls, { microphone: 0, fullscreen: 0 }, "E2E triggered a permission-gated API")

  const competitionPages = [
    { path: "/knowledge", marker: "创建第一个私有知识库" },
    { path: "/ppt", marker: "让模型先讲好故事，再生成可编辑演示文稿" },
    { path: "/tutor", marker: "本次讲解会如何适配你" },
    { path: "/report", marker: "StudyMate 学习报告" },
    { path: "/tests", marker: "StudyMate 测试管理" },
  ]
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const target of competitionPages) {
    await page.goto(`${baseUrl}${target.path}`)
    await page.getByText(target.marker, { exact: false }).first().waitFor()
    assert.equal(await page.getByText("页面资源加载中断", { exact: true }).count(), 0, `${target.path} rendered the route error boundary`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.ok(overflow <= 1, `horizontal overflow on ${target.path}: ${overflow}px`)
  }
  await page.goto(`${baseUrl}/tutor`)
  const modelSelect = page.getByLabel("选择回答模型")
  await modelSelect.waitFor()
  const modelOptions = await modelSelect.locator("option").allTextContents()
  for (const provider of ["Qwen", "DeepSeek", "MiMo"]) {
    assert.ok(modelOptions.some((option) => option.includes(provider)), `model selector is missing ${provider}`)
  }
  assert.ok(modelOptions.every((option) => option.includes("未配置")), "model selector hid the unconfigured state")
  await page.goto(`${baseUrl}/tests`)
  await page.getByText("只读数据健康", { exact: true }).waitFor()
  await page.getByText("E2E 不启动生产 OCR", { exact: false }).waitFor()

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`${baseUrl}/`)
    await page.getByRole("heading", { name: "学习宇宙 · 实时指挥舱" }).waitFor()
    const layout = await page.evaluate(() => {
      const universe = document.querySelector(".learning-universe")
      const topbar = document.querySelector(".universe-command-topbar")
      const primary = document.querySelector('[data-testid="universe-primary-cta"]')
      const rect = (element) => {
        const box = element?.getBoundingClientRect()
        return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null
      }
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        universe: rect(universe),
        topbar: rect(topbar),
        primary: rect(primary),
        agentCount: document.querySelectorAll(".universe-agent-row").length,
        planetCount: document.querySelectorAll(".universe-planet").length,
      }
    })
    const overflow = layout.overflow
    assert.ok(overflow <= 1, `horizontal overflow at ${viewport.width}x${viewport.height}: ${overflow}px`)
    assert.ok(layout.universe && layout.universe.height <= viewport.height + 1, `universe exceeded first viewport at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.topbar && layout.topbar.height <= 54, `top status bar exceeded 54px at ${viewport.width}x${viewport.height}`)
    assert.ok(layout.primary && layout.primary.top >= 0 && layout.primary.bottom <= viewport.height, `primary CTA was clipped at ${viewport.width}x${viewport.height}`)
    assert.equal(layout.agentCount, 7, `7 Agents were not all rendered at ${viewport.width}x${viewport.height}`)
    assert.equal(layout.planetCount, 7, `7 capability planets were not all rendered at ${viewport.width}x${viewport.height}`)
  }

  const perf = await page.evaluate(() => ({
    ...window.__studyMatePerf,
    navigation: performance.getEntriesByType("navigation").map((entry) => ({
      domContentLoaded: entry.domContentLoadedEventEnd,
      load: entry.loadEventEnd,
    })),
  }))
  const longTaskCount = perf.longTasks.length
  const longTaskTotal = perf.longTasks.reduce((sum, value) => sum + value, 0)
  console.log(`phase3-e2e: PASS; mocked permissions=0; competition pages=${competitionPages.length}; desktop viewports=3; local LCP observation=${perf.lcp.toFixed(1)}ms; long tasks=${longTaskCount}/${longTaskTotal.toFixed(1)}ms`)
  console.log("phase3-e2e: LCP/long-task numbers are a local static baseline, not fixed-device INP or production evidence")
} finally {
  await context.close()
  await browser.close()
  if (preview) preview.kill()
}
