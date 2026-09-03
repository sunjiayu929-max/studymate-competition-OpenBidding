import type PptxGenJS from "pptxgenjs"

export type PptLayout =
  | "cover"
  | "agenda"
  | "content"
  | "case"
  | "chart"
  | "process"
  | "comparison"
  | "spotlight"
  | "summary"
  | "qa"

export interface PptCitation {
  source: string
  page: number | null
  chunk_id: string | null
  kind: "course" | "private" | "topic"
}

export interface PptChartDatum {
  label: string
  value: number
}

export interface PptContentBlock {
  heading: string
  body: string
}

export interface PptSlideDraft {
  id: string
  title: string
  kicker: string
  subtitle: string
  takeaway: string
  bullets: string[]
  layout: PptLayout
  blocks: PptContentBlock[]
  source: string
  citations: PptCitation[]
  chart_data: PptChartDatum[]
}

export interface PptPalette {
  background: string
  primary: string
  accent: string
  text: string
  panel: string
  onPanel: string
  soft: string
}

type PptSlide = ReturnType<PptxGenJS["addSlide"]>

const PAGE_W = 13.333
const PAGE_H = 7.5
const TITLE_FONT = "Microsoft YaHei"

function blocksFor(slide: PptSlideDraft, limit = 4): PptContentBlock[] {
  if (slide.blocks.length) return slide.blocks.slice(0, limit)
  return slide.bullets.slice(0, limit).map((body, index) => ({
    heading: String(index + 1).padStart(2, "0"),
    body,
  }))
}

function addText(
  slide: PptSlide,
  text: string,
  options: Parameters<PptSlide["addText"]>[1],
) {
  if (!text.trim()) return
  slide.addText(text, options)
}

function addFooter(slide: PptSlide, draft: PptSlideDraft, index: number, total: number, palette: PptPalette) {
  const sourceX = draft.layout === "case" ? 4.82 : 0.72
  slide.addText(`${String(index + 1).padStart(2, "0")}  /  ${String(total).padStart(2, "0")}`, {
    x: 11.7,
    y: 7.16,
    w: 0.9,
    h: 0.14,
    fontFace: TITLE_FONT,
    fontSize: 7.5,
    bold: true,
    color: palette.primary,
    align: "right",
    margin: 0,
  })
  addText(slide, `来源：${draft.source}`, {
    x: sourceX,
    y: 7.16,
    w: 9.4,
    h: 0.14,
    fontFace: TITLE_FONT,
    fontSize: 6.5,
    color: palette.primary,
    margin: 0,
    breakLine: false,
  })
}

function addHeader(slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addText(slide, draft.kicker.toUpperCase(), {
    x: 0.72,
    y: 0.3,
    w: 5.8,
    h: 0.2,
    fontFace: TITLE_FONT,
    fontSize: 8,
    bold: true,
    charSpacing: 1.5,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 0.72,
    y: 0.58,
    w: 11.85,
    h: 0.64,
    fontFace: TITLE_FONT,
    fontSize: 30,
    bold: true,
    color: palette.text,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  })
}

function addCover(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.2,
    h: PAGE_H,
    fill: { color: palette.accent },
    line: { color: palette.accent },
  })
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 10.48,
    y: 0.12,
    w: 2.62,
    h: 2.62,
    fill: { color: palette.accent, transparency: 14 },
    line: { color: palette.accent, transparency: 100 },
  })
  slide.addShape(pptx.ShapeType.rect, {
    x: 9.62,
    y: 1.02,
    w: 3.05,
    h: 5.35,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, draft.kicker || "因材智训 STORY", {
    x: 0.82,
    y: 1.35,
    w: 5.6,
    h: 0.24,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 2,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 0.78,
    y: 1.83,
    w: 8.25,
    h: 1.65,
    fontFace: TITLE_FONT,
    fontSize: 48,
    bold: true,
    color: palette.text,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  })
  addText(slide, draft.subtitle, {
    x: 0.84,
    y: 3.65,
    w: 7.4,
    h: 0.8,
    fontFace: TITLE_FONT,
    fontSize: 18,
    color: palette.primary,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  })
  addText(slide, draft.takeaway, {
    x: 10.06,
    y: 3.72,
    w: 2.16,
    h: 1.25,
    fontFace: TITLE_FONT,
    fontSize: 20,
    bold: true,
    color: palette.onPanel,
    margin: 0,
    valign: "middle",
    fit: "shrink",
  })
  slide.addShape(pptx.ShapeType.line, {
    x: 0.84,
    y: 5.65,
    w: 1.35,
    h: 0,
    line: { color: palette.accent, width: 3 },
  })
  addText(slide, "因材智训  ·  EDITABLE DECK", {
    x: 0.84,
    y: 5.88,
    w: 4,
    h: 0.2,
    fontFace: TITLE_FONT,
    fontSize: 7.5,
    bold: true,
    charSpacing: 1.2,
    color: palette.primary,
    margin: 0,
  })
}

