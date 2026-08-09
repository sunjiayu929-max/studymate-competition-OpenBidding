"""AI 助教对话（Qwen / DeepSeek / MiMo 服务端受控路由）

- 浏览器只传 provider 标识；Key、Base URL 与模型名始终留在服务端
- 三引擎差异化：工作台 deepseek / 助教 qwen / 语音 ASR+TTS 讯飞
- 多轮上下文（前端维护 messages，后端拼接）
- 流式 SSE
- 自动注入当前用户画像作为 system context（个性化辅导）
"""
from __future__ import annotations

import json
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.courses import get_course_by_id
from app.core.config import settings
from app.db import get_db
from app.db.session import async_session_maker
from app.db.models import Profile, TutorSession, User
from app.deps import require_user
from app.llm import get_llm_client, has_llm_key
from app.api.knowledge import search_owned_library

router = APIRouter(prefix="/tutor", tags=["tutor"])

SUPPORTED_PROVIDERS = ("qwen", "deepseek", "spark", "mimo")
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_EXTRACTED_CHARS = 16_000
TEXT_FILE_SUFFIXES = {
    ".txt", ".md", ".markdown", ".py", ".js", ".jsx", ".ts", ".tsx",
    ".java", ".c", ".cc", ".cpp", ".h", ".hpp", ".go", ".rs", ".sql",
    ".html", ".css", ".json", ".yaml", ".yml", ".sh", ".ps1",
}


class TutorAttachment(BaseModel):
    name: str = Field(max_length=180)
    media_type: str = Field(default="text/plain", max_length=120)
    kind: Literal["document", "code"] = "document"
    content: str = Field(max_length=MAX_EXTRACTED_CHARS)
    size: int | None = None


class TutorMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    # 看图问答：用户消息可附带图片（base64 data URL，前端已压缩到 ~768px）。
    # 任一消息带图 → 整轮切到 qwen-vl 视觉模型。
    images: list[str] | None = None
    attachments: list[TutorAttachment] | None = Field(default=None, max_length=4)
    # 前端会话恢复状态；仅用于持久化与展示，不参与模型提示词。
    delivery: Literal["complete", "stopped", "error"] | None = None
    error_detail: str | None = Field(default=None, max_length=500)


class PageContext(BaseModel):
    """当前页面上下文（小精灵抽屉用）：助教据此判断「用户正在看什么」。"""
    page: str  # home / workspace / workspace_detail / notes / report / tests / profile
    title: str | None = None  # 友好标题：例如「K-Means 讲解」「错题本：朴素贝叶斯」
    topic: str | None = None  # 当前主题词（工作台用）
    snippet: str | None = None  # 前 ~600 字摘录（可选）
    quiz_state: Literal["unanswered", "attempted", "answered"] | None = None
    question_type: Literal["mcq", "fill", "code"] | None = None
    quick_actions: list[str] | None = None


class TutorChatRequest(BaseModel):
    user_id: int = 1
    course_id: int | None = None
    target_role: str | None = Field(default=None, max_length=128)
    messages: list[TutorMessage] = Field(default_factory=list)
    page_context: PageContext | None = None
    # 文字/语音助教显式传入；笔记总结等内部直接任务省略该字段。
    learning_method: Literal["feynman", "socratic"] | None = None
    provider: Literal["qwen", "deepseek", "spark", "mimo"] | None = None
    knowledge_base_id: int | None = None


class TutorConversationCourse(BaseModel):
    course_id: int | None = None


class TutorConversationSave(TutorConversationCourse):
    messages: list[TutorMessage] = Field(default_factory=list, max_length=100)
    title: str | None = Field(default=None, max_length=256)


class TutorConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=256)


def _course_clause(course_id: int | None):
    return TutorSession.course_id.is_(None) if course_id is None else TutorSession.course_id == course_id


