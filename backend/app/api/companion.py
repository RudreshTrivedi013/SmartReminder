"""
AI Productivity Companion — API layer.

All handlers are wired to the DB and auth guard but return **mock data** for
now.  The bodies are saved to the database so real AI logic can be dropped in
later without a schema change.

Endpoints
---------
POST   /companion/chat                   → send a message; get an AI reply
GET    /companion/chat/history           → paginated chat history
POST   /companion/checkin                → log a productivity session
GET    /companion/checkin/history        → list productivity logs
GET    /companion/current-task           → get the user's focus-mode state
POST   /companion/current-task           → set / update focus-mode state
GET    /companion/productivity/summary   → aggregated stats for the last N days
"""

from datetime import datetime, timezone
import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Task, User
from app.models.activity import ActivitySource, ActivityType
from app.models.companion import (
    ChatMessage,
    CurrentTask,
    HourlyCheckinReminder,
    MessageRole,
    ProductivityLog,
    ProductivityStatus,
)
from app.schemas.companion import (
    ChatHistoryOut,
    ChatMessageCreate,
    ChatMessageOut,
    CurrentTaskOut,
    CurrentTaskSet,
    HourlyCheckinReminderOut,
    ProductivityLogCreate,
    ProductivityLogOut,
)
from app.services.companion.chat_service import process_chat_message
from app.services.companion import checkin_service
from app.services import activity_service
from app.workers.checkin_tasks import send_delayed_checkin_reminder

