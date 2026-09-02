import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import { RoleCapabilityProfile } from "@/components/RoleCapabilityProfile"
import { useRoleCapabilityData } from "@/hooks/useRoleCapabilityData"
import { useTrackPage } from "@/lib/useTrackPage"

export function RoleCapabilityProfilePage() {
  useTrackPage("capability_profile")
  const { targetRoleName, capabilities, loading } = useRoleCapabilityData()

  return (
    <main className="app-page paper-theme min-h-dvh pb-14">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="capabilityProfile" appearance="paper" />
        <div className="mb-3 mt-4">
          <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" />返回学习首页</Link>
        </div>
        <RoleCapabilityProfile targetRoleName={targetRoleName} capabilities={capabilities} loading={loading} />
      </div>
    </main>
  )
}
