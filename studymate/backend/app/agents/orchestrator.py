"""
多 Agent 编排器。
状态机风格：retrieve → [doc, guide, quiz, mindmap, reading, code]（并发）→ done

事件协议（推送给前端 SSE）：
  meta            首次发，包含所有 Agent 元数据
  agent_status    {agent, status: pending|running|streaming|done|error, ...}
  agent_delta     {agent, kind: text|json|markdown, delta: str}
  agent_done      {agent, output: dict}
  log             {message, agent?, level}      普通日志，前端可显示协作过程
  done            整体完成
  error           整体失败
"""
from __future__ import annotations
import asyncio
import json
from typing import AsyncIterator

from app.agents.base import AgentBase, AgentMeta
from app.rag import get_rag_service


class Orchestrator:
    def __init__(self, retriever_meta: AgentMeta, agents: list[AgentBase]):
        self.retriever_meta = retriever_meta  # 检索"Agent"是一个伪 Agent，用于可视化
        self.agents = agents

    def all_metas(self) -> list[dict]:
        return [
            {
                "id": self.retriever_meta.id,
                "name": self.retriever_meta.name,
                "icon": self.retriever_meta.icon,
                "color": self.retriever_meta.color,
                "description": self.retriever_meta.description,
            },
            *[
                {
                    "id": a.meta.id,
                    "name": a.meta.name,
                    "icon": a.meta.icon,
                    "color": a.meta.color,
                    "description": a.meta.description,
                }
                for a in self.agents
            ],
        ]

    async def stream(self, initial_context: dict) -> AsyncIterator[dict]:
        """yield SSE 事件，每个事件是 {event, data} 字典。"""
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        # 给所有 Agent 一个统一的 emit 接口
        async def emit(event_type: str, data: dict):
            await queue.put({"event": event_type, "data": data})

        # 启动主任务
        main_task = asyncio.create_task(self._run_pipeline(initial_context, emit, queue))

        # yield 队列里的事件，直到主任务完成
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

        await main_task

    async def _run_pipeline(self, ctx: dict, emit, queue):
        try:
            # 1) 发送 meta
            await emit("meta", {
                "agents": self.all_metas(),
                "topic": ctx.get("topic", ""),
                "user_id": ctx.get("user_id"),
            })

            # 2) 所有 Agent 初始 pending
            for m in self.all_metas():
                await emit("agent_status", {"agent": m["id"], "status": "pending"})

            # 3) 检索阶段（不算真 Agent，但 UI 上当作 Agent）
            await emit("agent_status", {
                "agent": self.retriever_meta.id,
                "status": "running",
                "message": "检索知识库...",
            })
            rag = get_rag_service()
            course_id = ctx.get("course_id")
            chunks = await rag.search(ctx["topic"], k=6, course_id=course_id)
            ctx["chunks"] = chunks
            course_tag = f"（course={course_id}）" if course_id else ""
            await emit("log", {
                "message": f"RAG 检索{course_tag} → 命中 {len(chunks)} 个 chunk",
                "agent": self.retriever_meta.id,
            })
            await emit("agent_done", {
                "agent": self.retriever_meta.id,
                "output": {"chunks": chunks},
            })
            await emit("agent_status", {"agent": self.retriever_meta.id, "status": "done"})

            # 4) 并发跑所有资源 Agent
            tasks = [asyncio.create_task(self._wrap_run(agent, ctx, emit)) for agent in self.agents]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 5) 合并结果
            for agent, result in zip(self.agents, results):
                if isinstance(result, Exception):
                    await emit("log", {
                        "message": f"{agent.meta.name} 异常: {result}",
                        "agent": agent.meta.id,
                        "level": "error",
                    })
                else:
                    ctx.setdefault("outputs", {})[agent.meta.id] = result

            # 6) 整体 done
            await emit("done", {"outputs": ctx.get("outputs", {})})
        except Exception as e:
            await emit("error", {"message": str(e)})
        finally:
            await queue.put(None)

    async def _wrap_run(self, agent: AgentBase, ctx: dict, emit) -> dict:
        try:
            await agent.emit_status(emit, "running")
            output = await agent.run(ctx, emit)
            await agent.emit_done(emit, output)
            await agent.emit_status(emit, "done")
            return output
        except Exception as e:
            await agent.emit_status(emit, "error", message=str(e))
            raise


