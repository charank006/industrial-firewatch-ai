"""How dangerous is this event? — asked separately from what it is.

Risk was previously `RISK_LEVEL_BY_SEVERITY[severity]`, a lookup from the
classification. That made it impossible for the two to disagree, and they
must be able to:

    Agricultural Burning, class confidence 94%, risk 35%
        confident about what it is, and it is not dangerous

    Industrial Fire, class confidence 75%, risk 91%
        less sure what it is, but the consequences make it urgent

Deliberately a transparent weighted model rather than a second black box.
Every component is bounded 0-1, published alongside the score, and can be
argued with. A learned risk model needs incident outcomes we do not have -
the same missing-labels problem as the source classifier - so this stays
explainable until those exist.

The score is NOT a probability. It is a 0-100 ordering of operational
concern, and the threshold that turns it into an incident is a policy
decision, not a property of the score.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional

# Component weights. They sum to 1.0 so the score reads as a percentage of
# the worst case this model can express.
WEIGHTS: Dict[str, float] = {
    "thermal": 0.24,      # how much energy is being released now
    "anomaly": 0.22,      # how far above this site's own normal
    "exposure": 0.26,     # who and what is close enough to be harmed
    "hazard": 0.16,       # what the burning material implies
    "environment": 0.12,  # conditions that help it spread
}

# What a fire of this class implies about the material burning. Not a measure
# of how likely the class is - that is classification confidence, and mixing
# the two is the error this module exists to correct.
CLASS_HAZARD: Dict[str, float] = {
    "gas_oil": 1.00,      # pressurised hydrocarbon; explosion and toxic release
    "industrial": 0.90,   # unplanned fire at a plant; unknown inventory
    "urban": 0.75,        # structures and people
    "flare": 0.25,        # designed, controlled combustion
    "forest": 0.55,       # spreads, but rarely toxic
    "agriculture": 0.30,  # intended, usually bounded by the field
    "unknown": 0.50,      # no information is not an argument for either extreme
}

LEVELS = (
    (80.0, "EXTREME"),
    (60.0, "HIGH"),
    (35.0, "MODERATE"),
    (0.0, "LOW"),
)


@dataclass
class RiskAssessment:
    score: float                       # 0-100
    level: str
    components: Dict[str, float] = field(default_factory=dict)   # each 0-1
    contributions: Dict[str, float] = field(default_factory=dict)  # points of the 100
    drivers: list = field(default_factory=list)
    caveats: list = field(default_factory=list)
    model_version: str = "risk-v1"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _num(features: Dict[str, Any], key: str, default: float = 0.0) -> float:
    value = features.get(key)
    try:
        return default if value is None else float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def thermal_component(features: Dict[str, Any]) -> float:
    """Energy being released now.

    Log-scaled: the step from 5 to 50 MW matters far more than 500 to 545,
    and a linear scale would let one refinery flare saturate every fire in
    the country.
    """
    frp = _num(features, "frp_latest_mw")
    if frp <= 0:
        return 0.0
    # log10(1+frp)/log10(1+300): 300 MW reads as the top of the scale.
    return clamp(math.log10(1.0 + frp) / math.log10(301.0))


def anomaly_component(features: Dict[str, Any]) -> float:
    """How far above this site's own normal.

    The single most useful signal for industrial risk: 85 MW where the site
    normally runs 21 MW is an incident; 22 MW at the same site is Tuesday.
    Absolute power cannot make that distinction.
    """
    frp = _num(features, "frp_latest_mw")
    median = _num(features, "site_median_frp_mw")
    if frp <= 0 or median <= 0:
        # No history yet. Neutral rather than zero - a first detection is not
        # evidence of normality.
        return 0.4
    ratio = frp / median
    if ratio <= 1.0:
        return 0.0
    # 4x the site median saturates.
    return clamp(math.log10(ratio) / math.log10(4.0))


def exposure_component(features: Dict[str, Any]) -> float:
    """Who and what is close enough to be harmed.

    Counts are a LOWER BOUND - OpenStreetMap coverage varies - so this can
    only ever understate exposure, never overstate it.
    """
    people = (
        _num(features, "hospitals") * 3.0
        + _num(features, "schools") * 2.5
        + _num(features, "building_count") * 0.05
        + _num(features, "residential_area_km2") * 4.0
    )
    infrastructure = (
        _num(features, "gas_facilities_within_1km") * 2.0
        + _num(features, "power_infra_within_1km") * 1.5
        + _num(features, "factories_within_1km") * 0.8
    )
    score = clamp((people + infrastructure) / 12.0)

    # Proximity sharpens it: inside the perimeter is categorically worse than
    # anywhere nearby.
    if features.get("inside_industrial"):
        score = clamp(score + 0.25)
    nearest = features.get("nearest_residential_m")
    if nearest is not None and _num(features, "nearest_residential_m", 1e9) < 500:
        score = clamp(score + 0.20)
    return score


def hazard_component(predicted_class: str) -> float:
    return CLASS_HAZARD.get(predicted_class, CLASS_HAZARD["unknown"])


def environment_component(features: Dict[str, Any]) -> float:
    """Conditions that help a fire spread or a plume travel.

    Spec Rule 2: these describe the surroundings, never the fire's cause.
    """
    vpd_anomaly = _num(features, "vpd_anomaly_kpa")
    dryness = clamp(vpd_anomaly / 1.5)

    wind = _num(features, "wind_speed_ms")
    wind_factor = clamp(wind / 12.0)

    dry_hours = _num(features, "dry_hours")
    drought = clamp(dry_hours / 72.0)

    rain = _num(features, "precipitation_24h_mm")
    wet_relief = clamp(rain / 10.0)

    return clamp(0.4 * dryness + 0.35 * wind_factor + 0.25 * drought - 0.3 * wet_relief)


def level_for(score: float) -> str:
    for threshold, name in LEVELS:
        if score >= threshold:
            return name
    return "LOW"


def assess_risk(
    predicted_class: str,
    features: Dict[str, Any],
    validity_p_real: Optional[float] = None,
) -> RiskAssessment:
    """Operational concern, 0-100, independent of classification confidence.

    `validity_p_real` scales the result: an event we do not believe is a fire
    cannot be a high-risk fire. That is the one place the earlier stages are
    allowed to touch risk, and it can only ever reduce it.
    """
    components = {
        "thermal": round(thermal_component(features), 4),
        "anomaly": round(anomaly_component(features), 4),
        "exposure": round(exposure_component(features), 4),
        "hazard": round(hazard_component(predicted_class), 4),
        "environment": round(environment_component(features), 4),
    }
    contributions = {
        name: round(value * WEIGHTS[name] * 100.0, 2) for name, value in components.items()
    }
    raw = sum(contributions.values())

    caveats = []
    if validity_p_real is not None and validity_p_real < 1.0:
        raw *= validity_p_real
        if validity_p_real < 0.65:
            caveats.append(
                "Scaled down: the detection itself is doubtful, so this cannot be "
                "treated as a confirmed high-risk fire."
            )

    if (features.get("osm_coverage") or "sparse") != "ok":
        caveats.append(
            "Exposure is a lower bound — OpenStreetMap coverage here is "
            f"{features.get('osm_coverage') or 'unavailable'}, so people and "
            "infrastructure may be present but unmapped."
        )
    if (features.get("weather_baseline_quality") or "insufficient") != "ok":
        caveats.append("Environmental component is weakened by a thin weather baseline.")

    score = round(clamp(raw, 0.0, 100.0), 1)

    drivers = [
        {"component": name, "points": contributions[name], "value": components[name]}
        for name in sorted(contributions, key=contributions.get, reverse=True)
    ]

    return RiskAssessment(
        score=score,
        level=level_for(score),
        components=components,
        contributions=contributions,
        drivers=drivers,
        caveats=caveats,
    )
