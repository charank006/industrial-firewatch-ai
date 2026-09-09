"""Automatic recovery of OSM enrichment after an Overpass outage.

`surroundings_status='unavailable'` means the fetch FAILED - a successful
fetch over genuinely unmapped ground returns 'sparse'. Those events are
missing their industrial, gas, factory and power evidence entirely, so
Industrial Fire, Routine Flare and Gas/Oil are unreachable for them and the
facility monitor lists fewer sites than exist. Today's outage left 88 events
in that state, and nothing else picks them up: the analysis worker drains
'pending', and these are 'complete'.
"""

import datetime

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.database import connection
from app.services.osm import client as overpass
from app.services.fire_event_service import process_detections
from app.workers import jobs
from tests.conftest import TABLES, make_detection

BASE = datetime.datetime(2026, 9, 9, 8, 0, tzinfo=datetime.timezone.utc)


@pytest_asyncio.fixture
async def db_pointed_at_test():
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
    async with maker() as s:
        await s.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await s.execute(text("ALTER SEQUENCE fire_event_id_seq RESTART WITH 1"))
        await s.commit()
    try:
        yield maker
    finally:
        connection._engine, connection._sessionmaker = previous
        await engine.dispose()


async def seed(maker, statuses):
    """One completed event per given surroundings_status."""
    async with maker() as db:
        for i, status in enumerate(statuses):
            await process_detections(
                db, [make_detection(21.0 + i * 0.5, 72.8, BASE, frp=100.0 - i, satellite=f"S{i}")]
            )
        await db.execute(
            text("UPDATE fire_events SET analysis_status='complete'")
        )
        rows = (await db.execute(text("SELECT id FROM fire_events ORDER BY id"))).scalars().all()
        for event_id, status in zip(rows, statuses):
            await db.execute(
                text("UPDATE fire_events SET surroundings_status=:s WHERE id=:id"),
                {"s": status, "id": event_id},
            )
        await db.commit()
        return rows


async def statuses(maker):
    async with maker() as db:
        rows = await db.execute(
            text("SELECT surroundings_status, analysis_status FROM fire_events ORDER BY id")
        )
        return rows.all()


class TestGatedOnOverpassBeingBack:
    async def test_nothing_is_requeued_while_overpass_is_down(
        self, db_pointed_at_test, monkeypatch
    ):
        """Requeuing into a dead service would replace quietly degraded
        events with slow failures, and fight the breaker's backoff."""
        await seed(db_pointed_at_test, ["unavailable", "unavailable"])

        async def down():
            return {"ok": False, "detail": "Circuit breaker open"}

        monkeypatch.setattr(overpass, "probe_overpass", down)
        result = await jobs.surroundings_retry_job()

        assert result["requeued"] == 0
        assert result["skipped_reason"] == "overpass unavailable"
        assert all(a == "complete" for _, a in await statuses(db_pointed_at_test))

    async def test_failed_enrichment_is_requeued_once_overpass_answers(
        self, db_pointed_at_test, monkeypatch
    ):
        await seed(db_pointed_at_test, ["unavailable", "unavailable"])

        async def up():
            return {"ok": True, "detail": "3 slots available"}

        monkeypatch.setattr(overpass, "probe_overpass", up)
        result = await jobs.surroundings_retry_job()

        assert result["requeued"] == 2
        assert all(a == "pending" for _, a in await statuses(db_pointed_at_test))


class TestWhatItLeavesAlone:
    async def test_sparse_is_a_real_answer_and_is_not_retried(
        self, db_pointed_at_test, monkeypatch
    ):
        """'sparse' means Overpass answered and the area is genuinely
        under-mapped. Retrying it would loop forever on a correct result."""
        await seed(db_pointed_at_test, ["sparse", "ok", "unavailable"])

        async def up():
            return {"ok": True, "detail": "slots available"}

        monkeypatch.setattr(overpass, "probe_overpass", up)
        assert (await jobs.surroundings_retry_job())["requeued"] == 1

        rows = await statuses(db_pointed_at_test)
        by_status = {s: a for s, a in rows}
        assert by_status["sparse"] == "complete"
        assert by_status["ok"] == "complete"
        assert by_status["unavailable"] == "pending"


class TestBatching:
    async def test_the_backlog_drains_in_batches(self, db_pointed_at_test, monkeypatch):
        """A long outage's backlog must not flood the analysis queue the
        moment the service returns."""
        await seed(db_pointed_at_test, ["unavailable"] * 5)

        async def up():
            return {"ok": True, "detail": "slots available"}

        monkeypatch.setattr(overpass, "probe_overpass", up)
        monkeypatch.setattr(settings, "SURROUNDINGS_RETRY_BATCH", 2)

        assert (await jobs.surroundings_retry_job())["requeued"] == 2
        assert (await jobs.surroundings_retry_job())["requeued"] == 2
        assert (await jobs.surroundings_retry_job())["requeued"] == 1
        assert (await jobs.surroundings_retry_job())["requeued"] == 0

    async def test_highest_frp_is_recovered_first(self, db_pointed_at_test, monkeypatch):
        ids = await seed(db_pointed_at_test, ["unavailable"] * 3)

        async def up():
            return {"ok": True, "detail": "slots available"}

        monkeypatch.setattr(overpass, "probe_overpass", up)
        monkeypatch.setattr(settings, "SURROUNDINGS_RETRY_BATCH", 1)
        await jobs.surroundings_retry_job()

        async with db_pointed_at_test() as db:
            pending = (
                await db.execute(
                    text("SELECT id FROM fire_events WHERE analysis_status='pending'")
                )
            ).scalars().all()
        assert pending == [ids[0]]  # seeded with the highest FRP
