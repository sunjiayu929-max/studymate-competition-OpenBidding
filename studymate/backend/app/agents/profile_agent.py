"""
ProfileAgent —— 对话式构建学生画像。
设计：单次 LLM 调用同时输出 (a) 给用户看的回话 (b) JSON patch 更新画像。
通过分隔符 SPLIT 切开两段：
  <用户可见回答>
  ---PROFILE-UPDATE---
  {"knowledge_base": {...}, "reasoning": "..."}
"""
from __future__ import annotations
import json
import re
from typing import AsyncIterator, Tuple

from app.llm import get_llm_client
from app.schemas.profile import ProfileDims

SPLIT = "---PROFILE-UPDATE---"

_SCORE_FIELDS: dict[str, set[str]] = {
    "knowledge_base": {"math", "programming", "statistics", "english", "subject_prior"},
    "cognitive_style": {"visual", "reading", "hands_on", "auditory"},
    "preference": {"document", "mindmap", "quiz", "code", "video", "reading"},
    "employment_skills": {"programming", "algorithms", "data_ai", "systems", "engineering", "professional"},
}
_PACE_INTENSITIES = {"slow", "medium", "fast", "intensive"}
_EXPERIENCE_RE = re.compile(
    r"做过|做了.{0,20}项目|已完成|完成了|完成过|参与了|参与过|我负责|本人负责|项目中负责|"
    r"主导了|主导过|实习过|实习期间|实习经历|工作中|项目中|使用过|用过|使用了|"
    r"开发了|开发过|实现了|实现过|部署了|部署过|上线|搭建了|搭建过|编写了|编写过|训练了|训练过",
    re.IGNORECASE,
)
_NO_EXPERIENCE_RE = re.compile(
    r"(?:"
    r"(?:目前|暂时|现在)?(?:没有|没|暂无|尚无|从未)(?:任何)?(?:相关的)?"
    r"(?:(?:做过|参与过|参加过|完成过|实习过)(?:任何)?的?)?"
    r"(?:项目经历|项目|实习经历|实习|竞赛经历|竞赛|比赛经历|比赛|实践经历|实践|工作经历)"
    r"|(?:从未|没有|没)实习过"
    r")",
    re.IGNORECASE,
)
_STRONG_EXPERIENCE_RE = re.compile(r"完成|部署|上线|负责|主导|实习|工作中|成果|获奖", re.IGNORECASE)
_EMPLOYMENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "programming": (
        "python", "java", "c++", "c语言", "javascript", "typescript", "golang", "rust",
        "vue", "react", "fastapi", "spring", "django", "flask", "编程", "编码", "前端", "后端", "接口", "api",
    ),
    "algorithms": ("算法", "数据结构", "leetcode", "动态规划", "搜索", "排序", "图算法", "算法建模"),
    "data_ai": (
        "人工智能", "机器学习", "深度学习", "数据分析", "数据处理", "模型训练", "pytorch", "tensorflow",
        "pandas", "numpy", "大模型", "llm", "ai",
    ),
    "systems": (
        "操作系统", "linux", "计算机网络", "tcp", "udp", "网络协议", "分布式", "云原生", "kubernetes",
        "嵌入式", "硬件", "cpu", "汇编", "系统编程",
    ),
    "engineering": (
        "项目", "测试", "部署", "上线", "git", "docker", "数据库", "接口", "api", "服务", "前端", "后端", "工程化",
    ),
    "professional": ("协作", "团队", "沟通", "汇报", "项目管理", "负责", "主导", "实习", "工作中"),
}

