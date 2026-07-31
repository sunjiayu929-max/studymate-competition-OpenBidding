"""PPT 大纲与单页重写：受控模型路由、课程/私有知识上下文和显式本地降级。"""
from __future__ import annotations

import json
import logging
import math
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.knowledge import search_owned_library
from app.db import get_db
from app.db.models import User
from app.deps import require_user
from app.llm import get_llm_client, has_llm_key
from app.rag import get_rag_service

router = APIRouter(prefix="/ppt", tags=["ppt"])
logger = logging.getLogger(__name__)

Provider = Literal["qwen", "deepseek", "spark", "mimo"]
Layout = Literal[
    "cover",
    "agenda",
    "content",
    "case",
    "chart",
    "process",
    "comparison",
    "spotlight",
    "summary",
    "qa",
]
VisualStyle = Literal["paper", "graphite", "sage"]
SUPPORTED_PROVIDERS = ("qwen", "deepseek", "spark", "mimo")


class Citation(BaseModel):
    source: str = Field(max_length=256)
    page: int | None = None
    chunk_id: str | None = None
    kind: Literal["course", "private", "topic"] = "topic"


class ChartDatum(BaseModel):
    label: str = Field(max_length=32)
    value: float


class ContentBlock(BaseModel):
    heading: str = Field(default="", max_length=48)
    body: str = Field(default="", max_length=220)


class SlideDraft(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    kicker: str = Field(default="", max_length=40)
    subtitle: str = Field(default="", max_length=180)
    takeaway: str = Field(default="", max_length=140)
    bullets: list[str] = Field(default_factory=list, max_length=5)
    layout: Layout = "content"
    blocks: list[ContentBlock] = Field(default_factory=list, max_length=4)
    citations: list[Citation] = Field(default_factory=list, max_length=5)
    chart_data: list[ChartDatum] = Field(default_factory=list, max_length=8)


class OutlineRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=240)
    audience: str = Field(default="高校课程学习者", max_length=120)
    purpose: str = Field(default="课堂讲解", max_length=80)
    visual_style: VisualStyle = "paper"
    page_count: int = Field(default=10, ge=7, le=18)
    provider: Provider
    course_id: int | None = None
    knowledge_base_id: int | None = None
    allow_local_fallback: bool = False


class RewriteRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=240)
    audience: str = Field(default="高校课程学习者", max_length=120)
    purpose: str = Field(default="课堂讲解", max_length=80)
    visual_style: VisualStyle = "paper"
    provider: Provider
    course_id: int | None = None
    knowledge_base_id: int | None = None
    slide: SlideDraft
    instruction: str = Field(default="按结论—证据—行动重写，减少堆字", max_length=400)
    allow_local_fallback: bool = False


def _provider_label(provider: str) -> str:
    return {"qwen": "Qwen", "deepseek": "DeepSeek", "spark": "讯飞星火 4.0 Ultra", "mimo": "MiMo"}[provider]


def _visual_style_label(style: VisualStyle) -> str:
    return {
        "paper": "象牙金学术叙事：克制、编辑感、重点鲜明",
        "graphite": "深海电光演示：高对比、舞台感、适合投屏",
        "sage": "苔原青金课堂：自然、清晰、亲和但不幼稚",
    }[style]


async def _collect_context(
    *,
    topic: str,
    course_id: int | None,
    knowledge_base_id: int | None,
    user_id: int,
    db: AsyncSession,
) -> list[dict]:
    items: list[dict] = []
    if course_id is not None:
        bundle = await get_rag_service().search_with_meta(topic, 5, course_id=course_id)
        items.extend(
            {
                "kind": "course",
                "source": row.get("source") or "课程知识库",
                "page": row.get("page"),
                "chunk_id": str(row.get("chunk_id") or ""),
                "content": row.get("content") or "",
            }
            for row in bundle["results"]
        )
    if knowledge_base_id is not None:
        private_items = await search_owned_library(
            db,
            user_id=user_id,
            library_id=knowledge_base_id,
            query=topic,
            limit=5,
            with_semantic=False,
        )
        if not private_items:
            # 不区分“不属于当前用户”和“库中无命中”，避免泄露其他用户资源是否存在。
            raise HTTPException(status_code=404, detail="当前私有知识库不存在或没有可引用内容")
        items.extend(
            {
                "kind": "private",
                "source": row["source"],
                "page": row.get("page"),
                "chunk_id": str(row.get("chunk_id") or ""),
                "content": row.get("content") or "",
            }
            for row in private_items
        )
    return items[:10]


