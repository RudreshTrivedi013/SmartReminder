from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "reminder_backend",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.reminder_tasks",
        "app.workers.summary_tasks",
        "app.workers.checkin_tasks",
    ],
)

from celery.signals import worker_process_init


@worker_process_init.connect
def configure_workers(*args, **kwargs):
    from app.database import engine, sync_engine

    # Dispose of any database connection pools inherited from the parent process
    engine.sync_engine.dispose()
    sync_engine.dispose()


celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

import logging
_logger = logging.getLogger(__name__)
_logger.info("[Scheduler] Celery beat configured with %d schedules", len(celery_app.conf.beat_schedule or {}))

# Why server-driven scheduling (Celery, not client timers):
# Client timers (setTimeout / JS intervals) die the moment a tab closes, a
# phone sleeps, or the app is killed by the OS. A reminder app whose alarms
# stop working when the screen is off is useless. Celery beat runs
# independently of any client, on the server, so reminders fire reliably
# regardless of what any individual device is doing. The server is the single
# source of truth for "what time is it / what's due", which also sidesteps
# clock-skew bugs across devices.

checkin_schedule = 60.0
# checkin_schedule = 10.0
celery_app.conf.beat_schedule = {
    "check-due-reminders-every-60s": {
        "task": "app.workers.reminder_tasks.check_due_reminders",
        "schedule": 60.0,
    },

    "run-day-end-summaries-hourly": {
        # Runs hourly and internally filters to users whose local time is
        # currently 9pm, since users can be in any timezone.
        "task": "app.workers.summary_tasks.run_day_end_summaries",
        "schedule": crontab(minute=0),
    },

    # Runs every 5 minutes so user-selected check-in intervals
    # (30m, 60m, 120m, etc.) are respected much more accurately.
    "run-hourly-checkins": {
        "task": "app.workers.checkin_tasks.run_hourly_checkins",
        "schedule": checkin_schedule,   # Every 5 minutes
    },  
}
