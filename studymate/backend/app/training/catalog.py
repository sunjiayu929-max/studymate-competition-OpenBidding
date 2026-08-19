"""Map knowledge-base courses to the server-owned target-role catalogue.

Target roles are shared by the browser, the training loop, and the interview
integration. Keeping the mapping derived from :mod:`role_catalog` prevents a
course from silently acquiring a different competency list in one workflow.
The original ``机器学习`` course remains a compatibility entry for existing
single-course data and is intentionally not an interview target role.
"""
from __future__ import annotations

from copy import deepcopy

from .role_catalog import TARGET_ROLES, TargetRole


def _training_entry(role: TargetRole) -> dict:
    return {
        "course_name": role.course_name,
        "domain": role.domain,
        "target_role": role.name,
        "role_summary": role.summary,
        "core_competencies": list(role.competencies),
    }


_LEGACY_MACHINE_LEARNING_ROLE = {
    "course_name": "机器学习",
    "domain": "工业互联网",
    "target_role": "工业视觉质检算法工程师",
    "role_summary": "围绕工业视觉缺陷数据、模型训练和现场验收建立机器学习工程能力",
    "core_competencies": ["数据标注", "特征工程", "模型训练", "评估优化", "部署验收"],
}


# Keep the historical FDE-first order for callers that render this list, while
# making every interview-enabled role come from the canonical role catalogue.
_ROLE_ORDER = (
    "fde",
    "ai-agent",
    "ai-infra",
    "embodied-ai",
    "llm-security",
    "llm-application",
    "devsecops",
    "rag-implementation",
    "mlops",
    "ai-native-frontend",
    "industrial-architect",
    "industrial-data",
    "edge-ai",
    "industrial-vision",
    "industrial-network",
)

TRAINING_ROLES: list[dict] = [
    _LEGACY_MACHINE_LEARNING_ROLE,
    *[_training_entry(TARGET_ROLES[role_id]) for role_id in _ROLE_ORDER],
]


def resolve_training_role(course_name: str | None) -> dict:
    normalized = (course_name or "").strip()
    for item in TRAINING_ROLES:
        if item["course_name"] == normalized:
            return deepcopy(item)
    return {
        "course_name": normalized or "专业知识库",
        "domain": "特定软件开发",
        "target_role": f"{normalized or '领域'}应用工程师",
        "role_summary": "把领域知识转化为可验证的岗位任务能力",
        "core_competencies": ["领域基础", "工具使用", "任务实施", "质量验证", "故障排查"],
    }
