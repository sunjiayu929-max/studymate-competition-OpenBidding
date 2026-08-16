"""课程管理 API。

多课程架构基础：评委可在首页选择课程（机器学习 / 数据结构 / 概率论…），
进入工作台后所有 Agent 检索 / 落库都按 course_id 隔离。

端点：
- GET    /api/courses              列表（含 chunk_count）
- POST   /api/courses               新增
- DELETE /api/courses/{id}          删除（同时清掉该课的 chunks，BM25 索引重建）
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.courses import get_course_by_name, list_course_names
from app.db import get_db
from app.db.models import Course, KnowledgeChunk

router = APIRouter(prefix="/courses", tags=["courses"])

VISIBLE_COURSE_NAMES = {
    "机器学习",
    "数据结构与算法",
    "操作系统",
    "计算机网络",
    "计算机组成原理",
    "FDE 岗位知识库",
}


class CourseIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""


@router.get("")
async def list_courses(db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Course).order_by(Course.id))
    courses = [c for c in q.scalars().all() if c.name in VISIBLE_COURSE_NAMES]

    # 统计每课 chunk 数
    cnt_q = await db.execute(
        select(KnowledgeChunk.course_id, func.count(KnowledgeChunk.id))
        .group_by(KnowledgeChunk.course_id)
    )
    counts = {cid: n for cid, n in cnt_q.all()}

    items = [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description or "",
            "chunk_count": counts.get(c.id, 0),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in courses
    ]
    return {"count": len(items), "items": items}


@router.post("")
async def create_course(req: CourseIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(405, "课程空间已固定为五门预设课程，不支持新增")


@router.get("/registry")
async def list_registry():
    """返回所有 registry 中预设课程的配置，供前端在新建课程页 / 课程墙做参考。"""
    return {
        "courses": [
            {
                "name": name,
                "persona": cfg.persona,
                "code_style": cfg.code_style,
                "syllabus_hint": cfg.syllabus_hint,
                "sample_topics": cfg.sample_topics,
            }
            for name in list_course_names()
            for cfg in [get_course_by_name(name)]
        ]
    }


@router.get("/{course_id}/config")
async def get_course_config_endpoint(course_id: int, db: AsyncSession = Depends(get_db)):
    """前端按 currentCourse.id 拉这门课的运行时配置（示例题 / 阅读源 / persona）。"""
    c = await db.get(Course, course_id)
    if not c:
        raise HTTPException(404, f"course {course_id} not found")
    cfg = get_course_by_name(c.name)
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description or "",
        "persona": cfg.persona,
        "code_style": cfg.code_style,
        "code_libs": cfg.code_libs,
        "reading_sources": cfg.reading_sources,
        "sample_topics": cfg.sample_topics,
        "sample_questions": cfg.sample_questions,
        "syllabus_hint": cfg.syllabus_hint,
        "from_registry": c.name in list_course_names(),
    }


@router.delete("/{course_id}")
async def delete_course(course_id: int, db: AsyncSession = Depends(get_db)):
    raise HTTPException(405, "预设课程不支持删除")
