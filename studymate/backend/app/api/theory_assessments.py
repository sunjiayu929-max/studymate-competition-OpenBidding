"""目标岗位理论基线测评：知识库组卷、首次进入门禁、评分与画像回写。"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.quiz_agent import _grounded_mock_fill, generate_quiz_batch
from app.agents.profile_agent import profile_missing_fields
from app.courses import get_course_by_id
from app.db import async_session_maker, get_db
from app.db.models import Profile, ProfileSnapshot, TheoryAssessment, User
from app.deps import require_user
from app.rag.service import get_rag_service
from app.schemas.profile import ProfileDims


router = APIRouter(prefix="/theory-assessments", tags=["theory-assessments"])


def _strip_source_leadin(question: str) -> str:
    """移除题干开头的书名/章节出处，同时保留正常的场景条件。"""
    text = " ".join(str(question or "").split()).strip()
    if not text.startswith(("根据", "依据", "参照")):
        return text
    if "《" in text and "》" in text:
        title_end = text.find("》")
        chapter_start = text.find("第", title_end + 1, min(len(text), title_end + 48))
        search_from = chapter_start if chapter_start >= 0 else title_end + 1
        comma_positions = [index for mark in ("，", ",") if (index := text.find(mark, search_from)) >= 0]
        if comma_positions:
            cleaned = text[min(comma_positions) + 1:].strip()
            return cleaned or text

    delimiter_positions = [index for mark in ("，", ",", "：", ":") if (index := text.find(mark)) >= 0]
    if not delimiter_positions:
        return text
    end = min(delimiter_positions)
    lead = text[:end]
    source_markers = ("《", "知识库", "资料", "文档", "指南", "第", "章节", "v1.", "V1.")
    if any(marker in lead for marker in source_markers):
        cleaned = text[end + 1:].strip()
        return cleaned or text
    return text


class CreateTheoryAssessmentRequest(BaseModel):
    role_id: str = Field(min_length=1, max_length=128)
    role_name: str = Field(min_length=1, max_length=128)
    course_id: int
    competencies: list[str] = Field(default_factory=list, max_length=12)


class TheoryAnswer(BaseModel):
    item_id: str
    answer: str | int | None = None


class SubmitTheoryAssessmentRequest(BaseModel):
    answers: list[TheoryAnswer]
    duration_ms: int = Field(default=0, ge=0, le=7_200_000)


_preparation_tasks: dict[tuple[int, str], asyncio.Task] = {}


def _profile_score(dims: ProfileDims, version: int) -> int:
    employment_count = sum(1 for value in dims.employment_skills.model_dump().values() if value > 0)
    return min(
        100,
        20
        + (20 if dims.goals.primary.strip() else 0)
        + (15 if dims.pace.hours_per_week > 0 else 0)
        + (15 if dims.goals.target_topics or dims.weak_points.topics else 0)
        + (20 if employment_count else 0)
        + (10 if version > 1 else 0),
    )


def _knowledge_level(score: float) -> str:
    if score < 40:
        return "入门"
    if score < 60:
        return "基础"
    if score < 80:
        return "应用"
    return "进阶"


def _public_assessment(assessment: TheoryAssessment) -> dict:
    submitted = assessment.status == "submitted"
    public_items: list[dict] = []
    result_items = {
        str(item.get("id")): item
        for item in (assessment.result or {}).get("items", [])
        if isinstance(item, dict)
    }
    for item in assessment.items or []:
        item_id = str(item.get("id") or "")
        public = {
            "id": item_id,
            "index": int(item.get("index") or len(public_items) + 1),
            "type": str(item.get("type") or "mcq"),
            "question": _strip_source_leadin(str(item.get("question") or "")),
            "options": item.get("options") or [],
            "difficulty": int(item.get("difficulty") or 2),
            "competency": str(item.get("competency") or "岗位领域知识"),
            "source": str(item.get("source") or "岗位知识库"),
        }
        if submitted:
            graded = result_items.get(item_id, {})
            public.update({
                "user_answer": graded.get("user_answer"),
                "correct_answer": item.get("answer"),
                "is_correct": bool(graded.get("is_correct")),
                "explanation": str(item.get("explanation") or ""),
            })
        public_items.append(public)
    return {
        "id": assessment.id,
        "role_id": assessment.role_id,
        "role_name": assessment.role_name,
        "course_id": assessment.course_id,
        "status": assessment.status,
        "score": assessment.score if submitted else None,
        "duration_ms": assessment.duration_ms if submitted else 0,
        "created_at": assessment.created_at.isoformat() if assessment.created_at else None,
        "submitted_at": assessment.submitted_at.isoformat() if assessment.submitted_at else None,
        "items": public_items,
        "result": assessment.result if submitted else {},
    }


async def _latest_assessment(
    db: AsyncSession, *, user_id: int, role_id: str
) -> TheoryAssessment | None:
    return await db.scalar(
        select(TheoryAssessment)
        .where(TheoryAssessment.user_id == user_id, TheoryAssessment.role_id == role_id)
        .order_by(desc(TheoryAssessment.id))
        .limit(1)
    )


async def _build_assessment_items(req: CreateTheoryAssessmentRequest) -> list[dict[str, Any]]:
    course_cfg = await get_course_by_id(req.course_id)
    query = " ".join([req.role_name, "岗位理论基础", *req.competencies[:8]])
    materials = await get_rag_service().search(query, k=10, course_id=req.course_id)
    materials = [
        {
            "content": str(item.get("content") or "").strip(),
            "source": str(item.get("source") or course_cfg.name),
            "page": item.get("page"),
        }
        for item in materials
        if str(item.get("content") or "").strip()
    ]
    if not materials:
        raise RuntimeError("当前目标岗位知识库暂无可用于组卷的内容")

    try:
        raw_items = await asyncio.wait_for(
            generate_quiz_batch(
                topic=f"{req.role_name}岗位理论基础综合诊断",
                course_name=course_cfg.name,
                persona=course_cfg.persona,
                difficulty=2,
                mcq_count=8,
                fill_count=0,
                code_count=0,
                target_role=req.role_name,
                competencies=req.competencies,
                reference_materials=materials,
            ),
            timeout=20,
        )
    except TimeoutError:
        raw_items = _grounded_mock_fill(
            8,
            0,
            0,
            reference_materials=materials,
            competencies=req.competencies,
            difficulty=2,
        )
    if not raw_items:
        raise RuntimeError("岗位理论试卷生成失败，请稍后重试")

    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items[:8]):
        options = list(item.get("options") or [])
        try:
            answer = int(item.get("answer"))
        except (TypeError, ValueError):
            continue
        if len(options) != 4 or answer < 0 or answer >= len(options):
            continue
        items.append({
            "id": f"theory_{index + 1}",
            "index": index + 1,
            "type": "mcq",
            "question": _strip_source_leadin(str(item.get("question") or "")),
            "options": options,
            "answer": answer,
            "explanation": str(item.get("explanation") or ""),
            "difficulty": int(item.get("difficulty") or 2),
            "competency": str(item.get("competency") or req.competencies[index % len(req.competencies)] if req.competencies else "岗位领域知识"),
            "source": str(item.get("source") or materials[index % len(materials)]["source"]),
        })
    if len(items) < 5:
        raise RuntimeError("岗位理论试卷有效题量不足，请重新组卷")
    return items


async def _prepare_assessment(user_id: int, req: CreateTheoryAssessmentRequest) -> None:
    async with async_session_maker() as db:
        existing = await _latest_assessment(db, user_id=user_id, role_id=req.role_id)
        if existing and existing.status in {"generating", "ready", "submitted"}:
            return
        if existing and existing.status == "error":
            assessment = existing
            assessment.status = "generating"
            assessment.items = []
        else:
            assessment = TheoryAssessment(
                user_id=user_id,
                role_id=req.role_id,
                role_name=req.role_name,
                course_id=req.course_id,
                status="generating",
                items=[],
            )
            db.add(assessment)
        await db.commit()
        await db.refresh(assessment)
        assessment_id = assessment.id

    try:
        items = await _build_assessment_items(req)
    except Exception:
        async with async_session_maker() as db:
            assessment = await db.get(TheoryAssessment, assessment_id)
            if assessment and assessment.status == "generating":
                assessment.status = "error"
                await db.commit()
        return

    async with async_session_maker() as db:
        assessment = await db.get(TheoryAssessment, assessment_id)
        if assessment and assessment.status == "generating":
            assessment.items = items
            assessment.status = "ready"
            await db.commit()


def schedule_theory_assessment_preparation(user_id: int, req: CreateTheoryAssessmentRequest) -> bool:
    """幂等地在画像对话期间启动后台组卷。"""
    key = (user_id, req.role_id)
    current = _preparation_tasks.get(key)
    if current and not current.done():
        return False
    task = asyncio.create_task(_prepare_assessment(user_id, req))
    _preparation_tasks[key] = task
    task.add_done_callback(lambda completed, task_key=key: _preparation_tasks.pop(task_key, None))
    return True


@router.get("/status")
async def assessment_status(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
) -> dict:
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    dims = ProfileDims.model_validate(profile.dims if profile else {})
    profile_score = _profile_score(dims, profile.version if profile else 1)
    missing_fields = profile_missing_fields(dims)
    profile_ready = bool(profile) and not missing_fields
    assessment = await _latest_assessment(db, user_id=user.id, role_id=role_id)
    return {
        "role_id": role_id,
        "profile_ready": profile_ready,
        "profile_score": profile_score,
        "missing_fields": missing_fields,
        "required": profile_ready and not assessment,
        "assessment": _public_assessment(assessment) if assessment else None,
    }


@router.post("/prepare")
async def prepare_assessment(
    req: CreateTheoryAssessmentRequest,
    user: User = Depends(require_user),
) -> dict:
    started = schedule_theory_assessment_preparation(user.id, req)
    return {"ok": True, "started": started, "role_id": req.role_id}


@router.post("")
async def create_assessment(
    req: CreateTheoryAssessmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
) -> dict:
    existing = await _latest_assessment(db, user_id=user.id, role_id=req.role_id)
    if existing and existing.status in {"generating", "ready", "submitted"}:
        return _public_assessment(existing)

    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    dims = ProfileDims.model_validate(profile.dims if profile else {})
    if not profile or profile_missing_fields(dims):
        raise HTTPException(409, "请先完成岗位能力画像，再进行理论基线测评")

    try:
        items = await _build_assessment_items(req)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc

    assessment = TheoryAssessment(
        user_id=user.id,
        role_id=req.role_id,
        role_name=req.role_name,
        course_id=req.course_id,
        status="ready",
        items=items,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return _public_assessment(assessment)


def _answer_is_correct(user_answer: str | int | None, correct_answer: Any) -> bool:
    try:
        return int(user_answer) == int(correct_answer)
    except (TypeError, ValueError):
        return False


@router.post("/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: int,
    req: SubmitTheoryAssessmentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
) -> dict:
    assessment = await db.scalar(
        select(TheoryAssessment).where(
            TheoryAssessment.id == assessment_id,
            TheoryAssessment.user_id == user.id,
        )
    )
    if not assessment:
        raise HTTPException(404, "理论测评不存在")
    if assessment.status == "submitted":
        return _public_assessment(assessment)

    submitted = {item.item_id: item.answer for item in req.answers}
    graded_items: list[dict] = []
    competency_totals: dict[str, list[bool]] = {}
    for item in assessment.items or []:
        item_id = str(item.get("id") or "")
        competency = str(item.get("competency") or "岗位领域知识")
        user_answer = submitted.get(item_id)
        is_correct = _answer_is_correct(user_answer, item.get("answer"))
        competency_totals.setdefault(competency, []).append(is_correct)
        graded_items.append({
            "id": item_id,
            "user_answer": user_answer,
            "is_correct": is_correct,
            "competency": competency,
        })

    correct_count = sum(1 for item in graded_items if item["is_correct"])
    total = len(graded_items)
    score = round(correct_count / total * 100, 1) if total else 0.0
    competency_scores = {
        name: round(sum(values) / len(values) * 100, 1)
        for name, values in competency_totals.items()
    }
    weak_topics = [name for name, value in competency_scores.items() if value < 60]
    submitted_at = datetime.utcnow()
    source_count = len({str(item.get("source") or "") for item in assessment.items or [] if item.get("source")})
    result = {
        "knowledge_level": _knowledge_level(score),
        "correct_count": correct_count,
        "total_count": total,
        "competency_scores": competency_scores,
        "weak_topics": weak_topics,
        "source_count": source_count,
        "items": graded_items,
    }
    assessment.answers = submitted
    assessment.score = score
    assessment.result = result
    assessment.duration_ms = req.duration_ms
    assessment.status = "submitted"
    assessment.submitted_at = submitted_at

    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if not profile:
        profile = Profile(user_id=user.id, dims=ProfileDims().model_dump(), version=1)
        db.add(profile)
        await db.flush()
    old_dims = ProfileDims.model_validate(profile.dims).model_dump()
    dims = ProfileDims.model_validate(profile.dims)
    updated = dims.model_dump()
    updated["knowledge_base"]["subject_prior"] = max(0, min(5, int((score + 10) // 20)))
    previous_topics = [item for item in updated["weak_points"]["topics"] if item not in weak_topics]
    updated["weak_points"]["topics"] = (weak_topics + previous_topics)[:12]
    if weak_topics and "理论概念" not in updated["weak_points"]["error_types"]:
        updated["weak_points"]["error_types"].insert(0, "理论概念")
    updated["theory_assessments"][assessment.role_id] = {
        "assessment_id": assessment.id,
        "role_id": assessment.role_id,
        "role_name": assessment.role_name,
        "course_id": assessment.course_id,
        "score": score,
        "knowledge_level": result["knowledge_level"],
        "competency_scores": competency_scores,
        "weak_topics": weak_topics,
        "source_count": source_count,
        "completed_at": submitted_at.isoformat(),
    }
    db.add(ProfileSnapshot(
        user_id=user.id,
        snapshot=old_dims,
        trigger_event=f"theory_assessment:{assessment.role_id}"[:64],
    ))
    profile.dims = ProfileDims.model_validate(updated).model_dump()
    profile.version += 1
    await db.commit()
    await db.refresh(assessment)
    return _public_assessment(assessment)
