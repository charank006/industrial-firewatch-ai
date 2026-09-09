"""Test fixtures.

Database tests run against a real PostGIS instance - the whole point of the
event engine is its spatial SQL, and mocking ST_DWithin would test nothing.
They skip cleanly when no database is reachable.

They connect to settings.test_database_url (firewatch_db_test by default),
NEVER to DATABASE_URL: these fixtures TRUNCATE between tests, so sharing the
development database would destroy real ingested detections on every run.
"""

import datetime

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.models import Base  # noqa: F401 - ensures metadata is registered
from app.services.firms_service import FireDetection

TABLES = [
    "weather_anomalies",
    "weather_observations",
    "fire_detections",
    "fire_events",
    "osm_cache",
    "ingest_runs",
]


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(settings.test_database_url, poolclass=None)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT PostGIS_Version()"))
    except Exception as exc:  # noqa: BLE001
        await engine.dispose()
        pytest.skip(f"No PostGIS database available: {type(exc).__name__}")

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        # fire_events self-references via parent_event_id, so CASCADE is needed.
        await session.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await session.execute(text("ALTER SEQUENCE fire_event_id_seq RESTART WITH 1"))
        await session.commit()
        yield session
        await session.rollback()

    await engine.dispose()


def make_detection(
    lat: float,
    lon: float,
    when: datetime.datetime,
    frp: float = 50.0,
    satellite: str = "N",
    instrument: str = "VIIRS",
    source: str = "VIIRS_SNPP_NRT",
    confidence_raw: str = "n",
    confidence_pct: int = 60,
    brightness_k: float = 330.0,
    day_night: str = "D",
) -> FireDetection:
    if when.tzinfo is None:
        when = when.replace(tzinfo=datetime.timezone.utc)
    return FireDetection(
        latitude=lat,
        longitude=lon,
        acquisition_time=when,
        satellite=satellite,
        instrument=instrument,
        source=source,
        confidence_raw=confidence_raw,
        confidence_pct=confidence_pct,
        frp_mw=frp,
        brightness_k=brightness_k,
        day_night=day_night,
        raw={"synthetic": True},
    )


@pytest.fixture(autouse=True)
def _no_worldcover_network(monkeypatch):
    """Tests never reach the WorldCover raster over the network.

    Reads are windowed range requests to S3; leaving them live would make the
    suite depend on the internet and add a second per analysed event.
    Coverage for the service itself lives in test_landcover.py, against a
    stubbed read.
    """
    monkeypatch.setattr(settings, "WORLDCOVER_ENABLED", False)