function addAgenda(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addHeader(slide, draft, palette)
  addText(slide, draft.subtitle, {
    x: 0.76,
    y: 1.34,
    w: 9.4,
    h: 0.36,
    fontFace: TITLE_FONT,
    fontSize: 14,
    color: palette.primary,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  })
  const blocks = blocksFor(draft)
  const itemWidth = 11.75 / Math.max(blocks.length, 1)
  blocks.forEach((block, index) => {
    const x = 0.76 + itemWidth * index
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.05,
      y: 2.32,
      w: itemWidth - 0.28,
      h: 0,
      line: { color: index === 0 ? palette.accent : palette.primary, transparency: index === 0 ? 0 : 64, width: 2 },
    })
    addText(slide, block.heading || String(index + 1).padStart(2, "0"), {
      x,
      y: 2.55,
      w: itemWidth - 0.24,
      h: 0.55,
      fontFace: TITLE_FONT,
      fontSize: 26,
      bold: true,
      color: index === 0 ? palette.accent : palette.primary,
      margin: 0,
    })
    addText(slide, block.body, {
      x,
      y: 3.25,
      w: itemWidth - 0.36,
      h: 1.65,
      fontFace: TITLE_FONT,
      fontSize: 17,
      bold: true,
      color: palette.text,
      margin: 0,
      valign: "top",
      fit: "shrink",
    })
  })
  addText(slide, draft.takeaway, {
    x: 0.76,
    y: 5.85,
    w: 10.8,
    h: 0.45,
    fontFace: TITLE_FONT,
    fontSize: 16,
    bold: true,
    color: palette.primary,
    margin: 0,
  })
}

function addContent(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addHeader(slide, draft, palette)
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.55,
    y: 1.58,
    w: 4.05,
    h: 4.85,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, draft.subtitle, {
    x: 0.8,
    y: 1.55,
    w: 6.9,
    h: 0.72,
    fontFace: TITLE_FONT,
    fontSize: 18,
    color: palette.primary,
    margin: 0,
    fit: "shrink",
  })
  if (draft.bullets.length) {
    slide.addText(draft.bullets.map((text) => ({ text, options: { bullet: { indent: 18 } } })), {
      x: 0.88,
      y: 2.55,
      w: 6.75,
      h: 3.45,
      fontFace: TITLE_FONT,
      fontSize: 18,
      breakLine: true,
      color: palette.text,
      paraSpaceAfter: 18,
      margin: 0,
      valign: "middle",
      fit: "shrink",
    })
  }
  addText(slide, "核心判断", {
    x: 9.02,
    y: 2.08,
    w: 2.8,
    h: 0.24,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.4,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.takeaway || draft.title, {
    x: 9.0,
    y: 2.65,
    w: 3.15,
    h: 2.55,
    fontFace: TITLE_FONT,
    fontSize: 24,
    bold: true,
    color: palette.onPanel,
    margin: 0,
    valign: "middle",
    fit: "shrink",
  })
}

function addCase(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 4.45,
    h: PAGE_H,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, draft.kicker || "CASE IN CONTEXT", {
    x: 0.72,
    y: 0.65,
    w: 3.1,
    h: 0.25,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.4,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 0.72,
    y: 1.18,
    w: 3.1,
    h: 1.65,
    fontFace: TITLE_FONT,
    fontSize: 31,
    bold: true,
    color: palette.onPanel,
    margin: 0,
    fit: "shrink",
  })
  addText(slide, draft.takeaway, {
    x: 0.72,
    y: 3.25,
    w: 3.05,
    h: 1.85,
    fontFace: TITLE_FONT,
    fontSize: 19,
    color: palette.onPanel,
    margin: 0,
    valign: "middle",
    fit: "shrink",
  })
  const blocks = blocksFor(draft, 3)
  blocks.forEach((block, index) => {
    const y = 1.1 + index * 1.75
    addText(slide, block.heading || String(index + 1).padStart(2, "0"), {
      x: 5.2,
      y,
      w: 1.5,
      h: 0.3,
      fontFace: TITLE_FONT,
      fontSize: 11,
      bold: true,
      color: palette.accent,
      margin: 0,
    })
    addText(slide, block.body, {
      x: 6.85,
      y: y - 0.05,
      w: 5.35,
      h: 1.05,
      fontFace: TITLE_FONT,
      fontSize: 18,
      bold: true,
      color: palette.text,
      margin: 0,
      valign: "top",
      fit: "shrink",
    })
    if (index < blocks.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 5.2,
        y: y + 1.25,
        w: 7,
        h: 0,
        line: { color: palette.primary, transparency: 75, width: 1 },
      })
    }
  })
}

