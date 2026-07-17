"""埋点 API（挑战杯硬指标：使用频次 / 时长 / 任务完成情况）。

设计取舍：
- 单条 POST 用于关键事件（开始生成、提交答题），批量 POST 用于高频事件（页面停留 flush）
- user_id 以当前服务端会话为准；列表和全局统计仅管理员/评委可看
- ts 服务端写入，前端不传，防客户端时钟偏移
- meta 任意 JSON，由调用方约定 schema
"""
from __future__ import annotations
from datetime import datetime, timedelta
from collections import Counter
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import Event, User
from app.deps import require_admin, require_user


router = APIRouter(prefix="/events", tags=["events"])


class EventIn(BaseModel):
    user_id: int = 1
    action: str = Field(..., min_length=1, max_length=64)
    target_type: str = Field(default="", max_length=32)
    target_id: str | None = Field(default=None, max_length=64)
    duration_ms: int = 0
    meta: dict = Field(default_factory=dict)


class EventBatch(BaseModel):
    events: list[EventIn]


def _to_dict(e: Event) -> dict:
    return {
        "id": e.id,
        "user_id": e.user_id,
        "action": e.action,
        "target_type": e.target_type,
        "target_id": e.target_id,
        "duration_ms": e.duration_ms,
        "meta": e.meta or {},
        "ts": e.ts.isoformat() if e.ts else None,
    }


@router.post("")
async def create_event(
    req: EventIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    e = Event(
        user_id=user.id,
        action=req.action[:64],
        target_type=(req.target_type or "")[:32],
        target_id=(req.target_id or None),
        duration_ms=max(0, int(req.duration_ms or 0)),
        meta=req.meta or {},
    )
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _to_dict(e)


@router.post("/batch")
async def create_events_batch(
    req: EventBatch,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    if not req.events:
        return {"ok": True, "inserted": 0}
    rows = [
        Event(
            user_id=user.id,
            action=ev.action[:64],
            target_type=(ev.target_type or "")[:32],
            target_id=(ev.target_id or None),
            duration_ms=max(0, int(ev.duration_ms or 0)),
            meta=ev.meta or {},
        )
        for ev in req.events
    ]
    db.add_all(rows)
    await db.commit()
    return {"ok": True, "inserted": len(rows)}


@router.get("")
async def list_events(
    user_id: int | None = None,
    action: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    _user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Event).order_by(desc(Event.ts)).limit(limit)
    if user_id is not None:
        stmt = stmt.where(Event.user_id == user_id)
    if action:
        stmt = stmt.where(Event.action == action)
    rows = (await db.execute(stmt)).scalars().all()
    return {"count": len(rows), "items": [_to_dict(r) for r in rows]}


@router.get("/stats")
async def event_stats(
    hours: int = Query(default=24, ge=1, le=720),
    _user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """聚合统计：用于反馈中心顶部卡片 + 图表。

    返回：
      total              全部事件数
      window_total       近 N 小时事件数
      unique_users       近 N 小时活跃用户数
      avg_duration_ms    近 N 小时平均 duration（仅 duration>0 的）
      by_action          [{action, count}]（近 N 小时）
      by_hour            [{hour: "MM-DD HH", count}]（近 N 小时按小时桶）
    """
    since = datetime.utcnow() - timedelta(hours=hours)

    total = (await db.execute(select(func.count(Event.id)))).scalar_one()

    window_rows = (await db.execute(
        select(Event).where(Event.ts >= since)
    )).scalars().all()

    window_total = len(window_rows)
    unique_users = len({r.user_id for r in window_rows if r.user_id is not None})
    durations = [r.duration_ms for r in window_rows if (r.duration_ms or 0) > 0]
    avg_dur = int(sum(durations) / len(durations)) if durations else 0

    by_action_cnt = Counter(r.action for r in window_rows)
    by_action = [{"action": k, "count": v} for k, v in by_action_cnt.most_common(10)]

    by_hour_cnt: Counter = Counter()
    for r in window_rows:
        if r.ts:
            key = r.ts.strftime("%m-%d %H")
            by_hour_cnt[key] += 1
    by_hour = [{"hour": k, "count": v} for k, v in sorted(by_hour_cnt.items())]

    return {
        "total": total,
        "window_total": window_total,
        "unique_users": unique_users,
        "avg_duration_ms": avg_dur,
        "by_action": by_action,
        "by_hour": by_hour,
        "window_hours": hours,
    }
