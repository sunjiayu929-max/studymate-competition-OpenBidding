"""课程配置中心 —— 多课程架构的"persona/code_style/示例题"单一数据源。

每门课提供：
- name: 课程名（和 DB Course.name 对应）
- persona: agent system prompt 的角色短语（"……课程助教"），各 agent 拼装时直接 f-string 进去
- code_style: CodeAgent 的代码风格分支 → ml / algorithm / pseudo / hardware
- code_libs: 提示 LLM 优先使用哪些库 / 范式（CodeAgent 用）
- reading_sources: 拓展阅读优先推荐的来源（ReadingAgent 用）
- sample_topics: 前端 Workspace 示例题 6 个
- sample_questions: 前端 TutorChat / RagDemo 示例问题 4 个
- syllabus_hint: 出现在课程介绍卡 + LLM 兜底当大纲（数据结构与算法 / 操作系统 等）

这一份配置同时被：
- 后端 agent 注入 ctx["course_cfg"]
- 前端 /api/courses/{id}/config 拉去渲染示例题

⚠️ DB 里没有的课程仍然可以工作（fallback 到 DEFAULT_CFG）。
"""
from __future__ import annotations
from dataclasses import dataclass, asdict, field
from typing import Literal, Optional


CodeStyle = Literal["ml", "algorithm", "pseudo", "hardware"]


@dataclass
class CourseConfig:
    name: str
    persona: str
    code_style: CodeStyle
    code_libs: list[str]
    reading_sources: list[str]
    sample_topics: list[str]
    sample_questions: list[str]
    syllabus_hint: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ===== 五大核心课程 =====

_ML = CourseConfig(
    name="机器学习",
    persona="机器学习课程助教，擅长用直觉 + 公式 + 代码三段式讲清楚算法",
    code_style="ml",
    code_libs=["numpy", "sklearn", "matplotlib（按需）"],
    reading_sources=[
        "周志华《机器学习》（西瓜书）",
        "吴恩达 CS229 / Coursera 讲义",
        "scikit-learn 官方文档",
        "Distill.pub 可视化博客",
        "Papers with Code",
        "3Blue1Brown 数学可视化",
    ],
    sample_topics=["梯度下降", "PCA 主成分分析", "决策树", "K-Means 聚类", "Adam 优化器", "过拟合与正则化"],
    sample_questions=[
        "梯度下降和牛顿法的区别？",
        "PCA 和 LDA 的核心区别？",
        "K-Means 怎么选 K？",
        "L1 / L2 正则化什么时候用哪个？",
    ],
    syllabus_hint="监督 / 无监督 / 模型评估 / 优化 / 神经网络基础",
)

_DSA = CourseConfig(
    name="数据结构与算法",
    persona="数据结构与算法课程助教，擅长画图 + 推导复杂度 + 给最简实现",
    code_style="algorithm",
    code_libs=["C++17 STL（vector / unordered_map / priority_queue / deque / algorithm）"],
    reading_sources=[
        "《算法导论》(CLRS)",
        "邓俊辉《数据结构》",
        "《算法（第四版）》(Sedgewick)",
        "LeetCode 题解",
        "Geeks for Geeks",
        "可视化网站 visualgo.net",
    ],
    sample_topics=["红黑树", "拓扑排序", "Dijkstra 最短路", "KMP 字符串匹配", "并查集", "线段树"],
    sample_questions=[
        "红黑树和 AVL 树各适合什么场景？",
        "为什么 Dijkstra 不支持负权边？",
        "并查集的路径压缩 + 按秩合并复杂度是多少？",
        "Trie 和哈希表分别适合什么字符串问题？",
    ],
    syllabus_hint="线性结构 / 树 / 图 / 排序 / 查找 / 字符串 / 经典算法",
)

_OS = CourseConfig(
    name="操作系统",
    persona="操作系统课程助教，擅长把抽象概念类比成日常场景（如：进程=餐厅厨师）",
    code_style="pseudo",
    code_libs=["伪代码（C 风格语法 + 中文注释）"],
    reading_sources=[
        "《操作系统导论》(OSTEP)",
        "《现代操作系统》(Tanenbaum)",
        "MIT 6.S081 xv6 课程",
        "《Linux 内核设计与实现》",
        "Brian Kernighan《Unix 编程艺术》",
    ],
    sample_topics=["进程调度", "虚拟内存与页表", "信号量与互斥锁", "死锁四条件", "文件系统 inode", "中断与系统调用"],
    sample_questions=[
        "进程和线程的本质区别？",
        "为什么需要虚拟内存？",
        "死锁的四个必要条件是什么，怎么破？",
        "上下文切换都换了哪些东西？",
    ],
    syllabus_hint="进程线程 / 调度 / 内存管理 / 文件 / I/O / 同步互斥",
)

