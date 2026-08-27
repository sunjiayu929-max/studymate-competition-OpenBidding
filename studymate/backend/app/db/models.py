"""
StudyMate ORM 模型；实际结构以本文件和当前数据库迁移逻辑为准。
所有 JSON 字段都用 SQLAlchemy 的 JSON 类型，PG/SQLite 都兼容。
"""
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Float, JSON, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    role: Mapped[str] = mapped_column(String(32), default="student", index=True)  # student / worker / enterprise_admin / judge / admin
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    learner_type: Mapped[str] = mapped_column(String(16), default="student", index=True)  # student / worker
    study_stage: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    company: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    target_role: Mapped[str] = mapped_column(String(128), default="", nullable=False)


class EmailVerificationCode(Base, TimestampMixin):
    __tablename__ = "email_verification_codes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(32), default="register", index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserSession(Base, TimestampMixin):
    __tablename__ = "user_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Profile(Base):
    """可扩展学生画像。
    维度：knowledge_base / cognitive_style / goals / weak_points / pace / preference /
    employment_skills
    所有维度合并放进 dims jsonb，方便扩展。
    """
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    dims: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProfileSnapshot(Base, TimestampMixin):
    __tablename__ = "profile_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    trigger_event: Mapped[str] = mapped_column(String(64))


class Course(Base, TimestampMixin):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    description: Mapped[str] = mapped_column(Text, default="")


class Enterprise(Base, TimestampMixin):
    """演示级企业组织。一个账号本轮只允许加入一个企业。"""
    __tablename__ = "enterprises"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="active")


class EnterpriseMembership(Base, TimestampMixin):
    __tablename__ = "enterprise_memberships"
    __table_args__ = (UniqueConstraint("user_id", name="uq_enterprise_membership_user"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    member_role: Mapped[str] = mapped_column(String(24), default="learner")  # owner / manager / learner
    job_title: Mapped[str] = mapped_column(String(128), default="")
    status: Mapped[str] = mapped_column(String(16), default="active")


class EnterpriseTask(Base, TimestampMixin):
    __tablename__ = "enterprise_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(256))
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(16), default="training", index=True)  # training / reading
    target_role: Mapped[str] = mapped_column(String(128), default="")
    material_title: Mapped[str] = mapped_column(String(256), default="")
    material_content: Mapped[str] = mapped_column(Text, default="")
    knowledge_base_id: Mapped[int | None] = mapped_column(ForeignKey("enterprise_knowledge_bases.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)  # draft / published / expired
    due_label: Mapped[str] = mapped_column(String(64), default="本周完成")


class EnterpriseTaskAssignment(Base, TimestampMixin):
    __tablename__ = "enterprise_task_assignments"
    __table_args__ = (UniqueConstraint("task_id", "learner_id", name="uq_enterprise_task_learner"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("enterprise_tasks.id"), index=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending / accepted / in_progress / completed
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EnterpriseKnowledgeBase(Base, TimestampMixin):
    """按目标岗位建设的企业资料集合；多个任务可复用同一知识库。"""
    __tablename__ = "enterprise_knowledge_bases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    target_role: Mapped[str] = mapped_column(String(128), index=True)
    source_course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    materials: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="published")


class EnterpriseAuditLog(Base, TimestampMixin):
    """企业范围的关键操作记录；不把成员的全部学习事件暴露给管理员。"""
    __tablename__ = "enterprise_audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enterprise_id: Mapped[int] = mapped_column(ForeignKey("enterprises.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(48), index=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class SystemMigration(Base):
    """只读运维可见的结构/数据迁移记录。"""
    __tablename__ = "system_migrations"
    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    description: Mapped[str] = mapped_column(String(512))
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class KnowledgeChunk(Base, TimestampMixin):
    """知识库分片。原文 + 元数据 + 语义向量（混合检索用）。"""
    __tablename__ = "knowledge_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(256))
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    chroma_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # 混合检索语义分支：chunk 向量（list[float]，JSON 存）。NULL = 未向量化，检索退化为纯 BM25。
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)


class UserKnowledgeBase(Base, TimestampMixin):
    """用户私有知识库；所有读写必须同时按 id 与 user_id 过滤。"""
    __tablename__ = "user_knowledge_bases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    bound_course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserKnowledgeDocument(Base, TimestampMixin):
    __tablename__ = "user_knowledge_documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    knowledge_base_id: Mapped[int] = mapped_column(ForeignKey("user_knowledge_bases.id"), index=True)
    filename: Mapped[str] = mapped_column(String(256))
    media_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="parsing", index=True)
    parse_progress: Mapped[int] = mapped_column(Integer, default=0)
    vector_progress: Mapped[int] = mapped_column(Integer, default=0)
    error_detail: Mapped[str] = mapped_column(Text, default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    source_path: Mapped[str] = mapped_column(String(768), default="")
    checksum_sha256: Mapped[str] = mapped_column(String(64), default="")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    ocr_status: Mapped[str] = mapped_column(String(32), default="not_needed")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserKnowledgeChunk(Base, TimestampMixin):
    __tablename__ = "user_knowledge_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    knowledge_base_id: Mapped[int] = mapped_column(ForeignKey("user_knowledge_bases.id"), index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("user_knowledge_documents.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)


class Resource(Base, TimestampMixin):
    """多 Agent 生成的资源。type ∈ {doc, mindmap, quiz, reading, code, video}"""
    __tablename__ = "resources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(256))
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    agent_id: Mapped[str] = mapped_column(String(64))
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=True)


class LearningPath(Base, TimestampMixin):
    __tablename__ = "learning_paths"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    nodes: Mapped[list] = mapped_column(JSON, default=list)
    edges: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="active")


