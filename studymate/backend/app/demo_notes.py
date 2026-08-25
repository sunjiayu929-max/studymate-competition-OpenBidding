"""Provision a presentation-ready, source-diverse smart notebook for each user."""
from __future__ import annotations

from sqlalchemy import select

from app.db.models import Course, Folder, Note
from app.db.session import async_session_maker


_FDE_COURSE_NAME = "FDE 岗位知识库"
_DEMO_TAG = "系统演示"
_DEMO_NOTES = (
    {
        "title": "错题复盘：部署前需要确认哪些依赖？",
        "folder": "错题复盘",
        "source": "quiz",
        "tags": [_DEMO_TAG, "错题", "部署准备", "依赖核对"],
        "content": """## 题库错题\n\n**题目：** 客户现场部署前，FDE 应优先确认哪些依赖？\n\n### 容易漏掉的答案\n只确认模型能否运行。\n\n### 正确拆解\n1. **业务目标**：谁使用、要减少什么成本、验收指标是什么。\n2. **数据与权限**：数据来源、字段口径、脱敏边界和访问账号。\n3. **系统接口**：调用方、认证方式、超时重试、测试环境与日志。\n4. **运行条件**：网络、算力、镜像版本、监控告警与回滚方案。\n\n> 复盘结论：部署不是“把服务启动”，而是把可验证的业务结果和运行证据一起交付。""",
    },
    {
        "title": "思维导图：FDE 现场交付闭环",
        "folder": "知识结构",
        "source": "mindmap",
        "tags": [_DEMO_TAG, "思维导图", "交付闭环", "FDE"],
        "content": """## FDE 现场交付闭环\n\n```text\n需求澄清\n├─ 业务目标与价值假设\n├─ 使用者与场景边界\n└─ 验收指标\n\n方案与联调\n├─ 数据、权限、接口\n├─ 风险与降级路径\n└─ 最小可交付闭环\n\n部署验收\n├─ 上线检查与监控\n├─ 业务结果与运行证据\n└─ 复盘并沉淀模板 / Skill\n```\n\n**记忆线索：** 从客户的一句话需求，走到可验收结果，再把现场经验带回产品。""",
    },
    {
        "title": "讲义摘录：可验证价值假设怎么写",
        "folder": "岗位交付",
        "source": "doc",
        "tags": [_DEMO_TAG, "需求澄清", "价值假设", "讲义摘录"],
        "content": """## 可验证价值假设\n\n把“客户想用 AI 提效”改写为可验证的交付假设：\n\n> 对 **一线运营人员**，在 **工单分流场景** 中，通过 **知识检索与规则校验**，将 **首次响应时长** 降低到约定阈值；以 **抽样工单、日志和负责人确认** 作为验收证据。\n\n### 检查清单\n- 目标用户和高频场景是否明确？\n- 指标是否可测、可归属？\n- 最小闭环能否在现有数据和权限下完成？\n- 失败时如何降级、谁来接管？""",
    },
    {
        "title": "助教答疑：PoC 跑通为什么仍不能验收？",
        "folder": "助教答疑",
        "source": "tutor",
        "tags": [_DEMO_TAG, "助教答疑", "PoC", "验收证据"],
        "content": """## 问：PoC 能运行，为什么项目还不能验收？\n\n**答：** PoC 证明“技术可行”，验收还需要证明“业务可用、运行可控”。\n\n| PoC 已证明 | 验收还需补齐 |\n| --- | --- |\n| 模型能回答 | 目标用户任务是否真的变快 / 变准 |\n| 接口能调用 | 权限、限流、异常和降级是否可控 |\n| 演示数据有效 | 真实数据口径、监控日志和责任人签字 |\n\n下一步：把缺口写入验收清单，逐项留下可回溯证据。""",
    },
    {
        "title": "手动沉淀：驻场交付日报模板",
        "folder": "项目沉淀",
        "source": "manual",
        "tags": [_DEMO_TAG, "手动笔记", "驻场日报", "复盘"],
        "content": """## 今日现场进展\n\n- **客户目标**：明确本周先验证一个可量化场景。\n- **已完成**：完成数据字段核对与接口联调冒烟测试。\n- **风险**：历史数据口径不一致，需业务负责人确认。\n- **明日行动**：补齐异常样本，跑一次验收用例并记录日志。\n\n### 可复用沉淀\n将“字段确认表 + 接口联调清单 + 验收截图规范”固化进下一次项目模板。""",
    },
)


async def ensure_demo_notes(user_id: int) -> None:
    """Create each presentation note once while preserving all user-authored notes."""
    async with async_session_maker() as db:
        course_id = await db.scalar(select(Course.id).where(Course.name == _FDE_COURSE_NAME).limit(1))
        # SQLite's JSON containment support varies by installed SQLAlchemy/SQLite
        # versions. This small per-user list keeps the presentation seed portable.
        existing_notes = list((await db.scalars(select(Note).where(Note.user_id == user_id))).all())
        existing_titles = {
            note.title for note in existing_notes
            if _DEMO_TAG in (note.tags or [])
        }
        existing_folders = set((await db.scalars(select(Folder.name).where(Folder.user_id == user_id))).all())

        for item in _DEMO_NOTES:
            if item["title"] in existing_titles:
                continue
            if item["folder"] not in existing_folders:
                db.add(Folder(user_id=user_id, name=item["folder"]))
                existing_folders.add(item["folder"])
            db.add(Note(
                user_id=user_id,
                course_id=course_id,
                folder=item["folder"],
                title=item["title"],
                content_md=item["content"],
                tags=item["tags"],
                source=item["source"],
            ))
        await db.commit()


async def ensure_demo_notes_for_users() -> None:
    async with async_session_maker() as db:
        from app.db.models import User
        user_ids = list((await db.scalars(select(User.id))).all())
    for user_id in user_ids:
        await ensure_demo_notes(user_id)
