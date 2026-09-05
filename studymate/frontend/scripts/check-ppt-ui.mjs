import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import process from "node:process"

import { chromium } from "playwright"

const port = Number(process.env.STUDYMATE_PPT_UI_PORT || 4183)
const baseUrl = process.env.STUDYMATE_BASE_URL || `http://127.0.0.1:${port}`
let preview = null
const outlineRequests = []

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
  assert.ok(existsSync(new URL("../dist/index.html", import.meta.url)), "run npm run build before check:ppt-ui")
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))
  preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  await waitForServer(`${baseUrl}/ppt`)
}

const citation = { source: "机器学习课程讲义", page: 12, chunk_id: "ppt-ui", kind: "course" }
const baseSlide = {
  source: "机器学习课程讲义 第 12 页",
  citations: [citation],
  chart_data: [],
}
const slides = [
  {
    ...baseSlide,
    title: "梯度下降不是“往下走”那么简单",
    kicker: "机器学习 · 课堂讲解",
    subtitle: "从方向、步长和反馈三个角度建立优化直觉",
    takeaway: "每一步都在回答：怎样更接近真正想要的结果？",
    bullets: [],
    layout: "cover",
    blocks: [],
  },
  {
    ...baseSlide,
    title: "先看问题，再拆开算法",
    kicker: "LEARNING JOURNEY",
    subtitle: "四个问题连成一条学习路径。",
    takeaway: "每一页只解决一个关键问题。",
    bullets: [],
    layout: "agenda",
    blocks: [
      { heading: "01", body: "为什么需要迭代" },
      { heading: "02", body: "方向从哪里来" },
      { heading: "03", body: "步长怎样选择" },
      { heading: "04", body: "何时应该停下" },
    ],
  },
  {
    ...baseSlide,
    title: "优化不是一步命中",
    kicker: "ONE IDEA",
    subtitle: "梯度给方向，学习率决定对方向有多信任。",
    takeaway: "优化是在反馈中持续修正。",
    bullets: [],
    layout: "spotlight",
    blocks: [],
  },
  {
    ...baseSlide,
    title: "一次更新由四个动作闭环完成",
    kicker: "THE LOOP",
    subtitle: "",
    takeaway: "真正驱动学习的是持续反馈。",
    bullets: [],
    layout: "process",
    blocks: [
      { heading: "观察误差", body: "计算预测与目标的差距。" },
      { heading: "求取梯度", body: "判断参数对误差的影响。" },
      { heading: "更新参数", body: "沿负梯度方向移动。" },
      { heading: "重新评估", body: "检查误差并进入下一轮。" },
    ],
  },
  {
    ...baseSlide,
    title: "学习率过大与过小，会以不同方式浪费训练",
    kicker: "STEP SIZE",
    subtitle: "",
    takeaway: "",
    bullets: [],
    layout: "comparison",
    blocks: [
      { heading: "过小：稳定但迟缓", body: "损失下降缓慢，训练时间被拉长。" },
      { heading: "过大：快速但失控", body: "更新跨过低点并反复震荡。" },
    ],
  },
  {
    ...baseSlide,
    title: "看到损失震荡，先别急着换模型",
    kicker: "CASE IN CONTEXT",
    subtitle: "",
    takeaway: "训练曲线正在提示更新策略与地形不匹配。",
    bullets: [],
    layout: "case",
    blocks: [
      { heading: "现象", body: "损失反复上升，波动没有缩小。" },
      { heading: "判断", body: "学习率可能过大。" },
      { heading: "行动", body: "降低学习率或使用衰减策略。" },
    ],
  },
  {
    ...baseSlide,
    title: "把梯度下降看成反馈系统",
    kicker: "TAKE IT FORWARD",
    subtitle: "",
    takeaway: "方向、步长和重新评估，共同决定优化能否稳定接近目标。",
    bullets: ["解释一次完整更新", "比较两种学习率现象", "用训练曲线提出诊断"],
    layout: "summary",
    blocks: [],
  },
]

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  })
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
await context.route("**/api/**", async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname.replace(/^\/api/u, "")
  if (path === "/auth/me") return json(route, { user_id: 9001, name: "PPT UI", email: "ppt-ui@example.test", role: "admin" })
  if (path === "/courses") return json(route, { count: 1, items: [{ id: 1, name: "机器学习", description: "机器学习", chunk_count: 269 }] })
  if (path === "/courses/1/config") return json(route, { id: 1, name: "机器学习", description: "机器学习", persona: "课程助教", code_style: "ml", code_libs: [], reading_sources: [], sample_topics: ["梯度下降"], sample_questions: [], syllabus_hint: "", from_registry: true })
  if (path === "/profile/9001") return json(route, { user_id: 9001, version: 1, dims: {} })
  if (path.startsWith("/profile/snapshots/")) return json(route, { count: 0, items: [] })
  if (path === "/tutor/models") return json(route, { default: "qwen", items: [{ id: "qwen", label: "Qwen", description: "视觉叙事", configured: true, recommended: true }] })
  if (path === "/knowledge-bases") return json(route, { items: [] })
  if (path === "/ppt/outline") {
    const payload = request.postDataJSON()
    outlineRequests.push(payload)
    if (!payload.allow_local_fallback) {
      return json(route, { detail: "Qwen 尚未配置，可明确选择使用本地策略继续" }, 503)
    }
    return json(route, { mode: "local_fallback", provider: "qwen", message: "已按明确选择使用本地策略", slides })
  }
  if (path.startsWith("/events")) return json(route, { ok: true })
  return json(route, {})
})

