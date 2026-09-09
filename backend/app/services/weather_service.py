"""Weather at the fire's coordinates, plus the six-day local-hour baseline.

Spec sections 8-10. Two decisions carry most of the weight here:

**Forecast API, not Archive API.** `archive-api.open-meteo.com` is ERA5-backed
and lags roughly five days. A fire detected two hours ago would have its
current hour AND all six baseline days inside that lag window, so every value
would come back null and the pipeline would silently produce no anomalies at
all. `api.open-meteo.com/v1/forecast` with `past_days` serves the same window
from the high-resolution model chain.

**`timezone=auto` and local wall-clock arithmetic.** "The same local hour on
the previous six days" is a wall-clock concept. With timezone=auto the API
returns naive local timestamps plus utc_offset_seconds; we shift the detection
into that local frame and subtract whole days there. Subtracting on UTC and
converting afterwards would drift by an hour across a DST boundary. India has
no DST, but the AOI is a config value, so this is written generally.

Spec Rule 2: a temperature anomaly is supporting evidence of unusual local
conditions. It is never proof that a fire was accidental, nor evidence about
its source.
"""

from __future__ import annotations

import datetime
import logging
import math
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Sequence

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

HOURLY_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "precipitation",
    "surface_pressure",
]

_LOCAL_KEY_FMT = "%Y-%m-%dT%H:%M"


class WeatherError(RuntimeError):
    pass


@dataclass
class WeatherAnalysis:
    """Current conditions, the six-day baseline, and derived anomalies."""

    latitude: float
    longitude: float
    timezone: str
    utc_offset_seconds: int
    local_hour: str

    current_temperature_c: Optional[float]
    current_humidity_pct: Optional[float]
    current_wind_speed_ms: Optional[float]
    current_wind_direction_deg: Optional[float]
    current_wind_gusts_ms: Optional[float]
    current_precipitation_mm: Optional[float]

    six_day_avg_temperature_c: Optional[float]
    temperature_anomaly_c: Optional[float]
    temperature_anomaly_z: Optional[float]
    temperature_stdev_c: Optional[float]
    temperature_trend_c_per_day: Optional[float]

    six_day_avg_humidity_pct: Optional[float]
    humidity_anomaly_pct: Optional[float]

    six_day_avg_wind_speed_ms: Optional[float]
    wind_change_ms: Optional[float]

    precipitation_24h_mm: Optional[float]
    precipitation_72h_mm: Optional[float]
    dry_hours: Optional[int]

    vpd_kpa: Optional[float]
    vpd_baseline_kpa: Optional[float]
    vpd_anomaly_kpa: Optional[float]

    baseline_samples: int
    baseline_days_requested: int
    baseline_quality: str  # "ok" | "partial" | "insufficient"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _mean(values: Sequence[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def _pstdev(values: Sequence[float]) -> Optional[float]:
    if len(values) < 2:
        return None
    mu = sum(values) / len(values)
    return math.sqrt(sum((v - mu) ** 2 for v in values) / len(values))


def vapour_pressure_deficit_kpa(temp_c: Optional[float], rh_pct: Optional[float]) -> Optional[float]:
    """VPD via the Tetens equation.

    Beyond the spec, but it is the best single scalar for fire-relevant
    dryness and is not recoverable from temperature or humidity alone.
    """
    if temp_c is None or rh_pct is None:
        return None
    saturation = 0.6108 * math.exp(17.27 * temp_c / (temp_c + 237.3))
    return round(saturation * (1.0 - rh_pct / 100.0), 4)


def _ols_slope_per_day(values_by_offset: List[tuple[int, float]]) -> Optional[float]:
    """Least-squares slope of temperature against day offset (k = -6..-1)."""
    if len(values_by_offset) < 2:
        return None
    ks = [float(k) for k, _ in values_by_offset]
    vs = [v for _, v in values_by_offset]
    k_mean, v_mean = sum(ks) / len(ks), sum(vs) / len(vs)
    denom = sum((k - k_mean) ** 2 for k in ks)
    if denom == 0:
        return None
    return round(sum((k - k_mean) * (v - v_mean) for k, v in zip(ks, vs)) / denom, 4)