def _conversation_title(messages: list[TutorMessage] | list[dict]) -> str:
    for message in messages:
        role = message.role if isinstance(message, TutorMessage) else message.get("role")
        content = message.content if isinstance(message, TutorMessage) else message.get("content", "")
        if role == "user" and content and content.strip():
            normalized = " ".join(content.split())
            return normalized[:36] or "新的学习对话"
        if role == "user":
            attachments = message.attachments if isinstance(message, TutorMessage) else message.get("attachments")
            if attachments:
                first = attachments[0]
                name = first.name if isinstance(first, TutorAttachment) else first.get("name", "")
                if name and name.strip():
                    return f"附件：{name.strip()}"[:36]
            images = message.images if isinstance(message, TutorMessage) else message.get("images")
            if images:
                return f"{len(images)} 张图片问题" if len(images) > 1 else "图片问题"
    return "新的学习对话"


def _serialize_conversation(row: TutorSession) -> dict:
    return {
        "id": f"s{row.id}",
        "title": row.title or _conversation_title(row.messages or []),
        "created_at": row.created_at.isoformat() if row.created_at else datetime.utcnow().isoformat(),
        "updated_at": (row.updated_at or row.created_at or datetime.utcnow()).isoformat(),
        "messages": row.messages or [],
    }


async def _ensure_active_conversation(
    db: AsyncSession,
    user_id: int,
    course_id: int | None,
) -> TutorSession:
    rows = (
        await db.scalars(
            select(TutorSession)
            .where(
                TutorSession.user_id == user_id,
                _course_clause(course_id),
                TutorSession.is_active.is_(True),
            )
            .order_by(TutorSession.updated_at.desc(), TutorSession.id.desc())
        )
    ).all()
    if rows:
        active = rows[0]
        for duplicate in rows[1:]:
            duplicate.is_active = False
        return active
    active = TutorSession(
        user_id=user_id,
        course_id=course_id,
        title="新的学习对话",
        messages=[],
        is_active=True,
        updated_at=datetime.utcnow(),
    )
    db.add(active)
    await db.flush()
    return active


async def _conversation_state(
    db: AsyncSession,
    user_id: int,
    course_id: int | None,
) -> dict:
    active = await _ensure_active_conversation(db, user_id, course_id)
    archived = (
        await db.scalars(
            select(TutorSession)
            .where(
                TutorSession.user_id == user_id,
                _course_clause(course_id),
                TutorSession.is_active.is_(False),
            )
            .order_by(TutorSession.updated_at.desc(), TutorSession.id.desc())
            .limit(50)
        )
    ).all()
    return {
        "active": _serialize_conversation(active),
        "items": [_serialize_conversation(row) for row in archived if row.messages],
    }


