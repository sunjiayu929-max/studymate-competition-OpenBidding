"""学生画像 schema。
设计原则：每个维度都可视化（雷达图 / 标签云 / 文字标签），便于演示。
"""
from pydantic import BaseModel, Field


class KnowledgeBase(BaseModel):
    """知识基础：每个子项 0-5 分。默认 3 = 中位估计（对话开始后被实际抽取覆盖）。

    subject_prior 是通用「当前课程领域的先验」分（多课程通用），可被任何课程的画像/评估复用。
    保留 ml_prior alias 用于向后兼容旧数据。
    """
    math: int = Field(3, ge=0, le=5, description="数学基础")
    programming: int = Field(3, ge=0, le=5, description="编程基础")
    statistics: int = Field(3, ge=0, le=5, description="统计/概率")
    english: int = Field(3, ge=0, le=5, description="英语阅读")
    subject_prior: int = Field(3, ge=0, le=5, description="当前课程领域先验")


class CognitiveStyle(BaseModel):
    """认知风格偏好：0-5 分越高代表越偏好该方式。默认 3 = 中性。"""
    visual: int = Field(3, ge=0, le=5, description="视觉化（图表/动画）")
    reading: int = Field(3, ge=0, le=5, description="阅读/文档")
    hands_on: int = Field(3, ge=0, le=5, description="动手实操/代码")
    auditory: int = Field(3, ge=0, le=5, description="听讲解/视频")


class Goals(BaseModel):
    primary: str = Field("", description="主要目标，如：考研机器学习 / 完成毕业项目 / 兴趣入门")
    deadline: str = Field("", description="时间预期，自由文本")
    target_topics: list[str] = Field(default_factory=list, description="目标知识点列表")


class Pace(BaseModel):
    hours_per_week: int = Field(0, ge=0, le=40, description="周学习时长（小时）；0 表示未填")
    intensity: str = Field("", description="slow / medium / fast / intensive；空 表示未填")


class ResourcePreference(BaseModel):
    """资源偏好：每种资源 0-5 分。越高代表越想看到这类资源。默认 3 = 中性。"""
    document: int = Field(3, ge=0, le=5)
    mindmap: int = Field(3, ge=0, le=5)
    quiz: int = Field(3, ge=0, le=5)
    code: int = Field(3, ge=0, le=5)
    video: int = Field(3, ge=0, le=5)
    reading: int = Field(3, ge=0, le=5)


class WeakPoints(BaseModel):
    topics: list[str] = Field(default_factory=list, description="薄弱知识点")
    error_types: list[str] = Field(default_factory=list, description="错误类型：概念混淆/公式推导/代码实现/...")


class EmploymentSkills(BaseModel):
    """就业技能证据分（0-5）。全 0 表示尚无可信证据，而不是能力为零。"""
    programming: int = Field(0, ge=0, le=5, description="编程实现")
    algorithms: int = Field(0, ge=0, le=5, description="算法建模")
    data_ai: int = Field(0, ge=0, le=5, description="数据与 AI")
    systems: int = Field(0, ge=0, le=5, description="系统与网络")
    engineering: int = Field(0, ge=0, le=5, description="工程实践")
    professional: int = Field(0, ge=0, le=5, description="职业素养")


class ProfileDims(BaseModel):
    """完整画像。和 db.models.Profile.dims 一一对应。"""
    knowledge_base: KnowledgeBase = Field(default_factory=KnowledgeBase)
    cognitive_style: CognitiveStyle = Field(default_factory=CognitiveStyle)
    goals: Goals = Field(default_factory=Goals)
    weak_points: WeakPoints = Field(default_factory=WeakPoints)
    pace: Pace = Field(default_factory=Pace)
    preference: ResourcePreference = Field(default_factory=ResourcePreference)
    employment_skills: EmploymentSkills = Field(default_factory=EmploymentSkills)


class ProfileChatRequest(BaseModel):
    user_id: int
    message: str
    history: list[dict] = Field(default_factory=list)
    # 看图建画像：本轮消息可附图片（base64 data URL，前端已压缩）。
    # 带图 → 切 qwen-vl 视觉模型读图（如上传成绩单截图自动抽知识基础）。
    images: list[str] | None = None


class ProfilePatch(BaseModel):
    """LLM 一次对话能更新的字段，全部 optional。"""
    knowledge_base: dict | None = None
    cognitive_style: dict | None = None
    goals: dict | None = None
    weak_points: dict | None = None
    pace: dict | None = None
    preference: dict | None = None
    employment_skills: dict | None = None
    reasoning: str = ""  # 模型自陈：基于哪句话更新了哪个维度


def normalize_profile_dims(value: dict | None) -> dict:
    """Fill newly added dimensions for legacy JSON without mutating profile version."""
    return ProfileDims.model_validate(value or {}).model_dump()
