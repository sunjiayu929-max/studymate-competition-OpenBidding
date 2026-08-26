"""企业管理员与学习者之间的岗位培训闭环。

企业演示数据只用于补足展示规模，任务、成员关系、学习事件和资料绑定仍写入
真实业务表，因此员工端可以沿着企业发布的任务进入已有的岗位训练内容。
"""
from __future__ import annotations

from asyncio import Lock
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import (
    Enterprise,
    EnterpriseKnowledgeBase,
    EnterpriseMembership,
    EnterpriseTask,
    EnterpriseTaskAssignment,
    EnterpriseAuditLog,
    Course,
    Event,
    KnowledgeChunk,
    User,
)
from app.deps import require_user

router = APIRouter(prefix="", tags=["enterprise"])


class LearnerContextPatch(BaseModel):
    learner_type: Literal["student", "worker"] = "student"
    study_stage: str = Field(default="", max_length=32)
    company: str = Field(default="", max_length=128)
    target_role: str = Field(default="", max_length=128)


class JoinEnterpriseRequest(BaseModel):
    invite_code: str = Field(min_length=4, max_length=32)


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str = Field(default="", max_length=4000)
    task_type: Literal["training", "reading"] = "training"
    target_role: str = Field(default="", max_length=128)
    material_title: str = Field(default="", max_length=256)
    material_content: str = Field(default="", max_length=20000)
    knowledge_base_id: int | None = None
    due_label: str = Field(default="本周完成", max_length=64)
    publish: bool = True


class KnowledgeBaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    target_role: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=4000)
    materials: list[dict] = Field(default_factory=list, max_length=20)
    source_course_id: int | None = None


class MemberImportRequest(BaseModel):
    members: list[dict] = Field(default_factory=list, max_length=100)


FDE_CAPABILITIES = (
    {
        "id": "fde-capability-1",
        "name": "需求澄清",
        "description": "把客户的业务诉求转化为边界清晰、可验证的交付目标。",
        "evidence": "需求访谈记录、价值假设与验收指标",
    },
    {
        "id": "fde-capability-2",
        "name": "Python 与 SQL",
        "description": "完成数据检查、处理、分析与问题定位，为方案实现提供可靠依据。",
        "evidence": "数据检查脚本、查询结果与异常说明",
    },
    {
        "id": "fde-capability-3",
        "name": "系统集成",
        "description": "把模型、数据、接口与业务流程接入可运行的解决方案。",
        "evidence": "接口联调清单、配置记录与回滚方案",
    },
    {
        "id": "fde-capability-4",
        "name": "交付验证",
        "description": "用验收标准、测试证据和复盘记录证明方案达到目标。",
        "evidence": "验收报告、运行截图与客户确认记录",
    },
)

DEMO_MEMBER_SEEDS = (
    ("陈思远", "fde-demo-01@lanshan.example", 72, 46, 492),
    ("李婧", "fde-demo-02@lanshan.example", 58, 31, 381),
    ("王子涵", "fde-demo-03@lanshan.example", 100, 24, 290),
    ("赵明宇", "fde-demo-04@lanshan.example", 28, 0, 132),
    ("周若琳", "fde-demo-05@lanshan.example", 84, 38, 461),
    ("高晨", "fde-demo-06@lanshan.example", 66, 29, 348),
    ("许安然", "fde-demo-07@lanshan.example", 91, 42, 527),
    ("林致远", "fde-demo-08@lanshan.example", 43, 18, 216),
    ("何雨桐", "fde-demo-09@lanshan.example", 77, 35, 416),
    ("孙嘉成", "fde-demo-10@lanshan.example", 52, 26, 304),
    ("蒋欣怡", "fde-demo-11@lanshan.example", 35, 12, 173),
    ("邓博文", "fde-demo-12@lanshan.example", 86, 33, 455),
)

DEMO_MEMBER_ROLES = {
    "fde-demo-01@lanshan.example": "前线部署工程师（FDE）",
    "fde-demo-02@lanshan.example": "前线部署工程师（FDE）",
    "fde-demo-03@lanshan.example": "前线部署工程师（FDE）",
    "fde-demo-04@lanshan.example": "前线部署工程师（FDE）",
    "fde-demo-05@lanshan.example": "解决方案工程师",
    "fde-demo-06@lanshan.example": "解决方案工程师",
    "fde-demo-07@lanshan.example": "数据集成工程师",
    "fde-demo-08@lanshan.example": "数据集成工程师",
    "fde-demo-09@lanshan.example": "实施运维工程师",
    "fde-demo-10@lanshan.example": "实施运维工程师",
    "fde-demo-11@lanshan.example": "客户成功经理",
    "fde-demo-12@lanshan.example": "客户成功经理",
}

FIXED_MEMBER_METRICS = {
    "sunjiayu": (72, 46, 492),
    "baixinyue": (58, 31, 381),
    "yuanshicong": (100, 24, 290),
    "chenzhuo": (28, 0, 132),
    "lijiayi": (84, 38, 461),
    "zhouxiang": (46, 22, 266),
    "tianyixin": (63, 34, 388),
    "liufei": (37, 16, 194),
}

FIXED_MEMBER_NAMES = {
    "sunjiayu": "孙佳玉",
    "baixinyue": "白新悦",
    "yuanshicong": "袁士聪",
    "chenzhuo": "陈卓",
    "lijiayi": "李佳怡",
    "zhouxiang": "周翔",
    "tianyixin": "田一新",
    "liufei": "刘飞",
}

