"""邮箱验证码注册、邮箱密码登录与服务端会话。"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from typing import Literal

from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.mailer import send_verification_code
from app.db import get_db
from app.db.models import EmailVerificationCode, Enterprise, EnterpriseMembership, User, UserSession
from app.deps import current_user
from app.demo_private_knowledge import ensure_demo_private_library
from app.demo_notes import ensure_demo_notes

router = APIRouter(prefix="/auth", tags=["auth"])
password_hash = PasswordHash.recommended()
_dummy_password_hash = password_hash.hash("StudyMate-dummy-password")
_ephemeral_secret = secrets.token_bytes(32)
COOKIE_NAME = "sm_session"
FIXED_FDE_ACCOUNTS = {
    "sunjiayu@pramate.com",
    "baixinyue@pramate.com",
    "yuanshicong@pramate.com",
    "chenzhuo@pramate.com",
    "lijiayi@pramate.com",
    "zhouxiang@pramate.com",
    "tianyixin@pramate.com",
    "liufei@pramate.com",
    "test@pramate.com",
}
FIXED_FDE_ROLE = "前线部署工程师（FDE）"


class SendCodeRequest(BaseModel):
    email: EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=64)
    account_type: Literal["learner", "enterprise_admin"] = "learner"
    learner_type: Literal["student", "worker"] = "student"
    study_stage: str = Field(default="", max_length=32)
    company: str = Field(default="", max_length=128)
    target_role: str = Field(default="", max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    user_id: int
    name: str
    email: str | None = None
    role: str
    learner_type: str = "student"
    study_stage: str = ""
    company: str = ""
    target_role: str = ""
    created: bool = False


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _secret() -> bytes:
    return settings.AUTH_SECRET_KEY.encode() if settings.AUTH_SECRET_KEY else _ephemeral_secret


def _code_hash(email: str, code: str) -> str:
    return hmac.new(_secret(), f"register:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_out(user: User, *, created: bool = False) -> UserOut:
    email = (user.email or "").lower()
    return UserOut(
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=user.role or "student",
        learner_type=user.learner_type or "student",
        study_stage=user.study_stage or "",
        company=user.company or "",
        target_role=FIXED_FDE_ROLE if email in FIXED_FDE_ACCOUNTS else user.target_role or "",
        created=created,
    )


async def _create_session(db: AsyncSession, user: User, response: Response) -> None:
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=settings.SESSION_EXPIRE_DAYS)
    db.add(UserSession(user_id=user.id, token_hash=_token_hash(raw_token), expires_at=expires_at))
    await db.commit()
    response.set_cookie(
        COOKIE_NAME,
        raw_token,
        max_age=settings.SESSION_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


@router.post("/register/send-code")
async def send_register_code(
    req: SendCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = _normalize_email(str(req.email))
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")

    latest = await db.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == "register",
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )
    now = datetime.utcnow()
    if latest and (now - latest.created_at).total_seconds() < settings.EMAIL_CODE_RESEND_SECONDS:
        wait = settings.EMAIL_CODE_RESEND_SECONDS - int((now - latest.created_at).total_seconds())
        raise HTTPException(status_code=429, detail=f"发送过于频繁，请 {wait} 秒后重试")

    code = f"{secrets.randbelow(1_000_000):06d}"
    record = EmailVerificationCode(
        email=email,
        code_hash=_code_hash(email, code),
        purpose="register",
        expires_at=now + timedelta(minutes=settings.EMAIL_CODE_EXPIRE_MINUTES),
    )
    db.add(record)
    try:
        await send_verification_code(email, code)
        await db.commit()
    except RuntimeError as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=502, detail="验证码邮件发送失败，请稍后重试") from exc
    return {"ok": True, "message": "验证码已发送", "resend_after": settings.EMAIL_CODE_RESEND_SECONDS}


@router.post("/register", response_model=UserOut)
async def register(req: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    email = _normalize_email(str(req.email))
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")

    record = await db.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == "register",
            EmailVerificationCode.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )
    now = datetime.utcnow()
    invalid = (
        record is None
        or record.expires_at < now
        or record.attempts >= settings.EMAIL_CODE_MAX_ATTEMPTS
        or not hmac.compare_digest(record.code_hash, _code_hash(email, req.code))
    )
    if invalid:
        if record is not None:
            record.attempts += 1
            await db.commit()
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    user = User(
        name=req.name.strip(),
        email=email,
        password_hash=password_hash.hash(req.password),
        email_verified_at=now,
        is_active=True,
        role="enterprise_admin" if req.account_type == "enterprise_admin" else "student",
        learner_type=req.learner_type,
        study_stage=req.study_stage.strip(),
        company=req.company.strip(),
        target_role=req.target_role.strip(),
    )
    record.consumed_at = now
    db.add(user)
    await db.flush()
    if req.account_type == "enterprise_admin":
        enterprise_name = req.company.strip() or "河南本线商贸有限公司"
        enterprise = Enterprise(
            name=enterprise_name,
            invite_code=f"SM{user.id:04d}",
            owner_id=user.id,
        )
        db.add(enterprise)
        await db.flush()
        db.add(EnterpriseMembership(
            enterprise_id=enterprise.id,
            user_id=user.id,
            member_role="owner",
            job_title="企业管理员",
        ))
    await _create_session(db, user, response)
    await ensure_demo_private_library(user.id)
    await ensure_demo_notes(user.id)
    return _user_out(user, created=True)


@router.post("/login", response_model=UserOut)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    email = _normalize_email(str(req.email))
    user = await db.scalar(select(User).where(User.email == email))
    stored_hash = user.password_hash if user and user.password_hash else _dummy_password_hash
    valid = password_hash.verify(req.password, stored_hash)
    if not user or not valid or not user.is_active or user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    if email in FIXED_FDE_ACCOUNTS:
        user.learner_type = "worker"
        user.company = "河南本线商贸有限公司"
        user.target_role = FIXED_FDE_ROLE
        membership = await db.scalar(select(EnterpriseMembership).where(
            EnterpriseMembership.user_id == user.id,
            EnterpriseMembership.status == "active",
        ))
        if membership is not None:
            membership.job_title = FIXED_FDE_ROLE
    await _create_session(db, user, response)
    return _user_out(user)


@router.post("/logout")
async def logout(
    response: Response,
    sm_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    if sm_session:
        session = await db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(sm_session)))
        if session:
            session.revoked_at = datetime.utcnow()
            await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut | None)
async def me(user: User | None = Depends(current_user)):
    return _user_out(user) if user else None
