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
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="capabilityProfile" appearance="paper" labelOverride="岗位能力画像" groupOverride="能力雷达 · 岗位节点" selectionLabel={targetRoleName} iconImage="/images/capability-node-analyzer-v1.png" showRocketFormation rocketVariant="honor" />
        <div className="capability-profile-back mb-3 mt-4">
          <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-[#66717B] hover:bg-[#E7EDF3] hover:text-[#315E83]"><ArrowLeft className="size-3.5" />返回学习首页</Link>
        </div>
        <RoleCapabilityProfile targetRoleName={targetRoleName} capabilities={capabilities} loading={loading} />
      </div>
    </main>
  )
}
