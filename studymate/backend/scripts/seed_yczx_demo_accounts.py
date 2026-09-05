#!/usr/bin/env python3
"""Provision the durable YCZX presentation accounts directly in SQLite.

The command is intentionally not part of application startup. It creates a backup,
then replaces data owned by the 20 designated demo accounts in one transaction.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from pwdlib import PasswordHash


PASSWORD = "m123456"
COMPANY = "河南掌门互动网络科技有限公司"
ROLE = "前线部署工程师（FDE）"
ANCHOR = datetime(2026, 9, 4, 17, 30)
ASSET_DIR = Path("resources/demo_private_knowledge/yczx")
FDE_PUBLIC_CATALOG = Path("resources/domain_knowledge/fde/fde_v1.json")

PEOPLE = (
    ("孙佳玉", "sunjiayu"),
    ("张祥辉", "zhangxianghui"),
    ("白新悦", "baixinyue"),
    ("袁士聪", "yuanshicong"),
    ("田一新", "tianyixin"),
    ("李佳怡", "lijiayi"),
    ("周翔", "zhouxiang"),
    ("陈卓", "chenzhuo"),
    ("刘飞", "liufei"),
)

STUDENT_ACCOUNTS = tuple((name, f"{stem}@yczx.com") for name, stem in PEOPLE)
WORKER_ACCOUNTS = tuple((name, f"{stem}pra@yczx.com") for name, stem in PEOPLE)
EMPTY_ACCOUNTS = (
    ("求职者测试", "test1@yczx.com", "student"),
    ("从业者测试", "test2@yczx.com", "worker"),
)
ALL_EMAILS = tuple(email for _, email in STUDENT_ACCOUNTS + WORKER_ACCOUNTS) + tuple(item[1] for item in EMPTY_ACCOUNTS)

CERTIFICATES = (
    ("ai-agent", "AI Agent 开发工程师"),
    ("embodied-ai", "具身智能算法工程师"),
    ("mlops", "MLOps 工程师"),
    ("ai-native-frontend", "AI-native 应用前端开发工程师"),
    ("edge-ai", "边缘计算 AI 工程师"),
    ("mes-engineer", "MES工程师"),
)

KNOWLEDGE_BASES = (
    ("FDE模式行业观察与实践", "fde-industry-observation"),
    ("业务痛点溯源与价值研判", "business-pain-value"),
    ("需求逻辑建模与边界定义", "requirement-model-boundary"),
    ("需求质量校验与实证复盘", "requirement-quality-review"),
    ("需求工程前沿与模式实践", "requirement-engineering-frontier"),
)

QUIZZES = (
    ("FDE 岗位边界与交付结果", 1, 1, 1, 1, "exam", "llm"),
    ("需求澄清如何形成可验证价值假设", 1, 1, 1, 2, "quest", "self"),
    ("现场数据接入与接口联调依赖清单", 1, 2, 0, 3, "exam", "llm"),
    ("产品反馈如何沉淀为可复用能力", 2, 1, 0, 4, "quest", "llm"),
    ("部署验收如何保留业务结果与运行证据", 2, 1, 0, 4, "quest", "llm"),
    ("综合复习", 1, 1, 1, 4, "exam", "llm"),
    ("客户访谈记录与需求优先级", 2, 1, 1, 2, "exam", "llm"),
    ("数据质量检查与字段映射", 2, 1, 1, 3, "quest", "self"),
    ("接口超时、重试与幂等控制", 2, 1, 1, 3, "exam", "llm"),
    ("灰度发布与异常回滚演练", 2, 1, 1, 4, "quest", "llm"),
    ("客户沟通与模型能力边界", 2, 1, 1, 3, "exam", "self"),
    ("FDE 岗位阶段综合验收", 2, 1, 1, 4, "exam", "llm"),
)

QUIZ_BANK = {
    "mcq": (
        ("接到客户提出的模糊需求后，第一步最合适的做法是？", ["明确目标用户、场景与验收指标", "立即选择参数最多的模型", "先承诺上线日期", "跳过访谈直接开发"], 0, "先把业务目标和验收标准变成可验证假设。"),
        ("现场联调前最需要共同确认的是？", ["接口、权限、样本和异常处理", "演示页面配色", "代码总行数", "个人偏好的编辑器"], 0, "联调依赖必须在进入客户环境前形成清单。"),
        ("最能证明部署已经可验收的材料是？", ["业务结果、日志和客户确认", "口头说明", "模型宣传页", "开发者个人判断"], 0, "验收证据需要可回溯并能由双方复核。"),
        ("客户新增诉求可能影响范围时应该？", ["记录影响并完成变更评审", "直接插入当前迭代", "拒绝沟通", "只在群里口头确认"], 0, "变更控制可以保护范围、排期和质量。"),
        ("发现模型低置信度输出时，优先采用？", ["转人工并记录样本", "隐藏置信度", "强制自动执行", "删除日志"], 0, "人机协同和失败留痕是高风险场景的基本要求。"),
        ("复盘中最有价值的输出是？", ["可执行改进项及验证方式", "责任人排名", "更长的会议纪要", "删除异常记录"], 0, "复盘需要推动系统性改进并验证其有效性。"),
    ),
    "fill": (
        ("将目标用户、场景、指标和证据写清楚的陈述称为____。", "可验证价值假设", "答案需要同时包含对象、变化和验证方法。"),
        ("接口调用链路中用于串联日志的唯一标识通常称为____。", "追踪标识", "追踪标识可关联请求、检索、模型和工具调用日志。"),
        ("上线失败时恢复到稳定版本的方案称为____方案。", "回滚", "回滚条件、负责人和操作步骤应在上线前确认。"),
        ("把异常现象、影响、原因和改进动作系统记录的过程称为____。", "故障复盘", "复盘结果应进入检查清单和后续验证。"),
        ("对低置信度结果交由人员确认属于____协同。", "人机", "人机协同用于控制自动化决策风险。"),
        ("验收时用于证明系统行为的日志、截图和签字记录统称为____。", "验收证据", "验收证据需要可重复核查。"),
    ),
    "code": (
        ("编写函数 validate_required(data, fields)，返回缺失字段列表。", "def validate_required(data, fields):\n    return [field for field in fields if data.get(field) in (None, '')]", "通过集中校验减少联调时的隐性字段错误。"),
        ("编写函数 retryable(status)，仅当状态码为 429 或不小于 500 时返回 True。", "def retryable(status):\n    return status == 429 or status >= 500", "明确重试范围，避免对业务错误进行无意义重试。"),
        ("编写函数 pass_gate(score, evidence)，分数不低于 85 且有证据时通过。", "def pass_gate(score, evidence):\n    return score >= 85 and bool(evidence)", "发布门禁同时检查质量结果和可追溯证据。"),
    ),
}

NOTES = (
    ("讲解摘录", "讲解摘录：可验证价值假设", "doc", ["需求澄清", "价值假设"], "## 可验证价值假设\n\n今天的讲解把模糊需求拆成了六个部分：目标用户、业务场景、当前基线、期望变化、测量窗口和验收证据。\n\n我的行动：下次访谈不再只问‘想实现什么功能’，而是追问谁使用、多久发生一次、失败由谁接管。"),
    ("错题本", "错题复盘：部署前依赖清单", "quiz", ["错题", "部署准备"], "## 错题\n\n我只选择了运行环境，漏掉了账号权限、网络路径、测试样本和回滚责任人。\n\n正确做法：联调前逐项确认环境、数据、接口、权限、监控、异常和验收标准。"),
    ("助教摘录", "助教摘录：PoC 跑通为什么不能直接验收", "tutor", ["助教答疑", "验收"], "## 助教结论\n\nPoC 证明技术可以工作，验收还要证明业务可用、运行可控。需要补齐真实样本结果、权限验证、异常降级、监控日志和客户确认。"),
    ("思维导图", "思维导图：FDE 现场交付闭环", "mindmap", ["思维导图", "FDE"], "## FDE 现场交付闭环\n\n```text\n需求澄清\n├─ 业务目标\n├─ 数据与权限\n└─ 验收指标\n方案联调\n├─ 最小闭环\n├─ 异常降级\n└─ 可观测日志\n部署验收\n├─ 业务结果\n├─ 运行证据\n└─ 复盘沉淀\n```"),
    ("需求澄清", "客户访谈前的十分钟准备清单", "manual", ["客户访谈", "需求澄清", "清单"], "## 访谈准备\n\n- 明确参会者的岗位和决策角色\n- 准备当前流程图和三个高频样本\n- 追问当前处理时长、错误率和人工成本\n- 确认数据来源、权限边界和敏感字段\n- 会后输出待确认事项及负责人\n\n提醒自己：不要急着给方案，先确认问题是否值得解决。"),
    ("项目周报", "第六周复盘：从能运行到可交付", "manual", ["周复盘", "交付", "成长记录"], "## 本周完成\n\n完成测试环境接口联调，补齐字段字典和三类异常样本；与业务负责人确认了验收口径。\n\n## 暴露的问题\n\n最初只记录成功请求，没有保留失败链路。现已增加追踪标识、依赖耗时和降级结果。\n\n## 下周行动\n\n完成小流量验证并整理第一版验收证据包。"),
    ("接口联调", "联调记录：偶发 502 的定位过程", "manual", ["接口联调", "排障", "502"], "## 现象\n\n测试环境在并发请求时偶发 502，单次重试后恢复。\n\n## 定位\n\n通过追踪标识发现网关超时为 8 秒，而下游检索在冷启动时接近 10 秒。\n\n## 处理\n\n预热索引、调整连接池并将超时口径统一；重试只覆盖 429 和 5xx。\n\n## 验证\n\n连续回放 300 条请求，没有再次出现同类错误。"),
    ("部署验收", "灰度发布与回滚步骤", "doc", ["部署", "灰度", "回滚"], "## 发布前\n\n记录镜像版本、配置差异、数据库变更和负责人；完成健康检查与关键业务冒烟测试。\n\n## 灰度阶段\n\n先放入内部账号，再开放 10% 流量，观察错误率、延迟、人工接管和业务指标。\n\n## 回滚条件\n\n核心接口连续五分钟错误率超过阈值，或业务负责人确认结果不可用时立即回滚。"),
    ("错题本", "错题复盘：为什么不能无限重试", "quiz", ["错题", "重试", "稳定性"], "## 我的错误\n\n把所有失败都设置成自动重试，忽略了参数错误和权限错误不会因重试而恢复。\n\n## 修正\n\n仅对限流、短时网络故障和服务端错误做有限重试；使用指数退避、随机抖动和幂等键，并把最终失败进入人工处理队列。"),
    ("助教摘录", "助教摘录：如何向客户解释模型边界", "tutor", ["客户沟通", "模型边界", "助教答疑"], "## 表达框架\n\n先说明系统适合处理的任务，再展示评测样本和当前指标；明确低置信度、敏感决策和规则冲突场景会转人工；最后说明监控、反馈和持续改进机制。\n\n避免使用‘模型绝对不会出错’这类不可验证承诺。"),
    ("阅读摘要", "阅读摘要：评测驱动的 AI 应用迭代", "doc", ["阅读", "评测", "AI应用"], "## 核心观点\n\n评测集应来自真实任务，覆盖正常、边界、异常和安全场景。每次改动同时比较正确率、稳定性、响应时间和成本。\n\n## 对项目的启发\n\n把客户现场修正过的样本匿名化后加入回归集，并为关键失败设置发布门禁。"),
    ("求职准备", "FDE 项目经历的 STAR 表达稿", "manual", ["求职", "STAR", "面试"], "## 情境\n\n客户希望用 AI 缩短工单响应时间，但制度资料分散、字段口径不一致。\n\n## 任务与行动\n\n我负责需求澄清、数据预检和接口联调，先统一字段字典，再建设可追溯检索并设计小流量验证。\n\n## 结果\n\n首次响应时间明显下降，异常请求可以追踪和人工接管；同时沉淀了检查清单和验收模板。"),
)

NOTES += (
    ("需求澄清", "需求评审纪要：客服工单自动分流", "manual", ["需求评审", "工单", "价值指标"], "## 会议结论\n\n首期只覆盖咨询、退款和物流三类高频工单，目标是把首次分流准确率提升到 88%，不直接自动关闭工单。\n\n## 待确认\n\n补齐夜间样本、转人工规则、敏感字段脱敏方式和业务负责人签字。"),
    ("讲解摘录", "讲解摘录：从业务指标反推评测集", "doc", ["评测集", "业务指标", "讲解摘录"], "## 方法\n\n先确定业务动作，再定义成功与失败样本。评测集按正常、边界、异常、安全四类分层，并保留真实分布。\n\n## 我的理解\n\n准确率不是唯一指标，还需要观察漏转人工率、响应时间和高风险错误。"),
    ("错题本", "错题复盘：字段为空和字段缺失不是一回事", "quiz", ["错题", "数据质量", "字段映射"], "## 错因\n\n我把空字符串、null 和字段不存在统一处理，导致默认值覆盖了真实的缺失状态。\n\n## 修正\n\n先验证字段是否存在，再区分空值、非法值和业务允许的空内容，并为三种情况分别记录日志。"),
    ("接口联调", "联调日报：第三方鉴权刷新失败", "manual", ["鉴权", "联调", "排障"], "## 现象\n\n令牌到期后首个请求返回 401，随后批量任务全部失败。\n\n## 根因与处理\n\n刷新令牌没有加并发锁，多个请求同时刷新造成旧令牌覆盖。增加单飞锁和失败重放后，连续压测 500 次未复现。"),
    ("部署验收", "生产发布前 30 分钟检查记录", "manual", ["生产发布", "检查清单", "验收"], "## 检查结果\n\n镜像、配置、数据库迁移、告警、回滚包和联系人均已确认。关键接口冒烟测试 12 项通过。\n\n## 遗留风险\n\n外部 OCR 服务仍受限流影响，已设置降级提示并安排值班观察。"),
    ("助教摘录", "助教摘录：如何写可执行的复盘改进项", "tutor", ["复盘", "改进项", "责任人"], "## 结论\n\n改进项必须包含动作、负责人、截止时间、验证方式和失败后的升级路径。\n\n示例：本周五前由接口负责人补齐三类异常样本，使用回放脚本验证，错误率高于 1% 时阻断发布。"),
    ("项目周报", "第七周复盘：完成小流量验证", "manual", ["周复盘", "灰度", "业务结果"], "## 本周进展\n\n完成 10% 流量灰度，累计处理 1,260 条请求。平均响应时间 1.8 秒，高风险结果全部进入人工确认。\n\n## 下周计划\n\n扩大到 30% 流量，重点监控夜间样本和退款类工单。"),
    ("阅读摘要", "阅读摘要：RAG 系统的可观测性", "doc", ["RAG", "可观测性", "阅读"], "## 关键指标\n\n记录检索命中、引用覆盖、模型延迟、失败降级和用户反馈，并用追踪标识串起每一次请求。\n\n## 应用\n\n准备在验收报告中增加来源命中率与无依据回答率。"),
    ("思维导图", "思维导图：线上故障处置路径", "mindmap", ["故障处置", "思维导图", "SOP"], "## 故障处置\n\n```text\n发现异常\n├─ 确认影响范围\n├─ 冻结继续变更\n├─ 降级或回滚\n├─ 验证核心链路\n└─ 通知客户并复盘\n```"),
    ("求职准备", "模拟面试复盘：项目难点怎么回答", "manual", ["模拟面试", "项目难点", "表达"], "## 改进前\n\n只描述技术方案，没有交代为什么选择它。\n\n## 改进后\n\n按约束、备选方案、取舍、实施结果和复盘五步回答，并给出响应时间、错误率和人工接管率。"),
    ("错题本", "错题复盘：验收通过不等于可以删除监控", "quiz", ["错题", "监控", "运维"], "## 错误认识\n\n以为验收通过后只保留业务监控即可。\n\n## 正确做法\n\n持续保留服务健康、依赖延迟、业务成功率、人工接管和数据漂移指标，并约定告警分级。"),
    ("客户复盘", "客户周会行动项跟踪", "manual", ["客户周会", "行动项", "交付"], "## 已完成\n\n字段字典 v1.3 已双方确认；退款类样本补齐 86 条；回滚演练耗时缩短到 6 分钟。\n\n## 进行中\n\n夜间工单覆盖率检查由数据负责人推进，预计周四提交结果。"),
)


def jd(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def backup_database(path: Path) -> Path:
    backup_dir = path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"{path.stem}-before-yczx-{datetime.now():%Y%m%d-%H%M%S}.db"
    source = sqlite3.connect(path)
    target = sqlite3.connect(backup)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return backup


def ensure_certificate_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS role_certificates (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            role_id VARCHAR(128) NOT NULL,
            role_name VARCHAR(128) NOT NULL,
            completed_rounds INTEGER NOT NULL DEFAULT 1,
            issued_at DATETIME NOT NULL,
            serial VARCHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            CONSTRAINT uq_role_certificate_user_role UNIQUE (user_id, role_id),
            CONSTRAINT uq_role_certificate_serial UNIQUE (serial)
        );
        CREATE INDEX IF NOT EXISTS ix_role_certificates_user_id ON role_certificates (user_id);
        CREATE INDEX IF NOT EXISTS ix_role_certificates_role_id ON role_certificates (role_id);
        CREATE INDEX IF NOT EXISTS ix_role_certificates_issued_at ON role_certificates (issued_at);
    """)


