import assert from "node:assert/strict"
import { prepareSpeechText } from "../src/lib/speechText.ts"
import { VoiceSessionGuard } from "../src/lib/voiceSessionGuard.ts"

const guard = new VoiceSessionGuard()

// 连续五轮：每轮都有独立 TTS run，结束后回到新的 ASR session。
for (let round = 1; round <= 5; round += 1) {
  const runId = `voice-round-${round}`
  guard.bindPipeline(runId)
  assert.equal(guard.pipelineBelongsTo(runId), true)
  assert.equal(guard.clearPipeline(runId), true)
  const session = guard.invalidateAsr()
  assert.equal(guard.isCurrentAsr(session), true)
}

// 旧轮回调不能清空新一轮播放管线。
guard.bindPipeline("stale-round")
guard.bindPipeline("current-round")
assert.equal(guard.clearPipeline("stale-round"), false)
assert.equal(guard.pipelineBelongsTo("current-round"), true)

// 播放中打断后，旧 ASR 回调失效，新监听 session 生效。
const interruptedSession = guard.currentAsrSession()
const resumedSession = guard.invalidateAsr()
assert.equal(guard.isCurrentAsr(interruptedSession), false)
assert.equal(guard.isCurrentAsr(resumedSession), true)
guard.clearPipeline("current-round")

// ASR 异常只自动重连两次，成功或手动重试后清零。
assert.deepEqual(guard.registerAsrFailure(), { attempt: 1, shouldRetry: true })
assert.deepEqual(guard.registerAsrFailure(), { attempt: 2, shouldRetry: true })
assert.deepEqual(guard.registerAsrFailure(), { attempt: 3, shouldRetry: false })
guard.resetAsrFailures()
assert.deepEqual(guard.registerAsrFailure(), { attempt: 1, shouldRetry: true })

// 文字/语音切换：文字模式没有语音管线，返回语音时只绑定新 run。
guard.clearPipeline()
assert.equal(guard.pipelineBelongsTo("text-mode"), false)
guard.bindPipeline("voice-after-text")
assert.equal(guard.pipelineBelongsTo("voice-after-text"), true)

// 展示公式必须保留正文，不能被替换成笼统的“数学公式”。
const formula = prepareSpeechText("更新：$$\\theta \\leftarrow \\theta - \\eta$$")
assert.equal(formula.includes("\\theta \\leftarrow \\theta - \\eta"), true)
assert.equal(formula.includes("数学公式"), false)

console.log("voice-session-check: 5 rounds, interruption, stale callbacks, ASR reconnect, mode switch, formula preservation OK")
