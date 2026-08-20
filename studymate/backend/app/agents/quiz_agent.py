"""
QuizAgent —— 题目生成。
输出结构化 JSON，前端渲染成可作答题目卡片。
难度依据学生画像中的 ml_prior + math 综合。
"""
from __future__ import annotations
import asyncio
import json
import re

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.llm import get_llm_client, has_llm_key


MOCK_QUIZ: list[dict] = [
    {
        "id": "q1",
        "type": "mcq",
        "question": "在梯度下降中，学习率（learning rate）过大可能导致：",
        "options": [
            "训练误差单调下降",
            "损失函数发散或震荡",
            "收敛到全局最优",
            "需要更多轮迭代",
        ],
        "answer": 1,
        "explanation": "学习率过大时，每步更新跨过最低点甚至越走越远，导致损失发散或剧烈震荡。",
        "difficulty": 2,
    },
    {
        "id": "q2",
        "type": "fill",
        "question": "Adam 优化器结合了 _____ 和自适应学习率（RMSProp）两个思想。",
        "answer": "动量",
        "explanation": "Adam = Momentum + RMSProp。一阶矩 m 是动量项，二阶矩 v 是 RMSProp 项。",
        "difficulty": 2,
    },
    {
        "id": "q3",
        "type": "code",
        "question": "用 numpy 实现一个对一维数据做线性回归的小批量随机梯度下降（batch_size=32），返回最终的 (w, b)。",
        "starter": "import numpy as np\n\ndef mbgd(x, y, lr=0.01, epochs=20, batch_size=32):\n    w, b = 0.0, 0.0\n    # TODO\n    return w, b\n",
        "answer": "for _ in range(epochs):\n    idx = np.random.permutation(len(x))\n    for i in range(0, len(x), batch_size):\n        b_idx = idx[i:i+batch_size]\n        xb, yb = x[b_idx], y[b_idx]\n        yh = w*xb + b\n        dw = -2*np.mean(xb*(yb-yh))\n        db = -2*np.mean(yb-yh)\n        w -= lr*dw; b -= lr*db",
        "explanation": "关键：每个 epoch shuffle 一次，按 batch 计算梯度，避免全批量的内存/速度问题。",
        "difficulty": 3,
    },
]


