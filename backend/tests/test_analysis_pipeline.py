"""Transaction boundaries around the analysis pipeline.

The pipeline's slow step is Overpass, which can run to a 60s timeout and
retries across mirrors beyond that. Everything here exists to prove that no
write transaction is held while that happens: an earlier version claimed the
whole batch, then awaited Overpass with row locks on `fire_events` still held,
which blocked ingest and made a killed worker strand its batch permanently.
"""

import asyncio
import datetime

import httpx
import pytest
import pytest_asyncio
import respx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.database import connection
from app.models.models import FireEvent
from app.services import analysis_service
from app.services.fire_event_service import process_detections
from app.services.osm import client as overpass
from tests.conftest import TABLES, make_detection
from tests.test_weather_service import build_payload, spec_example_series

BASE = datetime.datetime(2026, 9, 8, 8, 0, tzinfo=datetime.timezone.utc)


@pytest_asyncio.fixture
async def pipeline_db():
    """Point `get_sessionmaker()` at the TEST database.

    `drain_pending` opens sessions of its own rather than accepting one, so
    without this it would reach for DATABASE_URL - the development database
    these fixtures TRUNCATE.
    """
    engine = create_async_engine(settings.test_database_url, poolclass=None)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT PostGIS_Version()"))
    except Exception as exc:  # noqa: BLE001
        await engine.dispose()
        pytest.skip(f"No PostGIS database available: {type(exc).__name__}")

    maker = async_sessionmaker(engine, expire_on_commit=False)
    previous = (connection._engine, connection._sessionmaker)
    connection._engine, connection._sessionmaker = engine, maker

    async with maker() as session:
        await session.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await session.execute(text("ALTER SEQUENCE fire_event_id_seq RESTART WITH 1"))
        await session.commit()

    try:
        yield maker
    finally:
        connection._engine, connection._sessionmaker = previous
        await engine.dispose()


@pytest.fixture
def mocked_weather():
    with respx.mock(assert_all_called=False) as mock:
        mock.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json=build_payload(spec_example_series()))
        )
        yield mock


async def seed_events(maker, count: int = 1) -> list[str]:
    async with maker() as db:
        await process_detections(
            db,
            [
                make_detection(21.0 + i * 0.5, 72.8, BASE, frp=100.0 - i, satellite=f"S{i}")
                for i in range(count)
            ],
        )
        await db.commit()
        rows = await db.execute(text("SELECT id FROM fire_events ORDER BY frp_max_mw DESC"))
        return [row[0] for row in rows]


async def status_of(maker, event_id: str) -> str:
    async with maker() as db:
        return (
            await db.execute(
                text("SELECT analysis_status FROM fire_events WHERE id = :id"), {"id": event_id}
            )
        ).scalar_one()


class TestNoLockAcrossTheNetwork:
    async def test_another_writer_can_update_the_event_mid_fetch(
        self, pipeline_db, mocked_weather
    ):
        """The regression this refactor exists for.

        While Overpass is in flight, an independent session must be able to
        write the very row being analysed. With the batch wrapped in one
        transaction this blocks until the whole batch finishes, and here would
        fail on lock_timeout.
        """
        [event_id] = await seed_events(pipeline_db)
        outcome = {}

        async def slow_overpass(lat, lon, radius_m, client=None):
            async with pipeline_db() as other:
                await other.execute(text("SET LOCAL lock_timeout = '3s'"))
                await other.execute(
                    text("UPDATE fire_events SET location_name = 'concurrent' WHERE id = :id"),
                    {"id": event_id},
                )
                await other.commit()
                outcome["wrote"] = True
            await asyncio.sleep(0)
            return []

        original = overpass.fetch_elements
        overpass.fetch_elements = slow_overpass
        try:
            await analysis_service.drain_pending(limit=1)
        finally:
            overpass.fetch_elements = original

        assert outcome.get("wrote") is True, "a concurrent writer was blocked by the analysis lock"

    async def test_the_claim_is_committed_before_the_fetch_begins(
        self, pipeline_db, mocked_weather
    ):
        """Claim-then-commit is what lets a second worker skip this event
        instead of queueing behind it."""
        [event_id] = await seed_events(pipeline_db)
        seen = {}

        async def observing_overpass(lat, lon, radius_m, client=None):
            seen["status"] = await status_of(pipeline_db, event_id)
            return []

        original = overpass.fetch_elements
        overpass.fetch_elements = observing_overpass
        try:
            await analysis_service.drain_pending(limit=1)
        finally:
            overpass.fetch_elements = original

        assert seen["status"] == "analyzing"


