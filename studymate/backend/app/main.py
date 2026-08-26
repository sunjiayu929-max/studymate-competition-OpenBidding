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
from app.api import health, profile, rag, workspace, tutor, eval as eval_api, tests as tests_api, courses as courses_api, notes as notes_api, events as events_api, feedback as feedback_api, auth as auth_api, voice as voice_api, quiz_sessions as quiz_sessions_api, theory_assessments as theory_assessments_api, run as run_api, concept as concept_api, bili as bili_api, ocr as ocr_api, rencaiya as rencaiya_api, careers as careers_api, reading as reading_api, knowledge as knowledge_api, ppt as ppt_api, interviews as interviews_api, enterprise as enterprise_api, admin as admin_api, oj as oj_api
from app.video.assembler import VideoAssemblyError, media_file_path
from app.demo_private_knowledge import ensure_demo_private_libraries
from app.demo_notes import ensure_demo_notes_for_users


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

_PRAMATE_MEMBER_NAMES = {
    "sunjiayu": "孙佳玉",
    "baixinyue": "白新悦",
    "yuanshicong": "袁士聪",
    "chenzhuo": "陈卓",
    "lijiayi": "李佳怡",
    "zhouxiang": "周翔",
    "tianyixin": "田一新",
    "liufei": "刘飞",
}

