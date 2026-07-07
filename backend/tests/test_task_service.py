"""
Unit tests for the task state machine (scheduling math + idempotency).
These exercise app/services/task_service.py directly with in-memory Task
objects — no DB/network needed, matching the "test database, not dev
database" guidance while keeping these specific tests fast and isolated.

Run with: pytest tests/test_task_service.py -v
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.task import Task, TaskStatus, Recurrence
from app.services import task_service


def make_task(**overrides) -> Task:
    defaults = dict(
        id=uuid4(),
        user_id=uuid4(),
        title="Test task",
        status=TaskStatus.pending,
        recurrence=Recurrence.none,
        due_at=None,
        anchor_time=None,
        interval_minutes=None,
        next_due_at=None,
        snoozed_until=None,
        snoozed_count_today=0,
        snoozed_count_total=0,
        last_action_client_ts=None,
    )
    defaults.update(overrides)
    return Task(**defaults)


def test_idempotent_done_action_is_noop_on_replay():
    task = make_task(status=TaskStatus.pending)
    ts = datetime.now(timezone.utc)

    changed_first = task_service.apply_action(task, "done", ts)
    assert changed_first is True
    assert task.status == TaskStatus.done

    # Replaying the exact same action/timestamp must be a no-op.
    changed_second = task_service.apply_action(task, "done", ts)
    assert changed_second is False
    assert task.status == TaskStatus.done  # unchanged


def test_idempotent_out_of_order_older_action_ignored():
    task = make_task(status=TaskStatus.pending)
    now = datetime.now(timezone.utc)
    newer_ts = now
    older_ts = now - timedelta(minutes=5)

    task_service.apply_action(task, "done", newer_ts)
    assert task.status == TaskStatus.done

    # An older action arriving late (out-of-order delivery) must not revert state.
    changed = task_service.apply_action(task, "reopen", older_ts)
    assert changed is False
    assert task.status == TaskStatus.done


def test_snooze_does_not_drift_unless_within_merge_window():
    anchor = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = make_task(
        recurrence=Recurrence.daily,
        anchor_time=anchor,
        next_due_at=anchor,
    )
    original_next_due = task.next_due_at

    # Snooze far away from next_due_at (e.g. 2 hours later) -> next_due_at untouched.
    client_ts = anchor
    task_service.apply_action(task, "snooze", client_ts, snooze_minutes=120)

    assert task.next_due_at == original_next_due
    assert task.snoozed_until == client_ts + timedelta(minutes=120)
    assert task.status == TaskStatus.snoozed


def test_snooze_merges_when_within_window_of_next_due_at():
    anchor = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = make_task(
        recurrence=Recurrence.daily,
        anchor_time=anchor,
        next_due_at=anchor,
    )
    client_ts = anchor - timedelta(minutes=10)

    # Snooze by 15 min -> lands at anchor + 5min, well within the 20-min merge window.
    task_service.apply_action(task, "snooze", client_ts, snooze_minutes=15)

    assert task.snoozed_until == client_ts + timedelta(minutes=15)
    # Merged: next_due_at should now equal the snoozed_until, not the original anchor.
    assert task.next_due_at == task.snoozed_until


def test_recurring_done_resets_to_pending_and_advances_from_anchor_not_now():
    anchor = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = make_task(
        recurrence=Recurrence.daily,
        anchor_time=anchor,
        next_due_at=anchor,
        status=TaskStatus.pending,
    )

    # Complete it "late" (well after the due time) to prove drift doesn't occur.
    completion_ts = anchor + timedelta(hours=5)
    task_service.apply_action(task, "done", completion_ts)

    assert task.status == TaskStatus.pending  # recurring tasks reset, not "done"
    # Next occurrence must be anchor + 1 day, NOT completion_ts + 1 day.
    assert task.next_due_at == anchor + timedelta(days=1)


def test_recurring_interval_advance_skips_missed_occurrences_from_anchor():
    anchor = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    task = make_task(
        recurrence=Recurrence.interval,
        interval_minutes=30,
        anchor_time=anchor,
        next_due_at=anchor,
    )

    # Complete it 95 minutes after anchor (so 3 intervals have already passed).
    completion_ts = anchor + timedelta(minutes=95)
    task_service.apply_action(task, "done", completion_ts)

    # 95 / 30 = 3 full intervals passed -> next occurrence is the 4th: anchor + 120min
    assert task.next_due_at == anchor + timedelta(minutes=120)


def test_non_recurring_done_goes_to_done_status():
    task = make_task(recurrence=Recurrence.none, status=TaskStatus.pending)
    task_service.apply_action(task, "done", datetime.now(timezone.utc))
    assert task.status == TaskStatus.done


def test_invalid_action_raises():
    task = make_task()
    with pytest.raises(task_service.InvalidAction):
        task_service.apply_action(task, "not_a_real_action", datetime.now(timezone.utc))
