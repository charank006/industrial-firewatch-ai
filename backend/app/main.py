import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, fires, incidents, system
from app.config import settings
from app.database.connection import dispose_engine
from app.workers.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
# The FIRMS MAP_KEY is a PATH SEGMENT of the request URL, and httpx logs full
# URLs at INFO - which writes the credential in plaintext into every log file,
# CI artefact and pasted traceback. Quieting the client's request logger is the
# smallest fix that closes that leak; real failures still surface, because this
# module logs its own outcomes and errors.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Start background jobs with the app, and stop them with it.

    The frontend must never drive the pipeline (spec section 24), so ingest
    and enrichment run here rather than being triggered by a page load.
    """
    start_scheduler()

    if settings.SCHEDULER_ENABLED and settings.SCHEDULER_RUN_ON_STARTUP:
        # Fire-and-forget so a slow first ingest never blocks the port from
        # opening; a dashboard that will not load is worse than stale data.
        from app.workers.jobs import ingest_job

        asyncio.create_task(ingest_job())

    try:
        yield
    finally:
        shutdown_scheduler()
        await dispose_engine()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# `allow_origins=["*"]` together with `allow_credentials=True` is invalid per
# the CORS spec and rejected by browsers - it only appeared to work because
# nothing sent credentials. In dev the Vite proxy handles /api, so this list is
# a fallback for direct cross-origin calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(fires.router)
app.include_router(admin.router)
app.include_router(incidents.router)
