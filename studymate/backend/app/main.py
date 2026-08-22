from contextlib import asynccontextmanager
from datetime import datetime
import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine, Base
# 导入 models 让 Base 知道所有表
from app.db import models  # noqa: F401
from app.deps import require_admin, require_user
from app.api import health, profile, rag, workspace, tutor, eval as eval_api, tests as tests_api, courses as courses_api, notes as notes_api, events as events_api, feedback as feedback_api, auth as auth_api, voice as voice_api, quiz_sessions as quiz_sessions_api, theory_assessments as theory_assessments_api, run as run_api, concept as concept_api, bili as bili_api, ocr as ocr_api, rencaiya as rencaiya_api, careers as careers_api, reading as reading_api, knowledge as knowledge_api, ppt as ppt_api, interviews as interviews_api
from app.video.assembler import VideoAssemblyError, media_file_path


_seed_password_hash = PasswordHash.recommended()

_DEFAULT_STUDENT_NAMES = (
    "sunjiayu",
    "baixinyue",
    "yuanshicong",
    "chenzhuo",
    "lijiayi",
    "zhouxiang",
    "tianyixin",
    "liufei",
)


def _seed_password_matches(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        return _seed_password_hash.verify(password, stored_hash)
    except UnknownHashError:
        return False


async def _ensure_columns(conn):
    """开发期轻量 migration：create_all 不会 ALTER 已存在的表，
    新增列时这里补 ADD COLUMN（仅 SQLite，幂等）。
    """
    # 检查 test_cases.course_id
    rows = await conn.execute(text("PRAGMA table_info(test_cases)"))
    cols = {r[1] for r in rows.fetchall()}
    if "course_id" not in cols:
        await conn.execute(text("ALTER TABLE test_cases ADD COLUMN course_id INTEGER"))
    # 检查 notes.folder
    rows = await conn.execute(text("PRAGMA table_info(notes)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "folder" not in cols:
        await conn.execute(text("ALTER TABLE notes ADD COLUMN folder VARCHAR(128) DEFAULT ''"))
    # 检查 users.role
    rows = await conn.execute(text("PRAGMA table_info(users)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "role" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(16) DEFAULT 'student'"))
    if cols and "email" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(320)"))
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
    if cols and "password_hash" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(512)"))
    if cols and "email_verified_at" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
    if cols and "is_active" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
    # 检查 knowledge_chunks.embedding（混合检索语义向量列）
    rows = await conn.execute(text("PRAGMA table_info(knowledge_chunks)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "embedding" not in cols:
        await conn.execute(text("ALTER TABLE knowledge_chunks ADD COLUMN embedding JSON"))
    # 早期生成知识库把“AI 生成”写进了来源标题。来源仍由 meta 保留生成留痕，
    # 展示标题只保留课程、章节和知识点，避免每条引用重复出现相同前缀。
    if cols:
        for prefix in ("AI 生成·", "AI生成·", "AI 生成 ·", "AI生成 ·"):
            await conn.execute(
                text(
                    "UPDATE knowledge_chunks "
                    "SET source = trim(substr(source, :start_at)) "
                    "WHERE source LIKE :pattern"
                ),
                {
                    "start_at": len(prefix) + 1,
                    "pattern": f"{prefix}%",
                },
            )
    # 检查 tutor_sessions 的课程级历史会话字段
    rows = await conn.execute(text("PRAGMA table_info(tutor_sessions)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "course_id" not in cols:
        await conn.execute(text("ALTER TABLE tutor_sessions ADD COLUMN course_id INTEGER"))
    if cols and "title" not in cols:
        await conn.execute(
            text("ALTER TABLE tutor_sessions ADD COLUMN title VARCHAR(256) DEFAULT '新的学习对话'")
        )
    if cols and "is_active" not in cols:
        await conn.execute(text("ALTER TABLE tutor_sessions ADD COLUMN is_active BOOLEAN DEFAULT 0"))
    if cols and "updated_at" not in cols:
        await conn.execute(text("ALTER TABLE tutor_sessions ADD COLUMN updated_at DATETIME"))
        await conn.execute(text("UPDATE tutor_sessions SET updated_at = created_at WHERE updated_at IS NULL"))
    if cols:
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_tutor_sessions_course_id ON tutor_sessions (course_id)")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_tutor_sessions_is_active ON tutor_sessions (is_active)")
        )
    # 检查 quiz_session_items.error_tags（错题分类与自适应出题）
    rows = await conn.execute(text("PRAGMA table_info(quiz_session_items)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "error_tags" not in cols:
        await conn.execute(text("ALTER TABLE quiz_session_items ADD COLUMN error_tags JSON DEFAULT '[]'"))
    # 私有知识库后台任务字段（原文件落在受控持久目录，不通过接口暴露路径）。
    rows = await conn.execute(text("PRAGMA table_info(user_knowledge_documents)"))
    cols = {r[1] for r in rows.fetchall()}
    private_document_columns = {
        "source_path": "VARCHAR(768) DEFAULT ''",
        "checksum_sha256": "VARCHAR(64) DEFAULT ''",
        "retry_count": "INTEGER DEFAULT 0",
        "ocr_status": "VARCHAR(32) DEFAULT 'not_needed'",
        "started_at": "DATETIME",
        "finished_at": "DATETIME",
    }
    for column, definition in private_document_columns.items():
        if cols and column not in cols:
            await conn.execute(
                text(f"ALTER TABLE user_knowledge_documents ADD COLUMN {column} {definition}")
            )
    # 旧版曾把未通过裁决的训练置为 manual_review。人工复核已取消：历史资源仍不发布，
    # 但统一迁移为“需要重新启动自动返工”，避免旧记录继续向前端暴露已删除的状态。
    rows = await conn.execute(text("PRAGMA table_info(training_runs)"))
    training_run_columns = {r[1] for r in rows.fetchall()}
    if training_run_columns:
        legacy_runs = await conn.execute(
            text(
                "SELECT id, decision FROM training_runs "
                "WHERE status = 'manual_review' OR stage = 'manual_review' "
                "OR decision LIKE '%manual_review%' OR decision LIKE '%人工复核%' "
                "OR decision LIKE '%人工审核%' OR decision LIKE '%转人工%'"
            )
        )
        for run_id, raw_decision in legacy_runs.fetchall():
            try:
                decision = json.loads(raw_decision) if isinstance(raw_decision, str) else dict(raw_decision or {})
            except (TypeError, ValueError):
                decision = {}
            required_fixes = [
                str(item)
                .replace("导师人工复核", "自动返工")
                .replace("人工复核", "自动返工")
                .replace("人工审核", "自动返工")
                .replace("转人工", "自动返工")
                for item in decision.get("required_fixes") or []
            ]
            decision.update({
                "decision": "rework",
                "summary": "旧版未通过裁决的资源不会发布；重新启动训练后进入自动返工闭环。",
                "rework_targets": decision.get("rework_targets") or ["doc", "guide", "quiz"],
                "required_fixes": required_fixes,
            })
            await conn.execute(
                text(
                    "UPDATE training_runs SET status = 'failed', stage = 'failed', decision = :decision "
                    "WHERE id = :run_id"
                ),
                {"run_id": run_id, "decision": json.dumps(decision, ensure_ascii=False)},
            )
    await conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS system_migrations ("
            "version VARCHAR(64) PRIMARY KEY, "
            "description VARCHAR(512) NOT NULL, "
            "applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
    )
    migrations = (
        ("2026.07.29-base", "开发期轻量迁移基线"),
        ("2026.07.29-private-knowledge-jobs", "私有知识库后台任务、原文件校验、OCR 状态与安全重试"),
        ("2026.08.13-auto-rework", "移除人工复核状态，未通过裁决统一进入自动返工闭环"),
        ("2026.08.20-ai-interview", "AI 面试启动票据、报告回传与岗位画像证据"),
    )
    for version, description in migrations:
        await conn.execute(
            text(
                "INSERT OR IGNORE INTO system_migrations (version, description, applied_at) "
                "VALUES (:version, :description, CURRENT_TIMESTAMP)"
            ),
            {"version": version, "description": description},
        )


async def _ensure_seed_user(
    conn,
    *,
    email: str,
    password: str,
    name: str,
    role: str,
    verified_at: datetime,
    user_id: int | None = None,
):
    """Create or repair one fixed test account without duplicating it."""
    if user_id is not None:
        conflict = (
            await conn.execute(
                text(
                    "SELECT id FROM users "
                    "WHERE lower(email) = :email AND id != :user_id LIMIT 1"
                ),
                {"email": email, "user_id": user_id},
            )
        ).fetchone()
        if conflict is not None:
            raise RuntimeError(
                f"Cannot assign {email} to user_id={user_id}: "
                f"the email is already owned by user_id={conflict[0]}"
            )
        result = await conn.execute(
            text(
                "SELECT id, name, role, email, password_hash, "
                "email_verified_at, is_active FROM users WHERE id = :user_id"
            ),
            {"user_id": user_id},
        )
    else:
        result = await conn.execute(
            text(
                "SELECT id, name, role, email, password_hash, "
                "email_verified_at, is_active FROM users "
                "WHERE lower(email) = :email ORDER BY id LIMIT 2"
            ),
            {"email": email},
        )

    rows = result.mappings().all()
    if len(rows) > 1:
        raise RuntimeError(f"Multiple users have the case-insensitive email {email}")
    row = rows[0] if rows else None

    if row is None:
        values = {
            "name": name,
            "role": role,
            "email": email,
            "password_hash": _seed_password_hash.hash(password),
            "verified_at": verified_at,
            "created_at": verified_at,
        }
        if user_id is None:
            await conn.execute(
                text(
                    "INSERT INTO users "
                    "(name, role, email, password_hash, email_verified_at, "
                    "is_active, created_at) VALUES "
                    "(:name, :role, :email, :password_hash, :verified_at, "
                    "1, :created_at)"
                ),
                values,
            )
        else:
            await conn.execute(
                text(
                    "INSERT INTO users "
                    "(id, name, role, email, password_hash, email_verified_at, "
                    "is_active, created_at) VALUES "
                    "(:user_id, :name, :role, :email, :password_hash, "
                    ":verified_at, 1, :created_at)"
                ),
                {"user_id": user_id, **values},
            )
        return

    updates: dict[str, object] = {}
    for column, expected in (
        ("name", name),
        ("role", role),
        ("email", email),
    ):
        if row[column] != expected:
            updates[column] = expected
    if row["email_verified_at"] is None:
        updates["email_verified_at"] = verified_at
    if not bool(row["is_active"]):
        updates["is_active"] = True
    if not _seed_password_matches(password, row["password_hash"]):
        updates["password_hash"] = _seed_password_hash.hash(password)

    if updates:
        params: dict[str, object] = {"target_id": row["id"]}
        assignments: list[str] = []
        for column, value in updates.items():
            parameter = f"value_{column}"
            assignments.append(f"{column} = :{parameter}")
            params[parameter] = value
        await conn.execute(
            text(f"UPDATE users SET {', '.join(assignments)} WHERE id = :target_id"),
            params,
        )


async def _ensure_seed_users(conn):
    """Provision the fixed admin, judge, and default student accounts idempotently."""
    verified_at = datetime.utcnow()
    await _ensure_seed_user(
        conn,
        user_id=1,
        email="admin@studymate.com",
        password="admin123456",
        name="管理员",
        role="admin",
        verified_at=verified_at,
    )
    # 兼容早期普通用户邮箱拼写错误，保留原用户 ID 及其学习数据。
    await conn.execute(
        text(
            "UPDATE users SET email = 'lijiayi@studymate.com', name = 'lijiayi' "
            "WHERE lower(email) = 'jijayi@studymate.com' "
            "AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'lijiayi@studymate.com')"
        )
    )
    for number in range(1, 11):
        # 修正早期误写的 juduge01...juduge10，保留原用户 ID 及其学习数据。
        old_email = f"juduge{number:02d}@studymate.com"
        email = f"judge{number:02d}@studymate.com"
        await conn.execute(
            text(
                "UPDATE users SET email = :email "
                "WHERE lower(email) = :old_email "
                "AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = :email)"
            ),
            {"email": email, "old_email": old_email},
        )
        await _ensure_seed_user(
            conn,
            email=email,
            password="judge123456",
            name=f"评委{number:02d}",
            role="judge",
            verified_at=verified_at,
        )
    for name in _DEFAULT_STUDENT_NAMES:
        await _ensure_seed_user(
            conn,
            email=f"{name}@studymate.com",
            password="user123456",
            name=name,
            role="student",
            verified_at=verified_at,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：建表（开发用，正式上 alembic）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_columns(conn)
        await _ensure_seed_users(conn)
    await knowledge_api.mark_interrupted_tasks_failed()
    yield
    await engine.dispose()


app = FastAPI(
    title="StudyMate Backend",
    description="基于大模型的个性化资源生成与学习多智能体系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(auth_api.router, prefix="/api")
user_required = [Depends(require_user)]
admin_required = [Depends(require_admin)]
app.include_router(profile.router, prefix="/api", dependencies=user_required)
app.include_router(rag.router, prefix="/api", dependencies=user_required)
app.include_router(workspace.router, prefix="/api", dependencies=user_required)
app.include_router(tutor.router, prefix="/api", dependencies=user_required)
app.include_router(eval_api.router, prefix="/api", dependencies=user_required)
app.include_router(tests_api.router, prefix="/api", dependencies=admin_required)
app.include_router(courses_api.router, prefix="/api", dependencies=user_required)
app.include_router(notes_api.router, prefix="/api", dependencies=user_required)
app.include_router(events_api.router, prefix="/api", dependencies=user_required)
app.include_router(feedback_api.router, prefix="/api", dependencies=user_required)
app.include_router(voice_api.router, prefix="/api", dependencies=user_required)
app.include_router(quiz_sessions_api.router, prefix="/api", dependencies=user_required)
app.include_router(theory_assessments_api.router, prefix="/api", dependencies=user_required)
app.include_router(run_api.router, prefix="/api", dependencies=user_required)
app.include_router(concept_api.router, prefix="/api", dependencies=user_required)
app.include_router(bili_api.router, prefix="/api", dependencies=user_required)
app.include_router(ocr_api.router, prefix="/api", dependencies=user_required)
app.include_router(rencaiya_api.router, prefix="/api", dependencies=user_required)
app.include_router(careers_api.router, prefix="/api", dependencies=user_required)
app.include_router(reading_api.router, prefix="/api", dependencies=user_required)
app.include_router(knowledge_api.router, prefix="/api", dependencies=user_required)
app.include_router(ppt_api.router, prefix="/api", dependencies=user_required)
app.include_router(interviews_api.router, prefix="/api", dependencies=user_required)
app.include_router(interviews_api.internal_router, prefix="/api")


@app.get("/api/media/video/{user_id}/{file_id}")
async def get_video_media(user_id: int, file_id: str, user=Depends(require_user)):
    """Serve only an assembled video belonging to the signed-in user."""
    if user.id != user_id:
        raise HTTPException(status_code=404, detail="视频不存在")
    try:
        path = media_file_path(user_id, file_id)
    except VideoAssemblyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="视频不存在")
    return FileResponse(path, media_type="video/mp4", filename=f"study-video-{file_id}.mp4")


@app.get("/")
async def root():
    return {"name": "StudyMate", "docs": "/docs"}