def build_request_params(latitude: float, longitude: float) -> Dict[str, Any]:
    return {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(HOURLY_VARIABLES),
        # 7 not 6: six COMPLETE prior days are needed, and a partial day at the
        # boundary would cost a baseline sample.
        "past_days": settings.WEATHER_PAST_DAYS,
        "forecast_days": 1,
        "timezone": "auto",
        "wind_speed_unit": "ms",
    }


def analyse(payload: Dict[str, Any], detection_time_utc: datetime.datetime) -> WeatherAnalysis:
    """Turn one Open-Meteo response into the current/baseline/anomaly set."""
    hourly = payload.get("hourly") or {}
    times: List[str] = hourly.get("time") or []
    if not times:
        raise WeatherError("Open-Meteo response contained no hourly data")

    offset_seconds = int(payload.get("utc_offset_seconds", 0))
    index_of = {t: i for i, t in enumerate(times)}

    if detection_time_utc.tzinfo is None:
        detection_time_utc = detection_time_utc.replace(tzinfo=datetime.timezone.utc)

    # Shift into the API's local frame, then floor to the hour. All baseline
    # arithmetic happens on this naive local value.
    local = (detection_time_utc + datetime.timedelta(seconds=offset_seconds)).replace(tzinfo=None)
    local_hour = local.replace(minute=0, second=0, microsecond=0)

    def series(name: str) -> List[Optional[float]]:
        return hourly.get(name) or []

    def value_at(name: str, when: datetime.datetime) -> Optional[float]:
        idx = index_of.get(when.strftime(_LOCAL_KEY_FMT))
        if idx is None:
            return None
        data = series(name)
        return data[idx] if idx < len(data) else None

    def baseline_pairs(name: str) -> List[tuple[int, float]]:
        """(day offset, value) for each of the previous N days at this hour.

        Open-Meteo returns null for unavailable hours; those are dropped, never
        imputed. A fabricated baseline is worse than a missing one.
        """
        out: List[tuple[int, float]] = []
        for k in range(1, settings.WEATHER_BASELINE_DAYS + 1):
            v = value_at(name, local_hour - datetime.timedelta(days=k))
            if v is not None:
                out.append((-k, float(v)))
        return out

    temp_pairs = baseline_pairs("temperature_2m")
    temp_values = [v for _, v in temp_pairs]
    rh_values = [v for _, v in baseline_pairs("relative_humidity_2m")]
    wind_values = [v for _, v in baseline_pairs("wind_speed_10m")]

    samples = len(temp_values)
    if samples >= settings.WEATHER_BASELINE_DAYS:
        quality = "ok"
    elif samples >= settings.WEATHER_MIN_BASELINE_SAMPLES:
        quality = "partial"
    else:
        quality = "insufficient"

    current_t = value_at("temperature_2m", local_hour)
    current_rh = value_at("relative_humidity_2m", local_hour)
    current_ws = value_at("wind_speed_10m", local_hour)

    # Below the minimum sample count we emit no anomalies at all. Phase 5
    # converts "insufficient" into an honest confidence penalty rather than
    # letting a thin baseline masquerade as a real one.
    usable = quality != "insufficient"
    t_baseline = _mean(temp_values) if usable else None
    rh_baseline = _mean(rh_values) if usable else None
    ws_baseline = _mean(wind_values) if usable else None
    t_stdev = _pstdev(temp_values) if usable else None

    t_anomaly = round(current_t - t_baseline, 2) if (current_t is not None and t_baseline is not None) else None
    # z-score, not raw delta: +7.4 C means something very different in a stable
    # tropical climate than in a continental one. The 0.5 floor guards sigma->0.
    t_anomaly_z = (
        round(t_anomaly / max(t_stdev or 0.0, 0.5), 2) if t_anomaly is not None else None
    )

    vpd_now = vapour_pressure_deficit_kpa(current_t, current_rh)
    vpd_baseline_values = [
        v
        for v in (
            vapour_pressure_deficit_kpa(
                value_at("temperature_2m", local_hour - datetime.timedelta(days=k)),
                value_at("relative_humidity_2m", local_hour - datetime.timedelta(days=k)),
            )
            for k in range(1, settings.WEATHER_BASELINE_DAYS + 1)
        )
        if v is not None
    ]
    vpd_baseline = _mean(vpd_baseline_values) if usable else None

    def precipitation_window(hours: int) -> Optional[float]:
        total, seen = 0.0, False
        for h in range(hours):
            v = value_at("precipitation", local_hour - datetime.timedelta(hours=h))
            if v is not None:
                total += float(v)
                seen = True
        return round(total, 2) if seen else None

    # Hours since the last rain (>0.1mm), capped at a week. Stays None when no
    # precipitation data exists at all, rather than claiming a week of drought.
    dry_hours: Optional[int] = None
    saw_precipitation_data = False
    for h in range(0, 169):
        v = value_at("precipitation", local_hour - datetime.timedelta(hours=h))
        if v is None:
            continue
        saw_precipitation_data = True
        if float(v) > 0.1:
            dry_hours = h
            break
    else:
        dry_hours = 168 if saw_precipitation_data else None

    return WeatherAnalysis(
        latitude=float(payload.get("latitude", 0.0)),
        longitude=float(payload.get("longitude", 0.0)),
        timezone=str(payload.get("timezone", "UTC")),
        utc_offset_seconds=offset_seconds,
        local_hour=local_hour.strftime(_LOCAL_KEY_FMT),
        current_temperature_c=current_t,
        current_humidity_pct=current_rh,
        current_wind_speed_ms=current_ws,
        current_wind_direction_deg=value_at("wind_direction_10m", local_hour),
        current_wind_gusts_ms=value_at("wind_gusts_10m", local_hour),
        current_precipitation_mm=value_at("precipitation", local_hour),
        six_day_avg_temperature_c=round(t_baseline, 2) if t_baseline is not None else None,
        temperature_anomaly_c=t_anomaly,
        temperature_anomaly_z=t_anomaly_z,
        temperature_stdev_c=round(t_stdev, 3) if t_stdev is not None else None,
        temperature_trend_c_per_day=_ols_slope_per_day(temp_pairs) if usable else None,
        six_day_avg_humidity_pct=round(rh_baseline, 2) if rh_baseline is not None else None,
        humidity_anomaly_pct=(
            round(current_rh - rh_baseline, 2)
            if (current_rh is not None and rh_baseline is not None)
            else None
        ),
        six_day_avg_wind_speed_ms=round(ws_baseline, 2) if ws_baseline is not None else None,
        wind_change_ms=(
            round(current_ws - ws_baseline, 2)
            if (current_ws is not None and ws_baseline is not None)
            else None
        ),
        precipitation_24h_mm=precipitation_window(24),
        precipitation_72h_mm=precipitation_window(72),
        dry_hours=dry_hours,
        vpd_kpa=vpd_now,
        vpd_baseline_kpa=round(vpd_baseline, 4) if vpd_baseline is not None else None,
        vpd_anomaly_kpa=(
            round(vpd_now - vpd_baseline, 4)
            if (vpd_now is not None and vpd_baseline is not None)
            else None
        ),
        baseline_samples=samples,
        baseline_days_requested=settings.WEATHER_BASELINE_DAYS,
        baseline_quality=quality,
    )


