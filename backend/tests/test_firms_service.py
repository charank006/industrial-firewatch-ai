"""FIRMS client tests. Every one runs against mocked responses - no test may
ever hit NASA, both for quota and for determinism."""

import datetime

import httpx
import pytest
import respx

from app.services import firms_service as fs
from app.services.firms_service import FirmsError

VIIRS_CSV = """country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
IND,21.17380,72.83450,347.2,0.42,0.38,2026-09-08,0130,N,VIIRS,h,2.0NRT,298.1,184.6,N
IND,21.11400,72.63900,328.5,0.51,0.44,2026-09-08,2142,N,VIIRS,n,2.0NRT,290.3,82.3,N
IND,20.37550,72.90800,339.1,0.47,0.41,2026-09-08,0930,1,VIIRS,l,2.0NRT,295.7,12.7,D
"""

MODIS_CSV = """country_id,latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
IND,21.68200,72.54200,331.4,1.1,1.0,2026-09-08,0805,Terra,MODIS,87,6.1NRT,295.2,42.3,D
"""


class TestConfidenceNormalisation:
    """VIIRS emits categorical l|n|h, MODIS an integer 0-100. Code doing
    int(row["confidence"]) crashes on every VIIRS row."""

    @pytest.mark.parametrize("token,expected", [("l", 20), ("n", 60), ("h", 90), ("H", 90)])
    def test_viirs_categorical(self, token, expected):
        raw, pct = fs.normalise_confidence(token, "VIIRS")
        assert (raw, pct) == (token, expected)

    @pytest.mark.parametrize("token,expected", [("87", 87), ("0", 0), ("100", 100)])
    def test_modis_integer(self, token, expected):
        assert fs.normalise_confidence(token, "MODIS")[1] == expected

    def test_out_of_range_is_clamped(self):
        assert fs.normalise_confidence("150", "MODIS")[1] == 100

    def test_unrecognised_token_degrades_without_crashing(self):
        raw, pct = fs.normalise_confidence("banana", "VIIRS")
        assert raw == "banana" and pct == 0

    def test_raw_token_is_always_preserved(self):
        assert fs.normalise_confidence("h", "VIIRS")[0] == "h"


class TestAcquisitionTimeParsing:
    """acq_time is HHMM and loses its leading zero through any int round-trip."""

    def test_leading_zero_preserved(self):
        assert fs.parse_acquisition_time("2026-09-08", "0130").hour == 1

    def test_int_stripped_value_recovers(self):
        """"0130" arriving as 130 must still mean 01:30, not 13:00."""
        parsed = fs.parse_acquisition_time("2026-09-08", 130)
        assert (parsed.hour, parsed.minute) == (1, 30)

    def test_midnight(self):
        parsed = fs.parse_acquisition_time("2026-09-08", "0")
        assert (parsed.hour, parsed.minute) == (0, 0)

    def test_result_is_utc_aware(self):
        assert fs.parse_acquisition_time("2026-09-08", "2142").tzinfo is datetime.timezone.utc

    @pytest.mark.parametrize("bad", ["9999", "2560"])
    def test_out_of_range_rejected(self, bad):
        with pytest.raises(FirmsError):
            fs.parse_acquisition_time("2026-09-08", bad)

    def test_bad_date_rejected(self):
        with pytest.raises(FirmsError):
            fs.parse_acquisition_time("not-a-date", "0130")


class TestCsvParsing:
    def test_viirs_rows_parsed(self):
        dets = fs.parse_firms_csv(VIIRS_CSV, "VIIRS_SNPP_NRT")
        assert len(dets) == 3
        first = dets[0]
        assert first.latitude == 21.1738
        assert first.frp_mw == 184.6
        assert first.confidence_raw == "h" and first.confidence_pct == 90
        assert first.day_night == "N"

    def test_brightness_unified_from_bright_ti4_on_viirs(self):
        d = fs.parse_firms_csv(VIIRS_CSV, "VIIRS_SNPP_NRT")[0]
        assert d.brightness_k == 347.2 == d.bright_ti4
        assert d.bright_ti5 == 298.1

    def test_brightness_unified_from_brightness_on_modis(self):
        d = fs.parse_firms_csv(MODIS_CSV, "MODIS_NRT")[0]
        assert d.brightness_k == 331.4
        assert d.bright_t31 == 295.2
        assert d.bright_ti4 is None

    def test_raw_row_is_retained(self):
        d = fs.parse_firms_csv(MODIS_CSV, "MODIS_NRT")[0]
        assert d.raw["version"] == "6.1NRT"

    def test_empty_body_is_not_an_error(self):
        assert fs.parse_firms_csv("", "VIIRS_SNPP_NRT") == []

    def test_plaintext_error_delivered_as_200_is_detected(self):
        """FIRMS returns failures as HTTP 200 with a plain-text body, so status
        codes alone never reveal them."""
        with pytest.raises(FirmsError, match="did not return a detection CSV"):
            fs.parse_firms_csv("Invalid MAP_KEY", "VIIRS_SNPP_NRT")

    def test_html_error_page_is_detected(self):
        with pytest.raises(FirmsError):
            fs.parse_firms_csv("<html><body>Service Unavailable</body></html>", "MODIS_NRT")

    def test_row_with_bad_timestamp_is_skipped_not_fatal(self):
        csv_text = VIIRS_CSV + "IND,21.0,72.0,330.0,0.4,0.4,2026-09-08,9999,N,VIIRS,h,2.0NRT,290.0,10.0,N\n"
        assert len(fs.parse_firms_csv(csv_text, "VIIRS_SNPP_NRT")) == 3


