/**
 * 页面截图工具。
 *
 * 用法：npm run screenshot -- [path] [outfile] [dark]
 * 示例：npm run screenshot -- /report test-results/screenshots/report.png
 *
 * 可通过 STUDYMATE_BASE_URL 覆盖默认地址 http://localhost:5173。
 */
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { chromium } from "playwright"

const pagePath = process.argv[2] || "/"
const outputPath = process.argv[3] || "test-results/screenshots/page.png"
const dark = process.argv[4] === "dark"
const baseUrl = (process.env.STUDYMATE_BASE_URL || "http://localhost:5173").replace(/\/$/, "")

await mkdir(dirname(outputPath), { recursive: true })

let browser
try {
  browser = await chromium.launch()
} catch (error) {
  if (!error.message.includes("Executable doesn't exist")) throw error
  console.warn("Playwright Chromium 未安装，尝试使用系统 Chrome。")
  browser = await chromium.launch({ channel: "chrome" })
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: dark ? "dark" : "light",
})
const page = await context.newPage()

if (dark) {
  await page.addInitScript(() => document.documentElement.classList.add("dark"))
}

// 尝试通过演示入口获取登录态，公开页面或没有演示按钮时直接继续。
try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 15_000 })
  const demoButton = page.getByRole("button", { name: /演示|体验|demo|游客/i }).first()
  if (await demoButton.count()) {
    await demoButton.click().catch(() => {})
    await page.waitForTimeout(1_200)
  }
} catch (error) {
  console.warn("登录步骤已跳过：", error.message)
}

await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "networkidle", timeout: 15_000 })
await page.waitForTimeout(900)
await page.screenshot({ path: outputPath, fullPage: true })
console.log(`截图已保存：${outputPath}`)

await browser.close()
