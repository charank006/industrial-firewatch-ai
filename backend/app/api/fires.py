"""Fire event read API (spec section 23).

`/api/fires` is the pipeline's own resource. The pre-existing `/api/incidents`
endpoints are a different concept - manual beta triggers plus the deferred
notification simulation - and are left untouched at their original paths.

Responses are snake_case, matching the spec's contract. The frontend owns the
camelCase adapter, because this contract has other consumers planned (the ml/
trainer, the worker) and should not be shaped around one React app's field
names.

Classification is deliberately absent until Phase 5: rather than inventing a
class, events report `prediction: null` with an explicit reasoning step saying
so. Severity is an openly provisional FRP band, labelled as such everywhere it
appears.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database.connection import get_db
from app.models.models import Facility, FireDetection, FireEvent

router = APIRouter(tags=["fires"])

# Model version for the interim, pre-Phase-5 labelling. Swapping this for
# "rules-v1.<hash>" is the only change the contract needs when the real
# classifier lands.
INTERIM_MODEL_VERSION = "unclassified-v0"


def _aoi_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.AOI_TIMEZONE)
    except Exception:  # noqa: BLE001 - a bad tz must not take the API down
        return ZoneInfo("UTC")


def format_local_time(when: Optional[datetime.datetime]) -> Optional[str]:
    """Render in the AOI's timezone, on the server.

    Doing this here is what killed the old `" IST"`-appended-to-UTC bug: the
    offset is applied before the label is written, and the label comes from the
    zone itself rather than being hardcoded.
    """
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=datetime.timezone.utc)
    local = when.astimezone(_aoi_tz())
    return f"{local:%H:%M} {local.tzname()}"


def provisional_severity(frp_mw: float) -> str:
    """Interim FRP banding used only until the Phase 5 scorer exists.

    Real severity is a function of predicted class, FRP and exposure. This is
    a placeholder, and every response that carries it says so.
    """
    if frp_mw >= 100:
        return "HIGH"
    if frp_mw >= 25:
        return "MEDIUM"
    return "LOW"


async def history_window_days(db: AsyncSession) -> int:
    """How many days of detections actually exist.

    Recurrence is the strongest flare-vs-fire signal and starts at zero on day
    one: FIRMS day_range maxes at 10 and true archive access needs a manual
    request. The UI must say "N in the last D days of system history" with a
    real D rather than implying 180.
    """
    earliest = (await db.execute(select(func.min(FireDetection.acquisition_time)))).scalar_one_or_none()
    if earliest is None:
        return 0
    if earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=datetime.timezone.utc)
    delta = datetime.datetime.now(datetime.timezone.utc) - earliest
    return max(0, delta.days)


async def recurrence_count(db: AsyncSession, event: FireEvent) -> int:
    """Other events that have burned at this location within known history."""
    result = await db.execute(
        text(
            """
            SELECT COUNT(*) FROM fire_events
            WHERE id <> :event_id
              AND ST_DWithin(
                    geometry::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :radius_m)
            """
        ),
        {
            "event_id": event.id,
            "lon": event.longitude,
            "lat": event.latitude,
            "radius_m": settings.EVENT_LINK_RADIUS_M,
        },
    )
    return int(result.scalar_one())


def serialise_event(
    event: FireEvent,
    *,
    recurrence: int = 0,
    history_days: int = 0,
    facility: Optional[Facility] = None,
) -> Dict[str, Any]:
    severity = provisional_severity(event.frp_latest_mw)
    distance_km = (
        round(event.nearest_facility_distance_m / 1000.0, 2)
        if event.nearest_facility_distance_m is not None
        else None
    )

    reasoning: List[Dict[str, Any]] = [
        {
            "step_index": 1,
            "label": "Satellite Thermal Detection",
            "detail": (
                f"FRP {event.frp_latest_mw:.1f} MW detected by {event.day_night or '?'}-pass "
                f"sensor across {event.detection_count} observation(s)"
            ),
            "status": "critical" if severity == "HIGH" else "warning",
        },
        {
            "step_index": 2,
            "label": "Spatial GIS Context",
            "detail": (
                f"Nearest registered facility {facility.name} at {distance_km} km"
                if facility and distance_km is not None
                else "No facility association resolved"
            ),
            "status": "neutral",
        },
        {
            "step_index": 3,
            "label": "Historical Recurrence Lookup",
            "detail": (
                f"{recurrence} prior event(s) within "
                f"{int(settings.EVENT_LINK_RADIUS_M)} m across {history_days} day(s) "
                "of system history"
            ),
            "status": "neutral",
        },
        {
            "step_index": 4,
            "label": "Source Classification",
            "detail": (
                "Not yet available - the probabilistic rule engine lands in Phase 5. "
                f"Severity shown is a provisional FRP band ({INTERIM_MODEL_VERSION})."
            ),
            "status": "neutral",
        },
    ]

    return {
        "fire_event_id": event.id,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "first_detected": event.first_detected.isoformat() if event.first_detected else None,
        "last_detected": event.last_detected.isoformat() if event.last_detected else None,
        "time_formatted": format_local_time(event.last_detected),
        "day_night": event.day_night,
        "status": event.status,
        "detection_count": event.detection_count,
        "frp_latest_mw": round(event.frp_latest_mw, 2),
        "frp_max_mw": round(event.frp_max_mw, 2),
        "frp_mean_mw": round(event.frp_mean_mw, 2),
        "brightness_k": event.brightness_k,
        # NASA's own detection confidence - distinct from classification
        # confidence, which does not exist until Phase 5.
        "detection_confidence_pct": event.detection_confidence_pct,
        "prediction": None,
        "classification_confidence_pct": None,
        "probabilities": None,
        "model_version": INTERIM_MODEL_VERSION,
        "severity": severity,
        "severity_is_provisional": True,
        "land_cover": event.land_cover,  # populated in Phase 4
        "location_name": event.location_name
        or f"{abs(event.latitude):.4f}°{'N' if event.latitude >= 0 else 'S'}, "
        f"{abs(event.longitude):.4f}°{'E' if event.longitude >= 0 else 'W'}",
        "nearest_facility_id": event.nearest_facility_id,
        "nearest_facility_name": facility.name if facility else None,
        "nearest_facility_distance_km": distance_km,
        "recurrence_count": recurrence,
        "history_days": history_days,
        "analysis_status": event.analysis_status,
        "surroundings_status": event.surroundings_status,
        "is_new": event.detection_count <= 1,
        "reasoning_steps": reasoning,
        "suggested_action": (
            "REVIEW REQUIRED: Thermal anomaly detected. Source classification pending."
        ),
    }


@router.get("/api/fires")
async def list_fires(
    db: AsyncSession = Depends(get_db),
    bbox: Optional[str] = Query(None, description="west,south,east,north"),
    since: Optional[str] = Query(None, description="ISO-8601 lower bound on last_detected"),
    status: str = Query("all", pattern="^(active|contained|all)$"),
    min_frp: float = Query(0.0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    query = select(FireEvent).options(selectinload(FireEvent.nearest_facility))

    if status != "all":
        query = query.where(FireEvent.status == status)
    if min_frp > 0:
        query = query.where(FireEvent.frp_latest_mw >= min_frp)

    if since:
        # An un-encoded "+00:00" offset arrives as " 00:00", because `+` means
        # space in a query string. Restoring it avoids a confusing 422 for a
        # timestamp the caller wrote correctly.
        normalised = since.replace("Z", "+00:00").replace(" 00:00", "+00:00")
        try:
            lower = datetime.datetime.fromisoformat(normalised)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unparseable `since`: {since!r}")
        if lower.tzinfo is None:
            lower = lower.replace(tzinfo=datetime.timezone.utc)
        query = query.where(FireEvent.last_detected >= lower)

    if bbox:
        try:
            west, south, east, north = (float(p) for p in bbox.split(","))
        except ValueError:
            raise HTTPException(
                status_code=422, detail=f"`bbox` must be west,south,east,north - got {bbox!r}"
            )
        query = query.where(
            FireEvent.longitude.between(west, east), FireEvent.latitude.between(south, north)
        )

    total = (
        await db.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()

    query = query.order_by(FireEvent.last_detected.desc()).limit(limit).offset(offset)
    events = list((await db.execute(query)).scalars())

    history_days = await history_window_days(db)
    items = [
        serialise_event(
            event,
            recurrence=await recurrence_count(db, event),
            history_days=history_days,
            facility=event.nearest_facility,
        )
        for event in events
    ]

    return {
        "total": int(total),
        "returned": len(items),
        "limit": limit,
        "offset": offset,
        "history_days": history_days,
        "fires": items,
    }


@router.get("/api/fires/{fire_id}")
async def get_fire(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    event = (
        await db.execute(
            select(FireEvent)
            .options(selectinload(FireEvent.nearest_facility))
            .where(FireEvent.id == fire_id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Fire event not found")

    return serialise_event(
        event,
        recurrence=await recurrence_count(db, event),
        history_days=await history_window_days(db),
        facility=event.nearest_facility,
    )


@router.get("/api/fires/{fire_id}/detections")
async def get_fire_detections(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """The FRP time series behind one event."""
    if (await db.get(FireEvent, fire_id)) is None:
        raise HTTPException(status_code=404, detail="Fire event not found")

    rows = list(
        (
            await db.execute(
                select(FireDetection)
                .where(FireDetection.fire_event_id == fire_id)
                .order_by(FireDetection.acquisition_time.asc())
            )
        ).scalars()
    )
    return {
        "fire_event_id": fire_id,
        "count": len(rows),
        "detections": [
            {
                "acquisition_time": d.acquisition_time.isoformat(),
                "time_formatted": format_local_time(d.acquisition_time),
                "latitude": d.latitude,
                "longitude": d.longitude,
                "frp_mw": d.frp_mw,
                "brightness_k": d.brightness_k,
                "confidence_raw": d.confidence_raw,
                "confidence_pct": d.confidence_pct,
                "satellite": d.satellite,
                "instrument": d.instrument,
                "source": d.source,
                "day_night": d.day_night,
            }
            for d in rows
        ],
    }


@router.get("/api/facilities")
async def list_facilities(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    facilities = list((await db.execute(select(Facility).order_by(Facility.id))).scalars())
    return {
        "total": len(facilities),
        "facilities": [
            {
                "id": f.id,
                "name": f.name,
                "type": f.type,
                "latitude": f.latitude,
                "longitude": f.longitude,
                "location": f.location,
                "status": f.status,
                "baseline_frp": f.baseline_frp,
                "current_frp": f.current_frp,
                "last_detected": f.last_detected.isoformat() if f.last_detected else None,
                "total_events_past_90_days": f.total_events_past_90_days,
                "risk_buffer_radius_km": f.risk_buffer_radius_km,
                "emergency_contact": f.emergency_contact,
            }
            for f in facilities
        ],
    }


@router.get("/api/dashboard/summary")
async def dashboard_summary(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Counts shaped for the situation rail."""
    events = list((await db.execute(select(FireEvent))).scalars())
    severities = [provisional_severity(e.frp_latest_mw) for e in events]
    frps = [e.frp_latest_mw for e in events]

    return {
        "total_detected": len(events),
        "active": sum(1 for e in events if e.status == "active"),
        "high_priority_count": sum(1 for s in severities if s in {"HIGH", "CRITICAL"}),
        "medium_priority_count": severities.count("MEDIUM"),
        "low_priority_count": severities.count("LOW"),
        "avg_frp": round(sum(frps) / len(frps), 1) if frps else 0.0,
        "total_detections": (
            await db.execute(select(func.count()).select_from(FireDetection))
        ).scalar_one(),
        "history_days": await history_window_days(db),
        "severity_is_provisional": True,
        "model_version": INTERIM_MODEL_VERSION,
    }
