"""NASA FIRMS active-fire detection ingestion.

    GET {base}/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}[/{START}]

Scientific framing (spec Rule 1): a FIRMS detection is a satellite-observed
thermal anomaly, not a confirmed accidental fire. Nothing here should be
presented to a user as proof of a fire.

Four properties of the real API drive most of this module:

1. `confidence` is a different TYPE per sensor - VIIRS emits categorical
   l|n|h, MODIS an integer 0-100. `int(row["confidence"])` crashes on VIIRS.
2. `acq_time` is HHMM and loses its leading zero the moment anything treats
   it as an int ("0130" -> "130").
3. Errors are returned as HTTP 200 with a plain-text body (e.g.
   "Invalid MAP_KEY"), so status codes alone never reveal failure.
4. The brightness column is named `bright_ti4` on VIIRS and `brightness` on
   MODIS, so a single unified value has to be derived.
"""

from __future__ import annotations

import csv
import datetime
import io
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# VIIRS categorical confidence -> percentage. FIRMS documents these as
# low / nominal / high; the numbers are a documented convention of ours, and
# the raw token is always preserved alongside so nothing is lost.
_VIIRS_CONFIDENCE_PCT = {"l": 20, "n": 60, "h": 90}

_REQUIRED_COLUMNS = {"latitude", "longitude", "acq_date", "acq_time", "frp"}


class FirmsError(RuntimeError):
    """FIRMS returned something that is not a detection CSV."""


@dataclass(frozen=True)
class FireDetection:
    latitude: float
    longitude: float
    acquisition_time: datetime.datetime  # tz-aware UTC
    satellite: str
    instrument: str
    source: str
    confidence_raw: str
    confidence_pct: int
    frp_mw: float
    brightness_k: Optional[float]
    bright_ti4: Optional[float] = None
    bright_ti5: Optional[float] = None
    bright_t31: Optional[float] = None
    scan: Optional[float] = None
    track: Optional[float] = None
    day_night: str = "D"
    raw: Dict[str, Any] = field(default_factory=dict, compare=False)

    @property
    def dedup_key(self) -> Tuple[str, str, str, float, float]:
        """Matches the DB unique constraint added in Phase 2.

        FIRMS re-serves identical rows on every overlapping poll - at a 15 min
        cadence with day_range=1 each detection comes back ~96 times - so this
        is what keeps detection_count and recurrence_count honest.
        """
        return (
            self.satellite,
            self.instrument,
            self.acquisition_time.isoformat(),
            round(self.latitude, 5),
            round(self.longitude, 5),
        )


def _to_float(value: Any) -> Optional[float]:
    try:
        text = str(value).strip()
        return float(text) if text else None
    except (TypeError, ValueError):
        return None


def normalise_confidence(raw: Any, instrument: str = "") -> Tuple[str, int]:
    """Return (raw token, 0-100 percentage) across both sensor conventions."""
    token = str(raw).strip()
    if not token:
        return "", 0

    lowered = token.lower()
    if lowered in _VIIRS_CONFIDENCE_PCT:
        return token, _VIIRS_CONFIDENCE_PCT[lowered]

    numeric = _to_float(token)
    if numeric is None:
        logger.warning("Unrecognised FIRMS confidence %r (instrument=%s)", raw, instrument)
        return token, 0
    return token, max(0, min(100, int(round(numeric))))


def parse_acquisition_time(acq_date: str, acq_time: Any) -> datetime.datetime:
    """Combine FIRMS acq_date + acq_time (both UTC) into a tz-aware datetime.

    acq_time is HHMM; zero-padding is essential because "0130" arrives as
    "130" from anything that has round-tripped it through an int.
    """
    padded = str(acq_time).strip().zfill(4)
    if len(padded) != 4 or not padded.isdigit():
        raise FirmsError(f"Unparseable acq_time {acq_time!r}")

    hour, minute = int(padded[:2]), int(padded[2:])
    if hour > 23 or minute > 59:
        raise FirmsError(f"Out-of-range acq_time {acq_time!r}")

    try:
        day = datetime.date.fromisoformat(str(acq_date).strip())
    except ValueError as exc:
        raise FirmsError(f"Unparseable acq_date {acq_date!r}") from exc

    return datetime.datetime(
        day.year, day.month, day.day, hour, minute, tzinfo=datetime.timezone.utc
    )