class TestDeduplication:
    """FIRMS re-serves identical rows on every overlapping poll - ~96 times a
    day at a 15 min cadence. Without this, detection and recurrence counts
    inflate by two orders of magnitude and the flare rule fires on everything."""

    def test_identical_rows_collapse(self):
        dets = fs.parse_firms_csv(VIIRS_CSV, "VIIRS_SNPP_NRT")
        assert len(fs.deduplicate(dets + dets + dets)) == 3

    def test_higher_frp_wins_on_collision(self):
        a = fs.parse_firms_csv(VIIRS_CSV, "VIIRS_SNPP_NRT")[0]
        hotter = fs.FireDetection(**{**a.__dict__, "frp_mw": 999.0})
        assert fs.deduplicate([a, hotter])[0].frp_mw == 999.0

    def test_output_sorted_by_acquisition_time(self):
        """Ascending order matters: out-of-order insertion makes the event
        engine's time-window test behave differently on replay."""
        times = [d.acquisition_time for d in fs.deduplicate(fs.parse_firms_csv(VIIRS_CSV, "V"))]
        assert times == sorted(times)

    def test_same_pixel_different_satellite_is_not_a_duplicate(self):
        v = fs.parse_firms_csv(VIIRS_CSV, "VIIRS_SNPP_NRT")[0]
        other = fs.FireDetection(**{**v.__dict__, "satellite": "1"})
        assert len(fs.deduplicate([v, other])) == 2


class TestFetch:
    def test_url_shape_is_west_south_east_north(self):
        url = fs.build_area_url("VIIRS_SNPP_NRT", (68.0, 20.0, 75.0, 25.0), 1, "KEY123")
        assert url.endswith("/api/area/csv/KEY123/VIIRS_SNPP_NRT/68.0,20.0,75.0,25.0/1")

    async def test_missing_key_returns_fallback_observations(self):
        dets = await fs.fetch_detections(map_key="")
        assert len(dets) > 0

    @respx.mock
    async def test_merges_multiple_sources_and_dedupes(self):
        respx.get(url__regex=r".*VIIRS_SNPP_NRT.*").mock(
            return_value=httpx.Response(200, text=VIIRS_CSV)
        )
        respx.get(url__regex=r".*MODIS_NRT.*").mock(
            return_value=httpx.Response(200, text=MODIS_CSV)
        )
        dets = await fs.fetch_detections(
            bbox=(68.0, 20.0, 75.0, 25.0),
            day_range=1,
            sources=["VIIRS_SNPP_NRT", "MODIS_NRT"],
            map_key="KEY123",
        )
        assert len(dets) == 4
        assert {d.instrument for d in dets} == {"VIIRS", "MODIS"}

    @respx.mock
    async def test_one_dead_source_does_not_lose_the_others(self):
        respx.get(url__regex=r".*VIIRS_SNPP_NRT.*").mock(
            return_value=httpx.Response(200, text=VIIRS_CSV)
        )
        respx.get(url__regex=r".*MODIS_NRT.*").mock(return_value=httpx.Response(500))
        dets = await fs.fetch_detections(
            sources=["VIIRS_SNPP_NRT", "MODIS_NRT"], map_key="KEY123"
        )
        assert len(dets) == 3

    @respx.mock
    async def test_invalid_key_response_does_not_crash_the_run(self):
        respx.get(url__regex=r".*").mock(return_value=httpx.Response(200, text="Invalid MAP_KEY"))
        assert await fs.fetch_detections(sources=["VIIRS_SNPP_NRT"], map_key="BAD") == []


class TestMapKeyProbe:
    @respx.mock
    async def test_reports_quota(self):
        respx.get(url__regex=r".*mapkey_status.*").mock(
            return_value=httpx.Response(200, json={"current_transactions": 12, "transaction_limit": 5000})
        )
        result = await fs.probe_map_key("KEY123")
        assert result["ok"] is True and "12/5000" in result["detail"]

    async def test_unconfigured_key_reports_not_ok(self):
        assert (await fs.probe_map_key(""))["ok"] is False

    @respx.mock
    async def test_network_failure_reports_rather_than_raises(self):
        respx.get(url__regex=r".*mapkey_status.*").mock(side_effect=httpx.ConnectError("boom"))
        assert (await fs.probe_map_key("KEY123"))["ok"] is False
