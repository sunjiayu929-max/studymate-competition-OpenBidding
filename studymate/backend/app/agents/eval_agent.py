"""
EvalAgent —— 学习效果评估 + 画像回写建议。

输入：
- user_id
- quiz_results: 用户答题列表  [{question, user_answer, correct_answer, is_correct, topic, difficulty}]
- engagement:   学习行为统计 {topics_studied, time_spent_min, resources_consumed, resources_available}
- current_dims: 当前画像 dict

输出（严格 JSON）：
{
  "scores": {
    "overall_correct_rate": 0.6,
    "by_topic": {"梯度下降": {"correct": 2, "total": 3, "rate": 0.67}, ...},
    "engagement_score": 75  # 0-100
  },
  "profile_delta": {
    "knowledge_base": {"subject_prior": 1, "math": -1},  # 数值类 delta（-1 / 0 / +1）
    "weak_points": {"topics": ["矩阵特征值"], "error_types": ["公式推导"]},  # 替换而非合并
    "preference": {"video": 1}                            # 资源偏好微调
  },
  "suggestions": ["数学基础需要加强...", ...],
  "next_topics": ["矩阵特征值", "线性回归"],
  "summary_markdown": "## 总结\\n...\\n## 强项\\n...\\n## 待加强\\n..."   # 直接可渲染
}

设计取舍：
- LLM 接收脱敏后的结构化数据，避免长 token 浪费
- 无 mock 也能跑：若 LLM 不可用，输出 rule-based 简化版评估
- profile_delta 不直接落库，由前端用户「确认应用」后才触发 /api/profile/apply-delta
"""
from __future__ import annotations
import json
from typing import Any

from app.llm import get_llm_client, has_llm_key


VALID_KNOWLEDGE_DIMS = {"math", "programming", "statistics", "english", "subject_prior"}
VALID_PREFERENCE_DIMS = {"document", "mindmap", "quiz", "code", "video", "reading"}
VALID_EMPLOYMENT_DIMS = {"programming", "algorithms", "data_ai", "systems", "engineering", "professional"}

COURSE_EMPLOYMENT_DIMS: dict[str, tuple[str, ...]] = {
    "机器学习": ("algorithms", "data_ai", "programming", "engineering"),
    "数据结构与算法": ("algorithms", "programming", "engineering"),
    "操作系统": ("systems", "engineering", "programming"),
    "计算机网络": ("systems", "engineering"),
    "计算机组成原理": ("systems", "programming", "engineering"),
}


def _compute_basic_scores(quiz_results: list[dict]) -> dict:
    """不依赖 LLM 的硬统计：正确率、作答完成率及主题×难度矩阵。"""
    if not quiz_results:
        return {
            "overall_correct_rate": 0.0,
            "by_topic": {},
            "by_topic_difficulty": {},
            "total_attempts": 0,
            "total_correct": 0,
            "answer_completion": {"answered": 0, "total": 0, "rate": None},
        }
    total = len(quiz_results)
    correct = sum(1 for q in quiz_results if q.get("is_correct"))
    unanswered_markers = {"未作答", "（未作答）", "(未作答)", "（未答）", "(未答)"}
    answered = sum(
        1
        for q in quiz_results
        if str(q.get("user_answer") or "").strip() not in unanswered_markers
        and bool(str(q.get("user_answer") or "").strip())
    )
    by_topic: dict[str, dict] = {}
    by_topic_difficulty: dict[str, dict[str, dict]] = {}
    for q in quiz_results:
        topic = str(q.get("topic") or "未分类")
        try:
            difficulty = max(1, min(4, int(q.get("difficulty", 1) or 1)))
        except (TypeError, ValueError):
            difficulty = 1
        by_topic.setdefault(topic, {"correct": 0, "total": 0})
        by_topic[topic]["total"] += 1
        bucket = by_topic_difficulty.setdefault(topic, {}).setdefault(
            str(difficulty), {"correct": 0, "total": 0}
        )
        bucket["total"] += 1
        if q.get("is_correct"):
            by_topic[topic]["correct"] += 1
            bucket["correct"] += 1
    for t, v in by_topic.items():
        v["rate"] = round(v["correct"] / max(v["total"], 1), 2)
    for difficulty_map in by_topic_difficulty.values():
        for bucket in difficulty_map.values():
            bucket["rate"] = round(bucket["correct"] / max(bucket["total"], 1), 2)
    return {
        "overall_correct_rate": round(correct / total, 2),
        "by_topic": by_topic,
        "by_topic_difficulty": by_topic_difficulty,
        "total_attempts": total,
        "total_correct": correct,
        "answer_completion": {
            "answered": answered,
            "total": total,
            "rate": round(answered / total, 2),
        },
    }


