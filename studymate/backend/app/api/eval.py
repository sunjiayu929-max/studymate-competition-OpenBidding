"""学习报告 / 评估 API。

- POST /api/eval/run                跑 EvalAgent，返回 scores + profile_delta + suggestions（不写库）
- POST /api/profile/apply-delta     应用 profile_delta 到当前画像，version+1，写 ProfileSnapshot
- GET  /api/profile/snapshots/{uid} 返回最近 N 个画像快照，供报告页雷达对比

设计取舍：
- /eval/run 是一次性 HTTP 调用，不走 SSE（评估速度不慢，无流式必要）
- profile_delta 不在 /eval/run 内部直接落库，由前端用户确认后才 POST /apply-delta，给评委「闭环 + 可解释」的演示空间
"""
from __future__ import annotations
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.courses import get_course_by_id
from app.db import get_db
from app.db.models import Profile, ProfileSnapshot, Evaluation
from app.schemas.profile import ProfileDims, normalize_profile_dims
from app.agents.eval_agent import run_eval, apply_profile_delta, sanitize_profile_delta
from app.api.profile import _get_or_create_user, _get_or_create_profile


router = APIRouter(prefix="", tags=["eval"])


def _changed_fields(before: dict, after: dict) -> list[str]:
    changed: list[str] = []
    for section in sorted(set(before) | set(after)):
        old_value = before.get(section)
        new_value = after.get(section)
        if isinstance(old_value, dict) and isinstance(new_value, dict):
            for field in sorted(set(old_value) | set(new_value)):
                if old_value.get(field) != new_value.get(field):
                    changed.append(f"{section}.{field}")
        elif old_value != new_value:
            changed.append(section)
    return changed


class QuizResult(BaseModel):
    question: str = ""
    user_answer: str = ""
    correct_answer: str = ""
    is_correct: bool = False
    topic: str = "未分类"
    difficulty: int = 1


class Engagement(BaseModel):
    topics_studied: list[str] = Field(default_factory=list)
    time_spent_min: int = 0
    resources_consumed: list[str] = Field(default_factory=list)  # ["doc", "mindmap", "quiz", ...]
    resources_available: list[str] = Field(default_factory=list)


class EvalRequest(BaseModel):
    user_id: int
    course_id: int | None = None
    quiz_results: list[QuizResult] = Field(default_factory=list)
    engagement: Engagement = Field(default_factory=Engagement)
    persist: bool = True  # 是否把评估结果存到 evaluations 表


class ApplyDeltaRequest(BaseModel):
    user_id: int
    profile_delta: dict
    trigger: str = "eval_apply"
    source_version: int | None = Field(default=None, ge=1)


@router.post("/eval/run")
async def eval_run(req: EvalRequest, db: AsyncSession = Depends(get_db)):
    """跑 EvalAgent，返回完整评估报告。"""
    await _get_or_create_user(db, req.user_id)
    profile = await _get_or_create_profile(db, req.user_id)

    quiz_dicts = [q.model_dump() for q in req.quiz_results]
    engagement_dict = req.engagement.model_dump()
    course_cfg = await get_course_by_id(req.course_id)

    current_dims = normalize_profile_dims(profile.dims)
    report = await run_eval(
        user_id=req.user_id,
        quiz_results=quiz_dicts,
        engagement=engagement_dict,
        current_dims=current_dims,
        course_name=course_cfg.name,
    )
    normalized_delta = sanitize_profile_delta(report.get("profile_delta") or {})
    report["profile_delta"] = normalized_delta
    projected_dims = ProfileDims.model_validate(
        apply_profile_delta(current_dims, normalized_delta)
    ).model_dump()

    # 写 evaluations 表
    if req.persist:
        db.add(Evaluation(
            user_id=req.user_id,
            scores=report.get("scores", {}),
            suggestions=report.get("suggestions", []),
        ))
        await db.commit()

    return {
        "user_id": req.user_id,
        "profile_version": profile.version,
        "current_dims": current_dims,
        "projected_dims": projected_dims,
        **report,
    }


@router.post("/profile/apply-delta")
async def profile_apply_delta(req: ApplyDeltaRequest, db: AsyncSession = Depends(get_db)):
    """应用画像 delta；版本过期拒绝，无实际变化时不写快照、不增加版本。"""
    profile = await _get_or_create_profile(db, req.user_id)
    if req.source_version is not None and req.source_version != profile.version:
        raise HTTPException(
            status_code=409,
            detail=f"报告基于画像 v{req.source_version}，当前已是 v{profile.version}，请重新生成报告后再应用",
        )

    old_dims = normalize_profile_dims(profile.dims)
    applied_delta = sanitize_profile_delta(req.profile_delta)
    new_dims = apply_profile_delta(old_dims, applied_delta)

    # Pydantic 校验：确保合法
    try:
        validated = ProfileDims.model_validate(new_dims).model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"画像 schema 校验失败: {e}")

    changed_fields = _changed_fields(old_dims, validated)
    changed = bool(changed_fields)
    if changed:
        db.add(ProfileSnapshot(
            user_id=req.user_id,
            snapshot=old_dims,
            trigger_event=req.trigger,
        ))
        profile.dims = validated
        profile.version += 1
        await db.commit()
        await db.refresh(profile)

    return {
        "user_id": req.user_id,
        "version": profile.version,
        "dims": validated,
        "applied_delta": applied_delta,
        "changed": changed,
        "changed_fields": changed_fields,
    }


@router.get("/profile/snapshots/{user_id}")
async def list_snapshots(user_id: int, limit: int = 10, db: AsyncSession = Depends(get_db)):
    """返回画像历史快照（最新在前）。"""
    q = await db.execute(
        select(ProfileSnapshot)
        .where(ProfileSnapshot.user_id == user_id)
        .order_by(desc(ProfileSnapshot.created_at))
        .limit(limit)
    )
    items = q.scalars().all()
    return {
        "user_id": user_id,
        "count": len(items),
        "items": [
            {
                "id": it.id,
                "snapshot": it.snapshot,
                "trigger_event": it.trigger_event,
                "created_at": it.created_at.isoformat() if it.created_at else None,
            }
            for it in items
        ],
    }


@router.get("/eval/history/{user_id}")
async def eval_history(user_id: int, limit: int = 10, db: AsyncSession = Depends(get_db)):
    """评估历史（最新在前），给报告页画趋势图用。"""
    q = await db.execute(
        select(Evaluation)
        .where(Evaluation.user_id == user_id)
        .order_by(desc(Evaluation.created_at))
        .limit(limit)
    )
    items = q.scalars().all()
    return {
        "user_id": user_id,
        "count": len(items),
        "items": [
            {
                "id": it.id,
                "scores": it.scores,
                "suggestions": it.suggestions,
                "created_at": it.created_at.isoformat() if it.created_at else None,
            }
            for it in items
        ],
    }
