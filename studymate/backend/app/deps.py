"""从 HttpOnly Cookie 中的服务端会话识别当前用户。"""
from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import User, UserSession


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def current_user(
    sm_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not sm_session:
        return None
    session = await db.scalar(
        select(UserSession).where(
            UserSession.token_hash == _token_hash(sm_session),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.utcnow(),
        )
    )
    if session is None:
        return None
    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        return None
    return user


async def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或会话失效")
    return user


async def require_admin(user: User = Depends(require_user)) -> User:
    if (user.role or "student") not in {"admin", "judge"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员或评委权限")
    return user


async def require_system_admin(user: User = Depends(require_user)) -> User:
    """Only operational administrators may mutate user-facing management data."""
    if (user.role or "student") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user
