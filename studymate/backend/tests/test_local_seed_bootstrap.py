from __future__ import annotations

import gzip
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.db.session import ensure_local_seed_database


class LocalSeedBootstrapTests(unittest.TestCase):
    def test_missing_studymate_db_is_seeded_from_relative_sqlite_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_db = root / "seed.db"
            seed_gzip = root / "seed.db.gz"
            live_db = root / "nested" / "studymate.db"

            seed = sqlite3.connect(seed_db)
            seed.execute("CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
            seed.execute("INSERT INTO courses (name) VALUES ('机器学习')")
            seed.commit()
            seed.close()
            with seed_db.open("rb") as source, gzip.open(seed_gzip, "wb") as target:
                target.write(source.read())

            result = ensure_local_seed_database(
                f"sqlite:///{live_db}",
                seed_path=seed_gzip,
            )

            self.assertEqual(result, live_db.resolve())
            check = sqlite3.connect(live_db)
            self.assertEqual(check.execute("SELECT name FROM courses").fetchone()[0], "机器学习")
            check.close()

    def test_existing_database_and_isolated_database_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            existing = root / "studymate.db"
            isolated = root / "offline.db"
            existing.write_bytes(b"existing")
            isolated.write_bytes(b"isolated")
            seed_gzip = root / "seed.db.gz"
            with gzip.open(seed_gzip, "wb") as target:
                target.write(b"replacement")

            self.assertEqual(
                ensure_local_seed_database(f"sqlite:///{existing}", seed_path=seed_gzip),
                existing.resolve(),
            )
            self.assertEqual(existing.read_bytes(), b"existing")
            self.assertIsNone(
                ensure_local_seed_database(f"sqlite:///{isolated}", seed_path=seed_gzip)
            )
            self.assertEqual(isolated.read_bytes(), b"isolated")


if __name__ == "__main__":
    unittest.main()
