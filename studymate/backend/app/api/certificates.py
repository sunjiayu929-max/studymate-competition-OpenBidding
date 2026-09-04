"""Database-backed learner honor-wall certificates."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import RoleCertificate, User
from app.deps import require_user


router = APIRouter(prefix="/certificates", tags=["certificates"])


@router.get("")
async def list_certificates(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    rows = list((await db.scalars(
        select(RoleCertificate)
        .where(RoleCertificate.user_id == user.id)
        .order_by(desc(RoleCertificate.issued_at))
    )).all())
    return {
        "items": [
            {
                "userId": item.user_id,
                "learnerName": user.name,
                "roleId": item.role_id,
                "roleName": item.role_name,
                "completedRounds": item.completed_rounds,
                "issuedAt": item.issued_at.isoformat(),
                "serial": item.serial,
            }
            for item in rows
        ]
    }