DEMO_KNOWLEDGE_CATALOG = (
    ("FDE 岗位训练资料库", "围绕需求澄清、数据联调、部署验收和现场复盘复用岗位知识。"),
    ("客户需求与方案资料库", "把客户访谈、业务边界和方案验收标准整理成可复用的岗位资料。"),
    ("数据联调与接口排障资料库", "覆盖接口契约、样例数据、日志定位和联调复测等交付环节。"),
    ("部署验收与运维资料库", "覆盖环境检查、配置变更、回滚路径和上线后的运维检查。"),
    ("现场问题复盘与交付规范库", "沉淀现场问题时间线、根因分析、客户沟通和交付验收证据。"),
)

DEMO_TASK_CATALOG = (
    ("完成一次客户现场需求澄清", "training", "围绕真实业务问题整理目标、数据边界和可验收指标，形成一页需求澄清记录。", "客户现场需求澄清表", "请记录业务目标、当前流程、数据来源、成功指标、风险假设和下一步验证动作。", 0),
    ("阅读客户方案验收标准", "reading", "熟悉从业务目标到验收指标的映射方式，并完成阅读确认。", "客户方案验收标准", "重点关注验收口径、证据类型、责任边界和客户确认节点。", 1),
    ("完成一次数据联调问题定位", "training", "根据接口响应、日志和样例数据定位一次联调问题，提交原因判断与验证步骤。", "数据联调排查清单", "记录请求参数、响应现象、日志证据、根因假设和修复后的复测结果。", 2),
    ("阅读接口契约与字段映射规范", "reading", "了解接口字段、异常码和版本变更如何影响现场交付。", "接口契约与字段映射规范", "请核对字段类型、必填约束、异常码、兼容策略和联调样例。", 2),
    ("提交客户验收证据包", "training", "按岗位验收标准整理运行截图、测试结果和客户确认信息，形成可追溯交付证据。", "客户验收证据清单", "至少包含验收指标、测试结果、遗留风险、回滚方式和客户确认记录。", 3),
    ("完成部署前环境核对", "training", "按部署清单检查运行环境、依赖版本、权限和配置变更，标记阻断项。", "部署前环境核对表", "逐项记录检查结果、证据位置、责任人和未通过项的处理计划。", 3),
    ("阅读部署验收与回滚规范", "reading", "熟悉上线前检查、异常回退和客户确认的最小闭环，并完成阅读确认。", "部署验收与回滚规范", "重点关注环境检查、权限核对、配置变更记录、回滚条件和客户验收证据。", 3),
    ("完成一次上线后运行检查", "training", "观察服务状态、关键日志和业务指标，形成上线后第一轮运行检查记录。", "上线后运行检查表", "记录检查时间、服务状态、错误日志、关键指标和需要跟进的风险。", 3),
    ("阅读现场问题复盘规范", "reading", "了解企业如何记录问题证据，并完成一次阅读确认。", "现场问题复盘规范", "复盘记录需要包含问题现象、时间线、证据来源、影响范围、修复动作和客户确认。", 4),
    ("复盘一次异常发布与回滚", "reading", "结合部署规范复盘异常发布场景，说明如何判断影响、触发回滚并完成复验。", "异常发布复盘案例", "请按时间线说明发现、止损、回滚、验证和客户沟通五个节点。", 4),
    ("提交现场交付复盘记录", "training", "将一次现场交付中的现象、证据、根因和改进动作整理为可追溯记录。", "现场交付复盘模板", "请补齐问题摘要、影响范围、根因证据、修复动作、预防措施和客户确认。", 4),
)

_DEMO_SEED_LOCK = Lock()


def _expanded_task_material(title: str, description: str, brief: str, task_type: str) -> str:
    action = "完成阅读确认" if task_type == "reading" else "提交训练记录"
    return f"""## 本次学习目标

本任务围绕“{title}”展开。学习者需要把岗位知识转化为可检查的工作步骤，明确输入、判断依据、输出物和责任边界。{description}

## 关键内容

{brief} 在实际工作中，不能只记录最终结论，还要保留能够支持结论的原始信息、操作时间、责任人和复核结果。遇到信息不足时，应先标记待确认项，不能用猜测替代证据。

## 工作方法

先梳理业务目标和当前状态，再按“现象、证据、判断、动作、验证”的顺序组织记录。涉及接口、环境或客户资料时，要注明版本、范围和权限；涉及变更时，要同时写明影响评估、回滚条件和复测方式。

## {action}前检查

请至少检查：目标是否清楚、关键字段或环境信息是否完整、证据是否能够复核、异常和风险是否单独列出、后续责任人是否明确。完成后保留一份结构化记录，便于企业管理员和后续协作者追踪。
"""


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _audit_payload(log: EnterpriseAuditLog, actor_name: str | None = None) -> dict:
    return {
        "id": log.id,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "detail": log.detail or {},
        "actor_name": actor_name or "系统",
        "created_at": _iso(log.created_at),
    }


