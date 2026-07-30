import assert from "node:assert/strict"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const assetsDir = new URL("../dist/assets/", import.meta.url)
const publicDir = new URL("../public/", import.meta.url)
const assets = readdirSync(assetsDir).filter((name) => name.endsWith(".js"))

function routeSize(prefix) {
  const name = assets.find((item) => item.startsWith(`${prefix}-`))
  assert.ok(name, `missing route chunk: ${prefix}`)
  return { name, bytes: statSync(new URL(name, assetsDir)).size }
}

const budgets = {
  ConceptPlayer: 32 * 1024,
  PptGenerator: 30 * 1024,
  KnowledgeBase: 25 * 1024,
  Tests: 45 * 1024,
}

const report = Object.entries(budgets).map(([prefix, budget]) => {
  const result = routeSize(prefix)
  assert.ok(result.bytes <= budget, `${result.name} is ${result.bytes} bytes; budget is ${budget}`)
  return `${prefix}=${(result.bytes / 1024).toFixed(1)}KiB`
})

const pptxRuntime = assets.find((name) => name.startsWith("pptxgen.es-"))
assert.ok(pptxRuntime, "PPTX runtime must remain a separate lazy chunk")
assert.ok(statSync(new URL(pptxRuntime, assetsDir)).size <= 450 * 1024, "PPTX runtime exceeded regression budget")

function walk(directory) {
  const entries = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    const stat = statSync(path)
    if (stat.isDirectory()) entries.push(...walk(path))
    else entries.push({ path, bytes: stat.size })
  }
  return entries
}

const publicFiles = walk(fileURLToPath(publicDir))
const largestRaster = publicFiles
  .filter((item) => /\.(png|jpe?g|webp|avif)$/i.test(item.path))
  .sort((a, b) => b.bytes - a.bytes)[0]
assert.ok(largestRaster && largestRaster.bytes <= 600 * 1024, "published raster exceeded the phase-3 600 KiB ceiling")

const heroWebps = publicFiles.filter((item) => /studymate-campus-hero-\d+\.webp$/i.test(item.path))
assert.equal(heroWebps.length, 2, "landing hero must keep two responsive WebP sizes")
assert.ok(heroWebps.every((item) => item.bytes <= 90 * 1024), "landing hero WebP exceeded 90 KiB")

const digitalHumanWebps = publicFiles.filter((item) => /studymate-tutor-(idle|listening|thinking|speaking)-(320|640)\.webp$/i.test(item.path))
assert.equal(digitalHumanWebps.length, 8, "digital-human states must keep 320w/640w WebP variants")
assert.ok(digitalHumanWebps.every((item) => item.bytes <= 80 * 1024), "digital-human WebP exceeded 80 KiB")

console.log(
  `build-budget-check: ${report.join(", ")}; pptx runtime lazy; largest raster=${(largestRaster.bytes / 1024).toFixed(1)}KiB`,
)
