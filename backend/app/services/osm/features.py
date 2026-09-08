"""Turn raw Overpass elements into the numeric feature vector (spec 13, 14).

Spec section 13 is explicit that raw OSM objects must not be fed to a model.
Everything here reduces to areas, counts, distances and booleans.

Spec Rule 4 also applies: OSM completeness varies enormously by region.
Missing data does NOT mean a feature is absent, so coverage is reported
alongside the values and Phase 5 converts sparse coverage into a confidence
penalty rather than treating zeros as evidence of absence.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from shapely.geometry import LineString, Point, Polygon

from app.services.osm import geometry as geo

# --- Tag -> category -------------------------------------------------------

FOREST_TAGS = {"landuse": {"forest"}, "natural": {"wood"}}
SCRUB_GRASS_TAGS = {"natural": {"scrub", "grassland", "heath"}}
FARMLAND_TAGS = {
    "landuse": {"farmland", "orchard", "vineyard", "meadow", "farmyard", "greenhouse_horticulture"}
}
INDUSTRIAL_TAGS = {"landuse": {"industrial", "quarry", "brownfield"}}
RESIDENTIAL_TAGS = {
    "landuse": {"residential"},
    "building": {"residential", "house", "apartments"},
}
WATER_TAGS = {"natural": {"water"}, "landuse": {"reservoir", "basin"}}

FACTORY_TAGS = {
    "man_made": {"works"},
    "building": {"industrial", "factory", "warehouse"},
}
# Gas/oil requires SPECIFIC tags. Phase 5 weights these heavily, and without
# that specificity Gas/Oil would never be separable from generic industrial.
GAS_TAGS = {
    "man_made": {"petroleum_well", "storage_tank", "gasometer", "flare"},
    "industrial": {"oil", "gas", "refinery", "petroleum"},
    "amenity": {"fuel"},
}
POWER_TAGS = {"power": {"plant", "substation", "generator"}}
ROAD_TAGS = {
    "highway": {
        "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    }
}
PLACE_TAGS = {"place": {"city", "town", "village", "suburb", "hamlet", "neighbourhood"}}

# Larger places win when several are in range.
PLACE_RANK = {
    "city": 0, "town": 1, "suburb": 2, "village": 3, "neighbourhood": 4, "hamlet": 5,
}

# Below this many elements, the area is treated as under-mapped rather than
# genuinely empty (spec Rule 4).
SPARSE_ELEMENT_THRESHOLD = 25

# A category must cover more than this share of the disc to name the land
# cover. Otherwise it is 'Unclassified' - guessing would print a lie.
LAND_COVER_MIN_FRACTION = 0.20


def matches(tags: Dict[str, str], spec: Dict[str, set]) -> bool:
    return any(tags.get(key) in values for key, values in spec.items())


def has_any_industrial_tag(tags: Dict[str, str]) -> bool:
    return "industrial" in tags


@dataclass
class SurroundingsFeatures:
    """Numeric surroundings, ready for the feature vector."""

    radius_m: int = 1000

    forest_area_km2: float = 0.0
    scrub_grass_area_km2: float = 0.0
    farmland_area_km2: float = 0.0
    industrial_area_km2: float = 0.0
    residential_area_km2: float = 0.0
    water_area_km2: float = 0.0

    forest_fraction: float = 0.0
    farmland_fraction: float = 0.0
    industrial_fraction: float = 0.0
    residential_fraction: float = 0.0

    factories_within_1km: int = 0
    gas_facilities_within_1km: int = 0
    power_infra_within_1km: int = 0
    building_count: int = 0
    hospitals: int = 0
    schools: int = 0
    fire_stations: int = 0

    # The named facilities behind those counts, nearest first. Overpass
    # already returns name and geometry for each; keeping only the tally
    # forced the dashboard to invent contacts to fill the panel.
    emergency_facilities: List[Dict[str, Any]] = field(default_factory=list)

    road_length_km: float = 0.0

    nearest_factory_m: Optional[float] = None
    nearest_forest_m: Optional[float] = None
    nearest_farmland_m: Optional[float] = None
    nearest_gas_facility_m: Optional[float] = None
    nearest_residential_m: Optional[float] = None

    # Distance alone cannot distinguish "inside the parcel" from "on its
    # boundary", and being inside is categorically stronger evidence.
    inside_industrial: bool = False
    inside_forest: bool = False
    inside_farmland: bool = False
    inside_residential: bool = False

    land_cover: str = "Unclassified"
    location_name: Optional[str] = None

    osm_element_count: int = 0
    osm_coverage: str = "sparse"  # sparse | ok
    geometry_quality: str = "exact"  # exact | approximate

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class _Bucket:
    polygons: List[Polygon] = field(default_factory=list)
    points: List[Point] = field(default_factory=list)

    @property
    def geometries(self) -> List[Any]:
        return [*self.polygons, *self.points]


def _element_rings(element: Dict[str, Any]) -> List[List[geo.LatLon]]:
    """Extract lat/lon rings from an Overpass `out geom` element.

    Relations return their members inline; only `outer` roles bound an area.
    """
    kind = element.get("type")

    if kind == "way":
        nodes = element.get("geometry") or []
        return [[(n["lat"], n["lon"]) for n in nodes if "lat" in n and "lon" in n]]

    if kind == "relation":
        rings: List[List[geo.LatLon]] = []
        for member in element.get("members") or []:
            if member.get("role") not in {"outer", ""}:
                continue
            nodes = member.get("geometry") or []
            ring = [(n["lat"], n["lon"]) for n in nodes if "lat" in n and "lon" in n]
            if len(ring) >= 3:
                rings.append(ring)
        return rings

    return []


def _bounds_ring(element: Dict[str, Any]) -> Optional[List[geo.LatLon]]:
    """Fallback box when a relation's geometry cannot be reconstructed."""
    bounds = element.get("bounds")
    if not bounds:
        return None
    try:
        south, west = float(bounds["minlat"]), float(bounds["minlon"])
        north, east = float(bounds["maxlat"]), float(bounds["maxlon"])
    except (KeyError, TypeError, ValueError):
        return None
    return [(south, west), (south, east), (north, east), (north, west)]


