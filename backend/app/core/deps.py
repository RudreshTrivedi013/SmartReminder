from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
# pyrefly: ignore [missing-import]
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_token
from app.database import get_db
from app.models import User

bearer_scheme = HTTPBearer()


async def get_redis() -> aioredis.Redis:
    """Yield an async Redis client. Each request gets a fresh connection from
    the connection pool; redis-py manages the pool automatically."""
    client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") not in ("access", "action"):
            raise credentials_exception
        user_id = UUID(payload.get("sub"))
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user