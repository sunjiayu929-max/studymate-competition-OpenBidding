from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.api.bili import _core_terms, _rank_videos, _resolve_query
from app.api.run import _prepare_source
from scripts.ensure_test_accounts import TEST_ACCOUNT_EMAILS, ensure_accounts


class _FastPasswordHasher:
    def hash(self, value: str) -> str:
        return f"$argon2id$test-only${value}"


class NumberedTestAccountTests(unittest.TestCase):
    def test_account_creation_is_idempotent_and_preserves_other_users(self):
        with tempfile.TemporaryDirectory(prefix="studymate-test-accounts-") as temp_dir:
            db_path = Path(temp_dir) / "studymate.db"
            with sqlite3.connect(db_path) as conn:
                conn.executescript(
                    """
                    PRAGMA foreign_keys = ON;
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        role TEXT NOT NULL,
                        email TEXT UNIQUE,
                        password_hash TEXT,
                        email_verified_at DATETIME,
                        is_active BOOLEAN NOT NULL,
                        created_at DATETIME NOT NULL
                    );
                    CREATE TABLE user_sessions (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        token_hash TEXT NOT NULL,
                        expires_at DATETIME NOT NULL,
                        revoked_at DATETIME,
                        created_at DATETIME NOT NULL
                    );
                    INSERT INTO users
                        (name, role, email, password_hash, email_verified_at, is_active, created_at)
                    VALUES
                        ('existing', 'student', 'existing@example.invalid', 'unchanged', CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP);
                    """
                )

            with patch("scripts.ensure_test_accounts.PasswordHash.recommended", return_value=_FastPasswordHasher()):
                created, reset, _ = ensure_accounts(db_path, "unit-test-password", backup=False)
                self.assertEqual((created, reset), (15, 0))

                with sqlite3.connect(db_path) as conn:
                    test1_id = conn.execute(
                        "SELECT id FROM users WHERE email = ?", (TEST_ACCOUNT_EMAILS[0],)
                    ).fetchone()[0]
                    conn.execute(
                        """
                        INSERT INTO user_sessions
                            (user_id, token_hash, expires_at, created_at)
                        VALUES (?, 'test-token', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """,
                        (test1_id,),
                    )

                created, reset, _ = ensure_accounts(db_path, "unit-test-password", backup=False)
                self.assertEqual((created, reset), (0, 15))

            with sqlite3.connect(db_path) as conn:
                self.assertEqual(
                    conn.execute(
                        f"SELECT COUNT(*) FROM users WHERE email IN ({','.join('?' for _ in TEST_ACCOUNT_EMAILS)})",
                        TEST_ACCOUNT_EMAILS,
                    ).fetchone()[0],
                    15,
                )
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM user_sessions").fetchone()[0], 0)
                self.assertEqual(
                    conn.execute(
                        "SELECT password_hash FROM users WHERE email = 'existing@example.invalid'"
                    ).fetchone()[0],
                    "unchanged",
                )


class Suggestion5BiliTests(unittest.TestCase):
    def test_original_inverse_complement_topic_keeps_real_video_results(self):
        query = _resolve_query("原码反码补码", "原码反码补码")
        terms = _core_terms("原码反码补码", "原码反码补码", query)
        candidates = [
            {
                "bvid": "BV16rNSzKEG4",
                "title": "计组 原码反码补码移码 技巧",
                "play": 100,
                "_search_text": "计算机组成原理 原码反码补码移码 技巧",
                "url": "https://www.bilibili.com/video/BV16rNSzKEG4",
            },
            {
                "bvid": "off-topic",
                "title": "游戏补码攻略",
                "play": 999999,
                "_search_text": "原神 游戏攻略",
                "url": "https://www.bilibili.com/video/off-topic",
            },
        ]
        ranked = _rank_videos(candidates, terms, "计算机组成原理", 2)
        self.assertEqual([item["bvid"] for item in ranked], ["BV16rNSzKEG4"])


class PythonSandboxPreparationTests(unittest.TestCase):
    def test_python_numeric_thread_limits_are_injected_before_user_imports(self):
        source = "import sklearn\nprint('ok')"
        prepared = _prepare_source("python", source)
        self.assertIn("OPENBLAS_NUM_THREADS", prepared)
        self.assertLess(prepared.index("OPENBLAS_NUM_THREADS"), prepared.index("import sklearn"))
        self.assertTrue(prepared.endswith(source))

    def test_compiled_languages_are_not_modified(self):
        source = "int main() { return 0; }"
        self.assertEqual(_prepare_source("cpp", source), source)


if __name__ == "__main__":
    unittest.main()
