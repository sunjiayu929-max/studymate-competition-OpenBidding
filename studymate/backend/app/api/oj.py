"""StudyMate launch and identity exchange APIs for the independent Hydro OJ."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta
from urllib.parse import quote, unquote, urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.db.models import OJLaunchTicket, User
from app.deps import current_user, require_user


router = APIRouter(prefix="/oj", tags=["oj"])
internal_router = APIRouter(prefix="/internal/oj", tags=["internal-oj"])


class RedeemTicketRequest(BaseModel):
    ticket: str = Field(min_length=32, max_length=512)


class IdentityStatusRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=128)


DEFAULT_OJ_PATH = "/oj/"


def _has_unsafe_path_segments(path: str) -> bool:
    """Reject traversal, duplicate separators, and encoded equivalents."""
    def unsafe(value: str) -> bool:
        return (
            "//" in value
            or "\\" in value
            or any(ord(char) < 0x20 or ord(char) == 0x7F for char in value)
            or any(part in {".", ".."} for part in value.split("/"))
        )

    current = path
    for _ in range(4):
        if unsafe(current) or re.search(r"%(?![0-9A-Fa-f]{2})", current):
            return True
        if not re.search(r"%[0-9A-Fa-f]{2}", current):
            return False
        try:
            decoded = unquote(current, errors="strict")
        except UnicodeDecodeError:
            return True
        if decoded == current:
            return False
        current = decoded
    return True


def _has_unsafe_query(query: str) -> bool:
    """Reject query text that can be reinterpreted as a redirect boundary."""
    current = query
    for _ in range(4):
        if (
            any(ord(char) < 0x20 or ord(char) == 0x7F for char in current)
            or "\\" in current
            or "#" in current
            or re.search(r"%(?![0-9A-Fa-f]{2})", current)
        ):
            return True
        if not re.search(r"%[0-9A-Fa-f]{2}", current):
            return False
        try:
            decoded = unquote(current, errors="strict")
        except UnicodeDecodeError:
            return True
        if decoded == current:
            return False
        current = decoded
    return True


def _normalize_next_path(value: str | None) -> str:
    """Allow only public OJ paths; never reflect an external redirect target."""
    raw_candidate = value or DEFAULT_OJ_PATH
    if not isinstance(raw_candidate, str):
        raise HTTPException(status_code=400, detail="OJ 回跳路径无效")
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in raw_candidate):
        raise HTTPException(status_code=400, detail="OJ 回跳路径无效")
    candidate = raw_candidate.strip() or DEFAULT_OJ_PATH
    if candidate == "/oj":
        candidate = DEFAULT_OJ_PATH
    parsed = urlsplit(candidate)
    if (
        len(candidate) > 512
        or not candidate.startswith("/oj/")
        or candidate.startswith("//")
        or "\\" in candidate
        or parsed.scheme
        or parsed.netloc
        or parsed.fragment
        or _has_unsafe_path_segments(parsed.path)
        or _has_unsafe_query(parsed.query)
    ):
        raise HTTPException(status_code=400, detail="OJ 回跳路径无效")
    return candidate


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


async def _issue_launch_ticket(user: User, db: AsyncSession, next_path: str) -> RedirectResponse:
    public_url = settings.OJ_PUBLIC_URL.strip().rstrip("/")
    if not public_url:
        raise HTTPException(status_code=503, detail="在线判题服务尚未配置")
    _service_secret()

    # Keep one-time credentials bounded even when the periodic ops task is
    # temporarily unavailable. This never touches submissions or user data.
    await db.execute(
        delete(OJLaunchTicket).where(
            OJLaunchTicket.expires_at < datetime.utcnow() - timedelta(hours=24),
        )
    )
    raw_ticket = secrets.token_urlsafe(32)
    ticket = OJLaunchTicket(
        user_id=user.id,
        token_hash=_token_hash(raw_ticket),
        next_path=next_path,
        expires_at=datetime.utcnow() + timedelta(seconds=settings.OJ_TICKET_TTL_SECONDS),
    )
    db.add(ticket)
    await db.commit()
    launch_url = f"{public_url}/integrations/studymate/launch?ticket={quote(raw_ticket, safe='')}"
    return RedirectResponse(url=launch_url, status_code=303)


@router.get("/entry", response_class=RedirectResponse)
async def enter_oj(
    next_path: str | None = Query(default=None, alias="next"),
    user: User | None = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browser entry that sends guests through StudyMate login first."""
    normalized = _normalize_next_path(next_path)
    if user is None:
        return_to = f"/api/oj/entry?{urlencode({'next': normalized})}"
        return RedirectResponse(
            url=f"/login?{urlencode({'return_to': return_to})}",
            status_code=303,
        )
    return await _issue_launch_ticket(user, db, normalized)


@router.get("/launch", response_class=RedirectResponse)
async def launch_oj(
    next_path: str | None = Query(default=None, alias="next"),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return await _issue_launch_ticket(user, db, _normalize_next_path(next_path))


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
        },
        "redirect_path": ticket.next_path or DEFAULT_OJ_PATH,
    }


@internal_router.post("/identity/status")
async def oj_identity_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Signed liveness check used by the OJ integration and operational probes."""
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    try:
        payload = IdentityStatusRequest.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="OJ 身份状态请求格式无效") from exc
    if not payload.subject.isdigit():
        raise HTTPException(status_code=422, detail="OJ 身份 subject 无效")
    user = await db.get(User, int(payload.subject))
    if user is None:
        return {"identity": {"subject": payload.subject, "active": False}}
    return {
        "identity": {
            "subject": payload.subject,
            "active": bool(user.is_active),
            "name": user.name,
            "email": user.email or f"user-{user.id}@studymate.local",
            "role": user.role or "student",
        }
    }


@internal_router.post("/tickets/cleanup")
async def cleanup_oj_tickets(request: Request, db: AsyncSession = Depends(get_db)):
    """Remove only old one-time credentials; never touches OJ history."""
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    cutoff = datetime.utcnow() - timedelta(hours=24)
    result = await db.execute(
        delete(OJLaunchTicket).where(
            OJLaunchTicket.expires_at < cutoff,
        )
    )
    await db.commit()
    return {"deleted": result.rowcount or 0}
