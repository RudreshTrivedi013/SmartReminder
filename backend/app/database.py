from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import settings


class Base(DeclarativeBase):
    pass


# Async engine — used by FastAPI endpoints
engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# Sync engine — used by Celery tasks (asyncpg cannot run inside asyncio.run())
# Converts postgresql+asyncpg:// -> postgresql+psycopg2://
_sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql")
sync_engine = create_engine(_sync_url, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)