function addProcess(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addHeader(slide, draft, palette)
  const blocks = blocksFor(draft)
  const count = Math.max(blocks.length, 1)
  const gap = 0.32
  const width = (11.85 - gap * (count - 1)) / count
  blocks.slice(0, 4).forEach((_block, index) => {
    if (index === blocks.length - 1) return
    slide.addShape(pptx.ShapeType.line, {
      x: 0.78 + width * (index + 1) + gap * index - 0.18,
      y: 2.34,
      w: gap + 0.36,
      h: 0,
      line: { color: palette.accent, transparency: 35, width: 2, endArrowType: "triangle" },
    })
  })
  blocks.slice(0, 4).forEach((block, index) => {
    const x = 0.76 + index * (width + gap)
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: 1.82,
      w: 1.05,
      h: 1.05,
      fill: { color: index === 0 ? palette.accent : palette.panel },
      line: { color: index === 0 ? palette.accent : palette.panel },
    })
    addText(slide, String(index + 1).padStart(2, "0"), {
      x,
      y: 2.12,
      w: 1.05,
      h: 0.24,
      fontFace: TITLE_FONT,
      fontSize: 13,
      bold: true,
      color: palette.onPanel,
      align: "center",
      margin: 0,
    })
    addText(slide, block.heading, {
      x,
      y: 3.2,
      w: width - 0.08,
      h: 0.6,
      fontFace: TITLE_FONT,
      fontSize: 20,
      bold: true,
      color: palette.text,
      margin: 0,
      fit: "shrink",
    })
    addText(slide, block.body, {
      x,
      y: 4.0,
      w: width - 0.12,
      h: 1.25,
      fontFace: TITLE_FONT,
      fontSize: 15,
      color: palette.primary,
      margin: 0,
      valign: "top",
      fit: "shrink",
    })
  })
  addText(slide, draft.takeaway, {
    x: 0.76,
    y: 5.9,
    w: 11.25,
    h: 0.45,
    fontFace: TITLE_FONT,
    fontSize: 16,
    bold: true,
    color: palette.primary,
    margin: 0,
  })
}

function addComparison(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addHeader(slide, draft, palette)
  const blocks = blocksFor(draft, 2)
  const sides = blocks.length >= 2 ? blocks : [
    { heading: "路径 A", body: draft.bullets[0] || draft.subtitle },
    { heading: "路径 B", body: draft.bullets[1] || draft.takeaway },
  ]
  sides.slice(0, 2).forEach((block, index) => {
    const x = index === 0 ? 0.76 : 6.82
    const panelColor = index === 0 ? palette.soft : palette.panel
    const bodyColor = index === 0 ? palette.text : palette.onPanel
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.62,
      w: 5.75,
      h: 4.75,
      fill: { color: panelColor },
      line: { color: panelColor },
    })
    addText(slide, index === 0 ? "A" : "B", {
      x: x + 0.4,
      y: 2.02,
      w: 0.5,
      h: 0.4,
      fontFace: TITLE_FONT,
      fontSize: 20,
      bold: true,
      color: index === 0 ? palette.accent : palette.accent,
      margin: 0,
    })
    addText(slide, block.heading, {
      x: x + 0.42,
      y: 2.65,
      w: 4.9,
      h: 0.65,
      fontFace: TITLE_FONT,
      fontSize: 25,
      bold: true,
      color: bodyColor,
      margin: 0,
      fit: "shrink",
    })
    addText(slide, block.body, {
      x: x + 0.42,
      y: 3.65,
      w: 4.75,
      h: 1.8,
      fontFace: TITLE_FONT,
      fontSize: 17,
      color: bodyColor,
      margin: 0,
      valign: "middle",
      fit: "shrink",
    })
  })
}

