"""LLM 生成多课程知识库 chunks（多课程架构演示）。

给定课程 + 大纲主题列表，调 LLM 批量产出 100-200 字高质量 chunks，
每条带 source / page / url 占位 + 「AI 生成」meta 水印，灌进 RAG。

用法：
    cd backend
    .venv/Scripts/python.exe -m scripts.gen_chunks_by_topic --course "数据结构"
    .venv/Scripts/python.exe -m scripts.gen_chunks_by_topic --course "概率论"
    .venv/Scripts/python.exe -m scripts.gen_chunks_by_topic --course all

默认每个主题 3 条 chunks，两课各 ~50 条。
LLM key 缺失时会走模板兜底，至少保证演示可跑。
"""
from __future__ import annotations
import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import engine, Base
from app.db import models  # noqa: F401
from app.llm import get_llm_client, has_llm_key
from app.rag import get_rag_service


# 每门课的大纲：(主题, 难度 1-5, 章节号)。每个主题让 LLM 出 3 条。
SYLLABI: dict[str, list[tuple[str, int, int]]] = {
    "数据结构与算法": [
        ("算法复杂度与渐近记号分析", 2, 1),
        ("数组顺序存储与动态扩容", 1, 1),
        ("链表插入删除与指针边界", 2, 1),
        ("栈的括号匹配与表达式求值", 2, 1),
        ("队列循环数组实现与应用", 2, 1),
        ("双端队列与滑动窗口最值", 3, 1),
        ("哈希表装载因子与冲突解决", 3, 2),
        ("位图与布隆过滤器原理", 4, 2),
        ("字符串朴素匹配与复杂度", 2, 2),
        ("KMP 前缀函数与失配回退", 4, 2),
        ("Rabin-Karp 滚动哈希匹配", 4, 2),
        ("二分查找边界条件与变体", 3, 3),
        ("递归设计与递归树复杂度", 3, 3),
        ("分治思想与主定理求解", 4, 3),
        ("快速排序的递归实现与时间复杂度", 3, 3),
        ("归并排序稳定性与逆序对统计", 3, 3),
        ("堆排序与原地选择算法", 3, 3),
        ("计数排序基数排序与桶排序", 3, 3),
        ("选择第 k 大的快速选择算法", 4, 3),
        ("二叉树前中后序遍历", 2, 4),
        ("二叉树层序遍历与宽度统计", 2, 4),
        ("二叉搜索树查找插入删除", 3, 4),
        ("AVL 树旋转与平衡因子", 4, 4),
        ("红黑树性质与插入修复", 5, 4),
        ("B 树与 B+ 树索引结构", 4, 4),
        ("堆与优先队列的实现", 3, 5),
        ("并查集路径压缩与按秩合并", 3, 5),
        ("Trie 前缀树与自动补全", 3, 5),
        ("线段树区间查询与懒标记", 5, 5),
        ("树状数组前缀和维护", 4, 5),
        ("图的邻接矩阵与邻接表", 2, 6),
        ("图的深度优先搜索与回溯", 3, 6),
        ("图的广度优先搜索与最短层数", 3, 6),
        ("拓扑排序与有向无环图", 3, 6),
        ("强连通分量 Tarjan 算法", 5, 6),
        ("最小生成树 Kruskal 算法", 3, 7),
        ("最小生成树 Prim 算法", 3, 7),
        ("Dijkstra 单源最短路径", 4, 7),
        ("Bellman-Ford 与负权边检测", 4, 7),
        ("Floyd 多源最短路径", 3, 7),
        ("二分图判定与最大匹配", 5, 7),
        ("贪心算法选择性质与证明", 4, 8),
        ("活动选择与区间调度问题", 3, 8),
        ("哈夫曼编码与最优前缀码", 3, 8),
        ("动态规划状态定义与转移", 4, 8),
        ("背包问题的二维与滚动数组", 4, 8),
        ("最长公共子序列与编辑距离", 4, 8),
        ("最长递增子序列优化", 4, 8),
        ("区间动态规划与矩阵连乘", 5, 8),
        ("树形动态规划与子树状态", 5, 8),
        ("回溯搜索与剪枝策略", 3, 9),
        ("排列组合生成与去重技巧", 3, 9),
        ("分支限界法与搜索空间控制", 4, 9),
        ("双指针与快慢指针技巧", 2, 9),
        ("滑动窗口计数与最短覆盖", 3, 9),
        ("前缀和差分与区间更新", 2, 9),
        ("单调栈与下一个更大元素", 3, 9),
        ("数学算法最大公约数与快速幂", 2, 10),
        ("素数筛法与模运算基础", 3, 10),
        ("摊还分析与势能法入门", 5, 10),
    ],
    "操作系统": [
        ("操作系统职责与抽象层次", 1, 1),
        ("内核态用户态与特权指令", 2, 1),
        ("系统调用流程与陷入机制", 3, 1),
        ("中断异常与事件处理路径", 3, 1),
        ("引导加载与内核初始化流程", 2, 1),
        ("进程控制块与进程状态转换", 2, 2),
        ("线程模型与用户级内核级线程", 3, 2),
        ("上下文切换成本与保存现场", 3, 2),
        ("短程中程长程调度职责", 3, 2),
        ("FCFS 与短作业优先调度", 2, 2),
        ("时间片轮转与响应时间权衡", 3, 2),
        ("优先级调度与饥饿问题", 3, 2),
        ("多级反馈队列调度策略", 4, 2),
        ("多处理器调度与负载均衡", 4, 2),
        ("临界区问题与竞态条件", 3, 3),
        ("互斥锁自旋锁与睡眠锁", 3, 3),
        ("信号量 P/V 操作与同步", 3, 3),
        ("管程条件变量与 Mesa 语义", 4, 3),
        ("生产者消费者缓冲区问题", 3, 3),
        ("读者写者问题与公平性", 4, 3),
        ("哲学家进餐与资源分配", 4, 3),
        ("死锁必要条件与资源分配图", 3, 4),
        ("死锁预防避免检测恢复", 4, 4),
        ("银行家算法安全性检查", 4, 4),
        ("地址空间与逻辑地址转换", 3, 5),
        ("连续内存分配与碎片问题", 2, 5),
        ("分页机制与页表项结构", 3, 5),
        ("多级页表与地址翻译过程", 4, 5),
        ("TLB 快表命中与缺失处理", 4, 5),
        ("分段机制与段页式存储", 4, 5),
        ("虚拟内存需求分页原理", 4, 6),
        ("缺页中断处理完整流程", 4, 6),
        ("FIFO LRU Clock 页面置换", 3, 6),
        ("工作集模型与抖动现象", 4, 6),
        ("内存映射文件与共享内存", 4, 6),
        ("文件抽象与文件描述符表", 2, 7),
        ("目录结构与路径名解析", 2, 7),
        ("inode 索引节点与块映射", 3, 7),
        ("空闲空间管理位图与链表", 3, 7),
        ("日志文件系统与崩溃恢复", 4, 7),
        ("文件缓存与写回策略", 3, 7),
        ("磁盘结构与寻道旋转延迟", 2, 8),
        ("SSTF SCAN C-SCAN 磁盘调度", 3, 8),
        ("RAID 级别与可靠性权衡", 4, 8),
        ("I/O 设备控制器与驱动程序", 3, 8),
        ("阻塞非阻塞与异步 I/O", 3, 8),
        ("DMA 传输与 CPU 开销降低", 3, 8),
        ("缓冲缓存与假脱机技术", 2, 8),
        ("进程间通信管道消息队列", 3, 9),
        ("共享内存信号与套接字通信", 4, 9),
        ("Linux fork exec wait 语义", 4, 9),
        ("Linux 文件权限与用户组模型", 3, 9),
        ("虚拟化陷入模拟与二进制翻译", 5, 10),
        ("容器命名空间与控制组", 4, 10),
        ("安全保护访问控制与能力表", 4, 10),
        ("内核同步与中断上下文限制", 5, 10),
        ("多核缓存一致性与内存屏障", 5, 10),
        ("实时操作系统调度约束", 4, 10),
        ("操作系统性能指标与监控", 3, 10),
        ("OSTEP 三大主题虚拟化并发持久化", 2, 10),
    ],
    "计算机网络": [
        ("OSI 七层模型与 TCP/IP 分层", 2, 1),
        ("封装解封装与协议数据单元", 2, 1),
        ("时延吞吐量与带宽时延积", 3, 1),
        ("电路交换分组交换与报文交换", 2, 1),
        ("物理层编码调制与传输介质", 2, 1),
        ("奈奎斯特定理与香农容量", 4, 1),
        ("数据链路层成帧与透明传输", 3, 2),
        ("奇偶校验 CRC 与差错检测", 3, 2),
        ("停止等待协议与滑动窗口", 3, 2),
        ("GBN 与选择重传可靠传输", 4, 2),
        ("以太网帧格式与 MAC 地址", 2, 2),
        ("CSMA/CD 原理与冲突域", 3, 2),
        ("交换机学习转发与生成树", 3, 2),
        ("VLAN 划分与 802.1Q 标签", 3, 2),
        ("无线局域网 CSMA/CA 与隐藏终端", 4, 2),
        ("ARP 地址解析与缓存更新", 3, 3),
        ("IPv4 地址分类与 CIDR", 3, 3),
        ("子网划分与最长前缀匹配", 3, 3),
        ("IP 分片重组与 MTU", 3, 3),
        ("ICMP 差错报告与 ping traceroute", 3, 3),
        ("DHCP 租约获取与地址配置", 2, 3),
        ("NAT 类型与端口映射", 3, 3),
        ("IPv6 地址格式与邻居发现", 3, 3),
        ("路由器转发表与路由表区别", 3, 4),
        ("距离向量路由与 RIP", 3, 4),
        ("链路状态路由与 OSPF", 4, 4),
        ("路径向量路由与 BGP", 4, 4),
        ("自治系统与域间路由策略", 4, 4),
        ("组播基础与 IGMP 协议", 4, 4),
        ("UDP 首部格式与应用场景", 2, 5),
        ("TCP 报文段结构与序号确认", 3, 5),
        ("TCP 三次握手状态变化", 3, 5),
        ("TCP 四次挥手与 TIME_WAIT", 3, 5),
        ("TCP 可靠传输与重传计时器", 4, 5),
        ("TCP 滑动窗口与流量控制", 4, 5),
        ("TCP 慢开始拥塞避免快恢复", 4, 5),
        ("TCP 粘包现象与消息边界", 3, 5),
        ("QUIC 基于 UDP 的传输改进", 4, 5),
        ("DNS 递归查询与迭代查询", 3, 6),
        ("DNS 资源记录与缓存机制", 3, 6),
        ("HTTP 请求响应报文结构", 2, 6),
        ("HTTP 状态码与缓存控制", 3, 6),
        ("Cookie Session 与身份状态", 3, 6),
        ("HTTP/1.1 持久连接与队头阻塞", 3, 6),
        ("HTTP/2 多路复用与头部压缩", 4, 6),
        ("HTTP/3 与 QUIC 连接迁移", 4, 6),
        ("HTTPS 证书链与 TLS 握手", 4, 7),
        ("对称加密非对称加密与摘要", 3, 7),
        ("WebSocket 全双工通信机制", 3, 7),
        ("CDN 内容分发与缓存命中", 3, 7),
        ("电子邮件 SMTP POP3 IMAP", 2, 7),
        ("SNMP 网络管理基本模型", 3, 7),
        ("套接字 API 与端口复用", 3, 8),
        ("网络地址端口与五元组连接", 2, 8),
        ("防火墙包过滤与状态检测", 3, 8),
        ("SYN Flood 攻击与防御", 4, 8),
        ("中间人攻击与证书校验", 4, 8),
        ("VPN 隧道与安全传输", 3, 8),
        ("网络性能排障与抓包分析", 3, 9),
        ("Kurose 自顶向下的应用到链路视角", 2, 9),
    ],
    "计算机组成原理": [
        ("冯诺依曼结构与存储程序思想", 1, 1),
        ("计算机性能指标 CPI MIPS FLOPS", 2, 1),
        ("Amdahl 定律与加速比计算", 3, 1),
        ("层次化计算机系统与 ISA 接口", 2, 1),
        ("二进制补码表示与溢出判断", 2, 2),
        ("原码反码补码与移码区别", 2, 2),
        ("定点数加减乘除运算", 3, 2),
        ("浮点数 IEEE 754 格式", 3, 2),
        ("浮点加减规格化与舍入", 4, 2),
        ("校验码奇偶校验与海明码", 3, 2),
        ("算术逻辑单元 ALU 结构", 3, 3),
        ("加法器进位链与超前进位", 4, 3),
        ("乘法器阵列与 Booth 算法", 4, 3),
        ("除法恢复法与不恢复法", 4, 3),
        ("指令格式与操作码扩展", 3, 4),
        ("寻址方式立即直接间接变址", 3, 4),
        ("CISC 与 RISC 指令系统比较", 3, 4),
        ("MIPS 指令格式与寄存器约定", 3, 4),
        ("RISC-V 基本指令与编码", 3, 4),
        ("控制器硬布线与微程序实现", 4, 5),
        ("取指译码执行访存写回周期", 3, 5),
        ("单周期多周期与流水线 CPU", 3, 5),
        ("数据通路组成与控制信号", 4, 5),
        ("微指令微地址与控制存储器", 4, 5),
        ("流水线吞吐率与加速比", 4, 6),
        ("结构冒险数据冒险控制冒险", 4, 6),
        ("数据前递与流水线暂停", 4, 6),
        ("分支预测静态与动态策略", 4, 6),
        ("异常处理与精确异常", 5, 6),
        ("超标量乱序执行与重排序缓冲", 5, 6),
        ("存储器层次局部性原理", 2, 7),
        ("SRAM DRAM 原理与刷新", 3, 7),
        ("主存编址与字节序问题", 2, 7),
        ("Cache 直接映射与组相联映射", 4, 7),
        ("Cache 替换策略 LRU FIFO 随机", 3, 7),
        ("Cache 写直达写回与写分配", 4, 7),
        ("Cache 命中率与平均访问时间", 4, 7),
        ("虚拟存储器与页式地址转换", 4, 7),
        ("TLB 快表与多级页表协同", 4, 7),
        ("存储一致性与 MESI 协议", 5, 7),
        ("总线结构分类与性能指标", 2, 8),
        ("同步总线异步总线与握手", 3, 8),
        ("总线仲裁集中式与分布式", 3, 8),
        ("PCIe 点到点互连基础", 4, 8),
        ("I/O 编址方式与接口寄存器", 3, 8),
        ("程序查询中断与 DMA 比较", 3, 8),
        ("中断响应流程与优先级屏蔽", 3, 8),
        ("DMA 控制器与总线周期窃取", 4, 8),
        ("磁盘 SSD 与外存访问特性", 3, 9),
        ("RAID 组织与可靠性性能权衡", 4, 9),
        ("并行处理 SISD SIMD MIMD", 3, 9),
        ("向量处理器与 SIMD 指令", 4, 9),
        ("多核处理器与共享缓存", 4, 9),
        ("GPU SIMT 执行模型入门", 4, 9),
        ("输入输出系统层次与驱动", 3, 9),
        ("机器级程序与栈帧调用约定", 4, 10),
        ("链接装载与地址重定位", 4, 10),
        ("Patterson 量化设计原则", 3, 10),
        ("功耗能效与性能墙问题", 4, 10),
        ("可靠性可用性与容错指标", 4, 10),
    ],
    "机器学习": [
        ("监督学习与无监督学习基本范式", 1, 1),
        ("经验风险最小化与结构风险", 3, 1),
        ("训练集验证集测试集划分", 2, 1),
        ("偏差方差分解与泛化误差", 4, 2),
        ("正则化 L1 L2 与模型复杂度", 3, 2),
        ("线性回归正规方程与梯度下降", 3, 2),
        ("逻辑回归 sigmoid 与交叉熵", 3, 3),
        ("朴素贝叶斯条件独立假设", 3, 3),
        ("支持向量机间隔最大化与核技巧", 4, 4),
        ("决策树信息增益基尼指数与剪枝", 3, 4),
        ("集成学习 Bagging Boosting 与随机森林", 4, 5),
        ("GBDT XGBoost 与梯度提升思想", 4, 5),
        ("K 均值聚类与初值敏感性", 3, 6),
        ("PCA 主成分分析与降维投影", 4, 6),
        ("神经网络反向传播与链式法则", 4, 7),
        ("模型评估准确率召回率 F1 与 AUC", 3, 8),
        ("过拟合欠拟合与交叉验证", 3, 8),
    ],
}


