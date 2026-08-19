"""学习工作台 API：一键触发多 Agent 协同生成全套资源。"""
from __future__ import annotations
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.agents.arbiter_agent import ArbiterAgent
from app.agents.diagnosis_agent import DiagnosisAgent
from app.agents.doc_agent import DocAgent
from app.agents.mindmap_agent import MindMapAgent
from app.agents.practice_guide_agent import PracticeGuideAgent
from app.agents.quiz_agent import QuizAgent, generate_quiz_batch
from app.agents.reading_agent import ReadingAgent
from app.agents.code_agent import CodeAgent
from app.agents.orchestrator import TrainingLoopOrchestrator, serialize_event
from app.agents.planning_agents import DomainExpertAgent, LearningStrategyAgent, PlanArbiterAgent
from app.agents.review_agents import EvidenceReviewAgent, PracticeReviewAgent, DifficultyReviewAgent
from app.courses import get_course_by_id
from app.db import async_session_maker
from app.db.models import Profile, Resource, LearningPath, TrainingRun, User
from app.deps import require_user
from app.training import resolve_training_role

router = APIRouter(prefix="/workspace", tags=["workspace"])


class GenerateRequest(BaseModel):
    user_id: int = 1
    topic: str
    course_id: int | None = None   # 多课程隔离；None 时不过滤
    persist: bool = True   # 是否把结果写入 resources 表


def _build_orchestrator() -> TrainingLoopOrchestrator:
    return TrainingLoopOrchestrator(
        diagnosis_agent=DiagnosisAgent(),
        planning_agents=[DomainExpertAgent(), LearningStrategyAgent()],
        plan_arbiter=PlanArbiterAgent(),
        # 六类岗位资源统一进入审核与发布门禁；不恢复独立学习路径生成器。
        generators=[
            DocAgent(),
            PracticeGuideAgent(),
            QuizAgent(),
            MindMapAgent(),
            ReadingAgent(),
            CodeAgent(),
        ],
        reviewers=[EvidenceReviewAgent(), PracticeReviewAgent(), DifficultyReviewAgent()],
        arbiter=ArbiterAgent(),
    )


@router.get("/role-context")
async def role_context(course_id: int | None = None) -> dict:
    """返回当前知识领域对应的目标岗位与核心能力。"""
    course_cfg = await get_course_by_id(course_id)
    return resolve_training_role(course_cfg.name)


@router.post("/generate")
async def generate(req: GenerateRequest, user: User = Depends(require_user)):
    """SSE 流式执行岗位训练闭环，并在裁决通过后发布资源。"""
    orchestrator = _build_orchestrator()
    run_id = str(uuid.uuid4())

    # 加载画像
    profile_dims: dict = {}
    previous_feedback: dict = {}
    training_cycle = 1
    async with async_session_maker() as db:
        q = await db.execute(select(Profile).where(Profile.user_id == user.id))
        profile = q.scalar_one_or_none()
        if profile:
            profile_dims = profile.dims or {}
        previous_runs = (await db.scalars(
            select(TrainingRun)
            .where(TrainingRun.user_id == user.id, TrainingRun.course_id == req.course_id)
            .order_by(TrainingRun.updated_at.desc())
            .limit(8)
        )).all()
        previous = next((item for item in previous_runs if item.feedback), None)
        if previous:
            previous_feedback = previous.feedback or {}
            training_cycle = 1 + sum(1 for item in previous_runs if item.feedback)

    # 拉课程配置（registry 兜底默认机器学习）
    course_cfg = await get_course_by_id(req.course_id)
    role = resolve_training_role(course_cfg.name)

    async with async_session_maker() as db:
        db.add(TrainingRun(
            id=run_id,
            user_id=user.id,
            course_id=req.course_id,
            domain=role["domain"],
            target_role=role["target_role"],
            topic=req.topic,
            status="running",
            stage="diagnosis",
        ))
        await db.commit()

    initial_ctx = {
        "user_id": user.id,
        "run_id": run_id,
        "topic": req.topic,
        "course_id": req.course_id,
        "course_name": course_cfg.name,
        "course_cfg": course_cfg,
        "profile": profile_dims,
        "previous_feedback": previous_feedback,
        "training_cycle": training_cycle,
        **role,
        "generation_round": 1,
    }

    async def gen():
        outputs: dict = {}
        result_data: dict = {}
        failure_message = ""
        async for event in orchestrator.stream(initial_ctx):
            if event["event"] == "done":
                result_data = event["data"]
                outputs = result_data.get("outputs", {})
            elif event["event"] == "error":
                failure_message = str(event["data"].get("message") or "自动训练闭环执行失败")
            yield serialize_event(event)

        # 完成后保存完整审计记录；仅裁决发布的资源进入正式资源表。
        if result_data:
            async with async_session_maker() as db:
                run = await db.get(TrainingRun, run_id)
                if run:
                    run.stage = result_data.get("stage", "failed")
                    run.status = "published" if result_data.get("decision", {}).get("decision") == "publish" else "failed"
                    run.generation_round = int(result_data.get("generation_round", 1))
                    run.diagnosis = result_data.get("diagnosis", {})
                    run.outputs = outputs
                    run.reviews = result_data.get("reviews", {})
                    run.decision = result_data.get("decision", {})

                if req.persist and outputs and result_data.get("decision", {}).get("decision") == "publish":
                    for agent_id, out in outputs.items():
                        if not isinstance(out, dict):
                            continue
                        out_type = out.get("type", agent_id)
                        if out_type in {"diagnosis", "review", "decision", "retriever"}:
                            continue
                        # path 单独写 learning_paths 表
                        if out_type == "path":
                            db.add(LearningPath(
                                user_id=user.id,
                                course_id=req.course_id,
                                nodes=out.get("nodes", []),
                                edges=out.get("edges", []),
                                status="active",
                            ))
                            continue
                        # 不同类型 content 字段语义不同，统一用 JSON 序列化非 markdown 类型
                        if out_type == "quiz":
                            content_str = json.dumps(out.get("items", []), ensure_ascii=False)
                            citations = out.get("citations", [])
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
                            user_id=user.id,
                            course_id=req.course_id,
                            type=out_type,
                            title=out.get("title", agent_id),
                            content=content_str,
                            citations=citations,
                            agent_id=agent_id,
                            ai_generated=True,
                        ))
                await db.commit()
        elif failure_message:
            async with async_session_maker() as db:
                run = await db.get(TrainingRun, run_id)
                if run:
                    run.stage = "failed"
                    run.status = "failed"
                    run.generation_round = int(initial_ctx.get("generation_round", 1))
                    run.decision = {
                        "decision": "failed",
                        "summary": failure_message,
                        "published": False,
                    }
                await db.commit()

    # 长时间的模型生成可能暂时没有业务事件；更短的心跳能避免开发代理把 SSE 误判为断线。
    return EventSourceResponse(gen(), ping=5)


