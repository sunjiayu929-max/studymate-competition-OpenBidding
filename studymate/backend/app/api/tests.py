"""测试 case 管理 API（挑战杯硬性交付物：典型 Q&A 测试集 + 准确性论证）

端点：
- GET    /api/tests                列出全部
- POST   /api/tests                新增（单条）
- POST   /api/tests/batch          批量导入（json 数组）
- PUT    /api/tests/{id}           更新
- DELETE /api/tests/{id}           删除
- POST   /api/tests/{id}/run       跑一条 → actual + score + judge_reason
- POST   /api/tests/run-all        跑全部，串行返回汇总
- POST   /api/tests/run-all/stream SSE 流式跑全部，逐条 yield 进度
- POST   /api/tests/seed           一键灌入 10 条机器学习典型 case（演示用）
"""
from __future__ import annotations
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.db import get_db
from app.db.session import async_session_maker
from app.db.models import TestCase, Course
from app.agents.test_case_agent import call_target_agent, judge


router = APIRouter(prefix="/tests", tags=["tests"])

# 用于识别服务重载前遗留的「运行中」记录。正常运行的 case 会同时出现在
# ACTIVE_RUN_IDS 中；服务重启后集合会清空，旧记录可在下一次进入页面时自动恢复。
SERVER_STARTED_AT = datetime.utcnow()
ACTIVE_RUN_IDS: set[int] = set()


class TestCaseIn(BaseModel):
    question: str
    expected: str
    category: str = "通用"
    target_agent: str = "tutor"  # tutor / doc / quiz
    course_id: int | None = None


class TestCaseUpdate(BaseModel):
    question: str | None = None
    expected: str | None = None
    category: str | None = None
    target_agent: str | None = None
    course_id: int | None = None


def _to_dict(tc: TestCase) -> dict:
    return {
        "id": tc.id,
        "course_id": tc.course_id,
        "question": tc.question,
        "expected": tc.expected,
        "category": tc.category,
        "target_agent": tc.target_agent,
        "actual": tc.actual,
        "score": tc.score,
        "judge_reason": tc.judge_reason,
        "status": tc.status,
        "last_run_at": tc.last_run_at.isoformat() if tc.last_run_at else None,
        "created_at": tc.created_at.isoformat() if tc.created_at else None,
    }


async def _recover_orphaned_cases(db: AsyncSession, course_id: int | None = None) -> int:
    """恢复因浏览器断开或服务重载而遗留的 running 状态。"""
    stmt = select(TestCase).where(TestCase.status == "running")
    if course_id is not None:
        stmt = stmt.where(TestCase.course_id == course_id)
    q = await db.execute(stmt)
    recovered = 0
    for tc in q.scalars().all():
        belongs_to_previous_process = tc.last_run_at is None or tc.last_run_at < SERVER_STARTED_AT
        if tc.id not in ACTIVE_RUN_IDS and belongs_to_previous_process:
            tc.status = "error"
            tc.score = 0.0
            tc.judge_reason = "上次运行意外中断，状态已自动恢复，可重新运行。"
            tc.last_run_at = datetime.utcnow()
            recovered += 1
    if recovered:
        await db.commit()
    return recovered


