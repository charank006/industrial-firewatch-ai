"""Health and system-status endpoints.

The previous `/api/system/status` reported "POSTGRESQL + POSTGIS READY" and
"ST_DWITHIN ACTIVE (SRID 4326)" as string literals - nothing was ever probed.
Every field here is now the result of an actual check, so SystemStatusPage
tells the truth about what is and isn't connected.
"""

import asyncio
import datetime
import time
from typing import Any, Dict

from fastapi import APIRouter

from app.config import settings
from app.database.connection import probe_postgis, probe_postgres

router = APIRouter(tags=["system"])

_STARTED_AT = time.monotonic()


def _probe_result(ok: bool, detail: str, latency_ms: float | None = None) -> Dict[str, Any]:
    return {
        "ok": ok,
        "detail": detail,
        "latency_ms": round(latency_ms, 1) if latency_ms is not None else None,
        "checked_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.get("/")
async def read_root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "demo_mode": settings.DEMO_MODE,
    }


@router.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": settings.VERSION,
        "uptime_s": round(time.monotonic() - _STARTED_AT, 1),
    }


@router.get("/api/system/status")
async def get_system_status():
    """Live probes of every dependency.

    Probes are added as their subsystems land:
      Phase 0b - postgres, postgis
      Phase 1  - firms, open_meteo
      Phase 4  - overpass
      Phase 5  - classifier
      Phase 7  - worker
    Until then a subsystem reports ok=False with an honest "not wired yet"
    detail rather than a reassuring literal.
    """
    checked_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pg, gis = await asyncio.gather(probe_postgres(), probe_postgis())

    probes: Dict[str, Dict[str, Any]] = {
        "postgres": {**pg, "checked_at": checked_at},
        "postgis": {**gis, "checked_at": checked_at},
        "firms": _probe_result(
            False,
            "MAP_KEY not configured" if not settings.NASA_FIRMS_MAP_KEY else "Not wired yet (Phase 1)",
        ),
        "open_meteo": _probe_result(False, "Not wired yet (Phase 1)"),
        "overpass": _probe_result(False, "Not wired yet (Phase 4)"),
        "classifier": _probe_result(False, "Not wired yet (Phase 5)"),
        "worker": _probe_result(False, "Not wired yet (Phase 7)"),
    }

    return {
        "status": "OPERATIONAL" if all(p["ok"] for p in probes.values()) else "DEGRADED",
        "demo_mode": settings.DEMO_MODE,
        "version": settings.VERSION,
        "probes": probes,
        # Echoed so MethodologyPage can render real thresholds instead of prose
        # that drifts out of sync with the engine.
        "thresholds": {
            "event_link_radius_m": settings.EVENT_LINK_RADIUS_M,
            "event_link_window_hours": settings.EVENT_LINK_WINDOW_HOURS,
            "exact_dup_radius_m": settings.EXACT_DUP_RADIUS_M,
            "max_event_extent_km": settings.MAX_EVENT_EXTENT_KM,
            "max_event_duration_hours": settings.MAX_EVENT_DURATION_HOURS,
            "osm_analysis_radius_m": settings.OSM_ANALYSIS_RADIUS_M,
            "weather_baseline_days": settings.WEATHER_BASELINE_DAYS,
            "weather_min_baseline_samples": settings.WEATHER_MIN_BASELINE_SAMPLES,
        },
        "aoi": {"bbox": settings.FIRMS_AOI_BBOX, "timezone": settings.AOI_TIMEZONE},
    }
