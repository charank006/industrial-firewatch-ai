"""Overpass API client (spec section 13).

Overpass is a free, shared, heavily loaded public service that will ban a
badly behaved client. Everything here exists to be a good citizen:

  - one in-flight request globally, ever (asyncio.Semaphore(1))
  - a minimum interval between calls
  - a real, identifying User-Agent
  - exponential backoff with jitter on 429/504
  - mirror rotation after repeated failures
  - a circuit breaker so one bad Overpass day degrades the pipeline instead of
    freezing the dashboard

Queries use `nwr` to collapse node/way/relation into one statement, and
`out tags geom` to inline way coordinates - which avoids the second
`>; out skel qt;` recursion round-trip entirely.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import random
import time
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# One in-flight Overpass request across the whole process.
_REQUEST_SEMAPHORE = asyncio.Semaphore(1)
_last_request_at: float = 0.0

# Circuit breaker state.
_consecutive_failures = 0
_MIRROR_ROTATE_AFTER = 2
_CIRCUIT_OPEN_AFTER = 6
_circuit_opened_at: Optional[float] = None
_CIRCUIT_RESET_SECONDS = 300.0


class OverpassError(RuntimeError):
    pass


class OverpassUnavailable(OverpassError):
    """The circuit is open; callers should degrade, not retry."""


def build_query(lat: float, lon: float, radius_m: int = 1000) -> str:
    """One query covering every category, plus place names for free."""
    r = int(radius_m)
    place_radius = max(r * 5, 5000)
    return f"""
