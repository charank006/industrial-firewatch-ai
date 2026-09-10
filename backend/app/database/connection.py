"""Async SQLAlchemy engine, session factory and FastAPI dependency.

None of this existed before: DATABASE_URL was defined in config and consumed
by nothing, and the six declarative models in app/models were imported by zero
files. `/api/system/status` nevertheless reported "POSTGRESQL + POSTGIS READY".
"""

import time
from typing import Any, AsyncGenerator, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

Base = declarative_base()

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Lazily built so importing this module never opens a connection.

    Tests and the FIRMS/weather probes must work with no database present.
    """
    global _engine
    if _engine is None:
        connect_args = {}
        if "pooler" in settings.DATABASE_URL or "neon.tech" in settings.DATABASE_URL:
            connect_args["statement_cache_size"] = 0

        _engine = create_async_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            echo=False,
            connect_args=connect_args,
        )
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _sessionmaker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a session per request."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def probe_postgres() -> Dict[str, Any]:
    """Actually connect and run a query. Never raises."""
    import re
    started = time.perf_counter()
    masked = re.sub(r"://.*@", "://***@", settings.DATABASE_URL)
    try:
        async with get_engine().connect() as conn:
            version = (await conn.execute(text("SHOW server_version"))).scalar_one()
        return {
            "ok": True,
            "detail": f"PostgreSQL {version} ({masked})",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
    except Exception as exc:  # noqa: BLE001 - a probe must report, not propagate
        return {
            "ok": False,
            "detail": f"{type(exc).__name__}: {str(exc)[:120]} (connecting to: {masked})",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }


async def probe_postgis() -> Dict[str, Any]:
    """Report the real PostGIS version and prove ST_DWithin actually executes.

    This is what finally makes SystemStatusPage's "ST_DWITHIN ACTIVE" claim
    true rather than a hardcoded string.
    """
    started = time.perf_counter()
    try:
        async with get_engine().connect() as conn:
            version = (await conn.execute(text("SELECT PostGIS_Version()"))).scalar_one()
            # Surat -> a point ~1.1km east; assert the metre-accurate geography
            # path behaves, since ST_DWithin on raw 4326 geometry would treat
            # the radius as degrees (~111x wrong).
            within = (
                await conn.execute(
                    text(
                        "SELECT ST_DWithin("
                        "  ST_SetSRID(ST_MakePoint(72.8345, 21.1738), 4326)::geography,"
                        "  ST_SetSRID(ST_MakePoint(72.8445, 21.1738), 4326)::geography,"
                        "  2000)"
                    )
                )
            ).scalar_one()
        if not within:
            return {
                "ok": False,
                "detail": "ST_DWithin returned an unexpected result",
                "latency_ms": (time.perf_counter() - started) * 1000,
            }
        return {
            "ok": True,
            "detail": f"PostGIS {version} - ST_DWithin verified (SRID 4326, geography)",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "detail": f"{type(exc).__name__}: {str(exc)[:160]}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
