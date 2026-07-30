import assert from "node:assert/strict"

import { estimateNarrationMs, resolveLectureSeek } from "../src/lib/lectureTimeline.ts"

assert.equal(estimateNarrationMs("四个汉字"), 1000)
assert.deepEqual(resolveLectureSeek([1000, 2000, 1500], 0), { beatIndex: 0, offsetMs: 0 })
assert.deepEqual(resolveLectureSeek([1000, 2000, 1500], 999), { beatIndex: 0, offsetMs: 999 })
assert.deepEqual(resolveLectureSeek([1000, 2000, 1500], 1000), { beatIndex: 1, offsetMs: 0 })
assert.deepEqual(resolveLectureSeek([1000, 2000, 1500], 3200), { beatIndex: 2, offsetMs: 200 })
assert.deepEqual(resolveLectureSeek([1000, 2000, 1500], 9999), { beatIndex: 2, offsetMs: 6999 })

console.log("phase2-timeline-check: duration estimate and beat-boundary seek mapping OK")
