"""Background jobs (spec section 24).

The frontend must never drive the pipeline. These run out of band, each
opening its own session rather than borrowing a request-scoped one.

Every job is defensive by construction: a job that raises would be logged and
dropped by APScheduler, so failures are caught, recorded to `ingest_runs`, and
surfaced through /api/system/status instead of vanishing into a log nobody
reads.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, Optional

from sqlalchemy import select

from app.config import settings
from app.database.connection import get_sessionmaker
from app.models.models import SeedRun
from app.services import firms_service
from app.services.aoi_service import active_boundary_name, is_inside_aoi
from app.services.analysis_service import drain_pending
from app.services.fire_event_service import mark_stale_events_contained, process_detections

logger = logging.getLogger(__name__)


async def ingest_job(day_range: Optional[int] = None) -> Dict[str, Any]:
    """Poll FIRMS and cluster new detections into fire events.

    Recorded to `ingest_runs` whether it succeeds or fails - that history is
    what the worker probe reports, and what tells an operator the pipeline has
    silently stopped.
    """
    started = datetime.datetime.now(datetime.timezone.utc)
    effective_range = day_range or settings.FIRMS_DAY_RANGE
    run = SeedRun(started_at=started, day_range=effective_range)

    async with get_sessionmaker()() as session:
        session.add(run)
        await session.flush()
        try:
            detections = await firms_service.fetch_detections(day_range=effective_range)

            # FIRMS can only be queried by rectangle. Clip to the real border
            # before anything is stored, so a Maharashtra fire is never
            # recorded, classified and reported as a Telangana one.
            fetched = len(detections)
            detections = [d for d in detections if is_inside_aoi(d.latitude, d.longitude)]
            clipped = fetched - len(detections)
            if clipped:
                logger.info(
                    "clipped %d of %d detection(s) falling outside the %s boundary",
                    clipped, fetched, active_boundary_name(),
                )

            result = await process_detections(session, detections)
            contained = await mark_stale_events_contained(session)

            run.detections_fetched = result.detections_fetched
            run.detections_inserted = result.detections_inserted
            run.events_created = result.events_created
            run.events_updated = result.events_updated
            run.ok = True
            run.detail = f"{contained} event(s) marked contained"
            run.finished_at = datetime.datetime.now(datetime.timezone.utc)
            await session.commit()

            logger.info(
                "ingest ok: fetched=%d inserted=%d events_created=%d events_updated=%d contained=%d",
                result.detections_fetched,
                result.detections_inserted,
                result.events_created,
                result.events_updated,
                contained,
            )
            return {**result.as_dict(), "ok": True, "events_marked_contained": contained}

        except Exception as exc:  # noqa: BLE001 - a scheduled job must not die
            await session.rollback()
            logger.exception("ingest failed")
            # Re-add on a clean session: the rollback detached the run row.
            async with get_sessionmaker()() as recovery:
                recovery.add(
                    SeedRun(
                        started_at=started,
                        finished_at=datetime.datetime.now(datetime.timezone.utc),
                        day_range=effective_range,
                        ok=False,
                        detail=f"{type(exc).__name__}: {str(exc)[:400]}",
                    )
                )
                await recovery.commit()
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def analysis_job(limit: Optional[int] = None) -> Dict[str, Any]:
    """Enrich and classify pending events.

    Small batches, run often: Overpass is the bottleneck. Each event claims,
    fetches and commits on its own, so no transaction spans a network call.
    """
    batch = limit or settings.ANALYSIS_BATCH_SIZE
    try:
        # drain_pending commits per event and holds no transaction across its
        # HTTP calls, so there is deliberately no session to wrap it in.
        results = await drain_pending(limit=batch)
        if results:
            logger.info("analysis ok: %d event(s) enriched", len(results))
        return {"ok": True, "analysed": len(results)}
    except Exception as exc:  # noqa: BLE001
        logger.exception("analysis failed")
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def containment_job() -> Dict[str, Any]:
    """Close events with no new detection for 24 hours."""
    async with get_sessionmaker()() as session:
        try:
            contained = await mark_stale_events_contained(session)
            await session.commit()
            if contained:
                logger.info("containment sweep: %d event(s) marked contained", contained)
            return {"ok": True, "contained": contained}
        except Exception as exc:  # noqa: BLE001
            await session.rollback()
            logger.exception("containment sweep failed")
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def backfill(day_range: int = 10) -> Dict[str, Any]:
    """Seed as much history as FIRMS will serve.

    `day_range` maxes at 10 - real archive access needs a manual request form -
    so this is the deepest automated cold start available. Recurrence, the
    strongest flare-vs-fire signal, only becomes meaningful once history
    accumulates.
    """
    logger.info("backfill starting with day_range=%d", day_range)
    return await ingest_job(day_range=min(10, max(1, day_range)))


async def last_ingest_run() -> Optional[SeedRun]:
    async with get_sessionmaker()() as session:
        return (
            await session.execute(select(SeedRun).order_by(SeedRun.id.desc()).limit(1))
        ).scalar_one_or_none()


async def probe_worker() -> Dict[str, Any]:
    """Report scheduler health from real run history. Never raises."""
    if not settings.SCHEDULER_ENABLED:
        return {"ok": False, "detail": "Scheduler disabled (SCHEDULER_ENABLED=false)", "latency_ms": None}

    try:
        run = await last_ingest_run()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"{type(exc).__name__}: {str(exc)[:120]}", "latency_ms": None}

    if run is None:
        return {
            "ok": False,
            "detail": "Scheduler running - no ingest has completed yet",
            "latency_ms": None,
        }

    finished = run.finished_at or run.started_at
    if finished.tzinfo is None:
        finished = finished.replace(tzinfo=datetime.timezone.utc)
    lag_min = (datetime.datetime.now(datetime.timezone.utc) - finished).total_seconds() / 60.0

    # Two missed cycles is the point at which something is actually wrong
    # rather than merely between runs.
    stale = lag_min > settings.FIRMS_POLL_MINUTES * 2 + 5

    if not run.ok:
        detail = f"Last ingest FAILED {lag_min:.0f} min ago - {run.detail or 'no detail'}"
    elif stale:
        detail = f"Last successful ingest {lag_min:.0f} min ago - exceeds expected {settings.FIRMS_POLL_MINUTES} min cadence"
    else:
        detail = (
            f"Last ingest {lag_min:.0f} min ago - "
            f"{run.detections_inserted} new detection(s), {run.events_created} new event(s)"
        )

    return {"ok": bool(run.ok) and not stale, "detail": detail, "latency_ms": None}
