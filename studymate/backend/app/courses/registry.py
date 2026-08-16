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
    code_libs=["numpy", "scipy", "pandas", "sklearn", "matplotlib", "seaborn", "pillow"],
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
    code_libs=["伪代码（socket / 报文结构示意）", "Python 标准库 socket", "networkx（拓扑示意）"],
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

_FDE = CourseConfig(
    name="FDE 岗位知识库",
    persona="前线部署工程师岗位训练助理，优先依据岗位知识库澄清需求、部署约束、验收证据与风险边界",
    code_style="pseudo",
    code_libs=["Python", "SQL", "REST API", "部署与验收检查表"],
    reading_sources=["FDE 岗位知识库（已导入）"],
    sample_topics=["FDE 岗位边界与交付结果", "需求澄清如何形成可验证价值假设", "现场数据接入与接口联调依赖清单", "部署验收如何保留业务结果与运行证据", "产品反馈如何沉淀为可复用能力"],
    sample_questions=[
        "FDE 和售前、外包有什么区别？",
        "客户现场部署前要确认哪些依赖？",
        "如何定义一个可验收的最小交付闭环？",
        "现场问题如何沉淀为产品改进？",
    ],
    syllabus_hint="岗位边界 / 场景调研 / 系统集成 / 部署激活 / 验收复盘 / 风险与产品反馈",
)


def _role_course(
    role: str,
    persona: str,
    code_style: CodeStyle,
    libs: list[str],
    topics: list[str],
    questions: list[str],
    hint: str,
) -> CourseConfig:
    return CourseConfig(
        name=f"{role} 岗位知识库",
        persona=persona,
        code_style=code_style,
        code_libs=libs,
        reading_sources=[f"{role} 岗位知识库（用户提供资料，已导入）"],
        sample_topics=topics,
        sample_questions=questions,
        syllabus_hint=hint,
    )


