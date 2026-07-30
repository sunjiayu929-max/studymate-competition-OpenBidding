from __future__ import annotations

import gzip
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.import_seed_catalog import import_catalog


SCHEMA = """
CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT
);
CREATE TABLE knowledge_chunks (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    content TEXT NOT NULL,
    source TEXT,
    page INTEGER,
    url TEXT,
    meta TEXT,
    chroma_id TEXT,
    embedding TEXT,
    created_at TEXT
);
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL
);
"""


class ImportSeedCatalogTests(unittest.TestCase):
    def test_import_is_incremental_idempotent_and_preserves_users(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            live_path = root / "live.db"
            seed_path = root / "seed.db"
            seed_gzip = root / "seed.db.gz"

            live = sqlite3.connect(live_path)
            live.executescript(SCHEMA)
            live.execute("INSERT INTO users (id, username) VALUES (1, 'existing-user')")
            live.commit()
            live.close()

            seed = sqlite3.connect(seed_path)
            seed.executescript(SCHEMA)
            seed.execute(
                "INSERT INTO courses (id, name, description, created_at) VALUES (7, '机器学习', 'desc', 'now')"
            )
            seed.execute(
                """
                INSERT INTO knowledge_chunks (
                    id, course_id, content, source, page, url, meta, chroma_id,
                    embedding, created_at
                ) VALUES (9, 7, '梯度下降', '教材', 12, NULL, '{}', 'chunk-1', '[0.1]', 'now')
                """
            )
            seed.execute("INSERT INTO users (id, username) VALUES (99, 'seed-user')")
            seed.commit()
            seed.close()
            with seed_path.open("rb") as source, gzip.open(seed_gzip, "wb") as target:
                target.write(source.read())

            first = import_catalog(live_path, seed_gzip)
            second = import_catalog(live_path, seed_gzip)

            self.assertEqual(first, {"inserted_courses": 1, "inserted_chunks": 1})
            self.assertEqual(second, {"inserted_courses": 0, "inserted_chunks": 0})

            check = sqlite3.connect(live_path)
            self.assertEqual(check.execute("SELECT COUNT(*) FROM courses").fetchone()[0], 1)
            self.assertEqual(check.execute("SELECT COUNT(*) FROM knowledge_chunks").fetchone()[0], 1)
            self.assertEqual(
                check.execute("SELECT username FROM users ORDER BY id").fetchall(),
                [("existing-user",)],
            )
            self.assertEqual(check.execute("PRAGMA foreign_key_check").fetchall(), [])
            check.close()


if __name__ == "__main__":
    unittest.main()