SYSTEM_PROMPT = """你是一位耐心的领域岗位训练顾问，正在通过自然对话了解学习者背景，
为他构建面向目标岗位的通用能力画像。你的任务有两部分：

【任务 A】给学生一个简短、自然、亲切的中文回话（控制在 80 字以内）。
- 一次只问 1 个最关键的问题，由浅入深
- 不要罗列所有维度，让对话自然
- 只有满足下方“画像完成约束”时，才可以总结并邀请进入学习工作台

【任务 B】根据本轮对话，输出一个 JSON patch（只放本轮**新增或更新**的字段，
不要重复已确认的字段）。

输出格式必须严格遵守（中间用分隔符切开）：

<回话文本>
---PROFILE-UPDATE---
{
  "knowledge_base": {"math": 3, "programming": 4, "subject_prior": 2},
  "cognitive_style": {"visual": 5},
  "goals": {"primary": "应聘前线部署工程师 / 完成岗位项目 / 补齐交付能力"},
  "weak_points": {"topics": ["概率论", "操作系统调度"]},
  "pace": {"hours_per_week": 8, "intensity": "medium"},
  "preference": {"video": 5, "code": 4},
  "employment_skills": {"programming": 4, "engineering": 3},
  "reasoning": "学生提到喜欢看视频和动手写代码，且数学基础一般"
}

【画像 schema】（值类型注意，每项 0-5 分，goals/weak_points 是字符串/数组）
- knowledge_base: math/programming/statistics/english/subject_prior (int 0-5)
  · subject_prior 是「当前目标岗位领域的先验分」，可跨岗位复用
- cognitive_style: visual/reading/hands_on/auditory (int 0-5)
- goals: primary(str)/deadline(str)/target_topics(list[str])
- weak_points: topics(list[str])/error_types(list[str])
- pace: hours_per_week(int 0-40)/intensity(str: slow/medium/fast/intensive)
- preference: document/mindmap/quiz/code/video/reading (int 0-5)
- employment_skills: programming/algorithms/data_ai/systems/engineering/professional (int 0-5)
  · 分别代表编程实现、算法建模、数据与 AI、系统与网络、工程实践、职业素养
  · 只有学生明确提到项目经历、使用过的技术、实践成果或职业经历时才更新
  · “想做某岗位”“对某方向感兴趣”只能写入 goals，不能直接当作已经具备就业技能
  · professional 只能依据明确的协作、表达、项目管理或实习经历更新

只输出本轮变化的字段。第一次见面学生还没说什么时，patch 可以是空 {} 或只填 reasoning。

【画像完成约束】
{completion_guidance}

【当前已有画像】
{current_profile}

【当前目标岗位】
{role_context}

后续追问必须优先补齐与当前目标岗位有关且证据不足的信息。遇到自评与项目证据矛盾时，
用一个具体岗位场景继续追问；不得把学习意愿直接当成已具备能力。
"""


def build_profile_evidence_text(history: list[dict], user_message: str) -> str:
    """汇总最近用户消息，供就业技能的确定性证据兜底使用。"""
    messages: list[str] = []
    for item in history[-10:]:
        if not isinstance(item, dict) or item.get("role") != "user":
            continue
        content = item.get("content")
        if isinstance(content, str) and content.strip():
            messages.append(content.strip())

    current = (user_message or "").strip()
    if current and (not messages or messages[-1] != current):
        messages.append(current)
    return "\n".join(messages)


def build_profile_completion_guidance(current_profile: ProfileDims) -> str:
    """给模型明确、可测试的画像完成条件，避免就业技能仍未知时过早收尾。"""
    employment = current_profile.employment_skills.model_dump()
    if any(score > 0 for score in employment.values()):
        return (
            "就业技能已经有至少一项可信实践证据。若本轮又出现新的项目、竞赛、实习、岗位训练实践或作品证据，"
            "仍须先写入 employment_skills patch；其余关键画像信息基本明确后才可宣布画像完善。"
        )
    return (
        "当前就业技能六项全为 0，含义是“尚无可信实践证据”，不是能力为零。宣布“画像已完善”、"
        "“信息收集完成”或邀请进入工作台之前，必须检查历史和本轮消息：若已有完成过的项目、竞赛、实习、"
        "岗位训练实践或作品证据，先在 employment_skills patch 中更新对应维度；若用户明确表示没有相关经历，"
        "保持 0 分并说明就业技能暂处于未评估状态；若两者都没有，只追问一个关于实践经历、技术栈、职责或成果的关键问题。"
    )


