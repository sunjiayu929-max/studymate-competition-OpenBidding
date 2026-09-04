import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Award, BadgeCheck, CalendarDays, Download, Eye, Loader2, ShieldCheck, Sparkles } from "lucide-react"
import certificateBackground from "@/assets/certificate/studymate-certificate-bg.png"
import { AppTopbar } from "@/components/AppTopbar"
import { RoleCertificateModal } from "@/components/RoleCertificateModal"
import { formatCertificateDate, ensureDemoCertificates, listUserCertificates, syncEarnedCertificates, type RoleCertificateRecord } from "@/lib/certificates"
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
    if (!userId) { setSyncing(false); return }
    let active = true
    setSyncing(true)
    syncEarnedCertificates(userId, learnerName).then((records) => { if (active) setCertificates(records) }).catch(() => undefined).finally(() => { if (active) setSyncing(false) })
    return () => { active = false }
  }, [refreshCertificates, userId, learnerName])
  const roleCount = new Set(certificates.map((record) => record.roleId)).size
  const latestIssuedAt = certificates[0]?.issuedAt
  const unlocked = certificates.length > 0

  return <main className="honors-v2 app-page paper-theme min-h-dvh pb-16"><div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 lg:px-7">
    <AppTopbar current="honor" appearance="paper" labelOverride="我的荣誉墙" groupOverride="成果认证中心" statusLabel={syncing ? "正在核验新成果" : unlocked ? `${certificates.length} 项荣誉已点亮` : "等待首项荣誉"} iconImage="/images/honors-certification-vault-v1.png" showRocketFormation rocketVariant="honor" />
    <motion.section className={`honors-v2-hero honors-v2-hero-compact ${syncing ? "is-running" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
      <div className="honors-v2-live"><span /><b>MY HONOR WALL</b><small>学习成果与岗位认证档案</small><em>{syncing ? "正在核验新成果" : unlocked ? "认证库已同步" : "等待成果解锁"}</em></div>
      <div className="honors-v2-overview">
        <div className="honors-v2-overview-title"><span><img src="/images/honors-reward-medal-web-v1.png" alt="" aria-hidden="true" /></span><div><small>荣誉认证中心</small><h1>我的荣誉墙</h1><p>所有已解锁证书都在下方，点击即可查看或下载。</p></div></div>
        <div className="honors-v2-overview-stats"><HeroStat label="已获证书" value={`${certificates.length}`} suffix="张" /><HeroStat label="完成岗位" value={`${roleCount}`} suffix="个" /><HeroStat label="最近认证" value={latestIssuedAt ? formatCertificateDate(latestIssuedAt).replace(/年|月/g, ".").replace("日", "") : "WAIT"} compact /></div>
        <div className="honors-v2-overview-actions">{certificates[0] ? <button type="button" onClick={() => setSelected(certificates[0])} aria-label={`查看最近证书：${certificates[0].roleName}`}><img className="honors-v2-action-object" src="/images/training-acceptance-beacon-v1.png" alt="" aria-hidden="true" /><span><small>最近获得</small><strong>{certificates[0].roleName}</strong></span></button> : <Link to="/competency"><img className="honors-v2-action-object" src="/images/training-acceptance-beacon-v1.png" alt="" aria-hidden="true" /><span><small>暂无证书</small><strong>完成训练解锁荣誉</strong></span></Link>}<Link to="/competency" className="is-primary"><img className="honors-v2-action-object is-route" src="/images/courses-career-route-compass-v1.png" alt="" aria-hidden="true" /><span>继续岗位训练</span></Link></div>
      </div>
      <div className="honors-v2-stage"><span />{["完成训练", "通过验收", "签发证书", "收入荣誉墙"].map((label, index) => <div className={index < (unlocked ? 4 : syncing ? 3 : 1) ? "is-done" : ""} key={label}><i>{String(index + 1).padStart(2, "0")}</i><b>{label}</b></div>)}</div>
    </motion.section>
    <HonorTransit compact label="VERIFIED INTAKE · 签发成果进入荣誉墙" />
    <section className="honors-v2-longform"><Header syncing={syncing} count={certificates.length} />
      {unlocked ? <div className="honors-v2-cards">{certificates.map((record, index) => <CertificateCard key={`${record.roleId}:${record.serial}`} record={record} index={index} onOpen={() => setSelected(record)} />)}</div> : <div className="honors-v2-empty"><span><Award /></span><p>FIRST HONOR · WAITING</p><h3>第一张荣誉等待点亮</h3><small>完成所有训练轮次并通过最终验收后，岗位证书会自动归档在这里。</small><Link to="/competency">开始岗位训练<Sparkles /></Link></div>}
      <HonorTransit reverse label="SEALED RECORD · 荣誉凭据写入认证档案" />
      <motion.section className={`honors-v2-console ${unlocked ? "is-complete" : ""}`} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><div className="honors-v2-console-title"><span><img src="/images/quality-inspection-instrument-v1.png" alt="" aria-hidden="true" /></span><div><small>03 · 认证控制台</small><h2>{unlocked ? "成果已通过签发门禁" : "等待首项成果进入验收"}</h2><p>{unlocked ? "证书已写入个人荣誉档案，可随时查看并下载高清图片。" : "完成岗位训练和综合验收后，系统将自动签发证书。"}</p></div></div><div className="honors-v2-console-grid"><div className="honors-v2-metric"><span>认证成果总数</span><strong>{String(certificates.length).padStart(2, "0")}</strong><i /></div><div className="honors-v2-console-action"><i><b /><b /><b /></i>{certificates[0] ? <button onClick={() => setSelected(certificates[0])}><Award />查看最近证书</button> : <Link to="/competency"><Sparkles />进入岗位训练</Link>}<p>{unlocked ? `${roleCount} 个岗位已完成成果认证` : "当前状态：等待训练成果"}</p></div></div></motion.section>
    </section>
  </div>{selected && <RoleCertificateModal open learnerName={selected.learnerName} roleName={selected.roleName} roleId={selected.roleId} userId={selected.userId} completedRounds={selected.completedRounds} onClose={() => setSelected(null)} />}</main>
}

function Header({ syncing, count }: { syncing: boolean; count: number }) { return <motion.div className="honors-v2-heading" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><span><img src="/images/honors-certification-vault-v1.png" alt="" aria-hidden="true" /></span><div><small>02 · 荣誉陈列</small><h2>已获得的岗位证书</h2><p>认证信息、完成进度与查看下载入口各自分层，点击证书进入完整奖状。</p></div><i className="honors-v2-flight" /><em className={syncing ? "is-running" : count ? "is-released" : ""}>{syncing ? <><Loader2 />核验中</> : count ? <><BadgeCheck />已发布 {count} 项</> : "待发布"}</em></motion.div> }
function HonorTransit({ label, compact = false, reverse = false }: { label: string; compact?: boolean; reverse?: boolean }) { return <div className={`honors-v2-air-transit ${compact ? "is-compact" : ""} ${reverse ? "is-reverse" : ""}`} aria-hidden="true"><span className="honors-v2-air-route" /><i className="honors-v2-air-beacon is-one" /><i className="honors-v2-air-beacon is-two" /><i className="honors-v2-air-beacon is-three" /><b>{label}</b><img src="/images/honors-courier-aircraft-v1.png" alt="" /></div> }
function CertificateCard({ record, index, onOpen }: { record: RoleCertificateRecord; index: number; onOpen: () => void }) { const tones = ["is-gold", "is-blue", "is-cyan"]; return <motion.article className={`honors-v2-card ${tones[index % tones.length]}`} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .5, delay: index * .06 }} whileHover={{ y: -4 }}><span className="honors-v2-card-no">{String(index + 1).padStart(2, "0")}</span><button onClick={onOpen} aria-label={`查看${record.roleName}岗位证书`}><div className="honors-v2-certificate"><img src={certificateBackground} alt="" /><div><small>因材智训 · VERIFIED</small><h3>岗位学习荣誉证书</h3><i /><strong>{record.learnerName}</strong><p>完成「{record.roleName}」岗位全部学习内容与综合验收</p></div><span>✓</span></div><div className="honors-v2-card-meta"><div><span><ShieldCheck />已认证</span><strong>{record.roleName}</strong><small><CalendarDays />{formatCertificateDate(record.issuedAt)} · {record.completedRounds} 轮训练</small></div><span className="honors-v2-view"><Eye />查看 / 下载<Download /></span></div></button></motion.article> }
function HeroStat({ label, value, suffix, compact = false }: { label: string; value: string; suffix?: string; compact?: boolean }) { return <div><span>{label}</span><strong className={compact ? "compact" : ""}>{value}{suffix && <small>{suffix}</small>}</strong></div> }
