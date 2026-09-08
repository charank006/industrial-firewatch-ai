"""Weather baseline tests.

The same-local-hour alignment is the part of this pipeline most likely to be
subtly wrong in a way that never crashes, so it is pinned to synthetic hourly
series with known values.
"""

import datetime

import httpx
import pytest
import respx

from app.services import weather_service as ws
from app.services.weather_service import WeatherError

TZ_OFFSET = 19800  # Asia/Kolkata, UTC+5:30


def build_payload(
    temps_by_local_hour: dict[str, float],
    humidity_by_local_hour: dict[str, float] | None = None,
    wind_by_local_hour: dict[str, float] | None = None,
    precipitation_by_local_hour: dict[str, float] | None = None,
    offset_seconds: int = TZ_OFFSET,
) -> dict:
    times = sorted(temps_by_local_hour)
    return {
        "latitude": 21.17,
        "longitude": 72.83,
        "timezone": "Asia/Kolkata",
        "utc_offset_seconds": offset_seconds,
        "hourly": {
            "time": times,
            "temperature_2m": [temps_by_local_hour[t] for t in times],
            "relative_humidity_2m": [(humidity_by_local_hour or {}).get(t) for t in times],
            "wind_speed_10m": [(wind_by_local_hour or {}).get(t) for t in times],
            "wind_direction_10m": [72.0 for _ in times],
            "wind_gusts_10m": [None for _ in times],
            "precipitation": [(precipitation_by_local_hour or {}).get(t, 0.0) for t in times],
            "surface_pressure": [None for _ in times],
        },
    }


def spec_example_series() -> dict[str, float]:
    """The worked example from spec section 9.

    Sep 2..7 at 14:00 -> 31.2, 31.8, 32.1, 32.6, 33.0, 33.4  (mean 32.35)
    Sep 8  at 14:00 -> 39.8                       (anomaly +7.45)
    """
    return {
        "2026-09-02T14:00": 31.2,
        "2026-09-03T14:00": 31.8,
        "2026-09-04T14:00": 32.1,
        "2026-09-05T14:00": 32.6,
        "2026-09-06T14:00": 33.0,
        "2026-09-07T14:00": 33.4,
        "2026-09-08T14:00": 39.8,
    }


def detection_at_local(local_naive: str, offset_seconds: int = TZ_OFFSET) -> datetime.datetime:
    """Build the UTC instant corresponding to a local wall-clock time."""
    local = datetime.datetime.strptime(local_naive, "%Y-%m-%dT%H:%M")
    return (local - datetime.timedelta(seconds=offset_seconds)).replace(
        tzinfo=datetime.timezone.utc
    )


class TestSpecWorkedExample:
    def test_baseline_and_anomaly_match_the_spec(self):
        result = ws.analyse(
            build_payload(spec_example_series()), detection_at_local("2026-09-08T14:20")
        )
        assert result.six_day_avg_temperature_c == pytest.approx(32.35, abs=0.01)
        assert result.temperature_anomaly_c == pytest.approx(7.45, abs=0.01)
        assert result.baseline_quality == "ok"
        assert result.baseline_samples == 6

    def test_detection_minutes_are_floored_to_the_hour(self):
        """A fire at 14:20 is compared against the 14:00 slot."""
        result = ws.analyse(
            build_payload(spec_example_series()), detection_at_local("2026-09-08T14:59")
        )
        assert result.local_hour == "2026-09-08T14:00"
        assert result.current_temperature_c == 39.8


class TestLocalHourAlignment:
    def test_utc_detection_is_shifted_into_the_local_frame(self):
        """08:50 UTC is 14:20 IST, so it must select the 14:00 local slot -
        not the 08:00 one. Comparing on UTC would pick the wrong hour."""
        utc = datetime.datetime(2026, 9, 8, 8, 50, tzinfo=datetime.timezone.utc)
        result = ws.analyse(build_payload(spec_example_series()), utc)
        assert result.local_hour == "2026-09-08T14:00"
        assert result.current_temperature_c == 39.8

    def test_naive_input_is_treated_as_utc(self):
        naive = datetime.datetime(2026, 9, 8, 8, 50)
        assert ws.analyse(build_payload(spec_example_series()), naive).local_hour == "2026-09-08T14:00"

    def test_baseline_walks_whole_local_days_across_a_dst_boundary(self):
        """Subtracting days on the UTC instant instead of the local wall clock
        drifts by an hour wherever DST applies. Series is built at a constant
        LOCAL 14:00 while the offset changes, so a UTC-based walk would miss."""
        series = {
            "2026-03-05T14:00": 10.0,
            "2026-03-06T14:00": 10.0,
            "2026-03-07T14:00": 10.0,
            "2026-03-08T14:00": 10.0,
            "2026-03-09T14:00": 10.0,
            "2026-03-10T14:00": 10.0,
            "2026-03-11T14:00": 20.0,
        }
        offset = -18000  # US Eastern, UTC-5
        result = ws.analyse(
            build_payload(series, offset_seconds=offset),
            detection_at_local("2026-03-11T14:30", offset_seconds=offset),
        )
        assert result.baseline_samples == 6
        assert result.six_day_avg_temperature_c == pytest.approx(10.0)
        assert result.temperature_anomaly_c == pytest.approx(10.0)


