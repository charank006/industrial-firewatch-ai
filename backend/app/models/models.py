"""Spatial data model (spec sections 6 and 25).

Replaces the previous declarative sketch, which stored geography as plain
Float columns, declared no relationships or indexes, and was imported by zero
files while /api/system/status advertised "POSTGIS ST_DWITHIN ACTIVE".

Everything here hangs off the shared Base in app.database.connection so
Alembic autogenerate actually sees it.
"""

from __future__ import annotations

import datetime
import hashlib

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database.connection import Base


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def detection_identity(
    satellite: str, instrument: str, acquisition_time: datetime.datetime, lat: float, lon: float
) -> str:
    """Stable identity for one satellite observation of one pixel.

    FIRMS re-serves identical rows on every overlapping poll - roughly 96
    times a day at a 15 minute cadence with day_range=1. Hashing the identity
    into a single unique column keeps the dedup a plain ON CONFLICT DO NOTHING
    rather than a multi-column expression index that ON CONFLICT must then
    re-infer. Coordinates are rounded to 5dp (~1.1m), far finer than any
    sensor's geolocation accuracy.
    """
    raw = f"{satellite}|{instrument}|{acquisition_time.isoformat()}|{lat:.5f}|{lon:.5f}"
    return hashlib.sha256(raw.encode()).hexdigest()


class FireEvent(Base):
    """A physical fire, assembled from many detections (spec section 7)."""

    __tablename__ = "fire_events"

    id = Column(String, primary_key=True)
    first_detected = Column(DateTime(timezone=True), nullable=False)
    last_detected = Column(DateTime(timezone=True), nullable=False)
    # FRP-weighted centroid of all member detections. Moves as the event grows.
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geometry = Column(Geometry("POINT", srid=4326), nullable=False)

    # Position of the FIRST detection, never updated. The extent guard must be
    # measured from a fixed anchor: against the moving centroid a creeping
    # front drags the centroid along with it, the measured distance stays
    # small, and the guard can never fire - which is the exact runaway it
    # exists to prevent.
    origin_latitude = Column(Float, nullable=True)
    origin_longitude = Column(Float, nullable=True)

    status = Column(String, nullable=False, default="active")  # active | contained
    detection_count = Column(Integer, nullable=False, default=0)
    frp_max_mw = Column(Float, nullable=False, default=0.0)
    frp_mean_mw = Column(Float, nullable=False, default=0.0)
    frp_latest_mw = Column(Float, nullable=False, default=0.0)
    brightness_k = Column(Float, nullable=True)
    detection_confidence_pct = Column(SmallInteger, nullable=True)
    day_night = Column(String(1), nullable=True)

    # Set when a chaining guard trips, so lineage survives instead of being
    # lost when a spreading front is split into a new event.
    parent_event_id = Column(String, ForeignKey("fire_events.id"), nullable=True)

    # Exists from Phase 2 so Phase 4's out-of-band analysis worker has a column
    # to drain: pending | analyzing | complete | failed
    analysis_status = Column(String, nullable=False, default="pending")
    surroundings_status = Column(String, nullable=True)  # ok | sparse | unavailable

    location_name = Column(String, nullable=True)
    land_cover = Column(String, nullable=True)
    # Derived from the OSM enrichment, not a curated registry. There is no
    # stable id for an OSM way across edits, so the name is the identity and a
    # site can legitimately be unnamed.
    nearest_industrial_site = Column(String, nullable=True)
    nearest_industrial_type = Column(String, nullable=True)
    nearest_industrial_distance_m = Column(Float, nullable=True)
    inside_industrial_site = Column(Boolean, nullable=False, default=False)

    # 7-Day Persistence Engine fields
    is_persistent = Column(Boolean, nullable=False, default=False)
    active_days_7d = Column(SmallInteger, nullable=False, default=0)
    persistence_status = Column(String, nullable=True)  # persistent_thermal_source | episodic

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    detections = relationship(
        "FireDetection", back_populates="event", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_fire_events_last_detected", "last_detected"),
        # The event-linking query filters on both status and time before the
        # KNN ordering, so this composite carries it.
        Index("ix_fire_events_status_last_detected", "status", "last_detected"),
        Index("ix_fire_events_analysis_status", "analysis_status"),
        Index("ix_fire_events_is_persistent", "is_persistent"),
    )


