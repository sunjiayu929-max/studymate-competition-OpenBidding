#!/usr/bin/env python3
"""生成随后端镜像分发的脱敏压缩 SQLite 种子库。

本地开发数据库固定为未跟踪的 ``backend/studymate.db``。本命令创建一致快照，
移除非演示用户数据和认证状态，完成完整性校验，再写入可提交的
``backend/resources/seed/studymate.db.gz``。
"""

from __future__ import annotations

import argparse
import gzip
import shutil
import sqlite3
import tempfile
from pathlib import Path

try:
    from scripts.sanitize_demo_db import (
        APPROVED_EMAILS,
        load_user_plan,
        repair_retired_course_ids,
        sanitize,
    )
except ModuleNotFoundError:  # direct execution: python scripts/build_seed_db.py
    from sanitize_demo_db import (
        APPROVED_EMAILS,
        load_user_plan,
        repair_retired_course_ids,
        sanitize,
    )


EXPECTED_COURSE_COUNT = 25
EXPECTED_KNOWLEDGE_CHUNK_COUNT = 2190
EXPECTED_EMBEDDED_CHUNK_COUNT = 1709


def parse_args() -> argparse.Namespace:
    project_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=project_dir / "backend" / "studymate.db",
        help="作为来源的本地 SQLite 数据库",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_dir / "backend" / "resources" / "seed" / "studymate.db.gz",
        help="要写入的脱敏压缩种子库",
    )
    return parser.parse_args()


def copy_database(source_path: Path, destination_path: Path) -> None:
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    destination = sqlite3.connect(destination_path)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()


def validate_required_content(conn: sqlite3.Connection) -> dict[str, int]:
    stats = {
        "users": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "password_hashes": conn.execute(
            "SELECT COUNT(*) FROM users "
            "WHERE password_hash IS NOT NULL AND TRIM(password_hash) <> ''"
        ).fetchone()[0],
        "argon2_hashes": conn.execute(
            "SELECT COUNT(*) FROM users WHERE password_hash LIKE '$argon2%'"
        ).fetchone()[0],
        "courses": conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0],
        "knowledge_chunks": conn.execute(
            "SELECT COUNT(*) FROM knowledge_chunks"
        ).fetchone()[0],
        "chunks_with_content": conn.execute(
            "SELECT COUNT(*) FROM knowledge_chunks "
            "WHERE content IS NOT NULL AND TRIM(content) <> ''"
        ).fetchone()[0],
        "chunks_with_embedding": conn.execute(
            "SELECT COUNT(*) FROM knowledge_chunks "
            "WHERE embedding IS NOT NULL AND TRIM(embedding) <> ''"
        ).fetchone()[0],
        "courses_with_knowledge": conn.execute(
            "SELECT COUNT(DISTINCT course_id) FROM knowledge_chunks"
        ).fetchone()[0],
        "user_sessions": conn.execute(
            "SELECT COUNT(*) FROM user_sessions"
        ).fetchone()[0],
        "email_verification_codes": conn.execute(
            "SELECT COUNT(*) FROM email_verification_codes"
        ).fetchone()[0],
    }

    approved_count = len(APPROVED_EMAILS)
    if stats["users"] != approved_count:
        raise RuntimeError(
            f"演示账号数量不完整：期望 {approved_count}，实际 {stats['users']}"
        )
    if stats["password_hashes"] != approved_count or stats["argon2_hashes"] != approved_count:
        raise RuntimeError("演示账号密码哈希缺失或格式异常")
    if stats["courses"] != EXPECTED_COURSE_COUNT:
        raise RuntimeError(
            f"基础课程数量不完整：期望 {EXPECTED_COURSE_COUNT}，实际 {stats['courses']}"
        )
    if stats["knowledge_chunks"] != EXPECTED_KNOWLEDGE_CHUNK_COUNT:
        raise RuntimeError(
            "基础知识库数量不完整："
            f"期望 {EXPECTED_KNOWLEDGE_CHUNK_COUNT}，实际 {stats['knowledge_chunks']}"
        )
    if stats["chunks_with_content"] != EXPECTED_KNOWLEDGE_CHUNK_COUNT:
        raise RuntimeError("基础知识库存在正文为空的知识块")
    if stats["chunks_with_embedding"] != EXPECTED_EMBEDDED_CHUNK_COUNT:
        raise RuntimeError(
            "基础课程向量数量异常："
            f"期望 {EXPECTED_EMBEDDED_CHUNK_COUNT}，实际 {stats['chunks_with_embedding']}"
        )
    if stats["courses_with_knowledge"] != EXPECTED_COURSE_COUNT:
        raise RuntimeError("部分基础课程没有关联知识块")
    if stats["user_sessions"] or stats["email_verification_codes"]:
        raise RuntimeError("种子库仍包含登录会话或邮箱验证码")
    return stats


def sanitize_snapshot(
    db_path: Path,
) -> tuple[int, dict[str, int], dict[str, int], dict[str, int]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        removed_ids, removed_users = load_user_plan(conn)
        repaired = repair_retired_course_ids(conn)
        deleted = sanitize(conn, removed_ids)

        remaining = {
            str(row[0]).lower()
            for row in conn.execute("SELECT email FROM users WHERE email IS NOT NULL")
        }
        expected = {email.lower() for email in APPROVED_EMAILS}
        if remaining != expected:
            raise RuntimeError("种子库中的用户集合与批准的演示账号不一致")

        stats = validate_required_content(conn)

        foreign_key_errors = list(conn.execute("PRAGMA foreign_key_check"))
        if foreign_key_errors:
            raise RuntimeError(f"SQLite 外键检查失败：{foreign_key_errors[:5]}")
        conn.commit()
        conn.execute("VACUUM")
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite 完整性检查失败：{integrity}")
        return len(removed_users), deleted, repaired, stats
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def compress_database(source_path: Path, output_path: Path) -> None:
    temporary_output = output_path.with_suffix(output_path.suffix + ".tmp")
    with source_path.open("rb") as source, temporary_output.open("wb") as raw_target:
        with gzip.GzipFile(filename="studymate.db", mode="wb", fileobj=raw_target, mtime=0) as target:
            shutil.copyfileobj(source, target)
    temporary_output.replace(output_path)


def main() -> int:
    args = parse_args()
    source_path = args.source.resolve()
    output_path = args.output.resolve()
    if not source_path.is_file():
        raise SystemExit(f"找不到来源数据库：{source_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="studymate-seed-") as temp_dir:
        snapshot_path = Path(temp_dir) / "studymate.db"
        copy_database(source_path, snapshot_path)
        removed_users, deleted, repaired, stats = sanitize_snapshot(snapshot_path)
        compress_database(snapshot_path, output_path)

    deleted_rows = sum(deleted.values())
    repaired_rows = sum(repaired.values())
    print(f"种子库已写入：{output_path}")
    print(
        f"已清理用户：{removed_users}；已删除记录：{deleted_rows}；"
        f"已修复引用：{repaired_rows}"
    )
    print(
        f"演示账号：{stats['users']}；基础课程：{stats['courses']}；"
        f"知识块：{stats['knowledge_chunks']}（正文与向量均完整）"
    )
    print(f"压缩大小：{output_path.stat().st_size} 字节")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
