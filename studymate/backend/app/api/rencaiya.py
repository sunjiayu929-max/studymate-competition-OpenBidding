"""讯飞人才呀外部课程资源。"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.courses import get_course_by_id
from app.integrations.rencaiya import COURSE_PLATFORM_URL, PROVIDER, get_courses


router = APIRouter(prefix="/rencaiya", tags=["rencaiya"])


@router.get("/courses")
async def rencaiya_courses(
    course_id: int | None = None,
    keyword: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=6, ge=1, le=8),
):
    course = await get_course_by_id(course_id)
    source_state, match_level, resolved_query, items = await get_courses(course.name, limit, keyword)
    return {
        "provider": PROVIDER,
        "source_state": source_state,
        "course_name": course.name,
        "match_level": match_level,
        "resolved_query": resolved_query,
        "platform_url": COURSE_PLATFORM_URL,
        "items": items,
    }
