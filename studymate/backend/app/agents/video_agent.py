"""岗位适配的可视讲解资源生成 Agent。"""
from __future__ import annotations

import math
import re

from app.agents.base import AgentBase, AgentMeta, EventEmitter


def _estimate_complexity(context: dict, topic: str) -> str:
    """按问题本身判断规模，不让岗位能力数量把短问题放大成流程课。"""
    difficulty = int((context.get("diagnosis") or {}).get("target_difficulty") or 0)
    long_topic_markers = ("原理", "详解", "全面", "完整", "系统", "从头到尾", "架构", "课程")
    workflow_markers = ("流程", "步骤", "实战", "配置清单", "部署方案", "完整讲解")
    signals = int(len(topic) > 28) + int(any(marker in topic for marker in long_topic_markers))
    signals += int(difficulty >= 4)
    if signals >= 2:
        return "complex"
    if len(topic) > 18 or any(marker in topic for marker in workflow_markers):
        return "workflow"
    return "focused"


def _duration_for_voiceover(voiceover: str, complexity: str) -> int:
    """按旁白长度估算讲解时长，并设置复杂主题上限。"""
    spoken_chars = len(re.sub(r"[，。！？：；、“”‘’（）()、\s]", "", voiceover))
    estimated = math.ceil(spoken_chars / 5) + 1
    cap = {"focused": 6, "workflow": 9, "complex": 12}[complexity]
    return max(4, min(cap, estimated))


def _segment_duration(voiceover: str, complexity: str) -> int:
    """为一个可教学节点估算适合前端播放的时长。"""
    cap = {"focused": 6, "workflow": 9, "complex": 12}[complexity]
    spoken_chars = len(re.sub(r"[，。！？：；、“”‘’（）()、\s]", "", voiceover))
    return max(6 if complexity != "focused" else 4, min(cap, math.ceil(spoken_chars / 5) + 1))


def _shots_for_duration(duration: int, complexity: str) -> list[dict]:
    first = max(1, round(duration * 0.2))
    last = max(1, round(duration * 0.25))
    middle = max(1, duration - first - last)
    if first + middle + last != duration:
        middle = duration - first - last
    if complexity == "focused":
        descriptions = ["关键输入与边界", "核心动作", "结果检查"]
    elif complexity == "workflow":
        descriptions = ["任务输入与约束", "按顺序执行关键步骤", "验证结果与下一步"]
    else:
        descriptions = ["长主题的关键上下文", "只演示一个可核验的核心片段", "结果检查与后续学习入口"]
    return [
        {"duration": first, "description": descriptions[0]},
        {"duration": middle, "description": descriptions[1]},
        {"duration": last, "description": descriptions[2]},
    ]