SYS_PROMPT = r"""你是高校教材编纂助手。给定一门课程的某个具体知识点，输出 3 条互不重复的知识库 chunk。

要求：
1. 每条 100-200 字，纯中文，准确、自洽，可直接作为教辅资料引用
2. 内容覆盖：定义 / 性质 / 示例 / 复杂度 / 常见陷阱 / 与相关概念对比，3 条之间视角不同
3. 公式一律用纯文本数学记号，禁止 LaTeX 反斜杠命令（不要写 \frac \log \sum \theta \times 等）。
   改用：O(n log n)、θ、Σ、∏、≤、≥、≠、≈、√、x^2、a_i（下标用 _）、π、α、β、∞ 等 Unicode 符号与通行写法。
   原因：chunk 要进 JSON，裸反斜杠会破坏转义；纯文本记号对关键词检索也更友好。
4. 严格输出 JSON：{"chunks": [{"content": "...", "subtopic": "..."} x 3]}，禁止其他字段，禁止 markdown 包裹
5. subtopic 是 8 字以内的细分标签，方便检索

绝不要编造具体年份、人名、论文 DOI；写公认的、能在通用教材里找到的内容。"""


def _loads_lenient(raw: str) -> dict:
    """容错解析 LLM 输出的 JSON。

    LLM 经常在 JSON 字符串里直接写 LaTeX（\\frac \\log \\sum…），这些裸反斜杠
    不是合法 JSON 转义，json.loads 会报 'Invalid \\escape'。先正常解析，
    失败则去 ```fence + 把非法反斜杠补成 \\\\ 再重试。
    """
    s = (raw or "").strip()
    # 去掉可能的 ```json ... ``` 包裹
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # 进到这里说明有非法转义（多半是 LaTeX 裸反斜杠 \\frac \\beta \\nabla…）。
        # 只保留真正会出现在散文里的 \\" \\\\ \\/ \\uXXXX，其余反斜杠一律翻倍当字面量，
        # 避免 \\f \\b \\n \\r \\t 被当成控制符把 LaTeX 命令吃掉（\\frac→换页符+rac）。
        fixed = re.sub(r'\\(?!["\\/u])', r"\\\\", s)
        return json.loads(fixed)