function addSpotlight(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 0.28,
    y: 4.42,
    w: 2.42,
    h: 2.42,
    fill: { color: palette.accent, transparency: 8 },
    line: { color: palette.accent, transparency: 100 },
  })
  addText(slide, draft.kicker || "ONE IDEA", {
    x: 0.85,
    y: 0.68,
    w: 5,
    h: 0.24,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.8,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 0.82,
    y: 1.08,
    w: 11.5,
    h: 0.62,
    fontFace: TITLE_FONT,
    fontSize: 27,
    bold: true,
    color: palette.primary,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  })
  addText(slide, draft.takeaway || draft.subtitle || draft.title, {
    x: 1.68,
    y: 2.05,
    w: 10.05,
    h: 2.25,
    fontFace: TITLE_FONT,
    fontSize: 35,
    bold: true,
    color: palette.text,
    align: "center",
    valign: "middle",
    margin: 0,
    fit: "shrink",
  })
  addText(slide, draft.subtitle, {
    x: 2.2,
    y: 4.72,
    w: 8.9,
    h: 0.85,
    fontFace: TITLE_FONT,
    fontSize: 17,
    color: palette.primary,
    align: "center",
    margin: 0,
    fit: "shrink",
  })
  slide.addShape(pptx.ShapeType.line, {
    x: 5.78,
    y: 5.88,
    w: 1.8,
    h: 0,
    line: { color: palette.accent, width: 3 },
  })
}

function addChart(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  addHeader(slide, draft, palette)
  const data = draft.chart_data.slice(0, 6)
  if (!data.length) {
    addContent(pptx, slide, draft, palette)
    return
  }
  const maxValue = Math.max(...data.map((item) => item.value), 1)
  const chartWidth = 7.25
  const gap = 0.2
  const barWidth = (chartWidth - gap * (data.length - 1)) / data.length
  slide.addShape(pptx.ShapeType.line, {
    x: 0.9,
    y: 5.75,
    w: 7.25,
    h: 0,
    line: { color: palette.primary, transparency: 60, width: 1 },
  })
  data.forEach((item, itemIndex) => {
    const barHeight = Math.max(0.2, (Math.max(0, item.value) / maxValue) * 3.45)
    const x = 0.9 + itemIndex * (barWidth + gap)
    const y = 5.75 - barHeight
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: barWidth,
      h: barHeight,
      fill: { color: itemIndex === data.length - 1 ? palette.accent : palette.primary, transparency: itemIndex === data.length - 1 ? 0 : 12 },
      line: { color: itemIndex === data.length - 1 ? palette.accent : palette.primary },
    })
    addText(slide, String(item.value), {
      x,
      y: y - 0.36,
      w: barWidth,
      h: 0.26,
      fontFace: TITLE_FONT,
      fontSize: 12,
      bold: true,
      color: palette.text,
      align: "center",
      margin: 0,
    })
    addText(slide, item.label, {
      x,
      y: 5.9,
      w: barWidth,
      h: 0.35,
      fontFace: TITLE_FONT,
      fontSize: 9,
      color: palette.primary,
      align: "center",
      margin: 0,
      fit: "shrink",
    })
  })
  slide.addShape(pptx.ShapeType.rect, {
    x: 8.68,
    y: 1.68,
    w: 3.9,
    h: 4.7,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, "数据说明了什么", {
    x: 9.08,
    y: 2.15,
    w: 2.9,
    h: 0.25,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.2,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.takeaway || draft.subtitle, {
    x: 9.06,
    y: 2.72,
    w: 3.05,
    h: 2.25,
    fontFace: TITLE_FONT,
    fontSize: 23,
    bold: true,
    color: palette.onPanel,
    margin: 0,
    valign: "middle",
    fit: "shrink",
  })
}

function addSummary(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: PAGE_W,
    h: 1.05,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, draft.kicker || "TAKE IT FORWARD", {
    x: 0.78,
    y: 0.41,
    w: 4.5,
    h: 0.24,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.6,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 0.78,
    y: 1.55,
    w: 11.8,
    h: 0.7,
    fontFace: TITLE_FONT,
    fontSize: 31,
    bold: true,
    color: palette.text,
    margin: 0,
    fit: "shrink",
  })
  addText(slide, draft.takeaway || draft.subtitle, {
    x: 0.82,
    y: 2.58,
    w: 10.75,
    h: 1.4,
    fontFace: TITLE_FONT,
    fontSize: 30,
    bold: true,
    color: palette.primary,
    margin: 0,
    valign: "middle",
    fit: "shrink",
  })
  const bullets = draft.bullets.slice(0, 3)
  bullets.forEach((text, index) => {
    const x = 0.82 + index * 4.05
    addText(slide, String(index + 1).padStart(2, "0"), {
      x,
      y: 4.58,
      w: 0.7,
      h: 0.3,
      fontFace: TITLE_FONT,
      fontSize: 14,
      bold: true,
      color: palette.accent,
      margin: 0,
    })
    addText(slide, text, {
      x,
      y: 5.05,
      w: 3.5,
      h: 0.95,
      fontFace: TITLE_FONT,
      fontSize: 17,
      bold: true,
      color: palette.text,
      margin: 0,
      fit: "shrink",
    })
  })
}

