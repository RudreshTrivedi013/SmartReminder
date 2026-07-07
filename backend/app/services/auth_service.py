from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.models import User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, password: str, timezone: str) -> User:
    user = User(email=email, hashed_password=hash_password(password), timezone=timezone)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    return create_access_token(user.id), create_refresh_token(user.id)