class TestBaselineQuality:
    """Open-Meteo returns null for unavailable hours. A fabricated baseline is
    worse than a missing one, so values are dropped and never imputed."""

    def test_four_of_six_days_is_partial(self):
        series = spec_example_series()
        del series["2026-09-02T14:00"]
        del series["2026-09-03T14:00"]
        result = ws.analyse(build_payload(series), detection_at_local("2026-09-08T14:20"))
        assert result.baseline_quality == "partial"
        assert result.baseline_samples == 4
        assert result.temperature_anomaly_c is not None

    def test_below_minimum_emits_no_anomalies_at_all(self):
        series = {"2026-09-07T14:00": 33.4, "2026-09-08T14:00": 39.8}
        result = ws.analyse(build_payload(series), detection_at_local("2026-09-08T14:20"))
        assert result.baseline_quality == "insufficient"
        assert result.six_day_avg_temperature_c is None
        assert result.temperature_anomaly_c is None
        assert result.temperature_trend_c_per_day is None
        # current conditions are still reported - only the baseline is withheld
        assert result.current_temperature_c == 39.8

    def test_nulls_in_the_series_are_skipped(self):
        payload = build_payload(spec_example_series())
        payload["hourly"]["temperature_2m"][0] = None
        result = ws.analyse(payload, detection_at_local("2026-09-08T14:20"))
        assert result.baseline_samples == 5

    def test_missing_hourly_block_raises(self):
        with pytest.raises(WeatherError):
            ws.analyse({"hourly": {"time": []}}, detection_at_local("2026-09-08T14:20"))


class TestDerivedFeatures:
    def test_z_score_normalises_by_local_variability(self):
        """+7.45C against a tight baseline is a far bigger signal than the same
        delta against a volatile one, which is why the scorer consumes z."""
        result = ws.analyse(
            build_payload(spec_example_series()), detection_at_local("2026-09-08T14:20")
        )
        # sigma = 0.7388 over the six baseline values, so z = 7.45 / 0.7388
        assert result.temperature_stdev_c == pytest.approx(0.739, abs=0.001)
        assert result.temperature_anomaly_z == pytest.approx(10.08, abs=0.01)

    def test_z_score_guards_against_zero_variance(self):
        flat = {f"2026-09-0{d}T14:00": 30.0 for d in range(2, 8)}
        flat["2026-09-08T14:00"] = 31.0
        result = ws.analyse(build_payload(flat), detection_at_local("2026-09-08T14:20"))
        assert result.temperature_stdev_c == 0.0
        assert result.temperature_anomaly_z == pytest.approx(2.0)  # 1.0 / max(0, 0.5)

    def test_warming_trend_slope_is_positive(self):
        result = ws.analyse(
            build_payload(spec_example_series()), detection_at_local("2026-09-08T14:20")
        )
        assert result.temperature_trend_c_per_day > 0

    def test_vpd_rises_as_humidity_falls(self):
        dry = ws.vapour_pressure_deficit_kpa(35.0, 20.0)
        humid = ws.vapour_pressure_deficit_kpa(35.0, 90.0)
        assert dry > humid > 0

    def test_vpd_is_none_without_inputs(self):
        assert ws.vapour_pressure_deficit_kpa(None, 50.0) is None
        assert ws.vapour_pressure_deficit_kpa(30.0, None) is None

    def test_humidity_anomaly_is_negative_when_drier_than_baseline(self):
        humidity = {t: 47.0 for t in spec_example_series()}
        humidity["2026-09-08T14:00"] = 29.0
        result = ws.analyse(
            build_payload(spec_example_series(), humidity_by_local_hour=humidity),
            detection_at_local("2026-09-08T14:20"),
        )
        assert result.humidity_anomaly_pct == pytest.approx(-18.0)

    def test_dry_hours_counts_back_to_last_rain(self):
        temps = {
            f"2026-09-08T{h:02d}:00": 30.0 for h in range(0, 15)
        } | {f"2026-09-0{d}T14:00": 30.0 for d in range(2, 8)}
        precipitation = {f"2026-09-08T{h:02d}:00": 0.0 for h in range(0, 15)}
        precipitation["2026-09-08T11:00"] = 4.0
        result = ws.analyse(
            build_payload(temps, precipitation_by_local_hour=precipitation),
            detection_at_local("2026-09-08T14:20"),
        )
        assert result.dry_hours == 3

    def test_dry_hours_is_none_when_no_precipitation_data_exists(self):
        """Must not claim a week of drought just because the field is null."""
        payload = build_payload(spec_example_series())
        payload["hourly"]["precipitation"] = [None] * len(payload["hourly"]["time"])
        result = ws.analyse(payload, detection_at_local("2026-09-08T14:20"))
        assert result.dry_hours is None


class TestRequestShape:
    def test_uses_forecast_endpoint_with_past_days_not_archive(self):
        """archive-api lags ~5 days, which would put the current hour AND all
        six baseline days inside the lag window - every value null."""
        assert "archive" not in ws.settings.OPEN_METEO_URL
        params = ws.build_request_params(21.17, 72.83)
        assert params["past_days"] >= 7
        assert params["timezone"] == "auto"  # required for local-hour alignment
        assert params["wind_speed_unit"] == "ms"

    def test_requests_every_variable_the_spec_names(self):
        hourly = ws.build_request_params(21.17, 72.83)["hourly"]
        for required in (
            "temperature_2m",
            "relative_humidity_2m",
            "wind_speed_10m",
            "wind_direction_10m",
            "precipitation",
        ):
            assert required in hourly

    @respx.mock
    async def test_fetch_round_trip(self):
        respx.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json=build_payload(spec_example_series()))
        )
        result = await ws.fetch_weather_analysis(
            21.17, 72.83, detection_at_local("2026-09-08T14:20")
        )
        assert result.temperature_anomaly_c == pytest.approx(7.45, abs=0.01)

    @respx.mock
    async def test_probe_reports_failure_rather_than_raising(self):
        respx.get(url__startswith="https://api.open-meteo.com").mock(
            side_effect=httpx.ConnectError("down")
        )
        assert (await ws.probe_open_meteo())["ok"] is False
