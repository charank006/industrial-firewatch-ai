"""Phase 0a regression tests.

These lock in the three verified blockers and the correctness fixes, so a
later refactor cannot silently reintroduce them.
"""

import datetime
import re

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

client = TestClient(app)

ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class TestConfigLoadsEnv:
    """Blocker #3: `class Config` set no env_file, so .env was never read."""

    def test_env_file_is_actually_loaded(self, tmp_path, monkeypatch):
        env = tmp_path / ".env"
        env.write_text("NASA_FIRMS_MAP_KEY=key_from_env_file\n")
        monkeypatch.chdir(tmp_path)
        assert Settings().NASA_FIRMS_MAP_KEY == "key_from_env_file"

    def test_map_key_defaults_empty_without_env(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        monkeypatch.delenv("NASA_FIRMS_MAP_KEY", raising=False)
        assert Settings().NASA_FIRMS_MAP_KEY == ""

    def test_aoi_bbox_parses_to_west_south_east_north(self):
        assert Settings(FIRMS_AOI_BBOX="68.0,20.0,75.0,25.0").aoi_bbox == (68.0, 20.0, 75.0, 25.0)

    def test_aoi_bbox_rejects_malformed(self):
        try:
            Settings(FIRMS_AOI_BBOX="1,2,3").aoi_bbox
        except ValueError as exc:
            assert "west,south,east,north" in str(exc)
        else:
            raise AssertionError("malformed bbox should raise")


class TestTimestampsAreHonestUTC:
    """`datetime.utcnow()` output was suffixed " IST", making every rendered
    time 5h30m wrong while labelled correct."""

    def test_seed_incident_created_at_is_iso_utc(self):
        body = client.get("/api/incidents").json()
        assert body, "seed store should not be empty"
        for incident in body:
            assert ISO_Z.match(incident["created_at"]), incident["created_at"]
            assert "IST" not in incident["created_at"]

    def test_created_incident_gets_iso_utc(self):
        resp = client.post(
            "/api/incidents",
            json={"title": "T", "type": "Industrial Fire", "lat": 21.1, "lng": 72.8},
        )
        assert resp.status_code == 200
        created = resp.json()["created_at"]
        assert ISO_Z.match(created), created
        # and it really is close to now, not an arbitrary string
        parsed = datetime.datetime.strptime(created, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=datetime.timezone.utc
        )
        assert abs((datetime.datetime.now(datetime.timezone.utc) - parsed).total_seconds()) < 60


class TestMovedEndpointsStillWork:
    """The router split must be behaviour-preserving."""

    def test_root_and_health(self):
        assert client.get("/").json()["name"] == "Industrial FireWatch API"
        assert client.get("/api/health").json()["status"] == "ok"

    def test_incident_lookup_and_404(self):
        assert client.get("/api/incidents/FW-BETA-1042").json()["id"] == "FW-BETA-1042"
        assert client.get("/api/incidents/NOPE").status_code == 404

    def test_risk_analysis_finds_same_recipients_as_before_refactor(self):
        body = client.post(
            "/api/incidents/FW-BETA-1042/risk-analysis",
            json={"incident_id": "FW-BETA-1042", "radius_meters": 1000},
        ).json()
        assert body["affected_users_count"] == 2
        assert body["emergency_services_count"] == 3

    def test_authorize_then_read_back_shares_one_store(self):
        """The handler used `global RECIPIENT_RECORDS_DB` and rebound it. Now
        that the store is imported from app.seed_data, rebinding would orphan
        the shared reference and the read-back would return nothing."""
        auth = client.post(
            "/api/incidents/FW-BETA-1041/alerts/authorize",
            json={"incident_id": "FW-BETA-1041", "channels": ["FCM", "SMS"]},
        ).json()
        assert auth["status"] == "AUTHORIZED"
        assert auth["dispatched_recipients_count"] > 0

        readback = client.get("/api/incidents/FW-BETA-1041/notifications").json()
        assert len(readback) == auth["dispatched_recipients_count"]

    def test_acknowledge_transitions_status(self):
        client.post(
            "/api/incidents/FW-BETA-1039/alerts/authorize",
            json={"incident_id": "FW-BETA-1039", "channels": ["SMS"]},
        )
        rid = client.get("/api/incidents/FW-BETA-1039/notifications").json()[0]["id"]
        acked = client.post(f"/api/notifications/{rid}/acknowledge").json()
        assert acked["status"] == "ACKNOWLEDGED"
        assert ISO_Z.match(acked["acknowledged_at"])


class TestSystemStatusIsHonest:
    """It previously reported "POSTGIS ST_DWITHIN ACTIVE" as a string literal
    with nothing probed."""

    def test_every_probe_reports_a_real_result(self):
        """Each probe must carry an actual outcome and timestamp, whether the
        subsystem is up or not - never a reassuring hardcoded string."""
        body = client.get("/api/system/status").json()
        assert body["status"] in {"OPERATIONAL", "DEGRADED"}
        # The old endpoint returned this as an unconditional literal.
        assert "POSTGIS ST_DWITHIN ACTIVE (SRID 4326)" not in str(body)

        for name, probe in body["probes"].items():
            assert isinstance(probe["ok"], bool), name
            assert probe["detail"], name
            assert probe["checked_at"], name

    def test_postgis_success_is_evidenced_by_a_real_version_string(self):
        """When postgis reports ok it must be because PostGIS_Version() and a
        real ST_DWithin call both succeeded - not because a literal said so."""
        probe = client.get("/api/system/status").json()["probes"]["postgis"]
        if probe["ok"]:
            assert "PostGIS" in probe["detail"]
            assert "ST_DWithin verified" in probe["detail"]
            assert probe["latency_ms"] is not None
        else:
            # An honest failure names the actual exception.
            assert ":" in probe["detail"]

    def test_echoes_real_thresholds_for_methodology_page(self):
        thresholds = client.get("/api/system/status").json()["thresholds"]
        assert thresholds["event_link_radius_m"] == 1000.0
        assert thresholds["max_event_extent_km"] == 10.0
