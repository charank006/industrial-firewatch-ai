"""Tag -> numeric feature extraction, and the degradation paths.

Spec Rule 4: OSM completeness varies enormously by region, so missing data
must never be presented as evidence of absence.
"""

import httpx
import pytest
import respx

from app.services.osm import client as overpass
from app.services.osm import geometry as geo
from app.services.osm.features import derive_land_cover, extract_features

LAT0, LON0 = 21.1738, 72.8345


def way(tags, corners_m, element_id=1):
    """An Overpass `out geom` way whose corners are given in local metres."""
    return {
        "type": "way",
        "id": element_id,
        "tags": tags,
        "geometry": [
            {"lat": lat, "lon": lon}
            for lat, lon in (geo.unproject_point(x, y, LAT0, LON0) for x, y in corners_m)
        ],
    }


def square(tags, side_m, element_id=1, offset=(0.0, 0.0)):
    half = side_m / 2.0
    ox, oy = offset
    return way(
        tags,
        [
            (ox - half, oy - half), (ox + half, oy - half),
            (ox + half, oy + half), (ox - half, oy + half),
        ],
        element_id,
    )


def node(tags, x_m, y_m, element_id=1):
    lat, lon = geo.unproject_point(x_m, y_m, LAT0, LON0)
    return {"type": "node", "id": element_id, "lat": lat, "lon": lon, "tags": tags}


@pytest.fixture(autouse=True)
def _reset_circuit():
    overpass.reset_circuit()
    yield
    overpass.reset_circuit()


class TestAreaCategories:
    def test_industrial_landuse_area(self):
        f = extract_features([square({"landuse": "industrial"}, 1000.0)], LAT0, LON0)
        assert f.industrial_area_km2 == pytest.approx(1.0, rel=0.01)
        assert f.inside_industrial is True

    def test_forest_from_both_tagging_conventions(self):
        f = extract_features(
            [
                square({"landuse": "forest"}, 400.0, 1, offset=(-300, 0)),
                square({"natural": "wood"}, 400.0, 2, offset=(300, 0)),
            ],
            LAT0,
            LON0,
        )
        assert f.forest_area_km2 == pytest.approx(0.32, rel=0.02)

    def test_overlapping_parcels_do_not_double_count(self):
        """An industrial parcel containing warehouses is the normal case."""
        f = extract_features(
            [
                square({"landuse": "industrial"}, 1000.0, 1),
                square({"building": "warehouse", "industrial": "yes"}, 200.0, 2),
            ],
            LAT0,
            LON0,
        )
        assert f.industrial_area_km2 == pytest.approx(1.0, rel=0.01)

    def test_fractions_are_relative_to_the_disc(self):
        f = extract_features([square({"landuse": "farmland"}, 1000.0)], LAT0, LON0)
        # 1 km2 of a pi km2 disc
        assert f.farmland_fraction == pytest.approx(1.0 / 3.14159, rel=0.02)


class TestCountsAndDistances:
    def test_factory_and_gas_counts(self):
        f = extract_features(
            [
                node({"man_made": "works"}, 100, 0, 1),
                node({"man_made": "storage_tank"}, 200, 0, 2),
                node({"man_made": "gasometer"}, 250, 0, 3),
                node({"amenity": "fuel"}, 300, 0, 4),
            ],
            LAT0,
            LON0,
        )
        assert f.factories_within_1km == 1
        assert f.gas_facilities_within_1km == 3

    def test_gas_requires_specific_tags_not_generic_industry(self):
        """Without tag specificity Gas/Oil could never outrank generic
        industrial in Phase 5."""
        f = extract_features([node({"industrial": "yes"}, 100, 0)], LAT0, LON0)
        assert f.factories_within_1km == 1
        assert f.gas_facilities_within_1km == 0

    def test_industrial_oil_counts_as_gas(self):
        f = extract_features([node({"industrial": "refinery"}, 100, 0)], LAT0, LON0)
        assert f.gas_facilities_within_1km == 1

    def test_nearest_distance(self):
        f = extract_features([node({"man_made": "works"}, 230.0, 0.0)], LAT0, LON0)
        assert f.nearest_factory_m == pytest.approx(230.0, abs=1.0)

    def test_amenity_counts(self):
        f = extract_features(
            [
                node({"amenity": "hospital"}, 100, 0, 1),
                node({"amenity": "school"}, 150, 0, 2),
                node({"amenity": "university"}, 160, 0, 3),
                node({"amenity": "fire_station"}, 200, 0, 4),
            ],
            LAT0,
            LON0,
        )
        assert (f.hospitals, f.schools, f.fire_stations) == (1, 2, 1)

    def test_road_length(self):
        road = way({"highway": "primary"}, [(-2000, 0), (2000, 0)])
        f = extract_features([road], LAT0, LON0)
        assert f.road_length_km == pytest.approx(2.0, rel=0.02)


