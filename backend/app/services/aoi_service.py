"""Clip FIRMS detections to the real area of interest.

The FIRMS API only accepts a rectangle, and no rectangle matches a state
border. The Telangana box (77.2-81.4E, 15.8-19.95N) overlaps Chandrapur
district in Maharashtra, so roughly a fifth of ingested events were reported
as Telangana fires when they were not in Telangana at all.

The boundary is a stored asset rather than a live lookup: it changes on the
scale of years, and making every ingest depend on a third-party geocoder
would put a network hop in the hot path for no benefit.
"""

from __future__ import annotations

import functools
import json
import logging
from pathlib import Path
from typing import Optional

from shapely.geometry import Point, shape
from shapely.prepared import prep

from app.config import settings

logger = logging.getLogger(__name__)

AOI_DIR = Path(__file__).resolve().parent.parent / "data" / "aoi"


@functools.lru_cache(maxsize=4)
def load_boundary(name: str):
    """Load a named boundary, prepared for fast repeated containment tests.

    Returns None when no such boundary ships with the app, which is the
    normal case for an AOI that is only a rectangle — the caller then keeps
    every detection the FIRMS box returned.
    """
    path = AOI_DIR / f"{name}.geojson"
    if not path.exists():
        return None

    payload = json.loads(path.read_text())
    features = payload.get("features") or []
    if not features:
        logger.warning("Boundary %s has no features; clipping disabled", name)
        return None

    geometry = shape(features[0]["geometry"])
    # `prep` builds an index once; without it a 15,925-vertex polygon is
    # re-scanned per point, which is the whole ingest batch times that.
    return prep(geometry)


def active_boundary_name() -> Optional[str]:
    """The boundary to clip to, or None to keep the whole FIRMS rectangle."""
    name = (settings.AOI_BOUNDARY or "").strip()
    return name or None


def is_inside_aoi(latitude: float, longitude: float) -> bool:
    """True when the point is inside the configured boundary.

    True whenever no boundary is configured or the asset is missing: a
    detection is never dropped because a boundary failed to load.
    """
    name = active_boundary_name()
    if name is None:
        return True

    boundary = load_boundary(name)
    if boundary is None:
        return True

    return boundary.contains(Point(longitude, latitude))