const page = await context.newPage()
page.on("pageerror", (error) => {
  throw error
})

try {
  await page.goto(`${baseUrl}/ppt`, { waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "把主题或知识来源变成可编辑 PPT", exact: true }).waitFor()
  const skipGuide = page.getByRole("button", { name: /暂时跳过/u })
  if (await skipGuide.isVisible().catch(() => false)) await skipGuide.click()
  assert.equal(await page.getByRole("button", { name: "生成演示文稿", exact: true }).count(), 1)
  await page.getByText("示例演示稿 · 可直接编辑", { exact: true }).waitFor()
  await page.getByPlaceholder("例如：梯度下降的直觉与应用").fill("梯度下降")
  await page.getByRole("button", { name: "生成演示文稿", exact: true }).click()
  await page.getByRole("alert").waitFor()
  assert.equal(outlineRequests[0]?.allow_local_fallback, false)
  await page.getByRole("button", { name: "明确使用本地策略", exact: true }).click()
  await page.getByLabel("页面标题").waitFor()
  assert.equal(outlineRequests[1]?.allow_local_fallback, true)
  assert.equal(await page.getByLabel("页面标题").inputValue(), "梯度下降不是“往下走”那么简单")
  assert.ok(await page.getByText("流程推进", { exact: true }).count() >= 1)

  await page.getByText("一次更新由四个动作闭环完成", { exact: true }).click()
  await page.getByLabel("步骤标题 1").waitFor()
  assert.equal(await page.getByLabel("步骤标题 1").inputValue(), "观察误差")

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(desktopOverflow <= 1, `PPT desktop page has horizontal overflow: ${desktopOverflow}px`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(650)
  const mobileLayout = await page.evaluate(() => {
    const editor = document.querySelector(".ppt-studio-editor")?.getBoundingClientRect()
    const previewPane = document.querySelector(".ppt-studio-preview")?.getBoundingClientRect()
    const canvas = document.querySelector('.ppt-studio-preview [class*="aspect-video"]')?.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      editorWidth: editor?.width || 0,
      previewWidth: previewPane?.width || 0,
      canvasWidth: canvas?.width || 0,
    }
  })
  assert.ok(mobileLayout.overflow <= 1, `PPT mobile page has horizontal overflow: ${mobileLayout.overflow}px`)
  assert.ok(mobileLayout.previewWidth <= mobileLayout.editorWidth + 1, `PPT mobile preview must stay inside the editor: ${JSON.stringify(mobileLayout)}`)
  assert.ok(mobileLayout.canvasWidth <= mobileLayout.previewWidth + 1, `PPT mobile canvas must scale inside the preview: ${JSON.stringify(mobileLayout)}`)
  if (process.env.PPT_UI_SCREENSHOT) {
    await page.screenshot({ path: process.env.PPT_UI_SCREENSHOT, fullPage: true })
  }
  console.log("ppt-ui-check: single explicit generation flow, editable layouts, and responsive containment verified")
} finally {
  await context.close()
  await browser.close()
  if (preview) preview.kill()
}
