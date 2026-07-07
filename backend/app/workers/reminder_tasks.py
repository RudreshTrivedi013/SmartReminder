"""
Beat job: every 60s, find due tasks, respect quiet hours, pick target
devices, send a push, and log it.

Why UTC everywhere: due_at/next_due_at/snoozed_until are stored in UTC so
"is this due" is a single unambiguous comparison against utcnow() with no
DST or timezone-conversion bugs in the hot scheduling path. We only convert
to the user's local timezone at the edges — for quiet-hours math and for
deciding when "9pm" is for the daily summary — where local time is actually
the meaningful unit.

Why synchronous: Celery uses a prefork model. asyncpg connections are
bound to a specific event loop, and asyncio.run() creates a new loop on
every call, so the old connection's Future ends up attached to a different
loop → RuntimeError. Using psycopg2 (sync) avoids this entirely.
"""
from datetime import datetime, timedelta, timezone
import logging

from sqlalchemy.orm import Session

from app.models import Task, TaskStatus, User, Device, NotificationLog
from app.services import push_service
from app.services.push_service import GoneException
from app.workers.celery_app import celery_app
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


def _in_quiet_hours(user: User, now_utc: datetime) -> tuple[bool, datetime | None]:
    """Returns (is_quiet, push_to) where push_to is the UTC instant quiet
    hours end, if currently within the user's quiet-hours window."""
    if not user.quiet_hours_start or not user.quiet_hours_end:
        return False, None

    tz = ZoneInfo(user.timezone or "UTC")
    local_now = now_utc.astimezone(tz)
    start, end = user.quiet_hours_start, user.quiet_hours_end

    local_time = local_now.time()
    if start <= end:
        is_quiet = start <= local_time < end
    else:
        # Window wraps midnight, e.g. 22:00 - 07:00
        is_quiet = local_time >= start or local_time < end

    if not is_quiet:
        return False, None

    end_local = local_now.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if end_local <= local_now:
        end_local += timedelta(days=1)
    return True, end_local.astimezone(timezone.utc)


def _check_due_reminders_sync():
    from app.database import SyncSessionLocal

    now = datetime.now(timezone.utc)
    logger.info("[Beat] check_due_reminders — starting at %s", now.isoformat())
    with SyncSessionLocal() as db:
        due_tasks = (
            db.query(Task)
            .filter(
                Task.status.in_([
                        TaskStatus.pending,
                        TaskStatus.in_progress,
                        TaskStatus.snoozed,
                    ]),
                (
                    # Case 1: next_due_at is set and has passed (primary scheduler path)
                    (Task.next_due_at.is_not(None) & (Task.next_due_at <= now))
                    # Case 2: snooze has elapsed
                    | (Task.snoozed_until.is_not(None) & (Task.snoozed_until <= now))
                    # Case 3: fallback — task has a due_at but next_due_at was never set or was cleared
                    | (
                        Task.due_at.is_not(None)
                        & (Task.due_at <= now)
                        & Task.next_due_at.is_(None)
                        & Task.snoozed_until.is_(None)
                    )
                ),
            )
            .all()
        )

        logger.info("[Beat] check_due_reminders — found %d due task(s)", len(due_tasks))

        for task in due_tasks:
            user = db.query(User).filter(User.id == task.user_id).first()
            if not user or not user.reminders_enabled:
                continue

            is_quiet, push_to = _in_quiet_hours(user, now)
            if is_quiet and push_to:
                logger.info("[Beat] Task %s deferred — user in quiet hours until %s", task.id, push_to.isoformat())
                # Defer: push next_due_at (or snoozed_until) to quiet-hours end.
                if task.snoozed_until and task.snoozed_until <= now:
                    task.snoozed_until = push_to
                else:
                    task.next_due_at = push_to
                continue

            # Get all push-enabled devices for this user
            devices = (
                db.query(Device)
                .filter(Device.user_id == user.id, Device.push_enabled == True)  # noqa: E712
                .all()
            )
            if not devices:
                logger.debug("[Beat] Task %s has no push-enabled devices — skipping", task.id)
                continue

            due_at_iso = (task.next_due_at or task.snoozed_until or task.due_at or now).isoformat()
            payload = push_service.build_reminder_payload(str(task.id), task.title, due_at_iso, str(user.id))

            for device in devices:
                try:
                    sent = push_service.send_push(device.push_token, payload)
                    if sent:
                        db.add(
                            NotificationLog(
                                task_id=task.id,
                                channel="push",
                                device_id=device.id,
                            )
                        )
                except GoneException:
                    logger.info(
                        "[Push] Removing expired subscription — device %s (task %s)", device.id, task.id
                    )
                    db.delete(device)
                except Exception as exc:
                    logger.warning("[Push] Push to device %s failed: %s", device.id, exc)

            # Clear the due/snooze timestamps so we don't spam every 60 seconds.
            # Order matters: check snoozed_until first since it takes priority.
            if task.snoozed_until and task.snoozed_until <= now:
                task.snoozed_until = None
            elif task.next_due_at and task.next_due_at <= now:
                task.next_due_at = None
            elif task.due_at and task.due_at <= now:
                # Fallback path: task fired via due_at. For non-recurring tasks,
                # null out due_at so this tick is not repeated every 60 seconds.
                # Recurring tasks manage their own schedule via _advance_recurrence.
                if task.recurrence.value == "none":
                    task.due_at = None

        db.commit()
        logger.info("[Beat] check_due_reminders — done")


@celery_app.task(name="app.workers.reminder_tasks.check_due_reminders")
def check_due_reminders():
    _check_due_reminders_sync()