@router.get("/conversations")
async def list_tutor_conversations(
    course_id: int | None = Query(default=None),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    state = await _conversation_state(db, user.id, course_id)
    await db.commit()
    return state


@router.put("/conversations/active")
async def save_active_tutor_conversation(
    payload: TutorConversationSave,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    active = await _ensure_active_conversation(db, user.id, payload.course_id)
    messages = [message.model_dump(exclude_none=True) for message in payload.messages]
    active.messages = messages
    active.title = payload.title.strip() if payload.title and payload.title.strip() else _conversation_title(payload.messages)
    active.updated_at = datetime.utcnow()
    await db.commit()
    return await _conversation_state(db, user.id, payload.course_id)


@router.post("/conversations/new")
async def start_new_tutor_conversation(
    payload: TutorConversationCourse,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    active = await _ensure_active_conversation(db, user.id, payload.course_id)
    if active.messages:
        active.is_active = False
        active.updated_at = datetime.utcnow()
        db.add(
            TutorSession(
                user_id=user.id,
                course_id=payload.course_id,
                title="新的学习对话",
                messages=[],
                is_active=True,
                updated_at=datetime.utcnow(),
            )
        )
    else:
        active.title = "新的学习对话"
        active.updated_at = datetime.utcnow()
    await db.commit()
    return await _conversation_state(db, user.id, payload.course_id)


@router.post("/conversations/{conversation_id}/activate")
async def activate_tutor_conversation(
    conversation_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    target = await db.scalar(
        select(TutorSession).where(
            TutorSession.id == conversation_id,
            TutorSession.user_id == user.id,
        )
    )
    if target is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    active_rows = (
        await db.scalars(
            select(TutorSession).where(
                TutorSession.user_id == user.id,
                _course_clause(target.course_id),
                TutorSession.is_active.is_(True),
            )
        )
    ).all()
    now = datetime.utcnow()
    for row in active_rows:
        row.is_active = False
        row.updated_at = now
    target.is_active = True
    target.updated_at = now
    await db.commit()
    return await _conversation_state(db, user.id, target.course_id)


@router.put("/conversations/{conversation_id}")
async def rename_tutor_conversation(
    conversation_id: int,
    payload: TutorConversationRename,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    target = await db.scalar(
        select(TutorSession).where(
            TutorSession.id == conversation_id,
            TutorSession.user_id == user.id,
        )
    )
    if target is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    target.title = payload.title.strip()
    target.updated_at = datetime.utcnow()
    course_id = target.course_id
    await db.commit()
    return await _conversation_state(db, user.id, course_id)


@router.delete("/conversations/{conversation_id}")
async def delete_tutor_conversation(
    conversation_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    target = await db.scalar(
        select(TutorSession).where(
            TutorSession.id == conversation_id,
            TutorSession.user_id == user.id,
        )
    )
    if target is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    course_id = target.course_id
    was_active = target.is_active
    await db.delete(target)
    if was_active:
        db.add(
            TutorSession(
                user_id=user.id,
                course_id=course_id,
                title="新的学习对话",
                messages=[],
                is_active=True,
                updated_at=datetime.utcnow(),
            )
        )
    state = await _conversation_state(db, user.id, course_id)
    await db.commit()
    return state


def _system_prompt(
    profile_dims: dict | None,
    persona: str,
    course_name: str,
    page_ctx: PageContext | None = None,
    learning_method: Literal["feynman", "socratic"] | None = None,
    target_role: str | None = None,
) -> str:
    role_context = target_role.strip() if target_role else course_name
    base = (
        f"你是 StudyMate 岗位学习助手（{persona}），当前围绕目标岗位“{role_context}”，为学习者解决岗位能力点与任务问题。回答风格：\n"
        "1. **简洁直接**，不啰嗦；公式用 KaTeX（行内 $..$，独立 $$..$$）；代码用 ```python ... ``` 或对应语言\n"
        "2. 解释概念时先给一句话的直觉，再给精确定义/公式\n"
        "3. 鼓励但不空夸；学生答错时指出错误并补充正确思路\n"
        "4. 不要回答违法、医疗诊断、政治敏感问题\n"
        "5. 如果回答以‘直觉正确。’‘直觉不对。’‘直觉有偏差。’或同类判断开头，这句判断必须单独成段；随后空一行再解释，绝不能把判断和正文连在同一段。\n"
        "6. 普通解释、公式推导和自然语言段落不得放进代码块；只有实际代码、命令或配置片段才使用三反引号。"
    )
    if learning_method == "feynman":
        method_protocol = (
            "\n\n【费曼学习法协议】\n"
            "- 学习类回答采用“大白话解释 → 具体例子或类比 → 轮到你复述”的结构。术语必须立即换成学生能讲给同学听的简单表达。\n"
            "- 先把当前问题讲清楚，但一次只处理一个核心概念；不要堆砌定义、公式和延伸知识。\n"
            "- 每轮末尾只给 1 个明确的复述或迁移任务，让学生用自己的话解释、举例或教回给你，不能只问‘懂了吗’。\n"
            "- 学生复述后，先指出已经讲对的部分，再定位最关键的一个缺口，用更简单的说法补齐，然后继续让学生重新表述或迁移。\n"
            "- 若学生连续两轮卡住，依次提供生活类比、半成品表述、完整示范；示范后仍需用 1 个简短变式检查是否真正理解。\n"
            "- 用户明确只要翻译、格式转换、事实查询、总结或操作指令时直接完成任务，不强行要求复述。"
        )
    elif learning_method == "socratic":
        method_protocol = (
            "\n\n【苏格拉底式引导协议】\n"
            "- 学习类回答采用“核心结论 → 推理台阶 → 轮到你”的结构。先把当前问题讲清楚，但不要一次倾倒所有延伸知识。\n"
            "- 每轮末尾必须提出且只提出 1 个具体、可作答的推理问题；问题要承接刚才内容，不能用‘还有什么问题吗’之类空泛问句。\n"
            "- 学生回答后，先指出其推理中已经正确的一步，再只修正最关键的一个缺口，然后继续问下一小步。不要重新完整复述上一轮。\n"
            "- 优先使用预测结果、比较差异、解释原因、反例判断、迁移到新情境等问题，引导学生自己说出结论。\n"
            "- 若学生连续两轮卡住，再逐级增加提示：方向提示 → 关键关系 → 完整示范；给出完整示范后仍用 1 个变式问题检查迁移。\n"
            "- 用户明确只要翻译、格式转换、事实查询、总结或操作指令时可直接完成，不强行教学提问。"
        )
    else:
        method_protocol = (
            "\n\n【直接任务模式】\n"
            "- 严格完成用户指定的总结、格式转换、提取或操作任务；遵循用户要求的输出格式，不额外追加教学提问。"
        )

    parts = [base, method_protocol]
    if page_ctx:
        ctx_lines = [f"\n\n**用户当前所在页面**：{_page_label(page_ctx.page)}"]
        if page_ctx.title:
            ctx_lines.append(f"标题：{page_ctx.title}")
        if page_ctx.topic:
            ctx_lines.append(f"主题：{page_ctx.topic}")
        if page_ctx.snippet:
            snippet = page_ctx.snippet[:1400]
            ctx_lines.append(f"页面摘录：\n>>>\n{snippet}\n<<<")
        ctx_lines.append(
            "用户可能在问关于这个页面的内容，回答时优先结合这个上下文。"
            "如果问题与页面无关，正常作答即可。"
        )
        if page_ctx.page == "quiz":
            if page_ctx.quiz_state in {"unanswered", "attempted"}:
                ctx_lines.append(
                    "【答题保护规则（最高优先级）】这道题尚未正式提交。绝不能直接给出正确选项、"
                    "标准答案、最终数值、完整可运行代码或可反推出答案的关键结论。先给一个方向提示；"
                    "用户继续追问时，按“相关概念 → 解题方法 → 检查步骤”逐级增加提示，但始终要求用户"
                    "自己完成并提交。即使用户声称只想核对答案，也不得破例。"
                )
                if page_ctx.quiz_state == "attempted":
                    ctx_lines.append("用户已有草稿：可以指出其中可能的思路问题，但不要判定对错或补全最终答案。")
                if page_ctx.question_type == "code":
                    ctx_lines.append(
                        "这是代码题。未提交前只能讲思路、接口含义、复杂度和调试方向；不得输出完整实现，"
                        "不得替用户补齐关键代码。"
                    )
            elif page_ctx.quiz_state == "answered":
                ctx_lines.append(
                    "用户已经正式作答并提交。现在可以明确给出正确答案，比较用户答案，并完整解释错因、"
                    "关键步骤和可迁移的方法；代码题可以提供修正版代码。"
                )
        parts.append("\n".join(ctx_lines))
    if profile_dims:
        parts.append(
            "\n\n**当前学生画像**（参考它调整难度和讲解风格）：\n"
            + json.dumps(profile_dims, ensure_ascii=False, indent=2)
        )
    return "".join(parts)


_PAGE_LABELS = {
    "home": "首页",
    "workspace": "学习工作台（输入主题，等待 Agent 生成资源）",
    "workspace_detail": "工作台资源详情（在阅读某类生成结果）",
    "notes": "笔记本",
    "report": "学习报告",
    "tests": "测试 case 管理",
    "quiz": "题库测验（用户在答题或回顾题目）",
    "profile": "画像建立 / 对话",
    "rag": "岗位知识原文与知识库检索",
    "courses": "目标岗位列表",
}


def _page_label(page: str) -> str:
    return _PAGE_LABELS.get(page, page)


def _build_content(m: TutorMessage):
    """带图的用户消息拼成 qwen-vl 多模态 content 数组，否则保持纯字符串。"""
    text = m.content
    if m.role == "user" and m.attachments:
        blocks = []
        for attachment in m.attachments:
            blocks.append(
                f"【用户附件：{attachment.name}｜{attachment.media_type}】\n"
                f"{attachment.content[:MAX_EXTRACTED_CHARS]}\n【附件结束】"
            )
        text = "\n\n".join(part for part in [m.content, *blocks] if part)
    if m.role == "user" and m.images:
        parts: list[dict] = []
        if text:
            parts.append({"type": "text", "text": text})
        for url in m.images:
            parts.append({"type": "image_url", "image_url": {"url": url}})
        return parts
    return text


@router.post("/extract-file")
async def extract_tutor_file(file: UploadFile = File(...)):
    """提取学习助手可引用的 PDF、Markdown、文本与代码文件。"""
    filename = Path(file.filename or "未命名文件").name
    suffix = Path(filename).suffix.lower()
    if suffix != ".pdf" and suffix not in TEXT_FILE_SUFFIXES:
        raise HTTPException(status_code=415, detail="仅支持 PDF、Markdown、文本和常见代码文件")

    raw = await file.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="单个文件不能超过 10MB")
    if not raw:
        raise HTTPException(status_code=400, detail="文件内容为空")

    try:
        if suffix == ".pdf":
            try:
                from pypdf import PdfReader
            except ImportError as exc:
                raise HTTPException(status_code=503, detail="PDF 解析组件尚未安装") from exc
            reader = PdfReader(BytesIO(raw))
            text = "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)
            kind = "document"
        else:
            text = raw.decode("utf-8-sig", errors="replace")
            kind = "document" if suffix in {".txt", ".md", ".markdown"} else "code"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"无法读取该文件：{exc}") from exc

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="没有提取到可读取文字，扫描版 PDF 请改用截图")
    truncated = len(text) > MAX_EXTRACTED_CHARS
    return {
        "name": filename,
        "media_type": file.content_type or "application/octet-stream",
        "kind": kind,
        "content": text[:MAX_EXTRACTED_CHARS],
        "size": len(raw),
        "truncated": truncated,
    }


@router.get("/models")
async def tutor_models():
    default = settings.TUTOR_DEFAULT_PROVIDER.lower()
    if default not in SUPPORTED_PROVIDERS:
        default = "qwen"
    descriptions = {
        "qwen": ("Qwen", "岗位问答与多模态附件"),
        "deepseek": ("DeepSeek", "推理、公式与代码讲解"),
        "spark": ("讯飞星火 4.0 Ultra", "通用问答与学习辅导"),
        "mimo": ("MiMo", "自然对话、提炼与总结"),
    }
    return {
        "default": default,
        "items": [
            {
                "id": provider,
                "label": descriptions[provider][0],
                "description": descriptions[provider][1],
                "configured": has_llm_key(provider),
                "recommended": provider == default,
            }
            for provider in SUPPORTED_PROVIDERS
        ],
    }


@router.post("/chat")
async def tutor_chat(req: TutorChatRequest, user: User = Depends(require_user)):
    selected_provider = (req.provider or settings.TUTOR_DEFAULT_PROVIDER).lower()
    if selected_provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=422, detail="回答模型仅支持 Qwen、DeepSeek、讯飞星火 4.0 Ultra 或 MiMo")
    # 视觉输入只允许用户明确选择 Qwen，避免后端静默替换其选择。
    has_image = any(m.images for m in req.messages if m.role == "user")
    if has_image and selected_provider != "qwen":
        raise HTTPException(status_code=422, detail="图片问答目前仅由 Qwen 支持，请明确切换到 Qwen 后重试")
    provider = "qwen-vl" if has_image else selected_provider
    key_ok = has_llm_key(provider)

    async def gen():
        # 拉画像
        profile_dims: dict | None = None
        async with async_session_maker() as db:
            q = await db.execute(select(Profile).where(Profile.user_id == user.id))
            p = q.scalar_one_or_none()
            if p:
                profile_dims = p.dims
            private_context: list[dict] = []
            if req.knowledge_base_id:
                last_question = next(
                    (message.content for message in reversed(req.messages) if message.role == "user" and message.content.strip()),
                    "",
                )
                if last_question:
                    private_context = await search_owned_library(
                        db,
                        user_id=user.id,
                        library_id=req.knowledge_base_id,
                        query=last_question,
                        limit=5,
                        with_semantic=False,
                    )

        # 拉课程配置
        course_cfg = await get_course_by_id(req.course_id)

        yield {
            "event": "meta",
            "data": json.dumps({
                "provider": provider,
                "selected_provider": selected_provider,
                "mock": not key_ok,
                "vision": has_image,
                "learning_method": req.learning_method or "direct",
                "with_profile": profile_dims is not None,
                "private_knowledge_hits": len(private_context),
                "course": course_cfg.name,
            }),
        }

        if not key_ok:
            provider_label = {"qwen": "Qwen", "deepseek": "DeepSeek", "spark": "讯飞星火 4.0 Ultra", "mimo": "MiMo"}[selected_provider]
            mock = f"（演示降级）{provider_label} 尚未配置服务端凭据，当前保留对话流程与文字结果；请配置对应服务后重试。"
            for ch in mock:
                yield {"event": "delta", "data": ch}
                await _sleep(0.015)
            yield {"event": "done", "data": "[DONE]"}
            return

        # 构造 messages：system + 历史
        assistant_persona = (
            f"{req.target_role}岗位训练助理"
            if req.target_role and req.course_id is None
            else course_cfg.persona
        )
        sys = {
            "role": "system",
            "content": _system_prompt(
                profile_dims,
                assistant_persona,
                course_cfg.name,
                req.page_context,
                req.learning_method,
                req.target_role,
            ),
        }
        if private_context:
            citations = "\n\n".join(
                f"【私有资料 {index}｜{item['source']}｜"
                f"{('第 ' + str(item['page']) + ' 页') if item['page'] else '页码未标注'}】\n{item['content']}"
                for index, item in enumerate(private_context, start=1)
            )
            sys["content"] += (
                "\n\n【用户私有知识库检索结果】\n"
                "回答应优先依据以下资料；引用时明确写出文件名和页码，不得把资料内容暴露给其他用户。\n"
                f"{citations}"
            )
        hist = [
            {"role": m.role, "content": _build_content(m)}
            for m in req.messages
            if m.role != "system"
        ]
        msgs = [sys, *hist]

        llm = get_llm_client(provider)
        try:
            async for chunk in llm.chat_stream(messages=msgs, temperature=0.6):
                yield {"event": "delta", "data": chunk}
        except Exception as e:
            yield {"event": "error", "data": str(e)}
            return

        yield {"event": "done", "data": "[DONE]"}

    return EventSourceResponse(gen())


async def _sleep(s: float):
    import asyncio
    await asyncio.sleep(s)