def ensure_evaluation_columns(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(evaluations)")}
    additions = {
        "profile_delta": "JSON DEFAULT '{}'",
        "evidence": "JSON DEFAULT '{}'",
        "summary_markdown": "TEXT DEFAULT ''",
        "next_topics": "JSON DEFAULT '[]'",
        "profile_version": "INTEGER DEFAULT 1",
    }
    for column, definition in additions.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE evaluations ADD COLUMN {column} {definition}")


def ensure_fde_public_knowledge(conn: sqlite3.Connection, backend_dir: Path) -> tuple[int, int]:
    """Ensure the shared FDE RAG course exists independently of browser state."""
    catalog_path = backend_dir / FDE_PUBLIC_CATALOG
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    course_name = str(catalog["course_name"])
    row = conn.execute("SELECT id FROM courses WHERE name=?", (course_name,)).fetchone()
    if row:
        course_id = int(row[0])
        conn.execute("UPDATE courses SET description=? WHERE id=?", (catalog.get("course_description", ""), course_id))
    else:
        cursor = conn.execute(
            "INSERT INTO courses (name,description,created_at) VALUES (?,?,?)",
            (course_name, catalog.get("course_description", ""), ANCHOR - timedelta(days=150)),
        )
        course_id = int(cursor.lastrowid)

    existing = {
        row[0]
        for row in conn.execute(
            "SELECT chroma_id FROM knowledge_chunks WHERE course_id=? AND chroma_id LIKE 'fde-v1:%'",
            (course_id,),
        )
    }
    for item in catalog.get("items", []):
        stable_id = f"fde-v1:{item['id']}"
        if stable_id in existing:
            continue
        meta = {
            **item.get("meta", {}),
            "catalog_version": catalog.get("catalog_version", "fde-v1"),
            "source_notice": catalog.get("source_notice", ""),
        }
        conn.execute(
            """INSERT INTO knowledge_chunks
            (course_id,content,source,page,url,meta,chroma_id,embedding,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (course_id, item["content"], item.get("source", "FDE 岗位资料"), item.get("page"), item.get("url"), jd(meta), stable_id, None, ANCHOR - timedelta(days=120)),
        )
    count = int(conn.execute("SELECT COUNT(*) FROM knowledge_chunks WHERE course_id=?", (course_id,)).fetchone()[0])
    if count < len(catalog.get("items", [])):
        raise RuntimeError(f"FDE 公共岗位知识库片段不足：期望至少 {len(catalog.get('items', []))}，实际 {count}")
    return course_id, count


def ensure_user(conn: sqlite3.Connection, *, name: str, email: str, learner_type: str, password_hash: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE lower(email)=lower(?)", (email,)).fetchone()
    company = COMPANY if learner_type == "worker" else ""
    stage = "在职转型" if learner_type == "worker" else "应届求职"
    if row:
        user_id = int(row[0])
        conn.execute("""UPDATE users SET name=?, role='student', email=?, password_hash=?, email_verified_at=?,
            is_active=1, learner_type=?, study_stage=?, company=?, target_role=? WHERE id=?""",
            (name, email, password_hash, ANCHOR, learner_type, stage, company, ROLE, user_id))
        return user_id
    cur = conn.execute("""INSERT INTO users
        (name,role,email,password_hash,email_verified_at,is_active,created_at,learner_type,study_stage,company,target_role)
        VALUES (?, 'student', ?, ?, ?, 1, ?, ?, ?, ?, ?)""",
        (name, email, password_hash, ANCHOR - timedelta(days=120), ANCHOR - timedelta(days=120), learner_type, stage, company, ROLE))
    return int(cur.lastrowid)


def delete_user_history(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute("DELETE FROM feedback_replies WHERE feedback_id IN (SELECT id FROM feedback WHERE user_id=?)", (user_id,))
    conn.execute("DELETE FROM feedback WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM attempts WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM quiz_session_items WHERE session_id IN (SELECT id FROM quiz_sessions WHERE user_id=?)", (user_id,))
    conn.execute("DELETE FROM quiz_sessions WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM interview_launch_tickets WHERE attempt_id IN (SELECT id FROM interview_attempts WHERE user_id=?)", (user_id,))
    conn.execute("DELETE FROM interview_attempts WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM user_knowledge_chunks WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM user_knowledge_documents WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM user_knowledge_bases WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM role_certificates WHERE user_id=?", (user_id,))
    for table in ("profile_snapshots", "profiles", "learning_paths", "training_runs", "events", "tutor_sessions", "evaluations", "folders", "notes", "theory_assessments", "user_sessions"):
        conn.execute(f'DELETE FROM "{table}" WHERE user_id=?', (user_id,))
    resource_ids = [r[0] for r in conn.execute("SELECT id FROM resources WHERE user_id=?", (user_id,))]
    if resource_ids:
        marks = ",".join("?" for _ in resource_ids)
        conn.execute(f"DELETE FROM attempts WHERE exercise_id IN (SELECT id FROM exercises WHERE resource_id IN ({marks}))", tuple(resource_ids))
        conn.execute(f"DELETE FROM exercises WHERE resource_id IN ({marks})", tuple(resource_ids))
    conn.execute("DELETE FROM resources WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM enterprise_task_assignments WHERE learner_id=?", (user_id,))
    conn.execute("DELETE FROM enterprise_memberships WHERE user_id=?", (user_id,))


def remove_legacy_runtime_demo_accounts(conn: sqlite3.Connection) -> int:
    """Remove synthetic users previously created by request-time dashboard seeding."""
    rows = list(conn.execute("SELECT id FROM users WHERE lower(email) LIKE '%@lanshan.example'"))
    for (user_id,) in rows:
        delete_user_history(conn, int(user_id))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    return len(rows)


def ensure_enterprise(conn: sqlite3.Connection) -> tuple[int, int, list[int]]:
    owner = conn.execute("SELECT id FROM users WHERE email='admin@pramate.com'").fetchone()
    if owner is None:
        raise RuntimeError("缺少 admin@pramate.com，无法建立演示企业")
    enterprise = conn.execute("SELECT id FROM enterprises WHERE invite_code='PRAMATE-DEMO'").fetchone()
    if enterprise is None:
        cur = conn.execute("INSERT INTO enterprises (name,invite_code,owner_id,status,created_at) VALUES (?, 'PRAMATE-DEMO', ?, 'active', ?)", (COMPANY, owner[0], ANCHOR - timedelta(days=150)))
        enterprise_id = int(cur.lastrowid)
    else:
        enterprise_id = int(enterprise[0])
        conn.execute("UPDATE enterprises SET name=? WHERE id=?", (COMPANY, enterprise_id))
    conn.execute("UPDATE users SET company=? WHERE lower(email) LIKE '%@pramate.com'", (COMPANY,))
    kb = conn.execute("SELECT id FROM enterprise_knowledge_bases WHERE enterprise_id=? AND name=?", (enterprise_id, "FDE 客户现场交付资料库")).fetchone()
    materials = [
        {"title": "需求访谈与价值假设模板", "type": "方法模板", "detail": "记录目标用户、流程基线、量化指标和验收证据。"},
        {"title": "部署前检查清单", "type": "交付规范", "detail": "核对环境、权限、接口、监控、回滚和责任人。"},
        {"title": "现场问题复盘规范", "type": "复盘资料", "detail": "沉淀时间线、影响、证据、根因和改进动作。"},
    ]
    if kb is None:
        cur = conn.execute("""INSERT INTO enterprise_knowledge_bases
            (enterprise_id,creator_id,name,target_role,source_course_id,description,materials,status,created_at)
            VALUES (?,?,?,?,6,?,?,'published',?)""",
            (enterprise_id, owner[0], "FDE 客户现场交付资料库", ROLE, "河南掌门互动网络科技有限公司的 FDE 交付规范与复盘资产。", jd(materials), ANCHOR - timedelta(days=100)))
        kb_id = int(cur.lastrowid)
    else:
        kb_id = int(kb[0])
        conn.execute("UPDATE enterprise_knowledge_bases SET description=?, materials=?, status='published' WHERE id=?", ("河南掌门互动网络科技有限公司的 FDE 交付规范与复盘资产。", jd(materials), kb_id))
    task_specs = (
        ("完成客户需求澄清与价值假设评审", "依据客户访谈记录提交一份可验证价值假设，并说明基线、目标和证据来源。", "training", "需求访谈与价值假设模板", "本周三前"),
        ("完成部署前环境与权限检查", "使用检查清单核对网络、账号、接口、配置、监控和回滚责任人。", "training", "部署前检查清单", "本周五前"),
        ("阅读现场问题复盘规范", "阅读复盘案例并标注现象、影响、根因、修复和预防措施。", "reading", "现场问题复盘规范", "阅读后确认"),
        ("提交一次客户验收证据包", "整理业务结果、关键日志、版本信息、异常样本和客户确认记录。", "training", "验收证据目录", "下周一前"),
        ("完成接口字段映射与异常码核对", "基于真实样本核对字段类型、必填约束、枚举值、异常码和兼容策略。", "training", "接口字段映射表", "本周四前"),
        ("完成一次灰度发布与回滚演练", "在测试环境执行小流量放量、指标观察、异常触发和版本回退。", "training", "灰度发布演练单", "下周三前"),
        ("阅读模型能力边界与人工接管规范", "明确低置信度、敏感决策和规则冲突场景的人工接管要求。", "reading", "模型边界说明", "阅读后确认"),
        ("提交现场交付周复盘", "用数据说明本周完成结果、遗留风险、客户反馈和下周行动。", "training", "现场交付周报模板", "每周五前"),
    )
    task_ids = []
    for title, description, task_type, material_title, due in task_specs:
        row = conn.execute("SELECT id FROM enterprise_tasks WHERE enterprise_id=? AND title=?", (enterprise_id, title)).fetchone()
        content = f"{description}\n\n提交要求：写明负责人、完成时间、证据链接和未解决风险。"
        if row is None:
            cur = conn.execute("""INSERT INTO enterprise_tasks
                (enterprise_id,creator_id,title,description,task_type,target_role,material_title,material_content,knowledge_base_id,status,due_label,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,'published',?,?)""",
                (enterprise_id, owner[0], title, description, task_type, ROLE, material_title, content, kb_id, due, ANCHOR - timedelta(days=45)))
            task_ids.append(int(cur.lastrowid))
        else:
            task_ids.append(int(row[0]))
            conn.execute("UPDATE enterprise_tasks SET description=?,task_type=?,target_role=?,material_title=?,material_content=?,knowledge_base_id=?,status='published',due_label=? WHERE id=?", (description, task_type, ROLE, material_title, content, kb_id, due, row[0]))
    return enterprise_id, int(owner[0]), task_ids


def seed_profile(conn: sqlite3.Connection, user_id: int, index: int) -> None:
    dims = {
        "knowledge_base": {"math": 3 + index % 2, "programming": 4, "cs_foundation": 3 + index % 2, "data_sql": 4, "subject_prior": 4},
        "cognitive_style": {"practice_first": 5, "stepwise": 4, "challenge_seeking": 3 + index % 2, "reflective": 4},
        "goals": {"primary": ROLE, "deadline": "2026 年 10 月前达到独立交付水平", "target_topics": ["需求澄清", "数据与接口联调", "异常降级", "部署验收", "客户复盘"]},
        "weak_points": {"topics": ["复杂异常路径覆盖", "客户沟通中的量化追问"], "error_types": ["边界条件遗漏", "验收证据不够量化"]},
        "pace": {"hours_per_week": 9 + index % 5, "intensity": "fast" if index % 3 == 0 else "medium"},
        "preference": {"document": 4, "mindmap": 3, "quiz": 5, "code": 4, "video": 3, "reading": 4},
        "employment_skills": {"programming": 4, "algorithms": 3, "data_ai": 4, "systems": 4, "engineering": 4, "professional": 4},
        "learner_background": {
            "education": "本科应届毕业生" if index < 9 else "本科，已有 2 年软件实施与客户支持经历",
            "major": "计算机科学与技术" if index % 2 == 0 else "软件工程",
            "practice_status": "has",
        },
        "profile_coverage": {"knowledge_base": True, "cognitive_style": True, "resource_preference": True, "employment_skills": True},
        "theory_assessments": {},
        "interview_assessments": {},
        "training_rounds": [],
    }
    conn.execute("INSERT INTO profiles (user_id,dims,version,updated_at) VALUES (?,?,9,?)", (user_id, jd(dims), ANCHOR))
    triggers = (
        "initial_diagnosis", "theory_assessment:fde", "quiz_completed", "training_feedback",
        "knowledge_base_updated", "interview_assessment:fde", "eval_apply", "training_feedback",
    )
    for n, trigger in enumerate(triggers):
        snapshot = json.loads(jd(dims))
        growth = min(4, n // 2)
        snapshot["knowledge_base"]["data_sql"] = min(5, 2 + growth)
        snapshot["employment_skills"]["engineering"] = min(5, 2 + growth)
        conn.execute(
            "INSERT INTO profile_snapshots (user_id,snapshot,trigger_event,created_at) VALUES (?,?,?,?)",
            (user_id, jd(snapshot), trigger, ANCHOR - timedelta(days=max(2, 88 - n * 12 + index % 3))),
        )


def seed_certificates(conn: sqlite3.Connection, user_id: int, index: int) -> None:
    for n, (role_id, role_name) in enumerate(CERTIFICATES):
        issued = ANCHOR - timedelta(days=155 - n * 21 + index)
        serial = f"SM-{role_id.replace('-', '').upper()[:8]}-{issued:%Y%m%d}-{user_id:06d}"
        conn.execute("""INSERT INTO role_certificates
            (user_id,role_id,role_name,completed_rounds,issued_at,serial,created_at)
            VALUES (?,?,?,?,?,?,?)""", (user_id, role_id, role_name, 3 + n % 2, issued, serial, issued))


def seed_notes(conn: sqlite3.Connection, user_id: int, course_id: int, index: int) -> None:
    created_folders: set[str] = set()
    for n, (folder, title, source, tags, content) in enumerate(NOTES):
        created = ANCHOR - timedelta(days=max(1, 88 - n * 3 + index % 4))
        if folder not in created_folders:
            conn.execute("INSERT INTO folders (user_id,name,created_at) VALUES (?,?,?)", (user_id, folder, created))
            created_folders.add(folder)
        conn.execute("""INSERT INTO notes
            (user_id,course_id,title,content_md,tags,source,folder,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)""", (user_id, course_id, title, content, jd(tags), source, folder, created, created + timedelta(hours=2)))


def seed_quizzes(conn: sqlite3.Connection, user_id: int, course_id: int, index: int) -> None:
    bank_offsets = {"mcq": 0, "fill": 0, "code": 0}
    for quiz_index, (topic, mcq, fill, code, difficulty, mode, grading) in enumerate(QUIZZES):
        submitted = ANCHOR - timedelta(days=max(1, 82 - quiz_index * 7 + index % 3))
        counts = {"mcq": mcq, "fill": fill, "code": code}
        item_specs = []
        for item_type, count in counts.items():
            for _ in range(count):
                bank = QUIZ_BANK[item_type]
                item_specs.append((item_type, bank[bank_offsets[item_type] % len(bank)]))
                bank_offsets[item_type] += 1
        wrong_index = (quiz_index + index) % len(item_specs)
        item_scores = [72 if n == wrong_index and quiz_index in {1, 3, 5} else 100 for n in range(len(item_specs))]
        total_score = round(sum(item_scores) / len(item_scores), 1)
        cur = conn.execute("""INSERT INTO quiz_sessions
            (user_id,course_id,topic,mcq_count,fill_count,code_count,difficulty,mode,code_grading,status,score,duration_ms,submitted_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,'submitted',?,?,?,?)""",
            (user_id, course_id, topic, mcq, fill, code, difficulty, mode, grading, total_score, (7 + quiz_index * 2 + index % 5) * 60000, submitted, submitted - timedelta(minutes=20)))
        session_id = int(cur.lastrowid)
        for item_index, ((item_type, spec), score) in enumerate(zip(item_specs, item_scores)):
            if item_type == "mcq":
                question, options, answer, explanation = spec
                starter = ""
                answer_value = answer
                user_value = answer if score == 100 else (answer + 1) % len(options)
            elif item_type == "fill":
                question, answer, explanation = spec
                options, starter = [], ""
                answer_value = answer
                user_value = answer if score == 100 else "待补充"
            else:
                question, answer, explanation = spec
                options, starter = [], "def solution(...):\n    pass"
                answer_value = answer
                user_value = answer if score == 100 else starter
            conn.execute("""INSERT INTO quiz_session_items
                (session_id,idx,type,question,options,starter,answer_key,explanation,difficulty,user_answer,is_correct,score,judge_reason,error_tags,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (session_id, item_index, item_type, question, jd(options), starter, jd({"value": answer_value}), explanation, difficulty, jd({"value": user_value}), score == 100, score, "答案覆盖核心验收点" if score == 100 else "遗漏边界条件，建议回看部署检查清单", jd([] if score == 100 else ["边界条件", "验收证据"]), submitted))


def seed_knowledge(conn: sqlite3.Connection, user_id: int, course_id: int, backend_dir: Path, index: int) -> None:
    for kb_index, (title, slug) in enumerate(KNOWLEDGE_BASES):
        created = ANCHOR - timedelta(days=70 - kb_index * 9 + index % 3)
        cur = conn.execute("""INSERT INTO user_knowledge_bases
            (user_id,name,description,bound_course_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?)""", (user_id, title, f"围绕{title}持续整理的项目资料、方法记录和复盘证据。", course_id, created, created + timedelta(days=3)))
        kb_id = int(cur.lastrowid)
        for extension, media_type in (("pdf", "application/pdf"), ("md", "text/markdown")):
            relative = ASSET_DIR / f"{slug}.{extension}"
            absolute = backend_dir / relative
            if not absolute.is_file():
                raise RuntimeError(f"缺少演示资料：{absolute}")
            raw = absolute.read_bytes()
            text = (backend_dir / ASSET_DIR / f"{slug}.md").read_text(encoding="utf-8")
            filename = f"{title}.{extension}"
            cur = conn.execute("""INSERT INTO user_knowledge_documents
                (user_id,knowledge_base_id,filename,media_type,size,status,parse_progress,vector_progress,error_detail,page_count,source_path,checksum_sha256,retry_count,ocr_status,started_at,finished_at,created_at)
                VALUES (?,?,?,?,?,'ready_keyword',100,100,?,2,?,?,0,'not_needed',?,?,?)""",
                (user_id, kb_id, filename, media_type, len(raw), "演示资料已完成关键词索引，可直接检索", relative.as_posix(), hashlib.sha256(raw).hexdigest(), created, created + timedelta(minutes=1), created))
            doc_id = int(cur.lastrowid)
            chunks = [part.strip() for part in text.split("## ") if part.strip()]
            for chunk_index, chunk in enumerate(chunks):
                conn.execute("""INSERT INTO user_knowledge_chunks
                    (user_id,knowledge_base_id,document_id,content,page,embedding,created_at)
                    VALUES (?,?,?,?,?,NULL,?)""", (user_id, kb_id, doc_id, chunk, 1 if chunk_index < 3 else 2, created))


def seed_interviews(conn: sqlite3.Connection, user_id: int, course_id: int, index: int) -> None:
    competencies = ["需求澄清", "Python 与 SQL", "系统集成", "客户沟通", "交付验证"]
    for n, focus in enumerate((
        "需求澄清与价值假设",
        "现场联调与异常排查",
        "部署验收与客户复盘",
        "模型能力边界与人工接管",
        "综合项目陈述与岗位胜任力",
    )):
        attempt_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"studymate-yczx-{user_id}-interview-{n}"))
        completed = ANCHOR - timedelta(days=max(1, 58 - n * 14 + index % 5))
        competency_scores = []
        scores = []
        for c_index, competency in enumerate(competencies):
            score = min(95, 72 + n * 6 + c_index * 2 + index % 4)
            scores.append(score)
            competency_scores.append({"competency": competency, "score": score, "evidence": f"能够结合{focus}案例说明具体行动和结果。", "improvement": "补充量化指标、异常边界和复盘证据。"})
        role_score = round(sum(scores) / len(scores), 1)
        generic = {"professional_ability": 78+n*4, "learning_ability": 82+n*3, "team_collaboration": 76+n*4, "problem_solving": 79+n*4, "communication_expression": 75+n*5}
        general_score = round(generic["professional_ability"]*.4 + generic["learning_ability"]*.2 + generic["team_collaboration"]*.15 + generic["problem_solving"]*.15 + generic["communication_expression"]*.1, 1)
        overall = round(role_score*.6 + general_score*.4, 1)
        report = {"schema_version": 1, "attempt_id": attempt_id, "overall_score": overall, "role_match_score": role_score, "general_score": general_score, "generic_scores": generic, "competency_scores": competency_scores, "summary": f"候选人围绕{focus}给出了结构化回答，能够说明现场约束、实施动作和验收结果。", "strengths": ["能从业务目标反推实施路径", "重视接口、权限与可观测性", "回答中包含复盘和改进动作"], "improvements": ["进一步量化业务结果", "主动说明失败场景和降级方案"], "question_count": 8+n, "started_at": (completed-timedelta(minutes=35)).isoformat(), "completed_at": completed.isoformat()}
        report_json = jd(report)
        conn.execute("""INSERT INTO interview_attempts
            (id,user_id,role_id,role_name,course_id,role_context,profile_snapshot,status,external_interview_id,report,report_hash,launched_at,started_at,completed_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,'completed',?,?,?,?,?,?,?,?)""",
            (attempt_id, user_id, "fde", ROLE, course_id, jd({"competencies": competencies, "focus": focus}), jd({"display_name": "演示学习者", "goals": {"primary": ROLE}}), f"yczx-demo-{user_id}-{n+1}", report_json, hashlib.sha256(report_json.encode()).hexdigest(), completed-timedelta(minutes=38), completed-timedelta(minutes=35), completed, completed-timedelta(minutes=40), completed))


