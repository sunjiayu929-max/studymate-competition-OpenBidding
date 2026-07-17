/**
 * 页面停留埋点 hook。
 *
 * 用法：在每个 page 组件顶层 `useTrackPage("home")`，挂载时上报 page_enter，
 * 卸载时上报 page_leave + duration_ms（毫秒级停留时长）。
 *
 * 注意：开发模式 StrictMode 会双 mount，所以用 ref 防重复上报 leave。
 */
import { useEffect, useRef } from "react"
import { track } from "./track"

export function useTrackPage(pageId: string, meta?: Record<string, unknown>) {
  const startedAt = useRef<number>(0)
  const reported = useRef<boolean>(false)

  useEffect(() => {
    startedAt.current = Date.now()
    reported.current = false
    track("page_enter", "page", pageId, meta)

    return () => {
      if (reported.current) return
      reported.current = true
      const dur = Date.now() - startedAt.current
      track("page_leave", "page", pageId, meta, dur)
    }
    // pageId 改变时也算重新进入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])
}
