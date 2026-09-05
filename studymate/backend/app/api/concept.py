"""动画讲解 Agent：用户问题 → 智能匹配概念动画 + 个性化开场白。

设计：**确定性主题库 + 运行时脚本兜底**
- 前端当前注册 300 个高频主题：90 个专属动画和 210 个确定性脚本主题，五门课各 60 个。
- 没命中主题库时，由 LLM 现场编排分步动画脚本，前端使用通用模板播放。
- LLM 只编排「步骤文字脚本」，渲染由前端确定性模板完成——**不会翻车**。
- 每步脚本天然就是一句旁白，是后续「讲课模式 + 讯飞 TTS 连播」的原料。
- 无 LLM Key 或外部调用异常时，退回通用骨架脚本，保证页面不空白。
"""
import json
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.agents.video_agent import _build_script as _build_video_script
from app.db import async_session_maker
from app.db.models import ConceptArchive
from app.deps import require_user
from app.llm import get_llm_client, has_llm_key

router = APIRouter(prefix="/concept", tags=["concept"])

PROVIDER = "qwen"  # 与助教同引擎

_VALID_STATES = {"active", "done", "idle"}
DEFAULT_SHOWCASE_QUESTION = "FDE这个岗位是干什么的？"

DEFAULT_SHOWCASE_RESULT = {
    "matched": False,
    "key": None,
    "title": DEFAULT_SHOWCASE_QUESTION,
    "intro": "我用一份公共示例讲解 FDE 的岗位边界、工作闭环和交付价值。",
    "script": {
        "concept": DEFAULT_SHOWCASE_QUESTION,
        "summary": "FDE 把客户现场问题转成可落地、可验证、可复用的交付方案。",
        "steps": [
            {"title": "岗位定位", "desc": "FDE 连接产品与客户现场，不只解释产品，还要让方案真正跑起来。", "nodes": []},
            {"title": "理解场景", "desc": "先澄清业务目标、使用流程、数据条件、权限边界和验收标准。", "nodes": []},
            {"title": "完成集成", "desc": "把数据、接口、网络、配置与业务规则接起来，形成可执行方案。", "nodes": []},
            {"title": "现场验证", "desc": "通过关键任务、运行记录和业务指标确认方案可用、可交付。", "nodes": []},
            {"title": "复盘沉淀", "desc": "记录风险、客户反馈和产品改进点，让一次交付变成下一次的能力。", "nodes": []},
        ],
        "pitfall": "FDE 不等同于单纯售前、客服或驻场开发，核心是对客户现场的落地结果负责。",
        "visual": "board",
    },
    "generated": True,
    "mock": False,
    "shared": True,
}


class ConceptItem(BaseModel):
    key: str
    title: str
    course: str


class ExplainRequest(BaseModel):
    user_id: int = 1
    question: str = Field(min_length=1, max_length=500)
    concepts: list[ConceptItem] = Field(default_factory=list)
    matched_key: str | None = None  # 前端关键词初筛结果（可选）
    target_role: str | None = Field(default=None, max_length=120)
    role_summary: str | None = Field(default=None, max_length=500)
    core_competencies: list[str] = Field(default_factory=list, max_length=8)
    sample_tasks: list[str] = Field(default_factory=list, max_length=8)


def _title_of(concepts: list[ConceptItem], key: str) -> str:
    for c in concepts:
        if c.key == key:
            return c.title
    return key


def _archive_key(question: str) -> str:
    """让同一主题的空格、大小写和末尾标点差异共享一份归档。"""
    normalized = re.sub(r"\s+", "", question.strip()).casefold()
    return normalized.rstrip("。！？!?；;，,")


async def _load_shared_archive(question: str) -> dict | None:
    key = _archive_key(question)
    async with async_session_maker() as db:
        archive = await db.scalar(select(ConceptArchive).where(ConceptArchive.question_key == key))
        return dict(archive.result) if archive else None


async def _save_shared_archive(question: str, result: dict) -> dict:
    """首次生成时写入公共归档；并发请求命中唯一键时读取先写入的版本。"""
    key = _archive_key(question)
    async with async_session_maker() as db:
        archive = await db.scalar(select(ConceptArchive).where(ConceptArchive.question_key == key))
        if archive:
            return dict(archive.result)
        db.add(ConceptArchive(question_key=key, question=question.strip(), result=result))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            archive = await db.scalar(select(ConceptArchive).where(ConceptArchive.question_key == key))
            if archive:
                return dict(archive.result)
            raise
    return result