class QuizAgent(AgentBase):
    meta = AgentMeta(
        id="quiz",
        name="分阶测试生成 Agent",
        icon="📝",
        color="emerald",
        description="按岗位能力与学情难度生成分阶检测题",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "机器学习")
        profile = context.get("profile", {})
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        target_role = context.get("target_role", "目标岗位")
        training_plan = context.get("training_plan") or {}
        target_difficulty = int((context.get("diagnosis") or {}).get("target_difficulty") or 2)
        revision_feedback = context.get("revision_feedback", {}).get("quiz", [])
        chunks = context.get("chunks") or []
        citations = [
            {
                "index": index + 1,
                "chunk_id": chunk["chunk_id"],
                "source": chunk["source"],
                "page": chunk.get("page"),
                "url": chunk.get("url"),
                "snippet": chunk["content"][:200],
            }
            for index, chunk in enumerate(chunks)
        ]
        persona = course_cfg.persona if course_cfg else f"{course_name}岗位训练助理"

        if not has_llm_key():
            quiz = await self._stream_mock(emit, target_difficulty, citations)
        else:
            try:
                quiz = await self._gen_real(
                    topic, profile, persona, course_name, emit,
                    target_role=target_role,
                    training_plan=training_plan,
                    revision_feedback=revision_feedback,
                    chunks=chunks,
                )
                if not quiz:
                    raise RuntimeError("empty quiz items")
            except Exception as e:
                await self.emit_delta(emit, f"\n[LLM 失败，降级到题库模板：{type(e).__name__}]\n", kind="text")
                quiz = await self._stream_mock(emit, target_difficulty, citations)

        return {
            "type": "quiz",
            "title": f"《{topic}》岗位分阶测试",
            "items": quiz,
            "count": len(quiz),
            "version": context.get("generation_round", 1),
            "target_role": target_role,
            "citations": citations,
            "revision_response": [
                str(item.get("suggestion", item)) if isinstance(item, dict) else str(item)
                for item in revision_feedback
            ],
        }

    async def _stream_mock(self, emit, target_difficulty: int = 2, citations: list[dict] | None = None) -> list[dict]:
        target = max(1, min(4, target_difficulty))
        levels = [max(1, target - 1), target, min(4, target + 1)]
        if len(set(levels)) < 2:
            levels = [1, 1, 2] if target == 1 else [3, 4, 4]
        quiz = [
            {
                **item,
                "difficulty": levels[index],
                **({"source_index": index % len(citations) + 1} if citations else {}),
            }
            for index, item in enumerate(MOCK_QUIZ)
        ]
        for q in quiz:
            msg = f"生成题目 [{q['type']}] {q['question'][:30]}...\n"
            for ch in msg:
                await self.emit_delta(emit, ch, kind="text")
                await asyncio.sleep(0.008)
        return quiz

    async def _gen_real(
        self,
        topic: str,
        profile: dict,
        persona: str,
        course_name: str,
        emit,
        *,
        target_role: str,
        training_plan: dict,
        revision_feedback: list[dict],
        chunks: list[dict],
    ) -> list[dict]:
        llm = get_llm_client()
        difficulty_hint = self._difficulty_from_profile(profile)
        feedback_text = "；".join(
            str(item.get("suggestion", item)) if isinstance(item, dict) else str(item)
            for item in revision_feedback
        ) or "无"
        references = "\n".join(
            f"[{index + 1}] {item['source']} p.{item.get('page') or '-'}: {item['content'][:160]}"
            for index, item in enumerate(chunks)
        )
        sys = f"""你是一位{persona}，同时是{course_name}出题专家。请围绕岗位“{target_role}”为「{topic}」出 3 道不同类型、至少覆盖两个难度等级的题：
1 题选择题（mcq）：4 选项，answer 是 0..3 的索引
1 题填空题（fill）：answer 是简短答案字符串
1 题编程题（code）：给 starter 起步代码 + 标答 answer + 说明

**语言要求（必须严格遵守）**：
- 题干 question、选项 options、填空答案 answer、解析 explanation 全部必须使用**简体中文**
- 专有术语 / 算法名 / API 名（如 K-Means、Adam、Gradient Descent、numpy）可以保留英文，但说明性文字必须中文
- 即使输入主题是英文（如 "K-Means"），输出也必须用简体中文表达，禁止整段英文输出
- code 题的代码本身保留英文标识符，但代码注释和题面用简体中文

输出**严格 JSON**，不要 Markdown 包裹，结构：
{{
  "items": [
    {{"id":"q1","type":"mcq","question":"...","options":["a","b","c","d"],"answer":0,"explanation":"...","difficulty":1-4,"source_index":1}},
    {{"id":"q2","type":"fill","question":"...","answer":"...","explanation":"...","difficulty":1-4,"source_index":1}},
    {{"id":"q3","type":"code","question":"...","starter":"...","answer":"...","explanation":"...","difficulty":1-4,"source_index":1}}
  ]
}}

学生水平参考（综合给定 1-4 难度）：{difficulty_hint}
多 Agent 仲裁训练计划：{json.dumps(training_plan, ensure_ascii=False)}
审核返工意见：{feedback_text}
本轮知识库证据（每题必须通过 source_index 绑定其中一条）：
{references}
题目必须体现岗位任务情境，并与学生当前难度相邻，避免跨度过大；三题应分别承担基础理解、场景应用、迁移挑战，并可用于下一轮升降阶判断。
"""
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": topic}]
        raw = await llm.chat_structured(messages=msgs, temperature=0.4)
        # 流式不适合 JSON，直接整段 emit
        await self.emit_delta(emit, "生成 3 道题目...\n", kind="text")
        try:
            data = json.loads(raw)
            items = data.get("items", [])
        except Exception:
            items = MOCK_QUIZ
        return items

    def _difficulty_from_profile(self, profile: dict) -> int:
        try:
            kb = profile.get("knowledge_base", {})
            # subject_prior 是新通用字段；为兼容旧画像保留 ml_prior fallback
            prior = int(kb.get("subject_prior", kb.get("ml_prior", 0)))
            math = int(kb.get("math", 0))
            mix = (prior * 2 + math) // 3   # 0..5
            return max(1, min(4, mix or 2))
        except Exception:
            return 2