class TestInsideVersusNear:
    """"Inside an industrial parcel" is categorically stronger evidence than
    "230m from one", and a distance of 0 alone cannot express it."""

    def test_inside_is_true_and_distance_zero(self):
        f = extract_features([square({"landuse": "industrial"}, 800.0)], LAT0, LON0)
        assert f.inside_industrial is True
        assert f.nearest_factory_m is None  # no factory feature, only landuse

    def test_adjacent_parcel_is_not_inside(self):
        f = extract_features(
            [square({"landuse": "industrial"}, 200.0, offset=(400, 0))], LAT0, LON0
        )
        assert f.inside_industrial is False


class TestLandCover:
    def test_dominant_category_wins(self):
        f = extract_features([square({"landuse": "industrial"}, 1200.0)], LAT0, LON0)
        assert f.land_cover == "Built-up Industrial"

    def test_thin_coverage_stays_unclassified(self):
        """Below 20% of the disc, naming a category would be a confident lie."""
        f = extract_features([square({"landuse": "forest"}, 200.0)], LAT0, LON0)
        assert f.forest_area_km2 > 0
        assert f.land_cover == "Unclassified"

    def test_no_features_is_unclassified(self):
        assert extract_features([], LAT0, LON0).land_cover == "Unclassified"

    def test_forest_dominant(self):
        f = extract_features([square({"natural": "wood"}, 1500.0)], LAT0, LON0)
        assert f.land_cover == "Dense Forest"


class TestCoverageReporting:
    def test_sparse_coverage_is_flagged(self):
        f = extract_features([node({"man_made": "works"}, 100, 0)], LAT0, LON0)
        assert f.osm_coverage == "sparse"
        assert f.osm_element_count == 1

    def test_adequate_coverage(self):
        elements = [node({"building": "house"}, i * 10, 0, i) for i in range(30)]
        f = extract_features(elements, LAT0, LON0)
        assert f.osm_coverage == "ok"
        assert f.building_count == 30

    def test_empty_response_is_sparse_not_an_assertion_of_emptiness(self):
        f = extract_features([], LAT0, LON0)
        assert f.osm_coverage == "sparse"
        assert f.industrial_area_km2 == 0.0


class TestPlaceNames:
    def test_nearest_place_supplies_the_location_name(self):
        f = extract_features(
            [node({"place": "town", "name": "Hazira"}, 1500, 0)], LAT0, LON0
        )
        assert f.location_name == "Hazira"

    def test_larger_place_is_preferred_over_a_nearer_hamlet(self):
        f = extract_features(
            [
                node({"place": "hamlet", "name": "Tiny"}, 200, 0, 1),
                node({"place": "city", "name": "Surat"}, 4000, 0, 2),
            ],
            LAT0,
            LON0,
        )
        assert f.location_name == "Surat"

    def test_english_name_is_preferred_over_local_script(self):
        """OSM `name` is the local-script form across this AOI."""
        f = extract_features(
            [node({"place": "town", "name": "\u0ab5\u0aa1\u0abe\u0aaa\u0aa7\u0acd\u0aa7\u0ab0", "name:en": "Vadapadhar"}, 1500, 0)],
            LAT0,
            LON0,
        )
        assert f.location_name == "Vadapadhar"

    def test_local_name_is_kept_when_no_english_exists(self):
        f = extract_features([node({"place": "town", "name": "\u0ab9\u0a9c\u0abf\u0ab0\u0abe"}, 1500, 0)], LAT0, LON0)
        assert f.location_name == "\u0ab9\u0a9c\u0abf\u0ab0\u0abe"

    def test_no_place_yields_none_so_the_caller_can_fall_back(self):
        assert extract_features([], LAT0, LON0).location_name is None


