"""StudyMate-owned launch and report APIs for the independent AI interview service."""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from datetime import datetime, timedelta
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.db.models import (
    Course,
    InterviewAttempt,
    InterviewLaunchTicket,
    Profile,
    ProfileSnapshot,
    User,
)
from app.deps import require_user
from app.schemas.profile import ProfileDims
from app.training import get_target_role


router = APIRouter(prefix="/interviews", tags=["interviews"])
internal_router = APIRouter(prefix="/internal/interviews", tags=["internal-interviews"])


class CreateInterviewAttemptRequest(BaseModel):
    role_id: str = Field(min_length=1, max_length=128)
    course_id: int | None = None


class GenericScores(BaseModel):
    professional_ability: float = Field(ge=0, le=100)
    learning_ability: float = Field(ge=0, le=100)
    team_collaboration: float = Field(ge=0, le=100)
    problem_solving: float = Field(ge=0, le=100)
    communication_expression: float = Field(ge=0, le=100)


class CompetencyScore(BaseModel):
    competency: str = Field(min_length=1, max_length=128)
    score: float = Field(ge=0, le=100)
    evidence: str = Field(default="", max_length=2000)
    improvement: str = Field(default="", max_length=2000)


class InterviewReport(BaseModel):
    schema_version: Literal[1] = 1
    attempt_id: str = Field(min_length=1, max_length=36)
    overall_score: float = Field(ge=0, le=100)
    role_match_score: float = Field(ge=0, le=100)
    general_score: float = Field(ge=0, le=100)
    generic_scores: GenericScores
    competency_scores: list[CompetencyScore] = Field(min_length=1, max_length=12)
    summary: str = Field(default="", max_length=4000)
    strengths: list[str] = Field(default_factory=list, max_length=8)
    improvements: list[str] = Field(default_factory=list, max_length=8)
    question_count: int = Field(ge=1, le=50)
    started_at: str = Field(min_length=1, max_length=64)
    completed_at: str = Field(min_length=1, max_length=64)


class InterviewResultCallback(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=36)
    external_interview_id: str = Field(min_length=1, max_length=64)
    status: Literal["completed"]
    report: InterviewReport


class InterviewStartedCallback(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=36)
    external_interview_id: str = Field(min_length=1, max_length=64)


class RedeemTicketRequest(BaseModel):
    ticket: str = Field(min_length=32, max_length=512)


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _report_hash(raw_body: bytes) -> str:
    return hashlib.sha256(raw_body).hexdigest()


def _service_secret() -> bytes:
    secret = settings.AI_INTERVIEW_SERVICE_SECRET.strip()
    if not secret:
        raise HTTPException(status_code=503, detail="AI 面试服务集成尚未配置")
    return secret.encode("utf-8")


def _signature_payload(timestamp: str, method: str, path: str, raw_body: bytes) -> bytes:
    body_hash = hashlib.sha256(raw_body).hexdigest()
    return f"{timestamp}.{method.upper()}.{path}.{body_hash}".encode("utf-8")


def _verify_service_signature(request: Request, raw_body: bytes) -> None:
    secret = _service_secret()
    timestamp = request.headers.get("X-StudyMate-Timestamp", "").strip()
    signature = request.headers.get("X-StudyMate-Signature", "").strip()
    try:
        age = abs(time.time() - int(timestamp))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="无效的服务签名") from exc
    if age > settings.AI_INTERVIEW_SIGNATURE_TTL_SECONDS:
        raise HTTPException(status_code=401, detail="服务签名已过期")
    expected = hmac.new(
        secret,
        _signature_payload(timestamp, request.method, request.url.path, raw_body),
        hashlib.sha256,
    ).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="无效的服务签名")


def _candidate_snapshot(user: User, dims: ProfileDims) -> dict:
    """Only send the minimum useful learning context to the interview service."""
    return {
        "display_name": user.name,
        "goals": dims.goals.model_dump(),
        "learner_background": dims.learner_background.model_dump(),
        "knowledge_base": dims.knowledge_base.model_dump(),
        "employment_skills": dims.employment_skills.model_dump(),
        "weak_points": dims.weak_points.model_dump(),
        "theory_assessments": {
            role_id: evidence.model_dump()
            for role_id, evidence in dims.theory_assessments.items()
        },
        "interview_assessments": {
            role_id: evidence.model_dump()
            for role_id, evidence in dims.interview_assessments.items()
        },
    }


def _attempt_public(attempt: InterviewAttempt) -> dict:
    report = attempt.report or {}
    return {
        "id": attempt.id,
        "role_id": attempt.role_id,
        "role_name": attempt.role_name,
        "course_id": attempt.course_id,
        "status": attempt.status,
        "external_interview_id": attempt.external_interview_id,
        "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
        "launched_at": attempt.launched_at.isoformat() if attempt.launched_at else None,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "report": report,
        "score_summary": {
            key: report.get(key)
            for key in ("overall_score", "role_match_score", "general_score")
            if key in report
        },
    }


