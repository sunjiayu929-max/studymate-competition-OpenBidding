/**
 * 给业务页注册当前上下文（AI 助教浮动小精灵会读取）。
 * 用法：
 *   useTutorContext({ page: "workspace_detail", title: "K-Means 讲解", topic: "K-Means" })
 *
 * - 依赖任意字段变化会自动更新
 * - unmount 时清空（避免跳页后助教读到旧 context）
 */
import { useEffect } from "react"
import { setTutorPageContext, type TutorPageContext } from "@/store/tutorContext"

export function useTutorContext(ctx: TutorPageContext | null) {
  // 用稳定的 JSON 串作 dep 避免对象 ref 每次新建
  const dep = JSON.stringify(ctx ?? null)
  useEffect(() => {
    setTutorPageContext(ctx)
    return () => {
      setTutorPageContext(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep])
}
