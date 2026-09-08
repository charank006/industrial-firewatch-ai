"""Fire event engine (spec section 7).

NASA detects the same fire many times. Treating every detection as a new fire
would make the dashboard's counts meaningless, so detections are clustered
into events on a spatial and temporal rule.

Three properties matter more than the clustering itself:

**Idempotency.** Detections are always processed in ascending acquisition
time. Out-of-order insertion makes the +/- time-window test behave differently
on replay, and replay happens on every backfill.

**Chaining guards.** A naive "within 1km of last_detected" rule lets a
spreading front walk an event across a whole district, one link at a time,
forever. Distance from the first-detected centroid and total duration are both
capped; beyond either, a new event opens carrying parent_event_id so the
lineage survives.

**Metre-accurate spatial predicates.** ST_DWithin is called on ::geography.
On raw SRID-4326 geometry the radius argument would be interpreted as degrees,
roughly 111x wrong, and would silently link unrelated fires.
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import Facility, FireDetection, FireEvent, detection_identity
from app.services.firms_service import FireDetection as FirmsDetection

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    detections_fetched: int = 0
    detections_inserted: int = 0
    events_created: int = 0
    events_updated: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {
            "detections_fetched": self.detections_fetched,
            "detections_inserted": self.detections_inserted,
            "events_created": self.events_created,
            "events_updated": self.events_updated,
        }


def _point_wkt(lon: float, lat: float) -> str:
    """PostGIS expects longitude first."""
    return f"SRID=4326;POINT({lon} {lat})"


async def next_event_id(session: AsyncSession) -> str:
    value = (await session.execute(text("SELECT nextval('fire_event_id_seq')"))).scalar_one()
    return f"FE-{int(value):06d}"


async def insert_detections(
    session: AsyncSession, detections: Sequence[FirmsDetection]
) -> List[FireDetection]:
    """Insert with ON CONFLICT DO NOTHING, returning only genuinely new rows.

    This is what keeps detection_count and recurrence_count honest: FIRMS
    re-serves identical rows on every overlapping poll, so without it those
    counts inflate by two orders of magnitude and the Routine Flare rule
    (which keys on recurrence) fires on everything.
    """
    if not detections:
        return []

    rows = [
        {
            "detection_key": detection_identity(
                d.satellite, d.instrument, d.acquisition_time, d.latitude, d.longitude
            ),
            "latitude": d.latitude,
            "longitude": d.longitude,
            "geometry": _point_wkt(d.longitude, d.latitude),
            "acquisition_time": d.acquisition_time,
            "satellite": d.satellite,
            "instrument": d.instrument,
            "source": d.source,
            "confidence_raw": d.confidence_raw,
            "confidence_pct": d.confidence_pct,
            "brightness_k": d.brightness_k,
            "bright_ti4": d.bright_ti4,
            "bright_ti5": d.bright_ti5,
            "bright_t31": d.bright_t31,
            "frp_mw": d.frp_mw,
            "scan": d.scan,
            "track": d.track,
            "day_night": d.day_night,
            "raw_data": d.raw,
        }
        for d in detections
    ]

    statement = (
        pg_insert(FireDetection)
        .values(rows)
        .on_conflict_do_nothing(constraint="uq_fire_detections_identity")
        .returning(FireDetection.id)
    )
    inserted_ids = list((await session.execute(statement)).scalars())
    if not inserted_ids:
        return []

    # Ascending acquisition time: replay must produce identical events.
    result = await session.execute(
        select(FireDetection)
        .where(FireDetection.id.in_(inserted_ids))
        .order_by(FireDetection.acquisition_time.asc(), FireDetection.id.asc())
    )
    return list(result.scalars())


async def find_linkable_event(
    session: AsyncSession, detection: FireDetection
) -> Optional[FireEvent]:
    """Nearest active event with a member detection inside the link radius.

    Single-linkage against member DETECTIONS, not against the event centroid.
    The centroid is FRP-weighted and moves as an event grows, so measuring
    against it shrinks the effective link radius with every detection and
    fragments a real spreading fire into dozens of events. Runaway chaining is
    prevented by the extent and duration guards instead, which is what they
    are for.

    Nearest, not first: `<->` on plain geometry so the GIST index orders the
    candidates, while ST_DWithin runs on ::geography for true metres.
    """
    window = datetime.timedelta(hours=settings.EVENT_LINK_WINDOW_HOURS)
    query = text(
        """
        SELECT d.fire_event_id
        FROM fire_detections d
        JOIN fire_events e ON e.id = d.fire_event_id
        WHERE e.status = 'active'
          AND ST_DWithin(
                d.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                :radius_m)
          AND d.acquisition_time BETWEEN :window_start AND :window_end
        ORDER BY d.geometry <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
        LIMIT 1
        """
    )
    event_id = (
        await session.execute(
            query,
            {
                "lon": detection.longitude,
                "lat": detection.latitude,
                "radius_m": settings.EVENT_LINK_RADIUS_M,
                "window_start": detection.acquisition_time - window,
                "window_end": detection.acquisition_time + window,
            },
        )
    ).scalar_one_or_none()

    if event_id is None:
        return None
    return await session.get(FireEvent, event_id)


async def violates_chaining_guards(
    session: AsyncSession, event: FireEvent, detection: FireDetection
) -> Optional[str]:
    """Return a reason string when linking would over-extend the event."""
    duration = detection.acquisition_time - event.first_detected
    if duration > datetime.timedelta(hours=settings.MAX_EVENT_DURATION_HOURS):
        return (
            f"duration {duration.total_seconds() / 3600:.1f}h exceeds "
            f"{settings.MAX_EVENT_DURATION_HOURS}h"
        )

    # Measured from the event's fixed origin, never its centroid: a creeping
    # front drags the centroid with it, so a centroid-relative distance stays
    # small forever and the guard would never fire.
    origin_lat = event.origin_latitude if event.origin_latitude is not None else event.latitude
    origin_lon = event.origin_longitude if event.origin_longitude is not None else event.longitude

    distance_m = (
        await session.execute(
            text(
                """
                SELECT ST_Distance(
                    ST_SetSRID(ST_MakePoint(:elon, :elat), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(:dlon, :dlat), 4326)::geography)
                """
            ),
            {
                "elon": origin_lon,
                "elat": origin_lat,
                "dlon": detection.longitude,
                "dlat": detection.latitude,
            },
        )
    ).scalar_one()

    if distance_m > settings.MAX_EVENT_EXTENT_KM * 1000.0:
        return f"extent {distance_m / 1000:.1f}km exceeds {settings.MAX_EVENT_EXTENT_KM}km"
    return None


async def _recompute_event_aggregates(session: AsyncSession, event: FireEvent) -> None:
    """Refresh FRP statistics and the FRP-weighted centroid.

    ST_Centroid is unweighted, so a scatter of weak pixels would drag the
    event's position away from the actual fire. Weighting by FRP keeps it on
    the radiatively dominant part of the burn.
    """
    row = (
        await session.execute(
            text(
                """
                SELECT
                    COUNT(*)                                   AS detection_count,
                    MIN(acquisition_time)                      AS first_detected,
                    MAX(acquisition_time)                      AS last_detected,
                    MAX(frp_mw)                                AS frp_max,
                    AVG(frp_mw)                                AS frp_mean,
                    SUM(latitude  * GREATEST(frp_mw, 0.001))
                        / SUM(GREATEST(frp_mw, 0.001))         AS weighted_lat,
                    SUM(longitude * GREATEST(frp_mw, 0.001))
                        / SUM(GREATEST(frp_mw, 0.001))         AS weighted_lon
                FROM fire_detections
                WHERE fire_event_id = :event_id
                """
            ),
            {"event_id": event.id},
        )
    ).mappings().one()

    latest = (
        await session.execute(
            text(
                """
                SELECT frp_mw, brightness_k, confidence_pct, day_night
                FROM fire_detections
                WHERE fire_event_id = :event_id
                ORDER BY acquisition_time DESC, id DESC
                LIMIT 1
                """
            ),
            {"event_id": event.id},
        )
    ).mappings().one()

    event.detection_count = int(row["detection_count"])
    event.first_detected = row["first_detected"]
    event.last_detected = row["last_detected"]
    event.frp_max_mw = float(row["frp_max"] or 0.0)
    event.frp_mean_mw = round(float(row["frp_mean"] or 0.0), 3)
    event.frp_latest_mw = float(latest["frp_mw"] or 0.0)
    event.brightness_k = latest["brightness_k"]
    event.detection_confidence_pct = latest["confidence_pct"]
    event.day_night = latest["day_night"]
    event.latitude = round(float(row["weighted_lat"]), 6)
    event.longitude = round(float(row["weighted_lon"]), 6)
    event.geometry = _point_wkt(event.longitude, event.latitude)
    # New evidence invalidates any completed analysis.
    event.analysis_status = "pending"


async def attach_nearest_facility(session: AsyncSession, event: FireEvent) -> None:
    """KNN lookup against the curated registry."""
    row = (
        await session.execute(
            text(
                """
                SELECT id,
                       ST_Distance(
                           geometry::geography,
                           ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) AS distance_m
                FROM facilities
                ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                LIMIT 1
                """
            ),
            {"lon": event.longitude, "lat": event.latitude},
        )
    ).mappings().first()

    # A hit beyond FACILITY_ATTACH_MAX_KM is not a neighbour, and reporting it
    # as one makes the dashboard read as though an unrelated plant were
    # implicated. Leave the event unassigned instead.
    if row and float(row["distance_m"]) <= settings.FACILITY_ATTACH_MAX_KM * 1000:
        event.nearest_facility_id = row["id"]
        event.nearest_facility_distance_m = round(float(row["distance_m"]), 1)
    else:
        event.nearest_facility_id = None
        event.nearest_facility_distance_m = None


async def process_detections(
    session: AsyncSession, detections: Sequence[FirmsDetection]
) -> IngestResult:
    """Insert detections, then link each into a new or existing fire event."""
    result = IngestResult(detections_fetched=len(detections))
    new_detections = await insert_detections(session, detections)
    result.detections_inserted = len(new_detections)

    touched: Dict[str, FireEvent] = {}

    for detection in new_detections:
        event = await find_linkable_event(session, detection)
        parent_id: Optional[str] = None

        if event is not None:
            reason = await violates_chaining_guards(session, event, detection)
            if reason:
                logger.info(
                    "Detection %s not linked to %s (%s); opening a child event",
                    detection.id,
                    event.id,
                    reason,
                )
                parent_id, event = event.id, None

        if event is None:
            event = FireEvent(
                id=await next_event_id(session),
                first_detected=detection.acquisition_time,
                last_detected=detection.acquisition_time,
                latitude=detection.latitude,
                longitude=detection.longitude,
                geometry=_point_wkt(detection.longitude, detection.latitude),
                origin_latitude=detection.latitude,
                origin_longitude=detection.longitude,
                status="active",
                parent_event_id=parent_id,
                analysis_status="pending",
            )
            session.add(event)
            await session.flush()
            result.events_created += 1
        elif event.id not in touched:
            result.events_updated += 1

        detection.fire_event_id = event.id
        await session.flush()
        touched[event.id] = event

    for event in touched.values():
        await _recompute_event_aggregates(session, event)
        await attach_nearest_facility(session, event)

    await session.flush()
    return result


async def seed_facilities(session: AsyncSession, facilities: Iterable[Dict[str, Any]]) -> int:
    """Upsert the curated asset registry. Idempotent."""
    count = 0
    for item in facilities:
        payload = {
            **{k: v for k, v in item.items() if k not in {"lat", "lng", "last_detected"}},
            "latitude": item["lat"],
            "longitude": item["lng"],
            "geometry": _point_wkt(item["lng"], item["lat"]),
        }
        if item.get("last_detected"):
            payload["last_detected"] = datetime.datetime.fromisoformat(
                item["last_detected"].replace("Z", "+00:00")
            )

        statement = pg_insert(Facility).values(payload)
        statement = statement.on_conflict_do_update(
            index_elements=[Facility.id],
            set_={k: statement.excluded[k] for k in payload if k != "id"},
        )
        await session.execute(statement)
        count += 1
    return count


async def mark_stale_events_contained(session: AsyncSession) -> int:
    """Close events with no new detection for a day."""
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)
    updated = await session.execute(
        text(
            """
            UPDATE fire_events SET status = 'contained', updated_at = now()
            WHERE status = 'active' AND last_detected < :cutoff
            """
        ),
        {"cutoff": cutoff},
    )
    return updated.rowcount or 0