class TrainingRun(Base, TimestampMixin):
    """一次可审计的岗位训练闭环运行记录。"""
    __tablename__ = "training_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    domain: Mapped[str] = mapped_column(String(128), default="")
    target_role: Mapped[str] = mapped_column(String(128), default="")
    topic: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    stage: Mapped[str] = mapped_column(String(32), default="diagnosis")
    generation_round: Mapped[int] = mapped_column(Integer, default=1)
    diagnosis: Mapped[dict] = mapped_column(JSON, default=dict)
    outputs: Mapped[dict] = mapped_column(JSON, default=dict)
    reviews: Mapped[dict] = mapped_column(JSON, default=dict)
    decision: Mapped[dict] = mapped_column(JSON, default=dict)
    feedback: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Exercise(Base, TimestampMixin):
    __tablename__ = "exercises"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(32))  # mcq / fill / code / short
    content: Mapped[dict] = mapped_column(JSON)
    answer: Mapped[dict] = mapped_column(JSON)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    tags: Mapped[list] = mapped_column(JSON, default=list)


class Attempt(Base, TimestampMixin):
    __tablename__ = "attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    answer: Mapped[dict] = mapped_column(JSON)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


class Event(Base):
    """埋点。挑战杯用户认可度 / 软件杯学习效果评估的数据基础。"""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Feedback(Base, TimestampMixin):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(64))
    rating: Mapped[int] = mapped_column(Integer)  # 1..5 或 -1/+1
    comment: Mapped[str] = mapped_column(Text, default="")


class FeedbackReply(Base, TimestampMixin):
    __tablename__ = "feedback_replies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feedback_id: Mapped[int] = mapped_column(ForeignKey("feedback.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text)


class TutorSession(Base, TimestampMixin):
    __tablename__ = "tutor_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(256), default="新的学习对话")
    messages: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class Evaluation(Base, TimestampMixin):
    __tablename__ = "evaluations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scores: Mapped[dict] = mapped_column(JSON)
    suggestions: Mapped[list] = mapped_column(JSON, default=list)


class Folder(Base, TimestampMixin):
    """用户自定义笔记文件夹。
    - 文件夹和 notes 表的 note.folder 是松耦合：folder 表声明的是「这个名字存在（即使没笔记）」
    - 列表时合并：declared (folders 表) ∪ derived (notes.folder distinct)
    """
    __tablename__ = "folders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)


class Note(Base, TimestampMixin):
    """用户笔记本。
    每条笔记绑定 course_id（5 门课各一个笔记本）+ user_id。
    content_md 是 Markdown 文本，前端 react-markdown 渲染。
    tags 用于错题本 / 摘录 / 自定义 chips；source 记录来源（doc / quiz / manual / tutor）便于联动。
    """
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    content_md: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(32), default="manual")  # manual / doc / quiz / tutor
    folder: Mapped[str] = mapped_column(String(128), default="", index=True)  # 用户自定义文件夹名；空字符串=未分类
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)


