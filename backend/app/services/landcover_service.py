"""ESA WorldCover land cover at a fire's location.

OpenStreetMap answers "what has someone mapped here", and across rural
Telangana the answer is usually nothing: 18 of 27 events classified as
Unknown Anomaly with every land-use area at 0.0, because OSM has no polygons
there. Waiting for OSM will not fix that - the whole AOI has roughly 6,400
`landuse=farmland` ways across ~190,000 km2, so a random fire pixel almost
never lands near one.

WorldCover answers "what is physically on the ground", from satellite, for
every 10 m pixel on Earth. There are no coverage gaps.

The two are complementary, not competing, and are used for different things:

  WorldCover -> forest, agriculture, urban, water   (physical surface)
  OpenStreetMap -> industrial, gas/oil, flare       (human land USE)

WorldCover cannot separate a refinery from an apartment block; both are
"Built-up". OSM tags can, when they exist. So the raster supplies the
vegetation and water evidence that OSM keeps missing, and OSM keeps the
industrial evidence the raster cannot provide.

Reads are windowed range requests against the public COG on S3 - roughly a
second for the ~1 km disc we need, rather than the 111 MB the whole 3-degree
tile would cost.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import math
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# GDAL settings for reading a remote COG efficiently. Without these it lists
# the whole bucket prefix on open, which is slow and pointless here.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
os.environ.setdefault("VSI_CACHE", "TRUE")

# ESA WorldCover v200 class codes.
CLASS_NAMES: Dict[int, str] = {
    10: "tree_cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built_up",
    60: "bare_sparse",
    70: "snow_ice",
    80: "water",
    90: "herbaceous_wetland",
    95: "mangroves",
    100: "moss_lichen",
}

# Which UI land-cover label an argmax class maps onto.
UI_LABEL: Dict[str, str] = {
    "tree_cover": "Dense Forest",
    "mangroves": "Dense Forest",
    "cropland": "Cropland",
    "built_up": "Built-up Industrial",
    "water": "Water Body",
    "herbaceous_wetland": "Water Body",
    "shrubland": "Scrubland",
    "grassland": "Scrubland",
    "bare_sparse": "Scrubland",
    "snow_ice": "Unclassified",
    "moss_lichen": "Unclassified",
}


@dataclass
class LandCover:
    """Class fractions inside the analysis disc. Fractions sum to <= 1."""

    fractions: Dict[str, float] = field(default_factory=dict)
    dominant: Optional[str] = None
    dominant_fraction: float = 0.0
    label: str = "Unclassified"
    pixel_count: int = 0
    radius_m: int = 1000
    source: str = "esa_worldcover_v200_2021"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def tile_name(latitude: float, longitude: float) -> str:
    """WorldCover tiles are a 3-degree grid named by their SW corner."""
    lat = math.floor(latitude / 3) * 3
    lon = math.floor(longitude / 3) * 3
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}"


def tile_url(latitude: float, longitude: float) -> str:
    return (
        f"/vsicurl/{settings.WORLDCOVER_BASE_URL}/"
        f"ESA_WorldCover_10m_2021_v200_{tile_name(latitude, longitude)}_Map.tif"
    )


def _read_disc(latitude: float, longitude: float, radius_m: int) -> Optional[LandCover]:
    """Blocking windowed read. Called through a thread; never on the loop."""
    import numpy as np
    import rasterio
    from rasterio.windows import from_bounds

    # Degrees covering the radius. Longitude degrees shorten with latitude.
    d_lat = radius_m / 111_320.0
    d_lon = radius_m / (111_320.0 * max(math.cos(math.radians(latitude)), 1e-6))

    with rasterio.open(tile_url(latitude, longitude)) as src:
        window = from_bounds(
            longitude - d_lon, latitude - d_lat, longitude + d_lon, latitude + d_lat,
            src.transform,
        )
        data = src.read(1, window=window, boundless=True, fill_value=0)

    if data.size == 0:
        return None

    # The window is a square; the analysis area is a disc. Counting the
    # corners would inflate every fraction by 4/pi - 1, about 27%.
    rows, cols = data.shape
    yy, xx = np.ogrid[:rows, :cols]
    inside = ((yy - (rows - 1) / 2) / max((rows - 1) / 2, 1)) ** 2 + (
        (xx - (cols - 1) / 2) / max((cols - 1) / 2, 1)
    ) ** 2 <= 1.0
    values = data[inside]
    values = values[values != 0]  # 0 is nodata, not a class

    total = int(values.size)
    if total == 0:
        return None

    counts = np.bincount(values, minlength=101)
    fractions = {
        name: round(float(counts[code]) / total, 4)
        for code, name in CLASS_NAMES.items()
        if counts[code] > 0
    }
    dominant = max(fractions, key=fractions.get) if fractions else None

    return LandCover(
        fractions=fractions,
        dominant=dominant,
        dominant_fraction=fractions.get(dominant, 0.0) if dominant else 0.0,
        # A dominant class under 20% of the disc is a genuinely mixed
        # landscape; naming one would overstate what the raster shows.
        label=(
            UI_LABEL.get(dominant, "Unclassified")
            if dominant and fractions[dominant] >= 0.20
            else "Unclassified"
        ),
        pixel_count=total,
        radius_m=radius_m,
    )


@functools.lru_cache(maxsize=512)
def _cache_key(latitude: float, longitude: float, radius_m: int) -> tuple:
    # ~110 m at 3dp, so detections of one fire share a lookup.
    return (round(latitude, 3), round(longitude, 3), radius_m)


_MEMO: Dict[tuple, Optional[LandCover]] = {}


async def fetch_land_cover(
    latitude: float, longitude: float, radius_m: Optional[int] = None
) -> Optional[LandCover]:
    """Land cover for the disc, or None if the raster cannot be read.

    None is a normal outcome - no tile over open ocean, or the service being
    unreachable - and the caller falls back to OSM alone rather than losing
    the event.
    """
    if not settings.WORLDCOVER_ENABLED:
        return None

    radius_m = radius_m or settings.OSM_ANALYSIS_RADIUS_M
    key = _cache_key(latitude, longitude, radius_m)
    if key in _MEMO:
        return _MEMO[key]

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_read_disc, latitude, longitude, radius_m),
            timeout=settings.WORLDCOVER_TIMEOUT_S,
        )
    except Exception as exc:  # noqa: BLE001 - a raster read must never end an analysis
        logger.warning("WorldCover read failed at %.4f,%.4f: %s", latitude, longitude, exc)
        result = None

    _MEMO[key] = result
    return result