async def fetch_weather_analysis(
    latitude: float,
    longitude: float,
    detection_time_utc: datetime.datetime,
    client: Optional[httpx.AsyncClient] = None,
) -> WeatherAnalysis:
    params = build_request_params(latitude, longitude)
    owns_client = client is None
    client = client or httpx.AsyncClient(
        timeout=30.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
    )
    try:
        response = await client.get(settings.OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return analyse(response.json(), detection_time_utc)
    finally:
        if owns_client:
            await client.aclose()


async def probe_open_meteo() -> Dict[str, Any]:
    """Cheap liveness check. Never raises."""
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=15.0, headers={"User-Agent": settings.HTTP_USER_AGENT}
        ) as client:
            response = await client.get(
                settings.OPEN_METEO_URL,
                params={
                    "latitude": 21.17,
                    "longitude": 72.83,
                    "hourly": "temperature_2m",
                    "forecast_days": 1,
                    "timezone": "auto",
                },
            )
            response.raise_for_status()
            payload = response.json()
        hours = len((payload.get("hourly") or {}).get("time") or [])
        return {
            "ok": hours > 0,
            "detail": f"Open-Meteo reachable - {hours} hourly slots, tz {payload.get('timezone')}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "detail": f"{type(exc).__name__}: {str(exc)[:160]}",
            "latency_ms": (time.perf_counter() - started) * 1000,
        }
