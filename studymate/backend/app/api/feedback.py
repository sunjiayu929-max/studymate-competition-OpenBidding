"""反馈采集、按角色隔离查看、管理员回复，以及评委只读评审。"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import Feedback, FeedbackReply, User
from app.deps import require_admin, require_system_admin, require_user


router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    # 为兼容旧前端保留该字段，但后端始终使用当前会话用户，杜绝伪造 user_id。
    user_id: int | None = None
    target_type: str = Field(..., min_length=1, max_length=32)
    target_id: str = Field(..., min_length=1, max_length=64)
    rating: int = Field(..., ge=-1, le=5)
    comment: str = Field(default="", max_length=1000)


class ReplyIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


def _is_privileged(user: User) -> bool:
    return (user.role or "student") in {"admin", "judge"}


async def _serialize_feedback(db: AsyncSession, rows: list[Feedback], viewer: User) -> list[dict]:
    if not rows:
        return []

    feedback_ids = [row.id for row in rows]
    replies = (
        await db.execute(
            select(FeedbackReply)
            .where(FeedbackReply.feedback_id.in_(feedback_ids))
            .order_by(FeedbackReply.created_at.asc(), FeedbackReply.id.asc())
        )
    ).scalars().all()

    user_ids = {row.user_id for row in rows} | {reply.author_id for reply in replies}
    users = (
        await db.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    users_by_id = {user.id: user for user in users}

    replies_by_feedback: dict[int, list[dict]] = defaultdict(list)
    for reply in replies:
        author = users_by_id.get(reply.author_id)
        author_role = (author.role or "student") if author else "student"
        # 用户可见的正式回复只来自管理员。历史评委回复继续保留在数据库中用于审计，
        # 但不再通过任何角色的反馈中心接口展示。
        if author_role != "admin":
            continue
        replies_by_feedback[reply.feedback_id].append({
            "id": reply.id,
            "content": reply.content,
            "author_id": reply.author_id,
            "author_name": author.name if author else f"用户 #{reply.author_id}",
            "author_role": author_role,
            "created_at": reply.created_at.isoformat() if reply.created_at else None,
        })

    result = []
    for row in rows:
        owner = users_by_id.get(row.user_id)
        result.append({
            "id": row.id,
            "user_id": row.user_id,
            "user_name": owner.name if owner else f"用户 #{row.user_id}",
            "target_type": row.target_type,
            "target_id": row.target_id,
            "rating": row.rating,
            "comment": row.comment or "",
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "replies": replies_by_feedback.get(row.id, []),
        })
    return result


@router.post("")
async def upsert_feedback(
    req: FeedbackIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """同一用户对同一目标重复反馈时更新原记录。"""
    existing = await db.scalar(
        select(Feedback).where(
            Feedback.user_id == user.id,
            Feedback.target_type == req.target_type,
            Feedback.target_id == req.target_id,
        )
    )
    if existing:
        existing.rating = req.rating
        existing.comment = req.comment
        await db.commit()
        await db.refresh(existing)
        item = (await _serialize_feedback(db, [existing], user))[0]
        return {**item, "_action": "updated"}

    feedback = Feedback(
        user_id=user.id,
        target_type=req.target_type,
        target_id=req.target_id,
        rating=req.rating,
        comment=req.comment,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    item = (await _serialize_feedback(db, [feedback], user))[0]
    return {**item, "_action": "created"}


@router.get("")
async def list_feedback(
    user_id: int | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """管理员/评委可查看全部；普通用户无论传什么参数都只能查看自己的反馈。"""
    stmt = select(Feedback).order_by(desc(Feedback.created_at)).limit(limit)
    if _is_privileged(user):
        if user_id is not None:
            stmt = stmt.where(Feedback.user_id == user_id)
    else:
        stmt = stmt.where(Feedback.user_id == user.id)
    if target_type:
        stmt = stmt.where(Feedback.target_type == target_type)
    if target_id:
        stmt = stmt.where(Feedback.target_id == target_id)

    rows = list((await db.execute(stmt)).scalars().all())
    return {"count": len(rows), "items": await _serialize_feedback(db, rows, user)}


@router.get("/stats")
async def feedback_stats(
    _user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """全局统计仅管理员和评委可见。"""
    total = await db.scalar(select(func.count(Feedback.id))) or 0
    up = await db.scalar(select(func.count(Feedback.id)).where(Feedback.rating >= 1)) or 0
    down = await db.scalar(select(func.count(Feedback.id)).where(Feedback.rating <= -1)) or 0
    with_comment = await db.scalar(select(func.count(Feedback.id)).where(Feedback.comment != "")) or 0
    return {
        "total": total,
        "up": up,
        "down": down,
        "with_comment": with_comment,
        "satisfaction": round(up / (up + down), 3) if (up + down) > 0 else None,
    }


@router.post("/{feedback_id}/replies")
async def reply_to_feedback(
    feedback_id: int,
    req: ReplyIn,
    user: User = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    feedback = await db.get(Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(404, f"feedback {feedback_id} not found")
    reply = FeedbackReply(
        feedback_id=feedback_id,
        author_id=user.id,
        content=req.content.strip(),
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return {
        "id": reply.id,
        "content": reply.content,
        "author_id": user.id,
        "author_name": user.name,
        "author_role": user.role,
        "created_at": reply.created_at.isoformat() if reply.created_at else None,
    }


@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    feedback = await db.get(Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(404, f"feedback {feedback_id} not found")
    if (user.role or "student") != "admin" and feedback.user_id != user.id:
        raise HTTPException(403, "只能删除自己的反馈")
    await db.execute(delete(FeedbackReply).where(FeedbackReply.feedback_id == feedback_id))
    await db.delete(feedback)
    await db.commit()
    return {"ok": True, "id": feedback_id}