def _citation(item: dict) -> dict:
    return {
        "source": str(item.get("source") or "用户输入主题")[:256],
        "page": item.get("page"),
        "chunk_id": str(item.get("chunk_id") or "") or None,
        "kind": item.get("kind") if item.get("kind") in {"course", "private"} else "topic",
    }


def _local_outline(req: OutlineRequest, context: list[dict]) -> list[dict]:
    content_pages = max(2, req.page_count - 4)
    chapters = [
        ("为什么值得学", "先看它解决什么问题，以及理解它之后能做什么。"),
        ("抓住核心直觉", "把抽象定义转换成一个可观察、可复述的判断。"),
        ("方法如何运转", "沿着输入、判断、更新和结果拆开推理链路。"),
        ("放进真实情境", "用一个贴近课程的场景检验方法是否真的成立。"),
        ("两种思路怎么选", "比较适用条件、代价和最容易被忽略的差异。"),
        ("避开常见误区", "识别看似正确但会把结论带偏的判断方式。"),
        ("从理解走向应用", "把今天的结论变成下一次练习时可执行的动作。"),
    ]
    citations = [_citation(item) for item in context[:3]] or [
        {"source": "用户输入主题", "page": None, "chunk_id": None, "kind": "topic"}
    ]
    slides: list[dict] = [
        {
            "title": req.topic,
            "kicker": req.purpose,
            "subtitle": f"为{req.audience}建立一条从直觉到应用的学习路径",
            "takeaway": "先理解为什么，再看它怎样工作。",
            "bullets": [],
            "layout": "cover",
            "blocks": [],
            "citations": citations[:1],
            "chart_data": [],
        },
        {
            "title": "这次不从公式开始",
            "kicker": "LEARNING JOURNEY",
            "subtitle": "我们会沿着问题、直觉、方法和应用逐步推进。",
            "takeaway": "每一页只解决一个关键问题。",
            "bullets": [],
            "layout": "agenda",
            "blocks": [
                {"heading": f"{index + 1:02d}", "body": title}
                for index, (title, _description) in enumerate(chapters[: min(4, content_pages)])
            ],
            "citations": [],
            "chart_data": [],
        },
    ]
    for index in range(content_pages):
        layout_cycle: tuple[Layout, ...] = (
            "spotlight",
            "content",
            "process",
            "case",
            "comparison",
            "content",
        )
        layout = layout_cycle[index % len(layout_cycle)]
        chapter_title, chapter_description = chapters[index % len(chapters)]
        slide = {
            "title": chapter_title,
            "kicker": f"{index + 1:02d} · {req.topic[:20]}",
            "subtitle": chapter_description,
            "takeaway": chapter_description,
            "bullets": [
                f"先用一句话说清“{req.topic}”在这里承担的作用",
                "再用课程或私有资料中的依据解释原因",
                "最后落到一个可以验证的例子或行动",
            ],
            "layout": layout,
            "blocks": [
                {"heading": "先观察", "body": f"找到与“{req.topic}”直接相关的现象或问题。"},
                {"heading": "再解释", "body": "用可靠资料中的概念与因果关系解释它。"},
                {"heading": "去验证", "body": "换一个例子，检查结论是否仍然成立。"},
            ],
            "citations": citations[index % len(citations):] + citations[: index % len(citations)],
            "chart_data": [],
        }
        if layout == "comparison":
            slide["blocks"] = [
                {"heading": "适合这样做", "body": "条件明确、证据充分，并且能够检查结果。"},
                {"heading": "不宜直接套用", "body": "前提不清、数据不足，或结论无法被验证。"},
            ]
        if layout == "case":
            slide["kicker"] = "CASE IN CONTEXT"
            slide["takeaway"] = "真正的理解发生在你能解释一个新例子时。"
        slides.append(slide)
    slides.extend([
        {
            "title": "把结论带到下一次练习里",
            "kicker": "TAKE IT FORWARD",
            "subtitle": "结束不是复述目录，而是明确接下来怎样验证自己的理解。",
            "takeaway": f"能解释、能比较、能应用，才算真正掌握“{req.topic}”。",
            "bullets": ["用自己的话复述核心直觉", "找一道新题检验适用条件", "记录仍然解释不通的环节"],
            "layout": "summary",
            "blocks": [],
            "citations": citations[:2],
            "chart_data": [],
        },
        {
            "title": "从一个还没想通的问题继续",
            "kicker": "OPEN QUESTION",
            "subtitle": "哪一个前提变化后，会让刚才的结论不再成立？",
            "takeaway": "好的问题，是把理解推向下一层的入口。",
            "bullets": [],
            "layout": "summary",
            "blocks": [],
            "citations": [],
            "chart_data": [],
        },
    ])
    return slides[: req.page_count]


