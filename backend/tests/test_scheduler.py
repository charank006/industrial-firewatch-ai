"""Background scheduling (spec section 24)."""

import datetime

import httpx
import pytest
import pytest_asyncio
import respx
from fastapi.testclient import TestClient

from sqlalchemy import text

from app.config import settings
from app.main import app
from app.models.models import FireEvent, SeedRun
from app.workers import jobs, scheduler
from tests.conftest import make_detection  # noqa: F401 - shared fixture helper

FIRMS_CSV = """country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
IND,21.17380,72.83450,347.2,0.42,0.38,2026-09-08,0830,N,VIIRS,h,2.0NRT,298.1,184.6,D
"""


@pytest_asyncio.fixture(autouse=True)
async def _stop_scheduler():
    """Async so teardown runs while the loop is still alive - APScheduler's
    shutdown touches the loop, and a sync fixture would run after it closed."""
    yield
    scheduler.shutdown_scheduler()


class TestSchedulerConfiguration:
    """AsyncIOScheduler binds to the running loop on start(), which in
    production the FastAPI lifespan provides - so these run async."""

    async def test_jobs_are_registered(self, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        sched = scheduler.start_scheduler()
        assert sched is not None
        assert {job.id for job in sched.get_jobs()} == {
            "firms_ingest",
            "event_analysis",
            "risk_refresh",
            "surroundings_retry",
            "containment_sweep",
        }

    async def test_overlapping_runs_are_prevented(self, monkeypatch):
        """Overpass can take a full minute per event, so an analysis pass can
        outlast its own interval. Overlapping runs would compete for the same
        pending rows and multiply load on the already-slow service."""
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        sched = scheduler.start_scheduler()
        for job in sched.get_jobs():
            assert job.max_instances == 1, job.id
            assert job.coalesce is True, job.id

    async def test_disabled_scheduler_starts_nothing(self, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", False)
        assert scheduler.start_scheduler() is None
        assert scheduler.job_status() == []

    async def test_start_is_idempotent(self, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        first = scheduler.start_scheduler()
        assert scheduler.start_scheduler() is first

    async def test_job_status_reports_next_run(self, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        scheduler.start_scheduler()
        status = scheduler.job_status()
        assert len(status) == 5
        assert all(entry["next_run"] for entry in status)


# The row above is in Surat, Gujarat. It stays there deliberately: these
# tests are about the ingest job's bookkeeping, not about the AOI, so they
# switch clipping off explicitly rather than depending on whichever boundary
# .env happens to configure. TestAoiClipping below covers the clip itself.
TELANGANA_CSV = """country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
IND,17.38500,78.48600,347.2,0.42,0.38,2026-09-08,0830,N,VIIRS,h,2.0NRT,298.1,184.6,D
IND,19.93100,79.12200,340.1,0.44,0.39,2026-09-08,0830,N20,VIIRS,n,2.0NRT,295.0,42.0,D
"""


class TestIngestJob:
    @pytest_asyncio.fixture(autouse=True)
    def _no_clipping(self, monkeypatch):
        monkeypatch.setattr(settings, "AOI_BOUNDARY", "")

    async def test_records_a_successful_run(self, db, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))

        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
                return_value=httpx.Response(200, text=FIRMS_CSV)
            )
            result = await jobs.ingest_job()

        assert result["ok"] is True
        assert result["detections_inserted"] == 1

        runs = list((await db.execute(_select_runs())).scalars())
        assert len(runs) == 1
        assert runs[0].ok is True
        assert runs[0].detections_inserted == 1

    async def test_a_failure_is_recorded_not_swallowed(self, db, monkeypatch):
        """A scheduled job that raises would be logged and dropped by
        APScheduler. The failure has to reach ingest_runs, because that
        history is what tells an operator the pipeline stopped."""
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "")
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))

        result = await jobs.ingest_job()
        assert result["ok"] is False
        assert "MAP_KEY" in result["error"]

    async def test_is_idempotent_across_runs(self, db, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))

        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
                return_value=httpx.Response(200, text=FIRMS_CSV)
            )
            first = await jobs.ingest_job()
            second = await jobs.ingest_job()

        assert first["detections_inserted"] == 1
        assert second["detections_inserted"] == 0
        assert second["events_created"] == 0


