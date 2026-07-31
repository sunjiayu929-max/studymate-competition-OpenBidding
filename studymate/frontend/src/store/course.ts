/**
 * 多课程：当前课程的 localStorage 单例 store + config 拉取 hook。
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

export const SHOWCASE_COURSES: CourseInfo[] = [
  { id: -1, name: "数据库系统", description: "关系模型、SQL、事务与数据库设计", is_showcase: true },
  { id: -2, name: "编译原理", description: "词法分析、语法树、优化与代码生成", is_showcase: true },
  { id: -3, name: "软件工程", description: "需求分析、架构设计、测试与持续交付", is_showcase: true },
  { id: -4, name: "计算机图形学", description: "几何变换、光照、渲染与交互图形", is_showcase: true },
  { id: -5, name: "信息安全", description: "密码学、身份认证、网络防护与安全工程", is_showcase: true },
  { id: -6, name: "人工智能导论", description: "搜索、推理、机器学习与智能系统", is_showcase: true },
  { id: -7, name: "分布式系统", description: "一致性、容错、共识与可扩展服务", is_showcase: true },
  { id: -8, name: "嵌入式系统", description: "微控制器、实时系统与软硬件协同", is_showcase: true },
  { id: -9, name: "计算机体系结构", description: "处理器性能、存储层次与并行计算", is_showcase: true },
  { id: -10, name: "程序设计语言", description: "语言范式、类型系统、运行时与抽象机制", is_showcase: true },
]

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

/** 没选课时的全局默认示例（保持原版机器学习风格）。 */
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

/** 课程查询串：course_id=X，没选课时返回空串。 */
export function courseQuery(): string {
  const c = courseStore.get()
  return c && !isShowcaseCourse(c) ? `course_id=${c.id}` : ""
}

/** 拉当前课程的配置（示例题 / persona / reading_sources）。
 *  - 没选课 → 返回 null（页面用 fallback）
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