class TestRelationHandling:
    def test_outer_members_form_the_area(self):
        ring = [
            {"lat": lat, "lon": lon}
            for lat, lon in (
                geo.unproject_point(x, y, LAT0, LON0)
                for x, y in [(-500, -500), (500, -500), (500, 500), (-500, 500)]
            )
        ]
        relation = {
            "type": "relation",
            "id": 1,
            "tags": {"landuse": "industrial"},
            "members": [{"type": "way", "role": "outer", "geometry": ring}],
        }
        f = extract_features([relation], LAT0, LON0)
        assert f.industrial_area_km2 == pytest.approx(1.0, rel=0.02)
        assert f.geometry_quality == "exact"

    def test_unreconstructable_relation_falls_back_to_bounds_and_says_so(self):
        south, west = geo.unproject_point(-500, -500, LAT0, LON0)
        north, east = geo.unproject_point(500, 500, LAT0, LON0)
        relation = {
            "type": "relation",
            "id": 1,
            "tags": {"landuse": "industrial"},
            "members": [],
            "bounds": {"minlat": south, "minlon": west, "maxlat": north, "maxlon": east},
        }
        f = extract_features([relation], LAT0, LON0)
        assert f.industrial_area_km2 > 0
        assert f.geometry_quality == "approximate"  # auditable, not silent


class TestOverpassClient:
    def test_query_uses_nwr_and_inline_geometry(self):
        query = overpass.build_query(21.17, 72.83, 1000)
        assert "nwr(around:1000,21.17,72.83)" in query
        # `out tags geom` avoids the second `>; out skel qt;` round-trip.
        assert "out tags geom;" in query
        assert "[out:json]" in query

    def test_place_lookup_uses_a_wider_radius(self):
        assert "node(around:5000," in overpass.build_query(21.17, 72.83, 1000)

    def test_nearby_detections_share_a_cache_entry(self):
        # ~9m apart and inside the same 3dp cell.
        a = overpass.cache_key(21.17341, 72.83412, 1000)
        b = overpass.cache_key(21.17349, 72.83418, 1000)
        assert a == b

    def test_distant_points_do_not_share_a_cache_entry(self):
        assert overpass.cache_key(21.173, 72.834, 1000) != overpass.cache_key(21.19, 72.83, 1000)

    def test_radius_is_part_of_the_key(self):
        assert overpass.cache_key(21.173, 72.834, 1000) != overpass.cache_key(21.173, 72.834, 2000)

    @respx.mock
    async def test_successful_fetch(self):
        respx.post(url__regex=r".*overpass.*").mock(
            return_value=httpx.Response(200, json={"elements": [{"type": "node", "id": 1}]})
        )
        elements = await overpass.fetch_elements(21.17, 72.83, 1000, max_attempts=1)
        assert len(elements) == 1

    @respx.mock
    async def test_retries_then_raises_without_hanging(self):
        respx.post(url__regex=r".*overpass.*").mock(return_value=httpx.Response(429))
        with pytest.raises(overpass.OverpassError):
            await overpass.fetch_elements(21.17, 72.83, 1000, max_attempts=2)

    @respx.mock
    async def test_circuit_opens_after_repeated_failures(self):
        """One bad Overpass day must degrade the pipeline, not freeze it."""
        respx.post(url__regex=r".*overpass.*").mock(return_value=httpx.Response(503))
        for _ in range(6):
            with pytest.raises(overpass.OverpassError):
                await overpass.fetch_elements(21.17, 72.83, 1000, max_attempts=1)

        with pytest.raises(overpass.OverpassUnavailable):
            await overpass.fetch_elements(21.17, 72.83, 1000, max_attempts=1)

    @respx.mock
    async def test_probe_reports_failure_rather_than_raising(self):
        respx.get(url__regex=r".*overpass.*").mock(side_effect=httpx.ConnectError("down"))
        assert (await overpass.probe_overpass())["ok"] is False


class TestLandCoverThreshold:
    def test_threshold_boundary(self):
        import math

        from app.services.osm.features import SurroundingsFeatures

        disc_km2 = math.pi  # radius 1km
        f = SurroundingsFeatures()

        f.industrial_area_km2 = 0.21 * disc_km2
        assert derive_land_cover(f, 1000) == "Built-up Industrial"

        f.industrial_area_km2 = 0.19 * disc_km2
        assert derive_land_cover(f, 1000) == "Unclassified"