async def ensure_default_archive() -> None:
    """把全局 FDE 示例写入公共归档，行为与 PPT 的预置示例一致。"""
    key = _archive_key(DEFAULT_SHOWCASE_QUESTION)
    async with async_session_maker() as db:
        archive = await db.scalar(select(ConceptArchive).where(ConceptArchive.question_key == key))
        if archive is None:
            db.add(ConceptArchive(
                question_key=key,
                question=DEFAULT_SHOWCASE_QUESTION,
                result=DEFAULT_SHOWCASE_RESULT,
            ))
            await db.commit()


# ============================ 通用脚本编排 ============================


def _mock_script(question: str) -> dict:
    """无 LLM / 异常时的通用骨架脚本，保证当场必出、永不空白。"""
    q = question.strip()[:30] or "这个概念"
    return {
        "concept": q,
        "summary": f"分四步看懂「{q}」",
        "steps": [
            {"title": "是什么", "desc": f"先弄清「{q}」要解决什么问题、基本定义是什么。", "nodes": []},
            {"title": "关键机制", "desc": "抓住它最核心的一两个原理或组成部分。", "nodes": []},
            {"title": "怎么运作", "desc": "按顺序走一遍它的完整工作流程。", "nodes": []},
            {"title": "易错点", "desc": "留意最容易混淆或出错的地方。", "nodes": []},
        ],
        "pitfall": "",
        "visual": "board",  # 骨架没有模型 → 黑板讲解
    }


def _clean_script(data: dict, question: str) -> dict:
    """规整 LLM 输出：截断、校验 state、丢弃空步骤；任何异常退回骨架。"""
    steps_raw = data.get("steps")
    if not isinstance(steps_raw, list) or not steps_raw:
        return _mock_script(question)

    steps: list[dict] = []
    for s in steps_raw[:6]:
        if not isinstance(s, dict):
            continue
        title = str(s.get("title") or "").strip()[:16]
        desc = str(s.get("desc") or "").strip()[:80]
        if not title and not desc:
            continue
        nodes: list[dict] = []
        for n in (s.get("nodes") or [])[:6]:
            if isinstance(n, dict) and n.get("label"):
                state = n.get("state")
                nodes.append({
                    "label": str(n["label"]).strip()[:14],
                    "state": state if state in _VALID_STATES else "idle",
                })
        steps.append({"title": title or "步骤", "desc": desc, "nodes": nodes})

    if not steps:
        return _mock_script(question)

    # 渲染方式：LLM 给的 visual 优先；缺失则按「有没有节点」兜底判断
    visual = data.get("visual")
    if visual not in ("model", "board"):
        visual = "model" if any(s["nodes"] for s in steps) else "board"

    return {
        "concept": str(data.get("concept") or question).strip()[:30],
        "summary": str(data.get("summary") or "").strip()[:40],
        "steps": steps,
        "pitfall": str(data.get("pitfall") or "").strip()[:60],
        "visual": visual,
    }


async def _build_script(question: str, llm) -> dict:
    sys = (
        "你是「动画讲解」编剧。学生想理解一个概念，但动画库里没有现成动画，"
        "需要你把它拆成一份可逐步演示的「分步讲解脚本」。\n"
        "要求：\n"
        "1. 拆成 3~6 个循序渐进的步骤，每步一句话说明这一步发生了什么。\n"
        "2. 先判断这个概念**有没有天然的可视模型**（一组能在画面上摆出来、随步骤变化状态的"
        "「对象/阶段/状态」，如数组元素、协议阶段、树节点、网络分层、流水线段）：\n"
        '   - 有 → visual 填 "model"，并在相应步骤的 nodes 里列出这些对象，标注本步每个状态：'
        "active（正在操作）/ done（已完成）/ idle（尚未涉及）。\n"
        '   - 没有（偏抽象/思想/定义类，如「什么是泛型」「为什么要内存对齐」）→ visual 填 "board"，'
        "nodes 全部给空数组，由老师在黑板上逐行板书讲解即可。\n"
        "3. 内容必须准确，宁缺毋编。\n"
        '只输出 JSON：{"concept":"概念名","summary":"一句话抓住本质(25字内)",'
        '"visual":"model|board",'
        '"steps":[{"title":"步骤名(10字内)","desc":"这一步讲什么(40字内)",'
        '"nodes":[{"label":"对象名","state":"active|done|idle"}]}],'
        '"pitfall":"一个常见误区(没有就空字符串)"}'
    )
    try:
        raw = await llm.chat_structured(
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": f"请为「{question}」编排分步动画脚本。"},
            ]
        )
        data = json.loads(raw)
    except Exception:
        return _mock_script(question)
    return _clean_script(data if isinstance(data, dict) else {}, question)


