from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.device import SummaryOut
from app.workers.summary_tasks import build_daily_stats
from app.services import summary_service
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/summary", tags=["summary"])


@router.post("/trigger", response_model=SummaryOut)
async def trigger_summary_manually(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Manual trigger for testing — the real flow runs via Celery beat at each user's local 9pm."""
    stats = await build_daily_stats(db, user.id)
    result = await summary_service.generate_day_end_summary(stats)
    return result