def _add_audit(
    db: AsyncSession,
    enterprise_id: int,
    actor_id: int | None,
    action: str,
    target_type: str,
    target_id: int | str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(EnterpriseAuditLog(
        enterprise_id=enterprise_id,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        detail=detail or {},
    ))


async def _membership(db: AsyncSession, user_id: int) -> EnterpriseMembership | None:
    return await db.scalar(select(EnterpriseMembership).where(EnterpriseMembership.user_id == user_id))


async def _enterprise(db: AsyncSession, enterprise_id: int) -> Enterprise:
    enterprise = await db.get(Enterprise, enterprise_id)
    if enterprise is None:
        raise HTTPException(status_code=404, detail="企业不存在")
    return enterprise


async def _admin_enterprise(db: AsyncSession, user: User) -> Enterprise:
    if (user.role or "student") != "enterprise_admin":
        raise HTTPException(status_code=403, detail="当前账号不是企业管理员")
    membership = await _membership(db, user.id)
    if membership and membership.member_role in {"owner", "manager"}:
        return await _enterprise(db, membership.enterprise_id)
    raise HTTPException(status_code=403, detail="企业管理员尚未绑定企业")


async def _seed_demo_enterprise(db: AsyncSession) -> Enterprise:
    enterprise = await db.scalar(select(Enterprise).where(Enterprise.invite_code == "SM-DEMO"))
    if enterprise is None:
        enterprise = Enterprise(name="河南本线商贸有限公司", invite_code="SM-DEMO", owner_id=1)
        db.add(enterprise)
        await db.flush()
        db.add(EnterpriseMembership(
            enterprise_id=enterprise.id,
            user_id=1,
            member_role="owner",
            job_title="演示管理员",
        ))
        knowledge = EnterpriseKnowledgeBase(
            enterprise_id=enterprise.id,
            creator_id=1,
            name="FDE 岗位训练资料库",
            target_role="前线部署工程师",
            description="围绕交付任务、部署流程和现场问题复盘整理的企业资料。",
            materials=[
                {"title": "岗位交付检查清单", "type": "制度资料", "detail": "部署前确认环境、权限、回滚方案和验收证据。"},
                {"title": "现场问题复盘模板", "type": "实践资料", "detail": "记录现象、证据、定位路径、修复动作和客户确认结果。"},
            ],
        )
        db.add(knowledge)
        await db.flush()
        db.add_all([
            EnterpriseTask(
                enterprise_id=enterprise.id,
                creator_id=1,
                title="完成一次岗位交付前检查",
                description="按企业检查清单完成一次部署前风险核对，并在岗位训练中心提交验证证据。",
                task_type="training",
                target_role="前线部署工程师",
                material_title="岗位交付检查清单",
                material_content="请依次核对运行环境、访问权限、配置变更、回滚方案和验收标准。",
                knowledge_base_id=knowledge.id,
                status="published",
                due_label="本周五前",
            ),
            EnterpriseTask(
                enterprise_id=enterprise.id,
                creator_id=1,
                title="阅读现场问题复盘规范",
                description="了解企业如何记录问题证据，并完成一次阅读确认。",
                task_type="reading",
                target_role="前线部署工程师",
                material_title="现场问题复盘规范",
                material_content="复盘记录需要包含问题现象、时间线、证据来源、影响范围、修复动作和客户确认。",
                knowledge_base_id=knowledge.id,
                status="published",
                due_label="阅读后确认",
            ),
        ])
        await db.commit()
    elif enterprise.name != "河南本线商贸有限公司":
        enterprise.name = "河南本线商贸有限公司"
        await db.commit()
    return enterprise


def _context_payload(user: User, enterprise: Enterprise | None, membership: EnterpriseMembership | None) -> dict:
    return {
        "user_id": user.id,
        "name": user.name,
        "learner_type": user.learner_type or "student",
        "study_stage": user.study_stage or "",
        "company": user.company or "",
        "target_role": user.target_role or "",
        "enterprise": {
            "id": enterprise.id,
            "name": enterprise.name,
            "invite_code": enterprise.invite_code if membership and membership.member_role in {"owner", "manager"} else None,
            "member_role": membership.member_role,
        } if enterprise and membership else None,
    }


@router.get("/learner/context")
async def get_learner_context(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    membership = await _membership(db, user.id)
    enterprise = await _enterprise(db, membership.enterprise_id) if membership else None
    return _context_payload(user, enterprise, membership)


@router.patch("/learner/context")
async def update_learner_context(req: LearnerContextPatch, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    user.learner_type = req.learner_type
    user.study_stage = req.study_stage.strip()
    user.company = req.company.strip()
    user.target_role = req.target_role.strip()
    await db.commit()
    membership = await _membership(db, user.id)
    enterprise = await _enterprise(db, membership.enterprise_id) if membership else None
    return _context_payload(user, enterprise, membership)


@router.post("/learner/join")
async def join_enterprise(req: JoinEnterpriseRequest, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    current = await _membership(db, user.id)
    if current:
        raise HTTPException(status_code=409, detail="一个学习者只能加入一个企业")
    code = req.invite_code.strip().upper()
    enterprise = await db.scalar(select(Enterprise).where(Enterprise.invite_code == code))
    if enterprise is None and code == "SM-DEMO":
        enterprise = await _seed_demo_enterprise(db)
    if enterprise is None:
        raise HTTPException(status_code=404, detail="邀请码无效，请向企业管理员确认")
    membership = EnterpriseMembership(enterprise_id=enterprise.id, user_id=user.id, member_role="learner")
    db.add(membership)
    await db.flush()
    tasks = (await db.scalars(select(EnterpriseTask).where(
        EnterpriseTask.enterprise_id == enterprise.id,
        EnterpriseTask.status == "published",
    ))).all()
    for task in tasks:
        db.add(EnterpriseTaskAssignment(task_id=task.id, learner_id=user.id))
    _add_audit(db, enterprise.id, user.id, "member_join", "member", user.id, {"member_name": user.name, "source": "invite_code"})
    await db.commit()
    return _context_payload(user, enterprise, membership)


def _task_payload(task: EnterpriseTask, assignment: EnterpriseTaskAssignment | None = None, knowledge: EnterpriseKnowledgeBase | None = None) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "task_type": task.task_type,
        "target_role": task.target_role,
        "material_title": task.material_title,
        "material_content": task.material_content,
        "knowledge_base_id": task.knowledge_base_id,
        "knowledge_base": {
            "id": knowledge.id,
            "name": knowledge.name,
            "target_role": knowledge.target_role,
            "source_course_id": knowledge.source_course_id,
            "description": knowledge.description,
            "materials": knowledge.materials or [],
        } if knowledge else None,
        "status": task.status,
        "due_label": task.due_label,
        "assignment_status": assignment.status if assignment else None,
        "accepted_at": _iso(assignment.accepted_at) if assignment else None,
        "started_at": _iso(assignment.started_at) if assignment else None,
        "completed_at": _iso(assignment.completed_at) if assignment else None,
        "created_at": _iso(task.created_at),
    }


@router.get("/learner/tasks")
async def list_learner_tasks(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    membership = await _membership(db, user.id)
    if not membership:
        return {"items": [], "enterprise": None}
    enterprise = await _enterprise(db, membership.enterprise_id)
    await _ensure_demo_dashboard_data(db, enterprise)
    rows = (await db.execute(
        select(EnterpriseTask, EnterpriseTaskAssignment)
        .join(EnterpriseTaskAssignment, EnterpriseTaskAssignment.task_id == EnterpriseTask.id)
        .where(
            EnterpriseTaskAssignment.learner_id == user.id,
            EnterpriseTask.enterprise_id == enterprise.id,
            EnterpriseTask.status.in_(["published", "expired"]),
        )
        .order_by(EnterpriseTask.created_at.desc())
    )).all()
    knowledge_ids = {task.knowledge_base_id for task, _ in rows if task.knowledge_base_id}
    knowledge_map = {}
    if knowledge_ids:
        knowledge_map = {item.id: item for item in (await db.scalars(select(EnterpriseKnowledgeBase).where(EnterpriseKnowledgeBase.id.in_(knowledge_ids)))).all()}
    return {
        "enterprise": {"id": enterprise.id, "name": enterprise.name},
        "items": [_task_payload(task, assignment, knowledge_map.get(task.knowledge_base_id)) for task, assignment in rows],
    }


@router.get("/learner/tasks/{task_id}")
async def get_learner_task(task_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    membership = await _membership(db, user.id)
    task = await db.get(EnterpriseTask, task_id)
    if not membership or not task or task.enterprise_id != membership.enterprise_id:
        raise HTTPException(status_code=404, detail="任务不存在或未分配给当前学习者")
    enterprise = await _enterprise(db, membership.enterprise_id)
    await _ensure_demo_dashboard_data(db, enterprise)
    assignment = await db.scalar(select(EnterpriseTaskAssignment).where(
        EnterpriseTaskAssignment.task_id == task_id,
        EnterpriseTaskAssignment.learner_id == user.id,
    ))
    if not assignment:
        raise HTTPException(status_code=404, detail="任务不存在或未分配给当前学习者")
    knowledge = await db.get(EnterpriseKnowledgeBase, task.knowledge_base_id) if task.knowledge_base_id else None
    return _task_payload(task, assignment, knowledge)


async def _update_assignment(task_id: int, user_id: int, status: str, db: AsyncSession) -> dict:
    assignment = await db.scalar(select(EnterpriseTaskAssignment).where(
        EnterpriseTaskAssignment.task_id == task_id,
        EnterpriseTaskAssignment.learner_id == user_id,
    ))
    task = await db.get(EnterpriseTask, task_id)
    if not assignment or not task:
        raise HTTPException(status_code=404, detail="任务不存在或未分配给当前学习者")
    now = datetime.utcnow()
    if status == "accepted": assignment.accepted_at = now
    if status == "in_progress" and assignment.started_at is None: assignment.started_at = now
    if status == "completed": assignment.completed_at = now
    assignment.status = status
    action_by_status = {"accepted": "task_accept", "in_progress": "task_start", "completed": "task_complete"}
    _add_audit(db, task.enterprise_id, user_id, action_by_status.get(status, "task_update"), "task", task.id, {"status": status, "learner_id": user_id})
    await db.commit()
    knowledge = await db.get(EnterpriseKnowledgeBase, task.knowledge_base_id) if task.knowledge_base_id else None
    return _task_payload(task, assignment, knowledge)


@router.post("/learner/tasks/{task_id}/accept")
async def accept_learner_task(task_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    return await _update_assignment(task_id, user.id, "accepted", db)


@router.post("/learner/tasks/{task_id}/start")
async def start_learner_task(task_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    return await _update_assignment(task_id, user.id, "in_progress", db)


@router.post("/learner/tasks/{task_id}/complete")
async def complete_learner_task(task_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    return await _update_assignment(task_id, user.id, "completed", db)


@router.get("/enterprise/context")
async def get_enterprise_context(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    return {"id": enterprise.id, "name": enterprise.name, "invite_code": enterprise.invite_code, "member_role": "owner"}


@router.get("/enterprise/tasks")
async def list_enterprise_tasks(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    await _ensure_demo_dashboard_data(db, enterprise)
    tasks = (await db.scalars(select(EnterpriseTask).where(EnterpriseTask.enterprise_id == enterprise.id).order_by(EnterpriseTask.created_at.desc()))).all()
    return {"enterprise": {"id": enterprise.id, "name": enterprise.name, "invite_code": enterprise.invite_code}, "items": [_task_payload(task) for task in tasks]}


@router.post("/enterprise/tasks")
async def create_enterprise_task(req: TaskCreateRequest, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    if req.knowledge_base_id:
        knowledge = await db.get(EnterpriseKnowledgeBase, req.knowledge_base_id)
        if not knowledge or knowledge.enterprise_id != enterprise.id:
            raise HTTPException(status_code=404, detail="岗位知识库不存在")
    task = EnterpriseTask(
        enterprise_id=enterprise.id,
        creator_id=user.id,
        title=req.title.strip(),
        description=req.description.strip(),
        task_type=req.task_type,
        target_role=req.target_role.strip(),
        material_title=req.material_title.strip(),
        material_content=req.material_content.strip(),
        knowledge_base_id=req.knowledge_base_id,
        status="published" if req.publish else "draft",
        due_label=req.due_label.strip() or "本周完成",
    )
    db.add(task)
    await db.flush()
    if task.status == "published":
        member_ids = await db.scalars(select(EnterpriseMembership.user_id).where(
            EnterpriseMembership.enterprise_id == enterprise.id,
            EnterpriseMembership.member_role == "learner",
            EnterpriseMembership.status == "active",
        ))
        for learner_id in member_ids:
            db.add(EnterpriseTaskAssignment(task_id=task.id, learner_id=learner_id))
    _add_audit(db, enterprise.id, user.id, "task_publish" if task.status == "published" else "task_draft", "task", task.id, {"title": task.title, "task_type": task.task_type, "target_role": task.target_role})
    await db.commit()
    return _task_payload(task)


@router.get("/enterprise/knowledge-bases")
async def list_enterprise_knowledge_bases(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    await _ensure_demo_dashboard_data(db, enterprise)
    items = (await db.scalars(select(EnterpriseKnowledgeBase).where(EnterpriseKnowledgeBase.enterprise_id == enterprise.id).order_by(EnterpriseKnowledgeBase.created_at.desc()))).all()
    return {"items": [{
        "id": item.id,
        "name": item.name,
        "target_role": item.target_role,
        "source_course_id": item.source_course_id,
        "description": item.description,
        "materials": item.materials or [],
        "material_count": len(item.materials or []),
    } for item in items]}


@router.post("/enterprise/knowledge-bases")
async def create_enterprise_knowledge_base(req: KnowledgeBaseCreateRequest, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    item = EnterpriseKnowledgeBase(
        enterprise_id=enterprise.id,
        creator_id=user.id,
        name=req.name.strip(),
        target_role=req.target_role.strip(),
        source_course_id=req.source_course_id,
        description=req.description.strip(),
        materials=req.materials,
    )
    db.add(item)
    _add_audit(db, enterprise.id, user.id, "knowledge_base_create", "knowledge_base", None, {"name": item.name, "target_role": item.target_role, "material_count": len(item.materials or [])})
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "name": item.name, "target_role": item.target_role, "description": item.description, "materials": item.materials or [], "material_count": len(item.materials or [])}


@router.post("/enterprise/members/import")
async def import_enterprise_members(req: MemberImportRequest, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    created = 0
    skipped = 0
    for raw in req.members:
        email = str(raw.get("email", "")).strip().lower()
        name = str(raw.get("name", "")).strip() or email.split("@", 1)[0]
        if not email:
            continue
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is None:
            existing = User(name=name, email=email, role="student", learner_type="worker", is_active=True)
            db.add(existing)
            await db.flush()
            created += 1
        membership = await _membership(db, existing.id)
        if membership:
            skipped += 1
            continue
        db.add(EnterpriseMembership(enterprise_id=enterprise.id, user_id=existing.id, member_role="learner"))
    _add_audit(db, enterprise.id, user.id, "member_import", "member", None, {"created": created, "skipped": skipped})
    await db.commit()
    return {"created": created, "skipped": skipped, "message": f"已导入 {created} 名成员"}


def _assignment_progress(status: str) -> int:
    return {"pending": 0, "accepted": 18, "in_progress": 58, "completed": 100}.get(status, 0)


def _capability_level(score: int) -> int:
    return 3 if score >= 85 else 2 if score >= 60 else 1 if score >= 35 else 0


def _is_demo_member(user: User) -> bool:
    return bool(user.email and user.email.endswith("@lanshan.example"))


def _is_fixed_member(user: User) -> bool:
    """固定可登录员工排在企业通讯录末尾，模拟成员保留在前。"""
    return bool(user.email and user.email.endswith("@pramate.com"))


async def _ensure_demo_knowledge_bases(db: AsyncSession, enterprise: Enterprise) -> dict[str, EnterpriseKnowledgeBase]:
    """建立企业资料视图，并把它们绑定到已有 FDE 课程知识库。"""
    source_course = await db.scalar(select(Course).where(Course.name == "FDE 岗位知识库"))
    chunks = []
    if source_course:
        chunks = list((await db.scalars(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.course_id == source_course.id)
            .order_by(KnowledgeChunk.id.asc())
            .limit(24)
        )).all())
    source_materials = [
        {
            "title": (chunk.source or "FDE 岗位知识片段").split("｜")[-1][:64],
            "type": "岗位知识库",
            "detail": " ".join((chunk.content or "").split())[:180],
            "source": chunk.source or "FDE 岗位知识库",
        }
        for chunk in chunks
        if chunk.content
    ]
    if not source_materials:
        source_materials = [
            {"title": "客户现场需求澄清表", "type": "岗位模板", "detail": "记录业务目标、数据边界、验收指标和风险假设。"},
            {"title": "部署验收与回滚规范", "type": "交付规范", "detail": "核对环境、权限、配置变更、回滚路径和客户确认结果。"},
        ]

    knowledge_map: dict[str, EnterpriseKnowledgeBase] = {}
    for index, (name, description) in enumerate(DEMO_KNOWLEDGE_CATALOG):
        knowledge = await db.scalar(select(EnterpriseKnowledgeBase).where(
            EnterpriseKnowledgeBase.enterprise_id == enterprise.id,
            EnterpriseKnowledgeBase.name == name,
        ))
        if knowledge is None and index == 0:
            knowledge = await db.scalar(select(EnterpriseKnowledgeBase).where(
                EnterpriseKnowledgeBase.enterprise_id == enterprise.id,
                EnterpriseKnowledgeBase.name == "FDE 岗位训练资料库",
            ))
        materials = source_materials[index * 4:(index + 1) * 4] or source_materials[:4]
        if knowledge is None:
            knowledge = EnterpriseKnowledgeBase(
                enterprise_id=enterprise.id,
                creator_id=enterprise.owner_id,
                name=name,
                target_role="前线部署工程师（FDE）",
                source_course_id=source_course.id if source_course else None,
                description=description,
                materials=materials,
            )
            db.add(knowledge)
            await db.flush()
        else:
            if source_course and knowledge.source_course_id is None:
                knowledge.source_course_id = source_course.id
            if not knowledge.materials:
                knowledge.materials = materials
            if knowledge.name == "FDE 岗位训练资料库" and name != knowledge.name:
                knowledge.name = name
        knowledge_map[str(index)] = knowledge
    return knowledge_map


async def _ensure_demo_tasks(db: AsyncSession, enterprise: Enterprise, knowledge_map: dict[str, EnterpriseKnowledgeBase]) -> list[EnterpriseTask]:
    tasks: list[EnterpriseTask] = []
    for title, task_type, description, material_title, material_content, knowledge_key in DEMO_TASK_CATALOG:
        task = await db.scalar(select(EnterpriseTask).where(
            EnterpriseTask.enterprise_id == enterprise.id,
            EnterpriseTask.title == title,
        ))
        knowledge = knowledge_map[str(knowledge_key)]
        expanded_content = _expanded_task_material(title, description, material_content, task_type)
        if task is None:
            task = EnterpriseTask(
                enterprise_id=enterprise.id,
                creator_id=enterprise.owner_id,
                title=title,
                description=description,
                task_type=task_type,
                target_role="前线部署工程师（FDE）",
                material_title=material_title,
                material_content=expanded_content,
                knowledge_base_id=knowledge.id,
                status="published",
                due_label="本周五前" if task_type == "training" else "阅读后确认",
            )
            db.add(task)
            await db.flush()
        else:
            task.description = description
            task.task_type = task_type
            task.target_role = "前线部署工程师（FDE）"
            task.material_title = material_title
            task.material_content = expanded_content
            task.status = "published"
        if task.knowledge_base_id is None:
            task.knowledge_base_id = knowledge.id
        tasks.append(task)
    return tasks


async def _ensure_demo_dashboard_data(db: AsyncSession, enterprise: Enterprise) -> None:
    """补足演示规模，但所有任务、成员关系和事件仍写入真实业务表。"""
    if enterprise.name != "河南本线商贸有限公司":
        return

    async with _DEMO_SEED_LOCK:
        await _seed_demo_dashboard_data(db, enterprise)


async def _seed_demo_dashboard_data(db: AsyncSession, enterprise: Enterprise) -> None:
    """在互斥区内执行一次幂等的企业演示数据补足。"""

    knowledge_map = await _ensure_demo_knowledge_bases(db, enterprise)
    tasks = await _ensure_demo_tasks(db, enterprise, knowledge_map)
    existing_demo = {
        row.email: row
        for row in (await db.scalars(select(User).where(User.email.like("%@lanshan.example")))).all()
    }
    for name, email, *_ in DEMO_MEMBER_SEEDS:
        target_role = DEMO_MEMBER_ROLES[email]
        learner = existing_demo.get(email)
        if learner is None:
            learner = User(
                name=name,
                email=email,
                role="student",
                learner_type="worker",
                company="河南本线商贸有限公司",
                target_role=target_role,
                is_active=True,
            )
            db.add(learner)
            await db.flush()
            db.add(EnterpriseMembership(
                enterprise_id=enterprise.id,
                user_id=learner.id,
                member_role="learner",
                job_title=target_role,
                status="active",
            ))
        else:
            # 早期数据库可能只创建了模拟用户，没有创建成员关系；按邮箱补齐闭环。
            learner.learner_type = "worker"
            learner.company = enterprise.name
            learner.target_role = target_role
            membership = await _membership(db, learner.id)
            if membership is None:
                db.add(EnterpriseMembership(
                    enterprise_id=enterprise.id,
                    user_id=learner.id,
                    member_role="learner",
                    job_title=target_role,
                    status="active",
                ))
            else:
                membership.job_title = target_role

    member_rows = list((await db.execute(
        select(EnterpriseMembership, User)
        .join(User, User.id == EnterpriseMembership.user_id)
        .where(
            EnterpriseMembership.enterprise_id == enterprise.id,
            EnterpriseMembership.member_role == "learner",
            EnterpriseMembership.status == "active",
        )
        .order_by(EnterpriseMembership.created_at.asc()),
    )).all())
    now = datetime.utcnow()
    for member_index, (membership, learner) in enumerate(member_rows):
        email_name = (learner.email or "").split("@", 1)[0]
        metrics = FIXED_MEMBER_METRICS.get(email_name)
        if metrics is None:
            seed = next((item for item in DEMO_MEMBER_SEEDS if item[1] == learner.email), None)
            metrics = seed[2:] if seed else (48, 18, 240)
        progress, today_minutes, total_minutes = metrics
        if learner.email and learner.email.endswith("@pramate.com"):
            learner.name = FIXED_MEMBER_NAMES.get(email_name, learner.name)
            learner.learner_type = "worker"
            learner.company = "河南本线商贸有限公司"
            learner.target_role = "前线部署工程师（FDE）"
        membership.job_title = membership.job_title or "前线部署工程师（FDE）"

        for task_index, task in enumerate(tasks):
            assignment = await db.scalar(select(EnterpriseTaskAssignment).where(
                EnterpriseTaskAssignment.task_id == task.id,
                EnterpriseTaskAssignment.learner_id == learner.id,
            ))
            if assignment is not None:
                continue
            adjusted = max(0, min(100, progress - task_index * 6 + (member_index % 3) * 4))
            if task.task_type == "reading":
                status = "completed" if adjusted >= 78 else "in_progress" if adjusted >= 42 else "pending"
            else:
                status = "completed" if adjusted >= 92 else "in_progress" if adjusted >= 48 else "pending"
            started_at = now - timedelta(days=max(1, 8 - (member_index % 7))) if status != "pending" else None
            db.add(EnterpriseTaskAssignment(
                task_id=task.id,
                learner_id=learner.id,
                status=status,
                accepted_at=started_at,
                started_at=started_at,
                completed_at=now - timedelta(days=1) if status == "completed" else None,
                created_at=now - timedelta(days=10),
            ))

        events = list((await db.scalars(select(Event).where(
            Event.user_id == learner.id,
            Event.target_type == "enterprise_task",
        ))).all())
        if any((event.meta or {}).get("source") == "demo_seed" for event in events):
            continue
        daily_minutes = [today_minutes, max(0, int(today_minutes * .72)), max(0, int(today_minutes * .55)), max(0, int(today_minutes * .35))]
        if total_minutes > sum(daily_minutes):
            daily_minutes.append(total_minutes - sum(daily_minutes))
        for day, minutes in enumerate(daily_minutes[:7]):
            if minutes <= 0:
                continue
            event_day = (now - timedelta(days=day)).date()
            db.add(Event(
                user_id=learner.id,
                action="page_leave",
                target_type="enterprise_task",
                target_id=str(tasks[day % len(tasks)].id),
                duration_ms=minutes * 60_000,
                meta={"enterprise_id": enterprise.id, "source": "demo_seed", "scope": "enterprise_learning"},
                ts=datetime.combine(event_day, datetime.min.time()).replace(hour=9, minute=30 + member_index % 20),
            ))
    await db.commit()


async def _enterprise_dashboard_payload(db: AsyncSession, enterprise: Enterprise) -> dict:
    await _ensure_demo_dashboard_data(db, enterprise)
    member_rows = (await db.execute(
        select(EnterpriseMembership, User)
        .join(User, User.id == EnterpriseMembership.user_id)
        .where(
            EnterpriseMembership.enterprise_id == enterprise.id,
            EnterpriseMembership.member_role == "learner",
            EnterpriseMembership.status == "active",
        )
        .order_by(EnterpriseMembership.created_at.asc())
    )).all()
    member_rows = sorted(
        member_rows,
        key=lambda pair: (_is_fixed_member(pair[1]), pair[1].name or ""),
    )
    tasks = list((await db.scalars(select(EnterpriseTask).where(
        EnterpriseTask.enterprise_id == enterprise.id,
    ).order_by(EnterpriseTask.created_at.desc()))).all())
    knowledge_bases = list((await db.scalars(select(EnterpriseKnowledgeBase).where(
        EnterpriseKnowledgeBase.enterprise_id == enterprise.id,
    ))).all())
    task_ids = [task.id for task in tasks]
    member_ids = [user.id for _, user in member_rows]
    assignments = list((await db.scalars(select(EnterpriseTaskAssignment).where(
        EnterpriseTaskAssignment.task_id.in_(task_ids) if task_ids else False,
    ))).all())
    since_30 = datetime.utcnow() - timedelta(days=30)
    events = list((await db.scalars(select(Event).where(
        Event.user_id.in_(member_ids) if member_ids else False,
        Event.ts >= since_30,
    ))).all())
    audit_rows = (await db.execute(
        select(EnterpriseAuditLog, User)
        .outerjoin(User, User.id == EnterpriseAuditLog.actor_id)
        .where(EnterpriseAuditLog.enterprise_id == enterprise.id)
        .order_by(desc(EnterpriseAuditLog.created_at))
        .limit(8)
    )).all()
    audit_logs = [_audit_payload(log, actor.name if actor else None) for log, actor in audit_rows]
    assignments_by_member: dict[int, list[EnterpriseTaskAssignment]] = {}
    assignments_by_task: dict[int, list[EnterpriseTaskAssignment]] = {}
    for assignment in assignments:
        assignments_by_member.setdefault(assignment.learner_id, []).append(assignment)
        assignments_by_task.setdefault(assignment.task_id, []).append(assignment)
    events_by_member: dict[int, list[Event]] = {}
    for event in events:
        if event.user_id is not None:
            events_by_member.setdefault(event.user_id, []).append(event)
    task_map = {task.id: task for task in tasks}
    today = datetime.utcnow().date()

    members = []
    for member_index, (membership, learner) in enumerate(member_rows):
        learner_assignments = assignments_by_member.get(learner.id, [])
        learner_events = events_by_member.get(learner.id, [])
        progress = round(sum(_assignment_progress(item.status) for item in learner_assignments) / len(learner_assignments)) if learner_assignments else 0
        today_minutes = round(sum((event.duration_ms or 0) for event in learner_events if event.ts and event.ts.date() == today) / 60_000)
        total_minutes = round(sum((event.duration_ms or 0) for event in learner_events) / 60_000)
        current_assignment = next((item for item in learner_assignments if item.status == "in_progress"), None)
        current_assignment = current_assignment or next((item for item in learner_assignments if item.status in {"accepted", "pending"}), None)
        current_task = task_map.get(current_assignment.task_id) if current_assignment else None
        event_by_day: dict[str, int] = {}
        for event in learner_events:
            if event.ts:
                key = event.ts.strftime("%m-%d")
                event_by_day[key] = event_by_day.get(key, 0) + round((event.duration_ms or 0) / 60_000)
        trend = []
        for days_ago in range(6, -1, -1):
            day = datetime.utcnow().date() - timedelta(days=days_ago)
            trend.append({"date": day.strftime("%m-%d"), "minutes": event_by_day.get(day.strftime("%m-%d"), 0)})
        score_offsets = (-8, 3, -4, 5)
        capabilities = []
        for capability, offset in zip(FDE_CAPABILITIES, score_offsets):
            score = max(0, min(100, progress + offset))
            capabilities.append({**capability, "score": score, "level": _capability_level(score)})
        members.append({
            "id": learner.id,
            "name": learner.name,
            "email": learner.email,
            "job_title": membership.job_title or learner.target_role or "未设置岗位",
            "target_role": learner.target_role or membership.job_title or "前线部署工程师（FDE）",
            "learner_type": learner.learner_type or "student",
            "study_stage": learner.study_stage or "",
            "progress": progress,
            "today_minutes": today_minutes,
            "total_minutes": total_minutes,
            "active_today": bool(today_minutes or any(item.status == "in_progress" for item in learner_assignments)),
            "last_active_at": max((event.ts for event in learner_events if event.ts), default=None).isoformat() if learner_events else None,
            "current_task": {
                "id": current_task.id,
                "title": current_task.title,
                "status": current_assignment.status,
            } if current_task and current_assignment else None,
            "task_history": [{
                "id": item.task_id,
                "title": task_map[item.task_id].title,
                "task_type": task_map[item.task_id].task_type,
                "status": item.status,
                "progress": _assignment_progress(item.status),
                "target_role": task_map[item.task_id].target_role,
                "due_label": task_map[item.task_id].due_label,
                "completed_at": _iso(item.completed_at),
            } for item in sorted(learner_assignments, key=lambda value: value.created_at or datetime.min, reverse=True) if item.task_id in task_map],
            "learning_trend": trend,
            "capabilities": capabilities,
            "is_demo": _is_demo_member(learner),
            "capability_note": "基于任务完成度与学习事件的阶段性估算，正式验收后更新。",
        })

    task_cards = []
    for task in tasks:
        task_assignments = assignments_by_task.get(task.id, [])
        completed = sum(item.status == "completed" for item in task_assignments)
        in_progress = sum(item.status == "in_progress" for item in task_assignments)
        if task.status == "expired":
            display_status = "expired"
        elif in_progress:
            display_status = "in_progress"
        elif task_assignments and completed == len(task_assignments):
            display_status = "completed"
        else:
            display_status = "published"
        task_cards.append({
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "target_role": task.target_role or "全员",
            "status": display_status,
            "due_label": task.due_label,
            "assignment_count": len(task_assignments),
            "completed_count": completed,
            "in_progress_count": in_progress,
            "completion_rate": round(completed / len(task_assignments) * 100) if task_assignments else 0,
            "knowledge_base_id": task.knowledge_base_id,
        })

    roles: dict[str, list[dict]] = {}
    for member in members:
        roles.setdefault(member["target_role"], []).append(member)
    role_cards = sorted([{
        "name": name,
        "member_count": len(items),
        "active_count": sum(item["active_today"] for item in items),
        "average_progress": round(sum(item["progress"] for item in items) / len(items)),
    } for name, items in roles.items()], key=lambda item: (-item["member_count"], item["name"]))
    total_assignments = len(assignments)
    completed_assignments = sum(item.status == "completed" for item in assignments)
    today_minutes_total = sum(item["today_minutes"] for item in members)
    recent_7_minutes = sum(item["learning_trend"][index]["minutes"] for item in members for index in range(7))
    recent_30_minutes = sum(item["total_minutes"] for item in members)
    capability_cards = []
    for index, capability in enumerate(FDE_CAPABILITIES):
        scores = [item["capabilities"][index]["score"] for item in members]
        average = round(sum(scores) / len(scores)) if scores else 0
        capability_cards.append({**capability, "score": average, "level": _capability_level(average), "member_count": len(scores)})
    demo_count = sum(item["is_demo"] for item in members)
    return {
        "enterprise": {"id": enterprise.id, "name": enterprise.name, "invite_code": enterprise.invite_code},
        "meta": {
            "is_demo_data": demo_count > 0,
            "demo_member_count": demo_count,
            "generated_at": datetime.utcnow().isoformat(),
            "data_note": "看板同时展示企业任务分配、成员账号近 30 日有效学习事件和阶段性能力估算。",
        },
        "summary": {
            "employee_count": len(members),
            "active_learners": sum(item["active_today"] for item in members),
            "in_progress_tasks": sum(card["status"] == "in_progress" for card in task_cards),
            "completed_tasks": sum(card["status"] == "completed" for card in task_cards),
            "overdue_tasks": sum(card["status"] == "expired" for card in task_cards),
            "completion_rate": round(completed_assignments / total_assignments * 100) if total_assignments else 0,
            "average_today_minutes": round(today_minutes_total / len(members)) if members else 0,
            "today_minutes": today_minutes_total,
            "recent_7_minutes": recent_7_minutes,
            "recent_30_minutes": recent_30_minutes,
            "knowledge_usage_count": sum(bool(card["knowledge_base_id"]) for card in task_cards),
            "knowledge_base_count": len(knowledge_bases),
            "knowledge_material_count": sum(len(item.materials or []) for item in knowledge_bases),
        },
        "roles": role_cards,
        "tasks": task_cards,
        "members": members,
        "capabilities": capability_cards,
        "audit_logs": audit_logs,
    }


@router.get("/enterprise/dashboard")
async def get_enterprise_dashboard(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    return await _enterprise_dashboard_payload(db, enterprise)


@router.get("/enterprise/members/{member_id}")
async def get_enterprise_member_detail(member_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    enterprise = await _admin_enterprise(db, user)
    payload = await _enterprise_dashboard_payload(db, enterprise)
    member = next((item for item in payload["members"] if item["id"] == member_id), None)
    if member is None:
        raise HTTPException(status_code=404, detail="该成员不属于当前企业或已离职")
    return {
        "enterprise": payload["enterprise"],
        "meta": payload["meta"],
        "member": member,
        "capabilities": member["capabilities"],
        "task_history": member["task_history"],
        "learning_trend": member["learning_trend"],
    }