class TrainingFeedbackRequest(BaseModel):
    run_id: str
    attempts: list[dict] = Field(default_factory=list)
    time_spent_min: int = Field(default=0, ge=0, le=1440)
    satisfaction: int | None = Field(default=None, ge=1, le=5)


@router.post("/feedback")
async def submit_training_feedback(
    req: TrainingFeedbackRequest,
    user: User = Depends(require_user),
) -> dict:
    """把学习表现写回本轮记录，并给出下一轮画像/资源策略。"""
    async with async_session_maker() as db:
        run = await db.scalar(select(TrainingRun).where(
            TrainingRun.id == req.run_id,
            TrainingRun.user_id == user.id,
        ))
        if run is None:
            raise HTTPException(status_code=404, detail="训练记录不存在")
        if (run.decision or {}).get("decision") != "publish":
            raise HTTPException(status_code=409, detail="资源尚未发布，不能进入学习反馈")

        answered = [item for item in req.attempts if "correct" in item]
        correct = sum(1 for item in answered if bool(item.get("correct")))
        accuracy = round(correct / len(answered) * 100) if answered else None
        wrong_items = [str(item.get("question_id", "")) for item in answered if not item.get("correct")]
        if accuracy is None:
            next_action = "collect_more_evidence"
            message = "先完成分阶测试，系统再据此调整画像与下一轮资源难度"
        elif accuracy < 60:
            next_action = "prerequisite_repair"
            message = "下一轮降低一级难度，优先修复前置知识与错误步骤"
        elif accuracy < 85:
            next_action = "targeted_practice"
            message = "保持当前难度，围绕错题能力点生成变式实操与测试"
        else:
            next_action = "advanced_challenge"
            message = "下一轮提升一级难度，并增加更接近真实岗位的综合任务"

        result = {
            "run_id": run.id,
            "accuracy": accuracy,
            "answered_count": len(answered),
            "wrong_items": wrong_items,
            "next_action": next_action,
            "message": message,
            "profile_update": {
                "evidence_source": "岗位分阶测试",
                "suggested_difficulty_delta": -1 if accuracy is not None and accuracy < 60 else 1 if accuracy is not None and accuracy >= 85 else 0,
                "confidence_delta": 0.08 if answered else 0,
            },
        }
        run.feedback = {**result, "time_spent_min": req.time_spent_min, "satisfaction": req.satisfaction}
        run.stage = "feedback_updated"
        run.status = "feedback_updated"
        await db.commit()
        return result


@router.get("/runs/{run_id}")
async def get_training_run(run_id: str, user: User = Depends(require_user)) -> dict:
    async with async_session_maker() as db:
        run = await db.scalar(select(TrainingRun).where(
            TrainingRun.id == run_id,
            TrainingRun.user_id == user.id,
        ))
        if run is None:
            raise HTTPException(status_code=404, detail="训练记录不存在")
        return {
            "run_id": run.id,
            "domain": run.domain,
            "target_role": run.target_role,
            "topic": run.topic,
            "status": run.status,
            "stage": run.stage,
            "generation_round": run.generation_round,
            "diagnosis": run.diagnosis,
            "outputs": run.outputs,
            "reviews": run.reviews,
            "decision": run.decision,
            "feedback": run.feedback,
        }


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