[out:json][timeout:{settings.OVERPASS_TIMEOUT_S}];
(
  nwr(around:{r},{lat},{lon})["landuse"~"^(forest|farmland|orchard|vineyard|meadow|farmyard|greenhouse_horticulture|industrial|residential|commercial|retail|quarry|landfill|brownfield|reservoir|basin)$"];
  nwr(around:{r},{lat},{lon})["natural"~"^(wood|scrub|grassland|heath|wetland|water)$"];
  nwr(around:{r},{lat},{lon})["man_made"~"^(works|petroleum_well|storage_tank|gasometer|flare|chimney|pipeline)$"];
  nwr(around:{r},{lat},{lon})["industrial"];
  nwr(around:{r},{lat},{lon})["amenity"~"^(hospital|clinic|school|college|university|fuel|fire_station)$"];
  nwr(around:{r},{lat},{lon})["power"~"^(plant|substation|generator)$"];
  nwr(around:{r},{lat},{lon})["building"~"^(industrial|warehouse|factory|residential|house|apartments|commercial|hospital|school)$"];
  way(around:{r},{lat},{lon})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"];
  node(around:{place_radius},{lat},{lon})["place"~"^(city|town|village|suburb|hamlet|neighbourhood)$"];
);
out tags geom;
""".strip()


def _circuit_is_open() -> bool:
    global _circuit_opened_at, _consecutive_failures
    if _circuit_opened_at is None:
        return False
    if time.monotonic() - _circuit_opened_at > _CIRCUIT_RESET_SECONDS:
        logger.info("Overpass circuit breaker reset; retrying")
        _circuit_opened_at = None
        _consecutive_failures = 0
        return False
    return True


def _record_success() -> None:
    global _consecutive_failures, _circuit_opened_at
    _consecutive_failures = 0
    _circuit_opened_at = None


def _record_failure() -> None:
    global _consecutive_failures, _circuit_opened_at
    _consecutive_failures += 1
    if _consecutive_failures >= _CIRCUIT_OPEN_AFTER and _circuit_opened_at is None:
        _circuit_opened_at = time.monotonic()
        logger.warning(
            "Overpass circuit breaker opened after %d consecutive failures; "
            "surroundings will report 'unavailable' for %ds",
            _consecutive_failures,
            int(_CIRCUIT_RESET_SECONDS),
        )


def reset_circuit() -> None:
    """Test hook."""
    global _consecutive_failures, _circuit_opened_at, _last_request_at
    _consecutive_failures = 0
    _circuit_opened_at = None
    _last_request_at = 0.0


def _endpoint_for_attempt(attempt: int) -> str:
    mirrors = settings.overpass_urls
    return mirrors[(attempt // _MIRROR_ROTATE_AFTER) % len(mirrors)]


async def _respect_min_interval() -> None:
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    wait = settings.OVERPASS_MIN_INTERVAL_S - elapsed
    if wait > 0:
        await asyncio.sleep(wait)
    _last_request_at = time.monotonic()


async def fetch_elements(
    lat: float,
    lon: float,
    radius_m: int = 1000,
    max_attempts: int = 4,
    client: Optional[httpx.AsyncClient] = None,
) -> List[Dict[str, Any]]:
    """Fetch raw Overpass elements around a coordinate.

    Raises OverpassUnavailable when the circuit is open, so callers mark the
    event's surroundings unavailable and move on instead of stalling.
    """
    if _circuit_is_open():
        raise OverpassUnavailable("Overpass circuit breaker is open")

    query = build_query(lat, lon, radius_m)
    owns_client = client is None
    client = client or httpx.AsyncClient(
        timeout=settings.OVERPASS_TIMEOUT_S + 10,
        headers={"User-Agent": settings.HTTP_USER_AGENT},
    )

    try:
        last_error: Optional[Exception] = None
        for attempt in range(max_attempts):
            endpoint = _endpoint_for_attempt(attempt)
            try:
                async with _REQUEST_SEMAPHORE:
                    await _respect_min_interval()
                    response = await client.post(endpoint, data={"data": query})

                if response.status_code in (429, 504, 502, 503):
                    raise OverpassError(f"{endpoint} returned {response.status_code}")
                response.raise_for_status()

                payload = response.json()
                _record_success()
                return payload.get("elements") or []

            except (httpx.HTTPError, OverpassError, ValueError) as exc:
                last_error = exc
                # Exponential backoff with jitter; Overpass sheds load hard
                # under contention and hammering it makes that worse.
                delay = min(30.0, (2**attempt)) + random.uniform(0, 1.0)
                logger.warning(
                    "Overpass attempt %d/%d via %s failed: %s (retrying in %.1fs)",
                    attempt + 1, max_attempts, endpoint, exc, delay,
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(delay)

        _record_failure()
        raise OverpassError(f"All {max_attempts} Overpass attempts failed: {last_error}")
    finally:
        if owns_client:
            await client.aclose()


async def probe_overpass() -> Dict[str, Any]:
    """Report Overpass availability and free slots. Never raises."""
    started = time.perf_counter()
    if _circuit_is_open():
        return {
            "ok": False,
            "detail": "Circuit breaker open after repeated failures",
            "latency_ms": None,
        }
    try:
        endpoint = settings.overpass_urls[0].replace("/api/interpreter", "/api/status")
        async with httpx.AsyncClient(
            timeout=15.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
        ) as client:
            response = await client.get(endpoint)
            response.raise_for_status()
            text = response.text.strip().splitlines()
        summary = next(
            (line for line in text if "slots available" in line.lower()),
            text[0] if text else "reachable",
        )
        return {
            "ok": True,
            "detail": f"Overpass reachable - {summary[:110]}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "detail": f"{type(exc).__name__}: {str(exc)[:160]}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }


def cache_key(lat: float, lon: float, radius_m: int) -> str:
    """3dp is ~110m, tight enough that several detections of one fire share an
    entry while never merging genuinely different locations.

    Grid rounding is boundary-sensitive: two points a few metres apart can
    still land in adjacent cells. That is acceptable here because the worst
    outcome is a cache miss - one extra Overpass call - never incorrect data.
    """
    return f"{round(lat, 3)}:{round(lon, 3)}:{radius_m}"


def cache_is_fresh(fetched_at: Optional[datetime.datetime]) -> bool:
    if fetched_at is None:
        return False
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=datetime.timezone.utc)
    age = datetime.datetime.now(datetime.timezone.utc) - fetched_at
    return age.days < settings.OVERPASS_CACHE_TTL_DAYS
