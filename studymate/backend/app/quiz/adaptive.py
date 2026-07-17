"""Deterministic error tagging used by grading and later adaptive question generation."""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable


_CALCULATION_HINTS = ("计算", "求", "公式", "数值", "概率", "复杂度", "梯度", "矩阵", "方差", "均值")
_METHOD_HINTS = ("适合", "应当", "应该", "选择", "采用", "方法", "算法", "策略", "场景")
_BOUNDARY_HINTS = ("边界", "极端", "为空", "空数组", "溢出", "异常", "鲁棒", "特殊情况")
_COMPLEXITY_HINTS = ("复杂度", "性能", "时间开销", "空间开销", "效率")
_DEBUG_HINTS = ("语法", "报错", "异常", "运行", "未定义", "类型", "缩进", "编译")


def _is_blank(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def adaptive_error_tags(
    *,
    question: str,
    item_type: str,
    user_answer: object = None,
    judge_reason: str = "",
) -> list[str]:
    """Classify the skill exposed by a wrong answer without making up a psychological cause."""
    if _is_blank(user_answer):
        return ["未作答"]

    text = f"{question} {judge_reason}".lower()
    tags: list[str] = []

    if item_type == "code":
        tags.append("编程实现")
        if any(hint in text for hint in _DEBUG_HINTS):
            tags.append("代码调试")
        if any(hint in text for hint in _BOUNDARY_HINTS):
            tags.append("边界条件")
        if any(hint in text for hint in _COMPLEXITY_HINTS):
            tags.append("复杂度分析")
    elif any(hint in text for hint in _CALCULATION_HINTS):
        tags.append("公式计算")
    elif item_type == "fill":
        tags.append("知识记忆")
    elif any(hint in text for hint in _METHOD_HINTS):
        tags.append("方法选择")
    else:
        tags.append("概念辨析")

    # 保持顺序稳定并控制 UI 标签数量。
    return list(dict.fromkeys(tags))[:3]


def effective_error_tags(
    *,
    question: str,
    item_type: str,
    user_answer: object = None,
    judge_reason: str = "",
    stored_tags: Iterable[str] | None = None,
) -> list[str]:
    """Normalize persisted legacy tags without rewriting historical quiz rows."""
    if _is_blank(user_answer):
        return ["未作答"]
    clean = list(dict.fromkeys(
        str(tag).strip()
        for tag in (stored_tags or [])
        if str(tag).strip() and str(tag).strip() != "未作答"
    ))[:3]
    return clean or adaptive_error_tags(
        question=question,
        item_type=item_type,
        user_answer=user_answer,
        judge_reason=judge_reason,
    )


def summarize_error_focus(tag_groups: Iterable[Iterable[str]], limit: int = 3) -> list[dict]:
    """Return recent high-frequency error skills, excluding the non-skill tag '未作答'."""
    counts = Counter(tag for tags in tag_groups for tag in tags if tag and tag != "未作答")
    return [{"tag": tag, "count": count} for tag, count in counts.most_common(limit)]
