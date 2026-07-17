"""题库测验 API（与工作台临时检测题完全隔离）。

端点：
- POST   /api/quiz-sessions           创建 + 生成全部题（同步返回，2-5 秒）
- GET    /api/quiz-sessions           列表（按 user_id / course_id 过滤）
- GET    /api/quiz-sessions/{id}      详情（含 items）
- POST   /api/quiz-sessions/{id}/submit  一次性提交所有答案 + 评分

设计要点：
- 出题走 quiz_agent.generate_quiz_batch 一次性返回，避免 SSE 在 modal 里复杂化
- 提交：mcq/fill 严格比对；code 按 code_grading 路由 LLM 判分 / 用户自评
- 错题入笔记本：复用现有 /api/notes 端点，前端在结果页发起调用
"""
from __future__ import annotations
import asyncio
import json
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.db.models import QuizSession, QuizSessionItem, Profile
from app.courses import get_course_by_id
from app.agents.quiz_agent import generate_quiz_batch, judge_code_with_llm
from app.quiz import adaptive_error_tags, effective_error_tags, summarize_error_focus


router = APIRouter(prefix="/quiz-sessions", tags=["quiz-sessions"])


class CreateRequest(BaseModel):
    user_id: int = 1
    course_id: int | None = None
    topic: str = "综合复习"
    mcq_count: int = Field(default=5, ge=0, le=20)
    fill_count: int = Field(default=3, ge=0, le=20)
    code_count: int = Field(default=2, ge=0, le=10)
    difficulty: int = Field(default=2, ge=1, le=4)
    mode: Literal["exam", "quest"] = "exam"
    code_grading: Literal["llm", "self"] = "llm"


def _item_to_dict(it: QuizSessionItem) -> dict:
    user_answer = it.user_answer.get("value") if it.user_answer else None
    return {
        "id": it.id,
        "idx": it.idx,
        "type": it.type,
        "question": it.question,
        "options": it.options or [],
        "starter": it.starter or "",
        # 答题中不暴露 answer_key（避免前端泄露），提交后由 /detail 拉到结果
        "answer_key": it.answer_key.get("value") if it.answer_key else None,
        "explanation": it.explanation,
        "difficulty": it.difficulty,
        "user_answer": user_answer,
        "is_correct": it.is_correct,
        "score": it.score,
        "judge_reason": it.judge_reason or "",
        "error_tags": [] if it.is_correct else effective_error_tags(
            question=it.question,
            item_type=it.type,
            user_answer=user_answer,
            judge_reason=it.judge_reason or "",
            stored_tags=it.error_tags or [],
        ),
    }


async def _recent_error_focus(
    db: AsyncSession,
    *,
    user_id: int,
    course_id: int | None,
    limit: int = 120,
) -> list[dict]:
    stmt = (
        select(QuizSessionItem)
        .join(QuizSession, QuizSessionItem.session_id == QuizSession.id)
        .where(
            QuizSession.user_id == user_id,
            QuizSession.status == "submitted",
            QuizSessionItem.is_correct.is_(False),
        )
        .order_by(desc(QuizSession.submitted_at), desc(QuizSessionItem.id))
        .limit(limit)
    )
    if course_id is not None:
        stmt = stmt.where(QuizSession.course_id == course_id)
    rows = (await db.execute(stmt)).scalars().all()
    tag_groups = []
    for item in rows:
        tags = effective_error_tags(
            question=item.question,
            item_type=item.type,
            user_answer=(item.user_answer or {}).get("value"),
            judge_reason=item.judge_reason or "",
            stored_tags=item.error_tags or [],
        )
        tag_groups.append(tags)
    return summarize_error_focus(tag_groups)


def _session_to_dict(s: QuizSession, items: list[QuizSessionItem] | None = None) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "course_id": s.course_id,
        "topic": s.topic,
        "mcq_count": s.mcq_count,
        "fill_count": s.fill_count,
        "code_count": s.code_count,
        "total_count": s.mcq_count + s.fill_count + s.code_count,
        "difficulty": s.difficulty,
        "mode": s.mode,
        "code_grading": s.code_grading,
        "status": s.status,
        "score": s.score,
        "duration_ms": s.duration_ms,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        "items": [_item_to_dict(i) for i in (items or [])],
    }


