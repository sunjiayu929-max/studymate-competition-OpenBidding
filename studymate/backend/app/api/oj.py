"""StudyMate launch and identity exchange APIs for the independent Hydro OJ."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.db.models import OJLaunchTicket, User
from app.deps import require_user


router = APIRouter(prefix="/oj", tags=["oj"])
internal_router = APIRouter(prefix="/internal/oj", tags=["internal-oj"])


class RedeemTicketRequest(BaseModel):
    ticket: str = Field(min_length=32, max_length=512)


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _service_secret() -> bytes:
    secret = settings.OJ_SERVICE_SECRET.strip()
    if not secret:
        raise HTTPException(status_code=503, detail="在线判题服务尚未配置")
    return secret.encode("utf-8")


def _signature_payload(timestamp: str, method: str, path: str, raw_body: bytes) -> bytes:
    body_hash = hashlib.sha256(raw_body).hexdigest()
    return f"{timestamp}.{method.upper()}.{path}.{body_hash}".encode("utf-8")


def _verify_service_signature(request: Request, raw_body: bytes) -> None:
    timestamp = request.headers.get("X-StudyMate-Timestamp", "").strip()
    signature = request.headers.get("X-StudyMate-Signature", "").strip()
    try:
        age = abs(time.time() - int(timestamp))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="无效的服务签名") from exc
    if age > settings.OJ_SIGNATURE_TTL_SECONDS:
        raise HTTPException(status_code=401, detail="服务签名已过期")
    expected = hmac.new(
        _service_secret(),
        _signature_payload(timestamp, request.method, request.url.path, raw_body),
        hashlib.sha256,
    ).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="无效的服务签名")


@router.get("/launch", response_class=RedirectResponse)
async def launch_oj(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    public_url = settings.OJ_PUBLIC_URL.strip().rstrip("/")
    if not public_url:
        raise HTTPException(status_code=503, detail="在线判题服务尚未配置")
    _service_secret()

    raw_ticket = secrets.token_urlsafe(32)
    ticket = OJLaunchTicket(
        user_id=user.id,
        token_hash=_token_hash(raw_ticket),
        expires_at=datetime.utcnow() + timedelta(seconds=settings.OJ_TICKET_TTL_SECONDS),
    )
    db.add(ticket)
    await db.commit()
    launch_url = f"{public_url}/integrations/studymate/launch?ticket={quote(raw_ticket, safe='')}"
    return RedirectResponse(url=launch_url, status_code=303)


@internal_router.post("/tickets/redeem")
async def redeem_oj_ticket(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    try:
        payload = RedeemTicketRequest.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="OJ 启动票据格式无效") from exc

    now = datetime.utcnow()
    ticket = await db.scalar(
        select(OJLaunchTicket).where(OJLaunchTicket.token_hash == _token_hash(payload.ticket))
    )
    if ticket is None or ticket.expires_at < now:
        raise HTTPException(status_code=410, detail="OJ 启动票据已过期，请返回 StudyMate 重新进入")
    user = await db.get(User, ticket.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="当前学习者不可用")

    consume = await db.execute(
        update(OJLaunchTicket)
        .where(
            OJLaunchTicket.id == ticket.id,
            OJLaunchTicket.consumed_at.is_(None),
            OJLaunchTicket.expires_at >= now,
        )
        .values(consumed_at=now)
    )
    if consume.rowcount != 1:
        raise HTTPException(status_code=410, detail="OJ 启动票据已使用，请返回 StudyMate 重新进入")
    await db.commit()
    return {
        "user": {
            "subject": str(user.id),
            "name": user.name,
            "email": user.email or f"user-{user.id}@studymate.local",
            "role": user.role or "student",
        }
    }