async def profile_chat_stream(
    user_message: str,
    history: list[dict],
    current_profile: ProfileDims,
    images: list[str] | None = None,
    target_role: str | None = None,
    core_competencies: list[str] | None = None,
) -> AsyncIterator[Tuple[str, str]]:
    """
    yield (event_type, data) 元组：
      ("delta", "<token>")
      ("patch", "<json string>")
      ("warning", "<warning text>")

    images（可选）：本轮用户消息附带的图片 base64，带图时切到 qwen-vl 视觉模型读图。
    """
    # 带图 → qwen-vl 视觉模型；纯文字 → 默认 provider（不影响原有抽取行为）
    llm = get_llm_client("qwen-vl") if images else get_llm_client()
    # 用 replace 而不是 .format —— prompt 里有大量 JSON 示例的 { } 会被 str.format 误当占位符崩
    sys = SYSTEM_PROMPT.replace(
        "{completion_guidance}",
        build_profile_completion_guidance(current_profile),
    ).replace("{current_profile}", current_profile.model_dump_json()).replace(
        "{role_context}",
        json.dumps({
            "target_role": target_role or "尚未选择",
            "core_competencies": core_competencies or [],
        }, ensure_ascii=False),
    )

    msgs = [{"role": "system", "content": sys}]
    for h in history[-10:]:
        msgs.append(h)
    if images:
        # 多模态 content 数组：文本 + 图片（历史仍是纯文字，只有本轮带图）
        user_content: list[dict] = []
        if user_message:
            user_content.append({"type": "text", "text": user_message})
        for url in images:
            user_content.append({"type": "image_url", "image_url": {"url": url}})
        msgs.append({"role": "user", "content": user_content})
    else:
        msgs.append({"role": "user", "content": user_message})

    # reply_buf 仅在回话阶段持有"待 flush 的尾部"——可能是 SPLIT 前缀，需要先憋住
    reply_buf = ""
    json_buf = ""
    in_reply_phase = True

    async for tok in llm.chat_stream(messages=msgs, temperature=0.7):
        if in_reply_phase:
            reply_buf += tok
            if SPLIT in reply_buf:
                head, _, tail = reply_buf.partition(SPLIT)
                if head:
                    yield ("delta", head)
                in_reply_phase = False
                json_buf = tail  # 分隔符后的内容算 JSON
                reply_buf = ""
            else:
                # 末尾如果可能是 SPLIT 的前缀，就先憋着；其它部分安全 flush
                keep = 0
                for i in range(1, min(len(SPLIT), len(reply_buf)) + 1):
                    if SPLIT.startswith(reply_buf[-i:]):
                        keep = i
                if keep < len(reply_buf):
                    safe = reply_buf[:-keep] if keep > 0 else reply_buf
                    if safe:
                        yield ("delta", safe)
                    reply_buf = reply_buf[-keep:] if keep > 0 else ""
        else:
            json_buf += tok

    # 收尾：如果 reply_buf 还有剩，意味着 LLM 没出分隔符（一次性出完回话没带 JSON）
    # 那剩下的就是正常回话尾部，flush 出去
    if in_reply_phase and reply_buf:
        yield ("delta", reply_buf)

    patch, warning = extract_profile_patch(json_buf)
    if warning:
        yield ("warning", warning)
    yield ("patch", json.dumps(patch, ensure_ascii=False))


def extract_profile_patch(raw: str) -> tuple[dict, str | None]:
    """从代码块或带前后说明的模型输出中提取第一个 JSON 对象。"""
    text = (raw or "").strip()
    if not text:
        return {}, "模型未返回画像更新，已保留现有画像"
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value, None
    except (TypeError, ValueError):
        pass

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        try:
            value, _ = decoder.raw_decode(text[match.start():])
        except ValueError:
            continue
        if isinstance(value, dict):
            return value, "模型输出包含额外文字，已提取其中的画像更新"
    return {}, "模型返回的画像更新格式无法识别，已保留现有画像"