def _engagement_metrics(engagement: dict) -> tuple[int, dict, dict]:
    """保留既有参与度公式，并补充组成及资源覆盖证据。"""
    time_min = max(0, int(engagement.get("time_spent_min", 0) or 0))
    resources = {str(item) for item in (engagement.get("resources_consumed", []) or []) if str(item)}
    available = {str(item) for item in (engagement.get("resources_available", []) or []) if str(item)}
    # 30 分钟 = 60 分；每种资源类型 +8 分
    base = min(int(time_min * 2), 60)
    variety = min(len(resources) * 8, 40)
    engagement_score = min(base + variety, 100)
    covered = len(resources & available) if available else 0
    coverage = {
        "consumed": covered,
        "available": len(available),
        "rate": round(covered / len(available), 2) if available else None,
    }
    breakdown = {
        "time_spent_min": time_min,
        "time_score": base,
        "resource_types": len(resources),
        "resource_variety_score": variety,
    }
    return engagement_score, breakdown, coverage


def _engagement_score(engagement: dict) -> int:
    """兼容原有调用：0-100 参与度分。"""
    return _engagement_metrics(engagement)[0]


async def run_eval(
    user_id: int,
    quiz_results: list[dict],
    engagement: dict,
    current_dims: dict,
    course_name: str = "机器学习",
) -> dict:
    """主入口。"""
    basic = _compute_basic_scores(quiz_results)
    eng_score, engagement_breakdown, resource_coverage = _engagement_metrics(engagement)
    scores = {
        **basic,
        "engagement_score": eng_score,
        "engagement_breakdown": engagement_breakdown,
        "resource_coverage": resource_coverage,
    }

    if not has_llm_key():
        return _rule_based_eval(scores, engagement, current_dims, course_name)

    try:
        return await _llm_eval(scores, engagement, current_dims, quiz_results, course_name)
    except Exception:
        return _rule_based_eval(scores, engagement, current_dims, course_name)


