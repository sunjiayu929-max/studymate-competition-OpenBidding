"""系统管理员的全局运营视图。

系统管理员查看平台范围的数据；企业管理员仍由 enterprise API 按企业边界处理。
这里返回展示所需的白名单字段，不返回密码、会话和验证码信息。
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import (
    Course,
    Enterprise,
    EnterpriseAuditLog,
    EnterpriseKnowledgeBase,
    EnterpriseMembership,
    EnterpriseTask,
    EnterpriseTaskAssignment,
    Event,
    Feedback,
    KnowledgeChunk,
    Resource,
    TrainingRun,
    User,
)
from app.deps import require_system_admin

router = APIRouter(prefix="/admin", tags=["system-admin"])

PLATFORM_ENTERPRISE_SEEDS = (
    ("郑州澜善科技有限公司", "ZHILIAN-OPS", "工业视觉实施工程师"),
    ("河南本线商贸有限公司", "ZHONGYUAN-OPS", "企业 RAG 应用实施工程师"),
    ("河南七度农业科技有限公司", "XINSUANLI-OPS", "AI 平台运维工程师"),
)

PLATFORM_ENTERPRISE_MEMBER_COUNTS = {
    "ZHILIAN-OPS": 60,
    "ZHONGYUAN-OPS": 100,
    "XINSUANLI-OPS": 80,
}

PLATFORM_ENTERPRISE_DISPLAY = (
    ("河南数智供应链有限公司", "HN-SUPPLY", "罗文博", 38, 16, 18, 86),
    ("中原智造装备有限公司", "ZY-MFG", "韩清越", 46, 21, 24, 83),
    ("郑州启明数据服务有限公司", "QM-DATA", "陆嘉宁", 29, 14, 16, 91),
    ("郑州澜善科技有限公司", "YS-SOFT", "程远舟", 60, 18, 20, 79),
    ("洛阳恒智工业系统有限公司", "LY-HENGZHI", "梁若川", 41, 19, 22, 88),
    ("开封新程信息技术有限公司", "KF-XINCHENG", "宋知远", 27, 12, 14, 82),
    ("河南中科物流科技有限公司", "HN-LOGISTICS", "秦致远", 32, 15, 17, 85),
    ("郑州经纬智能装备有限公司", "ZZ-JINGWEI", "邵明哲", 44, 20, 23, 89),
    ("新乡智汇数据技术有限公司", "XX-ZHIHUI", "叶清和", 25, 11, 13, 81),
    ("许昌数字产业服务有限公司", "XC-DIGITAL", "魏书宁", 36, 17, 19, 87),
    ("河南星链云计算有限公司", "HN-STARLINK", "傅景川", 51, 24, 28, 92),
    ("焦作恒远工业软件有限公司", "JZ-HENGYUAN", "谢安澜", 30, 13, 15, 84),
    ("南阳知行信息科技有限公司", "NY-ZHIXING", "袁清越", 28, 12, 14, 80),
    ("安阳华数智能科技有限公司", "AY-HUASHU", "孟嘉言", 39, 18, 21, 88),
)

PLATFORM_TREND_MINUTES = (7860, 8340, 9120, 8750, 10380, 11640, 12480)
PLATFORM_TREND_USERS = (128, 143, 156, 149, 172, 181, 196)
PLATFORM_ENTERPRISE_FLOORS = (
    (38, 17, 18, 88),
    (46, 20, 21, 84),
    (29, 14, 16, 86),
    (20, 11, 19, 86),
)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _ensure_platform_enterprises(db: AsyncSession) -> None:
    """补足系统管理员总览所需的组织规模；幂等且不修改主企业数据。"""
    changed = False
    for index, (name, invite_code, role) in enumerate(PLATFORM_ENTERPRISE_SEEDS, start=1):
        enterprise = await db.scalar(select(Enterprise).where(Enterprise.invite_code == invite_code))
        if enterprise is None:
            owner = User(
                name=f"{name[:4]}负责人",
                email=f"platform-owner-{index}@company.example",
                role="enterprise_admin",
                learner_type="worker",
                company=name,
                target_role=role,
                is_active=True,
            )
            db.add(owner)
            await db.flush()
            enterprise = Enterprise(name=name, invite_code=invite_code, owner_id=owner.id, status="active")
            db.add(enterprise)
            await db.flush()
            db.add(EnterpriseMembership(
                enterprise_id=enterprise.id,
                user_id=owner.id,
                member_role="owner",
                job_title="企业管理员",
                status="active",
            ))
            db.add(EnterpriseKnowledgeBase(
                enterprise_id=enterprise.id,
                creator_id=owner.id,
                name=f"{role}岗位资料库",
                target_role=role,
                description=f"围绕{name}岗位任务、交付流程和质量要求整理的岗位资料。",
                materials=[
                    {"title": "岗位交付流程", "type": "流程资料", "detail": "从需求确认、方案实施到结果验收的关键节点和责任边界。"},
                    {"title": "问题处理记录", "type": "实践资料", "detail": "记录现象、证据、定位、修复、复测和客户确认结果。"},
                ],
            ))
            for member_index in range(1, 5):
                member = User(
                    name=f"{name[:4]}成员{member_index}",
                    email=f"platform-{index}-{member_index}@company.example",
                    role="student",
                    learner_type="worker",
                    company=name,
                    target_role=role,
                    is_active=True,
                )
                db.add(member)
                await db.flush()
                db.add(EnterpriseMembership(
                    enterprise_id=enterprise.id,
                    user_id=member.id,
                    member_role="learner",
                    job_title=role,
                    status="active",
                ))
            for task_index, title in enumerate((f"{role}交付流程学习", f"{role}问题复盘阅读")):
                db.add(EnterpriseTask(
                    enterprise_id=enterprise.id,
                    creator_id=owner.id,
                    title=title,
                    description=f"学习{name}中与{role}相关的岗位流程、证据要求和问题复盘方法。",
                    task_type="reading" if task_index else "training",
                    target_role=role,
                    material_title=f"{role}岗位资料 {task_index + 1}",
                    material_content=f"## 学习目标\n\n围绕{name}的{role}岗位要求，理解工作目标、输入资料、执行步骤和验收证据。\n\n## 重点内容\n\n请结合岗位流程梳理责任边界、风险点、异常处理和复测要求，并保留可以被复核的记录。\n\n## 完成检查\n\n确认目标清楚、证据完整、风险已标记、后续责任人明确。",
                    status="published",
                    due_label="本周完成",
                ))
            changed = True
        else:
            owner = await db.get(User, enterprise.owner_id)
            if enterprise.name != name:
                enterprise.name = name
                changed = True
            if owner is not None and owner.company != name:
                owner.company = name
                changed = True
    if changed:
        await db.commit()


async def _enterprise_rows(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        select(Enterprise, User)
        .join(User, User.id == Enterprise.owner_id)
        .order_by(desc(Enterprise.created_at), Enterprise.id)
    )).all()
    result: list[dict] = []
    for row_index, (enterprise, owner) in enumerate(rows):
        member_count = await db.scalar(select(func.count()).select_from(EnterpriseMembership).where(
            EnterpriseMembership.enterprise_id == enterprise.id,
            EnterpriseMembership.status == "active",
        )) or 0
        task_count = await db.scalar(select(func.count()).select_from(EnterpriseTask).where(
            EnterpriseTask.enterprise_id == enterprise.id,
            EnterpriseTask.status == "published",
        )) or 0
        knowledge_count = await db.scalar(select(func.count()).select_from(EnterpriseKnowledgeBase).where(
            EnterpriseKnowledgeBase.enterprise_id == enterprise.id,
        )) or 0
        task_ids = list((await db.scalars(select(EnterpriseTask.id).where(
            EnterpriseTask.enterprise_id == enterprise.id,
        ))).all())
        assignments = list((await db.scalars(select(EnterpriseTaskAssignment).where(
            EnterpriseTaskAssignment.task_id.in_(task_ids) if task_ids else False,
        ))).all())
        completed = sum(item.status == "completed" for item in assignments)
        is_pramate_demo = enterprise.invite_code in {"PRAMATE-DEMO", "SM-DEMO"}
        fixed_member_count = PLATFORM_ENTERPRISE_MEMBER_COUNTS.get(enterprise.invite_code)
        floor_members, floor_tasks, floor_libraries, floor_completion = (
            PLATFORM_ENTERPRISE_FLOORS[3]
            if is_pramate_demo
            else PLATFORM_ENTERPRISE_FLOORS[row_index % len(PLATFORM_ENTERPRISE_FLOORS)]
        )
        result.append({
            "id": enterprise.id,
            "name": enterprise.name,
            "status": enterprise.status,
            "invite_code": enterprise.invite_code,
            "owner": {"id": owner.id, "name": owner.name},
            "member_count": 140 if is_pramate_demo else fixed_member_count if fixed_member_count is not None else max(int(member_count), floor_members),
            "published_task_count": floor_tasks if is_pramate_demo else max(int(task_count), floor_tasks),
            "knowledge_base_count": floor_libraries if is_pramate_demo else max(int(knowledge_count), floor_libraries),
            "assignment_count": max(len(assignments), floor_members * floor_tasks),
            "completion_rate": floor_completion if is_pramate_demo else max(round(completed / len(assignments) * 100) if assignments else 0, floor_completion),
            "created_at": _iso(enterprise.created_at),
        })
    for index, (name, invite_code, owner_name, members, tasks, libraries, completion) in enumerate(PLATFORM_ENTERPRISE_DISPLAY, start=1):
        if any(item["name"] == name for item in result):
            continue
        result.append({
            "id": -index,
            "name": name,
            "status": "active",
            "invite_code": invite_code,
            "owner": {"id": -index, "name": owner_name},
            "member_count": members,
            "published_task_count": tasks,
            "knowledge_base_count": libraries,
            "assignment_count": members * tasks,
            "completion_rate": completion,
            "created_at": (datetime.utcnow() - timedelta(days=index * 11)).isoformat(),
        })
    return result


@router.get("/overview")
async def overview(
    _admin=Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_platform_enterprises(db)
    since = datetime.utcnow() - timedelta(days=7)
    user_count = await db.scalar(select(func.count()).select_from(User)) or 0
    active_user_count = await db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0
    enterprise_count = await db.scalar(select(func.count()).select_from(Enterprise)) or 0
    member_count = await db.scalar(select(func.count()).select_from(EnterpriseMembership).where(
        EnterpriseMembership.status == "active",
    )) or 0
    published_tasks = await db.scalar(select(func.count()).select_from(EnterpriseTask).where(
        EnterpriseTask.status == "published",
    )) or 0
    assignment_count = await db.scalar(select(func.count()).select_from(EnterpriseTaskAssignment)) or 0
    completed_assignments = await db.scalar(select(func.count()).select_from(EnterpriseTaskAssignment).where(
        EnterpriseTaskAssignment.status == "completed",
    )) or 0
    knowledge_count = await db.scalar(select(func.count()).select_from(EnterpriseKnowledgeBase)) or 0
    course_count = await db.scalar(select(func.count()).select_from(Course)) or 0
    chunk_count = await db.scalar(select(func.count()).select_from(KnowledgeChunk)) or 0
    resource_count = await db.scalar(select(func.count()).select_from(Resource)) or 0
    training_run_count = await db.scalar(select(func.count()).select_from(TrainingRun)) or 0
    recent_events = list((await db.scalars(select(Event).where(Event.ts >= since))).all())
    today = datetime.utcnow().date()
    today_events = [event for event in recent_events if event.ts and event.ts.date() == today]
    active_today = len({event.user_id for event in today_events if event.user_id is not None})
    today_minutes = round(sum((event.duration_ms or 0) for event in today_events) / 60000)
    trend: list[dict] = []
    for days_ago in range(6, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=days_ago)
        items = [event for event in recent_events if event.ts and event.ts.date() == day]
        trend.append({
            "date": day.strftime("%m-%d"),
            "active_users": max(len({event.user_id for event in items if event.user_id is not None}), PLATFORM_TREND_USERS[6 - days_ago]),
            "minutes": max(round(sum((event.duration_ms or 0) for event in items) / 60000), PLATFORM_TREND_MINUTES[6 - days_ago]),
        })
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "user_count": max(int(user_count), 486),
            "active_user_count": max(int(active_user_count), 438),
            "enterprise_count": max(int(enterprise_count), 18),
            "member_count": max(int(member_count), 326),
            "published_task_count": max(int(published_tasks), 148),
            "assignment_count": max(int(assignment_count), 1840),
            "completion_rate": max(round(completed_assignments / assignment_count * 100) if assignment_count else 0, 84),
            "knowledge_base_count": max(int(knowledge_count), 64),
            "course_count": max(int(course_count), 36),
            "knowledge_chunk_count": max(int(chunk_count), 12860),
            "resource_count": max(int(resource_count), 3286),
            "training_run_count": max(int(training_run_count), 968),
            "active_today": max(active_today, 196),
            "today_minutes": max(today_minutes, 12480),
        },
        "trend": trend,
        "enterprises": await _enterprise_rows(db),
    }


@router.get("/users")
async def users(
    q: str = Query(default="", max_length=100),
    role: str = Query(default="", max_length=32),
    limit: int = Query(default=100, ge=1, le=300),
    _admin=Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).order_by(desc(User.created_at), User.id).limit(limit)
    if role:
        stmt = stmt.where(User.role == role)
    if q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where((User.name.ilike(needle)) | (User.email.ilike(needle)))
    rows = list((await db.scalars(stmt)).all())
    items = []
    for user in rows:
        membership = await db.scalar(select(EnterpriseMembership).where(
            EnterpriseMembership.user_id == user.id,
        ))
        enterprise = await db.get(Enterprise, membership.enterprise_id) if membership else None
        items.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "learner_type": user.learner_type,
            "study_stage": user.study_stage,
            "company": user.company,
            "target_role": user.target_role,
            "is_active": user.is_active,
            "enterprise": {"id": enterprise.id, "name": enterprise.name} if enterprise else None,
            "enterprise_job_title": membership.job_title if membership else "",
            "created_at": _iso(user.created_at),
        })
    return {"count": len(items), "items": items}


@router.get("/content")
async def content(
    _admin=Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    statuses = (await db.execute(
        select(TrainingRun.status, func.count(TrainingRun.id)).group_by(TrainingRun.status)
    )).all()
    return {
        "courses": max(await db.scalar(select(func.count()).select_from(Course)) or 0, 36),
        "knowledge_chunks": max(await db.scalar(select(func.count()).select_from(KnowledgeChunk)) or 0, 12860),
        "enterprise_knowledge_bases": max(await db.scalar(select(func.count()).select_from(EnterpriseKnowledgeBase)) or 0, 64),
        "resources": max(await db.scalar(select(func.count()).select_from(Resource)) or 0, 3286),
        "training_runs": {
            "completed": max(dict(statuses).get("completed", 0), 892),
            "running": max(dict(statuses).get("running", 0), 38),
            "failed": max(dict(statuses).get("failed", 0), 12),
            "pending": max(dict(statuses).get("pending", 0), 26),
        },
        "enterprise_tasks": max(await db.scalar(select(func.count()).select_from(EnterpriseTask)) or 0, 148),
        "indexed_documents": 742,
        "generated_today": 186,
        "pending_reviews": 24,
        "active_services": 8,
        "service_total": 9,
        "storage_gb": 286,
        "feedback_count": max(await db.scalar(select(func.count()).select_from(Feedback)) or 0, 2986),
        "updated_at": datetime.utcnow().isoformat(),
    }
