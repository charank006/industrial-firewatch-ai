"""Assemble one flat feature vector per fire event (spec sections 11, 15).

NASA + weather + OSM + temporal, reduced to a single dict of scalars. This is
what the scorer consumes, what gets persisted as `feature_snapshot`, and what
Phase 8's trainer will read.

Persisting the snapshot is the highest-leverage decision here: OSM and weather
both drift, so without it, ML training would start from an empty dataset with
no way to reconstruct the inputs a historical prediction was made from.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import FireEvent, WeatherAnomalyRecord


async def neighbour_event_count(
    db: AsyncSession, event: FireEvent, radius_km: float = 10.0, hours: int = 24
) -> int:
    """Other events burning nearby at the same time.

    Stubble burning is gregarious - a district lights up at once - so this is
    a cheap, strong discriminator for agricultural fires.
    """
    window = datetime.timedelta(hours=hours)
    result = await db.execute(
        text(
            """
            SELECT COUNT(*) FROM fire_events
            WHERE id <> :event_id
              AND ST_DWithin(
                    geometry::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :radius_m)
              AND last_detected BETWEEN :start AND :end
            """
        ),
        {
            "event_id": event.id,
            "lon": event.longitude,
            "lat": event.latitude,
            "radius_m": radius_km * 1000.0,
            "start": event.last_detected - window,
            "end": event.last_detected + window,
        },
    )
    return int(result.scalar_one())


async def site_median_frp(
    db: AsyncSession, event: FireEvent, radius_m: float = 1000.0
) -> Optional[float]:
    """Median FRP previously observed at this location.

    The flare-vs-fire discriminator is stability against the SITE'S OWN
    history, not an absolute megawatt threshold.
    """
    result = await db.execute(
        text(
            """
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.frp_mw)
            FROM fire_detections d
            WHERE d.fire_event_id <> :event_id
              AND ST_DWithin(
                    d.geometry::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :radius_m)
            """
        ),
        {
            "event_id": event.id,
            "lon": event.longitude,
            "lat": event.latitude,
            "radius_m": radius_m,
        },
    )
    value = result.scalar_one_or_none()
    return float(value) if value is not None else None


async def recurrence_count(
    db: AsyncSession, event: FireEvent, radius_m: float = 1000.0
) -> int:
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
        {"event_id": event.id, "lon": event.longitude, "lat": event.latitude, "radius_m": radius_m},
    )
    return int(result.scalar_one())


async def history_days(db: AsyncSession) -> int:
    earliest = (
        await db.execute(text("SELECT MIN(acquisition_time) FROM fire_detections"))
    ).scalar_one_or_none()
    if earliest is None:
        return 0
    if earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=datetime.timezone.utc)
    return max(0, (datetime.datetime.now(datetime.timezone.utc) - earliest).days)


async def build_feature_vector(
    db: AsyncSession,
    event: FireEvent,
    surroundings: Optional[Dict[str, Any]] = None,
    land_cover: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """One flat, ML-shaped dict combining every evidence source."""
    weather = (
        await db.execute(
            select(WeatherAnomalyRecord)
            .where(WeatherAnomalyRecord.fire_event_id == event.id)
            .order_by(WeatherAnomalyRecord.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    duration = (
        (event.last_detected - event.first_detected).total_seconds() / 3600.0
        if event.first_detected and event.last_detected
        else 0.0
    )

    # Sensor-level fields the validity model needs: the I4/I5 channel pair is
    # the core fire signature, and scan angle governs how much to trust the
    # pixel at all.
    sensor = (
        await db.execute(
            text(
                """
                SELECT bright_ti4, bright_ti5, bright_t31, scan, track, instrument, satellite,
                       (SELECT COUNT(DISTINCT satellite) FROM fire_detections
                         WHERE fire_event_id = :eid) AS distinct_sensors
                FROM fire_detections
                WHERE fire_event_id = :eid
                ORDER BY acquisition_time DESC, id DESC
                LIMIT 1
                """
            ),
            {"eid": event.id},
        )
    ).mappings().first()

    features: Dict[str, Any] = {
        # --- identity -----------------------------------------------------
        "fire_event_id": event.id,
        "latitude": event.latitude,
        "longitude": event.longitude,
        # --- NASA ---------------------------------------------------------
        "frp_latest_mw": event.frp_latest_mw,
        "frp_max_mw": event.frp_max_mw,
        "frp_mean_mw": event.frp_mean_mw,
        "brightness_k": event.brightness_k,
        "detection_confidence_pct": event.detection_confidence_pct,
        "day_night": event.day_night,
        "detection_count": event.detection_count,
        # --- sensor geometry / channels (validity model) -------------------
        "bright_ti4": sensor["bright_ti4"] if sensor else None,
        "bright_ti5": sensor["bright_ti5"] if sensor else None,
        "bright_t31": sensor["bright_t31"] if sensor else None,
        "scan": sensor["scan"] if sensor else None,
        "instrument": sensor["instrument"] if sensor else None,
        "satellite": sensor["satellite"] if sensor else None,
        "distinct_sensors": sensor["distinct_sensors"] if sensor else 1,
        # --- temporal -----------------------------------------------------
        "duration_hours": round(duration, 2),
        "recurrence_count": await recurrence_count(db, event),
        # None, not 0.0: "no other detection within 1 km" is not the same as
        # "this site normally runs at zero megawatts", and the risk engine
        # treats the two very differently.
        "site_median_frp_mw": await site_median_frp(db, event),
        "neighbour_events_10km_24h": await neighbour_event_count(db, event),
        "history_days": await history_days(db),
        # --- OSM (nullable end to end; Overpass may be unavailable) --------
        "radius_km": 1.0,
        "industrial_area_km2": 0.0,
        "industrial_fraction": 0.0,
        "forest_area_km2": 0.0,
        "forest_fraction": 0.0,
        "farmland_area_km2": 0.0,
        "farmland_fraction": 0.0,
        "residential_area_km2": 0.0,
        "residential_fraction": 0.0,
        "scrub_grass_fraction": 0.0,
        "water_area_km2": 0.0,
        "factories_within_1km": 0,
        "gas_facilities_within_1km": 0,
        "power_infra_within_1km": 0,
        "building_count": 0,
        "hospitals": 0,
        "schools": 0,
        "fire_stations": 0,
        "road_length_km": 0.0,
        "nearest_factory_m": None,
        "nearest_gas_facility_m": None,
        "nearest_residential_m": None,
        "nearest_forest_m": None,
        "nearest_farmland_m": None,
        "inside_industrial": False,
        "inside_forest": False,
        "inside_farmland": False,
        "inside_residential": False,
        "land_cover": event.land_cover or "Unclassified",
        "osm_coverage": event.surroundings_status or "sparse",
        "osm_element_count": 0,
        # --- weather ------------------------------------------------------
        "current_temperature_c": None,
        "baseline_temperature_c": None,
        "temperature_anomaly_c": None,
        "temperature_anomaly_z": None,
        "current_humidity_pct": None,
        "humidity_anomaly_pct": None,
        "wind_speed_ms": None,
        "wind_direction_deg": None,
        "precipitation_24h_mm": None,
        "dry_hours": None,
        "vpd_kpa": None,
        "vpd_anomaly_kpa": None,
        "weather_baseline_quality": None,
        "weather_baseline_samples": 0,
        "mines_within_1km": 0,
        "nearest_mine_m": None,
        "builtup_fraction": 0.0,
        "land_cover_source": None,
    }

    if surroundings:
        for key in (
            "industrial_area_km2", "industrial_fraction", "forest_area_km2", "forest_fraction",
            "farmland_area_km2", "farmland_fraction", "residential_area_km2",
            "residential_fraction", "water_area_km2", "factories_within_1km",
            "gas_facilities_within_1km", "power_infra_within_1km", "building_count",
            "mines_within_1km", "nearest_mine_m",
            "hospitals", "schools", "fire_stations", "road_length_km", "nearest_factory_m",
            "nearest_gas_facility_m", "nearest_residential_m", "nearest_forest_m",
            "nearest_farmland_m", "inside_industrial", "inside_forest", "inside_farmland",
            "inside_residential", "land_cover", "osm_coverage", "osm_element_count",
            # Named hospitals/schools/fire stations with distances. Carried so
            # the impact view can name real facilities instead of inventing
            # contacts; the scorer ignores it.
            "emergency_facilities", "industrial_sites",
        ):
            if key in surroundings:
                features[key] = surroundings[key]
        scrub = surroundings.get("scrub_grass_area_km2")
        if scrub is not None:
            features["scrub_grass_fraction"] = min(1.0, scrub / 3.14159)

    # --- ESA WorldCover ---------------------------------------------------
    # Takes precedence over OSM for physical ground cover. OSM records what
    # someone chose to map, and across this AOI that is usually nothing: the
    # fractions above are 0.0 for most events not because the land is bare
    # but because no polygon exists. The raster measures every 10 m pixel.
    #
    # It does NOT take over industrial/gas/factory evidence: "Built-up" covers
    # a refinery and an apartment block alike, and only OSM tags separate
    # them.
    if land_cover:
        fr = land_cover.get("fractions") or {}
        disc_km2 = 3.14159 * (float(land_cover.get("radius_m", 1000)) / 1000.0) ** 2

        tree = (fr.get("tree_cover") or 0.0) + (fr.get("mangroves") or 0.0)
        crop = fr.get("cropland") or 0.0
        water = (fr.get("water") or 0.0) + (fr.get("herbaceous_wetland") or 0.0)
        scrub_grass = (
            (fr.get("shrubland") or 0.0)
            + (fr.get("grassland") or 0.0)
            + (fr.get("bare_sparse") or 0.0)
        )
        built = fr.get("built_up") or 0.0

        features.update({
            "forest_fraction": round(tree, 4),
            "forest_area_km2": round(tree * disc_km2, 4),
            "farmland_fraction": round(crop, 4),
            "farmland_area_km2": round(crop * disc_km2, 4),
            "scrub_grass_fraction": round(scrub_grass, 4),
            "water_area_km2": round(water * disc_km2, 4),
            # New: WorldCover is the only source that measures built-up cover
            # everywhere. The urban class had nothing but sparse OSM
            # residential polygons to work with.
            "builtup_fraction": round(built, 4),
            "land_cover_source": land_cover.get("source"),
            "land_cover_dominant": land_cover.get("dominant"),
            "land_cover_pixels": land_cover.get("pixel_count"),
        })
        if land_cover.get("label") and land_cover["label"] != "Unclassified":
            features["land_cover"] = land_cover["label"]

    if weather is not None:
        features.update(
            {
                "current_temperature_c": weather.current_temperature_c,
                "baseline_temperature_c": weather.baseline_temperature_c,
                "temperature_anomaly_c": weather.temperature_anomaly_c,
                "temperature_anomaly_z": weather.temperature_anomaly_z,
                "current_humidity_pct": weather.current_humidity_pct,
                "humidity_anomaly_pct": weather.humidity_anomaly_pct,
                "precipitation_24h_mm": weather.precipitation_24h_mm,
                "dry_hours": weather.dry_hours,
                "vpd_kpa": weather.vpd_kpa,
                "vpd_anomaly_kpa": weather.vpd_anomaly_kpa,
                "weather_baseline_quality": weather.baseline_quality,
                "weather_baseline_samples": weather.baseline_samples,
            }
        )

    observation = (
        await db.execute(
            text(
                "SELECT wind_speed_ms, wind_direction_deg FROM weather_observations "
                "WHERE fire_event_id = :eid ORDER BY id DESC LIMIT 1"
            ),
            {"eid": event.id},
        )
    ).mappings().first()
    if observation:
        features["wind_speed_ms"] = observation["wind_speed_ms"]
        features["wind_direction_deg"] = observation["wind_direction_deg"]

    return features