router = APIRouter(prefix="/companion", tags=["companion"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_UTC = timezone.utc


def _now() -> datetime:
    return datetime.now(_UTC)


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


@router.post(
    "/chat",
    response_model=list[ChatMessageOut],
    status_code=201,
    summary="Send a message to the AI companion",
    description="Processes the user message through the AI Brain and executes any mapped intents.",
)
async def send_chat_message(
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ChatMessageOut]:
    return await process_chat_message(
        db=db,
        user=user,
        content=payload.content,
        task_id=payload.task_id,
    )


@router.get(
    "/chat/history",
    response_model=ChatHistoryOut,
    summary="Retrieve paginated chat history",
    description="Returns the conversation thread for the authenticated user, newest-first.",
)
async def get_chat_history(
    skip: int = Query(default=0, ge=0, description="Number of messages to skip"),
    limit: int = Query(default=50, ge=1, le=200, description="Max messages to return"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatHistoryOut:
    # Total count
    count_result = await db.execute(
        select(func.count()).where(ChatMessage.user_id == user.id)
    )
    total: int = count_result.scalar_one()

    # Paginated rows, newest first
    rows_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    messages = [
        ChatMessageOut.model_validate(row)
        for row in rows_result.scalars().all()
    ]

    return ChatHistoryOut(messages=messages, total=total)


# ---------------------------------------------------------------------------
# Check-in (ProductivityLog)
# ---------------------------------------------------------------------------


@router.post(
    "/checkin",
    response_model=ProductivityLogOut,
    status_code=201,
    summary="Log a productivity check-in / focus session",
    description=(
        "Records one productivity session entry.  "
        "If `duration_seconds` is omitted and both `start_at` and `end_at` are "
        "provided, the server calculates it automatically."
    ),
)
async def create_checkin(
    payload: ProductivityLogCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductivityLogOut:
    submitted_at = _now()
    logger = logging.getLogger(__name__)
    logger.debug("[API] create_checkin called user=%s payload=%s", user.id, {k: v for k, v in payload.__dict__.items()})

    # Validate task_id ownership when provided
    task_for_activity = None
    if payload.task_id is not None:
        task_result = await db.execute(
            select(Task).where(Task.id == payload.task_id, Task.user_id == user.id)
        )
        task_for_activity = task_result.scalar_one_or_none()
        if task_for_activity is None:
            raise HTTPException(status_code=404, detail="Task not found")

    start_at = payload.start_at or submitted_at

    # Auto-compute duration if not supplied
    duration = payload.duration_seconds
    if duration is None and payload.end_at is not None:
        delta = payload.end_at - start_at
        duration = max(0, int(delta.total_seconds()))

    note = payload.note
    if payload.transcript is not None:
        note = json.dumps(
            {
                "transcript": payload.transcript,
                "timestamp": submitted_at.isoformat(),
                "source": payload.source or "text",
            }
        )

    log = ProductivityLog(
        id=uuid4(),
        user_id=user.id,
        task_id=payload.task_id,
        status=payload.status,
        start_at=start_at,
        end_at=payload.end_at,
        duration_seconds=duration,
        note=note,
    )
    db.add(log)

    if payload.reminder_id is not None:
        await checkin_service.link_checkin_to_hourly_reminder(
            db=db,
            user_id=user.id,
            start_at=start_at,
            response_id=log.id,
            reminder_id=payload.reminder_id,
        )
    else:
        await checkin_service.link_checkin_to_hourly_reminder(
            db=db,
            user_id=user.id,
            start_at=start_at,
            response_id=log.id,
            reminder_id=None,
        )

    await activity_service.record_activity(
        db,
        user_id=user.id,
        task=task_for_activity,
        task_id=payload.task_id,
        activity_type=ActivityType.hourly_checkin,
        task_title=task_for_activity.title if task_for_activity else "Hourly check-in",
        optional_notes=payload.transcript or payload.note,
        source=ActivitySource.checkin,
        timestamp=submitted_at,
        metadata={
            "event": "hourly_checkin",
            "status": payload.status.value,
            "duration_seconds": duration,
            "input_source": payload.source,
        },
    )
    await db.commit()
    await db.refresh(log)
    return ProductivityLogOut.model_validate(log)


@router.get(
    "/checkin/reminders",
    response_model=list[HourlyCheckinReminderOut],
    summary="List hourly check-in reminders",
    description="Returns recent hourly reminders for the authenticated user, including pending, missed, and completed entries.",
)
async def get_checkin_reminders(
    today: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HourlyCheckinReminderOut]:
    statement = select(HourlyCheckinReminder).where(HourlyCheckinReminder.user_id == user.id)

    if today:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        statement = statement.where(HourlyCheckinReminder.scheduled_time >= today_start)

    statement = statement.order_by(HourlyCheckinReminder.scheduled_time.desc()).limit(limit)
    result = await db.execute(statement)
    return [HourlyCheckinReminderOut.model_validate(row) for row in result.scalars().all()]


@router.get(
    "/checkin/reminders/{reminder_id}",
    response_model=HourlyCheckinReminderOut,
    summary="Get a single hourly check-in reminder",
    description="Returns a specific hourly reminder record by id.",
)
async def get_checkin_reminder(
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HourlyCheckinReminderOut:
    result = await db.execute(
        select(HourlyCheckinReminder)
        .where(HourlyCheckinReminder.id == reminder_id, HourlyCheckinReminder.user_id == user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return HourlyCheckinReminderOut.model_validate(reminder)


@router.get(
    "/checkin/history",
    response_model=list[ProductivityLogOut],
    summary="List productivity check-in history",
    description="Returns up to `limit` sessions for the authenticated user, newest first.",
)
async def get_checkin_history(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProductivityLogOut]:
    result = await db.execute(
        select(ProductivityLog)
        .where(ProductivityLog.user_id == user.id)
        .order_by(ProductivityLog.start_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [ProductivityLogOut.model_validate(row) for row in result.scalars().all()]


@router.post(
    "/checkin/reschedule",
    status_code=202,
    summary="Reschedule the hourly check-in",
    description="Schedules a delayed check-in reminder via Celery.",
)
async def reschedule_checkin(
    user: User = Depends(get_current_user),
) -> dict:
    send_delayed_checkin_reminder.apply_async((str(user.id),), countdown=600)  # 10 minutes
    return {"status": "rescheduled"}


# ---------------------------------------------------------------------------
# Current Task (focus mode)
# ---------------------------------------------------------------------------


@router.get(
    "/current-task",
    response_model=CurrentTaskOut,
    summary="Get the user's current focus task",
    description=(
        "Returns the active focus-mode record for the authenticated user.  "
        "404 if the user has never set a current task."
    ),
)
async def get_current_task(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CurrentTaskOut:
    result = await db.execute(
        select(CurrentTask).where(CurrentTask.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="No current task set")
    return CurrentTaskOut.model_validate(record)


@router.post(
    "/current-task",
    response_model=CurrentTaskOut,
    summary="Set or update the current focus task",
    description=(
        "Upserts the focus-mode record for the authenticated user.  "
        "Pass `task_id: null` to clear the current task.  "
        "Pass `is_active: false` to pause focus mode without clearing the task."
    ),
)
async def set_current_task(
    payload: CurrentTaskSet,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CurrentTaskOut:
    now = _now()

    # Validate task_id ownership when provided
    task_for_activity = None
    if payload.task_id is not None:
        task_result = await db.execute(
            select(Task).where(Task.id == payload.task_id, Task.user_id == user.id)
        )
        task_for_activity = task_result.scalar_one_or_none()
        if task_for_activity is None:
            raise HTTPException(status_code=404, detail="Task not found")

    # Upsert: fetch existing row or create a new one
    result = await db.execute(
        select(CurrentTask).where(CurrentTask.user_id == user.id)
    )
    record = result.scalar_one_or_none()

    if record is None:
        record = CurrentTask(
            user_id=user.id,
            task_id=payload.task_id,
            context_note=payload.context_note,
            is_active=payload.is_active,
            started_at=now if payload.is_active else None,
            updated_at=now,
        )
        db.add(record)
    else:
        # Only reset started_at when transitioning from inactive → active
        was_inactive = not record.is_active
        record.task_id = payload.task_id
        record.context_note = payload.context_note
        record.is_active = payload.is_active
        record.updated_at = now
        if payload.is_active and was_inactive:
            record.started_at = now

    activity_type = ActivityType.working if payload.is_active else ActivityType.status_update
    await activity_service.record_activity(
        db,
        user_id=user.id,
        task=task_for_activity,
        task_id=payload.task_id,
        activity_type=activity_type,
        task_title=task_for_activity.title if task_for_activity else "Current task",
        optional_notes=payload.context_note,
        source=ActivitySource.companion,
        timestamp=now,
        metadata={
            "event": "current_task_updated",
            "is_active": payload.is_active,
        },
    )
    await db.commit()
    await db.refresh(record)
    return CurrentTaskOut.model_validate(record)


# ---------------------------------------------------------------------------
# Productivity summary
# ---------------------------------------------------------------------------


@router.get(
    "/productivity/summary",
    summary="Aggregated productivity stats",
    description="Returns productivity stats for today.",
)
async def get_productivity_summary(
    days: int = Query(default=7, ge=1, le=90, description="Look-back window in days (unused currently)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    now = _now()
    count_result = await db.execute(
        select(func.count()).where(ProductivityLog.user_id == user.id)
    )
    total_sessions: int = count_result.scalar_one()

    stats = await checkin_service.get_today_stats(db, user.id, now)

    return {
        "user_id": str(user.id),
        "period_days": days,
        "total_sessions_all_time": total_sessions,
        "mock": False,
        "stats": stats,
        "generated_at": now.isoformat(),
    }