# ============================================================
# 题库版批量出题：给 quiz_sessions API 用，与工作台 run() 隔离
# ============================================================


_QUESTION_SPACE_RE = re.compile(r"[\s，。！？；：、,.!?;:'\"（）()【】\[\]<>《》]+")
_QUOTED_TERM_RE = re.compile(r"[“「『《][^”」』》]{1,80}[”」』》]")


def _difficulty_plan(total: int, target: int) -> list[int]:
    """让整张卷围绕目标难度形成相邻梯度，而不是所有题同级。"""
    if total <= 0:
        return []
    center = max(1, min(4, target))
    if total == 1:
        return [center]
    nearby = list(dict.fromkeys((max(1, center - 1), center, min(4, center + 1))))
    if len(nearby) == 1:
        nearby.append(2 if center == 1 else 3)
    return [nearby[index % len(nearby)] for index in range(total)]


def _question_signature(question: str, *, template: bool = False) -> str:
    """归一化题干，用于拦截原样重复和只替换术语的模板重复。"""
    text = str(question or "").strip().lower()
    if template:
        text = _QUOTED_TERM_RE.sub("术语", text)
    return _QUESTION_SPACE_RE.sub("", text)


def _valid_generated_item(item: dict, item_type: str) -> bool:
    question = str(item.get("question") or "").strip()
    explanation = str(item.get("explanation") or "").strip()
    if len(question) < 8 or not explanation:
        return False
    if item_type == "mcq":
        options = [str(option).strip() for option in (item.get("options") or [])]
        try:
            answer = int(item.get("answer"))
        except (TypeError, ValueError):
            return False
        return len(options) == 4 and len(set(options)) == 4 and 0 <= answer < 4
    if item_type == "fill":
        return bool(str(item.get("answer") or "").strip())
    if item_type == "code":
        return bool(str(item.get("starter") or "").strip() and str(item.get("answer") or "").strip())
    return False


def _compact_fact(content: object, *, max_chars: int = 72) -> str:
    """提取完整、短小的岗位事实，避免把长知识片段原样塞进选项或题干。"""
    text = " ".join(str(content or "").split()).strip()
    if not text:
        return "应结合现场任务、责任边界和可验证证据完成交付。"
    text = re.sub(r"（[^）]{8,}）|\([^)]{8,}\)", "", text)
    sentences = [part.strip() for part in re.split(r"(?<=[。！？；])", text) if part.strip()]
    first = sentences[0] if sentences else text
    if len(first) <= max_chars:
        return first
    lead = re.split(r"[：:]", first, maxsplit=1)[0].strip()
    if 12 <= len(lead) <= max_chars:
        return lead.rstrip("，,；;：:") + "。"
    clauses = [part.strip() for part in re.split(r"[，,；;]", first) if part.strip()]
    compact = ""
    for clause in clauses:
        candidate = f"{compact}，{clause}" if compact else clause
        if len(candidate) > max_chars:
            break
        compact = candidate
    if len(compact) >= 12:
        return compact.rstrip("，,；;：:") + "。"
    return first[:max_chars].rstrip("，,；;：:") + "…"

