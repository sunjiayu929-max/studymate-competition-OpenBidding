import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const source = (path) => readFileSync(resolve(root, path), "utf8")

const voiceTutor = source("src/pages/VoiceTutor.tsx")
const voiceHistory = source("src/store/voiceTutorHistory.ts")
const generation = source("src/store/tutorGeneration.ts")

assert.match(
  voiceTutor,
  /useVoiceTutorHistory\(USER_ID, courseId\)/u,
  "voice page must subscribe to its dedicated history",
)
assert.match(
  voiceTutor,
  /historySink: voiceTutorHistory/u,
  "voice generation output must be written to the voice-only history",
)
assert.match(
  voiceTutor,
  /voiceTutorHistory\.clear\(USER_ID, courseId\)/u,
  "clearing the voice page must only clear voice history",
)
assert.doesNotMatch(
  voiceTutor,
  /\b(useTutorHistory|tutorHistory)\b/u,
  "voice page must not read or mutate text-tutor history",
)
assert.match(voiceTutor, /数字讲师会话/u, "the isolated conversation needs an explicit title")
assert.match(
  voiceTutor,
  /独立保存，不与文字助教记录混合/u,
  "the page must explain the history boundary",
)

assert.match(
  voiceHistory,
  /sm:voice-tutor-history/u,
  "voice history must use a distinct persistence namespace",
)
assert.match(
  voiceHistory,
  /u\$\{uid\}:c\$\{courseId \?\? 0\}/u,
  "voice history must remain isolated per user and course",
)

assert.match(
  generation,
  /historySink\?: TutorGenerationHistorySink/u,
  "shared generation must accept an explicit history destination",
)
assert.match(
  generation,
  /historySink = tutorHistory/u,
  "text tutor must retain its existing history destination by default",
)
assert.match(
  generation,
  /this\.historySinks\.get\(runId\) \?\? tutorHistory/u,
  "each generation result must resolve the destination captured for that run",
)

console.log("Voice/text tutor history isolation checks passed.")
