import { ArrowUpRight, Clock3, ExternalLink, Gauge, MonitorCog, ScanLine, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"

import { AppTopbar } from "@/components/AppTopbar"

interface OjCollection { slug: string; eyebrow: string; title: string; description: string; count: string; cover: string; coverAlt: string }

// 与 OJ 侧 oj/packages/studymate-oj/catalog.yaml 的学习者题单保持一致。
const collections: OjCollection[] = [
  { slug: "interview-core", eyebrow: "LeetCode 官方题单", title: "面试经典 150 题", description: "按官方章节建立完整的面试算法练习路径。", count: "150 题", cover: "/career-covers/ai-infra.webp", coverAlt: "工程师在服务器机房检查计算设备" },
  { slug: "interview-must", eyebrow: "LeetCode 官方题单", title: "面试必考 75 题", description: "集中练习通用面试高频考点。", count: "75 题", cover: "/career-covers/ai-native-frontend.webp", coverAlt: "开发者在计算机前进行编程设计" },
  { slug: "interview-variants", eyebrow: "因材智训可直接提交", title: "面试经典题变式", description: "数组、字符串、查找、图与动态规划的站内练习路径。", count: "75 题", cover: "/career-covers/devsecops.webp", coverAlt: "工程师查看自动化测试与交付流程" },
  { slug: "autumn-sprint", eyebrow: "因材智训可直接提交", title: "秋招冲刺百题计划", description: "语法、复杂度、数据处理与常见算法主线训练。", count: "100 题", cover: "/career-covers/industrial-data.webp", coverAlt: "工程师在工业现场分析实时数据" },
  { slug: "general-foundation", eyebrow: "因材智训可直接提交", title: "多岗位筑基训练计划", description: "面向后端、前端、测试、数据和 Python 方向的通用编程基础训练。", count: "30 题", cover: "/career-covers/fde.webp", coverAlt: "两位工程师协作解决计算机问题" },
  { slug: "problem-bank", eyebrow: "Hydro 本地题库", title: "题库", description: "浏览已导入的官方训练题和其他公开练习。", count: "全部题目", cover: "/career-covers/industrial-network.webp", coverAlt: "工程师维护工业网络与计算设备" },
]

function collectionHref(slug: string) { return `/api/oj/launch?next=${encodeURIComponent(`/oj/collections/${slug}`)}` }

const beijingTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

export function OjCenter() {
  const [beijingTime, setBeijingTime] = useState(() => beijingTimeFormatter.format(new Date()))

  useEffect(() => {
    const timer = window.setInterval(() => setBeijingTime(beijingTimeFormatter.format(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="app-page oj-prep-studio min-h-dvh pb-12">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="oj" appearance="default" iconImage="/images/quality-inspection-instrument-v1.png" showRocketFormation rocketVariant="honor" />
        <section className="oj-prep-hero relative mt-3 overflow-hidden border-y px-3 py-5 sm:px-5 lg:px-6">
          <div className="oj-prep-live-row flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3"><span className="oj-prep-live-dot size-2 rounded-full" /><span>EXAM TERMINAL</span><span>READY · 01</span></div>
            <span className="hidden sm:block">在线判题链路已校准</span>
          </div>
          <div className="relative mt-5 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_250px] xl:items-center">
            <div className="oj-prep-summary min-w-0">
              <div className="oj-prep-index"><strong>04</strong><span>机考备战中心</span><i>EXAM READINESS</i></div>
              <h1 className="oj-prep-title mt-5"><span>机考备战</span><span>中心</span></h1><div className="oj-prep-accent mt-5" aria-hidden="true" />
              <p className="oj-prep-copy mt-5">在内置在线判题系统中完成算法与编程练习，提交后实时查看评测结果。</p>
              <dl className="oj-prep-metrics mt-6 grid grid-cols-2"><div><dt>判题引擎</dt><dd>HYDRO</dd></div><div><dt>账号链路</dt><dd>AUTO</dd></div></dl>
            </div>
            <div className="oj-prep-calibration" aria-label="电子答题终端校准展示">
              <div className="oj-prep-terminal" aria-hidden="true"><span className="oj-prep-terminal-camera" /><div className="oj-prep-terminal-screen"><i /><b>{beijingTime}</b><small>北京时间 / UTC+8</small><span><em /><em /><em /><em /></span></div><span className="oj-prep-terminal-base" /></div>
              <div className="oj-prep-scan-track" aria-hidden="true"><i /><span /><span /><span /></div><div className="oj-prep-signal-bank" aria-hidden="true"><span className="is-ready" /><span /><span /></div>
              <div className="oj-prep-calibration-label"><ScanLine className="size-4" /><span>终端校准扫描</span><b>SYNC 100%</b></div>
            </div>
            <a href="/api/oj/launch" className="oj-prep-primary group flex min-h-32 items-end justify-between gap-3 rounded-[26px] border px-5 py-4"><span className="oj-prep-launch-kicker">OJ LAUNCH · READY</span><span className="relative z-10 flex items-center gap-3"><span className="oj-prep-primary-icon grid size-11 place-items-center rounded-full"><MonitorCog className="size-5" /></span><span><strong>启动在线评测</strong><small>自动登录 · 即时判题</small></span></span><span className="oj-prep-primary-arrow relative z-10 grid size-9 place-items-center rounded-full"><ExternalLink className="size-4" /></span></a>
          </div>
          <div className="oj-prep-stage-rail relative mt-6 grid grid-cols-4 overflow-hidden rounded-[14px] border"><span className="oj-prep-route-signal" aria-hidden="true" />{["身份同步", "环境校准", "在线作答", "即时评测"].map((label, index) => <div key={label}><span className="oj-prep-stage-label"><i>{String(index + 1).padStart(2, "0")}</i>{label}</span></div>)}</div>
        </section>
        <div className="oj-prep-transition is-training" aria-hidden="true"><span>PLATFORM LINK</span><i /><i /><i /><b>题单数据通道</b><em /></div>
        <section className="oj-prep-section border-y px-3 py-8 sm:px-5 lg:px-6" aria-labelledby="oj-collections">
          <div className="oj-prep-section-heading"><span className="oj-prep-section-icon"><ScanLine className="size-5" /></span><div><span>01 · 题目训练</span><h2 id="oj-collections">精选题单</h2><p>按目标与阶段选择练习，点击直达对应题单。</p></div><i className="oj-prep-heading-line" aria-hidden="true"><b /></i></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{collections.map((item, index) => <a key={item.slug} href={collectionHref(item.slug)} className="oj-prep-collection group"><span className="oj-prep-cover"><img src={item.cover} alt={item.coverAlt} loading="lazy" /><i aria-hidden="true" /><b>{String(index + 1).padStart(2, "0")}</b></span><div className="oj-prep-collection-body"><div className="flex items-start justify-between gap-2"><p className="oj-prep-eyebrow">{item.eyebrow}</p><ArrowUpRight className="size-4 shrink-0" /></div><h3>{item.title}</h3><p>{item.description}</p><strong>{item.count}</strong></div></a>)}</div>
        </section>
        <div className="oj-prep-transition is-readiness" aria-hidden="true"><span>TRAINING COMPLETE</span><i /><i /><i /><b>考场信号中继</b><em /></div>
        <section className="oj-prep-section border-y px-3 py-8 sm:px-5 lg:px-6" aria-labelledby="oj-start">
          <div className="oj-prep-section-heading"><span className="oj-prep-section-icon"><Clock3 className="size-5" /></span><div><span>02 · 临场准备</span><h2 id="oj-start">评测通道就绪</h2><p>账号互通、编译运行与结果回传均在同一练习链路内完成。</p></div><i className="oj-prep-heading-line" aria-hidden="true"><b /></i></div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_repeat(2,260px)]"><div className="oj-prep-info-panel"><span>操作说明 / OPERATION</span><h3>在线编写并提交代码，实时评测</h3><p>进入时将自动使用当前因材智训账号登录在线判题系统，无需再次注册或登录。</p></div><div className="oj-prep-note"><ShieldCheck className="size-5" /><div><h3>账号说明</h3><p>首次进入会自动创建对应判题账号，无需维护第二套账户。</p></div></div><div className="oj-prep-note"><Gauge className="size-5" /><div><h3>判题说明</h3><p>常见语言均可提交，用时、内存与评测结果实时返回。</p></div></div></div>
        </section>
      </div>
    </main>
  )
}