def _score(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(0, min(5, int(float(value) + 0.5)))


def _clean_string_list(value: object, *, max_items: int, max_len: int) -> list[str] | None:
    if not isinstance(value, list):
        return None
    return [str(item).strip()[:max_len] for item in value if str(item).strip()][:max_items]


def _supplement_employment_evidence(
    evidence_context: str,
    patch: dict,
    current_profile: ProfileDims,
) -> list[str]:
    """只对明确经历做保守补全；意向和兴趣不会转化为就业技能。"""
    text = (evidence_context or "").strip().lower()
    evidence_text = _NO_EXPERIENCE_RE.sub(" ", text)
    if not evidence_text or not _EXPERIENCE_RE.search(evidence_text):
        return []

    employment = patch.setdefault("employment_skills", {})
    if not isinstance(employment, dict):
        employment = {}
        patch["employment_skills"] = employment
    current = current_profile.employment_skills.model_dump()
    evidence_score = 3 if _STRONG_EXPERIENCE_RE.search(evidence_text) else 2
    supplemented: list[str] = []
    for field, keywords in _EMPLOYMENT_KEYWORDS.items():
        if field in employment or not any(keyword in evidence_text for keyword in keywords):
            continue
        next_score = max(current.get(field, 0), evidence_score)
        if next_score > current.get(field, 0):
            employment[field] = next_score
            supplemented.append(field)
    if not employment:
        patch.pop("employment_skills", None)
    return supplemented


def sanitize_profile_patch(
    raw_patch: object,
    current_profile: ProfileDims,
    evidence_context: str = "",
) -> tuple[dict, str | None]:
    """逐字段清洗画像补丁，避免一个坏字段让整轮合法更新全部失效。"""
    if not isinstance(raw_patch, dict):
        return {}, "画像更新不是有效对象，已保留现有画像"

    patch: dict = {}
    dropped = False
    for section, fields in _SCORE_FIELDS.items():
        value = raw_patch.get(section)
        if value is None:
            continue
        if not isinstance(value, dict):
            dropped = True
            continue
        clean: dict[str, int] = {}
        for key, score_value in value.items():
            score = _score(score_value)
            if key not in fields or score is None:
                dropped = True
                continue
            clean[key] = score
        if clean:
            patch[section] = clean

    goals = raw_patch.get("goals")
    if goals is not None:
        if isinstance(goals, dict):
            clean_goals: dict[str, object] = {}
            for key, max_len in (("primary", 160), ("deadline", 80)):
                if key in goals and isinstance(goals[key], str):
                    clean_goals[key] = goals[key].strip()[:max_len]
                elif key in goals:
                    dropped = True
            if "target_topics" in goals:
                topics = _clean_string_list(goals["target_topics"], max_items=10, max_len=50)
                if topics is None:
                    dropped = True
                else:
                    clean_goals["target_topics"] = topics
            if clean_goals:
                patch["goals"] = clean_goals
        else:
            dropped = True

    weak_points = raw_patch.get("weak_points")
    if weak_points is not None:
        if isinstance(weak_points, dict):
            clean_weak: dict[str, list[str]] = {}
            for key, max_items, max_len in (("topics", 10, 50), ("error_types", 8, 30)):
                if key not in weak_points:
                    continue
                items = _clean_string_list(weak_points[key], max_items=max_items, max_len=max_len)
                if items is None:
                    dropped = True
                else:
                    clean_weak[key] = items
            if clean_weak:
                patch["weak_points"] = clean_weak
        else:
            dropped = True

    pace = raw_patch.get("pace")
    if pace is not None:
        if isinstance(pace, dict):
            clean_pace: dict[str, object] = {}
            hours = pace.get("hours_per_week")
            if hours is not None:
                if isinstance(hours, bool) or not isinstance(hours, (int, float)):
                    dropped = True
                else:
                    clean_pace["hours_per_week"] = max(0, min(40, int(float(hours) + 0.5)))
            intensity = pace.get("intensity")
            if intensity is not None:
                if intensity in _PACE_INTENSITIES:
                    clean_pace["intensity"] = intensity
                else:
                    dropped = True
            if clean_pace:
                patch["pace"] = clean_pace
        else:
            dropped = True

    reasoning = raw_patch.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        patch["reasoning"] = reasoning.strip()[:500]
    elif reasoning is not None:
        dropped = True

    supplemented = _supplement_employment_evidence(evidence_context, patch, current_profile)
    if supplemented:
        evidence_reason = "根据对话中的明确项目或实践经历补充就业技能证据"
        patch["reasoning"] = f"{patch.get('reasoning', '')}；{evidence_reason}".strip("；")[:500]

    warning = "部分画像字段格式无效，已忽略；其余合法更新已保留" if dropped else None
    return patch, warning


def merge_patch(base: ProfileDims, patch: dict) -> ProfileDims:
    """把 patch 合并进当前画像。深合并：dict 项合并，list/标量覆盖。"""
    cur = base.model_dump()
    for k, v in patch.items():
        if k == "reasoning":
            continue
        if not isinstance(v, dict):
            continue
        cur.setdefault(k, {})
        if isinstance(cur[k], dict):
            for sk, sv in v.items():
                cur[k][sk] = sv
    return ProfileDims.model_validate(cur)