def _json_object(raw: str) -> dict:
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    decoder = json.JSONDecoder()
    candidates = [0, *(index for index, char in enumerate(text) if char == "{")]
    for start in dict.fromkeys(candidates):
        try:
            payload, _end = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise HTTPException(status_code=502, detail="模型没有返回可验证的 PPT 结构，请重试所选模型")


def _clean_text(value: object, max_length: int, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False)
    else:
        text = str(value)
    return re.sub(r"\s+", " ", text).strip()[:max_length] or default


def _clean_page(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        page = int(value)
    except (TypeError, ValueError):
        return None
    return page if page > 0 else None


def _normalize_slide(raw: dict, index: int) -> dict:
    layout = str(raw.get("layout") or "content").strip().lower()
    if layout not in Layout.__args__:
        layout = "content"

    raw_bullets = raw.get("bullets")
    bullets = (
        [_clean_text(item, 180) for item in raw_bullets[:5]]
        if isinstance(raw_bullets, list)
        else []
    )
    bullets = [item for item in bullets if item]

    blocks: list[dict] = []
    raw_blocks = raw.get("blocks")
    if isinstance(raw_blocks, list):
        for item in raw_blocks[:4]:
            if not isinstance(item, dict):
                continue
            heading = _clean_text(item.get("heading"), 48)
            body = _clean_text(item.get("body"), 220)
            if heading or body:
                blocks.append({"heading": heading, "body": body})

    citations: list[dict] = []
    raw_citations = raw.get("citations")
    if isinstance(raw_citations, list):
        for item in raw_citations[:5]:
            if not isinstance(item, dict):
                continue
            source = _clean_text(item.get("source"), 256)
            if not source:
                continue
            kind = str(item.get("kind") or "topic").strip().lower()
            if kind not in {"course", "private", "topic"}:
                kind = "topic"
            citations.append({
                "source": source,
                "page": _clean_page(item.get("page")),
                "chunk_id": _clean_text(item.get("chunk_id"), 128) or None,
                "kind": kind,
            })

    chart_data: list[dict] = []
    raw_chart_data = raw.get("chart_data")
    if isinstance(raw_chart_data, list):
        for item in raw_chart_data[:8]:
            if not isinstance(item, dict):
                continue
            label = _clean_text(item.get("label"), 32)
            try:
                value = float(item.get("value"))
            except (TypeError, ValueError):
                continue
            if label and math.isfinite(value):
                chart_data.append({"label": label, "value": value})

    title = _clean_text(raw.get("title"), 120)
    return {
        "title": title or f"第 {index + 1} 页",
        "kicker": _clean_text(raw.get("kicker"), 40),
        "subtitle": _clean_text(raw.get("subtitle"), 180),
        "takeaway": _clean_text(raw.get("takeaway"), 140),
        "bullets": bullets,
        "layout": layout,
        "blocks": blocks,
        "citations": citations,
        "chart_data": chart_data,
    }


def _layout_candidates(slide: dict) -> tuple[Layout, ...]:
    if slide["chart_data"]:
        return ("chart", "content", "spotlight")
    block_count = len(slide["blocks"])
    if block_count >= 3:
        return ("process", "case", "content")
    if block_count == 2:
        return ("comparison", "case", "content")
    if block_count == 1:
        return ("case", "content", "spotlight")
    return ("spotlight", "qa", "content")


def _repair_layouts(slides: list[dict]) -> None:
    if not slides:
        return
    slides[0]["layout"] = "cover"
    slides[-1]["layout"] = "summary"
    for index in range(1, len(slides) - 1):
        current = slides[index]["layout"]
        previous = slides[index - 1]["layout"]
        if current in {"cover", "summary"} or (
            current == previous and current not in {"content", "case"}
        ):
            slides[index]["layout"] = next(
                candidate
                for candidate in _layout_candidates(slides[index])
                if candidate != previous
            )

    required = min(4, len(slides))
    present = {slide["layout"] for slide in slides}
    if len(present) >= required:
        return
    for index in range(1, len(slides) - 1):
        previous = slides[index - 1]["layout"]
        following = slides[index + 1]["layout"]
        replacement = next(
            (
                candidate
                for candidate in _layout_candidates(slides[index])
                if candidate not in present and candidate not in {previous, following}
            ),
            None,
        )
        if replacement is None:
            continue
        slides[index]["layout"] = replacement
        present.add(replacement)
        if len(present) >= required:
            return


def _normalized_slides(payload: dict, limit: int) -> list[dict]:
    raw_slides = payload.get("slides")
    if not isinstance(raw_slides, list):
        raise HTTPException(status_code=502, detail="模型返回内容缺少 slides 数组")
    slides: list[dict] = []
    for raw in raw_slides[:limit]:
        if not isinstance(raw, dict):
            continue
        try:
            normalized = _normalize_slide(raw, len(slides))
            slides.append(SlideDraft.model_validate(normalized).model_dump())
        except Exception:
            continue
    return slides


def _validated_slides(payload: dict, expected_count: int | None = None) -> list[dict]:
    minimum = expected_count if expected_count is not None else 1
    slides = _normalized_slides(payload, expected_count or 1)
    if len(slides) < minimum:
        raise HTTPException(status_code=502, detail="模型返回的有效页面数量不足，请重试")
    if expected_count is not None:
        _repair_layouts(slides)
    return slides


def _context_prompt(context: list[dict]) -> str:
    if not context:
        return "没有检索到外部资料，只能基于用户输入主题组织结构；不得虚构引用。"
    return "\n\n".join(
        f"[{index}] 来源={item['source']}；页码={item.get('page') or '未标注'}；"
        f"chunk_id={item.get('chunk_id') or '无'}；类型={item['kind']}\n{item['content'][:1800]}"
        for index, item in enumerate(context, start=1)
    )


def _model_unavailable(provider: str) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=f"{_provider_label(provider)} 尚未配置，未调用也未静默切换其他模型；可明确选择“使用本地策略”继续",
    )


