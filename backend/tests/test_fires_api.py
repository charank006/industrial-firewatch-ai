"""Fire read API - the contract the frontend adapter is written against."""

import datetime
from urllib.parse import quote

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.fires import format_local_time, provisional_severity
from app.main import app
from app.services.fire_event_service import process_detections
from tests.conftest import make_detection

BASE = datetime.datetime(2026, 9, 8, 4, 6, tzinfo=datetime.timezone.utc)
SURAT = (21.1738, 72.8345)


@pytest.fixture
async def client(db):
    """Bind the app's get_db dependency to the test session."""
    from app.database.connection import get_db

    async def override():
        yield db

    app.dependency_overrides[get_db] = override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


class TestLocalTimeRendering:
    """The old code appended " IST" to utcnow() output, labelling UTC as IST
    and making every displayed time 5h30m wrong."""

    def test_utc_is_converted_before_the_label_is_applied(self):
        # 04:06 UTC is 09:36 in Asia/Kolkata.
        assert format_local_time(BASE) == "09:36 IST"

    def test_naive_input_is_treated_as_utc(self):
        assert format_local_time(datetime.datetime(2026, 9, 8, 4, 6)) == "09:36 IST"

    def test_none_stays_none(self):
        assert format_local_time(None) is None


class TestProvisionalSeverity:
    @pytest.mark.parametrize("frp,expected", [(150.0, "HIGH"), (50.0, "MEDIUM"), (5.0, "LOW")])
    def test_frp_bands(self, frp, expected):
        assert provisional_severity(frp) == expected


