"""基于人才呀公开岗位目录生成本地、可解释的职业推荐。"""
from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.courses import get_course_by_id
from app.db import get_db
from app.db.models import Course, Profile, QuizSession, User
from app.deps import require_user
from app.integrations.rencaiya import CAREER_PLATFORM_URL, PROVIDER, get_jobs
from app.schemas.profile import normalize_profile_dims


router = APIRouter(prefix="/careers", tags=["careers"])

SKILL_LABELS = {
    "programming": "编程实现",
    "algorithms": "算法建模",
    "data_ai": "数据与 AI",
    "systems": "系统与网络",
    "engineering": "工程实践",
    "professional": "职业素养",
}

# 公开岗位详情的能力树需要人才呀登录令牌，因此使用稳定、可审计的本地岗位能力模型。
JOB_SKILLS: dict[int, dict[str, int]] = {
    1: {"programming": 2, "algorithms": 1, "data_ai": 1, "systems": 5, "engineering": 5, "professional": 4},
    2: {"programming": 4, "algorithms": 2, "data_ai": 2, "systems": 5, "engineering": 5, "professional": 3},
    3: {"programming": 4, "algorithms": 5, "data_ai": 5, "systems": 2, "engineering": 4, "professional": 3},
    4: {"programming": 4, "algorithms": 5, "data_ai": 5, "systems": 2, "engineering": 4, "professional": 3},
    5: {"programming": 4, "algorithms": 5, "data_ai": 4, "systems": 3, "engineering": 4, "professional": 3},
    6: {"programming": 5, "algorithms": 3, "data_ai": 2, "systems": 3, "engineering": 5, "professional": 4},
    7: {"programming": 5, "algorithms": 2, "data_ai": 1, "systems": 2, "engineering": 5, "professional": 4},
    8: {"programming": 5, "algorithms": 3, "data_ai": 3, "systems": 3, "engineering": 5, "professional": 4},
    9: {"programming": 4, "algorithms": 3, "data_ai": 5, "systems": 4, "engineering": 5, "professional": 3},
    10: {"programming": 4, "algorithms": 3, "data_ai": 2, "systems": 4, "engineering": 5, "professional": 4},
    13: {"programming": 4, "algorithms": 4, "data_ai": 5, "systems": 3, "engineering": 5, "professional": 3},
    18: {"programming": 5, "algorithms": 2, "data_ai": 1, "systems": 2, "engineering": 5, "professional": 4},
}

COURSE_JOB_RELEVANCE: dict[str, dict[int, int]] = {
    "机器学习": {13: 100, 3: 96, 4: 92, 5: 88, 9: 76, 8: 65},
    "数据结构与算法": {5: 100, 8: 88, 6: 85, 10: 76, 7: 70, 13: 68},
    "操作系统": {1: 100, 2: 88, 6: 76, 9: 70, 10: 66, 8: 62},
    "计算机网络": {1: 100, 2: 88, 10: 74, 6: 66, 9: 65, 8: 60},
    "计算机组成原理": {2: 100, 1: 82, 5: 76, 13: 66, 10: 62, 8: 60},
}

JOB_GOAL_KEYWORDS: dict[int, tuple[str, ...]] = {
    1: ("运维", "云计算", "linux", "系统"),
    2: ("物联网", "嵌入式", "硬件", "stm32"),
    3: ("推荐", "推荐系统", "用户画像"),
    4: ("自然语言", "nlp", "大模型", "语言模型"),
    5: ("算法", "建模", "竞赛"),
    6: ("java", "后端", "服务端"),
    7: ("前端", "web", "vue", "react"),
    8: ("python", "应用开发", "自动化"),
    9: ("大数据", "数据开发", "flink", "hadoop"),
    10: ("测试", "质量", "自动化测试"),
    13: ("人工智能", "ai", "机器学习", "应用算法"),
    18: ("移动", "android", "ios", "app开发"),
}


def _course_relevance(post_id: int, current_course: str, history: Iterable[str]) -> float:
    current = float(COURSE_JOB_RELEVANCE.get(current_course, {}).get(post_id, 0))
    historical = max(
        (float(COURSE_JOB_RELEVANCE.get(name, {}).get(post_id, 0)) for name in history),
        default=0.0,
    )
    if historical <= 0:
        return current
    return current * 0.7 + historical * 0.3


