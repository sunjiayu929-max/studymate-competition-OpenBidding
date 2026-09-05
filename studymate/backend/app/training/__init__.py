"""岗位训练领域模型与闭环辅助逻辑。"""

from app.training.catalog import TRAINING_ROLES, resolve_training_role
from app.training.role_catalog import TARGET_ROLES, TargetRole, get_target_role

__all__ = ["TRAINING_ROLES", "resolve_training_role", "TARGET_ROLES", "TargetRole", "get_target_role"]