class TestFiresEndpoint:
    async def test_empty_database_returns_an_empty_list_not_an_error(self, client):
        body = (await client.get("/api/fires")).json()
        assert body["total"] == 0 and body["fires"] == []

    async def test_serialised_event_carries_the_adapter_contract(self, client, db):
        await process_detections(db, [make_detection(*SURAT, BASE, frp=184.6)])

        fire = (await client.get("/api/fires")).json()["fires"][0]
        for field in (
            "fire_event_id",
            "latitude",
            "longitude",
            "frp_latest_mw",
            "brightness_k",
            "detection_confidence_pct",
            "classification_confidence_pct",
            "prediction",
            "model_version",
            "severity",
            "time_formatted",
            "location_name",
            "nearest_facility_name",
            "nearest_facility_distance_km",
            "recurrence_count",
            "history_days",
            "reasoning_steps",
            "suggested_action",
            "is_new",
        ):
            assert field in fire, f"missing contract field: {field}"

    async def test_classification_is_absent_rather_than_invented(self, client, db):
        """Phase 5 owns classification. Until then the API must say it has
        none, not guess a class the dashboard would present as fact."""
        await process_detections(db, [make_detection(*SURAT, BASE)])
        fire = (await client.get("/api/fires")).json()["fires"][0]

        assert fire["prediction"] is None
        assert fire["classification_confidence_pct"] is None
        assert fire["probabilities"] is None
        assert fire["model_version"] == "unclassified-v0"

    async def test_provisional_severity_is_flagged_as_such(self, client, db):
        await process_detections(db, [make_detection(*SURAT, BASE, frp=184.6)])
        fire = (await client.get("/api/fires")).json()["fires"][0]
        assert fire["severity_is_provisional"] is True
        assert "provisional" in fire["reasoning_steps"][-1]["detail"].lower()

    async def test_recurrence_is_reported_against_real_history_not_a_claimed_180_days(
        self, client, db
    ):
        """Recurrence starts at zero on day one; the UI must be able to say
        'N in the last D days of system history' with a truthful D."""
        await process_detections(db, [make_detection(*SURAT, BASE)])
        body = (await client.get("/api/fires")).json()
        assert body["history_days"] >= 0
        assert "day(s) of system history" in body["fires"][0]["reasoning_steps"][2]["detail"]

    async def test_location_name_falls_back_to_coordinates(self, client, db):
        """Overpass supplies real place names in Phase 4; until then the
        fallback must be honest rather than a placeholder name."""
        await process_detections(db, [make_detection(*SURAT, BASE)])
        name = (await client.get("/api/fires")).json()["fires"][0]["location_name"]
        assert "°N" in name and "°E" in name

    async def test_time_formatted_is_local_not_utc_mislabelled(self, client, db):
        await process_detections(db, [make_detection(*SURAT, BASE)])
        fire = (await client.get("/api/fires")).json()["fires"][0]
        assert fire["time_formatted"] == "09:36 IST"
        assert fire["last_detected"].startswith("2026-09-08T04:06")

    async def test_bbox_filter(self, client, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE),
                make_detection(24.5, 68.5, BASE, satellite="N20"),
            ],
        )
        assert (await client.get("/api/fires")).json()["total"] == 2
        narrow = (await client.get("/api/fires?bbox=72.5,21.0,73.0,21.5")).json()
        assert narrow["total"] == 1
        assert narrow["fires"][0]["longitude"] == pytest.approx(72.8345)

    async def test_malformed_bbox_is_rejected(self, client):
        assert (await client.get("/api/fires?bbox=1,2,3")).status_code == 422

    async def test_malformed_since_is_rejected(self, client):
        assert (await client.get("/api/fires?since=yesterday")).status_code == 422

    async def test_since_filter(self, client, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE - datetime.timedelta(days=5), satellite="OLD"),
                make_detection(20.0, 70.0, BASE, satellite="NEW"),
            ],
        )
        # quote() because "+00:00" would otherwise decode to " 00:00"
        cutoff = quote((BASE - datetime.timedelta(days=1)).isoformat())
        assert (await client.get(f"/api/fires?since={cutoff}")).json()["total"] == 1

    async def test_since_accepts_a_z_suffix(self, client, db):
        await process_detections(db, [make_detection(*SURAT, BASE)])
        cutoff = "2026-09-01T00:00:00Z"
        assert (await client.get(f"/api/fires?since={cutoff}")).json()["total"] == 1

    async def test_since_tolerates_an_unencoded_plus_offset(self, client, db):
        """`+` decodes to a space in a query string, so a correctly written
        offset would otherwise 422."""
        await process_detections(db, [make_detection(*SURAT, BASE)])
        assert (
            await client.get("/api/fires?since=2026-09-01T00:00:00+00:00")
        ).json()["total"] == 1

    async def test_min_frp_filter(self, client, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, frp=200.0),
                make_detection(20.0, 70.0, BASE, frp=1.0, satellite="N20"),
            ],
        )
        assert (await client.get("/api/fires?min_frp=100")).json()["total"] == 1

    async def test_detail_endpoint_and_404(self, client, db):
        await process_detections(db, [make_detection(*SURAT, BASE)])
        fire_id = (await client.get("/api/fires")).json()["fires"][0]["fire_event_id"]
        assert (await client.get(f"/api/fires/{fire_id}")).status_code == 200
        assert (await client.get("/api/fires/FE-999999")).status_code == 404

    async def test_detections_endpoint_returns_the_frp_series(self, client, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, frp=10.0, satellite="A"),
                make_detection(21.1740, 72.8346, BASE + datetime.timedelta(hours=2), frp=90.0, satellite="B"),
            ],
        )
        fire_id = (await client.get("/api/fires")).json()["fires"][0]["fire_event_id"]
        body = (await client.get(f"/api/fires/{fire_id}/detections")).json()
        assert body["count"] == 2
        frps = [d["frp_mw"] for d in body["detections"]]
        assert frps == [10.0, 90.0]  # ascending by time


class TestFacilitiesAndSummary:
    async def test_facilities_come_from_osm_not_a_seeded_registry(self, client, db):
        """With no enrichment yet there are no sites - and that is the point.
        The old registry always returned its six Gujarat plants regardless of
        where the pipeline was actually looking."""
        body = (await client.get("/api/facilities")).json()
        assert body["source"] == "openstreetmap"
        assert body["total"] == 0
        assert body["facilities"] == []

    async def test_the_facilities_payload_states_its_coverage_limit(self, client):
        """Many industrial parcels are unnamed or unmapped, so the list is a
        lower bound and must not read as a complete asset register."""
        body = (await client.get("/api/facilities")).json()
        assert "lower bound" in body["caveat"]

    async def test_dashboard_summary_counts(self, client, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, frp=200.0),
                make_detection(20.0, 70.0, BASE, frp=5.0, satellite="N20"),
            ],
        )
        body = (await client.get("/api/dashboard/summary")).json()
        assert body["total_detected"] == 2
        assert body["high_priority_count"] == 1
        assert body["low_priority_count"] == 1
        assert body["severity_is_provisional"] is True