def _validate_report_scores(attempt: InterviewAttempt, report: InterviewReport) -> None:
    """Keep score aggregation deterministic even though the narrative is LLM-generated."""
    expected_competencies = [
        str(item).strip()
        for item in (attempt.role_context or {}).get("competencies") or []
        if str(item).strip()
    ]
    if not expected_competencies:
        raise HTTPException(status_code=422, detail="面试记录缺少岗位能力要求")
    supplied = {item.competency.strip(): item.score for item in report.competency_scores}
    if len(supplied) != len(report.competency_scores) or set(supplied) != set(expected_competencies):
        raise HTTPException(status_code=422, detail="面试报告的岗位能力维度不完整或不匹配")

    expected_role = round(sum(supplied.values()) / len(supplied), 1)
    generic = report.generic_scores
    expected_general = round(
        generic.professional_ability * 0.40
        + generic.learning_ability * 0.20
        + generic.team_collaboration * 0.15
        + generic.problem_solving * 0.15
        + generic.communication_expression * 0.10,
        1,
    )
    expected_overall = round(expected_role * 0.60 + expected_general * 0.40, 1)
    if (
        abs(report.role_match_score - expected_role) > 0.11
        or abs(report.general_score - expected_general) > 0.11
        or abs(report.overall_score - expected_overall) > 0.11
    ):
        raise HTTPException(status_code=422, detail="面试报告评分口径不符合岗位 60%、通用能力 40% 的规则")
    if _parse_iso_time(report.started_at) is None or _parse_iso_time(report.completed_at) is None:
        raise HTTPException(status_code=422, detail="面试报告时间格式无效")


async def _get_owned_attempt(
    db: AsyncSession, *, user_id: int, attempt_id: str
) -> InterviewAttempt:
    attempt = await db.get(InterviewAttempt, attempt_id)
    if attempt is None or attempt.user_id != user_id:
        raise HTTPException(status_code=404, detail="面试记录不存在")
    return attempt


