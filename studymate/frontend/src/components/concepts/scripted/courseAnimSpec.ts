export type ScriptedCourseName = "数据结构与算法" | "操作系统" | "计算机网络" | "计算机组成原理"

export type ScriptedVisualKind = "flow" | "cycle" | "hierarchy" | "compare" | "timeline" | "table" | "network" | "memory"

export interface ScriptedNode {
  id: string
  label: string
  detail?: string
}

export interface ScriptedEdge {
  from: string
  to: string
  label?: string
}

export interface ScriptedStep {
  title: string
  caption: string
  active: string[]
  formula?: string
}

export interface ScriptedCourseSpec {
  key: string
  title: string
  course: ScriptedCourseName
  keywords: string[]
  blurb: string
  kind: ScriptedVisualKind
  nodes: ScriptedNode[]
  edges: ScriptedEdge[]
  steps: ScriptedStep[]
}

export type CompactStep = readonly [title: string, caption: string, activeNodeIndices: readonly number[], formula?: string]
export type CompactEdge = readonly [fromNodeIndex: number, toNodeIndex: number, label?: string]

export interface CompactCourseSpecInput {
  key: string
  title: string
  keywords: readonly string[]
  blurb: string
  kind: ScriptedVisualKind
  /** `标签::补充说明`；补充说明可省略。 */
  nodes: readonly string[]
  steps: readonly CompactStep[]
  /** 语义明确时显式传入；只有 flow / timeline / memory 会按节点顺序自动连边。 */
  edges?: readonly CompactEdge[]
}

function nodeId(key: string, index: number): string {
  return `${key}-n${index}`
}

export function defineCourseSpecs(course: ScriptedCourseName, inputs: readonly CompactCourseSpecInput[]): ScriptedCourseSpec[] {
  return inputs.map((input) => {
    const nodes = input.nodes.map((raw, index) => {
      const splitAt = raw.indexOf("::")
      return {
        id: nodeId(input.key, index),
        label: splitAt < 0 ? raw : raw.slice(0, splitAt),
        detail: splitAt < 0 ? undefined : raw.slice(splitAt + 2),
      }
    })
    const edges = (input.edges ?? []).map(([from, to, label]) => ({
      from: nodeId(input.key, from),
      to: nodeId(input.key, to),
      label,
    }))
    const steps = input.steps.map(([title, caption, activeIndices, formula]) => ({
      title,
      caption,
      active: activeIndices.map((index) => nodeId(input.key, index)),
      formula,
    }))
    return {
      key: input.key,
      title: input.title,
      course,
      keywords: [...input.keywords],
      blurb: input.blurb,
      kind: input.kind,
      nodes,
      edges,
      steps,
    }
  })
}
