"""Metric geometry for the 1 km surroundings analysis.

The quiet hazard in this whole phase: computing polygon area in DEGREES.
A degree of longitude is ~111 km at the equator but only ~104 km at 21 N, so
treating lat/lon as a flat cartesian plane understates east-west extent by
about 7% here, and the resulting area error is roughly 10%. It never raises,
never logs, and silently biases every land-cover fraction the classifier
consumes.

So every measurement happens in an azimuthal-equidistant frame centred on the
fire, in metres. Over a 1 km disc the distortion of that projection is far
below the accuracy of the underlying OSM geometry.
"""

from __future__ import annotations

import math
from typing import Iterable, List, Optional, Sequence, Tuple

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

EARTH_RADIUS_M = 6_371_000.0

LatLon = Tuple[float, float]  # (lat, lon)
XY = Tuple[float, float]  # (east metres, north metres)


def project_point(lat: float, lon: float, lat0: float, lon0: float) -> XY:
    """Project one coordinate into a local equidistant frame in metres.

    The cos(lat0) factor is the whole point: without it, east-west distances
    are overstated by 1/cos(lat) - about 7% at the Gujarat AOI's latitude.
    """
    x = EARTH_RADIUS_M * math.radians(lon - lon0) * math.cos(math.radians(lat0))
    y = EARTH_RADIUS_M * math.radians(lat - lat0)
    return x, y


def unproject_point(x: float, y: float, lat0: float, lon0: float) -> LatLon:
    """Inverse of project_point. Used to build test fixtures and risk zones."""
    lat = lat0 + math.degrees(y / EARTH_RADIUS_M)
    lon = lon0 + math.degrees(x / (EARTH_RADIUS_M * math.cos(math.radians(lat0))))
    return lat, lon


def project_ring(ring: Sequence[LatLon], lat0: float, lon0: float) -> List[XY]:
    return [project_point(lat, lon, lat0, lon0) for lat, lon in ring]


def polygon_from_ring(ring: Sequence[LatLon], lat0: float, lon0: float) -> Optional[Polygon]:
    """Build a metric polygon from a lat/lon ring.

    Returns None for anything that cannot form a valid area, so malformed OSM
    geometry degrades to "not counted" rather than poisoning a sum.
    """
    if len(ring) < 3:
        return None
    try:
        polygon = Polygon(project_ring(ring, lat0, lon0))
    except (ValueError, TypeError):
        return None
    if polygon.is_empty:
        return None
    if not polygon.is_valid:
        # buffer(0) is the standard repair for self-intersecting rings, which
        # OSM has plenty of.
        polygon = polygon.buffer(0)
        if polygon.is_empty or not polygon.is_valid:
            return None
    return polygon


def analysis_disc(radius_m: float) -> Polygon:
    """The 1 km disc, centred on the fire at the origin of the local frame."""
    return Point(0.0, 0.0).buffer(radius_m, quad_segs=64)


def merged_area_km2(polygons: Iterable[Polygon], radius_m: float) -> float:
    """Total area covered by a category, clipped to the analysis disc.

    unary_union runs BEFORE summing. Overlapping features are the norm in OSM -
    a `landuse=industrial` parcel typically contains several
    `building=warehouse` polygons - and summing their areas independently
    would double-count the same ground.
    """
    usable = [p for p in polygons if p is not None and not p.is_empty]
    if not usable:
        return 0.0

    merged = unary_union(usable)
    clipped = merged.intersection(analysis_disc(radius_m))
    if clipped.is_empty:
        return 0.0
    return clipped.area / 1_000_000.0


def area_fraction(area_km2: float, radius_m: float) -> float:
    """Share of the analysis disc a category covers, in [0, 1]."""
    disc_km2 = math.pi * (radius_m / 1000.0) ** 2
    if disc_km2 <= 0:
        return 0.0
    return min(1.0, area_km2 / disc_km2)


def distance_to_origin_m(geometries: Iterable[object]) -> Optional[float]:
    """Nearest distance from the fire to any geometry in a category.

    Returns 0.0 when the fire sits inside a feature - which is why callers
    also record an explicit `inside_*` boolean. "Inside an industrial parcel"
    is categorically stronger evidence than "230 m from one", and a bare zero
    loses that distinction.
    """
    origin = Point(0.0, 0.0)
    distances = [
        g.distance(origin) for g in geometries if g is not None and not g.is_empty  # type: ignore[attr-defined]
    ]
    return min(distances) if distances else None


def contains_origin(geometries: Iterable[object]) -> bool:
    origin = Point(0.0, 0.0)
    return any(
        g.contains(origin) for g in geometries if g is not None and not g.is_empty  # type: ignore[attr-defined]
    )


def line_length_km(lines: Iterable[object], radius_m: float) -> float:
    """Total length of linear features inside the disc, in kilometres."""
    disc = analysis_disc(radius_m)
    total = 0.0
    for line in lines:
        if line is None or line.is_empty:  # type: ignore[attr-defined]
            continue
        clipped = line.intersection(disc)  # type: ignore[attr-defined]
        if not clipped.is_empty:
            total += clipped.length
    return total / 1000.0


def as_polygon_list(geometry: object) -> List[Polygon]:
    """Flatten a possibly-multi geometry into its polygon parts."""
    if geometry is None:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return []
