from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # `class Config` (pydantic v1 style) set no env_file, so `.env` was never
    # read and python-dotenv sat unused - every external key silently resolved
    # to "". SettingsConfigDict fixes that. Field defaults below are plain
    # defaults; pydantic-settings reads the environment itself, so the old
    # `os.getenv(...)` wrappers were redundant and hid the bug.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Industrial FireWatch API"
    VERSION: str = "2.0.0-beta"
    API_PREFIX: str = "/api"

    DEMO_MODE: bool = True

    # --- Spatial database (PostgreSQL + PostGIS) -------------------------
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/firewatch_db"

    # Separate database for tests. The DB fixtures TRUNCATE between tests, so
    # pointing them at DATABASE_URL would wipe real ingested detections on
    # every `pytest` run.
    TEST_DATABASE_URL: str = ""

    @property
    def test_database_url(self) -> str:
        """Defaults to the main URL with a `_test` suffix on the database name."""
        if self.TEST_DATABASE_URL:
            return self.TEST_DATABASE_URL
        base, _, name = self.DATABASE_URL.rpartition("/")
        return f"{base}/{name}_test"

    # --- Area of interest ------------------------------------------------
    # FIRMS area API wants west,south,east,north. Default covers the Gujarat
    # industrial corridor the dashboard is built around.
    FIRMS_AOI_BBOX: str = "68.0,20.0,75.0,25.0"
    # Used to render `time_formatted` for the UI. The AOI is configurable, so
    # never hardcode IST anywhere downstream.
    AOI_TIMEZONE: str = "Asia/Kolkata"

    # --- NASA FIRMS ------------------------------------------------------
    # Backend-only. Never expose to frontend JavaScript (spec 3.1).
    NASA_FIRMS_MAP_KEY: str = ""
    FIRMS_BASE_URL: str = "https://firms.modaps.eosdis.nasa.gov"
    # Multiple platforms give enough daily overpasses for an FRP time series,
    # which is what makes Routine Flare separable from Industrial Fire.
    FIRMS_SOURCES: str = "VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT,MODIS_NRT"
    FIRMS_DAY_RANGE: int = 1  # 1-10; Phase 2 cold-start seeds with 10
    # Name of a boundary asset in app/data/aoi/ to clip detections to. FIRMS
    # only accepts a rectangle, and no rectangle matches a state border - the
    # Telangana box overlaps Maharashtra. Empty keeps the whole rectangle.
    AOI_BOUNDARY: str = ""

    # --- Weather (Open-Meteo) --------------------------------------------
    # Forecast endpoint with past_days, NOT archive-api: the archive is
    # ERA5-backed and lags ~5 days, which would put a fresh fire's current hour
    # AND all six baseline days inside the lag window, yielding all-null.
    OPEN_METEO_URL: str = "https://api.open-meteo.com/v1/forecast"
    WEATHER_PAST_DAYS: int = 7  # 6 complete prior days + today
    WEATHER_BASELINE_DAYS: int = 6
    WEATHER_MIN_BASELINE_SAMPLES: int = 4  # below this -> baseline_quality=insufficient

    # --- OpenStreetMap / Overpass ----------------------------------------
    OVERPASS_URLS: str = (
        "https://overpass-api.de/api/interpreter,"
        "https://overpass.kumi.systems/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter"
    )
    OVERPASS_TIMEOUT_S: int = 60
    OVERPASS_MIN_INTERVAL_S: float = 2.0
    OVERPASS_CACHE_TTL_DAYS: int = 30
    OSM_ANALYSIS_RADIUS_M: int = 1000
    HTTP_USER_AGENT: str = "fire-intelligence/0.1 (industrial-firewatch)"

    # --- Fire event dedup engine (spec 7) --------------------------------
    EVENT_LINK_RADIUS_M: float = 1000.0
    EVENT_LINK_WINDOW_HOURS: int = 12
    EXACT_DUP_RADIUS_M: float = 100.0
    # Chaining guards: without these a spreading front walks one event across a
    # whole district, one 1km link at a time, forever.
    # Beyond this the "nearest facility" is not near anything. The registry is
    # a curated asset list, so a fire outside every asset's neighbourhood must
    # read as unassigned rather than as "764 km from a plant in another state".
    FACILITY_ATTACH_MAX_KM: float = 50.0
    MAX_EVENT_EXTENT_KM: float = 10.0
    MAX_EVENT_DURATION_HOURS: int = 168

    # --- Background scheduling (Phase 7) ---------------------------------
    SCHEDULER_ENABLED: bool = True
    # 4 sources x 4 polls/hour = 384 requests/day against a ~5000-per-10-minute
    # FIRMS limit, so cadence is not the constraint; politeness is.
    FIRMS_POLL_MINUTES: int = 15
    # Overpass is the bottleneck (2-20s, sometimes 60), so analysis drains a
    # small batch often rather than a large batch rarely.
    ANALYSIS_POLL_MINUTES: int = 2
    ANALYSIS_BATCH_SIZE: int = 5
    # An event claimed for analysis but never finished was abandoned by a
    # crashed or killed worker. Comfortably longer than one event's worst case
    # (Overpass retries across mirrors can run several minutes) so a slow run
    # is never mistaken for a dead one.
    ANALYSIS_STALL_MINUTES: int = 20
    CONTAINMENT_SWEEP_HOURS: int = 6
    # Skip the first ingest at boot; useful in development so a restart does
    # not immediately spend FIRMS quota.
    SCHEDULER_RUN_ON_STARTUP: bool = False
    LOG_LEVEL: str = "INFO"

    # --- Admin ------------------------------------------------------------
    # Guards POST /api/admin/* so nobody can burn the FIRMS quota.
    ADMIN_API_TOKEN: str = ""

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Notification providers (deferred; demo mode only) ---------------
    FCM_PROJECT_ID: str = ""
    FCM_CREDENTIALS: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "alerts@firewatch.ai"

    # Was sourced from VITE_MAP_STYLE_URL - a frontend-only prefix that Vite
    # exposes to the client, never to this process.
    MAP_STYLE_URL: str = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"

    @property
    def firms_sources(self) -> list[str]:
        return [s.strip() for s in self.FIRMS_SOURCES.split(",") if s.strip()]

    @property
    def overpass_urls(self) -> list[str]:
        return [u.strip() for u in self.OVERPASS_URLS.split(",") if u.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def aoi_bbox(self) -> tuple[float, float, float, float]:
        """(west, south, east, north)."""
        parts = [float(p) for p in self.FIRMS_AOI_BBOX.split(",")]
        if len(parts) != 4:
            raise ValueError(f"FIRMS_AOI_BBOX must be 'west,south,east,north', got {self.FIRMS_AOI_BBOX!r}")
        return parts[0], parts[1], parts[2], parts[3]


settings = Settings()