class TestPerEventCommit:
    async def test_a_failure_does_not_discard_the_events_already_analysed(
        self, pipeline_db, mocked_weather, monkeypatch
    ):
        """One transaction per batch meant a crash on the last event threw away
        every successful enrichment before it."""
        ids = await seed_events(pipeline_db, count=3)
        monkeypatch.setattr(overpass, "fetch_elements", _no_elements)

        real_classify = analysis_service.classify_event
        calls = {"n": 0}

        async def failing_classify(db, event, surroundings):
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("scorer blew up")
            return await real_classify(db, event, surroundings)

        monkeypatch.setattr(analysis_service, "classify_event", failing_classify)
        results = await analysis_service.drain_pending(limit=3)

        assert len(results) == 2, "a mid-batch failure ended the batch"
        assert await status_of(pipeline_db, ids[0]) == "complete"
        assert await status_of(pipeline_db, ids[2]) == "complete"

    async def test_the_failed_event_is_left_claimed_not_marked_complete(
        self, pipeline_db, mocked_weather, monkeypatch
    ):
        """Marking a failure 'complete' would hide it forever."""
        ids = await seed_events(pipeline_db, count=2)
        monkeypatch.setattr(overpass, "fetch_elements", _no_elements)

        async def always_fails(db, event, surroundings):
            raise RuntimeError("scorer blew up")

        monkeypatch.setattr(analysis_service, "classify_event", always_fails)
        await analysis_service.drain_pending(limit=2)

        for event_id in ids:
            assert await status_of(pipeline_db, event_id) == "analyzing"


class TestStallRecovery:
    async def test_an_abandoned_claim_is_returned_to_the_queue(self, pipeline_db):
        """A worker killed between claim and apply leaves its batch in
        'analyzing', and nothing else drains that state - the events simply
        vanish from the pipeline."""
        [event_id] = await seed_events(pipeline_db)
        stale = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
        async with pipeline_db() as db:
            await db.execute(
                text(
                    "UPDATE fire_events SET analysis_status='analyzing', updated_at=:t"
                    " WHERE id=:id"
                ),
                {"t": stale, "id": event_id},
            )
            await db.commit()

        assert await analysis_service.reclaim_stalled() == 1
        assert await status_of(pipeline_db, event_id) == "pending"

    async def test_an_in_flight_claim_is_left_alone(self, pipeline_db):
        """A slow Overpass run must not have its event stolen mid-fetch."""
        [event_id] = await seed_events(pipeline_db)
        async with pipeline_db() as db:
            await db.execute(
                text(
                    "UPDATE fire_events SET analysis_status='analyzing', updated_at=now()"
                    " WHERE id=:id"
                ),
                {"id": event_id},
            )
            await db.commit()

        assert await analysis_service.reclaim_stalled() == 0
        assert await status_of(pipeline_db, event_id) == "analyzing"

    async def test_draining_reclaims_before_it_claims(self, pipeline_db, mocked_weather, monkeypatch):
        [event_id] = await seed_events(pipeline_db)
        stale = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
        async with pipeline_db() as db:
            await db.execute(
                text(
                    "UPDATE fire_events SET analysis_status='analyzing', updated_at=:t"
                    " WHERE id=:id"
                ),
                {"t": stale, "id": event_id},
            )
            await db.commit()

        monkeypatch.setattr(overpass, "fetch_elements", _no_elements)
        results = await analysis_service.drain_pending(limit=5)

        assert [r["fire_event_id"] for r in results] == [event_id]
        assert await status_of(pipeline_db, event_id) == "complete"


class TestDegradation:
    async def test_a_dead_overpass_still_lets_the_event_complete(
        self, pipeline_db, mocked_weather, monkeypatch
    ):
        async def dead(lat, lon, radius_m, client=None):
            raise overpass.OverpassError("all mirrors returned 504")

        monkeypatch.setattr(overpass, "fetch_elements", dead)
        [result] = await analysis_service.drain_pending(limit=1) if await seed_events(
            pipeline_db
        ) else []

        assert result["surroundings_status"] == "unavailable"
        assert result["analysis_status"] == "complete"
        assert result["prediction"] is not None

    async def test_a_dead_weather_api_still_lets_the_event_complete(
        self, pipeline_db, monkeypatch
    ):
        await seed_events(pipeline_db)
        monkeypatch.setattr(overpass, "fetch_elements", _no_elements)

        with respx.mock(assert_all_called=False) as mock:
            mock.get(url__startswith="https://api.open-meteo.com").mock(
                side_effect=httpx.ConnectError("weather down")
            )
            [result] = await analysis_service.drain_pending(limit=1)

        assert result["analysis_status"] == "complete"
        assert result["weather_baseline_quality"] is None


async def _no_elements(lat, lon, radius_m, client=None):
    return []
