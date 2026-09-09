"""Clipping FIRMS detections to a real administrative boundary.

FIRMS can only be queried by rectangle, and no rectangle matches a state
border. The Telangana box (77.2-81.4E, 15.8-19.95N) overlaps Chandrapur
district in Maharashtra, so ten of fifty-one ingested events were reported as
Telangana fires while being in another state.
"""

import pytest

from app.config import settings
from app.services.aoi_service import active_boundary_name, is_inside_aoi, load_boundary

# Real coordinates from the live pull.
HYDERABAD = (17.385, 78.486)
MANUGURU = (17.4639, 80.6542)       # Telangana, coal belt
GHUGUS = (19.931, 79.122)           # Maharashtra, inside the FIRMS rectangle
BALLARPUR = (19.820, 79.337)        # Maharashtra, inside the FIRMS rectangle


@pytest.fixture
def telangana(monkeypatch):
    monkeypatch.setattr(settings, "AOI_BOUNDARY", "telangana")
    return load_boundary("telangana")


class TestBoundaryAsset:
    def test_the_boundary_ships_with_the_app(self, telangana):
        """A live geocoder lookup per ingest would put a third-party network
        hop in the hot path for a shape that changes on the scale of years."""
        assert telangana is not None

    def test_an_unknown_boundary_is_absent_not_an_error(self):
        assert load_boundary("no-such-region") is None


class TestClipping:
    def test_points_inside_telangana_are_kept(self, telangana):
        assert is_inside_aoi(*HYDERABAD)
        assert is_inside_aoi(*MANUGURU)

    def test_maharashtra_points_inside_the_rectangle_are_dropped(self, telangana):
        """Both sit inside the FIRMS bounding box and outside the state."""
        assert not is_inside_aoi(*GHUGUS)
        assert not is_inside_aoi(*BALLARPUR)

    def test_a_point_far_outside_is_dropped(self, telangana):
        assert not is_inside_aoi(21.1738, 72.8345)  # Surat, Gujarat


class TestFailSafe:
    def test_no_boundary_configured_keeps_everything(self, monkeypatch):
        """An unset boundary means "the rectangle is the AOI", not "drop all"."""
        monkeypatch.setattr(settings, "AOI_BOUNDARY", "")
        assert active_boundary_name() is None
        assert is_inside_aoi(*GHUGUS)

    def test_a_missing_asset_keeps_everything(self, monkeypatch):
        """A detection must never be lost because a boundary file failed to
        load - that would silently empty the pipeline."""
        monkeypatch.setattr(settings, "AOI_BOUNDARY", "atlantis")
        assert is_inside_aoi(*GHUGUS)
