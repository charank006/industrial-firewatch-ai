"""GeoFlare 7-Day Persistence Engine (Architecture Phase 5).

Determines whether a thermal source is persistent using previous 7 days of observations.
The 7-day persistence check happens BEFORE LightGBM.

If persistent (>= 5 active days / 7 within 500m):
    -> classify as "persistent_thermal_source"
    -> display as "Persistent Thermal Source" on frontend
    -> DO NOT send to LightGBM
    -> DO NOT generate an ML source classification for it

If non-persistent (< 5 active days / 7):
    -> extract canonical ML features
    -> pass to LightGBM
    -> obtain 6 class probabilities
    -> select most probable source
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import FireEvent

logger = logging.getLogger(__name__)


@dataclass
class PersistenceEvaluation:
    event_id: str
    active_days: int
    total_days: int = 7
    threshold: int = 5
    radius_meters: float = 500.0
    is_persistent: bool = False
    status_label: str = "episodic"
    classification: str = "episodic_fire"
    distinct_dates: List[str] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "active_days": self.active_days,
            "total_days": self.total_days,
            "threshold": self.threshold,
            "radius_meters": self.radius_meters,
            "is_persistent": self.is_persistent,
            "status_label": self.status_label,
            "classification": self.classification,
            "distinct_dates": self.distinct_dates,
            "reason": self.reason,
        }


async def evaluate_persistence(
    db: AsyncSession,
    event: FireEvent,
    days: Optional[int] = None,
    radius_meters: Optional[float] = None,
    threshold: Optional[int] = None,
) -> PersistenceEvaluation:
    """Evaluate 7-day persistence for a thermal event.

    Counts DISTINCT active calendar days with thermal observations within
    the spatial radius over the preceding 7-day window.
    """
    days = days or settings.PERSISTENCE_DAYS
    radius_m = radius_meters or settings.PERSISTENCE_RADIUS_METERS
    threshold = threshold or settings.PERSISTENCE_THRESHOLD

    end_time = event.last_detected or datetime.datetime.now(datetime.timezone.utc)
    start_time = end_time - datetime.timedelta(days=days)

    query = text(
        """
        SELECT DISTINCT DATE(d.acquisition_time AT TIME ZONE 'UTC') AS active_date
        FROM fire_detections d
        WHERE ST_DWithin(
                d.geometry::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                :radius_m)
          AND d.acquisition_time >= :start_time
          AND d.acquisition_time <= :end_time
        ORDER BY active_date ASC
        """
    )

    result = await db.execute(
        query,
        {
            "lon": event.longitude,
            "lat": event.latitude,
            "radius_m": radius_m,
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    distinct_dates = [row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]) for row in result.all()]
    active_days = len(distinct_dates)
    is_persistent = active_days >= threshold

    status_label = "persistent_thermal_source" if is_persistent else "episodic"
    classification = "persistent_thermal_source" if is_persistent else "episodic_fire"

    if is_persistent:
        reason = (
            f"Thermal source active on {active_days}/{days} distinct days in past {days} days "
            f"within {radius_m:.0f}m (threshold >= {threshold}). Confirmed Persistent Thermal Source."
        )
        logger.info(
            "Event %s: active_days=%d/%d, persistent=true, LightGBM skipped",
            event.id,
            active_days,
            days,
        )
    else:
        reason = (
            f"Thermal source active on {active_days}/{days} distinct days in past {days} days "
            f"within {radius_m:.0f}m (threshold >= {threshold}). Non-persistent episodic source; LightGBM classification required."
        )
        logger.info(
            "Event %s: active_days=%d/%d, persistent=false, LightGBM executed",
            event.id,
            active_days,
            days,
        )

    # Update event record
    event.is_persistent = is_persistent
    event.active_days_7d = active_days
    event.persistence_status = status_label

    return PersistenceEvaluation(
        event_id=event.id,
        active_days=active_days,
        total_days=days,
        threshold=threshold,
        radius_meters=radius_m,
        is_persistent=is_persistent,
        status_label=status_label,
        classification=classification,
        distinct_dates=distinct_dates,
        reason=reason,
    )
