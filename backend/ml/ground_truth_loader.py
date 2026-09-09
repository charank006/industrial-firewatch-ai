"""Independent Ground Truth Ingestion & Schema Management (Architecture Phase 6).

NASA FIRMS raw thermal anomaly data does not directly provide final ground truth source classes.
Ground truth must be independently verified from external sources:
- Government incident reports
- Fire department response records
- Industrial facility logs
- Verified news/incident records
- Known gas flare databases
- Burned-area satellite validation

This loader validates, stores, and associates independent ground-truth labels with thermal events.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import datetime
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_sessionmaker
from app.models.models import FireEvent, GroundTruth
from ml.feature_schema import CANONICAL_CLASSES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def ingest_ground_truth_csv(csv_path: str) -> Dict[str, Any]:
    """Ingest independent ground truth CSV records into ground_truth table.

    Expected CSV columns:
    event_id, label, label_source, label_confidence, verified_at, notes
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Ground truth CSV not found: {csv_path}")

    valid_rows: List[Dict[str, Any]] = []
    invalid_rows = 0

    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            event_id = row.get("event_id") or row.get("id")
            label = (row.get("label") or "").strip().lower()
            label_source = row.get("label_source") or "manual_verification"
            conf_str = row.get("label_confidence") or "1.0"
            verified_at_str = row.get("verified_at")
            notes = row.get("notes") or ""

            if not event_id or label not in CANONICAL_CLASSES:
                invalid_rows += 1
                continue

            try:
                confidence = float(conf_str)
            except ValueError:
                confidence = 1.0

            verified_at = None
            if verified_at_str:
                try:
                    verified_at = datetime.datetime.fromisoformat(verified_at_str)
                except Exception:
                    pass

            valid_rows.append({
                "event_id": event_id,
                "label": label,
                "label_source": label_source,
                "label_confidence": confidence,
                "verified_at": verified_at or datetime.datetime.now(datetime.timezone.utc),
                "notes": notes,
            })

    sessionmaker = get_sessionmaker()
    inserted_count = 0

    async with sessionmaker() as db:
        for item in valid_rows:
            # Check if event exists
            event = await db.get(FireEvent, item["event_id"])
            if event is None:
                logger.warning("Event %s not found in database; storing label reference", item["event_id"])

            gt = GroundTruth(
                event_id=item["event_id"],
                label=item["label"],
                label_source=item["label_source"],
                label_confidence=item["label_confidence"],
                verified_at=item["verified_at"],
                notes=item["notes"],
            )
            db.add(gt)
            inserted_count += 1
        await db.commit()

    logger.info("Ingested %d ground truth records (%d invalid skipped)", inserted_count, invalid_rows)
    return {
        "inserted_count": inserted_count,
        "invalid_count": invalid_rows,
        "total_rows": inserted_count + invalid_rows,
    }


def main():
    parser = argparse.ArgumentParser(description="GeoFlare Ground Truth CSV Ingestion Loader")
    parser.add_argument("--csv", required=True, help="Path to ground truth CSV file")
    args = parser.parse_args()
    asyncio.run(ingest_ground_truth_csv(args.csv))


if __name__ == "__main__":
    main()