@router.post("/attempts")
async def create_interview_attempt(
    req: CreateInterviewAttemptRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    role = get_target_role(req.role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="目标岗位不存在或已不再支持")
    public_url = settings.AI_INTERVIEW_PUBLIC_URL.strip().rstrip("/")
    if not public_url:
        raise HTTPException(status_code=503, detail="AI 面试服务尚未配置")
    _service_secret()

    course_name: str | None = None
    if req.course_id is not None:
        course = await db.get(Course, req.course_id)
        if course is None:
            raise HTTPException(status_code=404, detail="岗位知识库不存在")
        if course.name != role.course_name:
            raise HTTPException(status_code=422, detail="所选岗位与当前岗位知识库不匹配")
        course_name = course.name

    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    dims = ProfileDims.model_validate(profile.dims if profile else {})
    role_context = {
        **role.to_dict(),
        "course_id": req.course_id,
        "course_name": course_name or role.course_name,
    }
    attempt = InterviewAttempt(
        id=str(uuid.uuid4()),
        user_id=user.id,
        role_id=role.id,
        role_name=role.name,
        course_id=req.course_id,
        role_context=role_context,
        profile_snapshot=_candidate_snapshot(user, dims),
        status="launch_ready",
    )
    raw_ticket = secrets.token_urlsafe(32)
    ticket = InterviewLaunchTicket(
        attempt_id=attempt.id,
        token_hash=_token_hash(raw_ticket),
        expires_at=datetime.utcnow() + timedelta(seconds=settings.AI_INTERVIEW_TICKET_TTL_SECONDS),
    )
    db.add_all((attempt, ticket))
    await db.commit()
    launch_url = f"{public_url}/integrations/studymate/launch?ticket={quote(raw_ticket, safe='')}"
    return {
        "attempt": _attempt_public(attempt),
        "launch_url": launch_url,
        "expires_at": ticket.expires_at.isoformat(),
    }


@router.get("/attempts")
async def list_interview_attempts(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(InterviewAttempt)
        .where(InterviewAttempt.user_id == user.id)
        .order_by(desc(InterviewAttempt.created_at))
        .limit(50)
    )
    return {"items": [_attempt_public(item) for item in rows.scalars().all()]}


@router.get("/attempts/{attempt_id}")
async def get_interview_attempt(
    attempt_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return _attempt_public(await _get_owned_attempt(db, user_id=user.id, attempt_id=attempt_id))


@internal_router.post("/tickets/redeem")
async def redeem_launch_ticket(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    try:
        payload = RedeemTicketRequest.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="启动票据格式无效") from exc

    token_hash = _token_hash(payload.ticket)
    ticket = await db.scalar(
        select(InterviewLaunchTicket).where(InterviewLaunchTicket.token_hash == token_hash)
    )
    now = datetime.utcnow()
    if ticket is None or ticket.expires_at < now:
        raise HTTPException(status_code=410, detail="启动票据已过期，请返回 StudyMate 重新开始")
    attempt = await db.get(InterviewAttempt, ticket.attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="对应的面试记录不存在")
    user = await db.get(User, attempt.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="当前学习者不可用")

    # Browser-visible launch credentials are strictly one-time. The conditional
    # update is atomic, so two service requests racing for the same ticket
    # cannot both establish an AI-interview browser session.
    consume = await db.execute(
        update(InterviewLaunchTicket)
        .where(
            InterviewLaunchTicket.id == ticket.id,
            InterviewLaunchTicket.consumed_at.is_(None),
            InterviewLaunchTicket.expires_at >= now,
        )
        .values(consumed_at=now)
    )
    if consume.rowcount != 1:
        raise HTTPException(status_code=410, detail="启动票据已使用，请返回 StudyMate 重新开始")
    if attempt.status == "launch_ready":
        attempt.status = "launched"
        attempt.launched_at = now
    await db.commit()
    return {
        "attempt_id": attempt.id,
        "user": {"subject": str(user.id), "name": user.name},
        "role": attempt.role_context,
        "candidate_context": attempt.profile_snapshot,
    }


@internal_router.post("/attempts/{attempt_id}/started")
async def receive_interview_started(
    attempt_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    try:
        payload = InterviewStartedCallback.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="面试启动回调格式无效") from exc
    if payload.attempt_id != attempt_id:
        raise HTTPException(status_code=422, detail="面试启动回调与目标记录不一致")

    attempt = await db.get(InterviewAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="面试记录不存在")
    if attempt.external_interview_id and attempt.external_interview_id != payload.external_interview_id:
        raise HTTPException(status_code=409, detail="面试记录已关联其他外部面试")
    if attempt.status == "completed":
        return {"ok": True, "idempotent": True, "attempt": _attempt_public(attempt)}
    if attempt.status not in {"launched", "in_progress"}:
        raise HTTPException(status_code=409, detail="面试记录当前不能启动")

    was_started = attempt.status == "in_progress"
    now = datetime.utcnow()
    attempt.status = "in_progress"
    attempt.external_interview_id = payload.external_interview_id
    attempt.started_at = attempt.started_at or now
    await db.commit()
    return {"ok": True, "idempotent": was_started, "attempt": _attempt_public(attempt)}


@internal_router.put("/attempts/{attempt_id}/result")
async def receive_interview_result(
    attempt_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    try:
        payload = InterviewResultCallback.model_validate_json(raw_body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="面试报告格式无效") from exc
    if payload.attempt_id != attempt_id or payload.report.attempt_id != attempt_id:
        raise HTTPException(status_code=422, detail="面试报告与目标记录不一致")

    attempt = await db.get(InterviewAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="面试记录不存在")
    if attempt.external_interview_id and attempt.external_interview_id != payload.external_interview_id:
        raise HTTPException(status_code=409, detail="面试记录已关联其他外部面试")
    _validate_report_scores(attempt, payload.report)
    body_hash = _report_hash(raw_body)
    if attempt.status == "completed":
        if hmac.compare_digest(attempt.report_hash or "", body_hash):
            return {"ok": True, "idempotent": True, "attempt": _attempt_public(attempt)}
        raise HTTPException(status_code=409, detail="面试记录已由另一份报告完成")

    report = payload.report.model_dump(mode="json")
    now = datetime.utcnow()
    attempt.status = "completed"
    attempt.external_interview_id = payload.external_interview_id
    attempt.report = report
    attempt.report_hash = body_hash
    attempt.started_at = _parse_iso_time(report.get("started_at")) or attempt.started_at or now
    attempt.completed_at = _parse_iso_time(report.get("completed_at")) or now

    profile = await db.scalar(select(Profile).where(Profile.user_id == attempt.user_id))
    if profile is None:
        profile = Profile(user_id=attempt.user_id, dims=ProfileDims().model_dump(), version=1)
        db.add(profile)
        await db.flush()
    old_dims = ProfileDims.model_validate(profile.dims).model_dump()
    updated = ProfileDims.model_validate(profile.dims).model_dump()
    competency_scores = {
        item["competency"]: item["score"]
        for item in report["competency_scores"]
    }
    updated["interview_assessments"][attempt.role_id] = {
        "attempt_id": attempt.id,
        "role_id": attempt.role_id,
        "role_name": attempt.role_name,
        "course_id": attempt.course_id,
        "overall_score": report["overall_score"],
        "role_match_score": report["role_match_score"],
        "general_score": report["general_score"],
        "competency_scores": competency_scores,
        "weak_competencies": [
            item["competency"] for item in report["competency_scores"] if item["score"] < 60
        ],
        "completed_at": report["completed_at"],
    }
    db.add(ProfileSnapshot(
        user_id=attempt.user_id,
        snapshot=old_dims,
        trigger_event=f"interview_assessment:{attempt.role_id}"[:64],
    ))
    profile.dims = ProfileDims.model_validate(updated).model_dump()
    profile.version += 1
    await db.commit()
    return {"ok": True, "idempotent": False, "attempt": _attempt_public(attempt)}


@internal_router.get("/attempts/{attempt_id}")
async def get_internal_attempt_status(
    attempt_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    _verify_service_signature(request, raw_body)
    attempt = await db.get(InterviewAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="面试记录不存在")
    return _attempt_public(attempt)


def _parse_iso_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None
