"""
QuizAgent —— 题目生成。
输出结构化 JSON，前端渲染成可作答题目卡片。
难度依据学生画像中的 ml_prior + math 综合。
"""
from __future__ import annotations
import asyncio
import json

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
            await self.emit_delta(emit, msg, kind="text")
            await asyncio.sleep(0.003)
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
    - LLM 失败时降级到 MOCK_QUIZ 循环填充，保证调用者拿到非空 items
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

每题难度按 {diff}/4 控制（1=入门，4=挑战）。

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

严格按数量出齐 {total} 道，先 mcq 后 fill 再 code。优先覆盖这些岗位能力：{competency_hint}。题目避免重复、覆盖不同岗位能力与任务情境。
{adaptive_section}
{grounding_section}
"""
    msgs = [{"role": "system", "content": sys}, {"role": "user", "content": topic}]
    try:
        raw = await llm.chat_structured(messages=msgs, temperature=0.5)
        data = json.loads(raw)
        items = data.get("items", [])
    except Exception:
        items = []

    # 兜底：缺什么补什么（防 LLM 漏题）
    by_type: dict[str, list[dict]] = {"mcq": [], "fill": [], "code": []}
    for it in items:
        t = it.get("type")
        if t in by_type:
            by_type[t].append(it)
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
        while len(cur) < need:
            fallback_index = len(cur)
            if fallback_index < len(grounded_by_type[t]):
                cur.append(dict(grounded_by_type[t][fallback_index]))
            else:
                cur.append({**mock_by_type[t], "id": f"mock_{t}_{fallback_index}"})
        return cur[:need]

    final = (
        fill_short("mcq", mcq_count)
        + fill_short("fill", fill_count)
        + fill_short("code", code_count)
    )
    # 强制每题带 difficulty
    for it in final:
        it.setdefault("difficulty", diff)
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
    """无模型时用已检索知识片段构造可审计的基础卷。"""
    usable = [item for item in reference_materials if str(item.get("content") or "").strip()]
    if not usable:
        return _mock_fill(mcq, fill, code)
    result: list[dict] = []
    diff = max(1, min(4, difficulty))
    distractors = [
        "只需记忆术语，无需结合岗位任务验证",
        "该能力仅影响界面展示，不影响交付质量",
        "所有场景都应直接套用同一结论，无需检查前提",
    ]
    for index in range(mcq):
        material = usable[index % len(usable)]
        fact = " ".join(str(material.get("content") or "").split())[:120]
        competency = competencies[index % len(competencies)] if competencies else "岗位领域知识"
        correct_index = index % 4
        options = list(distractors)
        options.insert(correct_index, fact)
        result.append({
            "id": f"grounded_mcq_{index}",
            "type": "mcq",
            "question": f"根据岗位知识库，关于“{competency}”的哪项表述最准确？",
            "options": options,
            "answer": correct_index,
            "explanation": f"该结论来自岗位知识库资料《{material.get('source') or '岗位知识库'}》。",
            "difficulty": diff,
            "competency": competency,
            "source": str(material.get("source") or "岗位知识库"),
        })
    # 理论基线默认只使用选择题；保留其他类型的兼容兜底。
    if fill or code:
        result.extend(_mock_fill(0, fill, code))
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
    except Exception as e:
        return 0.0, f"判分异常：{type(e).__name__}"