def _build_script(context: dict) -> dict:
    topic = str(context.get("topic") or "岗位核心任务")
    role = str(context.get("target_role") or "目标岗位")
    complexity = _estimate_complexity(context, topic)
    if complexity == "focused":
        scope = "关键动作短片"
        duration_reason = "问题聚焦，生成一个关键动作片段即可"
        nodes = [("关键动作", f"只看{topic}：确认输入，执行核心步骤，检查结果。")]
    elif complexity == "workflow":
        scope = "岗位流程片段"
        duration_reason = "按任务流程拆成输入、执行、验证和复盘四个教学节点"
        nodes = [
            ("输入与约束", f"先确认{topic}的任务目标、输入条件和安全边界。"),
            ("核心操作", f"在{role}的工作场景中，执行{topic}最关键的一步。"),
            ("结果验证", "检查关键输出是否符合预期，并指出一个可观察的验收信号。"),
            ("异常复盘", "如果结果不符合预期，回到日志、参数或输入逐项排查。"),
        ]
    else:
        scope = "复杂主题关键片段"
        duration_reason = "主题较长，拆成六个可核验节点，完整课程继续交给动画或黑板"
        nodes = [
            ("问题边界", f"先明确{topic}要解决的问题、输入和不能越过的安全边界。"),
            ("关键原理", "只解释完成当前任务必须理解的核心机制，不展开无关理论。"),
            ("方案准备", f"结合{role}场景，准备数据、工具和验收标准。"),
            ("核心操作", "演示一个可以复现、可以检查的关键操作步骤。"),
            ("结果验收", "对照验收标准检查输出，确认结果是否达到岗位要求。"),
            ("异常复盘", "展示一个典型异常的排查入口，并指向后续动画或黑板讲解。"),
        ]

    segment_specs: list[dict] = []
    for index, (purpose, segment_voiceover) in enumerate(nodes, start=1):
        duration = _segment_duration(segment_voiceover, complexity)
        segment_prompt = (
            f"岗位训练可视讲解，主题：{topic}。目标岗位：{role}。"
            f"这是完整教学视频的第 {index} 个片段，节点：{purpose}。"
            f"只展示这一节点，不跳过前置条件，不试图覆盖完整课程。"
            f"画面清晰、动作可核验，旁白准确朗读：‘{segment_voiceover}’。"
            "使用自然、清晰、适合培训的普通话，配合克制的环境音，画面与旁白同步。"
            "不要生成无法核验的品牌、人物或具体数据，不要在画面中堆叠长段文字。"
            "字幕由系统后期烧录，画面不要自行生成字幕。"
        )
        segment_specs.append({
            "index": index,
            "title": purpose,
            "purpose": purpose,
            "voiceover": segment_voiceover,
            "prompt": segment_prompt,
            "duration": duration,
            "status": "planned",
            "task_id": "",
            "video_url": "",
            "usage": {},
        })

    voiceover = "".join(segment["voiceover"] for segment in segment_specs)
    duration = sum(segment["duration"] for segment in segment_specs)
    prompt = segment_specs[0]["prompt"]
    chunks = list(context.get("chunks") or [])[:4]
    shots = _shots_for_duration(segment_specs[0]["duration"], complexity)
    return {
        "title": f"{topic} · 岗位可视讲解",
        "voiceover": voiceover,
        "shots": shots,
        "prompt": prompt,
        "complexity": complexity,
        "scope": scope,
        "duration": duration,
        "duration_reason": duration_reason,
        "estimated_cost_rmb": round(duration * 0.5, 2),
        "segments": segment_specs,
        "segment_count": len(segment_specs),
        "total_duration": duration,
        "citations": [
            {
                "index": index + 1,
                "chunk_id": chunk.get("chunk_id"),
                "source": chunk.get("source"),
                "page": chunk.get("page"),
                "url": chunk.get("url"),
                "snippet": str(chunk.get("content") or "")[:200],
            }
            for index, chunk in enumerate(chunks)
        ],
    }


def preview_video_plan(context: dict) -> dict:
    """返回前端可视讲解脚本的时长与分镜估算。"""
    script = _build_script(context)
    return {
        "duration": script["duration"],
        "total_duration": script["total_duration"],
        "segment_count": script["segment_count"],
        "segments": [
            {key: segment[key] for key in ("index", "title", "purpose", "duration", "voiceover", "status")}
            for segment in script["segments"]
        ],
        "resolution": "768P",
        "ratio": "16:9",
        "complexity": script["complexity"],
        "scope": script["scope"],
        "duration_reason": script["duration_reason"],
        "estimated_cost_rmb": script["estimated_cost_rmb"],
    }


class VideoAgent(AgentBase):
    meta = AgentMeta(
        id="video",
        name="可视讲解生成 Agent",
        icon="🎬",
        color="violet",
        description="将岗位任务编排为可直接播放的前端可视讲解脚本",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        script = _build_script(context)
        progress_callback = context.get("_video_progress")

        async def publish_progress(payload: dict) -> None:
            if callable(progress_callback):
                await progress_callback(payload)

        base = {
            "type": "video",
            "title": script["title"],
            "provider": "frontend",
            "model": "scripted-lecture",
            "resolution": "768P",
            "duration": script["duration"],
            "total_duration": script["total_duration"],
            "segment_count": script["segment_count"],
            "completed_segments": 0,
            "segments": script["segments"],
            "segment_urls": [],
            "assembly_status": "not_applicable",
            "assembled_video_url": "",
            "actual_cost_rmb": 0,
            "ratio": "16:9",
            "has_audio": True,
            "script": script,
            "video_url": "",
            "task_id": "",
            "usage": {},
            "version": int(context.get("generation_round", 1)),
            "target_role": context.get("target_role", ""),
            "complexity": script["complexity"],
            "scope": script["scope"],
            "duration_reason": script["duration_reason"],
            "estimated_cost_rmb": script["estimated_cost_rmb"],
        }
        await publish_progress({**base, "status": "running", "message": "正在编排可视讲解脚本…"})
        await self.emit_delta(emit, "已生成可视讲解脚本与分镜，将使用前端动画、黑板和语音播放。")
        return {
            **base,
            "status": "script_ready",
            "message": "可视讲解脚本与分镜已生成，将使用前端动画、黑板和语音播放。",
        }
