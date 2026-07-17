"""
多 Agent 编排器。
状态机风格：retrieve → [doc, mindmap, quiz]（并发）→ done

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


def serialize_event(item: dict) -> dict:
    """把 dict 事件转成 sse-starlette 接受的 {event, data} 形式。"""
    return {"event": item["event"], "data": json.dumps(item["data"], ensure_ascii=False)}
