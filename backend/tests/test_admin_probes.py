"""Admin probe endpoints - the Phase 1 milestone surface."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from tests.test_weather_service import build_payload, spec_example_series

client = TestClient(app)

FIRMS_CSV = """country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
IND,21.17380,72.83450,347.2,0.42,0.38,2026-09-08,0830,N,VIIRS,h,2.0NRT,298.1,184.6,D
IND,21.11400,72.63900,328.5,0.51,0.44,2026-09-08,0830,N,VIIRS,n,2.0NRT,290.3,82.3,D
"""


@pytest.fixture
def mocked_apis():
    with respx.mock(assert_all_called=False) as mock:
        mock.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json=build_payload(spec_example_series()))
        )
        mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
            return_value=httpx.Response(200, text=FIRMS_CSV)
        )
        yield mock


class TestAdminGuard:
    def test_unset_token_leaves_endpoint_open_but_says_so(self, mocked_apis, monkeypatch):
        """Silent insecurity is worse than loud insecurity."""
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "")
        body = client.get("/api/admin/probe/weather?lat=21.17&lon=72.83").json()
        assert "UNGUARDED" in body["warning"]

    def test_set_token_rejects_missing_header(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        assert client.get("/api/admin/probe/weather?lat=21.17&lon=72.83").status_code == 401

    def test_set_token_rejects_wrong_header(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        resp = client.get(
            "/api/admin/probe/weather?lat=21.17&lon=72.83", headers={"X-Admin-Token": "nope"}
        )
        assert resp.status_code == 401

    def test_set_token_accepts_correct_header(self, mocked_apis, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        resp = client.get(
            "/api/admin/probe/weather?lat=21.17&lon=72.83", headers={"X-Admin-Token": "s3cret"}
        )
        assert resp.status_code == 200
        assert resp.json()["warning"] is None


class TestWeatherProbe:
    def test_returns_baseline_and_anomaly(self, mocked_apis):
        body = client.get(
            "/api/admin/probe/weather?lat=21.17&lon=72.83&at=2026-09-08T08:50:00Z"
        ).json()
        weather = body["weather"]
        assert weather["six_day_avg_temperature_c"] == pytest.approx(32.35, abs=0.01)
        assert weather["temperature_anomaly_c"] == pytest.approx(7.45, abs=0.01)

    def test_states_the_scientific_caveat(self, mocked_apis):
        """Spec Rule 2 - the anomaly is supporting evidence, never proof."""
        body = client.get("/api/admin/probe/weather?lat=21.17&lon=72.83").json()
        assert "not proof of a fire" in body["interpretation"]

    def test_rejects_out_of_range_coordinates(self):
        assert client.get("/api/admin/probe/weather?lat=999&lon=72.83").status_code == 422

    def test_rejects_unparseable_timestamp(self):
        resp = client.get("/api/admin/probe/weather?lat=21.17&lon=72.83&at=yesterday")
        assert resp.status_code == 422


class TestPipelineProbe:
    def test_joins_detections_to_weather(self, mocked_apis, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        body = client.get("/api/admin/probe?limit=2").json()
        assert body["events_analysed"] == 2
        assert body["firms_error"] is None
        first = body["results"][0]
        assert first["detection"]["frp_mw"] == 184.6
        assert first["weather"]["baseline_quality"] == "ok"

    def test_synthetic_coordinate_works_without_a_firms_key(self, mocked_apis, monkeypatch):
        """The weather half must be demonstrable before a MAP_KEY exists."""
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "")
        body = client.get("/api/admin/probe?lat=21.17&lon=72.83").json()
        assert body["events_analysed"] == 1
        assert body["results"][0]["detection"]["synthetic"] is True

    def test_missing_key_is_reported_not_raised(self, mocked_apis, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "")
        body = client.get("/api/admin/probe").json()
        assert body["events_analysed"] == 0
        assert "MAP_KEY" in body["firms_error"]

    def test_weather_failure_degrades_one_entry_not_the_run(self, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
                return_value=httpx.Response(200, text=FIRMS_CSV)
            )
            mock.get(url__startswith="https://api.open-meteo.com").mock(
                side_effect=httpx.ConnectError("weather down")
            )
            body = client.get("/api/admin/probe?limit=2").json()
        assert body["events_analysed"] == 2
        assert all(r["weather"] is None for r in body["results"])
        assert all("ConnectError" in r["weather_error"] for r in body["results"])
