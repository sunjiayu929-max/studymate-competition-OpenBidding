#!/usr/bin/env python3
"""Prepare the SQLite seed database for a public StudyMate demo.

The script deliberately keeps course/knowledge data and all business data owned by
the approved demo accounts. It removes any other users and their dependent rows,
then clears authentication sessions and one-time verification codes because those
records are neither portable nor useful in a deployment image.

Run without ``--apply`` to inspect the planned changes. Applying always creates a
timestamped SQLite backup first.
"""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path


APPROVED_EMAILS = (
    "admin@studymate.com",
    *(f"judge{number:02d}@studymate.com" for number in range(1, 11)),
    *(f"test{number}@studymate.com" for number in range(1, 16)),
    "sunjiayu@studymate.com",
    "baixinyue@studymate.com",
    "yuanshicong@studymate.com",
    "chenzhuo@studymate.com",
    "lijiayi@studymate.com",
    "zhouxiang@studymate.com",
    "tianyixin@studymate.com",
    "liufei@studymate.com",
)

# Current seeds use course IDs 1-5 as the five active courses. Keep this map
# empty unless a future schema migration explicitly retires a course ID.
COURSE_ID_REMAP: dict[int, int] = {}


def parse_args() -> argparse.Namespace:
    project_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        default=project_dir / "backend" / "studymate.db",
        help="SQLite database to inspect or sanitize",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the cleanup after creating a timestamped backup",
    )
    return parser.parse_args()


def placeholders(values: list[int] | tuple[str, ...]) -> str:
    return ",".join("?" for _ in values)


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def snapshot_counts(conn: sqlite3.Connection) -> dict[str, int]:
    result: dict[str, int] = {}
    for table in (
        "users",
        "user_sessions",
        "email_verification_codes",
        "courses",
        "knowledge_chunks",
        "resources",
        "learning_paths",
        "notes",
        "events",
        "quiz_sessions",
        "tutor_sessions",
    ):
        if table_exists(conn, table):
            result[table] = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    return result


def load_user_plan(conn: sqlite3.Connection) -> tuple[list[int], list[sqlite3.Row]]:
    approved = {email.lower() for email in APPROVED_EMAILS}
    rows = list(conn.execute("SELECT id, email, name, role FROM users ORDER BY id"))
    present = {str(row["email"]).lower() for row in rows if row["email"]}
    missing = sorted(approved - present)
    if missing:
        raise RuntimeError(f"Approved demo accounts are missing: {', '.join(missing)}")

    removed = [row for row in rows if not row["email"] or str(row["email"]).lower() not in approved]
    return [int(row["id"]) for row in removed], removed


def create_backup(db_path: Path) -> Path:
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"studymate-before-sanitize-{stamp}.db"
    source = sqlite3.connect(db_path)
    destination = sqlite3.connect(backup_path)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    return backup_path


def execute_count(
    conn: sqlite3.Connection,
    statement: str,
    params: tuple[object, ...] = (),
) -> int:
    before = conn.total_changes
    conn.execute(statement, params)
    return conn.total_changes - before


def repair_retired_course_ids(conn: sqlite3.Connection) -> dict[str, int]:
    repaired: dict[str, int] = {}
    for old_id, current_id in COURSE_ID_REMAP.items():
        current = conn.execute(
            "SELECT name FROM courses WHERE id = ?",
            (current_id,),
        ).fetchone()
        if current is None:
            raise RuntimeError(
                f"Cannot remap retired course {old_id}: target course {current_id} is missing"
            )
        for table in (
            "knowledge_chunks",
            "learning_paths",
            "notes",
            "quiz_sessions",
            "resources",
            "test_cases",
        ):
            if not table_exists(conn, table):
                continue
            columns = {
                row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')
            }
            if "course_id" not in columns:
                continue
            count = execute_count(
                conn,
                f'UPDATE "{table}" SET course_id = ? WHERE course_id = ?',
                (current_id, old_id),
            )
            if count:
                repaired[table] = repaired.get(table, 0) + count
    return repaired


