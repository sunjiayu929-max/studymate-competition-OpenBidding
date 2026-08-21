"""Build the local knowledge catalog used by safe-offline runs.

The checked-in seed database contains the public foundation catalog. Role
materials are kept as source files and are imported separately so they can be
reviewed and regenerated without committing a live database.
"""
from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

from app.db import models  # noqa: F401 - register all SQLAlchemy models
from app.db.session import Base, engine
from scripts.import_fde_knowledge import import_catalog as import_fde_catalog
from scripts.import_role_knowledge import main as import_role_catalog
from scripts.import_seed_catalog import import_catalog as import_seed_catalog


BOOTSTRAP_VERSION = "safe-offline-knowledge-2026.08.20-v6"


async def _create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


def _is_complete(database_path: Path) -> bool:
    if not database_path.exists():
        return False
    with sqlite3.connect(database_path) as connection:
        try:
            row = connection.execute(
                "SELECT 1 FROM system_migrations WHERE version = ?",
                (BOOTSTRAP_VERSION,),
            ).fetchone()
        except sqlite3.OperationalError:
            return False
    return row is not None


def _mark_complete(database_path: Path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS system_migrations (
                version VARCHAR(64) PRIMARY KEY,
                description VARCHAR(512) NOT NULL,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO system_migrations (version, description, applied_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            """,
            (BOOTSTRAP_VERSION, "safe-offline foundation and role knowledge catalog"),
        )
        connection.commit()


async def bootstrap(database_path: Path, seed_gzip: Path) -> bool:
    """Populate ``database_path`` once; return whether work was performed."""
    database_path = database_path.resolve()
    seed_gzip = seed_gzip.resolve()
    if _is_complete(database_path):
        return False

    await _create_tables()
    # The seed importer is synchronous SQLite I/O, so keep it off the event loop.
    await asyncio.to_thread(
        import_seed_catalog,
        live_db=database_path,
        seed_gzip=seed_gzip,
    )
    # Role expansion expects the canonical FDE course to exist first.
    await import_fde_catalog()
    await import_role_catalog()
    # Import helpers use the process-level DATABASE_URL. Verify the target
    # before recording completion so a misconfigured child cannot mark a
    # different database as ready.
    with sqlite3.connect(database_path) as connection:
        connection.execute("SELECT COUNT(*) FROM courses").fetchone()
    _mark_complete(database_path)
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Bootstrap StudyMate local knowledge")
    parser.add_argument("--database-path", required=True, type=Path)
    parser.add_argument(
        "--seed-gzip",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "resources" / "seed" / "studymate.db.gz",
    )
    args = parser.parse_args()
    print(asyncio.run(bootstrap(args.database_path, args.seed_gzip)))
