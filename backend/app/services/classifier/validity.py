"""Detection validity: is this a real fire, or an artefact? (spec Rule 1)

Deliberately separate from the source classifier. Source asks *what kind of
fire*; validity asks *whether there is a fire at all*. Conflating them is how
a dashboard ends up confidently naming the cause of a sun glint.

The signals are the ones a satellite actually gives us:

**I4-I5 thermal contrast** is the core fire signature - a real fire is far
hotter in the 4um channel than in the 11um background channel. Calibrated
against 74 real Telangana detections, this splits hard by day/night (day
median 39.1K, night median 15.8K) because the background channel is much
cooler at night. A single threshold would mark every legitimate night
detection as false, so contrast is always normalised against its own
time-of-day reference.

**NASA's own confidence** is the strongest single input. VIIRS emits l|n|h;
MODIS emits 0-100, and does sometimes emit 0 - a detection NASA itself does
not stand behind.

**Persistence** separates fires from infrastructure. A steel plant, kiln or
flare stack is a genuine thermal source that appears at the same pixel
day after day. It is not a fire, and should not be reported as one.

This is a transparent heuristic, not a validated detector: there is no
labelled false-positive dataset behind it. It reports a probability with its
reasons, never a verdict of fact.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

RULES_PATH = Path(__file__).parent / "validity_v1.json"

VERDICT_REAL = "REAL_FIRE"
VERDICT_UNCERTAIN = "UNCERTAIN"
VERDICT_FALSE = "LIKELY_FALSE_ALARM"


@lru_cache(maxsize=1)
def load_validity_rules() -> Tuple[Dict[str, Any], str]:
    raw = RULES_PATH.read_bytes()
    rules = json.loads(raw)
    return rules, f"{rules['model_name']}.{hashlib.sha256(raw).hexdigest()[:6]}"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def logistic(x: float) -> float:
    if x < -50:
        return 0.0
    if x > 50:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def _num(features: Dict[str, Any], key: str, default: Optional[float] = None) -> Optional[float]:
    value = features.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@dataclass
class ValidityAssessment:
    verdict: str
    p_real: float
    confidence_pct: int
    model_version: str
    concerns: List[str] = field(default_factory=list)
    evidence: Dict[str, float] = field(default_factory=dict)
    reasoning_steps: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def is_assessable(self) -> bool:
        """Whether it is honest to go on and classify the source.

        A detection we believe is probably not a fire should not be handed a
        confident source label.
        """
        return self.verdict != VERDICT_FALSE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "verdict": self.verdict,
            "p_real": round(self.p_real, 4),
            "confidence_pct": self.confidence_pct,
            "model_version": self.model_version,
            "concerns": self.concerns,
            "reasoning_steps": self.reasoning_steps,
            "interpretation": (
                "Heuristic assessment of whether this thermal anomaly is a genuine fire. "
                "A FIRMS record is a satellite-detected thermal anomaly, not a confirmed fire."
            ),
        }


def thermal_contrast_k(features: Dict[str, Any]) -> Optional[float]:
    """I4 - I5 for VIIRS. MODIS reports different channels, so returns None."""
    ti4, ti5 = _num(features, "bright_ti4"), _num(features, "bright_ti5")
    if ti4 is None or ti5 is None:
        return None
    return ti4 - ti5


def assess_validity(features: Dict[str, Any]) -> ValidityAssessment:
    rules, model_version = load_validity_rules()
    weights = rules["weights"]
    concerns: List[str] = []
    steps: List[Dict[str, Any]] = []

    day_night = "N" if features.get("day_night") == "N" else "D"
    is_night = day_night == "N"

    # --- NASA's own confidence -------------------------------------------
    nasa_pct = _num(features, "detection_confidence_pct", 0.0) or 0.0
    f_nasa = clamp(nasa_pct / 80.0)
    if nasa_pct <= 25:
        concerns.append("low_nasa_confidence")
    steps.append(
        {
            "label": "NASA Detection Confidence",
            "detail": f"NASA rated this detection {nasa_pct:.0f}/100"
            + (" - NASA does not stand behind this pixel" if nasa_pct <= 5 else ""),
            "status": "critical" if nasa_pct <= 25 else "passed",
        }
    )

    # --- thermal contrast, normalised by time of day ----------------------
    contrast = thermal_contrast_k(features)
    reference = rules["thermal_contrast_reference_k"][day_night]
    if contrast is None:
        # MODIS: no comparable channel pair. Neutral rather than penalised -
        # absence of a signal is not evidence against.
        f_contrast = 0.5
        steps.append(
            {
                "label": "Thermal Contrast",
                "detail": "Sensor does not provide the I4/I5 channel pair - contrast not assessable",
                "status": "neutral",
            }
        )
    else:
        f_contrast = clamp(contrast / reference)
        weak = contrast < reference * 0.55
        if weak:
            concerns.append("weak_thermal_contrast")
        steps.append(
            {
                "label": "Thermal Contrast (I4-I5)",
                "detail": (
                    f"{contrast:.1f} K against a {reference:.0f} K "
                    f"{'night-time' if is_night else 'daytime'} reference"
                ),
                "status": "warning" if weak else "passed",
            }
        )

    # --- radiative power ---------------------------------------------------
    frp = _num(features, "frp_latest_mw", 0.0) or 0.0
    f_frp = logistic((frp - 2.0) / 2.5)
    if frp < 1.5:
        concerns.append("very_low_frp")
    steps.append(
        {
            "label": "Radiative Power",
            "detail": f"FRP {frp:.1f} MW"
            + (" - near the sensor's detection floor" if frp < 1.5 else ""),
            "status": "warning" if frp < 1.5 else "passed",
        }
    )

    # --- geometry ----------------------------------------------------------
    scan = _num(features, "scan", 0.4) or 0.4
    f_off_nadir = clamp((scan - 1.0) / 2.0)
    if scan > 1.5:
        concerns.append("off_nadir")
        steps.append(
            {
                "label": "Scan Geometry",
                "detail": f"Scan angle {scan:.2f} - pixel is well off-nadir, so footprint and geolocation degrade",
                "status": "warning",
            }
        )

    # --- corroboration -----------------------------------------------------
    detection_count = _num(features, "detection_count", 1) or 1
    sensor_count = _num(features, "distinct_sensors", 1) or 1
    f_multi = clamp((sensor_count - 1) / 2.0 + (detection_count - 1) / 6.0)
    if detection_count <= 1:
        concerns.append("single_observation")
    steps.append(
        {
            "label": "Corroboration",
            "detail": f"{int(detection_count)} observation(s) from {int(sensor_count)} sensor(s)",
            "status": "passed" if detection_count > 1 else "warning",
        }
    )

    # --- night rules out sun glint ----------------------------------------
    f_night = 1.0 if is_night else 0.0
    if is_night:
        steps.append(
            {
                "label": "Night-time Detection",
                "detail": "Detected on a night pass - specular sun glint is not possible",
                "status": "passed",
            }
        )

    # --- persistence: infrastructure, not an episodic fire -----------------
    recurrence = _num(features, "recurrence_count", 0) or 0
    f_persistent = logistic((recurrence - 10.0) / 3.0)
    if recurrence >= 10:
        concerns.append("persistent_hotspot")
        steps.append(
            {
                "label": "Persistence Check",
                "detail": (
                    f"{int(recurrence)} prior events at this exact location - consistent with a "
                    "permanent heat source (flare stack, kiln, plant) rather than a fire"
                ),
                "status": "warning",
            }
        )

    # --- daytime glint over water -----------------------------------------
    water_km2 = _num(features, "water_area_km2", 0.0) or 0.0
    f_glint = 0.0
    if not is_night and water_km2 > 0.3 and (contrast is None or contrast < reference * 0.7):
        f_glint = clamp(water_km2 / 1.0)
        concerns.append("possible_water_glint")
        steps.append(
            {
                "label": "Sun Glint Risk",
                "detail": (
                    f"Daytime detection with {water_km2:.2f} km2 of water nearby and modest thermal "
                    "contrast - specular reflection can mimic a thermal anomaly"
                ),
                "status": "warning",
            }
        )

    # --- the combination that most often means "not a fire" ---------------
    # <= 0.5, not < 0.5: MODIS has no I4/I5 pair and sits at exactly the 0.5
    # neutral placeholder, which a strict comparison skipped entirely.
    f_weak_combo = 1.0 if (nasa_pct <= 25 and frp < 2.0 and f_contrast <= 0.5) else 0.0
    if f_weak_combo:
        steps.append(
            {
                "label": "Combined Weak Signal",
                "detail": "Low NASA confidence, minimal radiative power and weak contrast together",
                "status": "critical",
            }
        )

    # A pixel NASA scores at or near zero needs an explicit penalty; merely
    # withholding positive credit still let such detections pass.
    f_nasa_rejected = 1.0 if nasa_pct <= 25 else 0.0

    evidence = {
        "nasa_confidence": round(f_nasa, 4),
        "nasa_rejected": f_nasa_rejected,
        "thermal_contrast": round(f_contrast, 4),
        "frp_magnitude": round(f_frp, 4),
        "night_detection": f_night,
        "multi_sensor_agreement": round(f_multi, 4),
        "off_nadir_penalty": round(f_off_nadir, 4),
        "persistent_hotspot": round(f_persistent, 4),
        "daytime_water_glint_risk": round(f_glint, 4),
        "weak_signal_combo": f_weak_combo,
    }

    score = float(rules["bias"]) + sum(weights[k] * v for k, v in evidence.items())
    p_real = logistic(score / rules["temperature"])

    thresholds = rules["verdict_thresholds"]
    if p_real >= thresholds["real_fire"]:
        verdict = VERDICT_REAL
    elif p_real < thresholds["likely_false_alarm"]:
        verdict = VERDICT_FALSE
    else:
        verdict = VERDICT_UNCERTAIN

    steps.append(
        {
            "label": "Validity Assessment",
            "detail": (
                f"{verdict.replace('_', ' ').title()} (p={p_real:.2f}, model {model_version}). "
                "Heuristic estimate - a FIRMS record is a thermal anomaly, not a confirmed fire."
            ),
            "status": {
                VERDICT_REAL: "passed",
                VERDICT_UNCERTAIN: "warning",
                VERDICT_FALSE: "critical",
            }[verdict],
        }
    )

    for index, step in enumerate(steps, start=1):
        step["step_index"] = index

    return ValidityAssessment(
        verdict=verdict,
        p_real=p_real,
        confidence_pct=int(round(p_real * 100)),
        model_version=model_version,
        concerns=concerns,
        evidence=evidence,
        reasoning_steps=steps,
    )
