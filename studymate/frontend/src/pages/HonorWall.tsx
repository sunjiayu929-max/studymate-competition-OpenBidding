import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Award, BadgeCheck, CalendarDays, Download, Eye, Loader2, ShieldCheck, Sparkles } from "lucide-react"

import certificateBackground from "@/assets/certificate/studymate-certificate-bg.png"
import { AppTopbar } from "@/components/AppTopbar"
import { RoleCertificateModal } from "@/components/RoleCertificateModal"
import {
  ensureDemoCertificates,
  formatCertificateDate,
  listUserCertificates,
  syncEarnedCertificates,
  type RoleCertificateRecord,
} from "@/lib/certificates"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"

import "./HonorWall.css"

export function HonorWall() {
  useTrackPage("honor_wall")
  const user = useCurrentUser()
  const [selected, setSelected] = useState<RoleCertificateRecord | null>(null)
  const [syncing, setSyncing] = useState(true)
  const [certificates, setCertificates] = useState<RoleCertificateRecord[]>(() => {
    if (!user) return []
    ensureDemoCertificates(user.user_id, user.name)
    return listUserCertificates(user.user_id, user.name)
  })
  const userId = user?.user_id
  const learnerName = user?.name ?? ""

  const refreshCertificates = useCallback(() => {
    if (userId) ensureDemoCertificates(userId, learnerName)
    setCertificates(userId ? listUserCertificates(userId, learnerName) : [])
  }, [userId, learnerName])

  useEffect(() => {
    refreshCertificates()
    if (!userId) {
      setSyncing(false)
      return
    }

    let active = true
    setSyncing(true)
    syncEarnedCertificates(userId, learnerName)
      .then((records) => {
        if (active) setCertificates(records)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSyncing(false)
      })
    return () => {
      active = false
    }
  }, [refreshCertificates, userId, learnerName])

  const roleCount = new Set(certificates.map((record) => record.roleId)).size
  const latestIssuedAt = certificates[0]?.issuedAt
  const unlocked = certificates.length > 0

  return (
    <main className="honors-v2 app-page paper-theme min-h-dvh pb-16">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 lg:px-7">
        <AppTopbar
          current="honor"
          appearance="paper"
          labelOverride="我的荣誉墙"
          groupOverride="成果认证中心"
          iconImage="/images/honors-certification-vault-v1.png"
        />

        <section className="honors-v2-summary" aria-label="荣誉成果概览">
          <div className="honors-v2-summary-copy">
            <span className="honors-v2-summary-icon" aria-hidden="true"><Award /></span>
            <div>
              <small>个人学习成果</small>
              <strong>{unlocked ? `已获得 ${certificates.length} 张岗位证书` : "第一张证书等待点亮"}</strong>
              <p>{unlocked ? "点击任一证书即可查看完整奖状并下载。" : "完成岗位训练和综合验收后，证书会自动归档到这里。"}</p>
            </div>
          </div>

          <div className="honors-v2-summary-stats" aria-label="荣誉统计">
            <SummaryStat label="证书" value={`${certificates.length}`} suffix="张" />
            <SummaryStat label="完成岗位" value={`${roleCount}`} suffix="个" />
            <SummaryStat label="最近认证" value={latestIssuedAt ? formatCertificateDate(latestIssuedAt) : "暂无"} compact />
          </div>

          <div className={`honors-v2-sync ${syncing ? "is-syncing" : unlocked ? "is-ready" : ""}`} role="status" aria-live="polite">
            {syncing ? <Loader2 aria-hidden="true" /> : unlocked ? <BadgeCheck aria-hidden="true" /> : <Award aria-hidden="true" />}
            <span>{syncing ? "正在核验新成果" : unlocked ? "成果已同步" : "等待成果解锁"}</span>
          </div>
        </section>

        <section className="honors-v2-wall" aria-labelledby="honors-wall-title">
          <div className="honors-v2-wall-heading">
            <div>
              <small>HONOR COLLECTION</small>
              <h2 id="honors-wall-title">证书墙</h2>
            </div>
            {unlocked && <span>{certificates.length} 项成果</span>}
          </div>

          {unlocked ? (
            <div className="honors-v2-cards">
              {certificates.map((record, index) => (
                <CertificateCard
                  key={`${record.roleId}:${record.serial}`}
                  record={record}
                  index={index}
                  onOpen={() => setSelected(record)}
                />
              ))}
            </div>
          ) : syncing ? (
            <div className="honors-v2-loading" role="status">
              <Loader2 aria-hidden="true" />
              <strong>正在核验你的学习成果</strong>
              <span>已获得的证书将在同步完成后显示。</span>
            </div>
          ) : (
            <div className="honors-v2-empty">
              <span aria-hidden="true"><Award /></span>
              <h3>完成第一次岗位训练，点亮你的荣誉墙</h3>
              <p>通过全部训练轮次和综合验收后，系统会自动签发可下载的岗位学习证书。</p>
              <Link to="/competency">开始岗位训练<Sparkles aria-hidden="true" /></Link>
            </div>
          )}
        </section>
      </div>

      {selected && (
        <RoleCertificateModal
          open
          learnerName={selected.learnerName}
          roleName={selected.roleName}
          roleId={selected.roleId}
          userId={selected.userId}
          completedRounds={selected.completedRounds}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}

function CertificateCard({
  record,
  index,
  onOpen,
}: {
  record: RoleCertificateRecord
  index: number
  onOpen: () => void
}) {
  const tones = ["is-gold", "is-blue", "is-cyan"]
  return (
    <motion.article
      className={`honors-v2-card ${tones[index % tones.length]}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      whileHover={{ y: -4 }}
    >
      <span className="honors-v2-card-no">{String(index + 1).padStart(2, "0")}</span>
      <button type="button" onClick={onOpen} aria-label={`查看${record.roleName}岗位证书`}>
        <div className="honors-v2-certificate">
          <img src={certificateBackground} alt="" aria-hidden="true" />
          <div>
            <small>因材智训 · VERIFIED</small>
            <h3>岗位学习荣誉证书</h3>
            <i />
            <strong>{record.learnerName}</strong>
            <p>完成「{record.roleName}」岗位全部学习内容与综合验收</p>
          </div>
          <span aria-hidden="true">✓</span>
        </div>
        <div className="honors-v2-card-meta">
          <div>
            <span><ShieldCheck aria-hidden="true" />已认证</span>
            <strong>{record.roleName}</strong>
            <small><CalendarDays aria-hidden="true" />{formatCertificateDate(record.issuedAt)} · {record.completedRounds} 轮训练</small>
          </div>
          <span className="honors-v2-view"><Eye aria-hidden="true" />查看 / 下载<Download aria-hidden="true" /></span>
        </div>
      </button>
    </motion.article>
  )
}

function SummaryStat({
  label,
  value,
  suffix,
  compact = false,
}: {
  label: string
  value: string
  suffix?: string
  compact?: boolean
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={compact ? "compact" : ""}>{value}{suffix && <small>{suffix}</small>}</strong>
    </div>
  )
}
