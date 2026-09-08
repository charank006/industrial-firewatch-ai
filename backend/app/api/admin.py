"""Operator probes for the external-data pipeline.

Phase 1 milestone (spec section 29): prove FIRMS -> weather -> six-day
baseline -> anomaly works end to end as JSON, before any persistence exists.

These endpoints spend real NASA/Open-Meteo quota, so they are guarded.
"""

from __future__ import annotations

import asyncio
import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.connection import get_db
from app.seed_data import FACILITIES_DB
from app.services import firms_service, weather_service
from app.services.analysis_service import drain_pending
from app.services.fire_event_service import (
    mark_stale_events_contained,
    process_detections,
    seed_facilities,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(x_admin_token: Optional[str]) -> Optional[str]:
    """Guard quota-spending endpoints.

    When ADMIN_API_TOKEN is unset these stay open for local development, but
    the response says so explicitly rather than implying it is secured.
    """
    if not settings.ADMIN_API_TOKEN:
        return "ADMIN_API_TOKEN is not set - this endpoint is UNGUARDED. Set it before exposing this service."
    if x_admin_token != settings.ADMIN_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token")
    return None


@router.get("/probe/weather")
async def probe_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    at: Optional[str] = Query(None, description="ISO-8601 UTC instant; defaults to now"),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Six-day same-local-hour baseline and anomalies at one coordinate.

    Needs no API key, so it works before a FIRMS MAP_KEY is configured.
    """
    warning = require_admin(x_admin_token)

    if at:
        try:
            when = datetime.datetime.fromisoformat(at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unparseable timestamp: {at!r}")
        if when.tzinfo is None:
            when = when.replace(tzinfo=datetime.timezone.utc)
    else:
        when = datetime.datetime.now(datetime.timezone.utc)

    try:
        analysis = await weather_service.fetch_weather_analysis(lat, lon, when)
    except (httpx.HTTPError, weather_service.WeatherError) as exc:
        raise HTTPException(status_code=502, detail=f"Weather provider failed: {exc}")

    return {
        "warning": warning,
        "requested": {"lat": lat, "lon": lon, "at": when.isoformat()},
        "weather": analysis.to_dict(),
        # Spec Rule 2: unusual conditions are supporting evidence, never proof
        # about a fire's cause.
        "interpretation": (
            "Temperature anomaly is supporting evidence of unusual local conditions. "
            "It is not proof of a fire, nor evidence about a fire's source."
        ),
    }


@router.get("/probe/fires")
async def probe_fires(
    day_range: Optional[int] = Query(None, ge=1, le=10),
    limit: int = Query(50, ge=1, le=1000),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Raw FIRMS detections across the configured AOI."""
    warning = require_admin(x_admin_token)
    try:
        detections = await firms_service.fetch_detections(day_range=day_range)
    except firms_service.FirmsError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    ranked = sorted(detections, key=lambda d: d.frp_mw, reverse=True)[:limit]
    return {
        "warning": warning,
        "aoi_bbox": settings.FIRMS_AOI_BBOX,
        "sources": settings.firms_sources,
        "day_range": day_range or settings.FIRMS_DAY_RANGE,
        "detections_found": len(detections),
        "detections_returned": len(ranked),
        "detections": [_detection_json(d) for d in ranked],
    }


@router.get("/probe")
async def probe_pipeline(
    limit: int = Query(3, ge=1, le=20, description="Hottest N detections to enrich"),
    day_range: Optional[int] = Query(None, ge=1, le=10),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """The Phase 1 milestone, end to end.

    FIRMS detection -> lat/lon/time -> weather -> previous six days ->
    baseline -> anomaly -> JSON. No database involved.

    Passing lat/lon synthesises a detection at that coordinate instead, so the
    weather half is demonstrable before a FIRMS MAP_KEY exists.
    """
    warning = require_admin(x_admin_token)
    now = datetime.datetime.now(datetime.timezone.utc)

    firms_error: Optional[str] = None
    if lat is not None and lon is not None:
        targets: List[Dict[str, Any]] = [
            {"latitude": lat, "longitude": lon, "acquisition_time": now, "synthetic": True}
        ]
    else:
        try:
            detections = await firms_service.fetch_detections(day_range=day_range)
            hottest = sorted(detections, key=lambda d: d.frp_mw, reverse=True)[:limit]
            targets = [{**_detection_json(d), "acquisition_time": d.acquisition_time} for d in hottest]
        except firms_service.FirmsError as exc:
            firms_error = str(exc)
            targets = []

    async with httpx.AsyncClient(
        timeout=30.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
    ) as client:
        analyses = await asyncio.gather(
            *[
                weather_service.fetch_weather_analysis(
                    t["latitude"], t["longitude"], t["acquisition_time"], client=client
                )
                for t in targets
            ],
            return_exceptions=True,
        )

    results = []
    for target, analysis in zip(targets, analyses):
        acquired = target.pop("acquisition_time")
        entry: Dict[str, Any] = {
            "detection": {**target, "acquisition_time": acquired.isoformat()},
        }
        if isinstance(analysis, Exception):
            entry["weather"] = None
            entry["weather_error"] = f"{type(analysis).__name__}: {analysis}"
        else:
            entry["weather"] = analysis.to_dict()
        results.append(entry)

    return {
        "warning": warning,
        "firms_error": firms_error,
        "generated_at": now.isoformat(),
        "events_analysed": len(results),
        "results": results,
        "interpretation": (
            "A FIRMS record is a satellite-detected thermal anomaly, not a confirmed fire. "
            "Weather anomalies are supporting evidence of unusual conditions only."
        ),
    }


def _detection_json(detection: firms_service.FireDetection) -> Dict[str, Any]:
    return {
        "latitude": detection.latitude,
        "longitude": detection.longitude,
        "acquisition_time": detection.acquisition_time.isoformat(),
        "satellite": detection.satellite,
        "instrument": detection.instrument,
        "source": detection.source,
        "frp_mw": detection.frp_mw,
        "brightness_k": detection.brightness_k,
        "confidence_raw": detection.confidence_raw,
        "confidence_pct": detection.confidence_pct,
        "day_night": detection.day_night,
    }


@router.post("/seed-facilities")
async def seed_facility_registry(
    db: AsyncSession = Depends(get_db),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Load the curated industrial asset registry. Idempotent (upsert)."""
    warning = require_admin(x_admin_token)
    count = await seed_facilities(db, FACILITIES_DB)
    return {"warning": warning, "facilities_seeded": count}


@router.post("/ingest")
async def ingest(
    day_range: Optional[int] = Query(None, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Fetch FIRMS detections and cluster them into fire events.

    Safe to run repeatedly: detections dedupe on their identity hash, so a
    second run over the same window inserts nothing and creates no events.
    """
    warning = require_admin(x_admin_token)
    started = datetime.datetime.now(datetime.timezone.utc)

    try:
        detections = await firms_service.fetch_detections(day_range=day_range)
    except firms_service.FirmsError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    result = await process_detections(db, detections)
    contained = await mark_stale_events_contained(db)

    return {
        "warning": warning,
        "started_at": started.isoformat(),
        "day_range": day_range or settings.FIRMS_DAY_RANGE,
        **result.as_dict(),
        "events_marked_contained": contained,
    }


@router.post("/analyze")
async def analyze_pending(
    limit: int = Query(5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    x_admin_token: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Drain pending events through OSM + weather enrichment.

    Highest-FRP first: Overpass is the bottleneck, so the strongest signals
    get enriched before an arbitrary slice of a large backlog.
    """
    warning = require_admin(x_admin_token)
    results = await drain_pending(db, limit=limit)
    return {"warning": warning, "analysed": len(results), "results": results}
