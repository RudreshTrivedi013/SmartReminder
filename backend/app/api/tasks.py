import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User, Task, TaskNote
from app.models.activity import ActivitySource, ActivityType
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut, TaskActionRequest
from app.services import activity_service, task_service, push_service, device_service
from app.websocket.connection_manager import manager

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _activity_for_task_action(action: str) -> ActivityType:
    return {
        "done": ActivityType.completed,
        "snooze": ActivityType.snoozed,
        "start": ActivityType.started,
        "block": ActivityType.blocked,
        "reopen": ActivityType.resumed,
    }.get(action, ActivityType.status_update)


def _activity_for_status_change(status: str) -> ActivityType:
    return {
        "done": ActivityType.completed,
        "blocked": ActivityType.blocked,
        "in_progress": ActivityType.started,
        "pending": ActivityType.resumed,
        "snoozed": ActivityType.snoozed,
    }.get(status, ActivityType.updated)


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    task = Task(
        user_id=user.id,
        title=payload.title,
        recurrence=payload.recurrence,
        due_at=payload.due_at,
        anchor_time=payload.due_at,  # anchor starts at the first due_at
        interval_minutes=payload.interval_minutes,
        next_due_at=payload.due_at,
        category=payload.category,
        source=payload.source,
    )
    db.add(task)
    await db.flush()
    for n in payload.notes:
        db.add(TaskNote(task_id=task.id, text=n.text, done=n.done, order_index=n.order_index))
    await activity_service.record_activity(
        db,
        user_id=user.id,
        task=task,
        activity_type=ActivityType.created,
        source=ActivitySource(payload.source.value),
        metadata={
            "event": "task_created",
            "recurrence": task.recurrence.value,
            "due_at": task.due_at.isoformat() if task.due_at else None,
        },
    )
    await db.commit()
    await db.refresh(task, attribute_names=["notes"])

    await manager.broadcast_to_user(user.id, {"event": "task_created", "task_id": str(task.id)})
    return task


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task)
        .where(Task.user_id == user.id)
        .options(selectinload(Task.notes))
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().unique().all())


@router.get("/recent", response_model=list[TaskOut])
async def recent_tasks(
    limit: int = 1,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task)
        .where(Task.user_id == user.id)
        .order_by(Task.created_at.desc())
        .options(selectinload(Task.notes))
        .limit(limit)
    )
    return list(result.scalars().unique().all())


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: UUID, payload: TaskUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    task = await task_service.get_task_for_user(db, task_id, user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    # Check if due_at or status is changing so we can cancel the old notification
    update_data = payload.model_dump(exclude_unset=True)
    old_status = task.status
    needs_cancel = False
    
    if "due_at" in update_data and update_data["due_at"] != task.due_at:
        needs_cancel = True
    if "status" in update_data and update_data["status"] != task.status and update_data["status"] in ("done", "blocked"):
        needs_cancel = True
        
    if needs_cancel:
        devices = await device_service.other_devices(db, user.id, exclude_device_id=None)
        cancel_payload = push_service.build_cancel_payload(str(task.id))
        loop = asyncio.get_event_loop()
        for d in devices:
            loop.run_in_executor(None, push_service.send_push, d.push_token, cancel_payload)
            
    for field, value in update_data.items():
        setattr(task, field, value)
    # Keep next_due_at and anchor_time in sync with due_at changes so the
    # Celery scheduler always has the correct target time.
    if "due_at" in update_data:
        task.next_due_at = update_data["due_at"]
        task.anchor_time = update_data["due_at"]
    activity_type = ActivityType.updated
    if "status" in update_data and update_data["status"] != old_status:
        activity_type = _activity_for_status_change(update_data["status"].value)
    await activity_service.record_activity(
        db,
        user_id=user.id,
        task=task,
        activity_type=activity_type,
        source=ActivitySource.task,
        metadata={
            "event": "task_updated",
            "changed_fields": sorted(update_data.keys()),
        },
    )
    await db.commit()
    await db.refresh(task, attribute_names=["notes"])
    await manager.broadcast_to_user(user.id, {"event": "task_updated", "task_id": str(task.id)})
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    task = await task_service.get_task_for_user(db, task_id, user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    # Cancel any pending push notifications before deleting
    devices = await device_service.other_devices(db, user.id, exclude_device_id=None)
    cancel_payload = push_service.build_cancel_payload(str(task.id))
    loop = asyncio.get_event_loop()
    for d in devices:
        loop.run_in_executor(None, push_service.send_push, d.push_token, cancel_payload)
    await activity_service.record_activity(
        db,
        user_id=user.id,
        task=task,
        activity_type=ActivityType.deleted,
        source=ActivitySource.task,
        metadata={"event": "task_deleted"},
    )
    await db.delete(task)
    await db.commit()
    await manager.broadcast_to_user(user.id, {"event": "task_deleted", "task_id": str(task_id)})


@router.post("/{task_id}/action", response_model=TaskOut)
async def task_action(
    task_id: UUID,
    payload: TaskActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await task_service.get_task_for_user(db, task_id, user.id)
    if not task:
        raise HTTPException(404, "Task not found")

    try:
        changed = task_service.apply_action(task, payload.action, payload.client_timestamp, payload.snooze_minutes)
    except task_service.InvalidAction as e:
        raise HTTPException(400, str(e))

    if changed:
        await activity_service.record_activity(
            db,
            user_id=user.id,
            task=task,
            activity_type=_activity_for_task_action(payload.action),
            source=ActivitySource.task,
            optional_notes=(
                f"Snoozed for {payload.snooze_minutes or 10} minutes"
                if payload.action == "snooze"
                else None
            ),
            metadata={
                "event": "task_action",
                "action": payload.action,
                "client_timestamp": payload.client_timestamp.isoformat(),
            },
        )
        await db.commit()
        await db.refresh(task, attribute_names=["notes"])

        await manager.broadcast_to_user(user.id, {"event": "task_action", "task_id": str(task.id), "action": payload.action})

        # Step 7: on "done", "snooze", or "block", cancel the notification on all devices
        if payload.action in ("done", "snooze", "block"):
            devices = await device_service.other_devices(db, user.id, exclude_device_id=None)
            cancel_payload = push_service.build_cancel_payload(str(task.id))
            loop = asyncio.get_event_loop()
            for d in devices:
                loop.run_in_executor(None, push_service.send_push, d.push_token, cancel_payload)
    else:
        await db.rollback()

    return task
