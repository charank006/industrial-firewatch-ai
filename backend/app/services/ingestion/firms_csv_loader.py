"""NASA FIRMS CSV Batch Ingestion Loader (Architecture Phase 3).

Ingests, validates, deduplicates, and clusters NASA FIRMS satellite observations
from CSV files (such as nasafirmdata.csv) into PostgreSQL / PostGIS, followed by
event association and 7-day persistence evaluation.

NASA FIRMS Type MUST NOT automatically become the final ML source label.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import datetime
import io
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.connection import get_sessionmaker
from app.models.models import FireDetection, FireEvent, FirePrediction
from app.services.classifier.feature_vector import build_feature_vector
from app.services.classifier.lightgbm_service import predict_thermal_source
from app.services.fire_event_service import process_detections
from app.services.firms_service import FireDetection as FirmsDetection
from app.services.persistence.persistence_service import evaluate_persistence
from ml.dataset_builder import (
    INDIA_MAX_LAT,
    INDIA_MAX_LON,
    INDIA_MIN_LAT,
    INDIA_MIN_LON,
    is_inside_india,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class CsvIngestStats:
    total_rows_processed: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    out_of_bounds_rows: int = 0
    duplicate_rows_ignored: int = 0
    inserted_observations: int = 0
    total_thermal_events: int = 0
    persistent_events_count: int = 0
    non_persistent_events_count: int = 0

    def print_summary(self):
        print("\n" + "=" * 65)
        print("          NASA FIRMS CSV INGESTION AUDIT REPORT (INDIA GEOFENCED)")
        print("=" * 65)
        print(f"Total Rows Processed:           {self.total_rows_processed:>8,}")
        print(f"Valid Rows Inside India:        {self.valid_rows:>8,}")
        print(f"Out-of-Bounds Rows Skipped:     {self.out_of_bounds_rows:>8,}")
        print(f"Malformed / Invalid Rows:       {self.invalid_rows:>8,}")
        print(f"Duplicate Observations Ignored: {self.duplicate_rows_ignored:>8,}")
        print(f"Inserted Observations:          {self.inserted_observations:>8,}")
        print(f"Number of Thermal Events:       {self.total_thermal_events:>8,}")
        print(f"Persistent Events (>=5/7d):     {self.persistent_events_count:>8,}")
        print(f"Non-Persistent Events (<5/7d):  {self.non_persistent_events_count:>8,}")
        print("=" * 65 + "\n")


def parse_csv_row(
    row: Dict[str, str], row_idx: int, india_only: bool = True
) -> Tuple[Optional[FirmsDetection], bool]:
    """Validate and parse a single FIRMS CSV row.
    Returns (detection, is_out_of_bounds).
    """
    try:
        lat_str = row.get("latitude") or row.get("LATITUDE") or row.get("lat") or ""
        lon_str = row.get("longitude") or row.get("LONGITUDE") or row.get("lon") or row.get("lng") or ""
        lat = float(lat_str)
        lon = float(lon_str)

        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            return None, False

        # Strict India Geofencing Filter
        if india_only and not is_inside_india(lat, lon):
            return None, True

        acq_date_str = row.get("acq_date") or row.get("ACQ_DATE") or row.get("date") or ""
        acq_time_str = (row.get("acq_time") or row.get("ACQ_TIME") or row.get("time") or "0000").zfill(4)

        if len(acq_time_str) >= 4:
            hour = int(acq_time_str[:2])
            minute = int(acq_time_str[2:4])
        else:
            hour, minute = 0, 0

        # Parse date
        if "-" in acq_date_str:
            parts = [int(p) for p in acq_date_str.split("-")]
            acq_dt = datetime.datetime(parts[0], parts[1], parts[2], hour, minute, tzinfo=datetime.timezone.utc)
        elif "/" in acq_date_str:
            parts = [int(p) for p in acq_date_str.split("/")]
            acq_dt = datetime.datetime(parts[2], parts[0], parts[1], hour, minute, tzinfo=datetime.timezone.utc)
        else:
            return None, False

        # FRP & Brightness values
        frp_str = row.get("frp") or row.get("FRP") or row.get("frp_mw") or "0.0"
        frp = max(0.0, float(frp_str))

        bright_ti4_str = row.get("bright_ti4") or row.get("brightness") or row.get("BRIGHT_TI4")
        bright_ti4 = float(bright_ti4_str) if bright_ti4_str else None

        bright_ti5_str = row.get("bright_ti5") or row.get("bright_t31") or row.get("BRIGHT_TI5")
        bright_ti5 = float(bright_ti5_str) if bright_ti5_str else None

        brightness_k = bright_ti4 or bright_ti5 or 300.0

        confidence_raw = row.get("confidence") or row.get("CONFIDENCE") or "n"
        if confidence_raw.isdigit():
            confidence_pct = min(100, max(0, int(confidence_raw)))
        elif confidence_raw.lower() == "h":
            confidence_pct = 90
        elif confidence_raw.lower() == "n":
            confidence_pct = 50
        elif confidence_raw.lower() == "l":
            confidence_pct = 20
        else:
            confidence_pct = 50

        satellite = row.get("satellite") or row.get("SATELLITE") or "N"
        instrument = row.get("instrument") or row.get("INSTRUMENT") or "VIIRS"
        source = f"{instrument}_{satellite}"

        scan = float(row.get("scan") or row.get("SCAN") or 0.4)
        track = float(row.get("track") or row.get("TRACK") or 0.4)
        day_night = (row.get("daynight") or row.get("DAYNIGHT") or row.get("day_night") or "D").upper()

        firms_type = row.get("type") or row.get("TYPE")

        det = FirmsDetection(
            latitude=lat,
            longitude=lon,
            acquisition_time=acq_dt,
            satellite=satellite,
            instrument=instrument,
            source=source,
            confidence_raw=confidence_raw,
            confidence_pct=confidence_pct,
            brightness_k=brightness_k,
            bright_ti4=bright_ti4,
            bright_ti5=bright_ti5,
            bright_t31=None,
            frp_mw=frp,
            scan=scan,
            track=track,
            day_night=day_night,
            raw={"firms_type": firms_type, "row_idx": row_idx},
        )
        return det, False
    except Exception:
        return None, False


async def ingest_firms_csv(
    csv_path: str,
    limit: Optional[int] = None,
    batch_size: int = 500,
    india_only: bool = True,
) -> CsvIngestStats:
    stats = CsvIngestStats()
    path = Path(csv_path)

    if not path.exists():
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    logger.info("Opening CSV dataset file: %s (India geofencing: %s)", csv_path, india_only)
    valid_detections: List[FirmsDetection] = []

    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            stats.total_rows_processed += 1
            det, is_out_of_bounds = parse_csv_row(row, idx, india_only=india_only)
            if det is not None:
                valid_detections.append(det)
                stats.valid_rows += 1
            elif is_out_of_bounds:
                stats.out_of_bounds_rows += 1
            else:
                stats.invalid_rows += 1

            if limit and stats.valid_rows >= limit:
                logger.info("Reached limit of %d valid rows", limit)
                break

    logger.info(
        "Parsed %d valid Indian observations out of %d total rows (%d out-of-bounds filtered)",
        len(valid_detections),
        stats.total_rows_processed,
        stats.out_of_bounds_rows,
    )

    # Sort valid detections in ascending acquisition time for deterministic clustering
    valid_detections.sort(key=lambda d: d.acquisition_time)

    sessionmaker = get_sessionmaker()

    # Process in batches
    for start in range(0, len(valid_detections), batch_size):
        batch = valid_detections[start : start + batch_size]
        async with sessionmaker() as db:
            result = await process_detections(db, batch)
            await db.commit()

            stats.inserted_observations += result.detections_inserted
            stats.duplicate_rows_ignored += (result.detections_fetched - result.detections_inserted)

    # Run 7-Day Persistence evaluation & ML classification across all created/updated events
    async with sessionmaker() as db:
        events = (await db.execute(select(FireEvent))).scalars().all()
        stats.total_thermal_events = len(events)

        for event in events:
            peval = await evaluate_persistence(db, event)
            if peval.is_persistent:
                stats.persistent_events_count += 1
            else:
                stats.non_persistent_events_count += 1
                # Attach ML prediction if not already classified
                existing_pred = (
                    await db.execute(
                        select(FirePrediction).where(FirePrediction.fire_event_id == event.id)
                    )
                ).scalar_one_or_none()
                if not existing_pred:
                    feat_dict = {
                        "latitude": event.latitude,
                        "longitude": event.longitude,
                        "frp_latest_mw": event.frp_latest_mw,
                        "frp_max_mw": event.frp_max_mw,
                        "frp_mean_mw": event.frp_mean_mw,
                        "brightness_k": event.brightness_k or 300.0,
                        "detection_confidence_pct": event.detection_confidence_pct or 50.0,
                        "detection_count": event.detection_count,
                        "day_night": event.day_night or "D",
                        "duration_hours": (
                            (event.last_detected - event.first_detected).total_seconds() / 3600.0
                            if event.first_detected and event.last_detected
                            else 0.0
                        ),
                    }
                    ml_pred = predict_thermal_source(feat_dict)
                    probs = ml_pred.probabilities
                    prediction_record = FirePrediction(
                        fire_event_id=event.id,
                        predicted_class=ml_pred.predicted_class,
                        confidence=ml_pred.predicted_probability,
                        confidence_pct=ml_pred.confidence_pct,
                        forest_probability=probs.get("forest_fire", 0.0),
                        agriculture_probability=probs.get("agricultural_burning", 0.0),
                        industrial_probability=probs.get("industrial_fire", 0.0),
                        gas_oil_probability=probs.get("gas_oil_flare", 0.0),
                        urban_probability=probs.get("urban_other", 0.0),
                        unknown_probability=probs.get("unknown", 0.0),
                        flare_probability=probs.get("gas_oil_flare", 0.0),
                        is_persistent=False,
                        active_days_7d=peval.active_days,
                        severity=ml_pred.severity,
                        model_version=ml_pred.model_version,
                        model_kind=ml_pred.model_kind,
                        data_quality=ml_pred.data_quality,
                        reasoning_steps=ml_pred.reasoning_steps,
                        feature_snapshot=feat_dict,
                        suggested_action=ml_pred.suggested_action,
                    )
                    db.add(prediction_record)

        await db.commit()

    stats.print_summary()
    return stats


def main():
    parser = argparse.ArgumentParser(description="NASA FIRMS CSV Batch Ingestion Loader (Strict India Geofencing)")
    parser.add_argument("--csv", required=True, help="Path to FIRMS or custom CSV file (e.g. data/raw/india_fires.csv)")
    parser.add_argument("--limit", type=int, default=2000, help="Maximum number of valid rows to ingest (default: 2000)")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for database transactions")
    parser.add_argument("--india-only", action="store_true", default=True, help="Strictly filter coordinates to India boundaries (default: True)")

    args = parser.parse_args()
    asyncio.run(ingest_firms_csv(args.csv, limit=args.limit, batch_size=args.batch_size, india_only=args.india_only))


if __name__ == "__main__":
    main()

