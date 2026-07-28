from datetime import timedelta, datetime, timezone

# pyrefly: ignore [missing-import]
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user, get_redis
from app.core.security import decode_token, create_access_token, create_refresh_token
from app.database import get_db
from app.models import User
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, RefreshRequest, UserResponse, LogoutRequest, UserUpdate
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

_BLOCKLIST_PREFIX = "blocklist:"


def _blocklist_key(token: str) -> str:
    return f"{_BLOCKLIST_PREFIX}{token}"


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await auth_service.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await auth_service.create_user(db, payload.email, payload.password, payload.timezone)
    access, refresh = auth_service.issue_tokens(user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access, refresh = auth_service.issue_tokens(user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshRequest,
    redis: aioredis.Redis = Depends(get_redis),
):
    # Reject blocklisted tokens (already used or explicitly logged out).
    block_val = await redis.get(_blocklist_key(payload.refresh_token))
    if block_val:
        try:
            # Check if it was blocklisted within the last 60 seconds (grace period)
            block_time = float(block_val.decode('utf-8'))
            now = datetime.now(timezone.utc).timestamp()
            if now - block_time > 60:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")
        except ValueError:
            # If it's an explicit logout ("1"), reject it immediately
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")

    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError("not a refresh token")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    new_access = create_access_token(data["sub"])
    new_refresh = create_refresh_token(data["sub"])

    # Token rotation: invalidate the used refresh token so it can't be reused.
    # Store the timestamp of invalidation to support the 60s grace period.
    ttl = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    now_ts = str(datetime.now(timezone.utc).timestamp())
    await redis.setex(_blocklist_key(payload.refresh_token), ttl, now_ts)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest,
    redis: aioredis.Redis = Depends(get_redis),
):
    """Add the refresh token to the Redis blocklist so it can never be used
    again.  TTL matches REFRESH_TOKEN_EXPIRE_DAYS so the key self-cleans."""
    ttl = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    await redis.setex(_blocklist_key(payload.refresh_token), ttl, "1")


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    return current_user