class FireDetection(Base):
    """One satellite observation of one pixel (spec section 6)."""

    __tablename__ = "fire_detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fire_event_id = Column(String, ForeignKey("fire_events.id"), nullable=True, index=True)

    detection_key = Column(String(64), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geometry = Column(Geometry("POINT", srid=4326), nullable=False)
    acquisition_time = Column(DateTime(timezone=True), nullable=False)

    satellite = Column(String, nullable=False)
    instrument = Column(String, nullable=False)
    source = Column(String, nullable=False)

    # VIIRS emits categorical l|n|h, MODIS an integer 0-100. Both are kept:
    # the raw token so nothing is lost, the percentage so it is comparable.
    confidence_raw = Column(String, nullable=True)
    confidence_pct = Column(SmallInteger, nullable=True)

    # brightness_k unifies VIIRS bright_ti4 and MODIS brightness; the
    # sensor-specific channels are retained per spec section 25.
    brightness_k = Column(Float, nullable=True)
    bright_ti4 = Column(Float, nullable=True)
    bright_ti5 = Column(Float, nullable=True)
    bright_t31 = Column(Float, nullable=True)

    frp_mw = Column(Float, nullable=False, default=0.0)
    scan = Column(Float, nullable=True)
    track = Column(Float, nullable=True)
    day_night = Column(String(1), nullable=True)

    raw_data = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    event = relationship("FireEvent", back_populates="detections")

    __table_args__ = (
        UniqueConstraint("detection_key", name="uq_fire_detections_identity"),
        Index("ix_fire_detections_acquisition_time", "acquisition_time"),
    )


class WeatherObservation(Base):
    """Current conditions at a fire's coordinate and hour (spec section 25)."""

    __tablename__ = "weather_observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fire_event_id = Column(String, ForeignKey("fire_events.id"), nullable=False, index=True)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    local_hour = Column(String, nullable=False)
    timezone = Column(String, nullable=True)
    temperature_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    wind_speed_ms = Column(Float, nullable=True)
    wind_direction_deg = Column(Float, nullable=True)
    precipitation_mm = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class WeatherAnomalyRecord(Base):
    """Six-day baseline and derived anomalies (spec sections 9, 10, 25)."""

    __tablename__ = "weather_anomalies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fire_event_id = Column(String, ForeignKey("fire_events.id"), nullable=False, index=True)

    current_temperature_c = Column(Float, nullable=True)
    baseline_temperature_c = Column(Float, nullable=True)
    temperature_anomaly_c = Column(Float, nullable=True)
    temperature_anomaly_z = Column(Float, nullable=True)
    temperature_stdev_c = Column(Float, nullable=True)
    temperature_trend_c_per_day = Column(Float, nullable=True)

    current_humidity_pct = Column(Float, nullable=True)
    baseline_humidity_pct = Column(Float, nullable=True)
    humidity_anomaly_pct = Column(Float, nullable=True)

    wind_change_ms = Column(Float, nullable=True)
    precipitation_24h_mm = Column(Float, nullable=True)
    precipitation_72h_mm = Column(Float, nullable=True)
    dry_hours = Column(Integer, nullable=True)

    vpd_kpa = Column(Float, nullable=True)
    vpd_anomaly_kpa = Column(Float, nullable=True)

    baseline_samples = Column(SmallInteger, nullable=False, default=0)
    # ok | partial | insufficient - Phase 5 turns this into a confidence
    # penalty rather than letting a thin baseline pass as a real one.
    baseline_quality = Column(String, nullable=False, default="insufficient")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class OsmCache(Base):
    """Cached Overpass results (Phase 4).

    Keyed on coordinates rounded to 3dp (~110m) so several detections of one
    fire share an entry, sparing the public Overpass instances.
    """

    __tablename__ = "osm_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(String, nullable=False, unique=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_m = Column(Integer, nullable=False)
    features = Column(JSONB, nullable=True)
    raw_payload = Column(JSONB, nullable=True)
    element_count = Column(Integer, nullable=False, default=0)
    geometry_quality = Column(String, nullable=True)  # exact | approximate
    fetched_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SeedRun(Base):
    """Records each ingest so the UI can state how much history actually exists.

    Recurrence count is the strongest flare-vs-fire signal and starts at zero
    on day one: FIRMS day_range maxes at 10 and true archive access needs a
    manual request form. The dashboard must say "N in the last D days of
    system history" with a real D rather than implying 180.
    """

    __tablename__ = "ingest_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    day_range = Column(Integer, nullable=False, default=1)
    detections_fetched = Column(Integer, nullable=False, default=0)
    detections_inserted = Column(Integer, nullable=False, default=0)
    events_created = Column(Integer, nullable=False, default=0)
    events_updated = Column(Integer, nullable=False, default=0)
    ok = Column(Boolean, nullable=False, default=True)
    detail = Column(Text, nullable=True)


class FirePrediction(Base):
    """Classifier output per event (spec section 25).

    `feature_snapshot` is the highest-leverage column here: OSM and weather
    both drift, so without a stored snapshot Phase 8's trainer could never
    reconstruct the inputs a historical prediction was made from. With it,
    training is `SELECT feature_snapshot, label FROM ...`.
    """

    __tablename__ = "fire_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fire_event_id = Column(String, ForeignKey("fire_events.id"), nullable=False, index=True)

    predicted_class = Column(String, nullable=False)
    confidence = Column(Float, nullable=False, default=0.0)
    confidence_pct = Column(SmallInteger, nullable=False, default=0)

    # 6 Canonical ML Classes + backwards-compatibility flare
    forest_probability = Column(Float, nullable=False, default=0.0)
    agriculture_probability = Column(Float, nullable=False, default=0.0)
    industrial_probability = Column(Float, nullable=False, default=0.0)
    gas_oil_probability = Column(Float, nullable=False, default=0.0)
    urban_probability = Column(Float, nullable=False, default=0.0)
    unknown_probability = Column(Float, nullable=False, default=0.0)
    flare_probability = Column(Float, nullable=False, default=0.0)

    is_persistent = Column(Boolean, nullable=False, default=False)
    active_days_7d = Column(SmallInteger, nullable=False, default=0)

    severity = Column(String, nullable=False, default="MEDIUM")
    model_version = Column(String, nullable=False)
    model_kind = Column(String, nullable=False, default="lightgbm")
    data_quality = Column(Float, nullable=False, default=1.0)

    reasoning_steps = Column(JSONB, nullable=True)
    feature_snapshot = Column(JSONB, nullable=True)
    suggested_action = Column(Text, nullable=True)

    # Detection validity - a DIFFERENT question from source class. Kept in its
    # own columns so the two verdicts can never be conflated in a query.
    # REAL_FIRE | UNCERTAIN | LIKELY_FALSE_ALARM
    validity_verdict = Column(String, nullable=True)
    validity_p_real = Column(Float, nullable=True)
    validity_model_version = Column(String, nullable=True)
    validity_concerns = Column(JSONB, nullable=True)
    validity_steps = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ImpactAssessment(Base):
    """Risk, exposure and potential pollutants (spec sections 20-22, 25)."""

    __tablename__ = "impact_assessments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fire_event_id = Column(String, ForeignKey("fire_events.id"), nullable=False, index=True)

    risk_level = Column(String, nullable=False, default="MODERATE")
    core_radius_m = Column(Float, nullable=True)
    downwind_length_m = Column(Float, nullable=True)
    wind_speed_ms = Column(Float, nullable=True)
    wind_direction_deg = Column(Float, nullable=True)
    plume_bearing_deg = Column(Float, nullable=True)

    exposed = Column(JSONB, nullable=True)
    exposure_count = Column(Integer, nullable=False, default=0)
    # "Potential", never "confirmed released" (spec Rule 7).
    potential_pollutants = Column(JSONB, nullable=True)
    risk_zones = Column(JSONB, nullable=True)
    notes = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class GroundTruth(Base):
    """Independent verified ground-truth labels for ML training and evaluation."""

    __tablename__ = "ground_truth"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String, ForeignKey("fire_events.id"), nullable=False, index=True)
    label = Column(String, nullable=False)  # forest_fire | agricultural_burning | industrial_fire | gas_oil_flare | urban_other | unknown
    label_source = Column(String, nullable=False)  # fire_department_record | government_report | satellite_verified | modis_burned_area
    label_confidence = Column(Float, nullable=False, default=1.0)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

