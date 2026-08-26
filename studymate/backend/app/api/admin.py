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
    KnowledgeChunk,
    Resource,
    TrainingRun,
    User,
)
from app.deps import require_system_admin

router = APIRouter(prefix="/admin", tags=["system-admin"])

PLATFORM_ENTERPRISE_SEEDS = (
    ("河南智联工业技术有限公司", "ZHILIAN-OPS", "工业视觉实施工程师"),
    ("中原云策信息技术有限公司", "ZHONGYUAN-OPS", "企业 RAG 应用实施工程师"),
    ("郑州新算力科技有限公司", "XINSUANLI-OPS", "AI 平台运维工程师"),
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
    if changed:
        await db.commit()


async def _enterprise_rows(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        select(Enterprise, User)
        .join(User, User.id == Enterprise.owner_id)
        .order_by(desc(Enterprise.created_at), Enterprise.id)
    )).all()
    result: list[dict] = []
    for enterprise, owner in rows:
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
        result.append({
            "id": enterprise.id,
            "name": enterprise.name,
            "status": enterprise.status,
            "invite_code": enterprise.invite_code,
            "owner": {"id": owner.id, "name": owner.name},
            "member_count": int(member_count),
            "published_task_count": int(task_count),
            "knowledge_base_count": int(knowledge_count),
            "assignment_count": len(assignments),
            "completion_rate": round(completed / len(assignments) * 100) if assignments else 0,
            "created_at": _iso(enterprise.created_at),
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
            "active_users": len({event.user_id for event in items if event.user_id is not None}),
            "minutes": round(sum((event.duration_ms or 0) for event in items) / 60000),
        })
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "user_count": int(user_count),
            "active_user_count": int(active_user_count),
            "enterprise_count": int(enterprise_count),
            "member_count": int(member_count),
            "published_task_count": int(published_tasks),
            "assignment_count": int(assignment_count),
            "completion_rate": round(completed_assignments / assignment_count * 100) if assignment_count else 0,
            "knowledge_base_count": int(knowledge_count),
            "course_count": int(course_count),
            "knowledge_chunk_count": int(chunk_count),
            "resource_count": int(resource_count),
            "training_run_count": int(training_run_count),
            "active_today": active_today,
            "today_minutes": today_minutes,
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
        "courses": await db.scalar(select(func.count()).select_from(Course)) or 0,
        "knowledge_chunks": await db.scalar(select(func.count()).select_from(KnowledgeChunk)) or 0,
        "enterprise_knowledge_bases": await db.scalar(select(func.count()).select_from(EnterpriseKnowledgeBase)) or 0,
        "resources": await db.scalar(select(func.count()).select_from(Resource)) or 0,
        "training_runs": {str(status): count for status, count in statuses},
        "enterprise_tasks": await db.scalar(select(func.count()).select_from(EnterpriseTask)) or 0,
        "updated_at": datetime.utcnow().isoformat(),
    }
