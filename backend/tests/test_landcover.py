"""ESA WorldCover land cover.

OpenStreetMap answers "what has someone mapped here", and across rural
Telangana that is usually nothing - 18 of 27 events classified Unknown
Anomaly with every OSM land-use area at 0.0. WorldCover answers "what is
physically on the ground" for every 10 m pixel, with no coverage gaps.
"""

import numpy as np
import pytest

from app.config import settings
from app.services import landcover_service as lc


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.setattr(settings, "WORLDCOVER_ENABLED", True)
    lc._MEMO.clear()


def _build(grid: np.ndarray, radius_m: int):
    """Mirror _read_disc's disc mask and fraction maths on a supplied grid."""
    rows, cols = grid.shape
    yy, xx = np.ogrid[:rows, :cols]
    inside = ((yy - (rows - 1) / 2) / max((rows - 1) / 2, 1)) ** 2 + (
        (xx - (cols - 1) / 2) / max((cols - 1) / 2, 1)
    ) ** 2 <= 1.0
    values = grid[inside]
    values = values[values != 0]
    total = int(values.size)
    if total == 0:
        return None
    counts = np.bincount(values, minlength=101)
    fractions = {
        name: round(float(counts[code]) / total, 4)
        for code, name in lc.CLASS_NAMES.items()
        if counts[code] > 0
    }
    dominant = max(fractions, key=fractions.get)
    return lc.LandCover(
        fractions=fractions, dominant=dominant, dominant_fraction=fractions[dominant],
        label=lc.UI_LABEL.get(dominant, "Unclassified") if fractions[dominant] >= 0.20 else "Unclassified",
        pixel_count=total, radius_m=radius_m,
    )


class TestTileAddressing:
    """WorldCover ships a 3-degree grid named by each tile's SW corner."""

    def test_telangana_points_resolve_to_their_tiles(self):
        assert lc.tile_name(17.385, 78.486) == "N15E078"
        assert lc.tile_name(19.4, 79.2) == "N18E078"

    def test_the_grid_floors_to_a_multiple_of_three(self):
        assert lc.tile_name(15.0, 78.0) == "N15E078"
        assert lc.tile_name(17.999, 80.999) == "N15E078"

    def test_southern_and_western_hemispheres(self):
        assert lc.tile_name(-3.5, -60.2) == "S06W063"

    def test_the_url_is_a_windowed_read_not_a_download(self):
        """/vsicurl/ means GDAL range-requests the bytes it needs. The tiles
        are 111 MB each; the disc we want is a few hundred KB."""
        assert lc.tile_url(17.385, 78.486).startswith("/vsicurl/https://")
        assert "N15E078" in lc.tile_url(17.385, 78.486)


class TestDiscMasking:
    async def test_only_the_disc_counts_not_the_bounding_square(self, monkeypatch):
        """The read window is a square. Counting its corners would inflate
        every fraction by 4/pi - 1, about 27%."""
        grid = np.full((101, 101), 40, dtype=np.uint8)   # cropland everywhere
        grid[0, 0] = grid[0, -1] = grid[-1, 0] = grid[-1, -1] = 10  # corners only
        monkeypatch.setattr(lc, "_read_disc", lambda la, lo, r: _build(grid, r))

        result = await lc.fetch_land_cover(17.0, 78.0)
        assert result.fractions.get("tree_cover") is None
        assert result.fractions["cropland"] == 1.0

    async def test_nodata_is_excluded_from_the_denominator(self, monkeypatch):
        grid = np.full((51, 51), 40, dtype=np.uint8)
        grid[:, :25] = 0  # nodata half
        monkeypatch.setattr(lc, "_read_disc", lambda la, lo, r: _build(grid, r))

        result = await lc.fetch_land_cover(17.0, 78.0)
        assert result.fractions["cropland"] == 1.0


class TestLabelling:
    async def test_a_dominant_class_names_the_land_cover(self, monkeypatch):
        grid = np.full((51, 51), 40, dtype=np.uint8)
        monkeypatch.setattr(lc, "_read_disc", lambda la, lo, r: _build(grid, r))
        assert (await lc.fetch_land_cover(17.0, 78.0)).label == "Cropland"

    async def test_a_genuinely_mixed_landscape_is_not_given_a_label(self, monkeypatch):
        """Naming a class that covers under a fifth of the disc would
        overstate what the raster shows."""
        grid = np.zeros((51, 51), dtype=np.uint8)
        codes = [10, 20, 30, 40, 50, 60]
        flat = grid.reshape(-1)
        for i in range(flat.size):
            flat[i] = codes[i % len(codes)]
        monkeypatch.setattr(lc, "_read_disc", lambda la, lo, r: _build(grid, r))

        result = await lc.fetch_land_cover(17.0, 78.0)
        assert result.dominant_fraction < 0.20
        assert result.label == "Unclassified"


class TestFailSafe:
    async def test_disabled_returns_none_rather_than_raising(self, monkeypatch):
        monkeypatch.setattr(settings, "WORLDCOVER_ENABLED", False)
        assert await lc.fetch_land_cover(17.0, 78.0) is None

    async def test_a_read_failure_degrades_to_none(self, monkeypatch):
        """No tile over open ocean, or the service unreachable. The event
        keeps its OSM evidence rather than being lost."""
        def boom(la, lo, r):
            raise OSError("connection reset")
        monkeypatch.setattr(lc, "_read_disc", boom)
        assert await lc.fetch_land_cover(0.0, -30.0) is None

    async def test_an_all_nodata_disc_is_none(self, monkeypatch):
        monkeypatch.setattr(lc, "_read_disc", lambda la, lo, r: _build(np.zeros((21, 21), dtype=np.uint8), r))
        assert await lc.fetch_land_cover(17.0, 78.0) is None


class TestCaching:
    async def test_nearby_detections_share_one_read(self, monkeypatch):
        """Rounded to 3dp, about 110 m, so pixels of one fire do not each
        trigger their own range request."""
        calls = {"n": 0}
        grid = np.full((21, 21), 40, dtype=np.uint8)

        def counted(la, lo, r):
            calls["n"] += 1
            return _build(grid, r)

        monkeypatch.setattr(lc, "_read_disc", counted)
        await lc.fetch_land_cover(17.38500, 78.48600)
        await lc.fetch_land_cover(17.38504, 78.48598)
        assert calls["n"] == 1