def seed_activity(conn: sqlite3.Connection, user_id: int, course_id: int, index: int) -> None:
    rng = random.Random(user_id * 7919)
    resources = (
        ("doc", "客户需求澄清工作单", "把客户原始诉求整理为目标用户、流程基线、价值假设、数据条件和验收标准。", "doc_agent"),
        ("mindmap", "FDE 现场交付全景图", "从需求澄清到部署验收的节点、依赖、风险和证据关系。", "mindmap_agent"),
        ("reading", "企业 AI 项目落地阅读清单", "围绕需求工程、RAG 评测、可观测性和生产运维的延伸阅读。", "reading_agent"),
        ("code", "接口预检与重试示例", "包含字段校验、幂等键、超时、有限重试和追踪标识的 Python 示例。", "code_agent"),
        ("video", "部署验收现场演练", "12 分钟讲解环境核对、灰度验证、异常回滚和证据归档。", "video_agent"),
        ("doc", "客户验收证据包模板", "业务指标、运行日志、版本配置、异常样本和双方确认记录。", "doc_agent"),
        ("quiz", "需求澄清阶段自测", "覆盖业务目标、用户场景、当前基线、数据边界和验收指标的 12 道练习。", "quiz_agent"),
        ("guide", "数据接入风险检查表", "记录字段口径、样本分布、敏感数据、权限审批和质量负责人。", "practice_guide_agent"),
        ("mindmap", "接口联调依赖关系图", "展示客户端、网关、服务、检索、模型与外部依赖之间的调用关系。", "mindmap_agent"),
        ("code", "日志追踪与耗时统计脚本", "用追踪标识串联调用链，并输出分阶段耗时与失败节点。", "code_agent"),
        ("reading", "高风险 AI 场景人工接管指南", "整理低置信度、敏感决策、规则冲突和服务不可用时的接管方式。", "reading_agent"),
        ("video", "客户访谈示范与反例", "通过正反两组访谈演示如何追问业务指标、约束和验收证据。", "video_agent"),
        ("guide", "灰度发布与回滚作战手册", "覆盖发布前确认、流量分组、指标阈值、回滚条件和客户通知。", "practice_guide_agent"),
        ("quiz", "部署验收阶段自测", "围绕环境、权限、监控、回滚、业务指标和证据归档进行综合检查。", "quiz_agent"),
        ("code", "样本回放与结果对比工具", "批量回放匿名化样本，比较版本间准确率、延迟和失败分布。", "code_agent"),
        ("guide", "现场问题复盘报告示例", "包含故障时间线、影响范围、证据、根因、修复和预防动作。", "practice_guide_agent"),
        ("mindmap", "FDE 岗位能力成长路线", "把需求、数据、集成、部署、沟通和复盘能力映射到阶段任务。", "mindmap_agent"),
        ("reading", "生产级 RAG 评测与监控资料", "关注引用覆盖、无依据回答率、检索命中、延迟、成本和反馈闭环。", "reading_agent"),
    )
    resource_ids = []
    for n, (kind, title, content, agent) in enumerate(resources):
        created = ANCHOR - timedelta(days=max(1, 86 - n * 5 + index % 4))
        cur = conn.execute("""INSERT INTO resources
            (user_id,course_id,type,title,content,citations,agent_id,ai_generated,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""", (user_id, course_id, kind, title, content, jd([{"source": "FDE 岗位知识库", "page": n+1}]), agent, 1, created))
        resource_ids.append(int(cur.lastrowid))
    # 真实使用轨迹：每类学习资源均产生两次练习尝试，保留答题与耗时证据。
    for n, resource_id in enumerate(resource_ids):
        for attempt_index in range(2):
            correct = (n + attempt_index + index) % 5 != 0
            exercise = conn.execute(
                """INSERT INTO exercises (resource_id,type,content,answer,difficulty,tags,created_at)
                VALUES (?,?,?,?,?,?,?)""",
                (
                    resource_id,
                    "short" if attempt_index else "mcq",
                    jd({"question": f"请说明该资源中的第 {attempt_index + 1} 个关键交付检查点。"}),
                    jd({"value": "说明业务目标、异常边界和可验证证据"}),
                    2 + n % 3,
                    jd(["FDE", "交付验证", "资源练习"]),
                    ANCHOR - timedelta(days=max(1, 76 - n * 3 - attempt_index)),
                ),
            )
            conn.execute(
                """INSERT INTO attempts (user_id,exercise_id,answer,correct,duration_ms,created_at)
                VALUES (?,?,?,?,?,?)""",
                (
                    user_id,
                    int(exercise.lastrowid),
                    jd({"value": "已结合项目案例说明检查项，并补充了失败后的处理步骤。" if correct else "只描述了正常流程。"}),
                    correct,
                    (90 + n * 7 + attempt_index * 35) * 1000,
                    ANCHOR - timedelta(days=max(1, 75 - n * 3 - attempt_index)),
                ),
            )
    nodes = [{"id": f"n{n+1}", "title": title, "status": "completed" if n < 4 else "active", "order": n+1} for n, title in enumerate(("岗位认知", "需求澄清", "接口联调", "异常排查", "部署验收", "客户复盘"))]
    edges = [{"source": f"n{n}", "target": f"n{n+1}"} for n in range(1, 6)]
    conn.execute("INSERT INTO learning_paths (user_id,course_id,nodes,edges,status,created_at) VALUES (?,?,?,?,?,?)", (user_id, course_id, jd(nodes), jd(edges), "active", ANCHOR-timedelta(days=80)))
    training_topics = (
        "岗位认知", "需求澄清", "价值假设", "数据预检", "字段映射", "接口联调",
        "异常降级", "灰度发布", "部署验收", "客户沟通", "交付复盘", "综合演练",
    )
    for n, topic in enumerate(training_topics):
        completed = ANCHOR - timedelta(days=max(1, 88 - n * 7 + index % 3))
        conn.execute("""INSERT INTO training_runs
            (id,user_id,course_id,domain,target_role,topic,status,stage,generation_round,diagnosis,outputs,reviews,decision,feedback,created_at,updated_at)
            VALUES (?,?,?,?,?,?,'completed','published',1,?,?,?,?,?,?,?)""",
            (f"yczx-{user_id}-{n+1:02d}", user_id, course_id, "特定软件开发", ROLE, topic, jd({"knowledge_score": min(94, 70+n*2), "weak_points": ["异常边界"], "goal": f"完成{topic}训练", "evidence_count": 4+n}), jd({"resource_ids": resource_ids[n:n+4], "note_ids": list(range(max(0, n-2), n+1))}), jd({"evidence_review": {"score": min(96, 78+n*2), "summary": "知识来源与岗位任务可追溯"}, "practice_review": {"score": min(95, 76+n*2), "summary": "步骤、异常与验收动作完整"}, "difficulty_review": {"score": min(97, 80+n), "summary": "难度与当前画像匹配"}}), jd({"status": "publish", "reason": "三项审核与总裁决均通过发布门禁"}), jd({"accuracy": min(96, 72+n*2), "answered_count": 8+n%4, "rating": 4+(n%2), "note": "内容贴近现场任务，已将反馈写入下一轮训练计划。"}), completed-timedelta(hours=2), completed))
    sessions = (
        ("如何把客户需求变成可验收目标", "客户只说想用 AI 提效，我应该从哪里开始问？", "先定位具体使用者和流程节点，再确认当前基线、期望变化、数据条件和验收证据。", "我会先准备现状指标和三类真实样本，再组织下一轮访谈。"),
        ("现场接口联调排障", "测试环境偶发 502，怎样快速定位？", "用追踪标识串起网关、服务和依赖日志，再核对超时、重试和连接池。", "已经发现下游冷启动超过网关超时，我准备补预热和有限重试。"),
        ("部署验收证据整理", "PoC 已跑通，验收还缺什么？", "补齐真实样本结果、权限验证、异常降级、运行监控、版本信息和客户确认。", "我会按业务可用、运行可控和责任边界三部分整理证据包。"),
        ("模型能力边界怎么向客户说明", "客户问模型能不能保证百分之百正确，应该怎样回答？", "展示真实评测结果，明确低置信度与敏感场景转人工，并说明持续监控和反馈机制。", "这样既不夸大能力，也能给出清晰的风险控制方案。"),
        ("如何设计小流量灰度", "准备上线时，第一批流量应该怎么选？", "先选内部账号和低风险场景，观察错误率、延迟、人工接管率和业务指标，再逐级放量。", "我会同时写清停止放量和立即回滚的阈值。"),
        ("客户反馈如何进入下一轮迭代", "现场收集了很多零散意见，怎样整理才有效？", "把反馈关联到用户、场景、影响、证据和期望结果，再按业务价值与风险排序。", "我会区分缺陷、需求和使用问题，避免所有反馈都直接进开发。"),
        ("面试项目经历表达优化", "我的项目回答总像流水账，怎么改？", "用情境、目标、关键取舍、实施动作、量化结果和复盘组织回答，突出你负责的部分。", "我准备补充响应时间、错误率和回滚耗时三个结果指标。"),
        ("交付复盘行动项", "复盘会上列了问题，但后面没人跟进怎么办？", "每项改进必须有负责人、截止时间、验证方式和升级条件，并在下一次周会上核验。", "我会把改进项同步进交付清单，而不是只留在会议纪要里。"),
    )
    for n, (title, question, answer, follow_up) in enumerate(sessions):
        created = ANCHOR - timedelta(days=max(1, 58 - n * 8 + index % 3))
        session_course_id = None if n < 4 else course_id
        is_active = 1 if n in {3, 7} else 0
        messages = [
            {"role": "user", "content": question},
            {"role": "assistant", "content": answer},
            {"role": "user", "content": follow_up},
            {"role": "assistant", "content": "很好。下一步请把动作、负责人、时间和验证证据写进笔记，完成后再对照岗位标准复盘一次。"},
        ]
        conn.execute("INSERT INTO tutor_sessions (user_id,course_id,title,messages,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", (user_id, session_course_id, title, jd(messages), is_active, created, created+timedelta(minutes=18)))
    evaluation_rates = (0.68, 0.74, 0.81, 0.86, 0.90, 0.93)
    evaluation_days = (76, 61, 46, 31, 16, 2)
    evidence_types = ("doc", "mindmap", "quiz", "reading", "code", "video", "note")
    for n, rate in enumerate(evaluation_rates):
        attempts = 12 + n * 6
        correct = round(attempts * rate)
        consumed = list(evidence_types[:min(7, 3 + n)])
        time_spent = 55 + n * 32 + index % 12
        topic_names = ("需求澄清", "系统集成", "部署验收")
        topic_totals = {topic: attempts // len(topic_names) for topic in topic_names}
        for topic in topic_names[:attempts % len(topic_names)]:
            topic_totals[topic] += 1
        raw_topic_rates = (max(0.5, rate - 0.04), rate, min(0.98, rate + 0.03))
        topic_correct = {
            topic: min(topic_totals[topic], round(topic_totals[topic] * topic_rate))
            for topic, topic_rate in zip(topic_names, raw_topic_rates)
        }
        correction = correct - sum(topic_correct.values())
        while correction:
            changed = False
            for topic in (topic_names if correction > 0 else reversed(topic_names)):
                candidate = topic_correct[topic] + (1 if correction > 0 else -1)
                if 0 <= candidate <= topic_totals[topic]:
                    topic_correct[topic] = candidate
                    correction += -1 if correction > 0 else 1
                    changed = True
                    if not correction:
                        break
            if not changed:
                raise RuntimeError("无法构造一致的阶段评估题目分布")
        topic_difficulty = {}
        for topic in topic_names:
            topic_total = topic_totals[topic]
            difficulty_totals = [topic_total // 4 + (1 if difficulty < topic_total % 4 else 0) for difficulty in range(4)]
            difficulty_correct = list(difficulty_totals)
            errors_left = topic_total - topic_correct[topic]
            for difficulty in range(3, -1, -1):
                deducted = min(errors_left, difficulty_correct[difficulty])
                difficulty_correct[difficulty] -= deducted
                errors_left -= deducted
            topic_difficulty[topic] = {
                str(difficulty + 1): {
                    "correct": difficulty_correct[difficulty],
                    "total": difficulty_totals[difficulty],
                    "rate": round(difficulty_correct[difficulty] / difficulty_totals[difficulty], 2) if difficulty_totals[difficulty] else 0.0,
                }
                for difficulty in range(4)
            }
        scores = {
            "overall_correct_rate": round(correct / attempts, 4),
            "by_topic": {
                topic: {"correct": topic_correct[topic], "total": topic_totals[topic], "rate": round(topic_correct[topic] / topic_totals[topic], 2)}
                for topic in topic_names
            },
            "by_topic_difficulty": topic_difficulty,
            "total_attempts": attempts,
            "total_correct": correct,
            "engagement_score": min(96, 66 + n * 6 + index % 3),
            "answer_completion": {"answered": attempts, "total": attempts, "rate": 1.0},
            "resource_coverage": {"consumed": len(consumed), "available": 7, "rate": round(len(consumed) / 7, 3)},
            "engagement_breakdown": {"time_spent_min": time_spent, "time_score": min(60, round(time_spent / 4)), "resource_types": len(consumed), "resource_variety_score": min(40, len(consumed) * 6)},
        }
        evidence = {
            "course_id": course_id,
            "course_name": "FDE 岗位知识库",
            "topic": "前线部署工程师阶段训练",
            "quiz_count": attempts,
            "time_spent_min": time_spent,
            "resources_consumed": consumed,
            "resources_available": list(evidence_types),
            "topics_studied": ["需求澄清", "接口联调", "异常降级", "部署验收", "客户复盘"][:min(5, 2 + n)],
        }
        summary = f"## 第 {n + 1} 次阶段评估\n\n本阶段完成 {attempts} 道岗位练习，正确 {correct} 道；累计使用 {len(consumed)} 类学习资源，有效学习 {time_spent} 分钟。\n\n当前优势是能够把技术动作与交付证据关联，下一阶段继续加强复杂异常路径、量化验收和客户沟通。"
        profile_delta = {
            "knowledge_base": {"subject_prior": 1} if n in {0, 2, 4} else {},
            "preference": {"quiz": 1} if n == 1 else {},
            "employment_skills": {"engineering": 1, "professional": 1} if n in {3, 5} else {},
            "weak_points": {
                "topics": ["复杂异常路径覆盖", "客户沟通中的量化追问"] if n >= 3 else ["接口异常定位", "验收证据整理"],
                "error_types": ["验收证据不够量化"],
            },
        }
        conn.execute(
            """INSERT INTO evaluations
            (user_id,scores,suggestions,profile_delta,evidence,summary_markdown,next_topics,profile_version,created_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (user_id, jd(scores), jd(["继续补充量化业务结果", "加强异常路径和回滚演练", "把客户确认纳入验收证据"]), jd(profile_delta), jd(evidence), summary, jd(["复杂异常排查", "灰度发布", "客户验收"]), 4 + n, ANCHOR - timedelta(days=evaluation_days[n] + index % 2)),
        )
    event_catalog = (
        ("page_leave", "workspace"), ("resource_open", "resource"), ("page_leave", "quiz"),
        ("quiz_submit", "quiz"), ("note_update", "note"), ("page_leave", "notes"),
        ("tutor_message", "tutor"), ("knowledge_search", "knowledge"), ("training_complete", "training"),
        ("interview_review", "interview"), ("resource_feedback", "resource"), ("page_leave", "report"),
    )
    for n in range(240):
        day = n // 3
        ts = ANCHOR - timedelta(days=day, hours=rng.randint(0, 9), minutes=rng.randint(0, 59))
        action, target = event_catalog[n % len(event_catalog)]
        duration = rng.randint(5, 36) * 60000 if action == "page_leave" else rng.randint(15, 240) * 1000
        conn.execute(
            "INSERT INTO events (user_id,action,target_type,target_id,duration_ms,meta,ts) VALUES (?,?,?,?,?,?,?)",
            (user_id, action, target, str(rng.choice(resource_ids)), duration, jd({"source": "yczx_seed", "course_id": course_id, "device": rng.choice(("desktop", "desktop", "tablet")), "session": f"demo-{user_id}-{day:02d}"}), ts),
        )
    comments = (
        "案例和检查清单很贴近现场工作。", "希望增加更多异常排查样本。", "验收证据模板可以直接用于项目复盘。",
        "代码示例帮助我理解了超时与重试边界。", "思维导图适合在客户会议前快速复习。", "建议补充更多数据权限场景。",
        "灰度发布步骤清楚，能直接转成交付清单。", "面试练习让我更会量化项目结果。", "复盘模板把负责人和验证方式写得很明确。", "整体内容与 FDE 岗位任务匹配。",
    )
    for n, comment in enumerate(comments):
        conn.execute("INSERT INTO feedback (user_id,target_type,target_id,rating,comment,created_at) VALUES (?,?,?,?,?,?)", (user_id, "resource", str(resource_ids[n]), 4 if n in {1, 5} else 5, comment, ANCHOR-timedelta(days=max(1, 42-n*4))))
    assessment_specs = (
        ("如何确认需求的业务价值？", "需求澄清"),
        ("联调前要核对哪些依赖？", "系统集成"),
        ("如何设计部署回滚？", "交付验证"),
        ("怎样向客户解释低置信度结果？", "客户沟通"),
        ("如何保留可追踪日志？", "Python 与 SQL"),
        ("灰度期间什么情况应停止放量？", "交付验证"),
        ("怎样把客户反馈转成迭代项？", "需求澄清"),
        ("复盘行动项至少要包含什么？", "客户沟通"),
    )
    assessment_items = [
        {"id": f"q{n+1}", "index": n+1, "type": "mcq", "question": text, "options": ["业务目标、约束与验证证据", "只看模型参数", "只确认上线日期", "只保留口头结论"], "answer": 0, "explanation": "岗位任务必须关联业务目标、风险边界与可追溯证据。", "difficulty": 2 + n % 3, "competency": competency, "source": "FDE 岗位知识库"}
        for n, (text, competency) in enumerate(assessment_specs)
    ]
    assessment_result = {
        "knowledge_level": "进阶",
        "weak_topics": ["复杂异常路径", "量化验收"],
        "source_count": 8,
        "competency_scores": {"需求澄清": 88, "系统集成": 86, "交付验证": 90, "客户沟通": 84, "Python 与 SQL": 89},
        "items": [{"id": f"q{n+1}", "user_answer": 0 if n not in {3} else 1, "is_correct": n not in {3}} for n in range(len(assessment_items))],
    }
    conn.execute("""INSERT INTO theory_assessments
        (user_id,role_id,role_name,course_id,status,items,answers,score,result,duration_ms,submitted_at,created_at)
        VALUES (?,'fde',?,?,'submitted',?,?,?,?,?,?,?)""", (user_id, ROLE, course_id, jd(assessment_items), jd({f"q{n+1}": 0 if n != 3 else 1 for n in range(len(assessment_items))}), 87+index%7, jd(assessment_result), 22*60000, ANCHOR-timedelta(days=88)+timedelta(minutes=22), ANCHOR-timedelta(days=88)))


def sync_profile_evidence(conn: sqlite3.Connection, user_id: int) -> None:
    profile_row = conn.execute("SELECT dims FROM profiles WHERE user_id=?", (user_id,)).fetchone()
    theory_row = conn.execute(
        """SELECT id,role_id,role_name,course_id,score,result,submitted_at
        FROM theory_assessments WHERE user_id=? AND status='submitted' ORDER BY id DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    interview_row = conn.execute(
        """SELECT id,role_id,role_name,course_id,report,completed_at
        FROM interview_attempts WHERE user_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    if not profile_row or not theory_row or not interview_row:
        raise RuntimeError(f"用户 {user_id} 的画像证据不完整")
    dims = json.loads(profile_row[0])
    theory_result = json.loads(theory_row[5])
    dims["theory_assessments"] = {
        theory_row[1]: {
            "assessment_id": theory_row[0],
            "role_id": theory_row[1],
            "role_name": theory_row[2],
            "course_id": theory_row[3],
            "score": theory_row[4],
            "knowledge_level": theory_result.get("knowledge_level", "进阶"),
            "competency_scores": theory_result.get("competency_scores", {}),
            "weak_topics": theory_result.get("weak_topics", []),
            "source_count": theory_result.get("source_count", 0),
            "completed_at": str(theory_row[6]),
        }
    }
    interview_report = json.loads(interview_row[4])
    competency_scores = {
        item["competency"]: item["score"]
        for item in interview_report.get("competency_scores", [])
        if isinstance(item, dict) and item.get("competency")
    }
    dims["interview_assessments"] = {
        interview_row[1]: {
            "attempt_id": interview_row[0],
            "role_id": interview_row[1],
            "role_name": interview_row[2],
            "course_id": interview_row[3],
            "overall_score": interview_report.get("overall_score", 0),
            "role_match_score": interview_report.get("role_match_score", 0),
            "general_score": interview_report.get("general_score", 0),
            "competency_scores": competency_scores,
            "weak_competencies": [name for name, score in competency_scores.items() if score < 80],
            "completed_at": str(interview_row[5]),
        }
    }
    conn.execute("UPDATE profiles SET dims=?,version=9,updated_at=? WHERE user_id=?", (jd(dims), ANCHOR, user_id))


def seed_enterprise_membership(conn: sqlite3.Connection, user_id: int, enterprise_id: int, task_ids: list[int], index: int, *, empty: bool = False) -> None:
    created = ANCHOR - timedelta(days=115)
    conn.execute("INSERT INTO enterprise_memberships (enterprise_id,user_id,member_role,job_title,status,created_at) VALUES (?,?,'learner',?,'active',?)", (enterprise_id, user_id, ROLE, created))
    if empty:
        return
    statuses = ("completed", "completed", "in_progress", "accepted")
    for n, task_id in enumerate(task_ids):
        status = statuses[(n + index) % len(statuses)]
        accepted = ANCHOR - timedelta(days=24-n*4+index%3)
        started = accepted + timedelta(hours=4) if status in {"completed", "in_progress"} else None
        completed = started + timedelta(days=2) if status == "completed" else None
        conn.execute("""INSERT INTO enterprise_task_assignments
            (task_id,learner_id,status,accepted_at,started_at,completed_at,created_at)
            VALUES (?,?,?,?,?,?,?)""", (task_id, user_id, status, accepted, started, completed, accepted-timedelta(days=1)))


def validate(conn: sqlite3.Connection) -> None:
    public_kb = conn.execute(
        """SELECT courses.id,COUNT(knowledge_chunks.id)
        FROM courses LEFT JOIN knowledge_chunks ON knowledge_chunks.course_id=courses.id
        WHERE courses.name='FDE 岗位知识库' GROUP BY courses.id"""
    ).fetchone()
    if not public_kb or public_kb[1] < 30:
        raise RuntimeError("FDE 公共岗位知识库没有完成持久化")
    placeholders = ",".join("?" for _ in ALL_EMAILS)
    users = list(conn.execute(f"SELECT id,email,target_role FROM users WHERE email IN ({placeholders})", ALL_EMAILS))
    if len(users) != 20:
        raise RuntimeError(f"账号数量异常：{len(users)}")
    id_by_email = {email: user_id for user_id, email, _ in users}
    for _, email, target_role in users:
        if target_role != ROLE:
            raise RuntimeError(f"{email} 的默认目标岗位不是 {ROLE}")
    for email in tuple(e for _, e in STUDENT_ACCOUNTS + WORKER_ACCOUNTS):
        user_id = id_by_email[email]
        expected = {
            "role_certificates": 6,
            "quiz_sessions": 12,
            "notes": 24,
            "interview_attempts": 5,
            "user_knowledge_bases": 5,
            "user_knowledge_documents": 10,
            "profile_snapshots": 8,
            "training_runs": 12,
            "events": 240,
            "tutor_sessions": 8,
            "evaluations": 6,
            "resources": 18,
            "feedback": 10,
            "theory_assessments": 1,
            "attempts": 36,
        }
        for table, count in expected.items():
            actual = conn.execute(f'SELECT COUNT(*) FROM "{table}" WHERE user_id=?', (user_id,)).fetchone()[0]
            if actual != count:
                raise RuntimeError(f"{email} 的 {table} 数量异常：期望 {count}，实际 {actual}")
        profile_dims = json.loads(conn.execute("SELECT dims FROM profiles WHERE user_id=?", (user_id,)).fetchone()[0])
        if profile_dims.get("training_rounds"):
            raise RuntimeError(f"{email} FDE training progress must be zero")
        fde_certificates = conn.execute(
            "SELECT COUNT(*) FROM role_certificates WHERE user_id=? AND (lower(role_id)='fde' OR lower(role_name) LIKE '%fde%')",
            (user_id,),
        ).fetchone()[0]
        if fde_certificates:
            raise RuntimeError(f"{email} still has an FDE certificate")
        if not all(profile_dims.get("profile_coverage", {}).values()):
            raise RuntimeError(f"{email} 的画像采集覆盖不完整")
        if not profile_dims.get("theory_assessments") or not profile_dims.get("interview_assessments"):
            raise RuntimeError(f"{email} 缺少理论或面试画像证据")
        latest_scores, latest_evidence, latest_delta = conn.execute(
            "SELECT scores,evidence,profile_delta FROM evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        parsed_scores = json.loads(latest_scores)
        if parsed_scores.get("total_attempts", 0) < 30 or len(json.loads(latest_evidence).get("resources_consumed", [])) < 6:
            raise RuntimeError(f"{email} 的阶段报告证据不足")
        if sum(item["total"] for item in parsed_scores["by_topic"].values()) != parsed_scores["total_attempts"]:
            raise RuntimeError(f"{email} 的阶段报告主题题数与总题数不一致")
        for topic, difficulty_map in parsed_scores["by_topic_difficulty"].items():
            if set(difficulty_map) != {"1", "2", "3", "4"} or sum(item["total"] for item in difficulty_map.values()) != parsed_scores["by_topic"][topic]["total"]:
                raise RuntimeError(f"{email} 的阶段报告难度分布不完整")
        if not json.loads(latest_delta).get("weak_points"):
            raise RuntimeError(f"{email} 的阶段报告缺少能力变化信号")
    for _, email, _ in EMPTY_ACCOUNTS:
        user_id = id_by_email[email]
        for table in ("role_certificates", "quiz_sessions", "notes", "interview_attempts", "user_knowledge_bases", "events", "tutor_sessions", "evaluations", "resources", "training_runs", "feedback", "attempts", "theory_assessments", "profiles"):
            actual = conn.execute(f'SELECT COUNT(*) FROM "{table}" WHERE user_id=?', (user_id,)).fetchone()[0]
            if actual:
                raise RuntimeError(f"空账号 {email} 出现了 {table} 数据")
    fk_errors = list(conn.execute("PRAGMA foreign_key_check"))
    if fk_errors:
        raise RuntimeError(f"外键检查失败：{fk_errors[:5]}")


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=backend_dir / "studymate.db")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db_path = args.db.resolve()
    if not db_path.is_file():
        raise SystemExit(f"找不到数据库：{db_path}")
    missing_assets = [str(backend_dir / ASSET_DIR / f"{slug}.{ext}") for _, slug in KNOWLEDGE_BASES for ext in ("pdf", "md") if not (backend_dir / ASSET_DIR / f"{slug}.{ext}").is_file()]
    if missing_assets:
        raise SystemExit("请先生成演示资料：\n" + "\n".join(missing_assets))
    if not args.apply:
        print("将创建或重置以下 20 个专用演示账号：")
        for email in ALL_EMAILS:
            print(f"- {email}")
        print("使用 --apply 执行；执行前会自动备份数据库。")
        return 0
    backup = backup_database(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        ensure_certificate_table(conn)
        ensure_evaluation_columns(conn)
        enterprise_id, _, task_ids = ensure_enterprise(conn)
        removed_legacy_users = remove_legacy_runtime_demo_accounts(conn)
        password_hash = PasswordHash.recommended().hash(PASSWORD)
        course_id, public_chunk_count = ensure_fde_public_knowledge(conn, backend_dir)
        filled = STUDENT_ACCOUNTS + WORKER_ACCOUNTS
        for index, (name, email) in enumerate(filled):
            learner_type = "worker" if email.endswith("pra@yczx.com") else "student"
            user_id = ensure_user(conn, name=name, email=email, learner_type=learner_type, password_hash=password_hash)
            delete_user_history(conn, user_id)
            seed_profile(conn, user_id, index)
            seed_certificates(conn, user_id, index)
            seed_notes(conn, user_id, course_id, index)
            seed_quizzes(conn, user_id, course_id, index)
            seed_knowledge(conn, user_id, course_id, backend_dir, index)
            seed_interviews(conn, user_id, course_id, index)
            seed_activity(conn, user_id, course_id, index)
            sync_profile_evidence(conn, user_id)
            if learner_type == "worker":
                seed_enterprise_membership(conn, user_id, enterprise_id, task_ids, index)
        for name, email, learner_type in EMPTY_ACCOUNTS:
            user_id = ensure_user(conn, name=name, email=email, learner_type=learner_type, password_hash=password_hash)
            delete_user_history(conn, user_id)
            if learner_type == "worker":
                seed_enterprise_membership(conn, user_id, enterprise_id, task_ids, 0, empty=True)
        validate(conn)
        conn.execute("INSERT OR REPLACE INTO system_migrations (version,description,applied_at) VALUES (?,?,?)", ("yczx-demo-accounts-2026.09-v2", "永久写入 20 个 YCZX 演示账号及 18 组完整真实使用轨迹", ANCHOR))
        conn.commit()
    except Exception:
        conn.rollback()
        conn.close()
        shutil.copy2(backup, db_path)
        raise
    finally:
        if conn:
            conn.close()
    print(f"已写入数据库：{db_path}")
    print(f"备份：{backup}")
    print(f"20 个账号已就绪；18 个含完整历史，2 个保持空白；FDE 公共知识库 {public_chunk_count} 条片段。")
    if removed_legacy_users:
        print(f"已移除旧的请求时动态演示账号：{removed_legacy_users} 个。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