def _fallback_chunks(topic: str) -> list[dict]:
    """无 LLM 时的模板兜底，保证脚本可独立跑通。"""
    return [
        {"content": f"{topic}：核心概念与定义。本条为占位模板内容，配置 LLM key 后将由模型替换为高质量讲解，约 100-200 字。", "subtopic": "概念"},
        {"content": f"{topic}：典型示例与性质。本条为占位模板内容，演示多课程 RAG 链路。生产部署前应替换为版权清晰的语料。", "subtopic": "性质"},
        {"content": f"{topic}：常见陷阱与对比。本条为占位模板内容，对应章节将由 gen_chunks_by_topic.py 重新生成。", "subtopic": "陷阱"},
    ]


async def _gen_one_topic(course: str, topic: str) -> list[dict]:
    """让 LLM 出 3 条 chunk。失败兜底模板。"""
    if not has_llm_key():
        return _fallback_chunks(topic)

    llm = get_llm_client()
    user_msg = f"课程：{course}\n知识点：{topic}\n\n请按 system 要求输出 3 条 chunk 的 JSON。"
    try:
        raw = await llm.chat_structured(
            messages=[
                {"role": "system", "content": SYS_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.5,
        )
        data = _loads_lenient(raw)
        items = data.get("chunks", [])
        cleaned = []
        for it in items:
            content = (it.get("content") or "").strip()
            if not content:
                continue
            cleaned.append({
                "content": content,
                "subtopic": (it.get("subtopic") or topic)[:24],
            })
        if not cleaned:
            return _fallback_chunks(topic)
        return cleaned[:3]
    except Exception as e:
        print(f"  [warn] LLM gen for '{topic}' failed: {e}; using fallback")
        return _fallback_chunks(topic)


async def _build_course(course: str) -> list[dict]:
    """对一门课全部主题并发生成（限并发 4，防止 LLM 限速）。"""
    syllabus = SYLLABI.get(course)
    if not syllabus:
        raise ValueError(f"未配置课程：{course}（可选：{list(SYLLABI)}）")

    sem = asyncio.Semaphore(4)

    async def gen_one(topic: str, difficulty: int, chapter: int):
        async with sem:
            print(f"  [.] {topic} ...")
            items = await _gen_one_topic(course, topic)
            out = []
            for j, it in enumerate(items, 1):
                out.append({
                    "content": it["content"],
                    "source": f"{course}·第{chapter}章 {topic}",
                    "page": chapter,
                    "url": f"ai://gen/{course}/{topic}#{j}",
                    "meta": {
                        "topic": topic,
                        "subtopic": it.get("subtopic", ""),
                        "difficulty": difficulty,
                        "chapter": chapter,
                        "ai_generated": True,
                    },
                })
            return out

    tasks = [gen_one(t, d, c) for t, d, c in syllabus]
    nested = await asyncio.gather(*tasks)
    return [x for batch in nested for x in batch]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--course", default="all", help="课程名或 all（数据结构 / 概率论 / all）")
    parser.add_argument("--clear", action="store_true", help="先清空该课已有 chunks")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    courses = list(SYLLABI) if args.course == "all" else [args.course]

    svc = get_rag_service()
    for course in courses:
        print(f"\n[*] generating chunks for course: {course}")
        if args.clear:
            # 真按课清：只删这门课已有 chunk，再重灌（核心课主题扩充用，避免重复 + 孤儿条目）
            from sqlalchemy import select as _select, delete as _delete
            from app.db import async_session_maker
            from app.db.models import Course as _Course, KnowledgeChunk as _Chunk
            async with async_session_maker() as _db:
                _q = await _db.execute(_select(_Course).where(_Course.name == course))
                _c = _q.scalar_one_or_none()
                if _c:
                    _res = await _db.execute(_delete(_Chunk).where(_Chunk.course_id == _c.id))
                    await _db.commit()
                    print(f"  [clear] removed {_res.rowcount} existing chunks for '{course}' (course_id={_c.id})")
                else:
                    print(f"  [clear] course '{course}' not found yet, nothing to clear")
            # 清完让内存索引下次重新从 DB 加载（避免 ingest 把旧 chunk 残留在引擎里）
            svc._loaded = False
        chunks = await _build_course(course)
        res = await svc.ingest(course_name=course, items=chunks)
        print(f"[OK] {course}: ingested {res['ingested']} / total in library = {res['total']}")

    # 抽测每课的检索
    for course in courses:
        sample_q = "应用" if "概率" in course else "复杂度"
        # 从 service 找该课 course_id
        from sqlalchemy import select
        from app.db import async_session_maker
        from app.db.models import Course
        async with async_session_maker() as db:
            q = await db.execute(select(Course).where(Course.name == course))
            c = q.scalar_one_or_none()
        if not c:
            continue
        hits = await svc.search(sample_q, k=3, course_id=c.id)
        print(f"\n[smoke] course={course} query='{sample_q}' hits={len(hits)}")
        for i, h in enumerate(hits, 1):
            print(f"  [{i}] {h['source']} · score={h['score']}")
            print(f"      {h['content'][:80]}...")


if __name__ == "__main__":
    asyncio.run(main())
