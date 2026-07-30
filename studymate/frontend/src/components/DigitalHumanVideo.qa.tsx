import { useState } from "react"
import { createRoot } from "react-dom/client"

import { DigitalHumanVideo } from "@/components/DigitalHumanVideo"
import { DIGITAL_HUMAN_VIDEO, type DigitalHumanState } from "@/lib/digitalHuman"

import "@/index.css"

const STATES: DigitalHumanState[] = ["idle", "listening", "thinking", "speaking", "paused"]

export function DigitalHumanVideoQa() {
  const [state, setState] = useState<DigitalHumanState>("idle")

  return (
    <main className="min-h-screen bg-[#F4F1E9] p-8 text-[#18232D]">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-[#315E83]">LOCAL MEDIA QA · NO NETWORK SERVICES</p>
            <h1 className="mt-1 text-2xl font-bold">数字人自然待机与状态过渡</h1>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="数字人测试状态">
            {STATES.map((nextState) => (
              <button
                key={nextState}
                type="button"
                data-testid={`state-${nextState}`}
                onClick={() => setState(nextState)}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                  state === nextState
                    ? "border-[#315E83] bg-[#315E83] text-white"
                    : "border-[#CFC8B9] bg-[#FFFEFA] text-[#4E5A61]"
                }`}
              >
                {nextState}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[28px] border border-[#CFC8B9] bg-[#FFFEFA] p-4 shadow-[0_18px_44px_rgba(24,35,45,.08)]">
            <DigitalHumanVideo
              state={state}
              priority
              stageBlend
              showFallbackStatus
              alt="真人讲师状态过渡测试"
              className="aspect-video w-full rounded-[22px] bg-[#E9E6DE]"
              mediaClassName="h-full w-full object-cover"
            />
            <p className="mt-3 text-center text-xs text-[#687278]">
              当前状态：<strong data-testid="current-state">{state}</strong>
            </p>
          </section>

          <section className="flex min-h-[480px] items-end justify-center overflow-hidden rounded-[28px] border border-[#CFC8B9] bg-[radial-gradient(circle_at_50%_70%,#E7ECE5_0,transparent_58%)] p-5">
            <DigitalHumanVideo
              state={state}
              priority
              idleOnly
              floatingBlend
              idleSrc={DIGITAL_HUMAN_VIDEO.floatingIdleSrc}
              idlePoster={DIGITAL_HUMAN_VIDEO.floatingIdlePoster}
              alt="透明浮动助教待机测试"
              className="h-[430px] w-[300px]"
              mediaClassName="h-full w-full"
            />
          </section>
        </div>
        <div className="flex h-[760px] items-end justify-center pb-8 text-xs font-semibold text-[#7A817F]" aria-hidden>
          离屏暂停验证区
        </div>
      </div>
    </main>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("Digital-human QA root is missing")
const qaRoot = createRoot(root)
qaRoot.render(<DigitalHumanVideoQa />)

if (import.meta.hot) {
  import.meta.hot.dispose(() => qaRoot.unmount())
}