_NET = CourseConfig(
    name="计算机网络",
    persona="计算机网络课程助教，擅长按 OSI / TCP-IP 分层讲，对比有线/无线、IPv4/v6",
    code_style="pseudo",
    code_libs=["伪代码（socket / 报文结构示意）", "可选少量 Python socket 片段"],
    reading_sources=[
        "《计算机网络：自顶向下方法》(Kurose)",
        "谢希仁《计算机网络》",
        "《TCP/IP 详解 卷一》(Stevens)",
        "RFC 文档（如 RFC 793 TCP）",
        "Wireshark 官方教程",
    ],
    sample_topics=["TCP 三次握手", "HTTPS 与 TLS", "DNS 解析过程", "拥塞控制", "NAT 与子网划分", "HTTP/2 与 HTTP/3"],
    sample_questions=[
        "TCP 为什么三次握手不是两次？",
        "HTTPS 比 HTTP 多做了哪些步骤？",
        "DNS 递归查询和迭代查询的区别？",
        "拥塞控制和流量控制是同一回事吗？",
    ],
    syllabus_hint="物理 / 链路 / 网络 / 传输 / 应用 五层；TCP/UDP/IP/HTTP/DNS",
)

_COA = CourseConfig(
    name="计算机组成原理",
    persona="计算机组成原理课程助教，擅长用流水线时序图 + 真值表讲清楚硬件细节",
    code_style="hardware",
    code_libs=["RISC-V / x86 汇编片段", "简单 Verilog 模块", "时序图 / 真值表"],
    reading_sources=[
        "《深入理解计算机系统》(CSAPP)",
        "唐朔飞《计算机组成原理》",
        "Patterson & Hennessy 《计算机组成与设计：硬件/软件接口》",
        "RISC-V 官方手册",
        "B 站 mooc 哈工大计组",
    ],
    sample_topics=["流水线冒险", "Cache 替换策略", "虚地址翻译", "浮点数 IEEE 754", "CPU 取指执行周期", "原码反码补码"],
    sample_questions=[
        "Cache 三种不命中类型分别怎么解决？",
        "流水线数据冒险有哪几种？怎么用 forwarding 解决？",
        "为什么计算机内部用补码表示负数？",
        "中断和异常有什么区别？",
    ],
    syllabus_hint="数据表示 / 运算器 / 存储器 / 指令系统 / CPU / 总线 / I/O",
)


COURSES: dict[str, CourseConfig] = {
    _ML.name: _ML,
    _DSA.name: _DSA,
    _OS.name: _OS,
    _NET.name: _NET,
    _COA.name: _COA,
}

DEFAULT_COURSE_NAME = "机器学习"


def get_course_by_name(name: Optional[str]) -> CourseConfig:
    """精确匹配课程名；找不到 → 返回机器学习兜底（保证向后兼容现有数据 + 单课流程）。"""
    if name and name in COURSES:
        return COURSES[name]
    return COURSES[DEFAULT_COURSE_NAME]


async def get_course_by_id(course_id: Optional[int]) -> CourseConfig:
    """通过 course_id 拉 DB 拿 name，再查 registry。无 id / 找不到 → 兜底默认。"""
    if course_id is None:
        return COURSES[DEFAULT_COURSE_NAME]
    # 延迟 import 避免循环依赖
    from sqlalchemy import select
    from app.db import async_session_maker
    from app.db.models import Course
    async with async_session_maker() as db:
        q = await db.execute(select(Course).where(Course.id == course_id))
        c = q.scalar_one_or_none()
    return get_course_by_name(c.name if c else None)


def get_course_config(course_or_name: int | str | None) -> CourseConfig:
    """同步版本：name 直接查；id 不查 DB（用于 ctx 已带 name 的场景）。"""
    if isinstance(course_or_name, str):
        return get_course_by_name(course_or_name)
    return COURSES[DEFAULT_COURSE_NAME]


def list_course_names() -> list[str]:
    return list(COURSES.keys())
