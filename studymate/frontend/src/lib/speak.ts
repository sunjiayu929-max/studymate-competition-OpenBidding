/**
 * 可编程语音播放（讲课模式用）。
 * ------------------------------------------------------------------
 * SpeakerButton 是「点一下念一段」的 UI 组件，状态封在内部、不便程序驱动。
 * 讲课模式需要「念完这一步 → 自动走下一步」，所以抽出这个纯函数：
 *   const h = speak(text); await h.done; // 念完了，推进
 *   h.stop();                            // 暂停/打断
 *
 * 复用 /api/voice/tts 拿 mp3；具体合成引擎由后端 TTS_ENGINE 决定（当前为阿里 CosyVoice，
 * 复用 QWEN/DashScope key；讯飞为备选）——前端无感知、不挑引擎。
 * 模块级单例锁保证同一时刻只有一段在播。
 */
import { sseHeaders } from "@/lib/api"
import { getCurrentVoice } from "@/store/voice"

export interface SpeakHandle {
  /** 停止播放并中断合成请求（done 会随之 resolve） */
  stop: () => void
  /** 播放自然结束或被 stop 时 resolve；合成/播放出错时 reject */
  done: Promise<void>
}

// 同一时刻只允许一段语音在播：开新的先停旧的
let currentStop: (() => void) | null = null
// 当前在播的 audio 元素 + 全局音量（讲课播放器的音量/暂停控制用）
let currentAudioEl: HTMLAudioElement | null = null
let currentVolume = 1

/** 设音量（0~1），并立即作用于正在播放的那段。 */
export function setSpeakVolume(v: number) {
  currentVolume = Math.max(0, Math.min(1, v))
  if (currentAudioEl) currentAudioEl.volume = currentVolume
}
export function getSpeakVolume(): number {
  return currentVolume
}
/** 暂停当前朗读（讲课「暂停」用；narrate 的 await 会一直挂起到 resume 念完）。 */
export function pauseSpeak() {
  if (currentAudioEl) try { currentAudioEl.pause() } catch { /* ignore */ }
}
/** 继续朗读。 */
export function resumeSpeak() {
  if (currentAudioEl) currentAudioEl.play().catch(() => {})
}

function clean(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "（此处省略代码块）")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, "（数学公式）")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 只合成、不播放：把文字转成音频 blob（讲课模式开场一次性预生成全部句子用）。失败抛错。
 *  带超时：某次 TTS 请求若长时间不返回（后端/限流卡住），25s 后中断抛错 → 上层走兜底，避免「深度思考中」永久挂起。 */
export async function synthesize(rawText: string): Promise<Blob> {
  const text = clean(rawText || "")
  if (!text) throw new Error("empty text")
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const r = await fetch("/api/voice/tts", {
      method: "POST",
      headers: sseHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text, voice: getCurrentVoice() }),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => "")
      throw new Error(`TTS ${r.status}: ${detail.slice(0, 120)}`)
    }
    return await r.blob()
  } finally {
    clearTimeout(timer)
  }
}

/** 播放一段预生成好的音频 blob（拍间零网络等待 → 连贯）。语义与 speak() 一致。
 *  带「看门狗」：只靠 onended 容易卡死（坏 blob/限流残缺音频/解码停滞时 ended 永不触发 → 讲课卡在半路）。
 *  看门狗每 0.5s 检查：非暂停状态下进度连续 ~4s 不前进、或已播到结尾却没触发 ended → 兜底结束，保证 done 一定 resolve。 */
export function playBlob(blob: Blob): SpeakHandle {
  if (currentStop) currentStop()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.volume = currentVolume
  currentAudioEl = audio
  let stopped = false
  let settled = false
  let wd: ReturnType<typeof setInterval> | undefined
  let resolveDone: () => void = () => {}
  let rejectDone: (e: Error) => void = () => {}

  const cleanup = () => {
    if (wd) { clearInterval(wd); wd = undefined }
    try { audio.pause() } catch { /* ignore */ }
    audio.src = ""
    URL.revokeObjectURL(url)
    if (currentAudioEl === audio) currentAudioEl = null
    if (currentStop === stop) currentStop = null
  }
  const finish = (ok: boolean, err?: Error) => {
    if (settled) return
    settled = true
    cleanup()
    if (ok) resolveDone()
    else rejectDone(err || new Error("audio error"))
  }
  const stop = () => {
    stopped = true
    finish(true) // 被打断/暂停退出视为正常结束，done resolve
  }
  currentStop = stop

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
    audio.onended = () => finish(true)
    audio.onerror = () => finish(stopped, stopped ? undefined : new Error("audio playback error"))
    audio.play().catch((e) => finish(stopped, stopped ? undefined : (e as Error)))
    // 看门狗
    let last = -1
    let stalls = 0
    wd = setInterval(() => {
      if (settled) return
      if (audio.paused) { stalls = 0; return } // 用户暂停：不计，等继续
      const t = audio.currentTime
      const dur = audio.duration
      if (Number.isFinite(dur) && dur > 0 && t >= dur - 0.15) { finish(true); return } // 实际放完但 ended 没来
      if (Math.abs(t - last) < 0.02) { if (++stalls >= 8) finish(true) } // 连续 ~4s 没前进 = 卡死
      else { stalls = 0; last = t }
    }, 500)
  })
  return { stop, done }
}

export function speak(rawText: string): SpeakHandle {
  // 打断上一段
  if (currentStop) currentStop()

  const text = clean(rawText || "")
  const ctrl = new AbortController()
  let audio: HTMLAudioElement | null = null
  let url: string | null = null
  let stopped = false

  const cleanup = () => {
    if (audio) {
      try { audio.pause() } catch { /* ignore */ }
      audio.src = ""
      if (currentAudioEl === audio) currentAudioEl = null
      audio = null
    }
    if (url) {
      URL.revokeObjectURL(url)
      url = null
    }
    if (currentStop === stop) currentStop = null
  }

  const stop = () => {
    stopped = true
    ctrl.abort()
    cleanup()
  }
  currentStop = stop

  const done = new Promise<void>((resolve, reject) => {
    if (!text) {
      cleanup()
      resolve()
      return
    }
    void (async () => {
      try {
        const r = await fetch("/api/voice/tts", {
          method: "POST",
          headers: sseHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ text, voice: getCurrentVoice() }),
          signal: ctrl.signal,
        })
        if (!r.ok) {
          const detail = await r.text().catch(() => "")
          throw new Error(`TTS ${r.status}: ${detail.slice(0, 120)}`)
        }
        const blob = await r.blob()
        if (stopped) {
          cleanup()
          resolve()
          return
        }
        url = URL.createObjectURL(blob)
        audio = new Audio(url)
        audio.volume = currentVolume
        currentAudioEl = audio
        audio.onended = () => {
          cleanup()
          resolve()
        }
        audio.onerror = () => {
          cleanup()
          reject(new Error("audio playback error"))
        }
        await audio.play()
      } catch (e) {
        cleanup()
        if ((e as Error).name === "AbortError" || stopped) {
          resolve()
          return
        }
        reject(e as Error)
      }
    })()
  })

  return { stop, done }
}
