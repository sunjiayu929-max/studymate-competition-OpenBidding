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


engine = create_async_engine(_to_async_url(settings.DATABASE_URL), echo=False, future=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        yield session
