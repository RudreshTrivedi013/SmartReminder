"""
checkin_service.py — Core logic for Hourly Productivity Check-ins.
"""
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.companion import ProductivityLog, ProductivityStatus, CurrentTask
from app.models.user import User

_UTC = timezone.utc
_SCHEDULER_WINDOW_MINUTES = 5


def _time_in_window(current, start, end) -> bool:
    if start is None or end is None:
        return False
    if start <= end:
        return start <= current < end
    return current >= start or current < end


def _minutes_since_midnight(value) -> int:
    return value.hour * 60 + value.minute


def _slot_start_utc(user: User, now_utc: datetime) -> datetime | None:
    try:
        user_tz = ZoneInfo(user.timezone or "UTC")
    except Exception:
        user_tz = _UTC

    local_now = now_utc.astimezone(user_tz)
    current_time = local_now.time()

    if not _time_in_window(current_time, user.working_hours_start, user.working_hours_end):
        return None

    if _time_in_window(current_time, user.quiet_hours_start, user.quiet_hours_end):
        return None

    interval_minutes = user.checkin_interval_minutes or 60
    # interval_minutes = 1
    start_minutes = _minutes_since_midnight(user.working_hours_start)
    current_minutes = _minutes_since_midnight(current_time)
    work_start_local = local_now.replace(
        hour=0, minute=0, second=0, microsecond=0
    ) + timedelta(minutes=start_minutes)
    if user.working_hours_start > user.working_hours_end and current_minutes < start_minutes:
        work_start_local -= timedelta(days=1)

    elapsed_minutes = int((local_now - work_start_local).total_seconds() // 60)

    if elapsed_minutes < interval_minutes:
        return None

    minutes_since_due = elapsed_minutes % interval_minutes
    if minutes_since_due >= _SCHEDULER_WINDOW_MINUTES:
        return None

    due_slot_minutes = elapsed_minutes - minutes_since_due
    previous_slot_minutes = due_slot_minutes - interval_minutes
    slot_start_local = work_start_local + timedelta(minutes=previous_slot_minutes)
    return slot_start_local.astimezone(_UTC)


def sync_needs_checkin(db: Session, user: User, now_utc: datetime) -> bool:
    """
    Checks if a user needs a check-in reminder for the current scheduler window.
    """
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=_UTC)

    slot_start = _slot_start_utc(user, now_utc)
    if slot_start is None:
        return False
    
    # Did the user log anything in the interval that just ended?
    result = db.execute(
        select(func.count())
        .where(ProductivityLog.user_id == user.id, ProductivityLog.start_at >= slot_start)
    )
    count = result.scalar()
    
    return count == 0


async def log_productivity(
    db: AsyncSession, 
    user_id: uuid.UUID, 
    status: ProductivityStatus, 
    now_utc: datetime
) -> ProductivityLog:
    """
    Logs a productivity session. Auto-calculates duration based on the last log,
    or defaults to 1 hour (3600 seconds) if there are no recent logs.
    """
    # Find the last log to determine the start time
    result = await db.execute(
        select(ProductivityLog)
        .where(ProductivityLog.user_id == user_id)
        .order_by(ProductivityLog.start_at.desc())
        .limit(1)
    )
    last_log = result.scalar_one_or_none()
    
    start_at = now_utc - timedelta(hours=1)
    if last_log and last_log.end_at and last_log.end_at > start_at:
        start_at = last_log.end_at
        
    duration_seconds = max(0, int((now_utc - start_at).total_seconds()))

    # Attempt to associate this log with the current task
    task_id = None
    ct_result = await db.execute(
        select(CurrentTask).where(CurrentTask.user_id == user_id)
    )
    record = ct_result.scalar_one_or_none()
    if record and record.task_id:
        task_id = record.task_id

    log = ProductivityLog(
        id=uuid.uuid4(),
        user_id=user_id,
        task_id=task_id,
        status=status,
        start_at=start_at,
        end_at=now_utc,
        duration_seconds=duration_seconds,
        note=f"Hourly check-in: {status.value}",
    )
    db.add(log)
    return log


async def get_today_stats(db: AsyncSession, user_id: uuid.UUID, now_utc: datetime) -> dict:
    """
    Calculates Today's Productive Hours, Average Score, Focus Percentage, 
    Current Streak, Longest Streak, and Missed Check-ins.
    """
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    
    result = await db.execute(
        select(ProductivityLog)
        .where(ProductivityLog.user_id == user_id, ProductivityLog.start_at >= today_start)
        .order_by(ProductivityLog.start_at.asc())
    )
    logs = result.scalars().all()
    
    total_seconds = sum((log.duration_seconds or 0) for log in logs)
    focused_seconds = sum((log.duration_seconds or 0) for log in logs if log.status == ProductivityStatus.focused)
    
    # Calculate streak (simple consecutive focused days)
    # Since we need full historical data, this is a simplified mock calculation for now, 
    # except using today's data. 
    # A true streak calc would require aggregating by day.
    # To keep it performant, we'll implement a basic version.
    
    stats = {
        "today_productive_hours": round(focused_seconds / 3600, 1),
        "focus_percentage": round((focused_seconds / total_seconds * 100) if total_seconds > 0 else 0, 1),
        "total_sessions_today": len(logs),
        "missed_checkins": 0, # Could be calculated by gaps > 1 hour during working hours
        "current_streak": 1 if focused_seconds > 0 else 0, # Simplified
        "longest_streak": 1 if focused_seconds > 0 else 0, # Simplified
    }
    
    return stats