# ============================ 主入口 ============================


@router.post("/explain")
async def explain(req: ExplainRequest, _user=Depends(require_user)):
    shared = await _load_shared_archive(req.question)
    if shared:
        return shared

    keys = {c.key for c in req.concepts}
    key_ok = has_llm_key(PROVIDER)

    # —— mock / 无 LLM ——
    if not key_ok:
        if req.matched_key and req.matched_key in keys:
            title = _title_of(req.concepts, req.matched_key)
            return {
                "matched": True,
                "key": req.matched_key,
                "title": title,
                "intro": f"我用动画给你讲讲「{title}」，下面边演示边看每一步。",
                "script": None,
                "generated": False,
                "mock": True,
            }
        # 没命中 → 通用模板兜底（仍有图画讲解）
        return await _save_shared_archive(req.question, {
            "matched": False,
            "key": None,
            "title": req.question,
            "intro": "动画库里还没有这个概念的专属动画，我现编排了一个分步讲解给你看 👇",
            "script": _mock_script(req.question),
            "generated": True,
            "mock": True,
        })

    # —— LLM 分类：先尝试命中手写动画 ——
    catalog = "\n".join(f"- {c.key}：{c.title}（{c.course}）" for c in req.concepts)
    role_context = ""
    if req.target_role:
        role_context = (
            f"\n当前目标岗位：{req.target_role}。"
            f"岗位简介：{req.role_summary or '未提供'}。"
            f"核心能力：{'、'.join(req.core_competencies[:8]) or '未提供'}。"
            "如果问题描述的是岗位任务，要优先判断它是否属于岗位流程，而不是强行匹配一个泛化概念动画。"
        )
    sys = (
        "你是「动画讲解」调度助手。根据学生的问题，从下列已有概念动画里选出最匹配的一个。\n"
        f"可选概念：\n{catalog}\n\n"
        '若没有任何一个相关，key 返回 "none"。\n'
        "再写一句 60 字以内、口语亲切的开场白，告诉学生你将用动画讲解这个概念（开场白里别提 key）。\n"
        '只输出 JSON：{"key": "...", "intro": "..."}'
    )
    hint = f"\n（关键词初筛提示：{req.matched_key}，仅供参考）" if req.matched_key else ""
    llm = get_llm_client(PROVIDER)
    try:
        raw = await llm.chat_structured(
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": req.question + role_context + hint},
            ]
        )
        data = json.loads(raw)
    except Exception:
        data = {}

    key = data.get("key")
    intro = (data.get("intro") or "").strip()

    # LLM 没选中合法 key 时，退回前端关键词匹配
    if key not in keys and req.matched_key in keys:
        key = req.matched_key

    # —— 命中手写动画 ——
    if key in keys:
        title = _title_of(req.concepts, key)
        if not intro:
            intro = f"我用动画给你讲讲「{title}」。"
        return {
            "matched": True,
            "key": key,
            "title": title,
            "intro": intro,
            "script": None,
            "generated": False,
            "mock": False,
        }

    # —— 没命中 → LLM 现场编排通用动画脚本 ——
    script = await _build_script(req.question, llm)
    return await _save_shared_archive(req.question, {
        "matched": False,
        "key": None,
        "title": req.question,
        "intro": f"动画库里还没有「{req.question}」的专属动画，我现编排了一个分步讲解给你看 👇",
        "script": script,
        "generated": True,
        "mock": False,
    })


def _video_job_initial(context: dict, job_id: str) -> dict:
    """保留旧数据结构的脚本快照兼容辅助函数；不创建后台视频任务。"""
    script = _build_video_script(context)
    return {
        "job_id": job_id,
        "type": "video",
        "title": script["title"],
        "provider": "frontend",
        "model": "scripted-lecture",
        "status": "script_ready",
        "message": "可视讲解脚本与分镜已生成，将使用前端动画、黑板和语音播放。",
        "video_url": "",
        "assembled_video_url": "",
        "task_id": "",
        "resolution": "768P",
        "duration": script["duration"],
        "total_duration": script["total_duration"],
        "segment_count": script["segment_count"],
        "completed_segments": 0,
        "segment_urls": [],
        "segments": script["segments"],
        "assembly_status": "not_applicable",
        "has_audio": True,
        "ratio": "16:9",
        "script": script,
        "usage": {},
        "complexity": script["complexity"],
        "scope": script["scope"],
        "duration_reason": script["duration_reason"],
        "estimated_cost_rmb": script["estimated_cost_rmb"],
        "actual_cost_rmb": 0,
    }
