"""APScheduler wiring (spec section 24).

Jobs run in-process on the FastAPI event loop, which is the right trade for a
single-instance deployment. Two properties matter more than the schedule:

`max_instances=1` and `coalesce=True` - Overpass can take a full minute per
event, so an analysis pass can outlast its own interval. Without these,
overlapping runs would compete for the same pending rows and multiply the load
on the very service that was already slow.

Running more than one uvicorn worker would start one scheduler per worker and
poll FIRMS N times over. For multi-worker deployments, disable the in-process
scheduler and run it as its own process.
"""

from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.workers.jobs import analysis_job, containment_job, ingest_job

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> Optional[AsyncIOScheduler]:
    return _scheduler


def start_scheduler() -> Optional[AsyncIOScheduler]:
    global _scheduler

    if not settings.effective_scheduler_enabled:
        logger.info("Scheduler disabled (effective_scheduler_enabled=false)")
        return None
    if _scheduler is not None:
        return _scheduler

    scheduler = AsyncIOScheduler(
        job_defaults={
            # A slow Overpass pass must never spawn a second, competing run.
            "max_instances": 1,
            # After a pause, run once rather than replaying every missed fire.
            "coalesce": True,
            "misfire_grace_time": 300,
        }
    )

    poll_seconds = settings.effective_firms_poll_interval_seconds
    scheduler.add_job(
        ingest_job,
        IntervalTrigger(seconds=poll_seconds),
        id="firms_ingest",
        name="NASA FIRMS ingest",
        replace_existing=True,
    )
    scheduler.add_job(
        analysis_job,
        IntervalTrigger(minutes=settings.ANALYSIS_POLL_MINUTES),
        id="event_analysis",
        name="Weather + OSM enrichment and classification",
        replace_existing=True,
    )
    scheduler.add_job(
        containment_job,
        IntervalTrigger(hours=settings.CONTAINMENT_SWEEP_HOURS),
        id="containment_sweep",
        name="Mark stale events contained",
        replace_existing=True,
    )

    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "Scheduler started - FIRMS ingest every %d s (%d min), analysis every %d min, containment every %d h",
        poll_seconds,
        poll_seconds // 60,
        settings.ANALYSIS_POLL_MINUTES,
        settings.CONTAINMENT_SWEEP_HOURS,
    )
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")


def job_status() -> list[dict]:
    """Registered jobs and their next fire times, for /api/system/status."""
    if _scheduler is None:
        return []
    return [
        {
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        }
        for job in _scheduler.get_jobs()
    ]
