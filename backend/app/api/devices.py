from datetime import datetime, timezone
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User, Device
from app.schemas.device import DeviceRegisterRequest, DeviceOut

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", response_model=DeviceOut, status_code=201)
async def register_device(payload: DeviceRegisterRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Extract the endpoint URL from the push subscription JSON so we can
    # deduplicate by endpoint rather than by full JSON string (browser engines
    # may serialize keys in different order, causing false duplicates).
    try:
        sub_obj = json.loads(payload.push_token)
        endpoint_url = sub_obj.get("endpoint", "")
    except (json.JSONDecodeError, AttributeError):
        raise HTTPException(status_code=422, detail="push_token must be valid JSON PushSubscription")

    if not endpoint_url:
        raise HTTPException(status_code=422, detail="push_token JSON must contain an 'endpoint' field")

    # Find existing device for this user with the same push endpoint.
    result = await db.execute(select(Device).where(Device.user_id == user.id))
    existing_devices = result.scalars().all()

    existing_device = None
    for d in existing_devices:
        try:
            d_sub = json.loads(d.push_token)
            if d_sub.get("endpoint") == endpoint_url:
                existing_device = d
                break
        except (json.JSONDecodeError, AttributeError):
            continue

    if existing_device:
        # Update the stored subscription (keys may have rotated) and refresh timestamp.
        existing_device.push_token = payload.push_token
        existing_device.last_active_at = datetime.now(timezone.utc)
        if payload.is_primary:
            user.primary_device_id = existing_device.id
        await db.commit()
        await db.refresh(existing_device)
        logger.info("[Device] Updated existing device %s for user %s", existing_device.id, user.id)
        return existing_device

    device = Device(
        user_id=user.id,
        push_token=payload.push_token,
        is_primary=payload.is_primary,
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(device)
    await db.flush()
    if payload.is_primary:
        user.primary_device_id = device.id
    await db.commit()
    await db.refresh(device)
    logger.info("[Device] Registered new device %s for user %s", device.id, user.id)
    return device


@router.get("", response_model=list[DeviceOut])
async def list_devices(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Device).where(Device.user_id == user.id))
    return list(result.scalars().all())


@router.post("/{device_id}/ping", response_model=DeviceOut)
async def ping_device(device_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Heartbeat to mark a device as recently active for notification targeting."""
    from app.services import push_service
    from app.services.push_service import GoneException

    result = await db.execute(select(Device).where(Device.id == device_id, Device.user_id == user.id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Device not found")
    
    device.last_active_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(device)
    
    # We no longer send a test push here because this endpoint is used
    # by the frontend as a 5-minute heartbeat to keep last_active_at fresh.
    
    return device


@router.post("/test-push")
async def test_push(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Send a test push notification to all devices for the current user."""
    from app.services import push_service
    from app.services.push_service import GoneException
    import asyncio
    
    result = await db.execute(select(Device).where(Device.user_id == user.id))
    devices = result.scalars().all()
    
    if not devices:
        return {"status": "no_devices", "devices_targeted": 0, "results": []}

    payload = {
        "title": "SmartReminder Test",
        "body": "Your push notifications are configured correctly!",
        "type": "test",
        "tag": "test-push",
    }
    
    loop = asyncio.get_running_loop()
    results = []
    sent_count = 0
    
    for device in devices:
        try:
            await loop.run_in_executor(None, push_service.send_push, device.push_token, payload)
            results.append({"device_id": str(device.id), "status": "sent"})
            sent_count += 1
        except GoneException:
            results.append({"device_id": str(device.id), "status": "removed", "error": "Subscription expired"})
            await db.delete(device)
        except Exception as e:
            results.append({"device_id": str(device.id), "status": "failed", "error": str(e)})

    await db.commit()
    return {"status": "ok", "devices_targeted": len(devices), "results": results}