def _merge_supplemental_slides(
    current: list[dict],
    additions: list[dict],
    expected_count: int,
) -> list[dict]:
    if not additions or len(current) >= expected_count:
        return current[:expected_count]
    summary = current[-1] if current and current[-1]["layout"] == "summary" else None
    body = current[:-1] if summary else list(current)
    known_titles = {
        re.sub(r"\s+", "", str(slide["title"])).lower()
        for slide in current
    }
    for slide in additions:
        normalized_title = re.sub(r"\s+", "", str(slide["title"])).lower()
        if normalized_title and normalized_title in known_titles:
            continue
        body.append(slide)
        if normalized_title:
            known_titles.add(normalized_title)
        if len(body) + (1 if summary else 0) >= expected_count:
            break
    if summary:
        body.append(summary)
    return body[:expected_count]


async def _complete_outline_slides(
    *,
    client,
    req: OutlineRequest,
    context: list[dict],
    slides: list[dict],
) -> list[dict]:
    current = list(slides)
    for _attempt in range(2):
        missing = req.page_count - len(current)
        if missing <= 0:
            break
        existing_titles = "；".join(slide["title"] for slide in current) or "无"
        system_prompt = (
            "你是教学演示文稿补页编辑。严格返回 JSON 对象 {\"slides\": [...]}，"
            "不要输出解释或 Markdown。每页字段为 title、kicker、subtitle、takeaway、"
            "bullets、layout、blocks、citations、chart_data。补充页必须延续已有叙事，"
            "不能重复已有标题，不能使用 cover 或 summary。引用只能来自提供的资料；"
            "没有可靠数字时 chart_data 必须为空。\n\n"
            f"已有页面标题：{existing_titles}\n\n"
            f"可用资料：\n{_context_prompt(context)}"
        )
        user_prompt = (
            f"主题是“{req.topic}”。当前已有 {len(current)} 页，目标是 {req.page_count} 页。"
            f"请只生成缺少的恰好 {missing} 个中间页面，返回 JSON 对象。"
        )
        raw = await client.chat_structured(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.45,
        )
        additions = _normalized_slides(_json_object(raw), missing)
        current = _merge_supplemental_slides(current, additions, req.page_count)

    if len(current) < req.page_count:
        raise HTTPException(
            status_code=502,
            detail=(
                f"{_provider_label(req.provider)} 返回了 {len(current)}/{req.page_count} 页，"
                "已自动补页但仍不足，请重试所选模型"
            ),
        )
    _repair_layouts(current)
    return current


