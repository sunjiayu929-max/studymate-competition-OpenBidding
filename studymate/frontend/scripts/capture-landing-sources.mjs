import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { chromium } from "playwright"

const FRONTEND = process.env.STUDYMATE_FRONTEND_URL || "http://127.0.0.1:5173"
const BACKEND = process.env.STUDYMATE_BACKEND_URL || "http://127.0.0.1:8000"
const EMAIL = process.env.STUDYMATE_CAPTURE_EMAIL
const PASSWORD = process.env.STUDYMATE_CAPTURE_PASSWORD
const OUTPUT = resolve("public/landing/assets")

if (!EMAIL || !PASSWORD) {
  throw new Error("请设置 STUDYMATE_CAPTURE_EMAIL 和 STUDYMATE_CAPTURE_PASSWORD")
}

await mkdir(OUTPUT, { recursive: true })

let browser
try {
  browser = await chromium.launch({ channel: "chrome", headless: true })
} catch {
  browser = await chromium.launch({ channel: "msedge", headless: true })
}

const pages = [
  { path: "/courses", file: "product-role-space-v1.jpg", waitFor: "岗位空间" },
  { path: "/competency", file: "product-training-studio-v1.jpg", waitFor: "岗位训练中心" },
  { path: "/capability-profile", file: "product-capability-profile-v1.jpg", testId: "role-capability-profile" },
  { path: "/learner-report", file: "product-learner-report-v1.jpg", waitFor: "个人学情与资源匹配度报告" },
]

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  const login = await context.request.post(`${BACKEND}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  })
  if (!login.ok()) throw new Error(`截图账号登录失败：${login.status()}`)

  const page = await context.newPage()
  for (const item of pages) {
    await page.goto(`${FRONTEND}${item.path}`, { waitUntil: "networkidle", timeout: 60_000 })
    if (item.testId) await page.getByTestId(item.testId).waitFor({ timeout: 20_000 })
    if (item.waitFor) await page.getByText(item.waitFor, { exact: false }).first().waitFor({ timeout: 20_000 })
    const closeGuide = page.getByRole("button", { name: "关闭新手指引" })
    if (await closeGuide.count()) await closeGuide.click()
    await page.addStyleTag({ content: '[aria-label="新手指引"] { display: none !important; }' })
    await page.waitForTimeout(250)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: resolve(OUTPUT, item.file),
      type: "jpeg",
      quality: 90,
      fullPage: false,
    })
    console.log(`captured ${item.path} -> ${item.file}`)
  }
  await context.close()
} finally {
  await browser.close()
}