class TestWorkerProbe:
    async def test_disabled_scheduler_is_reported_honestly(self, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", False)
        probe = await jobs.probe_worker()
        assert probe["ok"] is False
        assert "disabled" in probe["detail"].lower()

    async def test_no_history_is_not_reported_as_healthy(self, db, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))
        probe = await jobs.probe_worker()
        assert probe["ok"] is False
        assert "no ingest" in probe["detail"].lower()

    async def test_recent_success_is_healthy(self, db, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))
        now = datetime.datetime.now(datetime.timezone.utc)
        db.add(
            SeedRun(
                started_at=now, finished_at=now, ok=True, detections_inserted=3, events_created=2
            )
        )
        await db.flush()

        probe = await jobs.probe_worker()
        assert probe["ok"] is True
        assert "3 new detection" in probe["detail"]

    async def test_a_stale_pipeline_is_flagged(self, db, monkeypatch):
        """Silence is the failure mode that matters: the API keeps serving
        yesterday's data and nothing looks broken."""
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        monkeypatch.setattr(settings, "FIRMS_POLL_MINUTES", 15)
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)
        db.add(SeedRun(started_at=old, finished_at=old, ok=True))
        await db.flush()

        probe = await jobs.probe_worker()
        assert probe["ok"] is False
        assert "exceeds expected" in probe["detail"]

    async def test_a_failed_last_run_is_flagged(self, db, monkeypatch):
        monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))
        now = datetime.datetime.now(datetime.timezone.utc)
        db.add(SeedRun(started_at=now, finished_at=now, ok=False, detail="Invalid MAP_KEY"))
        await db.flush()

        probe = await jobs.probe_worker()
        assert probe["ok"] is False
        assert "FAILED" in probe["detail"]


class TestAdminGuard:
    def test_unguarded_state_is_surfaced_on_the_dashboard(self, monkeypatch):
        """An unguarded quota-spending endpoint should be visible on the status
        page, not discovered by reading an admin response."""
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "")
        body = TestClient(app).get("/api/system/status").json()
        assert any("ADMIN_API_TOKEN" in w for w in body["warnings"])

    def test_no_warning_once_a_token_is_set(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        body = TestClient(app).get("/api/system/status").json()
        assert body["warnings"] == []

    def test_wrong_token_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        client = TestClient(app)
        assert client.post("/api/admin/backfill", headers={"X-Admin-Token": "nope"}).status_code == 401

    def test_missing_token_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "s3cret")
        assert TestClient(app).post("/api/admin/backfill").status_code == 401


class TestBackfill:
    async def test_day_range_is_clamped_to_the_firms_maximum(self, db, monkeypatch):
        """FIRMS caps day_range at 10; deeper history needs a manual request."""
        captured = {}

        async def fake_ingest(day_range=None):
            captured["day_range"] = day_range
            return {"ok": True}

        monkeypatch.setattr(jobs, "ingest_job", fake_ingest)
        await jobs.backfill(day_range=90)
        assert captured["day_range"] == 10

        await jobs.backfill(day_range=0)
        assert captured["day_range"] == 1


# --- helpers --------------------------------------------------------------


class _Session:
    """Adapts the test session to the `async with sessionmaker()()` shape the
    jobs use, without committing away the fixture's transaction."""

    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False


def _select_runs():
    from sqlalchemy import select

    return select(SeedRun).order_by(SeedRun.id)


class TestCredentialLeakage:
    """The FIRMS MAP_KEY is a URL PATH SEGMENT, so any component that logs
    full request URLs writes the credential in plaintext."""

    def test_httpx_request_logging_is_suppressed(self):
        import logging

        import app.main  # noqa: F401 - importing installs the log configuration

        assert logging.getLogger("httpx").level >= logging.WARNING
        assert logging.getLogger("httpcore").level >= logging.WARNING

    def test_the_key_is_in_the_url_path_so_url_logging_would_leak_it(self):
        """Pins the reason the suppression above exists."""
        from app.services.firms_service import build_area_url

        url = build_area_url("VIIRS_SNPP_NRT", (68.0, 20.0, 75.0, 25.0), 1, "SECRET_KEY")
        assert "SECRET_KEY" in url


class TestIngestClipsToTheBoundary:
    """FIRMS can only be queried by a rectangle, and the Telangana box overlaps
    Chandrapur district in Maharashtra. Clipping happens before storage, so a
    Maharashtra fire is never recorded, classified and reported as a Telangana
    one - which is exactly what had been happening to a fifth of the events."""

    async def test_a_detection_outside_the_boundary_is_not_stored(self, db, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        monkeypatch.setattr(settings, "AOI_BOUNDARY", "telangana")
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))

        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
                return_value=httpx.Response(200, text=TELANGANA_CSV)
            )
            result = await jobs.ingest_job()

        # Hyderabad kept, Ghugus dropped - both inside the FIRMS rectangle.
        assert result["ok"] is True
        assert result["detections_inserted"] == 1

        rows = (await db.execute(text("SELECT latitude FROM fire_detections"))).scalars().all()
        assert [round(float(lat), 2) for lat in rows] == [17.39]

    async def test_an_unset_boundary_keeps_the_whole_rectangle(self, db, monkeypatch):
        monkeypatch.setattr(settings, "NASA_FIRMS_MAP_KEY", "KEY123")
        monkeypatch.setattr(settings, "AOI_BOUNDARY", "")
        monkeypatch.setattr(jobs, "get_sessionmaker", lambda: (lambda: _Session(db)))

        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__regex=r".*firms\.modaps.*/api/area/csv/.*").mock(
                return_value=httpx.Response(200, text=TELANGANA_CSV)
            )
            result = await jobs.ingest_job()

        assert result["detections_inserted"] == 2