async def generate_quiz_batch(
    *,
    topic: str,
    course_name: str,
    persona: str,
    difficulty: int,
    mcq_count: int,
    fill_count: int,
    code_count: int,
    focus_tags: list[str] | None = None,
    target_role: str = "目标岗位",
    competencies: list[str] | None = None,
    reference_materials: list[dict] | None = None,
) -> list[dict]:
    """按指定数量批量出题：mcq * mcq_count + fill * fill_count + code * code_count。

    - 一次 LLM 调用拿完整结构化 JSON（chat_structured 强制 json_object）
    - LLM 失败或返回重复/残缺题目时，优先用检索到的岗位材料补齐
    - 同一试卷至少覆盖两个相邻难度等级，目标难度作为中心而非固定值
    """
    total = mcq_count + fill_count + code_count
    if total <= 0:
        return []
    if not has_llm_key():
        if reference_materials:
            return _grounded_mock_fill(
                mcq_count,
                fill_count,
                code_count,
                reference_materials=reference_materials,
                competencies=competencies or [],
                difficulty=difficulty,
            )
        return _mock_fill(mcq_count, fill_count, code_count)

    llm = get_llm_client()
    diff = max(1, min(4, difficulty))
    difficulty_plan = _difficulty_plan(total, diff)
    adaptive_hint = "、".join(focus_tags or [])
    competency_hint = "、".join(competencies or []) or topic
    reference_text = "\n".join(
        f"[资料{index + 1}｜{str(item.get('source') or '岗位知识库')}] {str(item.get('content') or '')[:900]}"
        for index, item in enumerate((reference_materials or [])[:10])
        if str(item.get("content") or "").strip()
    )
    grounding_section = (
        "\n**岗位知识库检索材料（命题事实必须以此为依据）**：\n"
        f"{reference_text}\n"
        "每题必须返回 competency（对应能力名称）和 source（引用资料标题）；"
        "不得编造材料之外的制度、数字或结论。source 只写在结构化字段中；"
        "题干 question 严禁出现书名、作者、版本号、资料名称、章节号或‘根据/依据某资料’等出处信息。"
        if reference_text else ""
    )
    adaptive_section = (
        f"\n**自适应加练要求**：学生近期高频错误类型是「{adaptive_hint}」。"
        "至少一半题目应通过新情境或变式重点检测这些能力；不要照抄旧题，也不要在题干中直接暴露错误标签。"
        "解析中要明确指出应迁移的方法。"
        if adaptive_hint
        else ""
    )
    sys = f"""你是一位{persona}，同时是岗位能力测评专家。请依据“{course_name}”岗位知识库，为“{target_role}”的任务或能力点「{topic}」生成测验题：
- 选择题（mcq）共 {mcq_count} 道：4 选项 options，answer 是 0..3 的整数索引
- 填空题（fill）共 {fill_count} 道：answer 是简短答案字符串（用 / 分隔多个等价答案）
- 编程题（code）共 {code_count} 道：starter 起步代码 + answer 标答 + 解析

目标难度为 {diff}/4（1=入门，4=挑战）。整张卷必须围绕目标难度覆盖相邻等级，
建议难度序列为 {difficulty_plan}，不得把所有题都标成同一难度。

**语言要求（必须严格遵守）**：
- 题干 question、选项 options、填空答案 answer、解析 explanation 全部必须使用**简体中文**
- 专有术语 / 算法名 / API 名（如 K-Means、Adam、Gradient Descent、numpy）可以保留英文，但说明性文字必须中文
- 即使输入主题是英文（如 "K-Means"），输出也必须用简体中文表达，禁止整段英文输出
- code 题的代码本身保留英文标识符，但代码注释和题面用简体中文

输出**严格 JSON**（不要 Markdown 包裹），结构：
{{
  "items": [
    {{"type":"mcq","question":"...","options":["a","b","c","d"],"answer":0,"explanation":"...","difficulty":{diff},"competency":"...","source":"..."}},
    {{"type":"fill","question":"...","answer":"...","explanation":"...","difficulty":{diff},"competency":"...","source":"..."}},
    {{"type":"code","question":"...","starter":"...","answer":"...","explanation":"...","difficulty":{diff},"competency":"...","source":"..."}}
  ]
}}

严格按数量出齐 {total} 道，先 mcq 后 fill 再 code。优先覆盖这些岗位能力：{competency_hint}。
每道题必须考查不同的判断、操作或证据，禁止复用同一题干、选项或答案；
禁止批量使用“关于某某的哪项表述最准确”这一类只替换术语的模板。
选择题至少混合场景决策、流程排序、风险识别和证据判断；填空题考查关键动作或产物；编程题必须对应岗位中的数据、接口、检查或验证任务。
{adaptive_section}
{grounding_section}
"""
    msgs = [{"role": "system", "content": sys}, {"role": "user", "content": topic}]
    try:
        raw = await asyncio.wait_for(
            llm.chat_structured(messages=msgs, temperature=0.5),
            timeout=45,
        )
        data = json.loads(raw)
        items = data.get("items", [])
    except Exception:
        items = []

    # 质量门禁：过滤残缺题、重复题和无知识库来源题，再按类型补齐。
    by_type: dict[str, list[dict]] = {"mcq": [], "fill": [], "code": []}
    allowed_sources = {
        str(item.get("source") or "").strip()
        for item in (reference_materials or [])
        if str(item.get("source") or "").strip()
    }
    seen_questions: set[str] = set()
    seen_templates: set[str] = set()
    for it in items:
        t = it.get("type")
        if t not in by_type or not _valid_generated_item(it, t):
            continue
        signature = _question_signature(it.get("question", ""))
        template_signature = _question_signature(it.get("question", ""), template=True)
        if not signature or signature in seen_questions or template_signature in seen_templates:
            continue
        source = str(it.get("source") or "").strip()
        if allowed_sources and source not in allowed_sources:
            continue
        seen_questions.add(signature)
        seen_templates.add(template_signature)
        by_type[t].append(dict(it))
    grounded_fallback = _grounded_mock_fill(
        mcq_count,
        fill_count,
        code_count,
        reference_materials=reference_materials or [],
        competencies=competencies or [],
        difficulty=diff,
    ) if reference_materials else []
    grounded_by_type = {
        key: [item for item in grounded_fallback if item.get("type") == key]
        for key in ("mcq", "fill", "code")
    }
    mock_by_type = {q["type"]: q for q in MOCK_QUIZ}

    def fill_short(t: str, need: int) -> list[dict]:
        cur = by_type[t]
        candidates = grounded_by_type[t]
        candidate_index = 0
        while len(cur) < need and candidate_index < len(candidates):
            candidate = dict(candidates[candidate_index])
            candidate_index += 1
            signature = _question_signature(candidate.get("question", ""))
            if signature and signature not in seen_questions:
                seen_questions.add(signature)
                cur.append(candidate)
        while len(cur) < need:
            fallback_index = len(cur)
            cur.append({**mock_by_type[t], "id": f"mock_{t}_{fallback_index}"})
        return cur[:need]

    final = (
        fill_short("mcq", mcq_count)
        + fill_short("fill", fill_count)
        + fill_short("code", code_count)
    )
    # 强制题号唯一，并按整卷难度计划标注。
    for index, it in enumerate(final):
        it["id"] = f"quiz_{index + 1}"
        it["difficulty"] = difficulty_plan[index]
        it.setdefault("explanation", "")
    return final


