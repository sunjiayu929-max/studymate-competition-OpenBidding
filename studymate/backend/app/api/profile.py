"""画像相关 API：
- GET  /api/profile/{user_id}        拿当前画像 + version
- POST /api/profile/chat              SSE 对话 + 实时画像 patch
- POST /api/profile/{user_id}/reset   重置画像（debug 用）
"""
import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.core.config import settings
from app.db import get_db
from app.db.models import User, Profile, ProfileSnapshot
from app.llm import has_llm_key
from app.schemas.profile import ProfileDims, ProfileChatRequest, normalize_profile_dims
from app.agents.profile_agent import (
    build_profile_evidence_text,
    merge_patch,
    profile_chat_stream,
    sanitize_profile_patch,
)

router = APIRouter(prefix="/profile", tags=["profile"])


def _changed_fields(before: dict, after: dict) -> list[str]:
    changed: list[str] = []
    for section in sorted(set(before) | set(after)):
        old_value = before.get(section)
        new_value = after.get(section)
        if isinstance(old_value, dict) and isinstance(new_value, dict):
            for field in sorted(set(old_value) | set(new_value)):
                if old_value.get(field) != new_value.get(field):
                    changed.append(f"{section}.{field}")
        elif old_value != new_value:
            changed.append(section)
    return changed


async def _get_or_create_user(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        # MVP 阶段：用户传啥 id 都自动建
        user = User(id=user_id, name=f"用户{user_id}")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def _get_or_create_profile(db: AsyncSession, user_id: int) -> Profile:
    q = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = q.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id, dims=ProfileDims().model_dump(), version=1)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.get("/{user_id}")
async def get_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    await _get_or_create_user(db, user_id)
    profile = await _get_or_create_profile(db, user_id)
    return {
        "user_id": user_id,
        "version": profile.version,
        # 旧画像按最新 schema 补默认维度，但不因此写库或增加版本。
        "dims": normalize_profile_dims(profile.dims),
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


@router.post("/{user_id}/reset")
async def reset_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, user_id)
    profile.dims = ProfileDims().model_dump()
    profile.version = 1
    await db.commit()
    return {"ok": True, "user_id": user_id}


@router.post("/chat")
async def profile_chat(req: ProfileChatRequest):
    """SSE: 对话同时构建画像。
    事件：meta / delta / patch / done
    """
    # 不能复用 Depends(get_db) 的 session 跨越 SSE 生成器边界——SSE 流持续期间
    # 需要新开 session 写库。这里在 generator 内部自己起 session。
    from app.db.session import async_session_maker

    # 带图 → 走 qwen-vl 视觉模型（需 qwen key）；纯文字 → 默认 provider
    has_image = bool(req.images)
    key_ok = has_llm_key("qwen-vl") if has_image else has_llm_key()

    async def gen():
        yield {
            "event": "meta",
            "data": json.dumps({
                "provider": "qwen-vl" if has_image else settings.LLM_PROVIDER,
                "mock": not bool(key_ok),
                "vision": has_image,
                "user_id": req.user_id,
            }),
        }

        # 加载当前画像
        async with async_session_maker() as db:
            await _get_or_create_user(db, req.user_id)
            profile = await _get_or_create_profile(db, req.user_id)
            current_dims = ProfileDims.model_validate(profile.dims)

        history = [item for item in req.history[-10:] if isinstance(item, dict)]
        if history:
            last = history[-1]
            if last.get("role") == "user" and last.get("content") == req.message:
                history.pop()

        patch_json = "{}"
        stream_warning: str | None = None
        if not key_ok:
            # mock：固定返回 + 模拟 patch（演示用）
            mock_reply = "（mock 模式）你好！能先告诉我你的专业、年级，还有最想攻克的课程或方向吗？"
            for ch in mock_reply:
                yield {"event": "delta", "data": ch}
                await _sleep(0.02)
            patch_json = json.dumps({"reasoning": "mock 模式：仅使用本地明确经历规则更新画像"})
            stream_warning = "当前未连接画像模型，仅保留可验证的本地证据更新"
        else:
            # 真实 LLM
            try:
                async for ev_type, data in profile_chat_stream(
                    user_message=req.message,
                    history=history,
                    current_profile=current_dims,
                    images=req.images,
                ):
                    if ev_type == "delta":
                        yield {"event": "delta", "data": data}
                    elif ev_type == "patch":
                        patch_json = data
                    elif ev_type == "warning":
                        stream_warning = data
            except Exception as e:
                yield {"event": "error", "data": str(e)}
                return

        # 写库：逐字段清洗；只有真实变化才 version+1，并把旧画像写入 snapshot。
        try:
            raw_patch = json.loads(patch_json) if patch_json else {}
        except Exception:
            raw_patch = {}
            stream_warning = stream_warning or "画像更新格式无法识别，已保留现有画像"

        async with async_session_maker() as db:
            q = await db.execute(select(Profile).where(Profile.user_id == req.user_id))
            profile = q.scalar_one()
            current = ProfileDims.model_validate(profile.dims)
            old_dims = current.model_dump()
            evidence_text = build_profile_evidence_text(history, req.message)
            patch, sanitize_warning = sanitize_profile_patch(raw_patch, current, evidence_text)
            new_dims = merge_patch(current, patch).model_dump()
            changed_fields = _changed_fields(old_dims, new_dims)
            changed = bool(changed_fields)
            if changed:
                db.add(ProfileSnapshot(
                    user_id=req.user_id,
                    snapshot=old_dims,
                    trigger_event="profile_chat",
                ))
                profile.dims = new_dims
                profile.version += 1
                await db.commit()
                await db.refresh(profile)

            warnings = [item for item in (stream_warning, sanitize_warning) if item]

            yield {
                "event": "patch",
                "data": json.dumps({
                    "patch": patch,
                    "version": profile.version,
                    "dims": new_dims,
                    "changed": changed,
                    "changed_fields": changed_fields,
                    "warning": "；".join(dict.fromkeys(warnings)) or None,
                }, ensure_ascii=False),
            }

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(gen())


async def _sleep(s: float):
    import asyncio
    await asyncio.sleep(s)
