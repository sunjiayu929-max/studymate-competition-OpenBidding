"""
Agent 抽象基类 + 协作事件协议。

每个 Agent 实现 `run(context, emit)`：
- context: 共享状态字典（topic / profile / chunks / 各 Agent 已产出的资源）
- emit:    异步推送 SSE 事件给前端（agent_status / agent_delta / agent_done）

设计取舍：用轻量自研编排（asyncio.gather + Queue），而非全套 LangGraph runtime。
原因：
  1) Orchestrator 状态机的核心是"哪些 Agent 并发哪些串行 + 状态可视化"——我们自己掌控更灵活
  2) Prompt 编程和工具调用还是在 Agent 内部自己写
  3) PPT 上完全可以讲"基于状态图的多智能体编排"——它在逻辑上就是
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Awaitable, Callable
from dataclasses import dataclass


# SSE 事件类型
EventEmitter = Callable[[str, dict], Awaitable[None]]


@dataclass
class AgentMeta:
    id: str            # 短 id，前端做 key
    name: str          # 显示名
    icon: str          # emoji，前端头像
    color: str         # tailwind 颜色名（indigo/rose/emerald/amber/sky）
    description: str   # 一句话职责


class AgentBase(ABC):
    """所有 Agent 的基类。"""

    meta: AgentMeta

    def __init__(self):
        if not hasattr(self, "meta"):
            raise NotImplementedError("Agent subclass must define `meta`")

    @abstractmethod
    async def run(self, context: dict, emit: EventEmitter) -> dict:
        """执行 Agent 任务。
        - 必须先 emit "agent_status" running
        - 流式生成时可以多次 emit "agent_delta"
        - 完成时 emit "agent_status" done 并 return 产出 dict
        - 失败时 emit "agent_status" error
        返回值会被 Orchestrator 合并进 context，供下游 Agent 使用。
        """
        raise NotImplementedError

    # 工具方法：标准化 emit
    async def emit_status(self, emit: EventEmitter, status: str, **extra):
        await emit("agent_status", {
            "agent": self.meta.id,
            "status": status,  # pending / running / streaming / done / error
            **extra,
        })

    async def emit_delta(self, emit: EventEmitter, delta: str, kind: str = "text"):
        await emit("agent_delta", {
            "agent": self.meta.id,
            "kind": kind,    # text / json / markdown
            "delta": delta,
        })

    async def emit_done(self, emit: EventEmitter, output: dict):
        await emit("agent_done", {
            "agent": self.meta.id,
            "output": output,
        })
