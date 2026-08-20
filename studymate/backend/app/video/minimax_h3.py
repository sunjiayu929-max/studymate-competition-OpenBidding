"""MiniMax H3 video generation client.

The provider is deliberately small and provider-specific.  The training
pipeline can keep working without a key, while a configured key enables the
real asynchronous H3 task API.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import require_external_access, settings


class MiniMaxH3Error(RuntimeError):
    """An actionable MiniMax H3 API failure."""


def minimax_h3_configured() -> bool:
    return bool(settings.MINIMAX_API_KEY.strip()) and not settings.STUDYMATE_SAFE_OFFLINE


def _base_url() -> str:
    return settings.MINIMAX_BASE_URL.rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.MINIMAX_API_KEY.strip()}",
        "Content-Type": "application/json",
    }


def _error_message(data: Any) -> str:
    if isinstance(data, dict):
        base = data.get("base_resp") or data.get("error") or {}
        if isinstance(base, dict):
            message = base.get("status_msg") or base.get("message") or base.get("detail")
            if message:
                return str(message)
        if data.get("message"):
            return str(data["message"])
    return "MiniMax H3 返回了无法识别的错误"


async def generate_h3_video(
    *,
    prompt: str,
    resolution: str = "768P",
    duration: int = 4,
    ratio: str = "16:9",
) -> dict[str, Any]:
    """Create an H3 task and wait for its final video URL."""
    require_external_access("MiniMax H3 视频生成")
    if not minimax_h3_configured():
        raise MiniMaxH3Error("未配置 MiniMax H3 API Key")
    if duration < 4 or duration > 15:
        raise MiniMaxH3Error("MiniMax H3 视频时长必须在 4～15 秒之间")

    request_body = {
        "model": settings.MINIMAX_VIDEO_MODEL,
        "content": [{"type": "text", "text": prompt}],
        "resolution": resolution,
        "duration": duration,
        "ratio": ratio,
        "aigc_watermark": settings.MINIMAX_VIDEO_WATERMARK,
    }
    timeout = httpx.Timeout(settings.MINIMAX_VIDEO_REQUEST_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{_base_url()}/v2/video_generation",
            headers=_headers(),
            json=request_body,
        )
        if response.status_code >= 400:
            raise MiniMaxH3Error(f"创建 H3 视频任务失败（{response.status_code}）：{_error_message(response.json())}")
        payload = response.json()
        task = payload.get("task") if isinstance(payload, dict) else None
        task_id = task.get("id") if isinstance(task, dict) else payload.get("task_id")
        if not task_id:
            raise MiniMaxH3Error("MiniMax H3 未返回 task_id")

        for attempt in range(settings.MINIMAX_VIDEO_POLL_ATTEMPTS):
            await asyncio.sleep(settings.MINIMAX_VIDEO_POLL_INTERVAL_SECONDS if attempt else 0)
            query = await client.get(
                f"{_base_url()}/v2/query/video_generation/{task_id}",
                headers={"Authorization": _headers()["Authorization"]},
            )
            if query.status_code >= 400:
                raise MiniMaxH3Error(f"查询 H3 视频任务失败（{query.status_code}）：{_error_message(query.json())}")
            query_payload = query.json()
            query_task = query_payload.get("task") if isinstance(query_payload, dict) else None
            if not isinstance(query_task, dict):
                query_task = query_payload if isinstance(query_payload, dict) else {}
            status = str(query_task.get("status") or "").lower()
            if status in {"succeeded", "success", "completed"}:
                content = query_task.get("content") or {}
                video_url = content.get("url") if isinstance(content, dict) else None
                if not video_url:
                    raise MiniMaxH3Error("H3 任务已完成，但没有返回视频地址")
                return {
                    "task_id": str(task_id),
                    "video_url": str(video_url),
                    "resolution": query_task.get("resolution", resolution),
                    "duration": query_task.get("duration", duration),
                    "ratio": query_task.get("ratio", ratio),
                    "usage": query_task.get("usage") or {},
                }
            if status in {"failed", "error", "canceled", "cancelled"}:
                raise MiniMaxH3Error(f"H3 视频任务{status}：{_error_message(query_task)}")

        raise MiniMaxH3Error("H3 视频任务等待超时，请稍后在控制台查询任务状态")