def extract_features(
    elements: Sequence[Dict[str, Any]],
    lat0: float,
    lon0: float,
    radius_m: int = 1000,
) -> SurroundingsFeatures:
    """Reduce Overpass elements to the numeric feature set."""
    features = SurroundingsFeatures(radius_m=radius_m)
    features.osm_element_count = len(elements)
    features.osm_coverage = "ok" if len(elements) >= SPARSE_ELEMENT_THRESHOLD else "sparse"

    buckets: Dict[str, _Bucket] = {
        name: _Bucket()
        for name in (
            "forest", "scrub_grass", "farmland", "industrial",
            "residential", "water", "factory", "gas", "power",
        )
    }
    roads: List[LineString] = []
    places: List[tuple[int, float, str]] = []  # (rank, distance, name)
    used_bounds_fallback = False

    for element in elements:
        tags = element.get("tags") or {}
        if not tags:
            continue

        kind = element.get("type")

        # --- point-like features ---------------------------------------
        point: Optional[Point] = None
        if kind == "node" and "lat" in element and "lon" in element:
            point = Point(geo.project_point(element["lat"], element["lon"], lat0, lon0))

        # --- area features ---------------------------------------------
        polygons: List[Polygon] = []
        rings = _element_rings(element)
        for ring in rings:
            polygon = geo.polygon_from_ring(ring, lat0, lon0)
            if polygon is not None:
                polygons.append(polygon)

        if kind == "relation" and not polygons:
            fallback = _bounds_ring(element)
            if fallback:
                polygon = geo.polygon_from_ring(fallback, lat0, lon0)
                if polygon is not None:
                    polygons.append(polygon)
                    used_bounds_fallback = True

        # Roads are linear, not areal.
        if matches(tags, ROAD_TAGS) and rings and len(rings[0]) >= 2:
            roads.append(LineString(geo.project_ring(rings[0], lat0, lon0)))

        # Place names come free with the same query - no Nominatim, no second
        # rate limit to respect.
        # OSM `name` carries the local-script form (Gujarati across this AOI).
        # `name:en` is preferred where mappers supplied it so the dashboard
        # stays legible, falling back to the local name rather than dropping
        # the place entirely.
        if matches(tags, PLACE_TAGS) and point is not None:
            place_name = tags.get("name:en") or tags.get("int_name") or tags.get("name")
            if place_name:
                places.append(
                    (
                        PLACE_RANK.get(tags.get("place", ""), 9),
                        point.distance(Point(0, 0)),
                        place_name,
                    )
                )

        def assign(bucket: str) -> None:
            if polygons:
                buckets[bucket].polygons.extend(polygons)
            elif point is not None:
                buckets[bucket].points.append(point)

        if matches(tags, FOREST_TAGS):
            assign("forest")
        if matches(tags, SCRUB_GRASS_TAGS):
            assign("scrub_grass")
        if matches(tags, FARMLAND_TAGS):
            assign("farmland")
        if matches(tags, INDUSTRIAL_TAGS):
            assign("industrial")
        if matches(tags, RESIDENTIAL_TAGS):
            assign("residential")
        if matches(tags, WATER_TAGS):
            assign("water")
        if matches(tags, FACTORY_TAGS) or has_any_industrial_tag(tags):
            assign("factory")
        if matches(tags, GAS_TAGS):
            assign("gas")
        if matches(tags, POWER_TAGS):
            assign("power")

        if "building" in tags:
            features.building_count += 1
        amenity = tags.get("amenity")
        kind = None
        if amenity in {"hospital", "clinic"}:
            features.hospitals += 1
            kind = "hospital"
        elif amenity in {"school", "college", "university"}:
            features.schools += 1
            kind = "school"
        elif amenity == "fire_station":
            features.fire_stations += 1
            kind = "fire_station"

        if kind is not None:
            # `polygons` / `point` are the already-projected geometries for
            # this element, in a frame whose origin is the fire itself.
            geometries = polygons if polygons else ([point] if point is not None else [])
            distance = geo.distance_to_origin_m(geometries)
            features.emergency_facilities.append(
                {
                    "kind": kind,
                    # Unnamed is common in sparsely mapped areas; say so rather
                    # than dropping a facility that genuinely exists.
                    "name": tags.get("name:en") or tags.get("name") or f"Unnamed {kind.replace('_', ' ')}",
                    "amenity": amenity,
                    "distance_m": round(distance, 1) if distance is not None else None,
                }
            )

    # --- areas -----------------------------------------------------------
    features.forest_area_km2 = round(geo.merged_area_km2(buckets["forest"].polygons, radius_m), 4)
    features.scrub_grass_area_km2 = round(
        geo.merged_area_km2(buckets["scrub_grass"].polygons, radius_m), 4
    )
    features.farmland_area_km2 = round(
        geo.merged_area_km2(buckets["farmland"].polygons, radius_m), 4
    )
    features.industrial_area_km2 = round(
        geo.merged_area_km2(buckets["industrial"].polygons, radius_m), 4
    )
    features.residential_area_km2 = round(
        geo.merged_area_km2(buckets["residential"].polygons, radius_m), 4
    )
    features.water_area_km2 = round(geo.merged_area_km2(buckets["water"].polygons, radius_m), 4)

    features.forest_fraction = round(geo.area_fraction(features.forest_area_km2, radius_m), 4)
    features.farmland_fraction = round(geo.area_fraction(features.farmland_area_km2, radius_m), 4)
    features.industrial_fraction = round(
        geo.area_fraction(features.industrial_area_km2, radius_m), 4
    )
    features.residential_fraction = round(
        geo.area_fraction(features.residential_area_km2, radius_m), 4
    )

    # --- counts ----------------------------------------------------------
    features.factories_within_1km = len(buckets["factory"].geometries)
    features.gas_facilities_within_1km = len(buckets["gas"].geometries)
    features.power_infra_within_1km = len(buckets["power"].geometries)
    features.road_length_km = round(geo.line_length_km(roads, radius_m), 3)

    # --- distances and containment ---------------------------------------
    def nearest(bucket: str) -> Optional[float]:
        value = geo.distance_to_origin_m(buckets[bucket].geometries)
        return round(value, 1) if value is not None else None

    features.nearest_factory_m = nearest("factory")
    features.nearest_forest_m = nearest("forest")
    features.nearest_farmland_m = nearest("farmland")
    features.nearest_gas_facility_m = nearest("gas")
    features.nearest_residential_m = nearest("residential")

    features.inside_industrial = geo.contains_origin(buckets["industrial"].polygons)
    features.inside_forest = geo.contains_origin(buckets["forest"].polygons)
    features.inside_farmland = geo.contains_origin(buckets["farmland"].polygons)
    features.inside_residential = geo.contains_origin(buckets["residential"].polygons)

    features.land_cover = derive_land_cover(features, radius_m)
    features.emergency_facilities.sort(
        key=lambda item: (item["distance_m"] is None, item["distance_m"] or 0.0)
    )
    features.location_name = derive_location_name(places)
    features.geometry_quality = "approximate" if used_bounds_fallback else "exact"

    return features


def derive_land_cover(features: SurroundingsFeatures, radius_m: int) -> str:
    """Dominant land cover, mapped onto the UI's closed category set.

    Returns 'Unclassified' unless one category clearly dominates. Naming a
    category on thin evidence would print a confident lie on the dashboard.
    """
    candidates = {
        "Built-up Industrial": features.industrial_area_km2,
        "Dense Forest": features.forest_area_km2,
        "Cropland": features.farmland_area_km2,
        "Water Body": features.water_area_km2,
        "Scrubland": features.scrub_grass_area_km2,
    }
    label, area = max(candidates.items(), key=lambda kv: kv[1])
    if area <= 0:
        return "Unclassified"
    if geo.area_fraction(area, radius_m) < LAND_COVER_MIN_FRACTION:
        return "Unclassified"
    return label


def derive_location_name(places: Sequence[tuple[int, float, str]]) -> Optional[str]:
    """Nearest significant settlement, preferring larger places."""
    if not places:
        return None
    return sorted(places, key=lambda p: (p[0], p[1]))[0][2]