async def _llm_eval(scores: dict, engagement: dict, dims: dict, quiz_results: list[dict], course_name: str = "机器学习") -> dict:
    llm = get_llm_client()
    sys = f"""你是一位{course_name}教学评估专家。基于学生的答题表现、学习行为和当前画像，输出**严格 JSON**评估报告。

输出结构（不要 Markdown 包裹）：
{{
  "profile_delta": {{
    "knowledge_base": {{ "subject_prior"?: int, "math"?: int, "programming"?: int, "statistics"?: int }},
    "weak_points": {{ "topics": [str], "error_types": [str] }},
    "preference": {{ "video"?: int, "reading"?: int, "code"?: int, "mindmap"?: int }},
    "employment_skills": {{ "programming"?: int, "algorithms"?: int, "data_ai"?: int, "systems"?: int, "engineering"?: int }}
  }},
  "suggestions": [str],
  "next_topics": [str],
  "summary_markdown": str
}}

规则：
1. profile_delta 数值类字段（knowledge_base/preference/employment_skills）只使用整数 **-1、0、+1**，表示对当前整数分数调整一步
2. 答对率高的主题 → subject_prior 加；多次错相同类型 → math/programming 减
3. weak_points.topics 给 1-3 个主题，error_types 给 1-2 个类型（概念混淆 / 公式推导 / 代码实现 / 边界处理）
4. suggestions 3-5 条，每条 30 字内，要可执行（"重看 XX 章节 / 做 XX 类题目"）
5. next_topics 给 2-3 个学习者下一步该学的主题，基于当前掌握程度推
6. summary_markdown 用 ## 强项 / ## 待加强 / ## 学习建议 三段式，每段 2-4 行，可直接渲染
7. employment_skills 只根据本次课程、答题和代码实践中的实际证据调整；不要修改 professional，不能把求职意愿当作能力证据
"""
    user_msg = f"""学生 ID: {scores.get('total_attempts', 0)} 次答题，正确 {scores.get('total_correct', 0)} 次
答题详情（截断）：
{json.dumps(quiz_results[:10], ensure_ascii=False)}

学习行为：
{json.dumps(engagement, ensure_ascii=False)}

当前画像：
{json.dumps(dims, ensure_ascii=False)}

参与度评分（已算好，仅供参考）：{scores.get('engagement_score', 0)}/100
按主题正确率：{json.dumps(scores.get('by_topic', {}), ensure_ascii=False)}
"""
    raw = await llm.chat_structured(
        messages=[{"role": "system", "content": sys}, {"role": "user", "content": user_msg}],
        temperature=0.4,
    )
    data = json.loads(raw)
    return {
        "scores": scores,
        "profile_delta": sanitize_profile_delta(data.get("profile_delta") or {}),
        "suggestions": _trim_list(data.get("suggestions"), max_items=5, max_len=80),
        "next_topics": _trim_list(data.get("next_topics"), max_items=3, max_len=40),
        "summary_markdown": str(data.get("summary_markdown", ""))[:3000],
    }


def _rule_based_eval(scores: dict, engagement: dict, dims: dict, course_name: str = "机器学习") -> dict:
    """LLM 不可用时的兜底：rule-based 简化版。"""
    rate = scores.get("overall_correct_rate", 0)
    eng = scores.get("engagement_score", 0)
    weak_topics = [t for t, v in scores.get("by_topic", {}).items() if v.get("rate", 0) < 0.5]

    profile_delta: dict[str, Any] = {}
    if rate >= 0.8:
        profile_delta["knowledge_base"] = {"subject_prior": 1}
    elif rate < 0.4:
        profile_delta["knowledge_base"] = {"subject_prior": -1}

    if weak_topics:
        profile_delta["weak_points"] = {"topics": weak_topics[:3], "error_types": ["概念混淆"]}

    attempts = scores.get("total_attempts", 0) or 0
    employment_dims = COURSE_EMPLOYMENT_DIMS.get(course_name, ())
    if attempts > 0 and employment_dims:
        if rate >= 0.75:
            profile_delta["employment_skills"] = {key: 1 for key in employment_dims[:3]}
        elif rate < 0.4:
            profile_delta["employment_skills"] = {key: -1 for key in employment_dims[:2]}

    suggestions: list[str] = []
    if rate < 0.6:
        suggestions.append("整体正确率偏低，建议先复盘错题对应章节再做新题")
    if eng < 40:
        suggestions.append("学习时长不足 20 分钟，建议每天投入 30+ 分钟")
    if weak_topics:
        suggestions.append(f"以下主题待加强：{', '.join(weak_topics[:3])}")
    if not suggestions:
        suggestions.append("学习状态良好，建议尝试更高难度的进阶主题")

    summary = (
        f"## 强项\n参与度 {eng}/100，整体正确率 {int(rate*100)}%。\n\n"
        f"## 待加强\n{'、'.join(weak_topics) if weak_topics else '暂无明显弱点'}\n\n"
        f"## 学习建议\n" + "\n".join(f"- {s}" for s in suggestions)
    )
    return {
        "scores": scores,
        "profile_delta": sanitize_profile_delta(profile_delta),
        "suggestions": suggestions,
        "next_topics": weak_topics[:3] or [f"进阶{course_name}主题"],
        "summary_markdown": summary,
    }


