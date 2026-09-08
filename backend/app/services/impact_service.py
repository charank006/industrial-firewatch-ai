"""Impact analysis (spec sections 20, 21, 22).

Spec section 21 is explicit that a plain 1 km circle is not the damage zone.
Risk here is directional: a core circle sized by radiative power, plus a
downwind lobe whose length scales with wind speed. The geometry is built on
the backend and shipped as GeoJSON so the map simply draws it.

Spec section 22 and Rule 7: pollutants are always "potential". Actual
emissions depend on what is burning, which no satellite can tell us, so
nothing here is presented as measured.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from app.services.osm.geometry import unproject_point

# Per predicted class. Framed as what a fire of this type COULD release.
POTENTIAL_POLLUTANTS: Dict[str, List[str]] = {
    "industrial": ["CO", "CO2", "NOx", "SO2", "VOCs", "PM2.5", "PM10"],
    "gas_oil": ["CO", "CO2", "NOx", "SO2", "VOCs", "PM2.5", "Unburned hydrocarbons", "H2S"],
    "flare": ["CO2", "NOx", "SO2", "Unburned hydrocarbons", "PM2.5"],
    "forest": ["CO", "CO2", "NOx", "VOCs", "PM2.5", "PM10"],
    "agriculture": ["CO", "CO2", "CH4", "NH3", "PM2.5", "PM10"],
    "urban": ["CO", "CO2", "NOx", "VOCs", "PM2.5", "PM10", "Dioxins/furans"],
    "unknown": ["CO", "CO2", "PM2.5", "PM10"],
}

RISK_LEVEL_BY_SEVERITY = {
    "CRITICAL": "EXTREME",
    "HIGH": "HIGH",
    "MEDIUM": "MODERATE",
    "LOW": "LOW",
}


def core_radius_m(frp_mw: float) -> float:
    """Immediate-hazard radius from radiative power.

    Deliberately a coarse, documented heuristic: a real spread model belongs
    in a later phase, and pretending to more precision than the input
    supports would be worse than being explicit about the approximation.
    """
    return max(300.0, min(2500.0, 250.0 + 12.0 * math.sqrt(max(frp_mw, 0.0)) * 3.0))


def downwind_length_m(frp_mw: float, wind_speed_ms: Optional[float]) -> float:
    """How far the plume is carried. Zero wind still gives a small lobe."""
    speed = wind_speed_ms if wind_speed_ms is not None else 0.0
    return core_radius_m(frp_mw) * (1.0 + 0.6 * max(0.0, speed))


def _ring_to_feature(
    ring_m: List[tuple], lat0: float, lon0: float, properties: Dict[str, Any]
) -> Dict[str, Any]:
    coords = [
        [lon, lat] for lat, lon in (unproject_point(x, y, lat0, lon0) for x, y in ring_m)
    ]
    coords.append(coords[0])
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [coords]},
        "properties": properties,
    }


def _circle_ring(radius_m: float, points: int = 64) -> List[tuple]:
    return [
        (
            radius_m * math.cos(2 * math.pi * i / points),
            radius_m * math.sin(2 * math.pi * i / points),
        )
        for i in range(points)
    ]


def _downwind_lobe(
    core_m: float, length_m: float, bearing_deg: float, half_angle_deg: float = 32.0
) -> List[tuple]:
    """A teardrop from the fire toward where the plume travels."""
    # Compass bearing (0 = north, clockwise) into local x/y (x east, y north).
    theta = math.radians(90.0 - bearing_deg)
    half = math.radians(half_angle_deg)

    ring: List[tuple] = []
    steps = 24
    for i in range(steps + 1):
        offset = -half + (2 * half) * i / steps
        # Taper toward the edges so the lobe is a plume, not a wedge.
        reach = core_m + (length_m - core_m) * math.cos(offset * (math.pi / 2) / half) ** 2
        angle = theta + offset
        ring.append((reach * math.cos(angle), reach * math.sin(angle)))
    # Close back around the upwind side of the core.
    for i in range(steps + 1):
        angle = theta + half + (2 * math.pi - 2 * half) * i / steps
        ring.append((core_m * math.cos(angle), core_m * math.sin(angle)))
    return ring


def build_risk_zones(
    lat: float,
    lon: float,
    frp_mw: float,
    wind_speed_ms: Optional[float],
    wind_direction_deg: Optional[float],
) -> Dict[str, Any]:
    """GeoJSON risk zones, oriented downwind when wind data exists.

    `wind_direction_deg` is the meteorological convention: the direction the
    wind blows FROM. The plume therefore travels toward bearing + 180.
    """
    core = core_radius_m(frp_mw)
    features: List[Dict[str, Any]] = [
        _ring_to_feature(
            _circle_ring(core),
            lat,
            lon,
            {
                "level": "critical",
                "label": "Immediate hazard zone",
                "radius_m": round(core),
            },
        )
    ]

    if wind_direction_deg is not None:
        plume_bearing = (wind_direction_deg + 180.0) % 360.0
        length = downwind_length_m(frp_mw, wind_speed_ms)
        features.append(
            _ring_to_feature(
                _downwind_lobe(core, length, plume_bearing),
                lat,
                lon,
                {
                    "level": "warning",
                    "label": "Downwind plume corridor",
                    "radius_m": round(length),
                    "bearing_deg": round(plume_bearing, 1),
                    "wind_speed_ms": wind_speed_ms,
                },
            )
        )
        features.append(
            _ring_to_feature(
                _downwind_lobe(core, length * 1.8, plume_bearing, half_angle_deg=45.0),
                lat,
                lon,
                {
                    "level": "monitoring",
                    "label": "Extended monitoring corridor",
                    "radius_m": round(length * 1.8),
                    "bearing_deg": round(plume_bearing, 1),
                },
            )
        )
    else:
        # No wind data: fall back to concentric rings and say so, rather than
        # implying a direction we do not know.
        for factor, level, label in (
            (2.0, "warning", "Advisory zone (omnidirectional - no wind data)"),
            (3.5, "monitoring", "Monitoring zone (omnidirectional - no wind data)"),
        ):
            features.append(
                _ring_to_feature(
                    _circle_ring(core * factor),
                    lat,
                    lon,
                    {"level": level, "label": label, "radius_m": round(core * factor)},
                )
            )

    return {"type": "FeatureCollection", "features": features}


def assess_impact(
    predicted_class: str,
    severity: str,
    features: Dict[str, Any],
) -> Dict[str, Any]:
    """Exposure, risk level and potential pollutants for one event."""
    frp = float(features.get("frp_latest_mw") or 0.0)
    wind_speed = features.get("wind_speed_ms")
    wind_direction = features.get("wind_direction_deg")

    exposed = {
        "buildings": int(features.get("building_count") or 0),
        "hospitals": int(features.get("hospitals") or 0),
        "schools": int(features.get("schools") or 0),
        "factories": int(features.get("factories_within_1km") or 0),
        "gas_facilities": int(features.get("gas_facilities_within_1km") or 0),
        "power_infrastructure": int(features.get("power_infra_within_1km") or 0),
        "road_length_km": float(features.get("road_length_km") or 0.0),
        "residential_area_km2": float(features.get("residential_area_km2") or 0.0),
        "forest_area_km2": float(features.get("forest_area_km2") or 0.0),
        "farmland_area_km2": float(features.get("farmland_area_km2") or 0.0),
    }

    core = core_radius_m(frp)
    zones = build_risk_zones(
        float(features["latitude"]), float(features["longitude"]), frp, wind_speed, wind_direction
    )

    sensitive = exposed["hospitals"] + exposed["schools"]
    notes: List[str] = []
    if sensitive:
        notes.append(f"{sensitive} sensitive site(s) mapped within the analysis radius")
    if exposed["gas_facilities"]:
        notes.append(
            f"{exposed['gas_facilities']} hydrocarbon installation(s) within 1 km - escalation risk"
        )
    if features.get("osm_coverage") == "sparse":
        # Spec Rule 4: absent OSM data is not evidence that nothing is there.
        notes.append(
            "Exposure counts are a LOWER BOUND - OpenStreetMap coverage is sparse at this location"
        )
    if wind_direction is None:
        notes.append("No wind data available - risk zones are omnidirectional")

    return {
        "risk_level": RISK_LEVEL_BY_SEVERITY.get(severity, "MODERATE"),
        "severity": severity,
        "core_radius_m": round(core),
        "downwind_length_m": round(downwind_length_m(frp, wind_speed))
        if wind_direction is not None
        else None,
        "wind_speed_ms": wind_speed,
        "wind_direction_deg": wind_direction,
        "plume_bearing_deg": round((wind_direction + 180.0) % 360.0, 1)
        if wind_direction is not None
        else None,
        "exposed": exposed,
        "exposure_count": sensitive + exposed["gas_facilities"] + exposed["power_infrastructure"],
        # Spec section 22 / Rule 7 - never "confirmed gases released".
        "potential_pollutants": POTENTIAL_POLLUTANTS.get(
            predicted_class, POTENTIAL_POLLUTANTS["unknown"]
        ),
        "pollutant_caveat": (
            "Potential pollutants only. Actual emissions depend on the material burning "
            "and are not measured by satellite."
        ),
        "risk_zones": zones,
        "notes": notes,
    }
