"""Fire event read API (spec section 23).

`/api/fires` is the pipeline's own resource. The pre-existing `/api/incidents`
endpoints are a different concept - manual beta triggers plus the deferred
notification simulation - and are left untouched at their original paths.

Responses are snake_case, matching the spec's contract. The frontend owns the
camelCase adapter, because this contract has other consumers planned (the ml/
trainer, the worker) and should not be shaped around one React app's field
names.

An event that the background analysis job has not reached yet reports
`prediction: null` with an explicit reasoning step saying so, rather than
inventing a class. Its severity is an openly provisional FRP band, flagged
`severity_is_provisional: true` everywhere it appears.
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
from app.models.models import (
    FireDetection,
    FireEvent,
    FirePrediction,
    ImpactAssessment,
    WeatherAnomalyRecord,
    WeatherObservation,
)
from app.services.classifier.scorer import CLASS_LABEL

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


async def latest_predictions(
    db: AsyncSession, event_ids: List[str]
) -> Dict[str, FirePrediction]:
    """Most recent prediction per event, in one query."""
    if not event_ids:
        return {}
    rows = list(
        (
            await db.execute(
                select(FirePrediction)
                .where(FirePrediction.fire_event_id.in_(event_ids))
                .order_by(FirePrediction.fire_event_id, FirePrediction.id.desc())
            )
        ).scalars()
    )
    latest: Dict[str, FirePrediction] = {}
    for row in rows:
        latest.setdefault(row.fire_event_id, row)
    return latest


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
    prediction: Optional[FirePrediction] = None,
) -> Dict[str, Any]:
    severity = prediction.severity if prediction else provisional_severity(event.frp_latest_mw)
    probabilities: Optional[Dict[str, float]] = None
    distance_km = (
        round(event.nearest_industrial_distance_m / 1000.0, 2)
        if event.nearest_industrial_distance_m is not None
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
                # "Registered" was accurate against a curated registry; these
                # come from OpenStreetMap, where a real site is often unnamed.
                f"{event.nearest_industrial_site} ({event.nearest_industrial_type}) "
                + ("containing this detection" if event.inside_industrial_site
                   else f"at {distance_km} km")
                if event.nearest_industrial_site and distance_km is not None
                else "No industrial site mapped within 1 km"
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
                "Awaiting enrichment - weather, surroundings and classification are "
                "attached by the background analysis job (every few minutes). "
                "Severity shown meanwhile is a provisional FRP band, not a "
                f"classified result ({INTERIM_MODEL_VERSION})."
            ),
            "status": "neutral",
        },
    ]

    if prediction is not None:
        probabilities = {
            "industrial": prediction.industrial_probability,
            "flare": prediction.flare_probability,
            "forest": prediction.forest_probability,
            "agriculture": prediction.agriculture_probability,
            "gas_oil": prediction.gas_oil_probability,
            "urban": prediction.urban_probability,
            "mining": prediction.mining_probability,
            "unknown": prediction.unknown_probability,
        }
        reasoning = prediction.reasoning_steps or reasoning

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
        # Validity is a SEPARATE verdict from source class and is never merged
        # into it: "is this a fire" and "what kind of fire" are different
        # questions with different answers.
        "validity": (
            {
                "verdict": prediction.validity_verdict,
                "p_real": prediction.validity_p_real,
                "confidence_pct": int(round((prediction.validity_p_real or 0) * 100)),
                "concerns": prediction.validity_concerns or [],
                "model_version": prediction.validity_model_version,
            }
            if prediction and prediction.validity_verdict
            else None
        ),
        "prediction": prediction.predicted_class if prediction else None,
        "prediction_label": CLASS_LABEL.get(prediction.predicted_class) if prediction else None,
        "classification_confidence_pct": prediction.confidence_pct if prediction else None,
        "probabilities": probabilities if prediction else None,
        "model_version": prediction.model_version if prediction else INTERIM_MODEL_VERSION,
        "model_kind": prediction.model_kind if prediction else "none",
        "data_quality": prediction.data_quality if prediction else None,
        "severity": severity,
        # True only while an event has no real prediction; the FRP band is a
        # placeholder, and the dashboard must be able to say so.
        "severity_is_provisional": prediction is None,
        "land_cover": event.land_cover,  # populated in Phase 4
        "location_name": event.location_name
        or f"{abs(event.latitude):.4f}°{'N' if event.latitude >= 0 else 'S'}, "
        f"{abs(event.longitude):.4f}°{'E' if event.longitude >= 0 else 'W'}",
        # From OpenStreetMap, so there is no registry id: the name is the
        # identity, and a genuine site can be unnamed.
        "nearest_facility_id": event.nearest_industrial_site,
        "nearest_facility_name": event.nearest_industrial_site,
        "nearest_facility_type": event.nearest_industrial_type,
        "nearest_facility_distance_km": distance_km,
        "inside_industrial_site": event.inside_industrial_site,
        "recurrence_count": recurrence,
        "history_days": history_days,
        "analysis_status": event.analysis_status,
        "surroundings_status": event.surroundings_status,
        "is_new": event.detection_count <= 1,
        "reasoning_steps": reasoning,
        "suggested_action": (
            prediction.suggested_action
            if prediction and prediction.suggested_action
            else "AWAITING ANALYSIS: Thermal anomaly detected; source classification pending enrichment."
        ),
    }


@router.get("/api/fires")
async def list_fires(
    db: AsyncSession = Depends(get_db),
    bbox: Optional[str] = Query(None, description="west,south,east,north"),
    since: Optional[str] = Query(None, description="ISO-8601 lower bound on last_detected"),
    status: str = Query("all", pattern="^(active|contained|all)$"),
    min_frp: float = Query(0.0, ge=0),
    # Raised for the country-scale AOI: India produces roughly 500 detections
    # a day, so a 7-day window is thousands of events, not hundreds.
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    query = select(FireEvent)

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
    predictions = await latest_predictions(db, [e.id for e in events])
    items = [
        serialise_event(
            event,
            recurrence=await recurrence_count(db, event),
            history_days=history_days,
            prediction=predictions.get(event.id),
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
            .where(FireEvent.id == fire_id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Fire event not found")

    predictions = await latest_predictions(db, [event.id])
    return serialise_event(
        event,
        recurrence=await recurrence_count(db, event),
        history_days=await history_window_days(db),
        prediction=predictions.get(event.id),
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
    """Industrial sites OpenStreetMap maps near the detected fires.

    This replaced a curated registry of six hand-seeded Gujarat plants. That
    list could only ever describe the region someone thought to seed, so once
    the AOI moved to Telangana every fire reported a "nearest facility" 700 km
    away. These are discovered from the same 1 km enrichment the classifier
    uses, so they follow the AOI wherever it points.

    Sites are keyed by name and type: OSM way ids are not stable across edits,
    and one plant is commonly mapped as several overlapping ways.
    """
    rows = (
        await db.execute(
            select(FireEvent, FirePrediction)
            .join(FirePrediction, FirePrediction.fire_event_id == FireEvent.id)
            .order_by(FireEvent.last_detected.desc())
        )
    ).all()

    sites: Dict[str, Dict[str, Any]] = {}
    for event, prediction in rows:
        for site in (prediction.feature_snapshot or {}).get("industrial_sites", []) or []:
            key = f"{site.get('type')}|{site.get('name')}"
            entry = sites.get(key)
            if entry is None:
                entry = {
                    "id": key,
                    "name": site.get("name"),
                    "type": site.get("type"),
                    # The site's own geometry is not stored, only its distance
                    # from each fire, so it is placed at the nearest fire that
                    # saw it. Honest to a few hundred metres, and never
                    # invented.
                    "latitude": event.latitude,
                    "longitude": event.longitude,
                    "location": event.location_name,
                    "named": bool(site.get("named")),
                    "nearest_distance_m": site.get("distance_m"),
                    "fire_event_ids": [],
                    "current_frp": 0.0,
                    "last_detected": None,
                }
                sites[key] = entry

            entry["fire_event_ids"].append(event.id)
            entry["current_frp"] = max(entry["current_frp"], event.frp_latest_mw or 0.0)
            if site.get("distance_m") is not None and (
                entry["nearest_distance_m"] is None
                or site["distance_m"] < entry["nearest_distance_m"]
            ):
                entry["nearest_distance_m"] = site["distance_m"]
                entry["latitude"] = event.latitude
                entry["longitude"] = event.longitude
                entry["location"] = event.location_name
            if event.last_detected and (
                entry["last_detected"] is None
                or event.last_detected.isoformat() > entry["last_detected"]
            ):
                entry["last_detected"] = event.last_detected.isoformat()

    ordered = sorted(
        sites.values(),
        key=lambda item: (-len(item["fire_event_ids"]), item["name"] or ""),
    )
    return {
        "total": len(ordered),
        "source": "openstreetmap",
        "facilities": [
            {
                **item,
                "event_count": len(item["fire_event_ids"]),
                # A site with a fire detected inside or beside it is worth
                # attention; this is an observation, not a safety judgement.
                "status": "ANOMALY_DETECTED" if len(item["fire_event_ids"]) > 1 else "ELEVATED",
            }
            for item in ordered
        ],
        "caveat": (
            "Industrial sites as mapped in OpenStreetMap within 1 km of a detected fire. "
            "Coverage varies by region and many industrial parcels are unnamed, so this is "
            "a lower bound rather than a complete asset register."
        ),
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


@router.get("/api/fires/{fire_id}/prediction")
async def get_prediction(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Classifier output (spec section 19).

    This is the exact contract Phase 8's trained model will emit; swapping the
    model changes `model_kind` and nothing else.
    """
    prediction = (
        await db.execute(
            select(FirePrediction)
            .where(FirePrediction.fire_event_id == fire_id)
            .order_by(FirePrediction.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if prediction is None:
        raise HTTPException(
            status_code=404, detail="No prediction yet - the event has not been analysed"
        )

    return {
        "fire_event_id": fire_id,
        "prediction": prediction.predicted_class,
        "label": CLASS_LABEL.get(prediction.predicted_class),
        "confidence": round(prediction.confidence, 4),
        "confidence_pct": prediction.confidence_pct,
        "probabilities": {
            "industrial": prediction.industrial_probability,
            "flare": prediction.flare_probability,
            "forest": prediction.forest_probability,
            "agriculture": prediction.agriculture_probability,
            "gas_oil": prediction.gas_oil_probability,
            "urban": prediction.urban_probability,
            "mining": prediction.mining_probability,
            "unknown": prediction.unknown_probability,
        },
        "severity": prediction.severity,
        "model_version": prediction.model_version,
        "model_kind": prediction.model_kind,
        "data_quality": prediction.data_quality,
        "reasoning_steps": prediction.reasoning_steps,
        "suggested_action": prediction.suggested_action,
        "validity": {
            "verdict": prediction.validity_verdict,
            "p_real": prediction.validity_p_real,
            "confidence_pct": int(round((prediction.validity_p_real or 0) * 100)),
            "concerns": prediction.validity_concerns or [],
            "reasoning_steps": prediction.validity_steps or [],
            "model_version": prediction.validity_model_version,
            "interpretation": (
                "Whether this thermal anomaly is a genuine fire. A FIRMS record is a "
                "satellite-detected thermal anomaly, not a confirmed fire."
            ),
        },
        "source_caveat": (
            "Source classification assumes the detection is genuine. Read the validity "
            "verdict first."
        ),
        "created_at": prediction.created_at.isoformat(),
        # Spec Rule 8 - the UI must never present this as a determination.
        "interpretation": (
            "Most probable source category, not a determination of ignition cause."
        ),
    }


@router.get("/api/fires/{fire_id}/features")
async def get_feature_vector(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """The flat feature vector the prediction was made from (spec section 11)."""
    prediction = (
        await db.execute(
            select(FirePrediction)
            .where(FirePrediction.fire_event_id == fire_id)
            .order_by(FirePrediction.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if prediction is None:
        raise HTTPException(status_code=404, detail="No feature vector yet")
    return {
        "fire_event_id": fire_id,
        "model_version": prediction.model_version,
        "features": prediction.feature_snapshot,
    }


@router.get("/api/fires/{fire_id}/impact")
async def get_impact(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Risk zones, exposure and potential pollutants (spec sections 20-22)."""
    impact = (
        await db.execute(
            select(ImpactAssessment)
            .where(ImpactAssessment.fire_event_id == fire_id)
            .order_by(ImpactAssessment.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if impact is None:
        raise HTTPException(status_code=404, detail="No impact assessment yet")

    return {
        "fire_event_id": fire_id,
        "risk_level": impact.risk_level,
        "core_radius_m": impact.core_radius_m,
        "downwind_length_m": impact.downwind_length_m,
        "wind_speed_ms": impact.wind_speed_ms,
        "wind_direction_deg": impact.wind_direction_deg,
        "plume_bearing_deg": impact.plume_bearing_deg,
        "exposed": impact.exposed,
        "exposure_count": impact.exposure_count,
        "potential_pollutants": impact.potential_pollutants,
        "pollutant_caveat": (
            "Potential pollutants only. Actual emissions depend on the material burning "
            "and are not measured by satellite."
        ),
        "risk_zones": impact.risk_zones,
        "notes": impact.notes,
        "created_at": impact.created_at.isoformat(),
    }


@router.get("/api/fires/{fire_id}/weather")
async def get_weather(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Current conditions and the six-day same-local-hour baseline (spec 8-10)."""
    anomaly = (
        await db.execute(
            select(WeatherAnomalyRecord)
            .where(WeatherAnomalyRecord.fire_event_id == fire_id)
            .order_by(WeatherAnomalyRecord.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if anomaly is None:
        raise HTTPException(status_code=404, detail="No weather analysis yet")

    observation = (
        await db.execute(
            select(WeatherObservation)
            .where(WeatherObservation.fire_event_id == fire_id)
            .order_by(WeatherObservation.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return {
        "fire_event_id": fire_id,
        "local_hour": observation.local_hour if observation else None,
        "timezone": observation.timezone if observation else None,
        "current": {
            "temperature_c": anomaly.current_temperature_c,
            "humidity_pct": anomaly.current_humidity_pct,
            "wind_speed_ms": observation.wind_speed_ms if observation else None,
            "wind_direction_deg": observation.wind_direction_deg if observation else None,
            "precipitation_mm": observation.precipitation_mm if observation else None,
            "vpd_kpa": anomaly.vpd_kpa,
        },
        "baseline": {
            "temperature_c": anomaly.baseline_temperature_c,
            "humidity_pct": anomaly.baseline_humidity_pct,
            "temperature_stdev_c": anomaly.temperature_stdev_c,
            "samples": anomaly.baseline_samples,
            "days_requested": 6,
            "quality": anomaly.baseline_quality,
        },
        "anomaly": {
            "temperature_c": anomaly.temperature_anomaly_c,
            "temperature_z": anomaly.temperature_anomaly_z,
            "temperature_trend_c_per_day": anomaly.temperature_trend_c_per_day,
            "humidity_pct": anomaly.humidity_anomaly_pct,
            "wind_change_ms": anomaly.wind_change_ms,
            "vpd_kpa": anomaly.vpd_anomaly_kpa,
        },
        "precipitation": {
            "last_24h_mm": anomaly.precipitation_24h_mm,
            "last_72h_mm": anomaly.precipitation_72h_mm,
            "dry_hours": anomaly.dry_hours,
        },
        # Spec Rule 2 - stated wherever this data is surfaced.
        "interpretation": (
            "Weather anomalies are supporting evidence of unusual local conditions. "
            "They are not proof of a fire, nor evidence about its source."
        ),
    }


@router.get("/api/fires/{fire_id}/surroundings")
async def get_surroundings(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """The 1 km OpenStreetMap context (spec 13, 14)."""
    prediction = (
        await db.execute(
            select(FirePrediction)
            .where(FirePrediction.fire_event_id == fire_id)
            .order_by(FirePrediction.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if prediction is None or not prediction.feature_snapshot:
        raise HTTPException(status_code=404, detail="No surroundings analysis yet")

    snapshot = prediction.feature_snapshot
    keys = (
        "industrial_area_km2", "forest_area_km2", "farmland_area_km2",
        "residential_area_km2", "water_area_km2", "industrial_fraction",
        "forest_fraction", "farmland_fraction", "residential_fraction",
        "factories_within_1km", "gas_facilities_within_1km", "power_infra_within_1km",
        "building_count", "hospitals", "schools", "fire_stations", "road_length_km",
        "nearest_factory_m", "nearest_gas_facility_m", "nearest_residential_m",
        "nearest_forest_m", "nearest_farmland_m", "inside_industrial", "inside_forest",
        "inside_farmland", "inside_residential", "land_cover", "osm_coverage",
        "osm_element_count", "emergency_facilities", "industrial_sites",
    )
    return {
        "fire_event_id": fire_id,
        "radius_m": int(float(snapshot.get("radius_km", 1.0)) * 1000),
        **{k: snapshot.get(k) for k in keys},
        # Spec Rule 4 - absent OSM data is not evidence of absence.
        "coverage_caveat": (
            "OpenStreetMap completeness varies by region. Sparse coverage means features may "
            "exist that are not mapped; these counts are a lower bound."
        ),
    }


@router.get("/api/fires/{fire_id}/analysis")
async def get_analysis(fire_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Everything about one fire, in one round trip.

    This is what the intelligence drawer calls, so selecting an incident costs
    one request rather than five.
    """
    event = (
        await db.execute(
            select(FireEvent)
            .where(FireEvent.id == fire_id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Fire event not found")

    predictions = await latest_predictions(db, [fire_id])
    summary = serialise_event(
        event,
        recurrence=await recurrence_count(db, event),
        history_days=await history_window_days(db),
        prediction=predictions.get(fire_id),
    )

    async def optional(coro):
        try:
            return await coro
        except HTTPException:
            return None

    return {
        "fire": summary,
        "weather": await optional(get_weather(fire_id, db)),
        "surroundings": await optional(get_surroundings(fire_id, db)),
        "prediction": await optional(get_prediction(fire_id, db)),
        "impact": await optional(get_impact(fire_id, db)),
    }