def _delta_step(value: object) -> int | None:
    """兼容旧浮点建议，并转换为确定性的整数步进。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if numeric >= 0.5:
        return 1
    if numeric <= -0.5:
        return -1
    return 0


def sanitize_profile_delta(delta: object) -> dict:
    """限制 delta 在合法字段内，并统一为 -1/0/+1。"""
    if not isinstance(delta, dict):
        return {}
    out: dict[str, Any] = {}
    kb = delta.get("knowledge_base")
    if isinstance(kb, dict):
        clean = {k: step for k, value in kb.items() if k in VALID_KNOWLEDGE_DIMS and (step := _delta_step(value))}
        if clean:
            out["knowledge_base"] = clean
    pref = delta.get("preference")
    if isinstance(pref, dict):
        clean = {k: step for k, value in pref.items() if k in VALID_PREFERENCE_DIMS and (step := _delta_step(value))}
        if clean:
            out["preference"] = clean
    employment = delta.get("employment_skills")
    if isinstance(employment, dict):
        # 职业素养只从画像对话中的明确经历更新，不由一次学习报告推断。
        clean = {
            k: step
            for k, value in employment.items()
            if k in VALID_EMPLOYMENT_DIMS - {"professional"} and (step := _delta_step(value))
        }
        if clean:
            out["employment_skills"] = clean
    wp = delta.get("weak_points")
    if isinstance(wp, dict):
        topics = [str(t)[:30] for t in (wp.get("topics") or [])][:5]
        etypes = [str(t)[:20] for t in (wp.get("error_types") or [])][:3]
        if topics or etypes:
            out["weak_points"] = {"topics": topics, "error_types": etypes}
    return out


def _trim_list(items: Any, max_items: int, max_len: int) -> list[str]:
    if not isinstance(items, list):
        return []
    return [str(x)[:max_len] for x in items][:max_items]


def apply_profile_delta(current_dims: dict, delta: dict) -> dict:
    """把 delta 应用到 current_dims，返回新的 dims（不写库，由调用方决定）。
    - 数值类（knowledge_base / preference / employment_skills）做加法，截断到 [0, 5]
    - weak_points 直接替换
    """
    new_dims = json.loads(json.dumps(current_dims))  # 深拷贝
    clean_delta = sanitize_profile_delta(delta)
    kb_delta = clean_delta.get("knowledge_base") or {}
    if kb_delta:
        kb = new_dims.setdefault("knowledge_base", {})
        for k, dv in kb_delta.items():
            if k in VALID_KNOWLEDGE_DIMS:
                cur = kb.get(k, 3)
                kb[k] = max(0, min(5, cur + dv))
    pref_delta = clean_delta.get("preference") or {}
    if pref_delta:
        pref = new_dims.setdefault("preference", {})
        for k, dv in pref_delta.items():
            if k in VALID_PREFERENCE_DIMS:
                cur = pref.get(k, 3)
                pref[k] = max(0, min(5, cur + dv))
    employment_delta = clean_delta.get("employment_skills") or {}
    if employment_delta:
        employment = new_dims.setdefault("employment_skills", {})
        for k, dv in employment_delta.items():
            if k in VALID_EMPLOYMENT_DIMS:
                cur = employment.get(k, 0)
                employment[k] = max(0, min(5, cur + dv))
    wp = clean_delta.get("weak_points") or {}
    if wp:
        new_dims["weak_points"] = {
            "topics": wp.get("topics", []),
            "error_types": wp.get("error_types", []),
        }
    return new_dims
