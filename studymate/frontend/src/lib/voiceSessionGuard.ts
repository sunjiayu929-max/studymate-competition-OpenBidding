export class VoiceSessionGuard {
  private asrSession = 0
  private asrFailures = 0
  private pipelineRun: string | null = null

  invalidateAsr() {
    this.asrSession += 1
    return this.asrSession
  }

  currentAsrSession() {
    return this.asrSession
  }

  isCurrentAsr(session: number) {
    return session === this.asrSession
  }

  registerAsrFailure(limit = 2) {
    this.asrFailures += 1
    return {
      attempt: this.asrFailures,
      shouldRetry: this.asrFailures <= limit,
    }
  }

  resetAsrFailures() {
    this.asrFailures = 0
  }

  bindPipeline(runId: string) {
    this.pipelineRun = runId
  }

  pipelineBelongsTo(runId: string) {
    return this.pipelineRun === runId
  }

  clearPipeline(runId?: string) {
    if (runId && this.pipelineRun !== runId) return false
    this.pipelineRun = null
    return true
  }
}
