"""
Core task state-machine logic.

Design notes (see README for the longer version):
- Idempotency: applying the same action with the same (or older) client_timestamp
  twice must never change state twice. We track `last_action_client_ts` on the
  task and reject/no-op any action whose client_timestamp is not strictly newer
  than what's already been applied (last-write-wins by client time, not by
  request arrival order, so out-of-order delivery from flaky mobile networks
  doesn't corrupt state).
- Recurrence never drifts: when a recurring task is completed, the next
  occurrence is computed from the ORIGINAL anchor_time, not from "now". If we
  computed from "now", a task that's marked done a few minutes late every day
  would slowly creep later and later. Anchoring to the original schedule and
  just adding N * interval keeps it locked to the intended cadence.
- Snooze never silently reschedules the "real" next occurrence unless the
  snooze lands close enough (15-20 min) to the existing next_due_at that they
  would have produced two near-duplicate notifications anyway; in that case we
  merge them into one.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, TaskStatus, Recurrence

SNOOZE_MERGE_WINDOW_MINUTES = 20


class InvalidAction(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_task_for_user(db: AsyncSession, task_id: UUID, user_id: UUID) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    return result.scalar_one_or_none()


def _advance_recurrence(task: Task, completed_at: datetime) -> None:
    """Advance next_due_at from the ORIGINAL anchor_time, never from server 'now'.

    We anchor the "how many intervals have passed" math to the completion
    event's own timestamp (client_timestamp of the "done" action) rather than
    the server's wall-clock time, so replaying/backfilling actions or
    completing a task slightly late never shifts the schedule itself —
    only ever the anchor stays authoritative.
    """
    if task.recurrence == Recurrence.none or task.anchor_time is None:
        return

    anchor = task.anchor_time
    now = completed_at

    if task.recurrence == Recurrence.interval:
        if not task.interval_minutes:
            return
        step = timedelta(minutes=task.interval_minutes)
        # Find how many whole intervals have passed since anchor, then go one further
        # so we always land on the next future occurrence relative to anchor cadence.
        elapsed = now - anchor
        intervals_passed = max(int(elapsed / step), 0)
        next_due = anchor + step * (intervals_passed + 1)
        task.next_due_at = next_due

    elif task.recurrence == Recurrence.daily:
        step = timedelta(days=1)
        elapsed_days = max((now - anchor).days, 0)
        next_due = anchor + step * (elapsed_days + 1)
        task.next_due_at = next_due

    elif task.recurrence == Recurrence.weekly:
        step = timedelta(weeks=1)
        elapsed_weeks = max((now - anchor).days // 7, 0)
        next_due = anchor + step * (elapsed_weeks + 1)
        task.next_due_at = next_due


def apply_action(task: Task, action: str, client_timestamp: datetime, snooze_minutes: int | None = None) -> bool:
    """
    Applies an action to a task in-place. Returns True if state actually
    changed, False if this was a no-op (idempotent replay / stale action).
    Raises InvalidAction for unknown actions.
    """
    if client_timestamp.tzinfo is None:
        client_timestamp = client_timestamp.replace(tzinfo=timezone.utc)

    # Idempotency / last-write-wins guard: ignore actions that are not newer
    # than the last one we already applied.
    if task.last_action_client_ts is not None:
        last_ts = task.last_action_client_ts
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        if client_timestamp <= last_ts:
            return False

    changed = False

    if action == "done":
        if task.status != TaskStatus.done:
            changed = True
        if task.recurrence == Recurrence.none:
            task.status = TaskStatus.done
        else:
            # Recurring: reset to pending and advance schedule from anchor.
            task.status = TaskStatus.pending
            _advance_recurrence(task, client_timestamp)
        task.snoozed_until = None
        task.snoozed_count_today = 0

    elif action == "snooze":
        minutes = snooze_minutes or 10
        proposed = client_timestamp + timedelta(minutes=minutes)
        task.snoozed_until = proposed
        task.status = TaskStatus.snoozed
        task.snoozed_count_today += 1
        task.snoozed_count_total += 1

        # Merge into one occurrence if within the merge window of next_due_at,
        # rather than creating two near-duplicate reminders.
        if task.next_due_at is not None:
            delta = abs((proposed - task.next_due_at).total_seconds()) / 60
            if delta <= SNOOZE_MERGE_WINDOW_MINUTES:
                task.next_due_at = proposed
        changed = True

    elif action == "start":
        if task.status != TaskStatus.in_progress:
            task.status = TaskStatus.in_progress
            changed = True

    elif action == "block":
        if task.status != TaskStatus.blocked:
            task.status = TaskStatus.blocked
            task.next_due_at = None
            task.snoozed_until = None
            changed = True

    elif action == "reopen":
        if task.status != TaskStatus.pending:
            task.status = TaskStatus.pending
            task.snoozed_until = None
            if task.recurrence != Recurrence.none:
                _advance_recurrence(task, client_timestamp)
            changed = True

    else:
        raise InvalidAction(f"Unknown action: {action}")

    task.last_action_client_ts = client_timestamp
    return changed