@router.post("/outline")
async def generate_outline(
    req: OutlineRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    context = await _collect_context(
        topic=req.topic,
        course_id=req.course_id,
        knowledge_base_id=req.knowledge_base_id,
        user_id=user.id,
        db=db,
    )
    if not has_llm_key(req.provider):
        if not req.allow_local_fallback:
            raise _model_unavailable(req.provider)
        return {
            "mode": "local_fallback",
            "provider": req.provider,
            "message": f"{_provider_label(req.provider)} 未配置；已按你的明确选择使用本地确定性策略",
            "slides": _local_outline(req, context),
        }

    prompt = (
        "你是一位一线高校讲师和演示文稿视觉总监。请大胆策划，但严格返回 JSON 对象 "
        "{\"slides\": [...]}，不要输出解释或 Markdown。\n"
        f"【页数硬约束】必须生成恰好 {req.page_count} 页，slides 数组长度必须等于 {req.page_count}，"
        f"不得少于或多于 {req.page_count}。请在内部按 1 到 {req.page_count} 逐页计数，"
        "输出前再次检查数组长度；不要把两页合并成一页，也不要省略看似次要的页面。"
        f"目标受众是“{req.audience}”，用途是“{req.purpose}”。"
        f"视觉方向：{_visual_style_label(req.visual_style)}。\n"
        "先在内部确定一句话传播任务和一条累进叙事线，再输出页面；不要把这些内部计划写进可见文案。"
        "每页只承担一个叙事任务，标题要直接表达结论或悬念，避免“概念介绍/案例分析/总结”式目录标题。"
        "第一页必须是 cover，最后一页必须用 summary 收束开场问题并给出下一步；agenda 可选，不能拿目录冒充叙事。"
        "整套至少使用 4 种 layout，相邻页尽量使用不同轮廓。layout 可选："
        "cover、agenda、content、case、chart、process、comparison、spotlight、summary、qa。"
        "优先使用 process、comparison、spotlight、case 打破连续项目符号页面。"
        "chart 只有在资料中存在可靠数字时才使用；严禁为了好看编造数据。"
        "每页字段：title、kicker、subtitle、takeaway、bullets、layout、blocks、citations、chart_data。"
        "kicker 是不超过 20 字的章节眉题；subtitle 不超过 60 字；takeaway 是一句不超过 45 字的核心结论。"
        "bullets 不超过 5 条，每条尽量不超过 30 字。blocks 为 0-4 个 {heading,body}："
        "agenda/process 使用 3-4 个步骤，comparison 使用恰好 2 个对照块，case 使用 2-3 个观察块。"
        "可见文案必须面向听众，禁止出现“本页将、用于演示、结构示例、请补充数据、AI 生成”等制作提示。"
        "citations 只能引用下方资料，字段为 source/page/chunk_id/kind；没有依据就留空，严禁虚构来源。\n\n"
        f"主题：{req.topic}\n\n可用资料：\n{_context_prompt(context)}"
    )
    user_prompt = (
        f"请现在为主题“{req.topic}”生成恰好 {req.page_count} 页 PPT 大纲。"
        f"硬性验收条件：slides.length === {req.page_count}；"
        "slides[0].layout === \"cover\"；"
        f"slides[{req.page_count - 1}].layout === \"summary\"。"
        "严格执行系统消息中的结构、叙事、引用和字数要求；"
        "只返回一个以 slides 为顶层字段的 JSON 对象。"
    )
    try:
        client = get_llm_client(req.provider)
        raw = await client.chat_structured(
            [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.5,
            max_tokens=max(8000, req.page_count * 900),
        )
        slides = _normalized_slides(_json_object(raw), req.page_count)
        slides = await _complete_outline_slides(
            client=client,
            req=req,
            context=context,
            slides=slides,
        )
    except HTTPException as exc:
        logger.warning(
            "PPT outline rejected provider=%s page_count=%s reason=%s",
            req.provider,
            req.page_count,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception(
            "PPT outline upstream failure provider=%s page_count=%s",
            req.provider,
            req.page_count,
        )
        raise HTTPException(
            status_code=502,
            detail=f"{_provider_label(req.provider)} 生成失败，未切换其他模型；请重试所选模型",
        ) from exc
    return {
        "mode": "model",
        "provider": req.provider,
        "message": f"已由 {_provider_label(req.provider)} 结合课程与私有知识上下文生成",
        "slides": slides,
    }


@router.post("/rewrite")
async def rewrite_slide(
    req: RewriteRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    context = await _collect_context(
        topic=f"{req.topic} {req.slide.title}",
        course_id=req.course_id,
        knowledge_base_id=req.knowledge_base_id,
        user_id=user.id,
        db=db,
    )
    if not has_llm_key(req.provider):
        if not req.allow_local_fallback:
            raise _model_unavailable(req.provider)
        clean = [
            re.sub(r"^(首先|其次|最后|要点[一二三]：?)", "", bullet).strip()
            for bullet in req.slide.bullets
        ]
        prefixes = ("先给结论：", "用证据验证：", "落到行动：", "继续追问：")
        slide = req.slide.model_copy(update={
            "bullets": [f"{prefixes[index]}{bullet}" for index, bullet in enumerate(clean[:4])],
        })
        return {
            "mode": "local_fallback",
            "provider": req.provider,
            "message": f"{_provider_label(req.provider)} 未配置；已按你的明确选择使用本地确定性重写",
            "slide": slide.model_dump(),
        }

    prompt = (
        "你是教学演示文稿编辑。严格返回 JSON 对象 {\"slides\": [单页]}，保留可靠引用，"
        "不超过 4 条 bullets，不虚构资料和数据。标题必须是听众能直接理解的结论或悬念。"
        "主动改进 kicker、subtitle、takeaway 和 blocks，使页面不用依赖项目符号也能成立。"
        "若是 chart 页，只有原数据有可靠来源时才保留或改进 chart_data。"
        f"视觉方向：{_visual_style_label(req.visual_style)}。\n\n"
        f"主题：{req.topic}\n受众：{req.audience}\n用途：{req.purpose}\n重写要求：{req.instruction}\n"
        f"当前页：{json.dumps(req.slide.model_dump(), ensure_ascii=False)}\n\n可用资料：\n{_context_prompt(context)}"
    )
    user_prompt = (
        f"请现在按要求重写“{req.slide.title}”这一页。"
        "只返回一个包含单页 slides 数组的 JSON 对象，不要解释。"
    )
    try:
        raw = await get_llm_client(req.provider).chat_structured(
            [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.45,
        )
        slide = _validated_slides(_json_object(raw))[0]
    except HTTPException as exc:
        logger.warning(
            "PPT rewrite rejected provider=%s reason=%s",
            req.provider,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception("PPT rewrite upstream failure provider=%s", req.provider)
        raise HTTPException(
            status_code=502,
            detail=f"{_provider_label(req.provider)} 重写失败，未切换其他模型；请重试所选模型",
        ) from exc
    return {
        "mode": "model",
        "provider": req.provider,
        "message": f"当前页已由 {_provider_label(req.provider)} 重写",
        "slide": slide,
    }
