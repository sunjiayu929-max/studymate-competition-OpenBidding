"""学习工作台 API：一键触发多 Agent 协同生成全套资源。"""
from __future__ import annotations
import json
import uuid
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.agents.base import AgentMeta
from app.agents.doc_agent import DocAgent
from app.agents.mindmap_agent import MindMapAgent
from app.agents.quiz_agent import QuizAgent, generate_quiz_batch
from app.agents.path_agent import PathAgent
from app.agents.reading_agent import ReadingAgent
from app.agents.code_agent import CodeAgent
from app.agents.orchestrator import Orchestrator, serialize_event
from app.courses import get_course_by_id
from app.db import async_session_maker
from app.db.models import Profile, Resource, LearningPath

router = APIRouter(prefix="/workspace", tags=["workspace"])


class GenerateRequest(BaseModel):
    user_id: int = 1
    topic: str
    course_id: int | None = None   # 多课程隔离；None 时不过滤
    persist: bool = True   # 是否把结果写入 resources 表


RETRIEVER_META = AgentMeta(
    id="retriever",
    name="检索 Agent",
    icon="🔎",
    color="sky",
    description="RAG 检索相关知识源",
)


def _build_orchestrator() -> Orchestrator:
    return Orchestrator(
        retriever_meta=RETRIEVER_META,
        agents=[DocAgent(), MindMapAgent(), QuizAgent(), ReadingAgent(), CodeAgent(), PathAgent()],
    )


@router.post("/generate")
async def generate(req: GenerateRequest):
    """SSE 流式触发多 Agent 协同生成。
    事件：meta / agent_status / agent_delta / agent_done / log / done / error
    """
    orchestrator = _build_orchestrator()

    # 加载画像
    profile_dims: dict = {}
    async with async_session_maker() as db:
        q = await db.execute(select(Profile).where(Profile.user_id == req.user_id))
        profile = q.scalar_one_or_none()
        if profile:
            profile_dims = profile.dims or {}

    # 拉课程配置（registry 兜底默认机器学习）
    course_cfg = await get_course_by_id(req.course_id)

    initial_ctx = {
        "user_id": req.user_id,
        "topic": req.topic,
        "course_id": req.course_id,
        "course_name": course_cfg.name,
        "course_cfg": course_cfg,
        "profile": profile_dims,
    }

    async def gen():
        outputs: dict = {}
        async for event in orchestrator.stream(initial_ctx):
            if event["event"] == "done":
                outputs = event["data"].get("outputs", {})
            yield serialize_event(event)

        # 完成后落库
        if req.persist and outputs:
            try:
                async with async_session_maker() as db:
                    for agent_id, out in outputs.items():
                        if not isinstance(out, dict):
                            continue
                        out_type = out.get("type", agent_id)
                        # path 单独写 learning_paths 表
                        if out_type == "path":
                            db.add(LearningPath(
                                user_id=req.user_id,
                                course_id=req.course_id,
                                nodes=out.get("nodes", []),
                                edges=out.get("edges", []),
                                status="active",
                            ))
                            continue
                        # 不同类型 content 字段语义不同，统一用 JSON 序列化非 markdown 类型
                        if out_type == "quiz":
                            content_str = json.dumps(out.get("items", []), ensure_ascii=False)
                            citations = []
                        elif out_type == "reading":
                            content_str = json.dumps(out.get("items", []), ensure_ascii=False)
                            citations = []
                        elif out_type == "code":
                            content_str = json.dumps({
                                "language": out.get("language", "python"),
                                "filename": out.get("filename", ""),
                                "code": out.get("code", ""),
                                "explanation": out.get("explanation", ""),
                                "expected_output": out.get("expected_output", ""),
                            }, ensure_ascii=False)
                            citations = []
                        else:
                            content_str = out.get("content", "")
                            citations = out.get("citations", [])
                        db.add(Resource(
                            user_id=req.user_id,
                            course_id=req.course_id,
                            type=out_type,
                            title=out.get("title", agent_id),
                            content=content_str,
                            citations=citations,
                            agent_id=agent_id,
                            ai_generated=True,
                        ))
                    await db.commit()
            except Exception:
                pass

    return EventSourceResponse(gen())


# ============================================================
# 追加测验题：用户在工作台点「再出 N 题」时调用
# 不走 SSE，直接 POST 返回完整 items（一次 LLM 调用同步出齐）
# ============================================================


class AppendQuizRequest(BaseModel):
    user_id: int = 1
    topic: str
    course_id: int | None = None
    mcq: int = Field(default=3, ge=0, le=20)
    fill: int = Field(default=1, ge=0, le=10)
    code: int = Field(default=1, ge=0, le=5)
    difficulty: int = Field(default=2, ge=1, le=4)


class AppendQuizResponse(BaseModel):
    items: list[dict]
    count: int


@router.post("/append-quiz", response_model=AppendQuizResponse)
async def append_quiz(req: AppendQuizRequest) -> AppendQuizResponse:
    """复用 generate_quiz_batch,按指定数量出题（默认 3 mcq + 1 fill + 1 code = 5 题）"""
    course_cfg = await get_course_by_id(req.course_id)
    items = await generate_quiz_batch(
        topic=req.topic,
        course_name=course_cfg.name,
        persona=course_cfg.persona,
        difficulty=req.difficulty,
        mcq_count=req.mcq,
        fill_count=req.fill,
        code_count=req.code,
    )
    # 强制每题带唯一 id（前端 React key 需要;LLM 可能返回重复 id）
    for it in items:
        if not it.get("id"):
            it["id"] = f"more_{uuid.uuid4().hex[:8]}"
        else:
            # 即使 LLM 给了 id,也加随机后缀防与既有题目冲撞
            it["id"] = f"{it['id']}_{uuid.uuid4().hex[:4]}"
    return AppendQuizResponse(items=items, count=len(items))
