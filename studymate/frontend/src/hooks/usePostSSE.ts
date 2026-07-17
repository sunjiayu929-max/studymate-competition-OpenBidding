import { fetchEventSource } from "@microsoft/fetch-event-source"
import { useCallback, useEffect, useRef, useState } from "react"
import { sseHeaders } from "@/lib/api"

/**
 * 通用 SSE 事件：event 字段透传后端的事件名（如 meta / agent_status / agent_delta / agent_done / log / done / error）。
 * data 字段：能 JSON.parse 就解析，否则保留原始字符串。
 */
export interface SSEEvent {
  event: string
  data: unknown
  raw: string
}

export type SSEStatus = "idle" | "open" | "done" | "error"

interface UsePostSSEOptions {
  onEvent?: (e: SSEEvent) => void
}

/**
 * POST 触发的 SSE 通道。
 * 标准 EventSource 不支持 POST body，所以用 @microsoft/fetch-event-source。
 */
export function usePostSSE({ onEvent }: UsePostSSEOptions = {}) {
  const [status, setStatus] = useState<SSEStatus>("idle")
  const ctrlRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (url: string, body: unknown) => {
      ctrlRef.current?.abort()
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      setStatus("open")
      let terminalEventReceived = false
      let errorEmitted = false

      try {
        await fetchEventSource(url, {
          method: "POST",
          headers: sseHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
          signal: ctrl.signal,
          openWhenHidden: true,
          onmessage(msg) {
            const eventName = msg.event || "message"
            let parsed: unknown = msg.data
            try {
              parsed = JSON.parse(msg.data)
            } catch {
              /* 非 JSON，保留字符串 */
            }
            onEvent?.({ event: eventName, data: parsed, raw: msg.data })
            if (eventName === "done") {
              terminalEventReceived = true
              setStatus("done")
            }
            if (eventName === "error") {
              terminalEventReceived = true
              errorEmitted = true
              setStatus("error")
            }
          },
          onerror(err) {
            if (ctrl.signal.aborted) throw err
            const message = err instanceof Error && err.message.trim() ? err.message : "流式连接异常，请稍后重试"
            terminalEventReceived = true
            errorEmitted = true
            setStatus("error")
            onEvent?.({ event: "error", data: message, raw: message })
            throw err  // 阻止自动重连
          },
        })
        if (!ctrl.signal.aborted && !terminalEventReceived) {
          const message = "连接提前结束，回复可能未完整生成"
          errorEmitted = true
          setStatus("error")
          onEvent?.({ event: "error", data: message, raw: message })
        }
      } catch (error) {
        if (!ctrl.signal.aborted && !errorEmitted) {
          const message = error instanceof Error && error.message.trim() ? error.message : "请求失败，请稍后重试"
          setStatus("error")
          onEvent?.({ event: "error", data: message, raw: message })
        }
      } finally {
        if (ctrlRef.current === ctrl) ctrlRef.current = null
      }
    },
    [onEvent]
  )

  const abort = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    setStatus("idle")
  }, [])

  useEffect(() => () => ctrlRef.current?.abort(), [])

  return { status, send, abort }
}