@router.post("")
async def create_session(req: CreateRequest, db: AsyncSession = Depends(get_db)):
    total = req.mcq_count + req.fill_count + req.code_count
    if total <= 0:
        raise HTTPException(400, "至少要 1 道题")
    if total > 30:
        raise HTTPException(400, "单次出题不超过 30 道")

    # 课程配置
    course_cfg = await get_course_by_id(req.course_id)

    # 画像 → 推荐难度（仅当未显式指定，但接口已默认 2，这里只是给 prompt 多个信号）
    q = await db.execute(select(Profile).where(Profile.user_id == req.user_id))
    p = q.scalar_one_or_none()
    profile_dims = p.dims if p else {}
    _ = profile_dims  # 画像仍用于后续扩展；本轮先把近期错题能力标签注入出题。
    error_focus = await _recent_error_focus(
        db,
        user_id=req.user_id,
        course_id=req.course_id,
    )

    # 创建 session（先 generating）
    session = QuizSession(
        user_id=req.user_id,
        course_id=req.course_id,
        topic=req.topic,
        mcq_count=req.mcq_count,
        fill_count=req.fill_count,
        code_count=req.code_count,
        difficulty=req.difficulty,
        mode=req.mode,
        code_grading=req.code_grading,
        status="generating",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # 出题
    try:
        items = await generate_quiz_batch(
            topic=req.topic,
            course_name=course_cfg.name,
            persona=course_cfg.persona,
            difficulty=req.difficulty,
            mcq_count=req.mcq_count,
            fill_count=req.fill_count,
            code_count=req.code_count,
            focus_tags=[item["tag"] for item in error_focus],
        )
    except asyncio.CancelledError:
        session.status = "error"
        await asyncio.shield(db.commit())
        raise
    except Exception as e:
        session.status = "error"
        await db.commit()
        raise HTTPException(500, f"出题失败：{type(e).__name__}: {e}")

    # 入库 items
    db_items: list[QuizSessionItem] = []
    for i, it in enumerate(items):
        ans_val = it.get("answer")
        db_items.append(
            QuizSessionItem(
                session_id=session.id,
                idx=i,
                type=it.get("type", "mcq"),
                question=it.get("question", ""),
                options=it.get("options") or [],
                starter=it.get("starter") or "",
                answer_key={"value": ans_val},
                explanation=it.get("explanation") or "",
                difficulty=int(it.get("difficulty") or req.difficulty),
            )
        )
    for di in db_items:
        db.add(di)
    session.status = "ready"
    await db.commit()
    await db.refresh(session)

    return _session_to_dict(session, db_items)


@router.get("")
async def list_sessions(
    user_id: int,
    course_id: int | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    # 生成请求被刷新、断网或服务重载打断时，不能让记录永久停留在「出题中」。
    stale_before = datetime.utcnow() - timedelta(minutes=15)
    stale_stmt = select(QuizSession).where(
        QuizSession.user_id == user_id,
        QuizSession.status == "generating",
        QuizSession.created_at < stale_before,
    )
    if course_id is not None:
        stale_stmt = stale_stmt.where(QuizSession.course_id == course_id)
    stale_rows = (await db.execute(stale_stmt)).scalars().all()
    if stale_rows:
        for stale in stale_rows:
            stale.status = "error"
        await db.commit()

    stmt = select(QuizSession).where(QuizSession.user_id == user_id)
    if course_id is not None:
        stmt = stmt.where(QuizSession.course_id == course_id)
    stmt = stmt.order_by(desc(QuizSession.created_at)).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_session_to_dict(s) for s in rows]


@router.get("/recommendation")
async def quiz_recommendation(
    user_id: int,
    course_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    focus = await _recent_error_focus(db, user_id=user_id, course_id=course_id)
    return {
        "focus": focus,
        "message": (
            f"下一轮将优先加入{'、'.join(item['tag'] for item in focus)}的变式练习"
            if focus
            else "完成测验后，系统会根据错题类型自动安排针对性加练"
        ),
    }


@router.get("/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    s = await db.get(QuizSession, session_id)
    if not s:
        raise HTTPException(404, "session not found")
    items_q = await db.execute(
        select(QuizSessionItem)
        .where(QuizSessionItem.session_id == session_id)
        .order_by(QuizSessionItem.idx)
    )
    items = items_q.scalars().all()
    return _session_to_dict(s, items)


class SubmitAnswer(BaseModel):
    item_id: int
    answer: str | int | None = None  # mcq 是 int 索引，fill / code 是字符串
    self_correct: bool | None = None  # code_grading="self" 时用户自评


class SubmitRequest(BaseModel):
    answers: list[SubmitAnswer]
    duration_ms: int = 0


def _normalize(s: str) -> str:
    return s.strip().lower().replace("　", " ")


def _grade_mcq(user_ans, key) -> tuple[bool, float]:
    try:
        return int(user_ans) == int(key), 100.0 if int(user_ans) == int(key) else 0.0
    except (ValueError, TypeError):
        return False, 0.0


def _grade_fill(user_ans, key) -> tuple[bool, float]:
    if user_ans is None:
        return False, 0.0
    ua = _normalize(str(user_ans))
    if not ua:
        return False, 0.0
    # answer_key 可能是 "动量" 或 "动量/momentum"（多个等价答案用 / 分隔）
    keys = [_normalize(k) for k in str(key).split("/") if k.strip()]
    hit = any(ua == k or k in ua or ua in k for k in keys)
    return hit, 100.0 if hit else 0.0


@router.post("/{session_id}/submit")
async def submit_session(
    session_id: int, req: SubmitRequest, db: AsyncSession = Depends(get_db)
):
    s = await db.get(QuizSession, session_id)
    if not s:
        raise HTTPException(404, "session not found")
    if s.status == "submitted":
        raise HTTPException(400, "已提交过")

    items_q = await db.execute(
        select(QuizSessionItem)
        .where(QuizSessionItem.session_id == session_id)
        .order_by(QuizSessionItem.idx)
    )
    items = items_q.scalars().all()
    item_by_id = {i.id: i for i in items}
    answers_by_id = {a.item_id: a for a in req.answers}

    # 准备 code 题异步判分任务
    code_tasks: list[tuple[QuizSessionItem, asyncio.Task]] = []
    course_cfg = await get_course_by_id(s.course_id)

    for it in items:
        sub = answers_by_id.get(it.id)
        if sub is None:
            it.user_answer = {"value": None}
            it.is_correct = False
            it.score = 0.0
            it.error_tags = adaptive_error_tags(
                question=it.question,
                item_type=it.type,
                user_answer=None,
            )
            continue
        key = (it.answer_key or {}).get("value")
        if it.type == "mcq":
            it.user_answer = {"value": sub.answer}
            it.is_correct, it.score = _grade_mcq(sub.answer, key)
        elif it.type == "fill":
            it.user_answer = {"value": sub.answer}
            it.is_correct, it.score = _grade_fill(sub.answer, key)
        elif it.type == "code":
            it.user_answer = {"value": sub.answer or ""}
            if s.code_grading == "self":
                ok = bool(sub.self_correct)
                it.is_correct = ok
                it.score = 100.0 if ok else 0.0
                it.judge_reason = "用户自评"
                it.error_tags = [] if ok else adaptive_error_tags(
                    question=it.question,
                    item_type=it.type,
                    user_answer=sub.answer,
                    judge_reason=it.judge_reason,
                )
            else:
                # 排队走 LLM
                task = asyncio.create_task(
                    judge_code_with_llm(
                        question=it.question,
                        reference=str(key or ""),
                        user_code=str(sub.answer or ""),
                        persona=course_cfg.persona,
                    )
                )
                code_tasks.append((it, task))

        if it.type != "code":
            it.error_tags = [] if it.is_correct else adaptive_error_tags(
                question=it.question,
                item_type=it.type,
                user_answer=sub.answer,
            )

    # 等 code 判分（并发）
    if code_tasks:
        results = await asyncio.gather(*[t for _, t in code_tasks], return_exceptions=True)
        for (it, _), res in zip(code_tasks, results):
            if isinstance(res, Exception):
                it.score = 0.0
                it.is_correct = False
                it.judge_reason = f"判分异常：{type(res).__name__}"
            else:
                score, reason = res
                it.score = score
                it.is_correct = score >= 60
                it.judge_reason = reason
            it.error_tags = [] if it.is_correct else adaptive_error_tags(
                question=it.question,
                item_type=it.type,
                user_answer=(it.user_answer or {}).get("value"),
                judge_reason=it.judge_reason or "",
            )

    total = len(items)
    s.score = round(sum(i.score for i in items) / total, 2) if total else 0.0
    s.duration_ms = max(0, req.duration_ms)
    s.status = "submitted"
    s.submitted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(s)

    return _session_to_dict(s, items)
