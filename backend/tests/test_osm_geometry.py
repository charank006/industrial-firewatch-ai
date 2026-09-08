"""Metric geometry tests.

Written before the Overpass client was wired to any of this, because the
failure mode here is silent: computing area in degrees never raises, never
logs, and biases every land-cover fraction the classifier consumes by roughly
10% at this latitude.

Each test pins a polygon whose true area is known by construction.
"""

import math

import pytest
from shapely.geometry import LineString, Point, Polygon

from app.services.osm import geometry as g

# Gujarat industrial corridor - the AOI the dashboard is built around.
LAT0, LON0 = 21.1738, 72.8345


def square_ring(side_m: float, lat0: float = LAT0, lon0: float = LON0):
    """A square of exactly `side_m` on each side, expressed in lat/lon.

    Built by inverse-projecting metric corners, so its true area is known:
    side_m ** 2.
    """
    half = side_m / 2.0
    corners = [(-half, -half), (half, -half), (half, half), (-half, half)]
    return [g.unproject_point(x, y, lat0, lon0) for x, y in corners]


class TestProjection:
    def test_round_trip_is_stable(self):
        lat, lon = 21.1800, 72.8400
        x, y = g.project_point(lat, lon, LAT0, LON0)
        back_lat, back_lon = g.unproject_point(x, y, LAT0, LON0)
        assert back_lat == pytest.approx(lat, abs=1e-9)
        assert back_lon == pytest.approx(lon, abs=1e-9)

    def test_origin_projects_to_zero(self):
        assert g.project_point(LAT0, LON0, LAT0, LON0) == pytest.approx((0.0, 0.0))

    def test_one_degree_of_latitude_is_about_111km(self):
        _, y = g.project_point(LAT0 + 1.0, LON0, LAT0, LON0)
        assert y == pytest.approx(111_195, rel=0.001)

    def test_longitude_is_scaled_by_cos_latitude(self):
        """This factor is the entire bug being guarded against: at 21.17 N a
        degree of longitude is ~104 km, not ~111 km."""
        x, _ = g.project_point(LAT0, LON0 + 1.0, LAT0, LON0)
        expected = 111_195 * math.cos(math.radians(LAT0))
        assert x == pytest.approx(expected, rel=0.001)
        assert x < 111_195  # shorter than a degree of latitude


class TestKnownAreas:
    """Ground truth: polygons whose area is fixed by construction."""

    @pytest.mark.parametrize(
        "side_m,expected_km2",
        [(1000.0, 1.0), (500.0, 0.25), (100.0, 0.01), (2000.0, 4.0)],
    )
    def test_square_area_matches_construction(self, side_m, expected_km2):
        polygon = g.polygon_from_ring(square_ring(side_m), LAT0, LON0)
        # Clip radius large enough that the square is entirely inside.
        area = g.merged_area_km2([polygon], radius_m=10_000)
        assert area == pytest.approx(expected_km2, rel=0.001)

    def test_degree_based_maths_would_have_been_wrong(self):
        """Demonstrates the error being prevented: treating lat/lon as a flat
        plane scaled only by 111km/deg overstates area by ~1/cos(lat)."""
        ring = square_ring(1000.0)
        correct = g.merged_area_km2(
            [g.polygon_from_ring(ring, LAT0, LON0)], radius_m=10_000
        )

        naive = Polygon([(lon * 111_195, lat * 111_195) for lat, lon in ring]).area / 1e6

        assert correct == pytest.approx(1.0, rel=0.001)
        assert naive == pytest.approx(1.0 / math.cos(math.radians(LAT0)), rel=0.01)
        assert naive > correct * 1.06  # ~7% inflation, silently

    def test_disc_area_matches_pi_r_squared(self):
        disc = g.analysis_disc(1000.0)
        assert disc.area / 1e6 == pytest.approx(math.pi, rel=0.001)


class TestOverlapHandling:
    def test_overlapping_features_are_unioned_not_summed(self):
        """A landuse=industrial parcel normally contains several
        building=warehouse polygons. Summing them independently would
        double-count the same ground."""
        big = g.polygon_from_ring(square_ring(1000.0), LAT0, LON0)
        inner = g.polygon_from_ring(square_ring(500.0), LAT0, LON0)

        merged = g.merged_area_km2([big, inner], radius_m=10_000)
        naive_sum = (big.area + inner.area) / 1e6

        assert merged == pytest.approx(1.0, rel=0.001)  # inner is contained
        assert naive_sum == pytest.approx(1.25, rel=0.001)  # would over-count

    def test_identical_duplicates_count_once(self):
        polygon = g.polygon_from_ring(square_ring(1000.0), LAT0, LON0)
        assert g.merged_area_km2([polygon, polygon, polygon], radius_m=10_000) == pytest.approx(
            1.0, rel=0.001
        )


