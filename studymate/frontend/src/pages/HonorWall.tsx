import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowRight, Award, CalendarDays, Eye, Sparkles, Trophy } from "lucide-react"

import certificateBackground from "@/assets/certificate/studymate-certificate-bg.png"
import { AppTopbar } from "@/components/AppTopbar"
import { RoleCertificateModal } from "@/components/RoleCertificateModal"
import { formatCertificateDate, listUserCertificates, type RoleCertificateRecord } from "@/lib/certificates"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"

export function HonorWall() {
  useTrackPage("honor_wall")
  const user = useCurrentUser()
  const [selected, setSelected] = useState<RoleCertificateRecord | null>(null)
  const certificates = useMemo(
    () => user ? listUserCertificates(user.user_id, user.name) : [],
    [user],
  )
  const roleCount = new Set(certificates.map((record) => record.roleId)).size
  const latestIssuedAt = certificates[0]?.issuedAt

  return (
    <main className="app-page paper-theme min-h-dvh pb-14">
      <div className="mx-auto max-w-[1540px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="honor" appearance="paper" />

        <section className="relative mt-4 overflow-hidden rounded-[30px] border border-[#DCC78D] bg-[#102D4D] px-5 py-7 text-white shadow-[0_24px_64px_rgba(20,49,82,.2)] sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-[#D1A64B]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 left-[28%] size-80 rounded-full bg-[#537FA8]/24 blur-3xl" />
          <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E6CF91]/30 bg-[#E6CF91]/10 px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-[#F1D891]"><Trophy className="size-3.5" />MY HONOR WALL</span>
              <h1 className="mt-4 text-3xl font-bold tracking-[-.045em] sm:text-4xl">我的荣誉墙</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#CAD8E6]">每一张证书都记录了一段完整的岗位学习旅程。这里收藏你的坚持、成长与已经具备的专业能力。</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-[11px] font-bold text-white transition hover:bg-white/15">返回今日学习</Link>
                <Link to="/competency" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D0A64C] px-4 text-[11px] font-bold text-[#17334F] shadow-[0_8px_20px_rgba(208,166,76,.24)] transition hover:bg-[#DDB65E]">继续岗位训练<ArrowRight className="size-3.5" /></Link>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-[22px] border border-white/12 bg-white/[.075] p-3 backdrop-blur-sm">
              <HeroStat label="已获证书" value={`${certificates.length}`} suffix="张" />
              <HeroStat label="完成岗位" value={`${roleCount}`} suffix="个" />
              <HeroStat label="最近获得" value={latestIssuedAt ? formatCertificateDate(latestIssuedAt).replace(/年|月/g, ".").replace("日", "") : "等待点亮"} compact />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[26px] border border-[#D7D1C4] bg-[#FFFEFA] p-5 shadow-[0_14px_36px_rgba(24,35,45,.06)] sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[10px] font-bold tracking-[.14em] text-[#A87822]">ACHIEVEMENTS</span>
              <h2 className="mt-1 text-xl font-bold tracking-[-.035em] text-[#18232D]">已获得的岗位证书</h2>
              <p className="mt-1 text-xs leading-5 text-[#6F787A]">点击任意证书可查看完整奖状，并再次下载高清图片。</p>
            </div>
            {certificates.length > 0 && <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#DCC78D] bg-[#FFF7E2] px-3 py-1.5 text-[10px] font-bold text-[#916A21]"><Award className="size-3.5" />已点亮 {certificates.length} 项荣誉</span>}
          </div>

          {certificates.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {certificates.map((record, index) => (
                <motion.article
                  key={`${record.roleId}:${record.serial}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                  className="group overflow-hidden rounded-[22px] border border-[#D8C9A8] bg-[#F8F2E5] shadow-[0_10px_26px_rgba(36,53,67,.07)] transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(36,53,67,.12)]"
                >
                  <button type="button" onClick={() => setSelected(record)} className="block w-full text-left" aria-label={`查看${record.roleName}岗位证书`}>
                    <div className="relative aspect-[4/3] overflow-hidden border-b border-[#D8C9A8]">
                      <img src={certificateBackground} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
                      <div className="absolute inset-x-[14%] top-[18%] text-center text-[#173653]">
                        <p className="text-[7px] font-bold tracking-[.24em] text-[#9B7429] sm:text-[8px]">因材智训</p>
                        <h3 className="mt-1 font-serif text-[clamp(16px,2vw,25px)] font-bold tracking-[.12em]">岗位学习荣誉证书</h3>
                        <div className="mx-auto mt-3 h-px w-20 bg-[#C49A4C]" />
                        <strong className="mt-3 block truncate font-serif text-[clamp(18px,2.4vw,30px)] tracking-[.08em]">{record.learnerName}</strong>
                        <p className="mx-auto mt-2 line-clamp-2 max-w-[82%] text-[clamp(7px,.8vw,10px)] leading-relaxed text-[#5E645F]">完成「{record.roleName}」岗位全部学习内容与综合验收</p>
                      </div>
                      <span className="absolute bottom-[8%] right-[11%] grid size-[14%] place-items-center rounded-full border-2 border-double border-[#BE9345] bg-[#FFF7E5]/85 text-[clamp(8px,1vw,12px)] font-black text-[#9A722C]">✓</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-[#FFFEFA] px-4 py-3.5">
                      <div className="min-w-0">
                        <strong className="block truncate text-xs text-[#243B51]">{record.roleName}</strong>
                        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[#7A817F]"><CalendarDays className="size-3" />{formatCertificateDate(record.issuedAt)} · {record.completedRounds} 轮训练</span>
                      </div>
                      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#D6C69E] bg-[#FFF8E8] px-2.5 text-[10px] font-bold text-[#8C6726]"><Eye className="size-3" />查看</span>
                    </div>
                  </button>
                </motion.article>
              ))}
            </div>
          ) : (
            <div className="mt-6 grid min-h-[360px] place-items-center rounded-[22px] border border-dashed border-[#D9CCAE] bg-[#FBF7ED] px-5 text-center">
              <div className="max-w-md py-12">
                <span className="mx-auto grid size-16 place-items-center rounded-[22px] border border-[#DDCB9D] bg-[#FFF8E6] text-[#AD7F2B]"><Award className="size-7" /></span>
                <p className="mt-5 text-[10px] font-bold tracking-[.15em] text-[#A87822]">第一张荣誉等待点亮</p>
                <h3 className="mt-2 text-xl font-bold tracking-[-.03em] text-[#18232D]">完成一个岗位的全部学习内容</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#6F787A]">完成所有训练轮次并通过最终验收后，在岗位训练中心领取证书，它会永久收藏在这里。</p>
                <Link to="/competency" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#193B50]">开始岗位训练<Sparkles className="size-3.5" /></Link>
              </div>
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

function HeroStat({ label, value, suffix, compact = false }: { label: string; value: string; suffix?: string; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0C2744]/40 px-3 py-4 text-center">
      <span className="block text-[9px] font-semibold tracking-[.08em] text-[#9EB2C4]">{label}</span>
      <strong className={`mt-1 block truncate text-[#F0D48C] ${compact ? "text-[11px] sm:text-xs" : "text-2xl"}`}>{value}{suffix && <small className="ml-0.5 text-[10px] font-semibold text-[#C7D3DE]">{suffix}</small>}</strong>
    </div>
  )
}
