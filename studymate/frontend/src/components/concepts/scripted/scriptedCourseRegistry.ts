import type { ConceptAnim } from "../registry"
import { createScriptedCourseAnim } from "./ScriptedCourseAnim"
import type { ScriptedCourseName, ScriptedCourseSpec } from "./courseAnimSpec"
import { DATA_STRUCTURES_SPECS } from "./dataStructuresSpecs"
import { OPERATING_SYSTEM_SPECS } from "./operatingSystemsSpecs"
import { NETWORK_SPECS } from "./networkSpecs"
import { ARCHITECTURE_SPECS } from "./architectureSpecs"

const BADGE_CLASS: Record<ScriptedCourseName, string> = {
  数据结构与算法: "border border-[#CFD8CA] bg-[#E9EEE6] text-[#557052]",
  操作系统: "border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]",
  计算机网络: "border border-[#C8D1D8] bg-[#E7EDF3] text-[#315E83]",
  计算机组成原理: "border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]",
}

const EXPECTED_COUNTS: Record<ScriptedCourseName, number> = {
  数据结构与算法: 36,
  操作系统: 58,
  计算机网络: 58,
  计算机组成原理: 58,
}

export const SCRIPTED_COURSE_SPECS: ScriptedCourseSpec[] = [
  ...DATA_STRUCTURES_SPECS,
  ...OPERATING_SYSTEM_SPECS,
  ...NETWORK_SPECS,
  ...ARCHITECTURE_SPECS,
]

function validateSpecs(specs: ScriptedCourseSpec[]) {
  const errors: string[] = []
  const keys = new Set<string>()
  const titles = new Set<string>()
  const counts = new Map<ScriptedCourseName, number>()

  for (const spec of specs) {
    counts.set(spec.course, (counts.get(spec.course) ?? 0) + 1)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.key)) errors.push(`${spec.key}: key 必须是 kebab-case`)
    if (keys.has(spec.key)) errors.push(`${spec.key}: key 重复`)
    if (titles.has(spec.title)) errors.push(`${spec.key}: title 重复「${spec.title}」`)
    keys.add(spec.key)
    titles.add(spec.title)
    if (spec.keywords.length < 3) errors.push(`${spec.key}: keywords 少于 3 个`)
    if (spec.nodes.length < 4) errors.push(`${spec.key}: nodes 少于 4 个`)
    if (spec.steps.length < 4) errors.push(`${spec.key}: steps 少于 4 步`)
    if (spec.blurb.trim().length < 12) errors.push(`${spec.key}: blurb 过短`)

    const nodeIds = new Set(spec.nodes.map((node) => node.id))
    if (nodeIds.size !== spec.nodes.length) errors.push(`${spec.key}: node id 重复`)
    spec.edges.forEach((edge) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`${spec.key}: edge 引用不存在节点`)
    })
    spec.steps.forEach((step, stepIndex) => {
      if (!step.title.trim() || step.caption.trim().length < 12) errors.push(`${spec.key}: 第 ${stepIndex + 1} 步文案为空或过短`)
      if (!step.active.length) errors.push(`${spec.key}: 第 ${stepIndex + 1} 步没有 active 节点`)
      step.active.forEach((id) => {
        if (!nodeIds.has(id)) errors.push(`${spec.key}: 第 ${stepIndex + 1} 步引用不存在节点 ${id}`)
      })
    })
  }

  for (const [course, expected] of Object.entries(EXPECTED_COUNTS) as [ScriptedCourseName, number][]) {
    const actual = counts.get(course) ?? 0
    if (actual !== expected) errors.push(`${course}: 应为 ${expected} 项，实际 ${actual} 项`)
  }
  if (specs.length !== 210) errors.push(`脚本动画总数应为 210，实际 ${specs.length}`)
  if (errors.length) throw new Error(`脚本动画规格校验失败：\n${errors.join("\n")}`)
}

validateSpecs(SCRIPTED_COURSE_SPECS)

export const SCRIPTED_COURSE_ANIMS: ConceptAnim[] = SCRIPTED_COURSE_SPECS.map((spec) => ({
  key: spec.key,
  title: spec.title,
  course: spec.course,
  badgeClass: BADGE_CLASS[spec.course],
  matchKeywords: spec.keywords,
  blurb: spec.blurb,
  lectureReady: true,
  component: createScriptedCourseAnim(spec),
}))