def parse_firms_csv(body: str, source: str) -> List[FireDetection]:
    """Parse a FIRMS area CSV response.

    Raises FirmsError when the body is an error message rather than a CSV,
    which FIRMS delivers with a 200 status.
    """
    stripped = body.strip()
    if not stripped:
        return []

    first_line = stripped.splitlines()[0]
    if not _REQUIRED_COLUMNS.issubset({c.strip().lower() for c in first_line.split(",")}):
        raise FirmsError(f"FIRMS did not return a detection CSV: {stripped[:200]!r}")

    detections: List[FireDetection] = []
    for row in csv.DictReader(io.StringIO(stripped)):
        lat, lon = _to_float(row.get("latitude")), _to_float(row.get("longitude"))
        if lat is None or lon is None:
            continue

        instrument = (row.get("instrument") or "").strip()
        confidence_raw, confidence_pct = normalise_confidence(row.get("confidence"), instrument)

        bright_ti4 = _to_float(row.get("bright_ti4"))
        bright_ti5 = _to_float(row.get("bright_ti5"))
        bright_t31 = _to_float(row.get("bright_t31"))
        modis_brightness = _to_float(row.get("brightness"))
        # VIIRS reports bright_ti4, MODIS reports brightness. Unify so the
        # dashboard's single brightnessK field has one well-defined source.
        brightness_k = bright_ti4 if bright_ti4 is not None else modis_brightness

        try:
            acquired = parse_acquisition_time(row.get("acq_date", ""), row.get("acq_time", ""))
        except FirmsError as exc:
            logger.warning("Skipping FIRMS row with bad timestamp: %s", exc)
            continue

        detections.append(
            FireDetection(
                latitude=lat,
                longitude=lon,
                acquisition_time=acquired,
                satellite=(row.get("satellite") or "").strip(),
                instrument=instrument,
                source=source,
                confidence_raw=confidence_raw,
                confidence_pct=confidence_pct,
                frp_mw=_to_float(row.get("frp")) or 0.0,
                brightness_k=brightness_k,
                bright_ti4=bright_ti4,
                bright_ti5=bright_ti5,
                bright_t31=bright_t31,
                scan=_to_float(row.get("scan")),
                track=_to_float(row.get("track")),
                day_night=(row.get("daynight") or "D").strip().upper()[:1] or "D",
                raw=dict(row),
            )
        )

    return detections


def deduplicate(detections: Iterable[FireDetection]) -> List[FireDetection]:
    """Collapse identical rows across overlapping polls and merged sources.

    Where the same pixel appears twice, the higher-FRP row wins.
    """
    best: Dict[Tuple[str, str, str, float, float], FireDetection] = {}
    for det in detections:
        existing = best.get(det.dedup_key)
        if existing is None or det.frp_mw > existing.frp_mw:
            best[det.dedup_key] = det
    return sorted(best.values(), key=lambda d: d.acquisition_time)


def build_area_url(source: str, bbox: Sequence[float], day_range: int, map_key: str) -> str:
    west, south, east, north = bbox
    return (
        f"{settings.FIRMS_BASE_URL}/api/area/csv/{map_key}/{source}/"
        f"{west},{south},{east},{north}/{day_range}"
    )


async def fetch_source(
    client: httpx.AsyncClient,
    source: str,
    bbox: Sequence[float],
    day_range: int,
    map_key: str,
) -> List[FireDetection]:
    url = build_area_url(source, bbox, day_range, map_key)
    response = await client.get(url)
    response.raise_for_status()
    return parse_firms_csv(response.text, source)


async def fetch_detections(
    bbox: Optional[Sequence[float]] = None,
    day_range: Optional[int] = None,
    sources: Optional[Sequence[str]] = None,
    map_key: Optional[str] = None,
) -> List[FireDetection]:
    """Fetch and merge detections across every configured platform.

    Multiple platforms matter: they give enough overpasses per day to build an
    FRP time series, which is what makes a routine flare distinguishable from
    an industrial fire at all.
    """
    key = map_key if map_key is not None else settings.NASA_FIRMS_MAP_KEY
    if not key:
        raise FirmsError(
            "NASA_FIRMS_MAP_KEY is not configured. Request a free key at "
            "https://firms.modaps.eosdis.nasa.gov/api/map_key/ and set it in backend/.env"
        )

    bbox = tuple(bbox) if bbox is not None else settings.aoi_bbox
    day_range = day_range if day_range is not None else settings.FIRMS_DAY_RANGE
    sources = list(sources) if sources is not None else settings.firms_sources

    collected: List[FireDetection] = []
    async with httpx.AsyncClient(
        timeout=60.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
    ) as client:
        for source in sources:
            try:
                found = await fetch_source(client, source, bbox, day_range, key)
                logger.info("FIRMS %s returned %d detections", source, len(found))
                collected.extend(found)
            except (httpx.HTTPError, FirmsError) as exc:
                # One dead platform must not lose the others.
                logger.warning("FIRMS source %s failed: %s", source, exc)

    return deduplicate(collected)


async def probe_map_key(map_key: Optional[str] = None) -> Dict[str, Any]:
    """Check key validity and remaining quota. Never raises."""
    import time

    key = map_key if map_key is not None else settings.NASA_FIRMS_MAP_KEY
    if not key:
        return {"ok": False, "detail": "MAP_KEY not configured", "latency_ms": None}

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=15.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
        ) as client:
            response = await client.get(
                f"{settings.FIRMS_BASE_URL}/mapserver/mapkey_status/",
                params={"MAP_KEY": key},
            )
            response.raise_for_status()
            payload = response.json()

        elapsed = (time.perf_counter() - started) * 1000
        used = payload.get("current_transactions")
        limit = payload.get("transaction_limit")
        if used is None and limit is None:
            return {"ok": False, "detail": f"Unexpected response: {str(payload)[:120]}", "latency_ms": elapsed}
        return {
            "ok": True,
            "detail": f"MAP_KEY valid - {used}/{limit} transactions used",
            "latency_ms": elapsed,
        }
    except Exception as exc:  # noqa: BLE001 - a probe reports, never propagates
        return {
            "ok": False,
            "detail": f"{type(exc).__name__}: {str(exc)[:160]}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