def _grounded_mock_fill(
    mcq: int,
    fill: int,
    code: int,
    *,
    reference_materials: list[dict],
    competencies: list[str],
    difficulty: int,
) -> list[dict]:
    """无模型或模型漏题时，用检索片段构造不重复、可审计的岗位卷。"""
    usable = [item for item in reference_materials if str(item.get("content") or "").strip()]
    if not usable:
        return _mock_fill(mcq, fill, code)
    result: list[dict] = []
    diff = max(1, min(4, difficulty))
    difficulty_plan = _difficulty_plan(mcq + fill + code, diff)
    mcq_stems = [
        "客户项目进入{competency}阶段，现阶段哪项行动最符合岗位要求？",
        "项目评审准备检查{competency}的完成质量，哪项判断最符合岗位要求？",
        "现场约束发生变化时，围绕{competency}采取哪种处理更稳妥？",
        "团队准备把{competency}做法固化为交付流程，哪项原则应优先保留？",
        "负责人要求说明{competency}为何已经完成，哪项回答最有说服力？",
        "同类现场问题再次出现时，哪项做法最有助于复用{competency}经验？",
        "在阶段复盘中，哪项结论最能反映{competency}的岗位价值？",
        "为了减少后续返工，开展{competency}时应优先选择哪项做法？",
    ]
    distractor_sets = [
        ["先承诺一套覆盖全部场景的完整方案，等上线后再补范围和验证口径", "只记录项目最终结论，不保留责任人、依赖、决策和过程证据", "忽略当前现场约束，直接复制其他客户项目的配置与验收方式"],
        ["仅用会议中的口头确认代替可追溯记录，出现分歧后再临时协调", "只展示系统界面和演示效果，不让真实用户完成实际工作任务", "默认所有异常都属于用户操作问题，不再区分数据、接口与环境"],
        ["跳过责任人与依赖确认直接进入上线，出现阻塞后再确定处理顺序", "只验证一条正常路径，不设计异常处理、回滚方式与遗留问题记录", "将某个客户的特殊例外直接写成所有项目都必须遵守的统一规则"],
        ["只统计团队投入工时和完成页面数量，不检查业务结果是否发生变化", "发现权限、合规或交付风险后不升级，也不保留相关决策记录", "用文档中的术语数量代替真实场景可用性、用户采用和运行证据"],
    ]
    for index in range(mcq):
        material = usable[index % len(usable)]
        fact = _compact_fact(material.get("content"), max_chars=72)
        meta = material.get("meta") if isinstance(material.get("meta"), dict) else {}
        competency = str(meta.get("topic") or "").strip()
        if not competency:
            competency = competencies[index % len(competencies)] if competencies else "岗位领域知识"
        correct_index = index % 4
        options = list(distractor_sets[index % len(distractor_sets)])
        options.insert(correct_index, fact)
        scenario_stage = ("现场交付", "变更复核", "复盘迁移")[
            (index // len(mcq_stems)) % 3
        ]
        result.append({
            "id": f"grounded_mcq_{index}",
            "type": "mcq",
            "question": f"{scenario_stage}：{mcq_stems[index % len(mcq_stems)].format(competency=competency)}",
            "options": options,
            "answer": correct_index,
            "explanation": f"岗位知识片段强调：{fact}",
            "difficulty": difficulty_plan[len(result)],
            "competency": competency,
            "source": str(material.get("source") or "岗位知识库"),
        })

    fill_stems = [
        "客户现场需要落实这项要求：{fact} 请填写最匹配的岗位能力：____。",
        "交付检查发现以下要求尚未落实：{fact} 负责补齐这一环节的能力是：____。",
        "团队准备复盘并推广以下做法：{fact} 这属于 ____ 能力。",
        "项目负责人要为以下任务指定能力域：{fact} 应归入 ____。",
    ]
    for index in range(fill):
        material = usable[(mcq + index) % len(usable)]
        fact = _compact_fact(material.get("content"), max_chars=72)
        meta = material.get("meta") if isinstance(material.get("meta"), dict) else {}
        competency = str(meta.get("topic") or "").strip()
        if not competency:
            competency = competencies[(mcq + index) % len(competencies)] if competencies else "岗位领域知识"
        fill_stage = ("交付准备", "现场执行", "结果复盘", "能力沉淀", "风险复核")[
            (index // len(fill_stems)) % 5
        ]
        result.append({
            "id": f"grounded_fill_{index}",
            "type": "fill",
            "question": f"{fill_stage}：{fill_stems[index % len(fill_stems)].format(fact=fact)}",
            "answer": competency,
            "explanation": f"该任务对应“{competency}”，知识片段要求：{fact}",
            "difficulty": difficulty_plan[len(result)],
            "competency": competency,
            "source": str(material.get("source") or "岗位知识库"),
        })

    code_templates = [
        {
            "question": "围绕{competency}实现 Python 函数 missing_checks(checks, required)，返回所有未通过或缺失的必检项，保持 required 原顺序。岗位背景：{fact}",
            "starter": "def missing_checks(checks: dict[str, bool], required: list[str]) -> list[str]:\n    # TODO：返回缺失或值为 False 的检查项\n    pass\n",
            "answer": "def missing_checks(checks, required):\n    return [name for name in required if not checks.get(name, False)]",
            "explanation": "逐项读取必检清单，缺失值和 False 都必须被识别，才能留下完整的交付检查证据。",
        },
        {
            "question": "围绕{competency}实现 Python 函数 group_issues(issues)，按 category 汇总问题标题；未知分类归入“其他”。岗位背景：{fact}",
            "starter": "def group_issues(issues: list[dict]) -> dict[str, list[str]]:\n    # issue 示例：{\"title\": \"接口超时\", \"category\": \"接口\"}\n    pass\n",
            "answer": "def group_issues(issues):\n    groups = {}\n    for issue in issues:\n        category = issue.get('category') or '其他'\n        groups.setdefault(category, []).append(issue.get('title', '未命名问题'))\n    return groups",
            "explanation": "按类别沉淀现场问题，能帮助团队区分依赖与责任边界，并支持后续复盘。",
        },
        {
            "question": "围绕{competency}实现 Python 函数 acceptance_ready(results)，只有全部 critical 检查项 passed=True 时才返回 True。岗位背景：{fact}",
            "starter": "def acceptance_ready(results: list[dict]) -> bool:\n    # result 含 critical 与 passed 两个布尔字段\n    pass\n",
            "answer": "def acceptance_ready(results):\n    critical = [item for item in results if item.get('critical')]\n    return bool(critical) and all(item.get('passed') is True for item in critical)",
            "explanation": "验收不能只看部分成功项；关键检查必须存在且全部通过，结果才可被判定为就绪。",
        },
    ]
    for index in range(code):
        material = usable[(mcq + fill + index) % len(usable)]
        fact = _compact_fact(material.get("content"), max_chars=80)
        meta = material.get("meta") if isinstance(material.get("meta"), dict) else {}
        competency = str(meta.get("topic") or "").strip()
        if not competency:
            competency = competencies[(mcq + fill + index) % len(competencies)] if competencies else "岗位领域知识"
        template = code_templates[index % len(code_templates)]
        code_stage = ("依赖检查", "问题归档", "验收门禁", "交付复核")[
            (index // len(code_templates)) % 4
        ]
        result.append({
            "id": f"grounded_code_{index}",
            "type": "code",
            "question": f"{code_stage}：{template['question'].format(competency=competency, fact=fact)}",
            "starter": template["starter"],
            "answer": template["answer"],
            "explanation": template["explanation"],
            "difficulty": difficulty_plan[len(result)],
            "competency": competency,
            "source": str(material.get("source") or "岗位知识库"),
        })
    return result


def _mock_fill(mcq: int, fill: int, code: int) -> list[dict]:
    by_type = {q["type"]: q for q in MOCK_QUIZ}
    out: list[dict] = []
    for t, n in (("mcq", mcq), ("fill", fill), ("code", code)):
        for i in range(n):
            out.append({**by_type[t], "id": f"mock_{t}_{i}"})
    return out


async def judge_code_with_llm(
    *,
    question: str,
    reference: str,
    user_code: str,
    persona: str = "岗位训练助教",
) -> tuple[float, str]:
    """code 题 LLM 判分：返回 (score 0-100, judge_reason)。
    保持简洁，3-5 秒一题。
    """
    if not has_llm_key() or not user_code.strip():
        return 0.0, "未提交代码或 LLM 不可用"
    llm = get_llm_client()
    sys = (
        f"你是{persona}，正在批改一道编程题。请判断学生代码是否解决了题目要求。\n"
        "评分标准：核心思路正确占主，语法小错可宽容；考虑边界、复杂度合理性。\n"
        "**reason 字段必须使用简体中文**，禁止整段英文。\n"
        "输出严格 JSON：{\"score\": 0-100 的整数, \"reason\": \"≤80 字简短中文理由\"}"
    )
    user = (
        f"题目：{question}\n\n参考答案：\n```\n{reference}\n```\n\n"
        f"学生代码：\n```\n{user_code}\n```"
    )
    try:
        raw = await llm.chat_structured(
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0.2,
        )
        data = json.loads(raw)
        score = float(data.get("score", 0))
        reason = str(data.get("reason", ""))[:200]
        return max(0.0, min(100.0, score)), reason
    except Exception:
        return 0.0, "自动判分服务暂时不可用，本题未计为通过；请稍后重试或改用自评模式"
