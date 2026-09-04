import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { AppTopbar } from "@/components/AppTopbar"
import { RoleCapabilityProfile } from "@/components/RoleCapabilityProfile"
import { useRoleCapabilityData } from "@/hooks/useRoleCapabilityData"
import { useTrackPage } from "@/lib/useTrackPage"
import "./RoleCapabilityProfile.css"

export function RoleCapabilityProfilePage() {
  useTrackPage("capability_profile")
  const { targetRoleName, capabilities, loading } = useRoleCapabilityData()

  return (
    <main className="app-page paper-theme capability-profile-studio min-h-dvh pb-14">
      <div className="capability-profile-page-inner">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="capabilityProfile" appearance="paper" selectionLabel={targetRoleName} iconImage="/images/capability-node-analyzer-v1.png" />
        <div className="capability-profile-back">
          <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" />返回学习首页</Link>
        </div>
        <RoleCapabilityProfile targetRoleName={targetRoleName} capabilities={capabilities} loading={loading} />
      </div>
    </main>
  )
}
