/**
 * 概念动画微课 · 动画讲解 Agent
 * ------------------------------------------------------------------
 * 顶部：问任何概念 → Agent 智能匹配动画库 + AI 开场白 + 朗读（多模态讲解）。
 *   命中手写动画放精品；没命中 → AI 现编排通用模板动画（GenericConceptAnim）。
 * 底部：动画库入口 → 跳独立页 /concept/library 慢慢逛（不在本页抢搜索的戏）。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Activity, ArrowRight, Binary, BookOpenText, BrainCircuit, Captions, CheckCircle2, ChevronRight, CircleDot, Cpu, Film, Library, Lightbulb, Loader2, Network, Orbit, PlayCircle, Radio, ScanLine, Send, Sparkles, Volume2, Waves } from "lucide-react"
import { AppTopbar } from "@/components/AppTopbar"
import { useTrackPage } from "@/lib/useTrackPage"
import { useCurrentUser } from "@/store/user"
import { useTargetRole } from "@/store/targetRole"
import { CONCEPT_ANIMS } from "@/components/concepts/registry"
import { ConceptResultView } from "@/components/concepts/ConceptResultView"
import { explainConcept, type ConceptRoleContext, type ExplainResult } from "@/lib/concept"
import "./ConceptDemo.css"

const EXAMPLES = [
  "梯度下降是怎么工作的",
  "快速排序怎么分区",
  "TCP 为什么要三次握手",
  "什么是死锁",
  "Cache 怎么判断命中",
  "拥塞控制的 cwnd 怎么变化",
]

const QUICK_ICONS = [Lightbulb, Network, Radio, Cpu, Waves, Binary]

const DEFAULT_SHOWCASE_QUERY = "FDE这个岗位是干什么的？"

export function ConceptDemo() {
  useTrackPage("concept")
  const user = useCurrentUser()
  const targetRole = useTargetRole()
  const USER_ID = user?.user_id ?? 0
  const roleContext = useMemo<ConceptRoleContext | undefined>(() => targetRole
    ? {
        target_role: targetRole.name,
        role_summary: targetRole.summary,
        core_competencies: targetRole.skills,
        sample_tasks: targetRole.sampleTasks,
      }
    : undefined, [targetRole])
  const examples = Array.from(new Set([
    ...(targetRole?.sampleTasks?.slice(0, 2) || []),
    ...(targetRole?.skills?.slice(0, 2) || []),
    ...EXAMPLES,
  ])).slice(0, 6)

  const [searchParams] = useSearchParams()
  const initialAnimKey = searchParams.get("anim")
  const initialMatchedAnim = initialAnimKey ? CONCEPT_ANIMS.find((item) => item.key === initialAnimKey) : null
  const initialQuery = initialMatchedAnim?.title ?? searchParams.get("q")?.trim() ?? DEFAULT_SHOWCASE_QUERY
  const initialNeedsExplain = !initialMatchedAnim && Boolean(initialQuery)
  const initialResult: ExplainResult | null = initialMatchedAnim
    ? {
        matched: true,
        key: initialMatchedAnim.key,
        title: initialMatchedAnim.title,
        intro: `现在播放「${initialMatchedAnim.title}」，你可以暂停、逐步查看或切换讲课模式。`,
        script: null,
        generated: false,
        mock: true,
      }
    : null

  const [question, setQuestion] = useState(initialQuery)
  const [loading, setLoading] = useState(initialNeedsExplain)
  const [result, setResult] = useState<ExplainResult | null>(initialResult)
  const [lastQuery, setLastQuery] = useState(initialQuery) // 已提交的问题，用于 B 站视频检索

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim()
      if (!text || loading) return
      setLoading(true)
      setResult(null)
      setLastQuery(text)
      try {
        const r = await explainConcept(text, USER_ID, roleContext)
        setResult(r)
      } finally {
        setLoading(false)
      }
    },
    [loading, USER_ID, roleContext]
  )

  // 动画库已有条目走 anim，直接进入播放器；未命中搜索走 q，让 AI 现编兜底。
  useEffect(() => {
    if (!initialNeedsExplain) return
    let cancelled = false
    void explainConcept(initialQuery, USER_ID, roleContext)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [USER_ID, initialNeedsExplain, initialQuery, roleContext])

  return (
    <main className="app-page paper-theme concept-orbit-page min-h-dvh pb-12">
      <div className="w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <AppTopbar className="rounded-none border-x-0 shadow-none" current="concept" appearance="paper" labelOverride="可视讲解中心" groupOverride="知识模型演示" selectionLabel={targetRole?.name || "概念探索"} showRocketFormation rocketVariant="honor" />

        <section className={`concept-orbit-command ${loading ? "is-running" : ""}`}>
          <div className="concept-orbit-live-row">
            <div><span className="concept-orbit-live-dot" /><b>CONCEPT INPUT / 01</b><span>知识编排台</span></div>
            <span>{loading ? "模型正在编排讲解" : result ? "讲解轨道已就绪" : "等待概念输入"}</span>
          </div>
          <div className="concept-orbit-command-grid">
            <div className="concept-orbit-command-main">
              <div className="concept-orbit-command-title">
                <span><BrainCircuit /></span>
                <div><ModuleIndex number="01" label="概念输入" english="CONCEPT INPUT" /><h1>今天想看懂什么？</h1><p>输入岗位任务或技术概念，立即生成可播放的模型讲解。</p></div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); ask(question) }} className="concept-orbit-console">
                <label className="sr-only" htmlFor="concept-orbit-query">输入要讲解的概念</label>
                <Sparkles className="size-4" />
                <input id="concept-orbit-query" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="输入能力点或任务原理…" />
                <button type="submit" disabled={loading || !question.trim()}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}<span>{loading ? "正在建模" : "生成讲解"}</span><ArrowRight className="size-4" /></button>
              </form>
              <div className="concept-orbit-quick-list" aria-label="快速选择概念">
                {examples.map((s, index) => {
                  const QuickIcon = QUICK_ICONS[index] ?? Lightbulb
                  return <button className={`is-tone-${index + 1}`} key={s} onClick={() => { setQuestion(s); ask(s) }}><span><QuickIcon /></span><div><small>QUICK MODEL · {String(index + 1).padStart(2, "0")}</small><b>{s}</b><em>点击生成讲解</em></div><i><ArrowRight /></i></button>
                })}
              </div>
            </div>
            <aside className="concept-orbit-model-monitor" aria-label="讲解模型状态">
              <div className="concept-orbit-monitor-head"><Radio /><span>MODEL MONITOR</span><i>{loading ? "RUNNING" : "READY"}</i></div>
              <div className="concept-orbit-monitor-core" aria-hidden="true"><span className="concept-orbit-ring is-outer" /><span className="concept-orbit-ring is-inner" /><img src="/images/concept-knowledge-processor-v1.png" alt="" /><i className="is-a"><Binary /></i><i className="is-b"><Waves /></i></div>
              <div className="concept-orbit-monitor-stats"><span><small>动画模型</small><b>{CONCEPT_ANIMS.length}</b></span><span><small>岗位上下文</small><b>{targetRole ? "已接入" : "开放模式"}</b></span><span><small>输出状态</small><b>{loading ? "编排中" : result ? "可播放" : "待机"}</b></span></div>
            </aside>
          </div>
        </section>

        <div className="concept-orbit-longform">
          <SignalRelay from="概念输入" to="模型演示" state={loading ? "信号解析中" : result ? "模型已锁定" : "等待发射"} />

          <section className="concept-orbit-section concept-orbit-demonstration">
            <div className="concept-orbit-demo-heading">
              <SectionHeading number="02" icon={Film} eyebrow="模型演示" title="讲解画面与播放控制" description={lastQuery || "选定概念后，模型画面将在这里展开"} />
              <div className={`concept-orbit-status ${loading ? "is-running" : result ? "is-ready" : ""}`}><Activity />{loading ? "编排中" : result ? "可播放" : "待机"}</div>
            </div>
            <div className="concept-orbit-result-frame">
              <span className="concept-orbit-scan" aria-hidden="true" />
              <ConceptResultView result={result} loading={loading} lastQuery={lastQuery} />
              {!result && !loading && <div className="concept-orbit-empty"><span><PlayCircle /></span><h3>讲解舞台待命</h3><p>从上方输入概念，或选择一条示例轨道。</p></div>}
            </div>
          </section>

          <PlaybackRelay active={Boolean(result)} />

          <section className="concept-orbit-section concept-orbit-signals">
            <SectionHeading number="03" icon={ScanLine} eyebrow="知识信号" title="一套讲解，四种理解信号" description="画面、步骤、声音与资料各自承担不同的信息任务" />
            <div className="concept-orbit-signal-grid">
              <CapabilityCard icon={PlayCircle} number="01" title="动态画面" description="连续观察算法、系统或岗位流程如何变化。" signal="MOTION" tone="cyan" state="实时渲染" />
              <CapabilityCard icon={Captions} number="02" title="分步字幕" description="把关键因果拆成可回看的讲解节点。" signal="STEPS" tone="violet" state="逐段定位" />
              <CapabilityCard icon={Volume2} number="03" title="语音讲解" description="跟随模型演示同步听清概念与易错点。" signal="VOICE" tone="amber" state="同步输出" />
              <CapabilityCard icon={BookOpenText} number="04" title="拓展资料" description="从动画进入经过核验的文章、论文与视频。" signal="SOURCE" tone="green" state="关联检索" />
            </div>
            <Link to="/concept/library" className="concept-orbit-library-link"><span><Library /></span><span><small>MODEL ARCHIVE</small><b>进入完整动画库</b><em>{CONCEPT_ANIMS.length} 个分步动画 · 支持搜索、暂停和单步查看</em></span><i><ChevronRight /></i></Link>
          </section>
        </div>
      </div>
    </main>
  )
}

function ModuleIndex({ number, label, english }: { number: string; label: string; english: string }) {
  return <div className="concept-orbit-module-index"><strong>{number}</strong><span>{label}</span><i>{english}</i></div>
}

function SectionHeading({ number, icon: Icon, eyebrow, title, description }: { number: string; icon: typeof Film; eyebrow: string; title: string; description: string }) {
  return <div className="concept-orbit-section-heading"><span className="concept-orbit-section-icon"><Icon /></span><div><ModuleIndex number={number} label={eyebrow} english="KNOWLEDGE SYSTEM" /><h2>{title}</h2><p>{description}</p></div><div className="concept-orbit-heading-wave" aria-hidden="true"><i /><i /><i /><i /><i /></div></div>
}

function SignalRelay({ from, to, state }: { from: string; to: string; state: string }) {
  return <div className="concept-orbit-relay" aria-label={`${from}到${to}：${state}`}><span><CircleDot /></span><b>{from}</b><div className="concept-orbit-relay-track"><i /><i /><i /><i /><i /></div><em>{state}</em><div className="concept-orbit-relay-track is-reverse"><i /><i /><i /><i /></div><b>{to}</b><span><Orbit /></span></div>
}

function PlaybackRelay({ active }: { active: boolean }) {
  return <div className={`concept-orbit-playback-relay ${active ? "is-active" : ""}`} aria-label="模型演示到知识信号的播放输出通道"><div><span><PlayCircle /></span><b>画面帧</b></div><i /><div><span><Captions /></span><b>步骤字幕</b></div><i /><div><span><Volume2 /></span><b>语音同步</b></div><i /><div><span>{active ? <CheckCircle2 /> : <Lightbulb />}</span><b>{active ? "理解就绪" : "等待讲解"}</b></div></div>
}

function CapabilityCard({ icon: Icon, number, title, description, signal, tone, state }: { icon: typeof Film; number: string; title: string; description: string; signal: string; tone: "cyan" | "violet" | "amber" | "green"; state: string }) {
  return (
    <article className={`concept-orbit-capability is-${tone}`}>
      <span className="concept-orbit-capability-icon"><Icon /></span><i>{number}</i>
      <div><small>{signal} SIGNAL</small><h3>{title}</h3><p>{description}</p><em><CircleDot />{state}</em></div>
    </article>
  )
}