class TestClipping:
    def test_area_outside_the_disc_is_excluded(self):
        """A 4 km square around the fire must contribute only the disc's own
        area, not its full extent."""
        polygon = g.polygon_from_ring(square_ring(4000.0), LAT0, LON0)
        area = g.merged_area_km2([polygon], radius_m=1000)
        assert area == pytest.approx(math.pi, rel=0.01)

    def test_feature_entirely_outside_contributes_nothing(self):
        far = [g.unproject_point(x, y, LAT0, LON0) for x, y in
               [(5000, 5000), (5100, 5000), (5100, 5100), (5000, 5100)]]
        polygon = g.polygon_from_ring(far, LAT0, LON0)
        assert g.merged_area_km2([polygon], radius_m=1000) == 0.0

    def test_empty_input(self):
        assert g.merged_area_km2([], radius_m=1000) == 0.0

    def test_area_fraction_is_bounded(self):
        assert g.area_fraction(math.pi, 1000.0) == pytest.approx(1.0, rel=0.001)
        assert g.area_fraction(1000.0, 1000.0) == 1.0  # clamped
        assert g.area_fraction(0.0, 1000.0) == 0.0


class TestDistanceAndContainment:
    def test_distance_to_a_nearby_feature(self):
        """A 100m square centred 300m east: nearest edge is 250m away."""
        ring = [
            g.unproject_point(x, y, LAT0, LON0)
            for x, y in [(250, -50), (350, -50), (350, 50), (250, 50)]
        ]
        polygon = g.polygon_from_ring(ring, LAT0, LON0)
        assert g.distance_to_origin_m([polygon]) == pytest.approx(250.0, abs=1.0)

    def test_distance_is_zero_when_the_fire_is_inside(self):
        polygon = g.polygon_from_ring(square_ring(1000.0), LAT0, LON0)
        assert g.distance_to_origin_m([polygon]) == pytest.approx(0.0)

    def test_containment_is_reported_separately_from_distance(self):
        """`inside` must be its own signal: a distance of 0 alone cannot
        distinguish "inside the parcel" from "exactly on its boundary"."""
        inside = g.polygon_from_ring(square_ring(1000.0), LAT0, LON0)
        outside_ring = [
            g.unproject_point(x, y, LAT0, LON0)
            for x, y in [(250, -50), (350, -50), (350, 50), (250, 50)]
        ]
        outside = g.polygon_from_ring(outside_ring, LAT0, LON0)

        assert g.contains_origin([inside]) is True
        assert g.contains_origin([outside]) is False

    def test_nearest_of_several(self):
        near = g.polygon_from_ring(
            [g.unproject_point(x, y, LAT0, LON0) for x, y in
             [(100, -10), (120, -10), (120, 10), (100, 10)]], LAT0, LON0)
        far = g.polygon_from_ring(
            [g.unproject_point(x, y, LAT0, LON0) for x, y in
             [(800, -10), (820, -10), (820, 10), (800, 10)]], LAT0, LON0)
        assert g.distance_to_origin_m([far, near]) == pytest.approx(100.0, abs=1.0)

    def test_distance_none_when_nothing_present(self):
        assert g.distance_to_origin_m([]) is None


class TestRoadLength:
    def test_length_of_a_straight_line_through_the_disc(self):
        """A line spanning the full diameter clips to 2 km."""
        coords = [g.unproject_point(x, 0.0, LAT0, LON0) for x in (-2000, 2000)]
        line = LineString(g.project_ring(coords, LAT0, LON0))
        assert g.line_length_km([line], radius_m=1000) == pytest.approx(2.0, rel=0.01)

    def test_line_outside_the_disc_contributes_nothing(self):
        coords = [g.unproject_point(x, 5000.0, LAT0, LON0) for x in (-2000, 2000)]
        line = LineString(g.project_ring(coords, LAT0, LON0))
        assert g.line_length_km([line], radius_m=1000) == 0.0


class TestMalformedGeometry:
    """OSM contains plenty of broken rings. They must degrade to "not
    counted", never poison a sum or raise."""

    def test_too_few_points(self):
        assert g.polygon_from_ring([(21.0, 72.0), (21.1, 72.1)], LAT0, LON0) is None

    def test_empty_ring(self):
        assert g.polygon_from_ring([], LAT0, LON0) is None

    def test_self_intersecting_ring_is_repaired(self):
        bowtie = [
            g.unproject_point(x, y, LAT0, LON0)
            for x, y in [(0, 0), (100, 100), (100, 0), (0, 100)]
        ]
        polygon = g.polygon_from_ring(bowtie, LAT0, LON0)
        assert polygon is not None
        assert polygon.is_valid

    def test_degenerate_zero_area_ring(self):
        line_ring = [
            g.unproject_point(x, 0.0, LAT0, LON0) for x in (0, 100, 200)
        ]
        polygon = g.polygon_from_ring(line_ring, LAT0, LON0)
        assert polygon is None or polygon.area == pytest.approx(0.0)

    def test_none_entries_are_skipped(self):
        good = g.polygon_from_ring(square_ring(1000.0), LAT0, LON0)
        assert g.merged_area_km2([good, None], radius_m=10_000) == pytest.approx(1.0, rel=0.001)


class TestPolygonFlattening:
    def test_single_polygon(self):
        polygon = g.polygon_from_ring(square_ring(100.0), LAT0, LON0)
        assert g.as_polygon_list(polygon) == [polygon]

    def test_non_polygon_is_dropped(self):
        assert g.as_polygon_list(Point(0, 0)) == []
        assert g.as_polygon_list(None) == []
