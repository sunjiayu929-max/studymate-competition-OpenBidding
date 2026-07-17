/**
 * 埋点工具（挑战杯硬指标：使用频次 / 时长 / 任务完成）。
 *
 * 设计：
 * - 本地缓冲：track() 不立即发请求，写入内存队列；4s 定时 / beforeunload / flush() 手动 → 批量 POST /events/batch
 * - 失败容忍：网络挂时事件丢弃（演示阶段够用，不上 IndexedDB）
 * - user_id 从 userStore 读（未登录时事件 user_id=null，后端兼容）
 */
import { getCurrentUserId } from "@/store/user"

const FLUSH_INTERVAL_MS = 4000
const BATCH_SIZE = 50

interface EventPayload {
  user_id: number | null
  action: string
  target_type: string
  target_id?: string | null
  duration_ms: number
  meta: Record<string, unknown>
}

const queue: EventPayload[] = []
let timer: number | null = null

function ensureTimer() {
  if (timer != null) return
  timer = window.setInterval(() => {
    void flush()
  }, FLUSH_INTERVAL_MS)
}

export async function flush(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue.splice(0, BATCH_SIZE)
  try {
    await fetch("/api/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    })
  } catch {
    // 演示阶段：失败丢弃，不重排队（避免雪崩）
  }
}

export function track(
  action: string,
  target_type = "",
  target_id?: string | null,
  meta?: Record<string, unknown>,
  duration_ms = 0,
): void {
  queue.push({
    user_id: getCurrentUserId(),
    action,
    target_type,
    target_id: target_id || null,
    duration_ms: Math.max(0, Math.floor(duration_ms)),
    meta: meta || {},
  })
  ensureTimer()
  if (queue.length >= BATCH_SIZE) void flush()
}

// 全局：页面卸载 / 隐藏时 flush
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return
    // 用 sendBeacon 保证关页前送达
    const batch = queue.splice(0, queue.length)
    const body = new Blob([JSON.stringify({ events: batch })], { type: "application/json" })
    try {
      navigator.sendBeacon?.("/api/events/batch", body)
    } catch {
      /* ignore */
    }
  })
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush()
  })
}
