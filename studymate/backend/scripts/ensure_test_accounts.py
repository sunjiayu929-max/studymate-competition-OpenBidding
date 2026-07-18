#!/usr/bin/env python3
"""Idempotently create the numbered StudyMate accounts used for demo recording.

Only users whose email is exactly ``test1@studymate.com`` through
``test15@studymate.com`` are created or reset. Other users and business data are
never changed. Existing sessions for these accounts are revoked when the
password is reset.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from pwdlib import PasswordHash


TEST_ACCOUNT_COUNT = 15
TEST_ACCOUNT_EMAILS = tuple(
    f"test{number}@studymate.com" for number in range(1, TEST_ACCOUNT_COUNT + 1)
)


def parse_args() -> argparse.Namespace:
    project_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        default=project_dir / "studymate.db",
        help="SQLite database to update",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("STUDYMATE_TEST_PASSWORD", ""),
        help="Password for all numbered test accounts; may use STUDYMATE_TEST_PASSWORD",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip the SQLite online backup when an external verified backup already exists",
    )
    return parser.parse_args()


def create_backup(db_path: Path) -> Path:
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"studymate-before-test-accounts-{stamp}.db"
    with sqlite3.connect(db_path) as source, sqlite3.connect(backup_path) as destination:
        source.backup(destination)
    return backup_path


def ensure_accounts(db_path: Path, password: str, *, backup: bool = True) -> tuple[int, int, Path | None]:
    if not db_path.is_file():
        raise RuntimeError(f"Database does not exist: {db_path}")
    if not 6 <= len(password) <= 128:
        raise RuntimeError("Test account password must contain 6 to 128 characters")

    backup_path = create_backup(db_path) if backup else None
    hasher = PasswordHash.recommended()
    now = datetime.utcnow()
    created = 0
    reset = 0

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        try:
            for number, email in enumerate(TEST_ACCOUNT_EMAILS, start=1):
                row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
                password_hash = hasher.hash(password)
                if row is None:
                    cursor = conn.execute(
                        """
                        INSERT INTO users
                            (name, role, email, password_hash, email_verified_at, is_active, created_at)
                        VALUES (?, 'student', ?, ?, ?, 1, ?)
                        """,
                        (f"test{number}", email, password_hash, now, now),
                    )
                    user_id = int(cursor.lastrowid)
                    created += 1
                else:
                    user_id = int(row[0])
                    conn.execute(
                        """
                        UPDATE users
                        SET name = ?, role = 'student', password_hash = ?,
                            email_verified_at = COALESCE(email_verified_at, ?), is_active = 1
                        WHERE id = ?
                        """,
                        (f"test{number}", password_hash, now, user_id),
                    )
                    reset += 1
                conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))

            count = conn.execute(
                f"SELECT COUNT(*) FROM users WHERE email IN ({','.join('?' for _ in TEST_ACCOUNT_EMAILS)})",
                TEST_ACCOUNT_EMAILS,
            ).fetchone()[0]
            if count != TEST_ACCOUNT_COUNT:
                raise RuntimeError(f"Expected {TEST_ACCOUNT_COUNT} test accounts, found {count}")
            foreign_key_errors = list(conn.execute("PRAGMA foreign_key_check"))
            if foreign_key_errors:
                raise RuntimeError(f"SQLite foreign key check failed: {foreign_key_errors[:5]}")
            conn.commit()
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("SQLite integrity check failed")
        except Exception:
            conn.rollback()
            raise
    return created, reset, backup_path


def main() -> int:
    args = parse_args()
    if not args.password:
        raise SystemExit("Provide --password or STUDYMATE_TEST_PASSWORD")
    created, reset, backup_path = ensure_accounts(
        args.db.resolve(),
        args.password,
        backup=not args.no_backup,
    )
    print(f"Numbered test accounts ready: created={created}, reset={reset}")
    if backup_path:
        print(f"Backup created: {backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
