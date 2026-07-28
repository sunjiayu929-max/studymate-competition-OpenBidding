/**
 * TTS 口型响度表（绝不劫持 / 阻塞播放）。
 *
 * 只读 HTMLAudioElement.currentTime，用合成包络驱动 idle/speak/open。
 * 不创建 MediaElementSource、不 decodeAudioData，避免：
 * - AudioContext suspended 导致无声
 * - 解码 await 期间被 ASR 打断而跳过 play
 */
export type LevelListener = (level: number) => void

export class AudioLevelMeter {
  private audio: HTMLAudioElement | null = null
  private raf = 0
  private level = 0
  private readonly listeners = new Set<LevelListener>()

  subscribe(listener: LevelListener): () => void {
    this.listeners.add(listener)
    listener(this.level)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getLevel(): number {
    return this.level
  }

  /** 兼容旧调用：立即返回，不做任何重活。 */
  async prepareFromBlob(_blob?: Blob): Promise<void> {
    void _blob
    return
  }

  /** 绑定正在播放的 audio；不改输出路由。 */
  attach(audio: HTMLAudioElement): void {
    this.audio = audio
    this.startLoop()
  }

  detach(): void {
    this.stopLoop()
    this.audio = null
    this.setLevel(0)
  }

  dispose(): void {
    this.detach()
    this.listeners.clear()
  }

  private startLoop(): void {
    this.stopLoop()
    const tick = () => {
      this.raf = requestAnimationFrame(tick)
      this.sample()
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private sample(): void {
    const audio = this.audio
    if (!audio || audio.paused || audio.ended || audio.volume === 0) {
      const decayed = this.level * 0.5
      this.setLevel(decayed < 0.01 ? 0 : decayed)
      return
    }
    // 多层正弦合成「说话」节奏：大部分时间在 speak，偶尔 open，句间微顿
    const t = audio.currentTime
    const syll = Math.abs(Math.sin(t * 12.5)) // 音节感
    const phrase = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.3))
    const micro = 0.75 + 0.25 * Math.sin(t * 31)
    // 每 ~1.8s 一个很短的近静音，像换气
    const breath = Math.sin(t * 3.5) > 0.92 ? 0.05 : 1
    const raw = syll * phrase * micro * breath
    const target = Math.min(1, 0.08 + raw * 0.9)
    this.setLevel(this.level * 0.35 + target * 0.65)
  }

  private setLevel(v: number): void {
    const level = Math.max(0, Math.min(1, v))
    if (Math.abs(level - this.level) < 0.004 && !(level === 0 && this.level !== 0)) return
    this.level = level
    for (const listener of this.listeners) listener(level)
  }
}
