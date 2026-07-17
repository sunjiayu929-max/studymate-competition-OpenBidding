"""TestCase 跑测 + LLM-as-judge 评分。

挑战杯交付物：典型问答测试集。
- 用户录入 question + expected
- target_agent 决定喂给谁：tutor / doc / quiz
- 拿到 actual 后用 LLM judge 打分（0-100），输出 reason
- 无 LLM key 时走 rule-based 字符串相似度兜底

多课程支持：call_target_agent 可选接收 course_id，对应 agent 的 persona 由 registry 决定。
"""
from __future__ import annotations
import json
from app.courses import get_course_by_id
from app.llm import get_llm_client, has_llm_key


async def call_target_agent(target: str, question: str, course_id: int | None = None) -> str:
    """把 question 喂给指定 Agent，返回 actual 文本。同步、阻塞拿完整答案。"""
    cfg = await get_course_by_id(course_id)
    if target == "tutor":
        return await _call_tutor(question, cfg)
    if target == "doc":
        return await _call_doc(question, cfg)
    if target == "quiz":
        return await _call_quiz(question, cfg)
    return await _call_tutor(question, cfg)  # 兜底


async def _call_tutor(question: str, cfg) -> str:
    """直接走 qwen 拿完整答案（与 /tutor/chat 同 provider）。"""
    if not has_llm_key("qwen"):
        return f"（mock）针对「{question}」的助教答复占位。"
    llm = get_llm_client("qwen")
    sys_msg = f"你是{cfg.persona}（《{cfg.name}》课程）。简洁直接回答，必要时用公式（KaTeX）/ 代码 / 伪代码。"
    return await llm.chat(
        messages=[{"role": "system", "content": sys_msg}, {"role": "user", "content": question}],
        temperature=0.4,
    )


async def _call_doc(question: str, cfg) -> str:
    """把 question 当主题让 doc agent 生成讲解开头，截 800 字。"""
    if not has_llm_key():
        return f"（mock）针对「{question}」的文档讲解占位。"
    llm = get_llm_client()
    sys_msg = f"你是{cfg.persona}（《{cfg.name}》课程教学助手）。给出一段简明扼要的讲解（不超过 800 字），用 Markdown。"
    out = await llm.chat(
        messages=[{"role": "system", "content": sys_msg}, {"role": "user", "content": question}],
        temperature=0.4,
    )
    return out[:1500]


async def _call_quiz(question: str, cfg) -> str:
    """生成 1 道相关检测题（mcq）作为响应，看是否命中。"""
    if not has_llm_key():
        return f"（mock）针对「{question}」的检测题占位。"
    llm = get_llm_client()
    sys_msg = (
        f"你是{cfg.persona}（《{cfg.name}》出题专家）。基于用户给的知识点，生成 1 道单选题，"
        "格式严格 JSON：{question, options[4], answer_index, explanation}。"
    )
    raw = await llm.chat_structured(
        messages=[{"role": "system", "content": sys_msg}, {"role": "user", "content": question}],
        temperature=0.5,
    )
    return raw  # 直接给 judge 看


async def judge(question: str, expected: str, actual: str) -> tuple[float, str]:
    """LLM-as-judge 给 0-100 分 + 理由。无 LLM 时退化为字符相似度。"""
    if not has_llm_key():
        return _rule_based_judge(expected, actual)

    llm = get_llm_client()
    sys_msg = """你是测试评审专家。给定 question / expected / actual 三段文本，
判断 actual 是否合格答复了 question，并和 expected 在语义上一致（不要求字面）。

输出严格 JSON：
{
  "score": 0-100 整数,
  "reason": "30 字内中文：关键命中点 + 缺失点",
  "verdict": "passed" | "failed"   // score>=60 通过
}

评分尺度：
- 90-100 完美匹配，核心要点都覆盖
- 60-89  主要要点对，少数细节缺失或措辞差异
- 30-59  部分对，关键信息缺失或错误
- 0-29   完全错或离题"""
    user_msg = f"""question:
{question}

expected:
{expected}

actual:
{actual}"""
    try:
        raw = await llm.chat_structured(
            messages=[{"role": "system", "content": sys_msg}, {"role": "user", "content": user_msg}],
            temperature=0.2,
        )
        data = json.loads(raw)
        score = max(0, min(100, int(data.get("score", 0))))
        reason = str(data.get("reason", ""))[:200]
        return float(score), reason
    except Exception as e:
        # judge 失败，降级到 rule-based 但保留错误说明
        s, r = _rule_based_judge(expected, actual)
        return s, f"LLM judge 异常 → 规则兜底：{r}（{e}）"[:200]


def _rule_based_judge(expected: str, actual: str) -> tuple[float, str]:
    """字符级简单相似度：交集 / 并集 字符数。0-100。"""
    if not actual.strip():
        return 0.0, "actual 为空"
    e_chars = set(expected)
    a_chars = set(actual)
    if not e_chars:
        return 50.0, "expected 为空，无法判定"
    inter = len(e_chars & a_chars)
    union = len(e_chars | a_chars)
    sim = (inter / max(union, 1)) * 100
    score = round(sim, 1)
    return score, f"字符集相似度 {score}%（规则兜底，无 LLM）"
