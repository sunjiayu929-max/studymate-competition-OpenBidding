import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const source = (path) => readFileSync(new URL(path, root), "utf8")
const file = (path) => fileURLToPath(new URL(path, root))

const states = ["idle", "listening", "thinking", "speaking", "paused"]
const mediaContract = source("src/lib/digitalHuman.ts")
for (const state of states) {
  assert.match(mediaContract, new RegExp(`${state}:\\s*\\{`, "u"), `missing digital-human state: ${state}`)
}

for (const state of states.filter((item) => item !== "paused")) {
  for (const width of [320, 640]) {
    const path = `public/digital-human/studymate-tutor-${state}-${width}.webp`
    assert.ok(statSync(file(path)).size <= 80 * 1024, `${path} exceeded 80 KiB`)
  }
}

const mediaPlayer = source("src/components/DigitalHumanMedia.tsx")
assert.match(mediaPlayer, /AnimatePresence/u)
assert.match(mediaPlayer, /prefers|useReducedMotion/u)
assert.match(mediaPlayer, /srcSet/u)

const tutorBubble = source("src/components/TutorBubble.tsx")
const voiceTutor = source("src/pages/VoiceTutor.tsx")
assert.match(tutorBubble, /DigitalHumanMedia/u)
assert.match(voiceTutor, /DigitalHumanMedia/u)
assert.match(voiceTutor, /只有用户明确点击后才申请麦克风/u)
assert.doesNotMatch(voiceTutor, /进页面自动启 ASR/u)

const demo = source("src/components/JudgeDemoMode.tsx")
assert.match(demo, /sessionStorage/u)
assert.match(demo, /setCurrentCourse\(originalCourse\)/u)
assert.match(demo, /演示降级/u)
assert.match(demo, /STEPS\.length/u)

const landing = source("public/landing/index.html")
assert.match(landing, /studymate-campus-hero-960\.webp/u)
assert.match(landing, /studymate-campus-hero-1600\.webp/u)
assert.match(landing, /loading="lazy"/u)

console.log("phase3-ui-check: 5-state media contract, responsive WebP assets, user-gesture voice policy, isolated judge demo, and landing image wiring PASS")
