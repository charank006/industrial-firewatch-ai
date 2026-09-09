"""Enrich fire events with surroundings and weather.

Runs out of band. Overpass takes 2-20s and sometimes the full 60s timeout, so
doing this inside a request would make the dashboard feel broken.

Every enrichment degrades independently: a dead Overpass still lets weather
land, and vice versa. An event whose surroundings cannot be fetched is marked
`surroundings_status='unavailable'` and moves on, which is what stops one bad
Overpass day from stalling the whole pipeline.

No network call happens inside a write transaction. Each event moves through
three separate steps - claim (short write, committed), fetch (HTTP only, no
session), apply (short write, committed) - because Overpass can take a minute
per event and holding a row lock on `fire_events` for that long blocks every
other writer, including ingest. Committing per event also means a crash or an
interrupt costs one event's work rather than the whole batch.
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.connection import get_sessionmaker
from app.models.models import (
    FireEvent,
    FirePrediction,
    ImpactAssessment,
    OsmCache,
    WeatherAnomalyRecord,
    WeatherObservation,
)
from app.services import weather_service
from app.services.classifier.feature_vector import build_feature_vector
from app.services.classifier.scorer import classify, suggested_action
from app.services.classifier.validity import assess_validity
from app.services.impact_service import assess_impact
from app.services.classifier.lightgbm_service import predict_thermal_source
from app.services.osm import client as overpass
from app.services.osm.features import SurroundingsFeatures, extract_features
from app.services.persistence.persistence_service import evaluate_persistence

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


@dataclass
class Enrichment:
    """Everything the network can say about one event.

    Produced with no database session open, then applied in a short
    transaction. Keeping the two apart is the point: see the module docstring.
    """

    surroundings: Optional[SurroundingsFeatures] = None
    element_count: int = 0
    from_cache: bool = False
    surroundings_unavailable: bool = False
    weather: Optional[weather_service.WeatherAnalysis] = None
    errors: Dict[str, str] = field(default_factory=dict)


async def fetch_enrichment(
    latitude: float,
    longitude: float,
    detected_at: Optional[datetime.datetime],
    cached_surroundings: Optional[Dict[str, Any]] = None,
    radius_m: Optional[int] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Enrichment:
    """Every outbound HTTP call for one event, and nothing else.

    Takes no session on purpose - this is the slow part (Overpass alone can
    run to the full 60s timeout) and it must not run inside a transaction.
    """
    radius_m = radius_m or settings.OSM_ANALYSIS_RADIUS_M
    enrichment = Enrichment()

    if cached_surroundings is not None:
        enrichment.surroundings = SurroundingsFeatures(**cached_surroundings)
        enrichment.from_cache = True
    else:
        try:
            elements = await overpass.fetch_elements(
                latitude, longitude, radius_m, client=client
            )
            enrichment.surroundings = extract_features(
                elements, latitude, longitude, radius_m
            )
            enrichment.element_count = len(elements)
        except overpass.OverpassUnavailable as exc:
            # Circuit breaker open - expected on a bad Overpass day, not an error.
            logger.info("Surroundings unavailable at %.4f,%.4f: %s", latitude, longitude, exc)
            enrichment.surroundings_unavailable = True
            enrichment.errors["surroundings"] = str(exc)
        except overpass.OverpassError as exc:
            logger.warning("Overpass failed at %.4f,%.4f: %s", latitude, longitude, exc)
            enrichment.surroundings_unavailable = True
            enrichment.errors["surroundings"] = str(exc)

    try:
        enrichment.weather = await weather_service.fetch_weather_analysis(
            latitude, longitude, detected_at, client=client
        )
    except (httpx.HTTPError, weather_service.WeatherError) as exc:
        logger.warning("Weather failed at %.4f,%.4f: %s", latitude, longitude, exc)
        enrichment.errors["weather"] = f"{type(exc).__name__}: {exc}"

    return enrichment


def _apply_surroundings(event: FireEvent, features: SurroundingsFeatures) -> None:
    event.land_cover = features.land_cover
    if features.location_name:
        event.location_name = features.location_name

    # "Nearest industrial site" now comes from what OSM maps around this fire,
    # not from a curated registry. The registry could only ever describe the
    # region it was seeded for, and reported a plant 700 km away as "nearest"
    # for every fire outside it.
    nearest_site = features.industrial_sites[0] if features.industrial_sites else None
    event.nearest_industrial_site = nearest_site["name"] if nearest_site else None
    event.nearest_industrial_type = nearest_site["type"] if nearest_site else None
    event.nearest_industrial_distance_m = nearest_site["distance_m"] if nearest_site else None
    event.inside_industrial_site = bool(nearest_site and nearest_site["inside"])
    # Sparse coverage is reported, never silently treated as "nothing here"
    # (spec Rule 4). Phase 5 turns it into a confidence penalty.
    event.surroundings_status = features.osm_coverage


async def persist_weather(
    db: AsyncSession, event: FireEvent, analysis: weather_service.WeatherAnalysis
) -> None:
    """Write an already-fetched weather analysis. No network call here."""
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


async def classify_event(
    db: AsyncSession, event: FireEvent, surroundings_dict: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """Execute GeoFlare Workflow: 7-Day Persistence check followed by LightGBM.

    If the thermal source IS persistent (>= 5 active days / 7 within 500m):
        -> classify as "persistent_thermal_source"
        -> DO NOT call LightGBM
        -> DO NOT generate an ML source classification

    If the thermal source is NOT persistent:
        -> extract canonical ML features
        -> run LightGBM multiclass model (.predict_proba)
        -> calculate 6 source probabilities and select top category
        -> evaluate beta severity and alert triggers
    """
    # 1. 7-Day Persistence Check (BEFORE LightGBM)
    peval = await evaluate_persistence(db, event)

    features = await build_feature_vector(db, event, surroundings_dict)
    features["is_persistent"] = peval.is_persistent
    features["active_days_7d"] = peval.active_days

    # Validity assessment
    validity = assess_validity(features)
    features["validity_verdict"] = validity.verdict
    features["validity_p_real"] = round(validity.p_real, 4)

    await db.execute(
        text("DELETE FROM fire_predictions WHERE fire_event_id = :eid"), {"eid": event.id}
    )
    await db.execute(
        text("DELETE FROM impact_assessments WHERE fire_event_id = :eid"), {"eid": event.id}
    )

    if peval.is_persistent:
        # PERSISTENT THERMAL SOURCE: Skip LightGBM entirely
        logger.info(
            "Event %s: persistence=%d/7, persistent=true -> LightGBM skipped",
            event.id,
            peval.active_days,
        )
        action = (
            f"MONITORING: Persistent Thermal Source confirmed ({peval.active_days}/7 active days in past week within 500m). "
            "Consistent with permanent flare stack, kiln, or industrial furnace. Emergency dispatch suppressed."
        )
        reasoning_steps = [
            {
                "step_index": 1,
                "label": "7-Day Persistence Engine Check",
                "detail": peval.reason,
                "status": "warning",
            },
            {
                "step_index": 2,
                "label": "ML Classification Engine Status",
                "detail": "LightGBM source classifier skipped by architecture rule: source is a confirmed persistent thermal emitter.",
                "status": "passed",
            },
        ]

        prediction_record = FirePrediction(
            fire_event_id=event.id,
            predicted_class="persistent_thermal_source",
            confidence=1.0,
            confidence_pct=100,
            forest_probability=0.0,
            agriculture_probability=0.0,
            industrial_probability=0.0,
            gas_oil_probability=0.0,
            urban_probability=0.0,
            unknown_probability=0.0,
            flare_probability=1.0,
            is_persistent=True,
            active_days_7d=peval.active_days,
            severity="LOW",
            model_version="persistence_engine_v1",
            model_kind="persistence_pre_filter",
            data_quality=1.0,
            reasoning_steps=reasoning_steps,
            feature_snapshot=features,
            suggested_action=action,
            validity_verdict=validity.verdict,
            validity_p_real=validity.p_real,
            validity_model_version=validity.model_version,
            validity_concerns=validity.concerns,
            validity_steps=validity.reasoning_steps,
        )
        db.add(prediction_record)

        impact = assess_impact("flare", "LOW", features)
        db.add(
            ImpactAssessment(
                fire_event_id=event.id,
                risk_level="LOW",
                core_radius_m=impact["core_radius_m"],
                downwind_length_m=impact["downwind_length_m"],
                wind_speed_ms=impact["wind_speed_ms"],
                wind_direction_deg=impact["wind_direction_deg"],
                plume_bearing_deg=impact["plume_bearing_deg"],
                exposed=impact["exposed"],
                exposure_count=0,
                potential_pollutants=impact["potential_pollutants"],
                risk_zones=impact["risk_zones"],
                notes=["Persistent thermal source: standard emissions profile."],
            )
        )

        return {
            "prediction": prediction_record,
            "impact": impact,
            "features": features,
            "validity": validity,
            "is_persistent": True,
            "active_days": peval.active_days,
        }

    # NON-PERSISTENT SOURCE: Run LightGBM Multiclass Model
    logger.info(
        "Event %s: persistence=%d/7, persistent=false -> LightGBM executed",
        event.id,
        peval.active_days,
    )

    # Calculate initial impact for exposure count
    impact = assess_impact("industrial", "MEDIUM", features)
    exposure_count = impact.get("exposure_count", 0)

    # Execute LightGBM inference
    ml_result = predict_thermal_source(features, exposure_count=exposure_count)

    # Recompute impact with predicted class and severity
    impact = assess_impact(ml_result.predicted_class, ml_result.severity, features)

    probs = ml_result.probabilities
    prediction_record = FirePrediction(
        fire_event_id=event.id,
        predicted_class=ml_result.predicted_class,
        confidence=ml_result.predicted_probability,
        confidence_pct=ml_result.confidence_pct,
        forest_probability=probs.get("forest_fire", 0.0),
        agriculture_probability=probs.get("agricultural_burning", 0.0),
        industrial_probability=probs.get("industrial_fire", 0.0),
        gas_oil_probability=probs.get("gas_oil_flare", 0.0),
        urban_probability=probs.get("urban_other", 0.0),
        unknown_probability=probs.get("unknown", 0.0),
        flare_probability=probs.get("gas_oil_flare", 0.0),
        is_persistent=False,
        active_days_7d=peval.active_days,
        severity=ml_result.severity,
        model_version=ml_result.model_version,
        model_kind=ml_result.model_kind,
        data_quality=ml_result.data_quality,
        reasoning_steps=ml_result.reasoning_steps,
        feature_snapshot=features,
        suggested_action=ml_result.suggested_action,
        validity_verdict=validity.verdict,
        validity_p_real=validity.p_real,
        validity_model_version=validity.model_version,
        validity_concerns=validity.concerns,
        validity_steps=validity.reasoning_steps,
    )
    db.add(prediction_record)

    db.add(
        ImpactAssessment(
            fire_event_id=event.id,
            risk_level=impact["risk_level"],
            core_radius_m=impact["core_radius_m"],
            downwind_length_m=impact["downwind_length_m"],
            wind_speed_ms=impact["wind_speed_ms"],
            wind_direction_deg=impact["wind_direction_deg"],
            plume_bearing_deg=impact["plume_bearing_deg"],
            exposed=impact["exposed"],
            exposure_count=impact["exposure_count"],
            potential_pollutants=impact["potential_pollutants"],
            risk_zones=impact["risk_zones"],
            notes=impact["notes"],
        )
    )

    return {
        "prediction": prediction_record,
        "impact": impact,
        "features": features,
        "validity": validity,
        "is_persistent": False,
        "active_days": peval.active_days,
    }



async def apply_enrichment(
    db: AsyncSession, event: FireEvent, enrichment: Enrichment
) -> Dict[str, Any]:
    """Fold fetched data onto the event, classify it, and persist.

    Pure database work - the caller commits. Classification always runs, even
    with nothing enriched, because an honest low-confidence `unknown` is more
    useful than no answer at all.
    """
    radius_m = settings.OSM_ANALYSIS_RADIUS_M
    surroundings = enrichment.surroundings

    if surroundings is not None:
        if not enrichment.from_cache:
            await store_cached_surroundings(
                db,
                event.latitude,
                event.longitude,
                radius_m,
                surroundings,
                enrichment.element_count,
            )
        _apply_surroundings(event, surroundings)
    elif enrichment.surroundings_unavailable:
        event.surroundings_status = "unavailable"

    if enrichment.weather is not None:
        await persist_weather(db, event, enrichment.weather)

    outcome = await classify_event(
        db, event, surroundings.to_dict() if surroundings else None
    )
    prediction = outcome["prediction"]
    validity = outcome["validity"]

    event.analysis_status = "complete"
    await db.flush()

    return {
        "fire_event_id": event.id,
        "analysis_status": event.analysis_status,
        "surroundings_status": event.surroundings_status,
        "land_cover": event.land_cover,
        "location_name": event.location_name,
        "weather_baseline_quality": (
            enrichment.weather.baseline_quality if enrichment.weather else None
        ),
        "validity": validity.verdict,
        "validity_pct": validity.confidence_pct,
        "prediction": prediction.prediction,
        "label": prediction.label,
        "confidence_pct": prediction.confidence_pct,
        "severity": prediction.severity,
        "risk_level": outcome["impact"]["risk_level"],
        "model_version": prediction.model_version,
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


async def reclaim_stalled(stall_minutes: Optional[int] = None) -> int:
    """Return events stranded in 'analyzing' to the queue.

    A worker killed between claim and apply leaves its batch claimed forever,
    and nothing else drains that state - the events simply disappear from the
    pipeline. `updated_at` is stamped by the claim, so anything sitting in
    'analyzing' for longer than a batch could plausibly take was abandoned.
    """
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        minutes=stall_minutes or settings.ANALYSIS_STALL_MINUTES
    )
    async with get_sessionmaker()() as db:
        result = await db.execute(
            text(
                """
                UPDATE fire_events SET analysis_status = 'pending'
                 WHERE analysis_status = 'analyzing' AND updated_at < :cutoff
                RETURNING id
                """
            ),
            {"cutoff": cutoff},
        )
        stalled = [row[0] for row in result]
        await db.commit()

    if stalled:
        logger.warning("reclaimed %d event(s) stalled in analysis: %s", len(stalled), stalled)
    return len(stalled)


async def claim_pending(limit: int = 10) -> List[Dict[str, Any]]:
    """Take a batch and commit the claim before any network call.

    Returns plain dicts rather than ORM instances: the objects would outlive
    their session, and everything the fetch step needs is three scalars.
    """
    async with get_sessionmaker()() as db:
        events = await pending_events(db, limit)
        claimed = [
            {
                "id": event.id,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "last_detected": event.last_detected,
            }
            for event in events
        ]
        for event in events:
            event.analysis_status = "analyzing"
        await db.commit()
    return claimed


async def analyse_claimed(
    claim: Dict[str, Any], client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """Fetch and apply one already-claimed event, committing on its own.

    Three transactions, none of them spanning an HTTP call: read the OSM
    cache, fetch, then write.
    """
    radius_m = settings.OSM_ANALYSIS_RADIUS_M

    async with get_sessionmaker()() as db:
        cached = await load_cached_surroundings(
            db, claim["latitude"], claim["longitude"], radius_m
        )

    enrichment = await fetch_enrichment(
        claim["latitude"],
        claim["longitude"],
        claim["last_detected"],
        cached_surroundings=cached,
        radius_m=radius_m,
        client=client,
    )

    async with get_sessionmaker()() as db:
        event = await db.get(FireEvent, claim["id"])
        if event is None:
            # Deleted between claim and apply. Nothing to do, nothing broken.
            return {"fire_event_id": claim["id"], "analysis_status": "missing"}
        try:
            summary = await apply_enrichment(db, event, enrichment)
            await db.commit()
        except Exception:
            await db.rollback()
            # Leave it claimed rather than mid-flight; reclaim_stalled will
            # requeue it, and a failure that repeats is visible in the logs.
            logger.exception("analysis failed for %s", claim["id"])
            raise
    return summary


async def drain_pending(limit: int = 10) -> List[Dict[str, Any]]:
    """Analyse a batch of pending events, sharing one HTTP client.

    Owns its own sessions - a caller cannot hand one in, because the whole
    point is that no single transaction spans the batch.
    """
    await reclaim_stalled()

    claims = await claim_pending(limit)
    if not claims:
        return []

    results: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(
        timeout=settings.OVERPASS_TIMEOUT_S + 10,
        headers={"User-Agent": settings.HTTP_USER_AGENT},
    ) as client:
        for claim in claims:
            try:
                results.append(await analyse_claimed(claim, client=client))
            except Exception:  # noqa: BLE001 - one bad event must not end the batch
                continue
    return results