_PRAMATE_DEMO_ADMIN_EMAIL = "admin@pramate.com"
_PRAMATE_DEMO_ADMIN_PASSWORD = "a123456"
_PRAMATE_DEMO_ENTERPRISE_NAME = "河南本线商贸有限公司"
_PRAMATE_DEMO_INVITE_CODE = "PRAMATE-DEMO"
_PRAMATE_STUDENT_PASSWORD = "p123456"
_PRAMATE_EXTRA_MEMBER_EMAIL = "test@pramate.com"
_PRAMATE_EXTRA_MEMBER_PASSWORD = "p123456"


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
    if cols and "learner_type" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN learner_type VARCHAR(16) DEFAULT 'student'"))
    if cols and "study_stage" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN study_stage VARCHAR(32) DEFAULT ''"))
    if cols and "company" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN company VARCHAR(128) DEFAULT ''"))
    if cols and "target_role" not in cols:
        await conn.execute(text("ALTER TABLE users ADD COLUMN target_role VARCHAR(128) DEFAULT ''"))
    rows = await conn.execute(text("PRAGMA table_info(enterprise_knowledge_bases)"))
    cols = {r[1] for r in rows.fetchall()}
    if cols and "source_course_id" not in cols:
        await conn.execute(text("ALTER TABLE enterprise_knowledge_bases ADD COLUMN source_course_id INTEGER"))
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
        ("2026.08.21-oj", "Hydro OJ 单点登录启动票据"),
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
            "learner_type": "student",
            "study_stage": "",
            "company": "",
            "target_role": "",
        }
        if user_id is None:
            await conn.execute(
                text(
                    "INSERT INTO users "
                    "(name, role, email, password_hash, email_verified_at, "
                    "is_active, created_at, learner_type, study_stage, company, target_role) VALUES "
                    "(:name, :role, :email, :password_hash, :verified_at, "
                    "1, :created_at, :learner_type, :study_stage, :company, :target_role)"
                ),
                values,
            )
        else:
            await conn.execute(
                text(
                    "INSERT INTO users "
                    "(id, name, role, email, password_hash, email_verified_at, "
                    "is_active, created_at, learner_type, study_stage, company, target_role) VALUES "
                    "(:user_id, :name, :role, :email, :password_hash, "
                    ":verified_at, 1, :created_at, :learner_type, :study_stage, :company, :target_role)"
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
    """Provision fixed system, enterprise-demo, judge, and student accounts idempotently."""
    verified_at = datetime.utcnow()
    # 保留既有演示邀请码，只同步演示企业名称，避免旧数据库继续展示历史名称。
    await conn.execute(
        text(
            "UPDATE enterprises SET name = :name "
            "WHERE invite_code IN ('PRAMATE-DEMO', 'SM-DEMO')"
        ),
        {"name": _PRAMATE_DEMO_ENTERPRISE_NAME},
    )
    await _ensure_seed_user(
        conn,
        user_id=1,
        email="admin@studymate.com",
        password="admin123456",
        name="管理员",
        role="admin",
        verified_at=verified_at,
    )
    await _ensure_seed_user(
        conn,
        email=_PRAMATE_DEMO_ADMIN_EMAIL,
        password=_PRAMATE_DEMO_ADMIN_PASSWORD,
        name="企业管理员",
        role="enterprise_admin",
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

    for name in _DEFAULT_STUDENT_NAMES:
        display_name = _PRAMATE_MEMBER_NAMES[name]
        await _ensure_seed_user(
            conn,
            email=f"{name}@pramate.com",
            password=_PRAMATE_STUDENT_PASSWORD,
            name=display_name,
            role="student",
            verified_at=verified_at,
        )

    await _ensure_seed_user(
        conn,
        email=_PRAMATE_EXTRA_MEMBER_EMAIL,
        password=_PRAMATE_EXTRA_MEMBER_PASSWORD,
        name="test",
        role="student",
        verified_at=verified_at,
    )

    # @pramate.com 是企业演示账号组，按从业者身份展示岗位信息；旧的
    # @studymate.com 测试账号继续保留学生学习者身份。
    await conn.execute(
        text(
            "UPDATE users SET learner_type = 'worker', company = :company, "
            "target_role = :target_role WHERE lower(email) LIKE '%@pramate.com' "
            "AND lower(email) != :admin_email"
        ),
        {
            "company": _PRAMATE_DEMO_ENTERPRISE_NAME,
            "target_role": "前线部署工程师（FDE）",
            "admin_email": _PRAMATE_DEMO_ADMIN_EMAIL,
        },
    )


async def _ensure_pramate_demo_enterprise(conn):
    """Bind the fixed enterprise demo administrator to the demo organization."""
    admin = (
        await conn.execute(
            text("SELECT id FROM users WHERE lower(email) = :email LIMIT 1"),
            {"email": _PRAMATE_DEMO_ADMIN_EMAIL},
        )
    ).fetchone()
    if admin is None:
        return

    enterprise = (
        await conn.execute(
            text("SELECT id FROM enterprises WHERE invite_code = :invite_code LIMIT 1"),
            {"invite_code": _PRAMATE_DEMO_INVITE_CODE},
        )
    ).fetchone()
    if enterprise is None:
        await conn.execute(
            text(
                "INSERT INTO enterprises (name, invite_code, owner_id, status, created_at) "
                "VALUES (:name, :invite_code, :owner_id, 'active', :created_at)"
            ),
            {
                "name": _PRAMATE_DEMO_ENTERPRISE_NAME,
                "invite_code": _PRAMATE_DEMO_INVITE_CODE,
                "owner_id": admin[0],
                "created_at": datetime.utcnow(),
            },
        )
        enterprise = (
            await conn.execute(
                text("SELECT id FROM enterprises WHERE invite_code = :invite_code LIMIT 1"),
                {"invite_code": _PRAMATE_DEMO_INVITE_CODE},
            )
        ).fetchone()
    else:
        # 演示企业改名时同步已有数据库记录，避免旧名称继续出现在企业端。
        await conn.execute(
            text("UPDATE enterprises SET name = :name WHERE id = :enterprise_id"),
            {"name": _PRAMATE_DEMO_ENTERPRISE_NAME, "enterprise_id": enterprise[0]},
        )

    membership = (
        await conn.execute(
            text("SELECT id FROM enterprise_memberships WHERE user_id = :user_id LIMIT 1"),
            {"user_id": admin[0]},
        )
    ).fetchone()
    if membership is None:
        await conn.execute(
            text(
                "INSERT INTO enterprise_memberships "
                "(enterprise_id, user_id, member_role, job_title, status, created_at) "
                "VALUES (:enterprise_id, :user_id, 'owner', '企业管理员', 'active', :created_at)"
            ),
            {
                "enterprise_id": enterprise[0],
                "user_id": admin[0],
                "created_at": datetime.utcnow(),
            },
        )

    for name in _DEFAULT_STUDENT_NAMES:
        learner = (
            await conn.execute(
                text("SELECT id FROM users WHERE lower(email) = :email LIMIT 1"),
                {"email": f"{name}@pramate.com"},
            )
        ).fetchone()
        if learner is None:
            continue
        await conn.execute(
            text(
                "UPDATE users SET name = :name, learner_type = 'worker', company = :company, "
                "target_role = :target_role WHERE id = :user_id"
            ),
            {
                "name": _PRAMATE_MEMBER_NAMES[name],
                "company": _PRAMATE_DEMO_ENTERPRISE_NAME,
                "target_role": "前线部署工程师（FDE）",
                "user_id": learner[0],
            },
        )
        learner_membership = (
            await conn.execute(
                text("SELECT id FROM enterprise_memberships WHERE user_id = :user_id LIMIT 1"),
                {"user_id": learner[0]},
            )
        ).fetchone()
        if learner_membership is None:
            await conn.execute(
                text(
                    "INSERT INTO enterprise_memberships "
                    "(enterprise_id, user_id, member_role, job_title, status, created_at) "
                    "VALUES (:enterprise_id, :user_id, 'learner', '前线部署工程师（FDE）', 'active', :created_at)"
                ),
                {
                    "enterprise_id": enterprise[0],
                    "user_id": learner[0],
                    "created_at": datetime.utcnow(),
                },
                )


async def _ensure_private_demo_knowledge(conn):
    """建立左侧可见的私有知识库入口，不伪造上传任务。"""
    if not settings.DATABASE_URL.startswith("sqlite:"):
        return
    users = (await conn.execute(text("SELECT id FROM users"))).all()
    for (user_id,) in users:
        existing = await conn.execute(
            text(
                "SELECT id FROM user_knowledge_bases "
                "WHERE user_id = :user_id AND name = :name LIMIT 1"
            ),
            {"user_id": user_id, "name": "岗位转岗公开资料库"},
        )
        library_id = existing.scalar_one_or_none()
        if library_id is not None:
            # 旧版本曾自动插入一份演示文档，清掉它以恢复右侧原本的空资料排版。
            seeded_documents = (
                await conn.execute(
                    text(
                        "SELECT id FROM user_knowledge_documents "
                        "WHERE knowledge_base_id = :library_id "
                        "AND filename = :filename AND source_path = ''"
                    ),
                    {"library_id": library_id, "filename": "岗位转岗公开资料.md"},
                )
            ).all()
            for (document_id,) in seeded_documents:
                await conn.execute(
                    text("DELETE FROM user_knowledge_chunks WHERE document_id = :document_id"),
                    {"document_id": document_id},
                )
                await conn.execute(
                    text("DELETE FROM user_knowledge_documents WHERE id = :document_id"),
                    {"document_id": document_id},
                )
            continue

        now = datetime.utcnow()
        await conn.execute(
            text(
                "INSERT INTO user_knowledge_bases "
                "(user_id, name, description, bound_course_id, created_at, updated_at) "
                "VALUES (:user_id, :name, :description, NULL, :created_at, :updated_at)"
            ),
            {
                "user_id": user_id,
                "name": "岗位转岗公开资料库",
                "description": "StudyMate 自动建立的私有起点，可继续上传自己的岗位资料。",
                "created_at": now,
                "updated_at": now,
            },
        )


async def _insert_demo_quiz_history(conn, *, user_id: int, course_id: int, course_name: str):
    existing = await conn.execute(
        text("SELECT id FROM quiz_sessions WHERE user_id = :user_id AND course_id = :course_id LIMIT 1"),
        {"user_id": user_id, "course_id": course_id},
    )
    if existing.first() is not None:
        return

    role_name = str(course_name).removesuffix(" 岗位知识库")
    now = datetime.utcnow()
    await conn.execute(
        text(
            "INSERT INTO quiz_sessions "
            "(user_id, course_id, topic, mcq_count, fill_count, code_count, difficulty, "
            "mode, code_grading, status, score, duration_ms, submitted_at, created_at) "
            "VALUES (:user_id, :course_id, :topic, 2, 1, 0, 2, 'exam', 'llm', "
            "'submitted', 86, 420000, :submitted_at, :created_at)"
        ),
        {
            "user_id": user_id,
            "course_id": course_id,
            "topic": f"{role_name} 岗位基础复习",
            "submitted_at": now,
            "created_at": now,
        },
    )
    session_id = (await conn.execute(text("SELECT last_insert_rowid()"))).scalar_one()
    items = [
        {
            "idx": 0,
            "type": "mcq",
            "question": f"进入{role_name}岗位交付前，最先需要确认哪项内容？",
            "options": ["需求与验收标准", "只看代码行数", "跳过风险检查", "直接上线"],
            "answer": 0,
            "user_answer": 0,
            "explanation": "先对齐需求、范围和验收标准，再安排实现与交付。",
        },
        {
            "idx": 1,
            "type": "mcq",
            "question": "遇到线上异常时，哪种做法最有利于后续复盘？",
            "options": ["记录现象、影响、原因和修复动作", "只口头描述", "直接删除日志", "等待问题自然消失"],
            "answer": 0,
            "user_answer": 0,
            "explanation": "可追溯的事件记录能把排障过程沉淀为下一次可复用的证据。",
        },
        {
            "idx": 2,
            "type": "fill",
            "question": "把现象、影响、根因和修复动作整理在一起的记录通常称为？",
            "options": [],
            "answer": "故障复盘",
            "user_answer": "故障复盘",
            "explanation": "故障复盘用于还原问题链路并沉淀改进动作。",
        },
    ]
    for item in items:
        await conn.execute(
            text(
                "INSERT INTO quiz_session_items "
                "(session_id, idx, type, question, options, starter, answer_key, explanation, "
                "difficulty, user_answer, is_correct, score, judge_reason, error_tags, created_at) "
                "VALUES (:session_id, :idx, :type, :question, :options, '', :answer_key, "
                ":explanation, 2, :user_answer, 1, 100, '', :error_tags, :created_at)"
            ),
            {
                "session_id": session_id,
                "idx": item["idx"],
                "type": item["type"],
                "question": item["question"],
                "options": json.dumps(item["options"], ensure_ascii=False),
                "answer_key": json.dumps({"value": item["answer"]}, ensure_ascii=False),
                "explanation": item["explanation"],
                "user_answer": json.dumps({"value": item["user_answer"]}, ensure_ascii=False),
                "error_tags": "[]",
                "created_at": now,
            },
        )


async def _ensure_demo_quiz_history(conn):
    """为本地演示账号准备一组可回顾的历史题目。"""
    if not settings.DATABASE_URL.startswith("sqlite:"):
        return

    courses = (
        await conn.execute(
            text("SELECT id, name FROM courses WHERE name LIKE :suffix ORDER BY id"),
            {"suffix": "%岗位知识库"},
        )
    ).all()
    if not courses:
        return

    users = (await conn.execute(text("SELECT id, target_role, role FROM users"))).all()
    for user_id, target_role, user_role in users:
        if user_role == "enterprise_admin":
            continue
        role_text = str(target_role or "").strip()
        if role_text:
            selected = next(
                (
                    course for course in courses
                    if role_text in str(course[1])
                    or str(course[1]).removesuffix(" 岗位知识库") in role_text
                    or ("FDE" in role_text and "FDE" in str(course[1]))
                ),
                courses[0],
            )
            selected_courses = [selected]
        else:
            # 未绑定目标岗位的演示账号可能在浏览器里切换任意岗位，给每个岗位
            # 准备一组独立历史题，避免右侧因 course_id 过滤再次为空。
            selected_courses = courses
        for course_id, course_name in selected_courses:
            await _insert_demo_quiz_history(
                conn,
                user_id=user_id,
                course_id=course_id,
                course_name=str(course_name),
            )


async def _ensure_role_knowledge_catalog() -> None:
    """补齐 SQLite 本地库中缺失的岗位课程与检索切片。

    Docker 种子库只携带基础课程目录；岗位资料作为可审阅源文件独立维护。
    因此裸跑首次解压种子库后，需要在应用启动时做一次幂等导入，否则前端
    会把目录中的岗位标为可用，却无法为它找到对应的 course_id。
    """
    if not settings.DATABASE_URL.startswith("sqlite:"):
        return

    from app.courses import list_course_names

    expected = {name for name in list_course_names() if name.endswith("岗位知识库")}
    if not expected:
        return

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT courses.name, COUNT(knowledge_chunks.id) "
                "FROM courses LEFT JOIN knowledge_chunks "
                "ON knowledge_chunks.course_id = courses.id "
                "WHERE courses.name LIKE :suffix GROUP BY courses.id"
            ),
            {"suffix": "%岗位知识库"},
        )
        imported = {name for name, chunk_count in rows if chunk_count > 0}

    if expected.issubset(imported):
        return

    from scripts.import_fde_knowledge import import_catalog as import_fde_catalog
    from scripts.import_role_knowledge import main as import_role_catalog

    await import_fde_catalog()
    await import_role_catalog()

    test_member = (
        await conn.execute(
            text("SELECT id FROM users WHERE lower(email) = :email LIMIT 1"),
            {"email": _PRAMATE_EXTRA_MEMBER_EMAIL},
        )
    ).fetchone()
    if test_member is not None:
        await conn.execute(
            text(
                "UPDATE users SET name = 'test', learner_type = 'worker', company = :company, "
                "target_role = '前线部署工程师（FDE）' WHERE id = :user_id"
            ),
            {"company": _PRAMATE_DEMO_ENTERPRISE_NAME, "user_id": test_member[0]},
        )
        test_membership = (
            await conn.execute(
                text("SELECT id FROM enterprise_memberships WHERE user_id = :user_id LIMIT 1"),
                {"user_id": test_member[0]},
            )
        ).fetchone()
        if test_membership is None:
            await conn.execute(
                text(
                    "INSERT INTO enterprise_memberships "
                    "(enterprise_id, user_id, member_role, job_title, status, created_at) "
                    "VALUES (:enterprise_id, :user_id, 'learner', '前线部署工程师（FDE）', 'active', :created_at)"
                ),
                {
                    "enterprise_id": enterprise[0],
                    "user_id": test_member[0],
                    "created_at": datetime.utcnow(),
                },
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：建表（开发用，正式上 alembic）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_columns(conn)
    await _ensure_role_knowledge_catalog()
    async with engine.begin() as conn:
        await _ensure_seed_users(conn)
        await _ensure_pramate_demo_enterprise(conn)
        await _ensure_demo_quiz_history(conn)
    await ensure_demo_private_libraries()
    await ensure_demo_notes_for_users()
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
app.include_router(admin_api.router, prefix="/api")
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
app.include_router(enterprise_api.router, prefix="/api", dependencies=user_required)
app.include_router(oj_api.router, prefix="/api")
app.include_router(oj_api.internal_router, prefix="/api")


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