def _skill_fit(skills: dict[str, int], required: dict[str, int]) -> float:
    total_weight = sum(required.values()) or 1
    score = 0.0
    for key, need in required.items():
        current = max(float(skills.get(key, 0)), 0.0)
        score += min(current / max(float(need), 1.0), 1.0) * need
    return score / total_weight * 100


def _goal_fit(post_id: int, goal_text: str) -> float:
    normalized = goal_text.lower()
    if not normalized.strip():
        return 0.0
    keywords = JOB_GOAL_KEYWORDS.get(post_id, ())
    return 100.0 if any(keyword.lower() in normalized for keyword in keywords) else 0.0


def _match_score(skill: float, course: float, goal: float, has_skills: bool, has_goal: bool) -> int:
    if has_skills and has_goal:
        value = skill * 0.45 + course * 0.40 + goal * 0.15
    elif has_skills:
        value = skill * (45 / 85) + course * (40 / 85)
    elif has_goal:
        value = course * 0.80 + goal * 0.20
    else:
        value = course
    return max(0, min(100, round(value)))


def _strengths_and_gaps(skills: dict[str, int], required: dict[str, int]) -> tuple[list[str], list[str]]:
    ranked = sorted(
        required,
        key=lambda key: (float(skills.get(key, 0)) / max(required[key], 1), skills.get(key, 0)),
        reverse=True,
    )
    strengths = [SKILL_LABELS[key] for key in ranked if skills.get(key, 0) > 0][:2]
    gaps = sorted(
        required,
        key=lambda key: required[key] - skills.get(key, 0),
        reverse=True,
    )
    gaps = [SKILL_LABELS[key] for key in gaps if required[key] > skills.get(key, 0)][:2]
    return strengths, gaps


@router.get("/recommendations")
async def career_recommendations(
    course_id: int | None = None,
    limit: int = Query(default=3, ge=1, le=5),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    current_course = await get_course_by_id(course_id)
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    dims = normalize_profile_dims(profile.dims if profile else None)
    skills = dims["employment_skills"]
    goals = dims.get("goals") or {}
    goal_text = " ".join([
        str(goals.get("primary") or ""),
        *[str(item) for item in goals.get("target_topics") or []],
    ])

    history_rows = (
        await db.execute(
            select(Course.name)
            .join(QuizSession, QuizSession.course_id == Course.id)
            .where(
                QuizSession.user_id == user.id,
                QuizSession.status == "submitted",
            )
            .order_by(desc(QuizSession.submitted_at))
            .limit(30)
        )
    ).scalars().all()
    history = list(dict.fromkeys(name for name in history_rows if name != current_course.name))

    source_state, jobs = await get_jobs()
    has_skills = any(value > 0 for value in skills.values())
    has_goal = bool(goal_text.strip())
    ranked: list[dict] = []
    for job in jobs:
        post_id = int(job["post_id"])
        required = JOB_SKILLS.get(post_id)
        if not required:
            continue
        course_score = _course_relevance(post_id, current_course.name, history)
        if course_score <= 0 and not has_goal:
            continue
        skill_score = _skill_fit(skills, required)
        goal_score = _goal_fit(post_id, goal_text)
        strengths, gaps = _strengths_and_gaps(skills, required)
        ranked.append({
            "post_id": post_id,
            "title": job["title"],
            "summary": job["summary"],
            "course_count": job["course_count"],
            "project_count": job["project_count"],
            "learned_person": job["learned_person"],
            "match_score": _match_score(skill_score, course_score, goal_score, has_skills, has_goal),
            "strengths": strengths,
            "gaps": gaps,
            "provider": PROVIDER,
            "url": job["url"],
        })
    ranked.sort(key=lambda item: (item["match_score"], item["course_count"]), reverse=True)
    return {
        "provider": PROVIDER,
        "source_state": source_state,
        "platform_url": CAREER_PLATFORM_URL,
        "current_course": current_course.name,
        "historical_courses": history[:5],
        "employment_skills": skills,
        "evidence_note": (
            "岗位匹配综合就业技能、当前目标岗位、已提交测验证据和岗位目标。"
            if has_skills
            else "就业技能尚待补充，当前主要依据目标岗位和画像目标推荐。"
        ),
        "items": ranked[:limit],
    }