class TrainingLoopOrchestrator:
    """岗位训练闭环：诊断 → 生成 → 审核 → 裁决/返工 → 发布。"""

    MAX_REWORK_ATTEMPTS = 3

    def __init__(
        self,
        diagnosis_agent: AgentBase,
        planning_agents: list[AgentBase],
        plan_arbiter: AgentBase,
        generators: list[AgentBase],
        reviewers: list[AgentBase],
        arbiter: AgentBase,
    ):
        self.diagnosis_agent = diagnosis_agent
        self.planning_agents = planning_agents
        self.plan_arbiter = plan_arbiter
        self.generators = generators
        self.reviewers = reviewers
        self.arbiter = arbiter

    def all_metas(self) -> list[dict]:
        agents = [self.diagnosis_agent, *self.planning_agents, self.plan_arbiter, *self.generators, *self.reviewers, self.arbiter]
        return [
            {
                "id": agent.meta.id,
                "name": agent.meta.name,
                "icon": agent.meta.icon,
                "color": agent.meta.color,
                "description": agent.meta.description,
            }
            for agent in agents
        ]

    async def stream(self, initial_context: dict) -> AsyncIterator[dict]:
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        async def emit(event_type: str, data: dict):
            await queue.put({"event": event_type, "data": data})

        main_task = asyncio.create_task(self._run_pipeline(initial_context, emit, queue))
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
        await main_task

    async def _run_pipeline(self, ctx: dict, emit, queue):
        try:
            ctx.setdefault("debates", [])
            ctx.setdefault("planning_round", 1)
            ctx.setdefault("generation_round", 1)
            await emit("meta", {
                "agents": self.all_metas(),
                "topic": ctx.get("topic", ""),
                "user_id": ctx.get("user_id"),
                "run_id": ctx.get("run_id"),
                "domain": ctx.get("domain", ""),
                "target_role": ctx.get("target_role", ""),
                "role_summary": ctx.get("role_summary", ""),
                "core_competencies": ctx.get("core_competencies", []),
            })
            for meta in self.all_metas():
                await emit("agent_status", {"agent": meta["id"], "status": "pending"})

            await self._stage(emit, "diagnosis", "依据画像确定训练目标与资源难度", ctx)
            diagnosis = await self._wrap_run(self.diagnosis_agent, ctx, emit)
            ctx["diagnosis"] = diagnosis
            ctx.setdefault("outputs", {})["diagnosis"] = diagnosis

            await self._stage(emit, "retrieval", "检索岗位领域知识库并建立证据包", ctx)
            chunks = await get_rag_service().search(
                ctx.get("topic", "岗位任务"),
                k=6,
                course_id=ctx.get("course_id"),
            )
            ctx["chunks"] = chunks
            ctx.setdefault("outputs", {})["retriever"] = {"chunks": chunks}
            await emit("agent_done", {"agent": "retriever", "output": {"chunks": chunks}})
            await emit("log", {
                "message": f"岗位知识检索命中 {len(chunks)} 个可追溯片段",
                "agent": "diagnosis",
            })

            training_plan, planning_exhausted = await self._run_planning_debate(ctx, emit)
            if planning_exhausted:
                failed = self._failed_decision(
                    phase="planning",
                    summary="训练计划经过 3 次返工仍未通过仲裁，已保留真实结果并停止发布",
                    generation_round=int(ctx.get("generation_round", 1)),
                    required_fixes=training_plan.get("required_fixes") or [],
                )
                ctx["decision"] = failed
                await emit("decision", failed)
                await self._stage(emit, "failed", failed["summary"], ctx)
                await self._emit_done(ctx, emit)
                return

            await self._run_generation(ctx, emit, self.generators)
            await self._run_reviews(ctx, emit)
            await self._record_resource_debate(ctx, emit)
            decision = await self._run_arbiter(ctx, emit)

            resource_rework_count = 0
            while decision.get("decision") == "rework":
                targets = set(decision.get("rework_targets") or [])
                if not targets:
                    targets = {agent.meta.id for agent in self.generators}
                if resource_rework_count >= self.MAX_REWORK_ATTEMPTS:
                    failed = {
                        **decision,
                        "decision": "failed",
                        "summary": "资源经过 3 次返工仍未达到发布门槛，已保留真实指标并停止发布",
                        "rework_targets": [],
                        "max_reworks_reached": True,
                        "published": False,
                    }
                    ctx["decision"] = failed
                    await emit("rework_exhausted", {
                        "phase": "resource",
                        "rework_count": resource_rework_count,
                        "summary": failed["summary"],
                        "decision": failed,
                    })
                    await emit("decision", failed)
                    await self._stage(emit, "failed", failed["summary"], ctx)
                    await self._emit_done(ctx, emit)
                    return

                resource_rework_count += 1
                await self._stage(emit, "rework", f"资源辩论未通过，开始第 {resource_rework_count} / 3 次定向返工", ctx)
                await emit("rework", {
                    "phase": "resource",
                    "rework_attempt": resource_rework_count,
                    "generation_round": ctx.get("generation_round", 1),
                    "targets": sorted(targets),
                    "required_fixes": decision.get("required_fixes", []),
                })
                ctx["revision_feedback"] = self._feedback_by_target(ctx.get("reviews", {}))
                ctx["generation_round"] = int(ctx.get("generation_round", 1)) + 1
                retry_agents = [agent for agent in self.generators if agent.meta.id in targets]
                await self._run_generation(ctx, emit, retry_agents)
                await self._run_reviews(ctx, emit)
                await self._record_resource_debate(ctx, emit)
                decision = await self._run_arbiter(ctx, emit)

            await self._stage(emit, "publishing", "七类岗位资源已通过裁决，准备发布资源包", ctx)
            await self._stage(emit, "published", "资源包已发布，可进入学习与反馈", ctx)

            await self._emit_done(ctx, emit)
        except Exception as exc:
            await emit("error", {"message": str(exc)})
        finally:
            await queue.put(None)

    async def _stage(self, emit, stage: str, message: str, ctx: dict):
        ctx["stage"] = stage
        await emit("stage", {
            "stage": stage,
            "message": message,
            "generation_round": ctx.get("generation_round", 1),
        })

    async def _run_generation(self, ctx: dict, emit, agents: list[AgentBase]):
        await self._stage(emit, "generation", f"第 {ctx.get('generation_round', 1)} 轮岗位资源生成", ctx)
        results = await asyncio.gather(
            *(self._wrap_run(agent, ctx, emit) for agent in agents),
            return_exceptions=True,
        )
        for agent, result in zip(agents, results):
            if isinstance(result, Exception):
                await emit("log", {
                    "message": f"{agent.meta.name} 异常：{result}",
                    "agent": agent.meta.id,
                    "level": "error",
                })
            else:
                ctx.setdefault("outputs", {})[agent.meta.id] = result

    async def _run_reviews(self, ctx: dict, emit):
        await self._stage(emit, "review", "三类审核并行交叉验证七类生成结果", ctx)
        results = await asyncio.gather(
            *(self._wrap_run(agent, ctx, emit) for agent in self.reviewers),
            return_exceptions=True,
        )
        reviews: dict[str, dict] = {}
        for agent, result in zip(self.reviewers, results):
            if isinstance(result, Exception):
                reviews[agent.meta.id] = {
                    "type": "review",
                    "reviewer": agent.meta.name,
                    "status": "fail",
                    "score": 0,
                    "decision": "rework",
                    "target_agent": self._review_target(agent.meta.id),
                    "metrics": {},
                    "findings": [{
                        "severity": "blocker",
                        "message": f"审核执行异常：{result}",
                        "suggestion": "重新执行对应资源生成与交叉审核",
                        "target_agent": self._review_target(agent.meta.id),
                    }],
                }
            else:
                reviews[agent.meta.id] = result
        ctx["reviews"] = reviews

    async def _run_planning_debate(self, ctx: dict, emit) -> tuple[dict, bool]:
        rework_count = 0
        while True:
            await self._stage(emit, "planning", "第一次辩论：领域专家与教学策略 Agent 独立提案", ctx)
            planning_results = await asyncio.gather(
                *(self._wrap_run(agent, ctx, emit) for agent in self.planning_agents),
                return_exceptions=True,
            )
            proposals: dict[str, dict] = {}
            for agent, result in zip(self.planning_agents, planning_results):
                if isinstance(result, Exception):
                    raise RuntimeError(f"{agent.meta.name} 提案失败：{result}") from result
                proposals[agent.meta.id] = result
                ctx.setdefault("outputs", {})[agent.meta.id] = result
            ctx["planning_proposals"] = proposals

            await self._stage(emit, "plan_decision", "训练计划仲裁 Agent 正在裁决双方分歧与返工要求", ctx)
            training_plan = await self._wrap_run(self.plan_arbiter, ctx, emit)
            ctx["training_plan"] = training_plan
            ctx.setdefault("outputs", {})["training_plan"] = training_plan
            debate = {
                "phase": "planning",
                "round": int(ctx.get("planning_round", 1)),
                "title": "第一次辩论 · 训练计划协商",
                "participants": ["domain_expert", "learning_strategy", "plan_arbiter"],
                "positions": {
                    "domain_expert": proposals.get("domain_expert", {}).get("position", ""),
                    "learning_strategy": proposals.get("learning_strategy", {}).get("position", ""),
                },
                "conflict": (training_plan.get("debate") or {}).get("conflict", ""),
                "resolution": (training_plan.get("debate") or {}).get("resolution", ""),
                "decision": training_plan.get("decision", "accept"),
                "rework_targets": training_plan.get("rework_targets") or [],
                "required_fixes": training_plan.get("required_fixes") or [],
            }
            ctx["debates"].append(debate)
            await emit("debate", debate)
            if training_plan.get("decision") != "rework":
                return training_plan, False
            if rework_count >= self.MAX_REWORK_ATTEMPTS:
                return training_plan, True

            rework_count += 1
            targets = training_plan.get("rework_targets") or [agent.meta.id for agent in self.planning_agents]
            fixes = training_plan.get("required_fixes") or []
            await emit("rework", {
                "phase": "planning",
                "rework_attempt": rework_count,
                "planning_round": ctx.get("planning_round", 1),
                "generation_round": ctx.get("generation_round", 1),
                "targets": targets,
                "required_fixes": fixes,
            })
            ctx["planning_revision_feedback"] = {target: list(fixes) for target in targets}
            ctx["planning_round"] = int(ctx.get("planning_round", 1)) + 1

    async def _record_resource_debate(self, ctx: dict, emit) -> None:
        reviews = ctx.get("reviews") or {}
        outputs = ctx.get("outputs") or {}
        reviewer_targets = {
            "evidence_review": ("doc", "guide", "quiz", "mindmap", "reading", "video"),
            "practice_review": ("guide", "code"),
            "difficulty_review": ("quiz", "mindmap", "reading", "code", "video"),
        }
        exchanges = []
        for reviewer_id, resource_ids in reviewer_targets.items():
            review = reviews.get(reviewer_id) or {}
            for target in resource_ids:
                output = outputs.get(target) or {}
                target_findings = [
                    finding for finding in review.get("findings") or []
                    if finding.get("target_agent") == target
                ]
                exchanges.append({
                    "generator": target,
                    "reviewer": reviewer_id,
                    "generator_position": str(output.get("title") or f"{target} 第 {ctx.get('generation_round', 1)} 轮资源"),
                    "generator_response": output.get("revision_response") or [],
                    "reviewer_challenges": target_findings,
                    "reviewer_decision": "rework" if target_findings else "accept",
                    "review_score": int(review.get("score", 0)),
                })
        debate = {
            "phase": "resource",
            "round": int(ctx.get("generation_round", 1)),
            "title": "第二次辩论 · 资源生成与审核质询",
            "participants": [
                "doc", "guide", "quiz", "mindmap", "reading", "code", "video",
                *reviewer_targets.keys(),
            ],
            "exchanges": exchanges,
            "decision": "rework" if any(item["reviewer_decision"] == "rework" for item in exchanges) else "accept",
        }
        ctx["debates"].append(debate)
        await emit("debate", debate)

    async def _emit_done(self, ctx: dict, emit) -> None:
        decision = ctx.get("decision") or {}
        if isinstance(decision, dict):
            decision["debates"] = ctx.get("debates", [])
        await emit("done", {
            "run_id": ctx.get("run_id"),
            "domain": ctx.get("domain", ""),
            "target_role": ctx.get("target_role", ""),
            "stage": ctx.get("stage"),
            "generation_round": ctx.get("generation_round", 1),
            "diagnosis": ctx.get("diagnosis", {}),
            "outputs": ctx.get("outputs", {}),
            "reviews": ctx.get("reviews", {}),
            "decision": decision,
            "debates": ctx.get("debates", []),
        })

    @staticmethod
    def _failed_decision(
        *,
        phase: str,
        summary: str,
        generation_round: int,
        required_fixes: list,
    ) -> dict:
        return {
            "type": "decision",
            "decision": "failed",
            "summary": summary,
            "quality_score": 0,
            "generation_round": generation_round,
            "rework_targets": [],
            "required_fixes": required_fixes,
            "review_scores": {},
            "quality_metrics": {},
            "release_gate": {
                "review_count": 0,
                "blocker_count": len(required_fixes),
                "all_reviews_present": False,
                "all_metrics_passed": False,
            },
            "failed_phase": phase,
            "max_reworks_reached": True,
            "published": False,
        }

    async def _run_arbiter(self, ctx: dict, emit) -> dict:
        await self._stage(emit, "decision", "总裁决 Agent 汇总证据并执行发布门禁", ctx)
        result = await self._wrap_run(self.arbiter, ctx, emit)
        ctx["decision"] = result
        return result

    async def _wrap_run(self, agent: AgentBase, ctx: dict, emit) -> dict:
        try:
            await agent.emit_status(emit, "running")
            output = await agent.run(ctx, emit)
            await agent.emit_done(emit, output)
            await agent.emit_status(emit, "done")
            return output
        except Exception as exc:
            await agent.emit_status(emit, "error", message=str(exc))
            raise

    @staticmethod
    def _feedback_by_target(reviews: dict) -> dict[str, list[dict]]:
        feedback: dict[str, list[dict]] = {
            "doc": [], "guide": [], "quiz": [], "mindmap": [], "reading": [], "code": [], "video": [],
        }
        for review in reviews.values():
            for finding in review.get("findings", []):
                target = finding.get("target_agent")
                if target in feedback:
                    feedback[target].append(finding)
        return feedback

    @staticmethod
    def _review_target(reviewer_id: str) -> str:
        return {
            "evidence_review": "doc",
            "practice_review": "guide",
            "difficulty_review": "quiz",
        }.get(reviewer_id, "doc")


def serialize_event(item: dict) -> dict:
    """把 dict 事件转成 sse-starlette 接受的 {event, data} 形式。"""
    return {"event": item["event"], "data": json.dumps(item["data"], ensure_ascii=False)}