@router.get("")
async def list_cases(
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    recovered = await _recover_orphaned_cases(db, course_id)
    stmt = select(TestCase).order_by(desc(TestCase.id))
    if course_id is not None:
        stmt = stmt.where(TestCase.course_id == course_id)
    q = await db.execute(stmt)
    items = q.scalars().all()
    return {
        "count": len(items),
        "passed": sum(1 for it in items if it.status == "passed"),
        "failed": sum(1 for it in items if it.status == "failed"),
        "pending": sum(1 for it in items if it.status in ("pending", "running")),
        "recovered": recovered,
        "items": [_to_dict(it) for it in items],
    }


@router.post("")
async def add_case(req: TestCaseIn, db: AsyncSession = Depends(get_db)):
    tc = TestCase(
        course_id=req.course_id,
        question=req.question.strip(),
        expected=req.expected.strip(),
        category=req.category.strip() or "通用",
        target_agent=req.target_agent if req.target_agent in {"tutor", "doc", "quiz"} else "tutor",
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return _to_dict(tc)


@router.post("/batch")
async def add_batch(items: list[TestCaseIn], db: AsyncSession = Depends(get_db)):
    created = []
    for it in items:
        tc = TestCase(
            course_id=it.course_id,
            question=it.question.strip(),
            expected=it.expected.strip(),
            category=it.category.strip() or "通用",
            target_agent=it.target_agent if it.target_agent in {"tutor", "doc", "quiz"} else "tutor",
        )
        db.add(tc)
        created.append(tc)
    await db.commit()
    for tc in created:
        await db.refresh(tc)
    return {"count": len(created), "items": [_to_dict(tc) for tc in created]}


@router.put("/{case_id}")
async def update_case(case_id: int, req: TestCaseUpdate, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, case_id)
    if not tc:
        raise HTTPException(404, f"test case {case_id} not found")
    if req.question is not None:
        tc.question = req.question.strip()
    if req.expected is not None:
        tc.expected = req.expected.strip()
    if req.category is not None:
        tc.category = req.category.strip() or "通用"
    if req.target_agent is not None and req.target_agent in {"tutor", "doc", "quiz"}:
        tc.target_agent = req.target_agent
    if req.course_id is not None:
        tc.course_id = req.course_id
    await db.commit()
    await db.refresh(tc)
    return _to_dict(tc)


@router.delete("/{case_id}")
async def delete_case(case_id: int, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, case_id)
    if not tc:
        raise HTTPException(404, f"test case {case_id} not found")
    await db.delete(tc)
    await db.commit()
    return {"ok": True, "id": case_id}


async def _run_one(tc: TestCase, db: AsyncSession) -> dict:
    """跑单条：调 target_agent → judge → 写库。"""
    ACTIVE_RUN_IDS.add(tc.id)
    try:
        tc.status = "running"
        tc.last_run_at = datetime.utcnow()
        tc.judge_reason = ""
        await db.commit()
        actual = await call_target_agent(tc.target_agent or "tutor", tc.question, tc.course_id)
        score, reason = await judge(tc.question, tc.expected, actual)
        tc.actual = actual
        tc.score = score
        tc.judge_reason = reason
        tc.status = "passed" if score >= 60 else "failed"
        tc.last_run_at = datetime.utcnow()
    except Exception as e:
        tc.actual = ""
        tc.score = 0.0
        tc.judge_reason = f"运行异常：{e}"
        tc.status = "error"
        tc.last_run_at = datetime.utcnow()
    except asyncio.CancelledError:
        tc.actual = ""
        tc.score = 0.0
        tc.judge_reason = "运行被中断，状态已自动恢复，可重新运行。"
        tc.status = "error"
        tc.last_run_at = datetime.utcnow()
        await asyncio.shield(db.commit())
        raise
    finally:
        ACTIVE_RUN_IDS.discard(tc.id)
    await db.commit()
    await db.refresh(tc)
    return _to_dict(tc)


@router.post("/{case_id}/run")
async def run_case(case_id: int, db: AsyncSession = Depends(get_db)):
    tc = await db.get(TestCase, case_id)
    if not tc:
        raise HTTPException(404, f"test case {case_id} not found")
    return await _run_one(tc, db)


@router.post("/run-all")
async def run_all(
    course_id: int | None = None,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """串行跑全部（同步返回汇总），可选 course_id / category 筛选。"""
    stmt = select(TestCase).order_by(TestCase.id)
    if course_id is not None:
        stmt = stmt.where(TestCase.course_id == course_id)
    if category:
        stmt = stmt.where(TestCase.category == category)
    q = await db.execute(stmt)
    cases = q.scalars().all()
    results = []
    for tc in cases:
        results.append(await _run_one(tc, db))
    passed = sum(1 for r in results if r["status"] == "passed")
    total = len(results)
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": round(passed / total, 3) if total else 0,
        "items": results,
    }


@router.post("/run-all/stream")
async def run_all_stream(
    course_id: int | None = None,
    category: str | None = None,
):
    """SSE 流式跑全部。事件协议：
    - start      {total, ids}
    - case_start {id, index, total, question, category, target_agent}
    - case_done  {id, index, total, item}
    - done       {total, passed, failed, pass_rate}
    每条 case 跑完即提交 DB，前端实时看到状态变化。
    """

    async def gen():
        async with async_session_maker() as db:
            stmt = select(TestCase).order_by(TestCase.id)
            if course_id is not None:
                stmt = stmt.where(TestCase.course_id == course_id)
            if category:
                stmt = stmt.where(TestCase.category == category)
            q = await db.execute(stmt)
            cases = q.scalars().all()

            total = len(cases)
            yield {
                "event": "start",
                "data": json.dumps({"total": total, "ids": [c.id for c in cases]}, ensure_ascii=False),
            }

            if total == 0:
                yield {
                    "event": "done",
                    "data": json.dumps({"total": 0, "passed": 0, "failed": 0, "pass_rate": 0}),
                }
                return

            passed = 0
            failed = 0
            for idx, tc in enumerate(cases, start=1):
                yield {
                    "event": "case_start",
                    "data": json.dumps({
                        "id": tc.id,
                        "index": idx,
                        "total": total,
                        "question": tc.question[:80],
                        "category": tc.category,
                        "target_agent": tc.target_agent,
                    }, ensure_ascii=False),
                }
                # 让事件先 flush 到前端
                await asyncio.sleep(0)

                item = await _run_one(tc, db)
                if item["status"] == "passed":
                    passed += 1
                elif item["status"] in ("failed", "error"):
                    failed += 1

                yield {
                    "event": "case_done",
                    "data": json.dumps({
                        "id": tc.id,
                        "index": idx,
                        "total": total,
                        "item": item,
                    }, ensure_ascii=False),
                }

            yield {
                "event": "done",
                "data": json.dumps({
                    "total": total,
                    "passed": passed,
                    "failed": failed,
                    "pass_rate": round(passed / total, 3) if total else 0,
                }),
            }

    return EventSourceResponse(gen())


SEED_CASES_BY_COURSE: dict[str, list[dict]] = {
    "机器学习": [
        {"question": "什么是梯度下降？", "expected": "一种通过沿损失函数梯度反方向迭代更新参数、最小化目标函数的优化算法。涉及学习率、批量大小等超参。", "category": "优化算法", "target_agent": "tutor"},
        {"question": "Adam 优化器相比 SGD 有什么优势？", "expected": "Adam 结合了动量和 RMSProp，对每个参数自适应学习率，收敛更快、对超参不敏感，适合稀疏梯度场景。缺点是占内存大、可能泛化稍差。", "category": "优化算法", "target_agent": "tutor"},
        {"question": "L1 和 L2 正则化的区别？", "expected": "L1（Lasso）惩罚权重绝对值，产生稀疏解，可做特征选择；L2（Ridge）惩罚权重平方，让权重整体变小但不为零，抗共线性更稳。", "category": "正则化", "target_agent": "tutor"},
        {"question": "什么是过拟合？怎么检测？", "expected": "模型在训练集表现好但测试集差。检测方法：训练/验证 loss 曲线分叉、学习曲线、交叉验证差距大。", "category": "模型评估", "target_agent": "tutor"},
        {"question": "解释 K-Means 聚类算法的步骤。", "expected": "1) 随机选 K 个初始中心；2) 把每个样本分到最近中心；3) 重新计算每类的中心；4) 重复 2-3 直到中心不再变化或达到迭代上限。", "category": "聚类", "target_agent": "tutor"},
        {"question": "PCA 的核心思想是什么？", "expected": "通过线性变换把数据投影到方差最大的若干主成分上，实现降维。等价于对协方差矩阵做特征分解，取最大特征值对应的特征向量。", "category": "降维", "target_agent": "tutor"},
        {"question": "决策树是怎么选分裂特征的？", "expected": "用信息增益（ID3）、信息增益率（C4.5）或基尼指数（CART）衡量分裂前后纯度变化，选择使纯度提升最大的特征和切分点。", "category": "树模型", "target_agent": "tutor"},
        {"question": "什么是交叉验证？", "expected": "把训练集分成 K 折，每次留一折做验证、其余训练，循环 K 次后平均评估指标。K-fold CV 让评估更稳定、减少对单次划分的依赖。", "category": "模型评估", "target_agent": "tutor"},
        {"question": "请生成一段 K-Means 的讲解", "expected": "K-Means 通过迭代『分配-更新』两步把样本分到 K 个簇，使簇内方差最小。需要预先指定 K，对初始中心敏感，常用 K-Means++ 改进。", "category": "聚类", "target_agent": "doc"},
        {"question": "出一道关于过拟合的检测题", "expected": "应当输出一道关于过拟合判断/对策的选择题，含 4 个选项和正确答案。", "category": "题目生成", "target_agent": "quiz"},
    ],
    "数据结构与算法": [
        {"question": "快速排序的平均和最坏时间复杂度分别是多少？为什么？", "expected": "平均 O(n log n)，最坏 O(n^2)。最坏出现在每次划分极不均衡（已排序数组+固定枢轴）。平均情况下划分接近均匀，递归深度 log n。", "category": "排序", "target_agent": "tutor"},
        {"question": "红黑树和 AVL 树有什么区别？分别适合什么场景？", "expected": "红黑树插入/删除旋转次数 O(1) 摊还，查找 O(log n)；AVL 严格平衡，查找略快但插入删除可能旋转 O(log n) 次。频繁修改用红黑树（map/set），查找密集用 AVL。", "category": "树", "target_agent": "tutor"},
        {"question": "解释一下哈希冲突的开放寻址法和链地址法。", "expected": "开放寻址：冲突时按某种探测序列（线性/二次/双哈希）找下一个空槽，所有数据放在表内；链地址：每个桶维护一个链表，冲突的元素串在一起。前者空间紧凑但聚簇严重，后者实现简单但有指针开销。", "category": "哈希", "target_agent": "tutor"},
        {"question": "Dijkstra 算法的核心思想？为什么不能处理负权边？", "expected": "贪心 + 优先队列每次取距离最小的未确定节点松弛邻居。负权边会让已确定最短路的节点可能被后来发现的负环再次缩短，破坏贪心前提。负权用 Bellman-Ford。", "category": "图算法", "target_agent": "tutor"},
        {"question": "什么是动态规划？跟分治和贪心有什么区别？", "expected": "DP 把问题分解为重叠子问题 + 最优子结构，用记忆化/迭代避免重复计算；分治子问题独立无重叠；贪心每步局部最优不回溯。DP 适合最优子结构 + 重叠子问题，如 LCS/背包。", "category": "算法范式", "target_agent": "tutor"},
        {"question": "请给出二分查找的代码实现", "expected": "标准二分：left=0, right=len-1，while left<=right 取 mid，命中返回 mid，arr[mid]<target 则 left=mid+1，否则 right=mid-1。注意 mid 防溢出用 left + (right-left)//2。", "category": "查找", "target_agent": "doc"},
        {"question": "出一道关于栈和队列区别的题", "expected": "应当输出一道关于 LIFO/FIFO、应用场景、相关数据结构（递归调用栈、BFS 队列）的选择题，含 4 个选项和正确答案。", "category": "题目生成", "target_agent": "quiz"},
        {"question": "解释一下堆（heap）的插入和删除操作复杂度", "expected": "插入：放到末尾后向上 sift up，O(log n)；删除堆顶：把末尾元素移到堆顶后向下 sift down，O(log n)。建堆 O(n)（自底向上）。", "category": "树", "target_agent": "tutor"},
    ],
    "操作系统": [
        {"question": "进程和线程的区别？", "expected": "进程是资源分配单位（独立地址空间），线程是 CPU 调度单位（共享所属进程的内存）。进程切换开销大（页表/TLB 刷新），线程切换轻。线程间通信通过共享内存，进程间需 IPC。", "category": "进程线程", "target_agent": "tutor"},
        {"question": "什么是死锁？产生死锁的四个必要条件？怎么预防？", "expected": "多进程互相等待对方持有的资源，无法推进。四条件：互斥、占有并等待、不可抢占、循环等待。预防：破坏任一条件，如资源有序申请破环、银行家算法避免、超时回滚等。", "category": "并发", "target_agent": "tutor"},
        {"question": "页式存储管理中，什么是 TLB？为什么需要？", "expected": "TLB（Translation Lookaside Buffer）是 MMU 中缓存最近用过的页表项的小型高速缓存。每次访存都查页表会慢，TLB 让常用页号→物理页框的映射命中 1 周期，未命中再走多级页表。", "category": "内存", "target_agent": "tutor"},
        {"question": "解释一下虚拟内存和缺页中断的工作原理。", "expected": "进程看到连续虚拟地址，MMU 通过页表映射到物理页框。访问的页不在内存时触发缺页中断，OS 选一个牺牲页（LRU/Clock）换出到磁盘，把目标页换入，更新页表后重试指令。", "category": "内存", "target_agent": "tutor"},
        {"question": "FCFS、SJF、Round-Robin 三种调度算法各有什么优缺点？", "expected": "FCFS 简单公平但短任务被长任务阻塞（护航效应）；SJF 平均等待时间最小但需预知运行时间且可能饥饿长任务；RR 时间片轮转响应快，适合交互式，时间片选择影响吞吐和切换开销。", "category": "调度", "target_agent": "tutor"},
        {"question": "请生成一段关于读者-写者问题的伪代码讲解", "expected": "用信号量/互斥量实现读者优先或写者优先：读计数 reader_count + mutex 保护，第一个读者锁住 wrt 信号量，最后一个释放。写者直接 P(wrt)。需要避免饥饿。", "category": "并发", "target_agent": "doc"},
        {"question": "出一道关于死锁四个必要条件的题", "expected": "应当输出一道关于互斥/占有等待/不可抢占/循环等待的判断或选择题，含选项和正确答案。", "category": "题目生成", "target_agent": "quiz"},
        {"question": "什么是上下文切换？开销主要在哪？", "expected": "OS 把 CPU 从一个线程/进程切到另一个，需保存当前寄存器/PC 到 PCB，加载下一个 PCB 的寄存器。开销：寄存器保存恢复、TLB/Cache 失效（进程切换）、内核态用户态切换。", "category": "进程线程", "target_agent": "tutor"},
    ],
    "计算机网络": [
        {"question": "TCP 三次握手的过程？为什么是三次不是两次？", "expected": "客户端 SYN → 服务端 SYN+ACK → 客户端 ACK。两次握手无法确认客户端的接收能力，且可能因旧 SYN 重传建立无效连接。三次确保双方收发能力都正常并同步初始序号。", "category": "TCP", "target_agent": "tutor"},
        {"question": "HTTP/1.1 和 HTTP/2 的主要区别？", "expected": "HTTP/2 用二进制分帧、单连接多路复用解决队头阻塞、头部 HPACK 压缩、服务器推送。HTTP/1.1 文本协议、需多连接并发或 pipelining、头部冗余、无推送。", "category": "应用层", "target_agent": "tutor"},
        {"question": "TCP 和 UDP 的区别？分别适合什么场景？", "expected": "TCP 面向连接、可靠（重传/确认/排序）、流量控制、拥塞控制，适合 HTTP/FTP/邮件等数据完整性敏感场景；UDP 无连接、不可靠、头部小、延迟低，适合 DNS/视频通话/游戏/直播。", "category": "传输层", "target_agent": "tutor"},
        {"question": "解释一下 TCP 拥塞控制的四个阶段。", "expected": "慢启动：cwnd 指数增长直到 ssthresh；拥塞避免：线性增长；快重传：收到 3 个重复 ACK 立即重传；快恢复：ssthresh=cwnd/2，cwnd=ssthresh 后线性增长，不回到慢启动。", "category": "TCP", "target_agent": "tutor"},
        {"question": "什么是 ARP 协议？工作过程是怎样的？", "expected": "ARP（地址解析协议）把 IP 地址解析为 MAC 地址。主机广播 ARP 请求「谁是 IP X」，目标主机单播应答自己的 MAC。结果缓存在 ARP 表中，有过期时间。", "category": "网络层", "target_agent": "tutor"},
        {"question": "HTTPS 在 HTTP 之上做了哪些事？", "expected": "TLS 握手协商对称密钥（ECDHE 等）、验证服务器证书链（CA 签发的公钥）、用对称加密保护数据传输完整性（AES）+ MAC（HMAC）。可选客户端证书做双向认证。", "category": "安全", "target_agent": "tutor"},
        {"question": "请讲解一下 OSI 七层模型和 TCP/IP 四层模型的对应关系", "expected": "OSI: 应用/表示/会话/传输/网络/数据链路/物理。TCP/IP: 应用（OSI 上三层）/传输/网络（互联网层）/网络接口（OSI 下两层）。OSI 是理论分层，TCP/IP 是实际实现。", "category": "分层", "target_agent": "doc"},
        {"question": "出一道关于 TCP 三次握手序号变化的题", "expected": "应当输出一道关于 SYN/ACK 标志位、seq/ack 序号变化的题，含选项和正确答案。", "category": "题目生成", "target_agent": "quiz"},
    ],
    "计算机组成原理": [
        {"question": "Cache 的三种映射方式（直接映射、全相联、组相联）有什么区别？", "expected": "直接映射：每个主存块只能放到唯一 cache 行，硬件简单但冲突多；全相联：任意主存块可放任意 cache 行，命中率高但需全比较，硬件贵；组相联：cache 分组，组内全相联、组间直接映射，折中方案。", "category": "存储层次", "target_agent": "tutor"},
        {"question": "什么是流水线冒险？三种类型分别是什么？", "expected": "结构冒险（资源冲突）、数据冒险（前一条结果还没写回后一条就要读）、控制冒险（分支跳转改变 PC 流向）。解决：插入气泡、forwarding 数据前递、分支预测。", "category": "流水线", "target_agent": "tutor"},
        {"question": "解释一下 RISC 和 CISC 的区别。", "expected": "RISC（精简指令集）：指令数量少、定长、寻址简单、Load/Store 架构、流水线友好（ARM/RISC-V/MIPS）；CISC（复杂指令集）：指令多、变长、寻址复杂、单条指令完成复杂操作（x86）。现代 x86 内部其实是 RISC 微指令。", "category": "指令集", "target_agent": "tutor"},
        {"question": "为什么需要 Cache？多级 Cache（L1/L2/L3）的设计动机？", "expected": "主存比 CPU 慢两个数量级，Cache 利用空间和时间局部性把热数据放在 CPU 附近的高速 SRAM。L1 最快最小（分指令/数据）；L2 更大慢一点；L3 共享给多核。层次设计平衡速度/容量/成本。", "category": "存储层次", "target_agent": "tutor"},
        {"question": "什么是 DMA？为什么用它？", "expected": "Direct Memory Access：外设和内存之间直接传数据，不经过 CPU。CPU 只需启动一次传输并接收完成中断，期间可干别的活。相比 PIO（程序控制 I/O）大幅减少 CPU 开销，适合磁盘/网卡等高速设备。", "category": "I/O", "target_agent": "tutor"},
        {"question": "请生成一段关于浮点数 IEEE 754 标准的讲解", "expected": "32 位单精度：1 位符号 + 8 位指数（偏移 127）+ 23 位尾数（隐含 1.f）。64 位双精度：1+11+52，偏移 1023。特殊值：±0、±∞、NaN、规约/非规约。", "category": "数据表示", "target_agent": "doc"},
        {"question": "出一道关于 Cache 命中率计算的题", "expected": "应当输出一道给定 Cache 命中率、命中/未命中时延，计算平均访存时间的题，含选项和正确答案。", "category": "题目生成", "target_agent": "quiz"},
    ],
}

# 全库模式（不选课）默认走机器学习题库
_DEFAULT_SEED_KEY = "机器学习"


@router.post("/seed")
async def seed_cases(
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """灌入当前课程的典型 case。已存在（同课程同问题）则跳过。
    - 传 course_id：按 course.name 在 SEED_CASES_BY_COURSE 里找对应题库
    - 不传：走全库未分类，灌「机器学习」题库
    - 课程名不在题库中：返回提示信息，不动数据
    """
    if course_id is not None:
        course = await db.get(Course, course_id)
        if course is None:
            raise HTTPException(404, f"course {course_id} not found")
        course_name = course.name
    else:
        course_name = _DEFAULT_SEED_KEY

    seeds = SEED_CASES_BY_COURSE.get(course_name)
    if seeds is None:
        return {
            "created": 0,
            "skipped": 0,
            "course_id": course_id,
            "course_name": course_name,
            "message": f"《{course_name}》暂未配置 seed 题库，请手动新增 case 或换其他课程",
        }

    stmt = select(TestCase)
    if course_id is not None:
        stmt = stmt.where(TestCase.course_id == course_id)
    else:
        stmt = stmt.where(TestCase.course_id.is_(None))
    q = await db.execute(stmt)
    existing = {tc.question for tc in q.scalars().all()}
    created = 0
    for s in seeds:
        if s["question"] in existing:
            continue
        db.add(TestCase(
            course_id=course_id,
            question=s["question"],
            expected=s["expected"],
            category=s["category"],
            target_agent=s["target_agent"],
        ))
        created += 1
    await db.commit()
    return {
        "created": created,
        "skipped": len(seeds) - created,
        "course_id": course_id,
        "course_name": course_name,
        "total_in_set": len(seeds),
    }
