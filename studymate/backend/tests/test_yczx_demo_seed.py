from __future__ import annotations

import gzip
import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_ARCHIVE = BACKEND_DIR / "resources" / "seed" / "studymate.db.gz"
FILLED_EMAILS = (
    "sunjiayu@yczx.com",
    "zhangxianghui@yczx.com",
    "baixinyue@yczx.com",
    "yuanshicong@yczx.com",
    "tianyixin@yczx.com",
    "lijiayi@yczx.com",
    "zhouxiang@yczx.com",
    "chenzhuo@yczx.com",
    "liufei@yczx.com",
    "sunjiayupra@yczx.com",
    "zhangxianghuipra@yczx.com",
    "baixinyuepra@yczx.com",
    "yuanshicongpra@yczx.com",
    "tianyixinpra@yczx.com",
    "lijiayipra@yczx.com",
    "zhouxiangpra@yczx.com",
    "chenzhuopra@yczx.com",
    "liufeipra@yczx.com",
)
EMPTY_EMAILS = ("test1@yczx.com", "test2@yczx.com")


class YczxDemoSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._temp_dir = tempfile.TemporaryDirectory(prefix="studymate-yczx-seed-")
        db_path = Path(cls._temp_dir.name) / "studymate.db"
        with gzip.open(SEED_ARCHIVE, "rb") as source, db_path.open("wb") as target:
            shutil.copyfileobj(source, target)
        cls.conn = sqlite3.connect(db_path)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        cls._temp_dir.cleanup()

    def _user_id(self, email: str) -> int:
        row = self.conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        self.assertIsNotNone(row, email)
        return int(row[0])

    def _count(self, table: str, user_id: int) -> int:
        return int(
            self.conn.execute(
                f'SELECT COUNT(*) FROM "{table}" WHERE user_id = ?', (user_id,)
            ).fetchone()[0]
        )

    def test_all_twenty_accounts_are_present(self) -> None:
        actual = self.conn.execute(
            "SELECT COUNT(*) FROM users WHERE email LIKE '%@yczx.com'"
        ).fetchone()[0]
        self.assertEqual(actual, 20)
        wrong_roles = self.conn.execute(
            "SELECT email, target_role FROM users WHERE email LIKE '%@yczx.com' AND target_role != ?",
            ("前线部署工程师（FDE）",),
        ).fetchall()
        self.assertEqual(wrong_roles, [])

    def test_filled_accounts_have_realistic_history(self) -> None:
        expected = {
            "role_certificates": 6,
            "quiz_sessions": 12,
            "notes": 24,
            "interview_attempts": 5,
            "user_knowledge_bases": 5,
            "user_knowledge_documents": 10,
            "profile_snapshots": 8,
            "training_runs": 12,
            "events": 240,
            "tutor_sessions": 8,
            "evaluations": 6,
            "resources": 18,
            "feedback": 10,
            "theory_assessments": 1,
            "attempts": 36,
        }
        for email in FILLED_EMAILS:
            user_id = self._user_id(email)
            with self.subTest(email=email):
                for table, count in expected.items():
                    self.assertEqual(self._count(table, user_id), count, table)
                profile_dims = json.loads(
                    self.conn.execute(
                        "SELECT dims FROM profiles WHERE user_id = ?", (user_id,)
                    ).fetchone()[0]
                )
                self.assertEqual(profile_dims.get("training_rounds"), [])
                fde_certificates = self.conn.execute(
                    "SELECT COUNT(*) FROM role_certificates "
                    "WHERE user_id = ? AND (lower(role_id) = 'fde' OR lower(role_name) LIKE '%fde%')",
                    (user_id,),
                ).fetchone()[0]
                self.assertEqual(fde_certificates, 0)
                latest = self.conn.execute(
                    "SELECT scores, evidence, profile_delta FROM evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
                    (user_id,),
                ).fetchone()
                self.assertIsNotNone(latest)
                scores, evidence, profile_delta = (json.loads(value) for value in latest)
                self.assertEqual(set(scores["by_topic_difficulty"]["需求澄清"]), {"1", "2", "3", "4"})
                self.assertGreaterEqual(len(evidence["resources_consumed"]), 6)
                self.assertTrue(profile_delta["weak_points"]["topics"])

    def test_first_use_accounts_remain_empty(self) -> None:
        tables = (
            "role_certificates",
            "quiz_sessions",
            "notes",
            "interview_attempts",
            "user_knowledge_bases",
            "events",
            "tutor_sessions",
            "evaluations",
            "resources",
            "training_runs",
            "feedback",
            "attempts",
            "theory_assessments",
            "profiles",
        )
        for email in EMPTY_EMAILS:
            user_id = self._user_id(email)
            with self.subTest(email=email):
                for table in tables:
                    self.assertEqual(self._count(table, user_id), 0, table)

    def test_company_and_database_integrity(self) -> None:
        company = self.conn.execute(
            "SELECT name FROM enterprises WHERE name = ?",
            ("河南掌门互动网络科技有限公司",),
        ).fetchone()
        self.assertIsNotNone(company)
        public_fde_chunks = self.conn.execute(
            """SELECT COUNT(*) FROM knowledge_chunks
            WHERE course_id=(SELECT id FROM courses WHERE name='FDE 岗位知识库')"""
        ).fetchone()[0]
        self.assertGreaterEqual(public_fde_chunks, 30)
        self.assertEqual(self.conn.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")


if __name__ == "__main__":
    unittest.main()