function addQa(pptx: PptxGenJS, slide: PptSlide, draft: PptSlideDraft, palette: PptPalette) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 0.72,
    y: 0.75,
    w: 3.2,
    h: 3.2,
    fill: { color: palette.panel },
    line: { color: palette.panel },
  })
  addText(slide, "Q", {
    x: 0.72,
    y: 1.32,
    w: 3.2,
    h: 1.55,
    fontFace: TITLE_FONT,
    fontSize: 72,
    bold: true,
    color: palette.onPanel,
    align: "center",
    margin: 0,
  })
  addText(slide, draft.kicker || "OPEN QUESTION", {
    x: 4.7,
    y: 1.0,
    w: 4.8,
    h: 0.25,
    fontFace: TITLE_FONT,
    fontSize: 9,
    bold: true,
    charSpacing: 1.6,
    color: palette.accent,
    margin: 0,
  })
  addText(slide, draft.title, {
    x: 4.68,
    y: 1.48,
    w: 7.55,
    h: 1.25,
    fontFace: TITLE_FONT,
    fontSize: 35,
    bold: true,
    color: palette.text,
    margin: 0,
    fit: "shrink",
  })
  addText(slide, draft.subtitle || draft.takeaway, {
    x: 4.72,
    y: 3.1,
    w: 6.9,
    h: 1.3,
    fontFace: TITLE_FONT,
    fontSize: 20,
    color: palette.primary,
    margin: 0,
    fit: "shrink",
  })
  slide.addShape(pptx.ShapeType.line, {
    x: 4.72,
    y: 5.12,
    w: 5.4,
    h: 0,
    line: { color: palette.accent, width: 3 },
  })
  addText(slide, draft.takeaway, {
    x: 4.72,
    y: 5.38,
    w: 6.7,
    h: 0.65,
    fontFace: TITLE_FONT,
    fontSize: 16,
    bold: true,
    color: palette.text,
    margin: 0,
    fit: "shrink",
  })
}

export function populateEditableDeck(
  pptx: PptxGenJS,
  slides: PptSlideDraft[],
  options: { topic: string; palette: PptPalette },
) {
  const { palette, topic } = options
  pptx.layout = "LAYOUT_WIDE"
  pptx.author = "因材智训"
  pptx.subject = topic
  pptx.title = topic
  pptx.company = "因材智训"
  pptx.theme = {
    headFontFace: TITLE_FONT,
    bodyFontFace: TITLE_FONT,
  }
  slides.forEach((draft, index) => {
    const slide = pptx.addSlide()
    slide.background = { color: palette.background }
    switch (draft.layout) {
      case "cover":
        addCover(pptx, slide, draft, palette)
        break
      case "agenda":
        addAgenda(pptx, slide, draft, palette)
        break
      case "case":
        addCase(pptx, slide, draft, palette)
        break
      case "chart":
        addChart(pptx, slide, draft, palette)
        break
      case "process":
        addProcess(pptx, slide, draft, palette)
        break
      case "comparison":
        addComparison(pptx, slide, draft, palette)
        break
      case "spotlight":
        addSpotlight(pptx, slide, draft, palette)
        break
      case "summary":
        addSummary(pptx, slide, draft, palette)
        break
      case "qa":
        addQa(pptx, slide, draft, palette)
        break
      default:
        addContent(pptx, slide, draft, palette)
    }
    addFooter(slide, draft, index, slides.length, palette)
    if (draft.citations.length) {
      slide.addNotes(
        `[Sources]\n${draft.citations.map((citation) => (
          `- ${citation.source}${citation.page ? `，第 ${citation.page} 页` : ""}${citation.chunk_id ? `，chunk ${citation.chunk_id}` : ""}`
        )).join("\n")}\n[/Sources]`,
      )
    }
  })
  return pptx
}
