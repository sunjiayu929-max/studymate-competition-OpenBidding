import type {
  PptContentBlock,
  PptPalette,
  PptSlideDraft,
} from "@/lib/pptDeck"

interface EditableSlideCanvasProps {
  slide: PptSlideDraft
  palette: PptPalette
  onChange: (patch: Partial<PptSlideDraft>) => void
}

const transparentInput = "w-full border-0 bg-transparent outline-none placeholder:opacity-40"

function fallbackBlocks(slide: PptSlideDraft, limit = 4): PptContentBlock[] {
  if (slide.blocks.length) return slide.blocks.slice(0, limit)
  return slide.bullets.slice(0, limit).map((body, index) => ({
    heading: String(index + 1).padStart(2, "0"),
    body,
  }))
}

export function EditableSlideCanvas({ slide, palette, onChange }: EditableSlideCanvasProps) {
  const blocks = fallbackBlocks(slide)
  const colors = {
    background: `#${palette.background}`,
    primary: `#${palette.primary}`,
    accent: `#${palette.accent}`,
    text: `#${palette.text}`,
    panel: `#${palette.panel}`,
    onPanel: `#${palette.onPanel}`,
    soft: `#${palette.soft}`,
  }

  const updateBlock = (index: number, patch: Partial<PptContentBlock>) => {
    const next = (slide.blocks.length ? slide.blocks : blocks).map((block, blockIndex) => (
      blockIndex === index ? { ...block, ...patch } : block
    ))
    onChange({ blocks: next })
  }

  const titleInput = (className: string) => (
    <input
      value={slide.title}
      onChange={(event) => onChange({ title: event.target.value })}
      className={`${transparentInput} ${className}`}
      aria-label="页面标题"
    />
  )

  const kickerInput = (className = "") => (
    <input
      value={slide.kicker}
      onChange={(event) => onChange({ kicker: event.target.value })}
      placeholder="章节眉题"
      className={`${transparentInput} ${className}`}
      style={{ color: colors.accent }}
      aria-label="页面眉题"
    />
  )

  const takeawayInput = (className: string, onPanel = false) => (
    <textarea
      value={slide.takeaway}
      onChange={(event) => onChange({ takeaway: event.target.value })}
      placeholder="这一页最重要的一句话"
      className={`${transparentInput} resize-none ${className}`}
      style={{ color: onPanel ? colors.onPanel : colors.text }}
      aria-label="核心结论"
    />
  )

  const subtitleInput = (className: string, onPanel = false) => (
    <textarea
      value={slide.subtitle}
      onChange={(event) => onChange({ subtitle: event.target.value })}
      placeholder="补充说明"
      className={`${transparentInput} resize-none ${className}`}
      style={{ color: onPanel ? colors.onPanel : colors.primary }}
      aria-label="页面副标题"
    />
  )

  const bulletsInput = (className = "") => (
    <textarea
      value={slide.bullets.join("\n")}
      onChange={(event) => onChange({ bullets: event.target.value.split("\n").filter(Boolean).slice(0, 5) })}
      placeholder="每行一个要点"
      className={`${transparentInput} resize-none ${className}`}
      aria-label="页面要点"
    />
  )

  const contentByLayout = () => {
    switch (slide.layout) {
      case "cover":
        return (
          <div className="relative h-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-[1.5%]" style={{ backgroundColor: colors.accent }} />
            <div className="absolute -right-[5%] -top-[22%] aspect-square w-[31%] rounded-full opacity-90" style={{ backgroundColor: colors.accent }} />
            <div className="absolute right-[5%] top-[13%] flex h-[72%] w-[23%] items-center rounded-[3%] px-[3%]" style={{ backgroundColor: colors.panel }}>
              {takeawayInput("h-[54%] text-[clamp(12px,2vw,24px)] font-bold leading-[1.35]", true)}
            </div>
            <div className="flex h-full w-[70%] flex-col justify-center py-[10%] pl-[8%]">
              {kickerInput("text-[clamp(10px,.9vw,13px)] font-bold tracking-[.2em]")}
              {titleInput("mt-[5%] text-[clamp(28px,5vw,54px)] font-black leading-[1.08] tracking-[-.055em]")}
              {subtitleInput("mt-[5%] h-[20%] text-[clamp(12px,1.65vw,21px)] leading-[1.55]")}
              <div className="mt-auto h-1 w-[17%]" style={{ backgroundColor: colors.accent }} />
            </div>
          </div>
        )
      case "agenda":
        return (
          <div className="flex h-full flex-col px-[6%] py-[5%]">
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            {titleInput("mt-[1.8%] text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
            {subtitleInput("mt-[1.2%] h-[9%] text-[clamp(11px,1.25vw,17px)]")}
            <div className="mt-[5%] grid flex-1 grid-cols-4 gap-[2.5%]">
              {blocks.slice(0, 4).map((block, index) => (
                <div key={index} className="border-t-2 pt-[8%]" style={{ borderColor: index === 0 ? colors.accent : colors.soft }}>
                  <input
                    value={block.heading}
                    onChange={(event) => updateBlock(index, { heading: event.target.value })}
                    className={`${transparentInput} text-[clamp(17px,2.25vw,29px)] font-black`}
                    style={{ color: index === 0 ? colors.accent : colors.primary }}
                    aria-label={`目录编号 ${index + 1}`}
                  />
                  <textarea
                    value={block.body}
                    onChange={(event) => updateBlock(index, { body: event.target.value })}
                    className={`${transparentInput} mt-[12%] h-[54%] resize-none text-[clamp(12px,1.7vw,21px)] font-bold leading-[1.45]`}
                    aria-label={`目录内容 ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            {takeawayInput("h-[8%] text-[clamp(11px,1.25vw,17px)] font-bold")}
          </div>
        )
      case "case":
        return (
          <div className="grid h-full grid-cols-[34%_66%]">
            <div className="flex flex-col px-[10%] py-[11%]" style={{ backgroundColor: colors.panel, color: colors.onPanel }}>
              {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.15em]")}
              {titleInput("mt-[9%] text-[clamp(18px,2.7vw,32px)] font-black leading-[1.2] tracking-[-.045em]")}
              <div className="mt-auto">{takeawayInput("h-28 text-[clamp(12px,1.65vw,20px)] font-bold leading-[1.5]", true)}</div>
            </div>
            <div className="flex flex-col justify-center gap-[5%] px-[7%] py-[6%]">
              {blocks.slice(0, 3).map((block, index) => (
                <div key={index} className="grid grid-cols-[25%_1fr] border-b pb-[4%]" style={{ borderColor: colors.soft }}>
                  <input
                    value={block.heading}
                    onChange={(event) => updateBlock(index, { heading: event.target.value })}
                    className={`${transparentInput} text-[clamp(11px,1.05vw,15px)] font-bold`}
                    style={{ color: colors.accent }}
                    aria-label={`案例标签 ${index + 1}`}
                  />
                  <textarea
                    value={block.body}
                    onChange={(event) => updateBlock(index, { body: event.target.value })}
                    className={`${transparentInput} h-14 resize-none text-[clamp(12px,1.55vw,20px)] font-bold leading-[1.45]`}
                    aria-label={`案例内容 ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      case "process":
        return (
          <div className="flex h-full flex-col px-[6%] py-[5%]">
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            {titleInput("mt-[1.8%] text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
            <div className="relative mt-[8%] grid flex-1 grid-cols-4 gap-[2.2%]">
              <div className="absolute left-[7%] right-[7%] top-[13%] h-[2px]" style={{ backgroundColor: colors.soft }} />
              {blocks.slice(0, 4).map((block, index) => (
                <div key={index} className="relative flex flex-col items-start">
                  <span className="relative z-10 grid aspect-square w-[28%] place-items-center rounded-full text-[clamp(11px,1.12vw,15px)] font-black" style={{ backgroundColor: index === 0 ? colors.accent : colors.panel, color: colors.onPanel }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <input
                    value={block.heading}
                    onChange={(event) => updateBlock(index, { heading: event.target.value })}
                    className={`${transparentInput} mt-[10%] text-[clamp(12px,1.65vw,21px)] font-black`}
                    aria-label={`步骤标题 ${index + 1}`}
                  />
                  <textarea
                    value={block.body}
                    onChange={(event) => updateBlock(index, { body: event.target.value })}
                    className={`${transparentInput} mt-[6%] h-[42%] resize-none text-[clamp(11px,1.12vw,17px)] leading-[1.5]`}
                    style={{ color: colors.primary }}
                    aria-label={`步骤说明 ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            {takeawayInput("h-[10%] text-[clamp(11px,1.25vw,17px)] font-bold")}
          </div>
        )
      case "comparison": {
        const sides = blocks.length >= 2 ? blocks : [
          { heading: "路径 A", body: slide.bullets[0] || slide.subtitle },
          { heading: "路径 B", body: slide.bullets[1] || slide.takeaway },
        ]
        return (
          <div className="flex h-full flex-col px-[6%] py-[5%]">
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            {titleInput("mt-[1.8%] text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
            <div className="mt-[5%] grid flex-1 grid-cols-2 gap-[3%]">
              {sides.slice(0, 2).map((block, index) => (
                <div key={index} className="rounded-[3%] px-[7%] py-[6%]" style={{ backgroundColor: index === 0 ? colors.soft : colors.panel, color: index === 0 ? colors.text : colors.onPanel }}>
                  <div className="text-[clamp(16px,2.1vw,25px)] font-black" style={{ color: colors.accent }}>{index === 0 ? "A" : "B"}</div>
                  <input
                    value={block.heading}
                    onChange={(event) => updateBlock(index, { heading: event.target.value })}
                    className={`${transparentInput} mt-[7%] text-[clamp(15px,2.1vw,26px)] font-black`}
                    aria-label={`对比标题 ${index + 1}`}
                  />
                  <textarea
                    value={block.body}
                    onChange={(event) => updateBlock(index, { body: event.target.value })}
                    className={`${transparentInput} mt-[7%] h-[47%] resize-none text-[clamp(12px,1.55vw,20px)] leading-[1.55]`}
                    aria-label={`对比内容 ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      }
      case "spotlight":
        return (
          <div className="relative flex h-full flex-col items-center justify-center px-[11%] text-center">
            <div className="absolute -bottom-[19%] -left-[7%] aspect-square w-[25%] rounded-full" style={{ backgroundColor: colors.accent }} />
            {kickerInput("absolute left-[7%] top-[7%] text-left text-[clamp(10px,.9vw,13px)] font-bold tracking-[.18em]")}
            <div className="absolute left-[7%] right-[7%] top-[14%]">{titleInput("text-left text-[clamp(15px,2.2vw,27px)] font-bold")}</div>
            {takeawayInput("h-[34%] text-center text-[clamp(24px,4.2vw,46px)] font-black leading-[1.28] tracking-[-.045em]")}
            {subtitleInput("mt-[4%] h-[14%] text-center text-[clamp(12px,1.55vw,20px)] leading-[1.55]")}
            <div className="mt-[3%] h-1 w-[14%]" style={{ backgroundColor: colors.accent }} />
          </div>
        )
      case "chart": {
        const max = Math.max(...slide.chart_data.map((datum) => datum.value), 1)
        return (
          <div className="flex h-full flex-col px-[6%] py-[5%]">
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            {titleInput("mt-[1.8%] text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
            <div className="mt-[4%] grid flex-1 grid-cols-[68%_32%] gap-[4%]">
              <div className="flex items-end gap-[3%] border-b px-[3%] pb-[3%]" style={{ borderColor: colors.soft }}>
                {slide.chart_data.map((item, index) => (
                  <label key={`${item.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                    <input
                      type="number"
                      value={item.value}
                      onChange={(event) => onChange({ chart_data: slide.chart_data.map((datum, datumIndex) => datumIndex === index ? { ...datum, value: Number(event.target.value) } : datum) })}
                      className={`${transparentInput} mb-1 text-center text-[clamp(11px,1.12vw,15px)] font-black`}
                      aria-label={`图表数值 ${index + 1}`}
                    />
                    <span className="mx-auto w-[78%] min-w-4 rounded-t-sm" style={{ height: `${Math.max(8, (Math.max(0, item.value) / max) * 74)}%`, backgroundColor: index === slide.chart_data.length - 1 ? colors.accent : colors.primary }} />
                    <input
                      value={item.label}
                      onChange={(event) => onChange({ chart_data: slide.chart_data.map((datum, datumIndex) => datumIndex === index ? { ...datum, label: event.target.value } : datum) })}
                      className={`${transparentInput} mt-2 text-center text-[clamp(10px,.96vw,12px)]`}
                      aria-label={`图表标签 ${index + 1}`}
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center rounded-[3%] px-[9%]" style={{ backgroundColor: colors.panel }}>
                {takeawayInput("h-[58%] text-[clamp(12px,1.8vw,22px)] font-black leading-[1.4]", true)}
              </div>
            </div>
          </div>
        )
      }
      case "summary":
        return (
          <div className="flex h-full flex-col">
            <div className="h-[14%] px-[6%] py-[4%]" style={{ backgroundColor: colors.panel }}>
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            </div>
            <div className="flex flex-1 flex-col px-[6%] py-[5%]">
              {titleInput("text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
              {takeawayInput("mt-[5%] h-[27%] text-[clamp(20px,3.2vw,38px)] font-black leading-[1.3] tracking-[-.04em]")}
              <div className="mt-auto grid grid-cols-3 gap-[4%]">
                {slide.bullets.slice(0, 3).map((bullet, index) => (
                  <div key={index}>
              <div className="text-[clamp(11px,1.25vw,16px)] font-black" style={{ color: colors.accent }}>{String(index + 1).padStart(2, "0")}</div>
              <div className="mt-[5%] text-[clamp(11px,1.3vw,17px)] font-bold leading-[1.5]">{bullet}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      case "qa":
        return (
          <div className="grid h-full grid-cols-[34%_66%] items-center px-[6%]">
            <div className="grid aspect-square w-[73%] place-items-center rounded-full text-[clamp(48px,8vw,88px)] font-black" style={{ backgroundColor: colors.panel, color: colors.onPanel }}>Q</div>
            <div>
            {kickerInput("text-[clamp(10px,.9vw,13px)] font-bold tracking-[.18em]")}
              {titleInput("mt-[6%] text-[clamp(24px,4vw,44px)] font-black leading-[1.2] tracking-[-.05em]")}
              {subtitleInput("mt-[6%] h-20 text-[clamp(12px,1.7vw,21px)] leading-[1.55]")}
              <div className="mt-[7%] h-1 w-[36%]" style={{ backgroundColor: colors.accent }} />
            </div>
          </div>
        )
      default:
        return (
          <div className="flex h-full flex-col px-[6%] py-[5%]">
            {kickerInput("text-[clamp(10px,.84vw,12px)] font-bold tracking-[.18em]")}
            {titleInput("mt-[1.8%] text-[clamp(19px,3vw,34px)] font-black tracking-[-.045em]")}
            <div className="mt-[5%] grid flex-1 grid-cols-[64%_36%] gap-[5%]">
              <div>
                {subtitleInput("h-[18%] text-[clamp(12px,1.55vw,20px)] leading-[1.5]")}
                {bulletsInput("mt-[6%] h-[66%] text-[clamp(12px,1.65vw,21px)] leading-[1.85]")}
              </div>
              <div className="flex items-center rounded-[3%] px-[10%]" style={{ backgroundColor: colors.panel }}>
                {takeawayInput("h-[58%] text-[clamp(13px,2vw,23px)] font-black leading-[1.4]", true)}
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div
      className="relative mx-auto aspect-video w-full max-w-[900px] overflow-hidden rounded-[22px] border border-[#CFC8B9] shadow-[0_18px_44px_rgba(24,35,45,.12)]"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      {contentByLayout()}
      <div className="pointer-events-none absolute bottom-[2.1%] left-[5.7%] max-w-[68%] truncate text-[clamp(10px,.88vw,12px)] opacity-45">
        来源：{slide.source}
      </div>
    </div>
  )
}
