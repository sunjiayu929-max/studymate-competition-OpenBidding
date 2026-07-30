import assert from "node:assert/strict"
import { readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import PptxGenJS from "pptxgenjs"

import { populateEditableDeck } from "../src/lib/pptDeck.ts"

const requestedOutput = process.env.PPTX_SAMPLE_OUTPUT
const output = requestedOutput || join(tmpdir(), `studymate-pptx-smoke-${Date.now()}.pptx`)
const citation = {
  source: "机器学习课程 · 梯度下降",
  page: 12,
  chunk_id: "smoke-gradient-descent",
  kind: "course",
}
const base = {
  source: "机器学习课程 · 第 12 页",
  citations: [citation],
  chart_data: [],
}
const slides = [
  {
    ...base,
    id: "cover",
    layout: "cover",
    kicker: "机器学习 · 课堂讲解",
    title: "梯度下降不是“往下走”那么简单",
    subtitle: "从方向、步长和反馈三个角度，建立可迁移的优化直觉",
    takeaway: "每一步都在回答：怎样更接近我们真正想要的结果？",
    bullets: [],
    blocks: [],
  },
  {
    ...base,
    id: "agenda",
    layout: "agenda",
    kicker: "LEARNING JOURNEY",
    title: "先看问题，再拆开算法",
    subtitle: "四个问题连成一条从直觉到应用的路径。",
    takeaway: "每一页只解决一个关键问题。",
    bullets: [],
    blocks: [
      { heading: "01", body: "为什么需要迭代" },
      { heading: "02", body: "方向从哪里来" },
      { heading: "03", body: "步长怎样选择" },
      { heading: "04", body: "何时应该停下" },
    ],
  },
  {
    ...base,
    id: "spotlight",
    layout: "spotlight",
    kicker: "ONE IDEA",
    title: "先建立一个不会被公式淹没的判断",
    subtitle: "梯度给方向，学习率决定你对这个方向有多信任。",
    takeaway: "优化不是一步命中，而是在反馈中持续修正。",
    bullets: [],
    blocks: [],
  },
  {
    ...base,
    id: "content",
    layout: "content",
    kicker: "DIRECTION",
    title: "负梯度指出局部下降最快的方向",
    subtitle: "它回答“下一步往哪走”，却没有承诺一步就到达全局最优。",
    takeaway: "方向是局部的，判断必须持续更新。",
    bullets: ["当前位置决定当前梯度", "每次更新后重新计算", "曲率会改变有效步长"],
    blocks: [],
  },
  {
    ...base,
    id: "process",
    layout: "process",
    kicker: "THE LOOP",
    title: "一次更新由四个动作闭环完成",
    subtitle: "",
    takeaway: "真正驱动学习的不是某一步，而是这个反馈循环。",
    bullets: [],
    blocks: [
      { heading: "观察误差", body: "计算当前预测与目标之间的差距。" },
      { heading: "求取梯度", body: "判断哪些参数对误差最敏感。" },
      { heading: "更新参数", body: "沿负梯度方向移动一个学习率。" },
      { heading: "重新评估", body: "检查误差是否下降并进入下一轮。" },
    ],
  },
  {
    ...base,
    id: "comparison",
    layout: "comparison",
    kicker: "STEP SIZE",
    title: "学习率过大与过小，会以不同方式浪费训练",
    subtitle: "",
    takeaway: "",
    bullets: [],
    blocks: [
      { heading: "过小：稳定但迟缓", body: "每次更新都很谨慎，损失下降缓慢，训练时间被拉长。" },
      { heading: "过大：快速但失控", body: "更新跨过低点并来回震荡，甚至让损失持续上升。" },
    ],
  },
  {
    ...base,
    id: "case",
    layout: "case",
    kicker: "CASE IN CONTEXT",
    title: "看到损失震荡，先别急着换模型",
    subtitle: "",
    takeaway: "训练曲线是在告诉你：当前更新策略与地形不匹配。",
    bullets: [],
    blocks: [
      { heading: "现象", body: "损失下降一段后反复上升，波动幅度没有缩小。" },
      { heading: "判断", body: "学习率可能过大，更新在低点两侧不断跨越。" },
      { heading: "行动", body: "降低初始学习率，或引入随训练衰减的调度策略。" },
    ],
  },
  {
    ...base,
    id: "chart",
    layout: "chart",
    kicker: "EVIDENCE",
    title: "同一任务中，误差随迭代持续下降",
    subtitle: "",
    takeaway: "下降趋势比某一次的绝对值更能说明优化是否稳定。",
    bullets: [],
    blocks: [],
    chart_data: [
      { label: "初始", value: 92 },
      { label: "第 10 轮", value: 61 },
      { label: "第 20 轮", value: 39 },
      { label: "第 30 轮", value: 24 },
    ],
  },
  {
    ...base,
    id: "qa",
    layout: "qa",
    kicker: "OPEN QUESTION",
    title: "如果损失不再下降，你会先检查什么？",
    subtitle: "从数据、梯度、学习率和停止条件中选择一个起点，并说明理由。",
    takeaway: "诊断训练过程，比盲目增加训练轮数更重要。",
    bullets: [],
    blocks: [],
  },
  {
    ...base,
    id: "summary",
    layout: "summary",
    kicker: "TAKE IT FORWARD",
    title: "把梯度下降看成反馈系统",
    subtitle: "",
    takeaway: "方向、步长和重新评估，共同决定优化能否稳定接近目标。",
    bullets: ["解释一次完整更新", "比较两种学习率现象", "用训练曲线提出诊断"],
    blocks: [],
  },
]
const palette = {
  background: "F7F1E5",
  primary: "1D4A5F",
  accent: "D08A25",
  text: "12212B",
  panel: "173B4E",
  onPanel: "FFFDF8",
  soft: "DCE7E8",
}

const pptx = populateEditableDeck(new PptxGenJS(), slides, {
  topic: "梯度下降",
  palette,
})

try {
  await pptx.writeFile({ fileName: output })
  const header = readFileSync(output).subarray(0, 2).toString("ascii")
  assert.equal(header, "PK")
  assert.ok(statSync(output).size > 25_000)
  console.log(`pptx-export-check: 10 editable visual layouts written to ${output}`)
} finally {
  if (!requestedOutput) rmSync(output, { force: true })
}