_ROLE_COURSES = [
    _role_course("AI Agent 开发工程师", "AI Agent 开发岗位训练助理，优先依据已导入资料说明工作流、工具调用、评测和风险边界", "pseudo", ["Python", "LLM API", "Agent 工作流"], ["Agent 设计", "工具调用", "评测", "安全"], ["Agent 如何拆解任务？", "工具调用应如何验证？"], "Agent 架构 / 工具调用 / 记忆 / 评测 / 安全"),
    _role_course("AI Infra 工程师", "AI Infra 岗位训练助理，优先依据已导入资料说明算力、训练/推理平台与可靠性", "pseudo", ["Python", "Docker", "Kubernetes"], ["训练平台", "推理服务", "资源调度", "监控"], ["训练任务怎样调度？", "推理服务如何保障稳定？"], "算力资源 / 平台工程 / 调度 / 推理 / 监控"),
    _role_course("具身智能算法工程师", "具身智能岗位训练助理，优先依据已导入资料说明感知、规划、控制和实机验证", "ml", ["Python", "PyTorch", "ROS"], ["感知", "规划", "控制", "仿真"], ["仿真到实机如何验证？", "如何处理感知误差？"], "视觉感知 / 运动规划 / 控制 / 仿真 / 实机安全"),
    _role_course("大模型安全工程师", "大模型安全岗位训练助理，优先依据已导入资料说明风险评测、权限、对抗和治理", "pseudo", ["Python", "安全测试", "审计日志"], ["提示注入", "数据泄露", "权限", "红队评测"], ["如何测试提示注入？", "什么情况下应拒答？"], "风险识别 / 攻击测试 / 数据与权限 / 审计 / 响应"),
    _role_course("大模型应用开发工程师", "大模型应用岗位训练助理，优先依据已导入资料说明 RAG、工作流、评测和成本控制", "pseudo", ["Python", "LLM API", "向量检索"], ["RAG", "Agent", "评测", "成本"], ["RAG 如何避免无依据回答？", "如何评估应用改动？"], "应用架构 / RAG / 工作流 / 评测 / 运营"),
    _role_course("软件供应链安全工程师（DevSecOps）", "DevSecOps 岗位训练助理，优先依据已导入资料说明 SSDF、SBOM、签名与漏洞响应", "pseudo", ["CI/CD", "SBOM", "签名验证"], ["SSDF", "SBOM", "SLSA", "漏洞响应"], ["SBOM 如何支持漏洞影响分析？", "签名验证失败怎么处理？"], "威胁建模 / 安全门禁 / SBOM / 制品签名 / 应急响应"),
    _role_course("企业 RAG 应用实施工程师", "企业 RAG 岗位训练助理，优先依据已导入资料说明解析、检索、引用、权限与评测", "pseudo", ["Python", "向量检索", "RAG 评测"], ["切分", "混合检索", "引用", "权限"], ["无证据回答如何处理？", "如何设计检索评测集？"], "资料授权 / 解析切分 / 检索重排 / 引用 / 评测与回滚"),
    _role_course("MLOps 工程师", "MLOps 岗位训练助理，优先依据已导入资料说明实验、流水线、发布、监控和回滚", "ml", ["Python", "MLflow", "Kubernetes"], ["实验追踪", "流水线", "模型注册", "漂移"], ["离线好线上差先查什么？", "模型如何安全灰度发布？"], "数据版本 / 实验追踪 / Pipeline / 部署 / 监控 / 治理"),
    _role_course("AI-native 应用前端开发工程师", "AI-native 前端岗位训练助理，优先依据已导入资料说明流式交互、Agent 界面、引用和测试", "pseudo", ["TypeScript", "React", "SSE"], ["流式状态", "Agent 画布", "RAG 引用", "端侧推理"], ["SSE 中断如何恢复？", "如何展示 RAG 引用？"], "流式 UI / Agent 状态 / 引用与安全 / 性能 / 可访问性"),
    _role_course("工业互联网架构师", "工业互联网架构岗位训练助理，优先依据已导入资料说明平台架构、集成、数据与安全治理", "pseudo", ["架构设计", "工业协议", "云边协同"], ["平台架构", "集成", "数据治理", "安全"], ["如何划分云边端职责？", "工业平台如何做集成治理？"], "架构设计 / 云边端协同 / 系统集成 / 数据与安全"),
    _role_course("工业数据工程师", "工业数据岗位训练助理，优先依据已导入资料说明采集、时序处理、治理和数据质量", "pseudo", ["SQL", "ETL", "时序数据库"], ["数据采集", "清洗", "时序", "治理"], ["怎样定位设备数据异常？", "如何保证数据口径一致？"], "设备数据 / 数据清洗 / 时序数据 / 治理 / 质量"),
    _role_course("边缘计算 AI 工程师", "边缘计算 AI 岗位训练助理，优先依据已导入资料说明设备部署、模型优化和现场运维", "ml", ["Python", "ONNX", "Docker"], ["模型压缩", "边缘部署", "性能", "运维"], ["模型如何在边缘设备部署？", "性能不达标如何排查？"], "边缘硬件 / 模型优化 / 部署 / 性能 / 可靠性"),
    _role_course("工业 AI 视觉工程师", "工业 AI 视觉岗位训练助理，优先依据已导入资料说明数据、模型、部署和现场验收", "ml", ["Python", "OpenCV", "PyTorch"], ["缺陷数据", "模型训练", "部署", "验收"], ["误检和漏检如何分析？", "光照变化导致漏检怎么办？"], "工业视觉 / 数据标注 / 训练评估 / 部署 / 现场验收"),
    _role_course("工业互联网网络集成工程师", "工业网络集成岗位训练助理，优先依据已导入资料说明网络、协议接入、联调和安全", "pseudo", ["TCP/IP", "工业协议", "网络诊断"], ["网络规划", "协议接入", "联调", "安全"], ["现场网络联调如何开展？", "协议接入异常如何定位？"], "网络规划 / 工业协议 / 设备接入 / 联调 / 运维与安全"),
]


COURSES: dict[str, CourseConfig] = {
    _ML.name: _ML,
    _DSA.name: _DSA,
    _OS.name: _OS,
    _NET.name: _NET,
    _COA.name: _COA,
    _FDE.name: _FDE,
    **{course.name: course for course in _ROLE_COURSES},
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
