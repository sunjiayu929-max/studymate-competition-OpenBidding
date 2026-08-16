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
_KNOWLEDGE_TERMS = (
    "数学", "编程", "代码", "python", "java", "c++", "统计", "概率", "英语",
    "岗位知识", "领域知识", "专业知识", "课程基础", "技术基础",
)
_KNOWLEDGE_LEVEL_TERMS = (
    "熟悉", "掌握", "擅长", "扎实", "熟练", "了解", "学过", "没学", "基础",
    "一般", "薄弱", "较弱", "较好", "零基础",
)
_COGNITIVE_TERMS = (
    "图示", "图表", "可视化", "阅读理解", "看文档理解", "动手理解", "边做边学",
    "实操理解", "听讲", "讲解理解", "学习方式", "认知方式",
)
_RESOURCE_TERMS = (
    "文档", "讲义", "思维导图", "小测", "测验", "代码实操", "实操任务", "视频",
    "论文", "书籍", "阅读材料", "资源形式",
)
_EXPERIENCE_RE = re.compile(
    r"做过|做了.{0,20}项目|已完成|完成了|完成过|参与了|参与过|我负责|本人负责|项目中负责|"
    r"主导了|主导过|实习过|实习期间|实习经历|工作中|项目中|使用过|用过|使用了|"
    r"开发了|开发过|实现了|实现过|部署了|部署过|上线|搭建了|搭建过|编写了|编写过|训练了|训练过",
    re.IGNORECASE,
)
_NO_EXPERIENCE_RE = re.compile(
    r"(?:"
    r"(?:目前|暂时|现在)?(?:没有|没|暂无|尚无|从未)(?:任何)?(?:相关(?:的)?)?"
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

【任务 A】给学生一个简短、自然、亲切的中文回话（控制在 140 字以内）。
- 完整画像必须覆盖：学历专业、知识基础与薄弱点、认知风格、资源偏好、就业技能/实践证据、学习时间
- 每次只询问一个主题组，把同组的 1-2 个维度合并提问；通常用 3 轮完成，避免一项一问或一次堆满所有问题
- 不得询问历史中已经问过或当前画像已经确认的信息，不得换一种说法重复追问
- 完整画像一旦形成，必须立即停止追问，简短总结并邀请进入岗位训练中心

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
  "learner_background": {"education": "本科大三", "major": "计算机科学", "practice_status": "has"},
  "profile_coverage": {"knowledge_base": true, "cognitive_style": true, "resource_preference": true, "employment_skills": true},
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
- learner_background: education(str)/major(str)/practice_status(unknown|none|has)
  · 用户明确表示没有相关项目或实习时，practice_status 必须写 none；有明确经历时写 has
- profile_coverage: knowledge_base/cognitive_style/resource_preference/employment_skills (bool)
  · 只有用户明确回答了对应主题时才写 true；即使用户回答“各方式都可以”或各项处于中性水平，也要标记对应主题已确认

只输出本轮变化的字段。第一次见面学生还没说什么时，patch 可以是空 {} 或只填 reasoning。

【画像完成约束】
{completion_guidance}

【本轮之后仍缺少的信息与防重复要求】
{question_guidance}

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
    """给模型明确、可测试的完整画像完成条件。"""
    missing = profile_missing_fields(current_profile)
    if not missing:
        return "知识、认知、资源、就业与学习安排等画像维度均已确认。画像已完成，禁止继续提问。"
    return f"完整画像仍缺：{'、'.join(missing)}。每轮只询问一个相关主题组，不要把所有缺项一次堆给用户。"


def profile_missing_fields(current_profile: ProfileDims, target_role: str | None = None) -> list[str]:
    """返回完成岗位画像仍缺少的描述性证据字段。"""
    missing: list[str] = []
    background = current_profile.learner_background
    coverage = current_profile.profile_coverage
    if not (current_profile.goals.primary.strip() or str(target_role or "").strip()):
        missing.append("目标岗位")
    if not (background.education.strip() or background.major.strip()):
        missing.append("学历与专业背景")
    knowledge_is_described = (
        coverage.knowledge_base
        or any(value != 3 for value in current_profile.knowledge_base.model_dump().values())
        or bool(current_profile.weak_points.topics or current_profile.theory_assessments)
    )
    if not knowledge_is_described:
        missing.append("知识基础与薄弱点")
    if not (
        coverage.cognitive_style
        or any(value != 3 for value in current_profile.cognitive_style.model_dump().values())
    ):
        missing.append("认知风格")
    if not (
        coverage.resource_preference
        or any(value != 3 for value in current_profile.preference.model_dump().values())
    ):
        missing.append("资源偏好")
    has_employment_evidence = any(value > 0 for value in current_profile.employment_skills.model_dump().values())
    if not coverage.employment_skills and background.practice_status == "unknown" and not has_employment_evidence:
        missing.append("就业技能与实践经历")
    if current_profile.pace.hours_per_week <= 0:
        missing.append("学习目标与时间安排")
    return missing


def _evidence_covers_missing(field: str, evidence: str, target_role: str | None) -> bool:
    text = evidence.lower()
    if field == "目标岗位":
        return bool(str(target_role or "").strip()) or any(word in text for word in ("目标", "岗位", "应聘"))
    if field == "学历与专业背景":
        return any(word in text for word in ("专业", "本科", "硕士", "博士", "大专", "高职", "年级", "毕业"))
    if field == "知识基础与薄弱点":
        return any(term in text for term in _KNOWLEDGE_TERMS) and any(term in text for term in _KNOWLEDGE_LEVEL_TERMS)
    if field == "认知风格":
        return any(term in text for term in _COGNITIVE_TERMS) or (
            any(term in text for term in ("图示", "图表", "阅读", "动手", "实操", "听讲"))
            and any(term in text for term in ("理解", "学习", "习惯", "偏好", "更喜欢"))
        )
    if field == "资源偏好":
        return any(term in text for term in _RESOURCE_TERMS) and any(
            term in text for term in ("希望", "喜欢", "偏好", "多提供", "资源", "材料", "都可以", "都行")
        )
    if field == "就业技能与实践经历":
        return bool(_NO_EXPERIENCE_RE.search(text) or _EXPERIENCE_RE.search(text))
    if field == "学习目标与时间安排":
        return bool(re.search(r"(?:每周|一周|每星期).{0,8}\d+(?:\.\d+)?\s*(?:小时|h)", text, re.IGNORECASE))
    return False


def next_profile_question(missing: list[str]) -> str:
    """把完整画像压缩为最多三个自然主题组，避免一项一问。"""
    pending = set(missing)
    if "目标岗位" in pending:
        return "你希望训练的目标岗位是什么？"
    if pending & {"学历与专业背景", "知识基础与薄弱点"}:
        if {"学历与专业背景", "知识基础与薄弱点"} <= pending:
            return "先介绍一下你的学历和专业，以及与目标岗位相关的课程或技术基础：哪些比较熟悉，哪些较薄弱？"
        if "学历与专业背景" in pending:
            return "请补充你的学历、年级或专业背景。"
        return "你与目标岗位相关的课程或技术基础怎样？请说说比较熟悉和较薄弱的内容。"
    if pending & {"认知风格", "资源偏好"}:
        if {"认知风格", "资源偏好"} <= pending:
            return "学习新内容时，你更容易通过图示、阅读、讲解还是动手实践理解？希望训练中多提供文档、思维导图、视频、代码实操还是小测？"
        if "认知风格" in pending:
            return "学习新内容时，你更容易通过图示、阅读、讲解还是动手实践理解？"
        return "训练资源方面，你更希望多提供文档、思维导图、视频、代码实操还是小测？"
    if pending & {"就业技能与实践经历", "学习目标与时间安排"}:
        if {"就业技能与实践经历", "学习目标与时间安排"} <= pending:
            return "最后说说相关项目或实习中用过的技术、负责内容和成果（没有也可说明），以及每周可投入的时间和期望完成时间。"
        if "就业技能与实践经历" in pending:
            return "请说说相关项目或实习中用过的技术、负责内容和成果；如果暂时没有，直接说明即可。"
        return "你每周可以投入多少学习时间？如果有期望完成时间也可以一起说明。"
    return "画像信息已经完整，可以进入岗位训练中心。"


def build_profile_question_guidance(
    current_profile: ProfileDims,
    history: list[dict],
    user_message: str,
    target_role: str | None,
) -> str:
    """结合本轮回答预测剩余问题，明确禁止重复追问。"""
    missing = predicted_profile_missing_fields(current_profile, history, user_message, target_role)
    assistant_questions = [
        str(item.get("content") or "").strip()
        for item in history[-10:]
        if isinstance(item, dict) and item.get("role") == "assistant" and "？" in str(item.get("content") or "")
    ]
    asked = "；".join(assistant_questions[-4:]) or "无"
    if not missing:
        return f"本轮回答后完整画像已经形成，必须直接收束并邀请进入训练中心，不得再提问。历史已问：{asked}"
    return f"本轮后预计还缺：{'、'.join(missing)}。下一问必须使用这一主题组：{next_profile_question(missing)} 历史已问内容不得重复：{asked}"


def predicted_profile_missing_fields(
    current_profile: ProfileDims,
    history: list[dict],
    user_message: str,
    target_role: str | None,
) -> list[str]:
    evidence = build_profile_evidence_text(history, user_message)
    return [
        field for field in profile_missing_fields(current_profile, target_role)
        if not _evidence_covers_missing(field, evidence, target_role)
    ]


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
    ).replace(
        "{question_guidance}",
        build_profile_question_guidance(current_profile, history, user_message, target_role),
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


def _supplement_minimum_intake(
    evidence_context: str,
    patch: dict,
    current_profile: ProfileDims,
) -> None:
    """从明确表述补齐最小入组信息，减少依赖模型反复追问。"""
    text = (evidence_context or "").strip()
    lowered = text.lower()
    background = patch.setdefault("learner_background", {})
    if not isinstance(background, dict):
        background = {}
        patch["learner_background"] = background

    current_background = current_profile.learner_background
    education_terms = ("本科", "硕士", "博士", "大专", "高职", "高中", "大一", "大二", "大三", "大四", "研究生", "毕业")
    if not current_background.education and "education" not in background:
        matching_line = next((line.strip() for line in reversed(text.splitlines()) if any(term in line for term in education_terms)), "")
        if matching_line:
            background["education"] = matching_line[:120]

    if not current_background.major and "major" not in background:
        major_match = re.search(r"(?:专业(?:是|为)?|学的是|就读于)\s*([^，。,.；;]{2,40})", text)
        if major_match:
            background["major"] = major_match.group(1).strip()[:120]

    if current_background.practice_status == "unknown" and "practice_status" not in background:
        if _NO_EXPERIENCE_RE.search(lowered):
            background["practice_status"] = "none"
        elif _EXPERIENCE_RE.search(lowered):
            background["practice_status"] = "has"
        elif any(value > 0 for value in current_profile.employment_skills.model_dump().values()):
            background["practice_status"] = "has"

    if not background:
        patch.pop("learner_background", None)

    if current_profile.pace.hours_per_week <= 0 and not (patch.get("pace") or {}).get("hours_per_week"):
        hours_match = re.search(r"(?:每周|一周|每星期).{0,8}(\d+(?:\.\d+)?)\s*(?:小时|h)", text, re.IGNORECASE)
        if hours_match:
            patch.setdefault("pace", {})["hours_per_week"] = max(1, min(40, int(float(hours_match.group(1)) + 0.5)))


def _score_from_nearby_text(text: str, position: int) -> int:
    nearby = text[max(0, position - 12):position + 20]
    if any(term in nearby for term in ("零基础", "没学", "不熟", "薄弱", "较弱", "较差")):
        return 1
    if any(term in nearby for term in ("很熟", "熟练", "擅长", "扎实", "掌握", "较好")):
        return 4
    return 3


def _supplement_descriptive_dimensions(evidence_context: str, patch: dict) -> None:
    """在无模型或模型漏字段时，从明确选择中补齐知识、认知和资源画像。"""
    text = (evidence_context or "").strip().lower()
    if not text:
        return

    knowledge_terms: dict[str, tuple[str, ...]] = {
        "math": ("数学", "高数", "线性代数"),
        "programming": ("编程", "代码", "python", "java", "c++", "javascript"),
        "statistics": ("统计", "概率"),
        "english": ("英语", "英文"),
        "subject_prior": ("岗位知识", "领域知识", "专业知识", "课程基础", "技术基础"),
    }
    if any(term in text for term in _KNOWLEDGE_LEVEL_TERMS):
        knowledge = patch.setdefault("knowledge_base", {})
        for field, terms in knowledge_terms.items():
            if field in knowledge:
                continue
            positions = [text.find(term) for term in terms if term in text]
            if positions:
                knowledge[field] = _score_from_nearby_text(text, min(positions))

    cognitive_map: dict[str, tuple[str, ...]] = {
        "visual": ("图示", "图表", "可视化", "思维导图"),
        "reading": ("阅读理解", "看文档理解", "阅读学习"),
        "hands_on": ("动手理解", "边做边学", "实操理解", "动手实践"),
        "auditory": ("听讲", "讲解理解"),
    }
    cognitive = patch.setdefault("cognitive_style", {})
    for field, terms in cognitive_map.items():
        if field not in cognitive and any(term in text for term in terms):
            cognitive[field] = 5
    if not cognitive:
        patch.pop("cognitive_style", None)

    preference_map: dict[str, tuple[str, ...]] = {
        "document": ("文档", "讲义"),
        "mindmap": ("思维导图",),
        "quiz": ("小测", "测验"),
        "code": ("代码实操", "实操任务"),
        "video": ("视频",),
        "reading": ("论文", "书籍", "阅读材料"),
    }
    if any(term in text for term in ("希望", "喜欢", "偏好", "多提供", "资源", "材料")):
        preference = patch.setdefault("preference", {})
        for field, terms in preference_map.items():
            if field not in preference and any(term in text for term in terms):
                preference[field] = 5
        if not preference:
            patch.pop("preference", None)


def _supplement_profile_coverage(evidence_context: str, patch: dict) -> None:
    """只在用户确实描述对应主题时标记覆盖，允许中性回答也完成该维度。"""
    text = (evidence_context or "").strip().lower()
    coverage = patch.setdefault("profile_coverage", {})
    if not isinstance(coverage, dict):
        coverage = {}
        patch["profile_coverage"] = coverage

    if patch.get("knowledge_base") or patch.get("weak_points") or _evidence_covers_missing("知识基础与薄弱点", text, None):
        coverage["knowledge_base"] = True
    if patch.get("cognitive_style") or _evidence_covers_missing("认知风格", text, None):
        coverage["cognitive_style"] = True
    if patch.get("preference") or _evidence_covers_missing("资源偏好", text, None):
        coverage["resource_preference"] = True
    background_patch = patch.get("learner_background") or {}
    if (
        patch.get("employment_skills")
        or background_patch.get("practice_status") in {"none", "has"}
        or _evidence_covers_missing("就业技能与实践经历", text, None)
    ):
        coverage["employment_skills"] = True
    if not coverage:
        patch.pop("profile_coverage", None)


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

    learner_background = raw_patch.get("learner_background")
    if learner_background is not None:
        if isinstance(learner_background, dict):
            clean_background: dict[str, str] = {}
            for key in ("education", "major"):
                if key in learner_background and isinstance(learner_background[key], str):
                    clean_background[key] = learner_background[key].strip()[:120]
                elif key in learner_background:
                    dropped = True
            practice_status = learner_background.get("practice_status")
            if practice_status is not None:
                if practice_status in {"unknown", "none", "has"}:
                    clean_background["practice_status"] = practice_status
                else:
                    dropped = True
            if clean_background:
                patch["learner_background"] = clean_background
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

    profile_coverage = raw_patch.get("profile_coverage")
    if profile_coverage is not None:
        if isinstance(profile_coverage, dict):
            clean_coverage: dict[str, bool] = {}
            allowed_coverage = {
                "knowledge_base", "cognitive_style", "resource_preference", "employment_skills",
            }
            for key, value in profile_coverage.items():
                if key in allowed_coverage and value is True:
                    clean_coverage[key] = True
                elif key in allowed_coverage and value is False:
                    # 覆盖度一旦确认不可被模型回退，否则会再次询问已经回答的主题。
                    continue
                else:
                    dropped = True
            if clean_coverage:
                patch["profile_coverage"] = clean_coverage
        else:
            dropped = True

    reasoning = raw_patch.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        patch["reasoning"] = reasoning.strip()[:500]
    elif reasoning is not None:
        dropped = True

    supplemented = _supplement_employment_evidence(evidence_context, patch, current_profile)
    _supplement_minimum_intake(evidence_context, patch, current_profile)
    _supplement_descriptive_dimensions(evidence_context, patch)
    _supplement_profile_coverage(evidence_context, patch)
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