def sanitize(conn: sqlite3.Connection, removed_ids: list[int]) -> dict[str, int]:
    deleted: dict[str, int] = {}

    # Authentication state is intentionally never shipped in a deployment seed.
    if table_exists(conn, "user_sessions"):
        deleted["user_sessions"] = execute_count(conn, "DELETE FROM user_sessions")
    if table_exists(conn, "email_verification_codes"):
        deleted["email_verification_codes"] = execute_count(
            conn, "DELETE FROM email_verification_codes"
        )

    if not removed_ids:
        return deleted

    marks = placeholders(removed_ids)
    ids = tuple(removed_ids)

    if table_exists(conn, "feedback_replies"):
        deleted["feedback_replies"] = execute_count(
            conn,
            f"""
            DELETE FROM feedback_replies
            WHERE author_id IN ({marks})
               OR feedback_id IN (
                    SELECT id FROM feedback WHERE user_id IN ({marks})
               )
            """,
            ids + ids,
        )

    if table_exists(conn, "quiz_session_items"):
        deleted["quiz_session_items"] = execute_count(
            conn,
            f"""
            DELETE FROM quiz_session_items
            WHERE session_id IN (
                SELECT id FROM quiz_sessions WHERE user_id IN ({marks})
            )
            """,
            ids,
        )

    if table_exists(conn, "attempts"):
        deleted["attempts"] = execute_count(
            conn,
            f"""
            DELETE FROM attempts
            WHERE user_id IN ({marks})
               OR exercise_id IN (
                    SELECT exercises.id
                    FROM exercises
                    JOIN resources ON resources.id = exercises.resource_id
                    WHERE resources.user_id IN ({marks})
               )
            """,
            ids + ids,
        )

    if table_exists(conn, "exercises"):
        deleted["exercises"] = execute_count(
            conn,
            f"""
            DELETE FROM exercises
            WHERE resource_id IN (
                SELECT id FROM resources WHERE user_id IN ({marks})
            )
            """,
            ids,
        )

    for table in (
        "evaluations",
        "events",
        "feedback",
        "folders",
        "learning_paths",
        "notes",
        "profile_snapshots",
        "profiles",
        "quiz_sessions",
        "resources",
        "tutor_sessions",
    ):
        if table_exists(conn, table):
            deleted[table] = execute_count(
                conn,
                f'DELETE FROM "{table}" WHERE user_id IN ({marks})',
                ids,
            )

    deleted["users"] = execute_count(
        conn,
        f"DELETE FROM users WHERE id IN ({marks})",
        ids,
    )
    return deleted


def main() -> int:
    args = parse_args()
    db_path = args.db.resolve()
    if not db_path.is_file():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    removed_ids, removed_users = load_user_plan(conn)
    before = snapshot_counts(conn)

    print(f"Database: {db_path}")
    print(f"Approved accounts: {len(APPROVED_EMAILS)}")
    print(f"Accounts to remove: {len(removed_users)}")
    for row in removed_users:
        identity = row["email"] or row["name"] or f"user-{row['id']}"
        print(f"  - id={row['id']} {identity}")

    if not args.apply:
        print("Dry run only. Re-run with --apply to create a backup and sanitize the DB.")
        conn.close()
        return 0

    conn.close()
    backup_path = create_backup(db_path)
    print(f"Backup: {backup_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        removed_ids, _ = load_user_plan(conn)
        repaired = repair_retired_course_ids(conn)
        deleted = sanitize(conn, removed_ids)

        remaining = {
            str(row[0]).lower()
            for row in conn.execute("SELECT email FROM users WHERE email IS NOT NULL")
        }
        expected = {email.lower() for email in APPROVED_EMAILS}
        if remaining != expected:
            raise RuntimeError("Remaining user set does not match the approved account list")

        foreign_key_errors = list(conn.execute("PRAGMA foreign_key_check"))
        if foreign_key_errors:
            raise RuntimeError(f"Foreign key check failed: {foreign_key_errors[:5]}")
        conn.commit()
        conn.execute("VACUUM")
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {integrity}")
        after = snapshot_counts(conn)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print("Deleted rows:")
    for table, count in deleted.items():
        if count:
            print(f"  {table}: {count}")
    print("Repaired retired course references:")
    for table, count in repaired.items():
        print(f"  {table}: {count}")
    print("Preserved baseline:")
    for table in ("users", "courses", "knowledge_chunks", "resources", "notes", "events"):
        if table in after:
            print(f"  {table}: {before.get(table, 0)} -> {after[table]}")
    print("Sanitization complete; SQLite integrity and foreign keys are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
