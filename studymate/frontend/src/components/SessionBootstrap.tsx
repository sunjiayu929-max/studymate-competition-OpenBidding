import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"

import App from "@/App"
import { apiGet } from "@/lib/api"
import { setCurrentUser, type CurrentUser } from "@/store/user"

export function SessionBootstrap() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    apiGet<CurrentUser | null>("/auth/me")
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="app-page paper-theme grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm rounded-[26px] border border-[#CFC8B9] bg-[#FFFEFA] p-7 text-center shadow-[0_18px_45px_rgba(24,35,45,.08)]">
          <div className="relative mx-auto grid size-14 place-items-center rounded-[20px] border border-[#315E83] bg-[#244C66] text-[#F0D6A4] shadow-[0_14px_32px_rgba(36,76,102,.2)]">
            <Sparkles className="size-6" />
            <span className="absolute inset-[-7px] animate-pulse rounded-[25px] border border-[#9FB1BC]/60" />
          </div>
          <div className="mt-5 text-sm font-bold tracking-[-0.025em] text-[#18232D]">StudyMate</div>
          <div className="mt-1 text-xs text-[#66717B]">正在核对登录状态与学习进度…</div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#ECE8DE]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[#6F8A69]" />
          </div>
          <p className="mt-3 text-[10px] font-medium text-[#8A8172]">目标岗位、画像与历史记录将在校验完成后恢复</p>
        </div>
      </div>
    )
  }

  return <App />
}
