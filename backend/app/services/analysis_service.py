"""Enrich fire events with surroundings and weather.

Runs out of band. Overpass takes 2-20s and sometimes the full 60s timeout, so
doing this inside a request would make the dashboard feel broken.

Every enrichment degrades independently: a dead Overpass still lets weather
land, and vice versa. An event whose surroundings cannot be fetched is marked
`surroundings_status='unavailable'` and moves on, which is what stops one bad
Overpass day from stalling the whole pipeline.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import (
    FireEvent,
    OsmCache,
    WeatherAnomalyRecord,
    WeatherObservation,
)
from app.services import weather_service
from app.services.osm import client as overpass
from app.services.osm.features import SurroundingsFeatures, extract_features

logger = logging.getLogger(__name__)


async def load_cached_surroundings(
    db: AsyncSession, lat: float, lon: float, radius_m: int
) -> Optional[Dict[str, Any]]:
    key = overpass.cache_key(lat, lon, radius_m)
    row = (await db.execute(select(OsmCache).where(OsmCache.cache_key == key))).scalar_one_or_none()
    if row is None or not overpass.cache_is_fresh(row.fetched_at):
        return None
    return row.features


async def store_cached_surroundings(
    db: AsyncSession,
    lat: float,
    lon: float,
    radius_m: int,
    features: SurroundingsFeatures,
    element_count: int,
) -> None:
    key = overpass.cache_key(lat, lon, radius_m)
    payload = {
        "cache_key": key,
        "latitude": lat,
        "longitude": lon,
        "radius_m": radius_m,
        "features": features.to_dict(),
        "element_count": element_count,
        "geometry_quality": features.geometry_quality,
        "fetched_at": datetime.datetime.now(datetime.timezone.utc),
    }
    statement = pg_insert(OsmCache).values(payload)
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=[OsmCache.cache_key],
            set_={k: statement.excluded[k] for k in payload if k != "cache_key"},
        )
    )


async def analyse_surroundings(
    db: AsyncSession,
    event: FireEvent,
    radius_m: Optional[int] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Optional[SurroundingsFeatures]:
    """Fetch (or reuse) the 1km OSM context and fold it onto the event."""
    radius_m = radius_m or settings.OSM_ANALYSIS_RADIUS_M

    cached = await load_cached_surroundings(db, event.latitude, event.longitude, radius_m)
    if cached is not None:
        features = SurroundingsFeatures(**cached)
        _apply_surroundings(event, features)
        return features

    try:
        elements = await overpass.fetch_elements(
            event.latitude, event.longitude, radius_m, client=client
        )
    except overpass.OverpassUnavailable as exc:
        logger.info("Surroundings unavailable for %s: %s", event.id, exc)
        event.surroundings_status = "unavailable"
        return None
    except overpass.OverpassError as exc:
        logger.warning("Overpass failed for %s: %s", event.id, exc)
        event.surroundings_status = "unavailable"
        return None

    features = extract_features(elements, event.latitude, event.longitude, radius_m)
    await store_cached_surroundings(
        db, event.latitude, event.longitude, radius_m, features, len(elements)
    )
    _apply_surroundings(event, features)
    return features


def _apply_surroundings(event: FireEvent, features: SurroundingsFeatures) -> None:
    event.land_cover = features.land_cover
    if features.location_name:
        event.location_name = features.location_name
    # Sparse coverage is reported, never silently treated as "nothing here"
    # (spec Rule 4). Phase 5 turns it into a confidence penalty.
    event.surroundings_status = features.osm_coverage


async def analyse_weather(
    db: AsyncSession, event: FireEvent, client: Optional[httpx.AsyncClient] = None
) -> Optional[weather_service.WeatherAnalysis]:
    """Attach current conditions and the six-day baseline to an event."""
    try:
        analysis = await weather_service.fetch_weather_analysis(
            event.latitude, event.longitude, event.last_detected, client=client
        )
    except (httpx.HTTPError, weather_service.WeatherError) as exc:
        logger.warning("Weather failed for %s: %s", event.id, exc)
        return None

    # One observation and one anomaly row per event; re-analysis replaces them.
    await db.execute(
        text("DELETE FROM weather_observations WHERE fire_event_id = :eid"), {"eid": event.id}
    )
    await db.execute(
        text("DELETE FROM weather_anomalies WHERE fire_event_id = :eid"), {"eid": event.id}
    )

    db.add(
        WeatherObservation(
            fire_event_id=event.id,
            observed_at=event.last_detected,
            local_hour=analysis.local_hour,
            timezone=analysis.timezone,
            temperature_c=analysis.current_temperature_c,
            humidity_pct=analysis.current_humidity_pct,
            wind_speed_ms=analysis.current_wind_speed_ms,
            wind_direction_deg=analysis.current_wind_direction_deg,
            precipitation_mm=analysis.current_precipitation_mm,
        )
    )
    db.add(
        WeatherAnomalyRecord(
            fire_event_id=event.id,
            current_temperature_c=analysis.current_temperature_c,
            baseline_temperature_c=analysis.six_day_avg_temperature_c,
            temperature_anomaly_c=analysis.temperature_anomaly_c,
            temperature_anomaly_z=analysis.temperature_anomaly_z,
            temperature_stdev_c=analysis.temperature_stdev_c,
            temperature_trend_c_per_day=analysis.temperature_trend_c_per_day,
            current_humidity_pct=analysis.current_humidity_pct,
            baseline_humidity_pct=analysis.six_day_avg_humidity_pct,
            humidity_anomaly_pct=analysis.humidity_anomaly_pct,
            wind_change_ms=analysis.wind_change_ms,
            precipitation_24h_mm=analysis.precipitation_24h_mm,
            precipitation_72h_mm=analysis.precipitation_72h_mm,
            dry_hours=analysis.dry_hours,
            vpd_kpa=analysis.vpd_kpa,
            vpd_anomaly_kpa=analysis.vpd_anomaly_kpa,
            baseline_samples=analysis.baseline_samples,
            baseline_quality=analysis.baseline_quality,
        )
    )
    return analysis


async def analyse_event(
    db: AsyncSession, event: FireEvent, client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """Run the full enrichment for one event.

    Each half degrades on its own; the event only fails outright if both do.
    """
    event.analysis_status = "analyzing"
    await db.flush()

    surroundings = await analyse_surroundings(db, event, client=client)
    weather = await analyse_weather(db, event, client=client)

    event.analysis_status = "complete" if (surroundings or weather) else "failed"
    await db.flush()

    return {
        "fire_event_id": event.id,
        "analysis_status": event.analysis_status,
        "surroundings_status": event.surroundings_status,
        "land_cover": event.land_cover,
        "location_name": event.location_name,
        "weather_baseline_quality": weather.baseline_quality if weather else None,
    }


async def pending_events(db: AsyncSession, limit: int = 10) -> List[FireEvent]:
    """Highest-FRP unanalysed events first.

    Overpass is the bottleneck, so the strongest signals are enriched first
    rather than processing an arbitrary slice of a large backlog.
    """
    result = await db.execute(
        select(FireEvent)
        .where(FireEvent.analysis_status == "pending")
        .order_by(FireEvent.frp_max_mw.desc())
        .limit(limit)
    )
    return list(result.scalars())


async def drain_pending(db: AsyncSession, limit: int = 10) -> List[Dict[str, Any]]:
    """Analyse a batch of pending events, sharing one HTTP client."""
    events = await pending_events(db, limit)
    if not events:
        return []

    results = []
    async with httpx.AsyncClient(
        timeout=settings.OVERPASS_TIMEOUT_S + 10,
        headers={"User-Agent": settings.HTTP_USER_AGENT},
    ) as client:
        for event in events:
            results.append(await analyse_event(db, event, client=client))
    return results
