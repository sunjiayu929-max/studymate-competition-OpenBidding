/**
 * 兼容知识库边界：底层沿用 current-course localStorage 与 config 拉取 hook。
 *
 * 各页面通过 useCurrentCourse() 订阅；切换调 setCurrentCourse() 或 clear。
 * useCourseConfig() 拉 /api/courses/{id}/config 拿示例题、persona、阅读源。
 * Workspace / RAG / Tests / TestCase 等 API 调用都从这里读 course_id。
 */
import { useEffect, useState, useSyncExternalStore } from "react"
import { apiGet } from "@/lib/api"

export interface CourseInfo {
  id: number
  name: string
  description?: string
  chunk_count?: number
  /** 仅用于前端课程目录展示，不对应后端课程表。 */
  is_showcase?: boolean
}

// 历史演示课程已移除。它们没有对应后端课程与知识库，继续展示会形成“能看到、不能训练”的假入口。
export const SHOWCASE_COURSES: CourseInfo[] = []

export function isShowcaseCourse(course: CourseInfo | null | undefined): boolean {
  return Boolean(course?.is_showcase || (course && course.id < 0))
}

export interface CourseConfig {
  id: number
  name: string
  description: string
  persona: string
  code_style: "ml" | "algorithm" | "pseudo" | "hardware"
  code_libs: string[]
  reading_sources: string[]
  sample_topics: string[]
  sample_questions: string[]
  syllabus_hint: string
  from_registry: boolean
}

/** 五大默认课程的兜底示例题，registry API 缺失时用。 */
const FALLBACK_SAMPLES: Record<string, { topics: string[]; questions: string[] }> = {
  机器学习: {
    topics: ["梯度下降", "PCA 主成分分析", "决策树", "K-Means 聚类", "Adam 优化器", "过拟合与正则化"],
    questions: ["梯度下降和牛顿法的区别？", "PCA 和 LDA 的核心区别？", "K-Means 怎么选 K？", "L1 / L2 正则化什么时候用哪个？"],
  },
  数据结构与算法: {
    topics: ["红黑树", "拓扑排序", "Dijkstra 最短路", "KMP 字符串匹配", "并查集", "线段树"],
    questions: ["红黑树和 AVL 树各适合什么场景？", "为什么 Dijkstra 不支持负权边？", "并查集的路径压缩 + 按秩合并复杂度是多少？", "Trie 和哈希表分别适合什么字符串问题？"],
  },
  操作系统: {
    topics: ["进程调度", "虚拟内存与页表", "信号量与互斥锁", "死锁四条件", "文件系统 inode", "中断与系统调用"],
    questions: ["进程和线程的本质区别？", "为什么需要虚拟内存？", "死锁的四个必要条件是什么，怎么破？", "上下文切换都换了哪些东西？"],
  },
  计算机网络: {
    topics: ["TCP 三次握手", "HTTPS 与 TLS", "DNS 解析过程", "拥塞控制", "NAT 与子网划分", "HTTP/2 与 HTTP/3"],
    questions: ["TCP 为什么三次握手不是两次？", "HTTPS 比 HTTP 多做了哪些步骤？", "DNS 递归查询和迭代查询的区别？", "拥塞控制和流量控制是同一回事吗？"],
  },
  计算机组成原理: {
    topics: ["流水线冒险", "Cache 替换策略", "虚地址翻译", "浮点数 IEEE 754", "CPU 取指执行周期", "原码反码补码"],
    questions: ["Cache 三种不命中类型分别怎么解决？", "流水线数据冒险有哪几种？怎么用 forwarding 解决？", "为什么计算机内部用补码表示负数？", "中断和异常有什么区别？"],
  },
}

/** 尚未绑定岗位知识库时的兼容示例。 */
export const DEFAULT_SAMPLE_TOPICS = FALLBACK_SAMPLES["机器学习"].topics
export const DEFAULT_SAMPLE_QUESTIONS = FALLBACK_SAMPLES["机器学习"].questions

export function fallbackSamplesFor(name: string | undefined): { topics: string[]; questions: string[] } {
  if (name && FALLBACK_SAMPLES[name]) return FALLBACK_SAMPLES[name]
  return FALLBACK_SAMPLES["机器学习"]
}

const STORAGE_KEY = "sm:current-course"

class CourseStore {
  private current: CourseInfo | null
  private listeners = new Set<() => void>()

  constructor() {
    this.current = this.loadFromStorage()
  }

  private loadFromStorage(): CourseInfo | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as CourseInfo
    } catch {
      return null
    }
  }

  private persist() {
    try {
      if (this.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  get = (): CourseInfo | null => this.current

  set(c: CourseInfo | null) {
    this.current = c
    this.persist()
    this.listeners.forEach((fn) => fn())
  }

  clear() {
    this.set(null)
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const courseStore = new CourseStore()

if (typeof window !== "undefined") {
  window.addEventListener("studymate:user-session-reset", () => courseStore.clear())
}

export function useCurrentCourse(): CourseInfo | null {
  return useSyncExternalStore(courseStore.subscribe, courseStore.get, courseStore.get)
}

export function setCurrentCourse(c: CourseInfo | null) {
  courseStore.set(c)
}

/** 兼容知识库查询串：course_id=X，未绑定时返回空串。 */
export function courseQuery(): string {
  const c = courseStore.get()
  return c && !isShowcaseCourse(c) ? `course_id=${c.id}` : ""
}

/** 拉当前岗位知识库的兼容配置（示例题 / persona / reading_sources）。
 *  - 未绑定岗位知识库 → 返回 null（页面用 fallback）
 *  - 网络/后端失败 → 也返回 null，由页面用 fallbackSamplesFor 兜底
 */
export function useCourseConfig(): CourseConfig | null {
  const course = useCurrentCourse()
  const [cfg, setCfg] = useState<CourseConfig | null>(null)

  useEffect(() => {
    if (!course || isShowcaseCourse(course)) {
      const frame = window.requestAnimationFrame(() => setCfg(null))
      return () => window.cancelAnimationFrame(frame)
    }
    let cancelled = false
    apiGet<CourseConfig>(`/courses/${course.id}/config`)
      .then((c) => {
        if (!cancelled) setCfg(c)
      })
      .catch(() => {
        if (!cancelled) setCfg(null)
      })
    return () => {
      cancelled = true
    }
  }, [course])

  return cfg
}
