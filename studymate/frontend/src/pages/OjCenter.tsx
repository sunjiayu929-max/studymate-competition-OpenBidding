import { ArrowUpRight, Code2, ExternalLink, Gauge, ShieldCheck } from "lucide-react"

import { AppTopbar } from "@/components/AppTopbar"

interface OjCollection {
  slug: string
  eyebrow: string
  title: string
  description: string
  count: string
}

// 与 OJ 侧 oj/packages/studymate-oj/catalog.yaml 的学习者题单保持一致。
const collections: OjCollection[] = [
  { slug: "interview-core", eyebrow: "LeetCode 官方题单", title: "面试经典 150 题", description: "按官方章节建立完整的面试算法练习路径。", count: "150 题" },
  { slug: "interview-must", eyebrow: "LeetCode 官方题单", title: "面试必考 75 题", description: "集中练习通用面试高频考点。", count: "75 题" },
  { slug: "interview-variants", eyebrow: "因材智训可直接提交", title: "面试经典题变式", description: "数组、字符串、查找、图与动态规划的站内练习路径。", count: "75 题" },
  { slug: "autumn-sprint", eyebrow: "因材智训可直接提交", title: "秋招冲刺百题计划", description: "语法、复杂度、数据处理与常见算法主线训练。", count: "100 题" },
  { slug: "general-foundation", eyebrow: "因材智训可直接提交", title: "多岗位筑基训练计划", description: "面向后端、前端、测试、数据和 Python 方向的通用编程基础训练。", count: "30 题" },
  { slug: "problem-bank", eyebrow: "Hydro 本地题库", title: "题库", description: "浏览已导入的官方训练题和其他公开练习。", count: "全部题目" },
]

function collectionHref(slug: string) {
  return `/api/oj/launch?next=${encodeURIComponent(`/oj/collections/${slug}`)}`
}

export function OjCenter() {
  return (
    <main className="app-page paper-theme min-h-dvh">
      <div className="mx-auto max-w-[1240px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <AppTopbar current="oj" appearance="paper" />
        <section className="mt-4 overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] shadow-[0_16px_42px_rgba(24,35,45,.075)]">
          <div className="border-b border-[#D7D1C4] bg-[#F8F6F0] px-5 py-6 sm:px-8">
            <div className="flex max-w-3xl items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#E7EDF3] text-[#315E83]"><Code2 className="size-5" /></span>
              <div>
                <p className="text-[10px] font-bold tracking-[.14em] text-[#8E6925]">在线评测 · ONLINE JUDGE</p>
                <h1 className="mt-1 text-2xl font-bold tracking-[-.035em] text-[#18232D]">机考备战中心</h1>
                <p className="mt-2 text-sm leading-6 text-[#66717B]">在因材智训内置的在线判题系统中完成算法与编程练习，提交后实时查看评测结果。</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-[#D7D1C4] bg-[#FBF9F4] p-5" aria-labelledby="oj-start">
              <h2 id="oj-start" className="text-sm font-bold text-[#18232D]">开始练习</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#E0DACE] bg-[#FFFEFA] p-3"><dt className="text-[10px] font-bold text-[#8A8172]">练习方式</dt><dd className="mt-1 text-sm font-bold text-[#315E83]">在线编写并提交代码，实时评测</dd></div>
                <div className="rounded-xl border border-[#E0DACE] bg-[#FFFEFA] p-3"><dt className="text-[10px] font-bold text-[#8A8172]">账号体系</dt><dd className="mt-1 text-sm font-bold text-[#315E83]">与因材智训账号互通，自动登录</dd></div>
              </dl>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <a href="/api/oj/launch" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#244C66] px-5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(36,76,102,.16)] hover:bg-[#1D4058]"><ExternalLink className="size-4" />进入在线评测</a>
                <span className="text-[10px] leading-4 text-[#8A8172]">将自动使用当前因材智训账号登录在线判题系统，无需再次注册或登录。</span>
              </div>
            </section>

            <aside className="space-y-3" aria-label="在线评测说明">
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><ShieldCheck className="size-5 text-[#6F8A69]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">账号说明</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">首次进入时会根据当前因材智训账号自动创建对应的判题系统账号，无需注册第二套账号。</p></div>
              <div className="rounded-2xl border border-[#D7D1C4] bg-[#F8F6F0] p-4"><Gauge className="size-5 text-[#B1842C]" /><h2 className="mt-3 text-sm font-bold text-[#18232D]">判题说明</h2><p className="mt-1.5 text-xs leading-5 text-[#66717B]">由 Hydro 判题引擎支持，常见语言均可提交，评测结果与用时内存实时返回。</p></div>
            </aside>
          </div>

          <section className="border-t border-[#D7D1C4] bg-[#FFFEFA] px-5 py-5 sm:px-8" aria-labelledby="oj-collections">
            <div className="flex items-center justify-between gap-3"><h2 id="oj-collections" className="text-sm font-bold text-[#18232D]">精选题单</h2><span className="text-[10px] text-[#8A8172]">点击直达对应题单</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((item) => <a key={item.slug} href={collectionHref(item.slug)} className="group rounded-xl border border-[#E0DACE] bg-[#FBF9F4] p-3.5 transition-colors hover:border-[#B8C7D4] hover:bg-[#F8F6F0]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-bold tracking-[.12em] text-[#8E6925]">{item.eyebrow}</p>
                  <ArrowUpRight className="size-3.5 shrink-0 text-[#8A8172] transition-colors group-hover:text-[#315E83]" />
                </div>
                <p className="mt-1.5 text-sm font-bold text-[#315E83]">{item.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-[#66717B]">{item.description}</p>
                <p className="mt-2 text-[10px] font-bold text-[#557052]">{item.count}</p>
              </a>)}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
