import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { chromium } from "playwright"

const BASE_URL = process.env.STUDYMATE_LANDING_URL || "http://127.0.0.1:4173/landing/index.html"
const OUTPUT = resolve("test-results/screenshots")
const sizes = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-short", width: 1280, height: 720 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-landscape", width: 844, height: 390 },
]

await mkdir(OUTPUT, { recursive: true })
let browser
try {
  browser = await chromium.launch({ channel: "chrome", headless: true })
} catch {
  browser = await chromium.launch({ channel: "msedge", headless: true })
}

try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: size, colorScheme: "light" })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(BASE_URL, { waitUntil: "networkidle" })
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
      title: document.title,
      hero: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
      primaryVisible: Boolean(document.querySelector(".hero .primary")?.getBoundingClientRect().height),
    }))
    if (result.overflow > 1) throw new Error(`${size.name} 横向溢出 ${result.overflow}px`)
    if (result.brokenImages.length) throw new Error(`${size.name} 图片失败：${result.brokenImages.join(", ")}`)
    if (!result.primaryVisible || !result.hero?.includes("真实岗位")) throw new Error(`${size.name} 首屏关键内容缺失`)
    if (errors.length) throw new Error(`${size.name} 页面错误：${errors.join(" | ")}`)
    if (size.name === "desktop-1440" || size.name === "mobile-390") {
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(360, innerHeight * .72)) {
          window.scrollTo(0, y)
          await new Promise((resolveScroll) => setTimeout(resolveScroll, 70))
        }
        document.querySelectorAll(".reveal").forEach((item) => item.classList.add("show"))
        document.querySelectorAll("img[loading='lazy']").forEach((image) => { image.loading = "eager" })
        window.scrollTo(0, 0)
      })
      await page.waitForLoadState("networkidle")
      await page.evaluate(() => Promise.all([...document.images].map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolveImage) => {
            image.addEventListener("load", resolveImage, { once: true })
            image.addEventListener("error", resolveImage, { once: true })
          }))))
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: resolve(OUTPUT, `landing-${size.name}.png`), fullPage: size.name === "desktop-1440" || size.name === "mobile-390" })
    console.log(`${size.name} ok overflow=${result.overflow}`)
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "暂停动态" }).click()
  if ((await page.getByRole("button", { name: "播放动态" }).getAttribute("aria-pressed")) !== "true") {
    throw new Error("动效开关状态未同步")
  }
  await page.reload({ waitUntil: "networkidle" })
  await page.keyboard.press("Tab")
  const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains("skip"))
  if (!skipFocused) throw new Error("跳转主要内容链接不可键盘聚焦")
  await context.close()
  console.log("landing visual checks ok")

  const detailContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" })
  const detailPage = await detailContext.newPage()
  await detailPage.goto(BASE_URL, { waitUntil: "networkidle" })
  await detailPage.evaluate(() => {
    document.querySelectorAll(".reveal").forEach((item) => item.classList.add("show"))
    document.querySelectorAll("img[loading='lazy']").forEach((image) => { image.loading = "eager" })
  })
  for (const section of ["roles", "loop", "proof", "readiness"]) {
    const locator = detailPage.locator(`#${section}`)
    await locator.scrollIntoViewIfNeeded()
    await detailPage.waitForTimeout(400)
    await locator.screenshot({ path: resolve(OUTPUT, `landing-section-${section}.png`) })
  }
  await detailContext.close()
} finally {
  await browser.close()
}