class QuizSession(Base, TimestampMixin):
    """题库测验 session（与工作台临时检测题隔离）。
    用户主动出卷自测：选课 + 主题 + 各类型题数 + 难度 + 答题模式 + code 评分方式。
    status: generating（出题中）/ ready（已生成待答）/ submitted（已提交）。
    """
    __tablename__ = "quiz_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    topic: Mapped[str] = mapped_column(String(256), default="综合复习")
    mcq_count: Mapped[int] = mapped_column(Integer, default=0)
    fill_count: Mapped[int] = mapped_column(Integer, default=0)
    code_count: Mapped[int] = mapped_column(Integer, default=0)
    difficulty: Mapped[int] = mapped_column(Integer, default=2)  # 1-4
    mode: Mapped[str] = mapped_column(String(16), default="exam")  # exam（试卷）/ quest（闯关）
    code_grading: Mapped[str] = mapped_column(String(16), default="llm")  # llm / self
    status: Mapped[str] = mapped_column(String(16), default="generating", index=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 总得分 0-100
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)  # 答题用时
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class QuizSessionItem(Base, TimestampMixin):
    """单题（属于一个 QuizSession）。
    type: mcq / fill / code
    answer_key: mcq 是 0-based 索引 int；fill 是字符串；code 是参考代码
    user_answer: 用户提交的答案（mcq 索引 int、fill / code 字符串）
    score: 单题得分 0-100；mcq/fill 命中 100，否则 0；code 题按 code_grading 路由计算
    """
    __tablename__ = "quiz_session_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("quiz_sessions.id"), index=True)
    idx: Mapped[int] = mapped_column(Integer, default=0)  # 题序
    type: Mapped[str] = mapped_column(String(16))
    question: Mapped[str] = mapped_column(Text)
    options: Mapped[list] = mapped_column(JSON, default=list)  # mcq 才有
    starter: Mapped[str] = mapped_column(Text, default="")  # code 才有
    answer_key: Mapped[dict] = mapped_column(JSON, default=dict)  # {"value": 1 / "动量" / "代码片段"}
    explanation: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[int] = mapped_column(Integer, default=2)
    user_answer: Mapped[dict] = mapped_column(JSON, default=dict)  # {"value": ...}
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    judge_reason: Mapped[str] = mapped_column(Text, default="")  # code 题 LLM judge 留痕
    error_tags: Mapped[list] = mapped_column(JSON, default=list)  # 错题能力标签，供展示与后续自适应出题


class TheoryAssessment(Base, TimestampMixin):
    """用户在进入新目标岗位训练中心时完成的一次理论基线测评。

    记录按 user_id + role_id 隔离；items 保留知识库来源和标准答案，接口在提交前会隐藏答案。
    status: ready（待作答）/ submitted（已提交）/ error（组卷失败）。
    """
    __tablename__ = "theory_assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role_id: Mapped[str] = mapped_column(String(128), index=True)
    role_name: Mapped[str] = mapped_column(String(128))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="ready", index=True)
    items: Mapped[list] = mapped_column(JSON, default=list)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InterviewAttempt(Base, TimestampMixin):
    """A StudyMate-owned record for one externally executed practice interview.

    The remote service owns its conversation and uploaded files. This model
    stores the immutable launch context and the normalized report returned by
    that service, so no cross-service database access is necessary.
    """
    __tablename__ = "interview_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role_id: Mapped[str] = mapped_column(String(128), index=True)
    role_name: Mapped[str] = mapped_column(String(128))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    role_context: Mapped[dict] = mapped_column(JSON, default=dict)
    profile_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    # launch_ready / launched / in_progress / completed / abandoned
    status: Mapped[str] = mapped_column(String(32), default="launch_ready", index=True)
    external_interview_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    report_hash: Mapped[str] = mapped_column(String(64), default="")
    launched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InterviewLaunchTicket(Base, TimestampMixin):
    """One browser-visible, short-lived credential for a remote launch."""
    __tablename__ = "interview_launch_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("interview_attempts.id"), unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class OJLaunchTicket(Base, TimestampMixin):
    """One-time browser credential for the independently deployed Hydro OJ."""
    __tablename__ = "oj_launch_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    next_path: Mapped[str] = mapped_column(String(512), default="/oj/", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TestCase(Base, TimestampMixin):
    """挑战杯交付物：典型测试 case + 准确性论证。

    流程：用户录入 question + expected → 一键跑 → 喂给某个 target_agent（tutor / doc / quiz）→
    得到 actual → LLM-as-judge 打分（0-100）→ 留 judge_reason，便于评委审计。
    """
    __tablename__ = "test_cases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    question: Mapped[str] = mapped_column(Text)
    expected: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="通用", index=True)
    target_agent: Mapped[str] = mapped_column(String(32), default="tutor")  # tutor / doc / quiz
    actual: Mapped[str] = mapped_column(Text, default="")
    citations: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    judge_reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending / running / passed / failed / error
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
