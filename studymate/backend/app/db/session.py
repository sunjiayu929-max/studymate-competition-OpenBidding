from __future__ import annotations

import gzip
import os
import tempfile
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


def _to_async_url(url: str) -> str:
    """sqlite:/// → sqlite+aiosqlite:///   postgresql:// → postgresql+asyncpg://"""
    if url.startswith("sqlite:") and "aiosqlite" not in url:
        return url.replace("sqlite:", "sqlite+aiosqlite:", 1)
    if url.startswith("postgresql:") and "asyncpg" not in url:
        return url.replace("postgresql:", "postgresql+asyncpg:", 1)
    return url


def _sqlite_path(url: str) -> Path | None:
    """Resolve relative SQLite URLs from the process working directory."""
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return None
    raw_path = url[len(prefix) :]
    if not raw_path or raw_path == ":memory:":
        return None
    return Path(raw_path).expanduser().resolve()


def ensure_local_seed_database(
    database_url: str,
    *,
    seed_path: Path | None = None,
) -> Path | None:
    """Seed an absent local SQLite file without overwriting existing data.

    Only the conventional ``studymate.db`` filename is bootstrapped. This
    keeps isolated databases used by tests and safe-offline runs untouched.
    """
    database_path = _sqlite_path(database_url)
    if database_path is None or database_path.name != "studymate.db":
        return None
    if database_path.exists() and database_path.stat().st_size > 0:
        return database_path

    source_path = seed_path or Path(__file__).resolve().parents[2] / "resources" / "seed" / "studymate.db.gz"
    if not source_path.is_file():
        return None

    database_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=".studymate-db-",
        suffix=".tmp",
        dir=database_path.parent,
    )
    os.close(fd)
    temporary_path = Path(temporary_name)
    try:
        with gzip.open(source_path, "rb") as source, temporary_path.open("wb") as target:
            while block := source.read(1024 * 1024):
                target.write(block)
        os.replace(temporary_path, database_path)
    finally:
        temporary_path.unlink(missing_ok=True)
    return database_path


ensure_local_seed_database(settings.DATABASE_URL)
engine = create_async_engine(_to_async_url(settings.DATABASE_URL), echo=False, future=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        yield session
