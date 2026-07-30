/**
 * 流式 TTS 句子队列。
 *
 * LLM 每来一段 delta 就 append；遇到完整句立即合成，播放当前句时预取后两句。
 * 队列严格顺序播放，支持打断，已完成的短音频按「音色 + 文本」做内存缓存。
 */
import { playBlob, synthesize, type SpeakHandle } from "@/lib/speak"
import { getCurrentVoice } from "@/store/voice"

interface QueueItem {
  text: string
  controller: AbortController
  audio?: Promise<Blob>
}

export interface TtsPipelineOptions {
  onPlaybackStart?: (text: string) => void
  onDrain?: () => void
  onError?: (error: Error) => void
  prefetch?: number
}

const audioCache = new Map<string, Blob>()
const CACHE_LIMIT = 48

function remember(key: string, blob: Blob) {
  if (audioCache.has(key)) audioCache.delete(key)
  audioCache.set(key, blob)
  while (audioCache.size > CACHE_LIMIT) {
    const oldest = audioCache.keys().next().value
    if (typeof oldest !== "string") break
    audioCache.delete(oldest)
  }
}

function sentenceParts(input: string, flush: boolean): { ready: string[]; rest: string } {
  const ready: string[] = []
  let rest = input
  const boundary = /[。！？!?；;\n]+/u

  while (rest) {
    const match = boundary.exec(rest)
    if (!match) break
    const end = (match.index ?? 0) + match[0].length
    const sentence = rest.slice(0, end).trim()
    rest = rest.slice(end)
    if (sentence) ready.push(sentence)
  }

  // 模型偶尔连续输出很长的逗号句；在自然停顿处切开，避免首句等待过久。
  while (rest.length > 82) {
    const windowText = rest.slice(0, 82)
    const comma = Math.max(windowText.lastIndexOf("，"), windowText.lastIndexOf(","))
    const cut = comma >= 28 ? comma + 1 : 72
    const sentence = rest.slice(0, cut).trim()
    if (sentence) ready.push(sentence)
    rest = rest.slice(cut)
  }

  if (flush && rest.trim()) {
    ready.push(rest.trim())
    rest = ""
  }
  return { ready, rest }
}

export class StreamingTtsPipeline {
  private readonly options: TtsPipelineOptions
  private readonly queue: QueueItem[] = []
  private buffer = ""
  private active: SpeakHandle | null = null
  private pumping = false
  private finished = false
  private cancelled = false
  private drained = false

  constructor(options: TtsPipelineOptions = {}) {
    this.options = options
  }

  append(delta: string) {
    if (this.cancelled || !delta) return
    this.buffer += delta
    const { ready, rest } = sentenceParts(this.buffer, false)
    this.buffer = rest
    this.enqueue(ready)
  }

  finish() {
    if (this.cancelled || this.finished) return
    this.finished = true
    const { ready } = sentenceParts(this.buffer, true)
    this.buffer = ""
    this.enqueue(ready)
    void this.pump()
    this.notifyDrainIfReady()
  }

  cancel() {
    if (this.cancelled) return
    this.cancelled = true
    this.active?.stop()
    this.active = null
    for (const item of this.queue) item.controller.abort()
    this.queue.length = 0
    this.buffer = ""
  }

  private enqueue(sentences: string[]) {
    for (const text of sentences) {
      const clean = text.trim()
      if (!clean) continue
      this.queue.push({ text: clean, controller: new AbortController() })
    }
    if (this.active) this.prefetch()
    void this.pump()
  }

  private prefetch() {
    const depth = Math.max(0, this.options.prefetch ?? 1)
    for (const item of this.queue.slice(1, depth + 1)) this.ensureAudio(item)
  }

  private ensureAudio(item: QueueItem) {
    if (item.audio) return
    const key = `${getCurrentVoice()}\u0000${item.text}`
    const cached = audioCache.get(key)
    item.audio = cached
      ? Promise.resolve(cached)
      : synthesize(item.text, item.controller.signal).then((blob) => {
          remember(key, blob)
          return blob
        })
    // 预取可能先于当前音频播放结束而失败；提前挂载处理器，避免浏览器报告未处理拒绝。
    void item.audio.catch(() => {})
  }

  private async pump() {
    if (this.pumping || this.cancelled) return
    this.pumping = true
    try {
      while (!this.cancelled && this.queue.length > 0) {
        const item = this.queue[0]
        this.ensureAudio(item)
        try {
          const blob = await item.audio!
          if (this.cancelled) return
          this.options.onPlaybackStart?.(item.text)
          this.active = playBlob(blob)
          // 当前段开始播放后再预取下一段，避免进入队列时同时打出多个 TTS 请求。
          this.prefetch()
          await this.active.done
        } catch (error) {
          if (!this.cancelled && (error as Error).name !== "AbortError") {
            this.options.onError?.(error as Error)
          }
        } finally {
          this.active = null
          if (this.queue[0] === item) this.queue.shift()
        }
      }
    } finally {
      this.pumping = false
      this.notifyDrainIfReady()
    }
  }

  private notifyDrainIfReady() {
    if (this.drained || this.cancelled || !this.finished || this.pumping || this.queue.length > 0) return
    this.drained = true
    this.options.onDrain?.()
  }
}

export function splitTtsSentences(text: string): string[] {
  return sentenceParts(text, true).ready
}
