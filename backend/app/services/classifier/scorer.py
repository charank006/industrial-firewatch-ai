"""Transparent probabilistic fire-source classifier (spec sections 12, 15, 19).

An additive log-evidence model - a hand-weighted multinomial logit - not an
if/elif cascade. The dead `classificationEngine.ts` this replaces returned
hardcoded confidences (94/91/85/78/65), could not express "two hypotheses are
close", and could not be tuned without editing code. Its RULES are ported here
as evidence terms; its structure deliberately is not.

    score_c = bias_c + sum_i weight[i][c] * f_i(features)
    p       = softmax(score / temperature)
    p       = (1-floor)*p + floor/len(classes)

Every f_i is bounded to [0,1], which is what keeps the weights comparable and
the whole thing legible to a human reading rules_v1.json.

`unknown` carries a bias and no evidence terms, so it wins by construction
when nothing else scores - there is no special-case default branch.

Output is the exact contract Phase 8's trained model will emit, so swapping
the model changes `model_kind` and nothing else.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

RULES_PATH = Path(__file__).parent / "rules_v1.json"

# Backend class id -> the UI's existing label. Mirrored in
# frontend/src/services/adapters.ts; the two must agree.
CLASS_LABEL = {
    "industrial": "Industrial Fire",
    "flare": "Routine Flare",
    "forest": "Forest Fire",
    "agriculture": "Agricultural Burning",
    "gas_oil": "Gas/Oil",
    "urban": "Urban",
    "mining": "Mining / Extraction",
    "unknown": "Unknown Anomaly",
}


@lru_cache(maxsize=1)
def load_rules() -> Tuple[Dict[str, Any], str]:
    """Load the rule file and derive a version from its content hash.

    Hashing the file means a weight tweak is as traceable as a code change.
    """
    raw = RULES_PATH.read_bytes()
    rules = json.loads(raw)
    digest = hashlib.sha256(raw).hexdigest()[:6]
    return rules, f"{rules['model_name']}.{digest}"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def logistic(x: float) -> float:
    if x < -50:
        return 0.0
    if x > 50:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


@dataclass
class EvidenceTerm:
    key: str
    label: str
    detail_template: str
    compute: Callable[[Dict[str, Any]], float]
    #: Set when the term should never be surfaced as a reasoning step on its
    #: own (e.g. purely corroborating signals).
    quiet: bool = False


def _get(features: Dict[str, Any], key: str, default: float = 0.0) -> float:
    value = features.get(key)
    return default if value is None else float(value)


# --- Evidence functions ---------------------------------------------------
# Each returns [0,1]. Thresholds are chosen so a "typical strong example"
# lands near 1.0 rather than saturating on noise.

EVIDENCE: List[EvidenceTerm] = [
    EvidenceTerm(
        "inside_industrial",
        "Industrial Perimeter Containment",
        "Detection falls inside a mapped industrial parcel",
        lambda f: 1.0 if f.get("inside_industrial") else 0.0,
    ),
    EvidenceTerm(
        "industrial_area",
        "Industrial Land Cover",
        "{industrial_area_km2:.2f} km2 industrial land within {radius_km:.0f} km radius",
        lambda f: clamp(_get(f, "industrial_fraction") / 0.4),
    ),
    EvidenceTerm(
        "factory_near",
        "Facility Proximity",
        "Nearest mapped factory {nearest_factory_m:.0f} m away",
        lambda f: 1.0 - clamp(_get(f, "nearest_factory_m", 5000.0) / 1000.0),
    ),
    EvidenceTerm(
        "gas_tags",
        "Hydrocarbon Infrastructure",
        "{gas_facilities_within_1km:.0f} gas/petroleum installation(s) mapped within 1 km",
        lambda f: clamp(_get(f, "gas_facilities_within_1km") / 2.0),
    ),
    EvidenceTerm(
        "no_gas_infrastructure",
        "No Hydrocarbon Infrastructure",
        "No gas or petroleum installation mapped within 1 km",
        # The complement of gas_tags. A flare stack burns hydrocarbon, so
        # without any gas installation nearby there is nothing to flare -
        # however recurrent and stable the heat looks. Coal seam fires inside
        # a mine matched every other flare signal (inside an industrial
        # parcel, FRP tracking the site median, recurring) and were reported
        # as "Routine Flare", which reads to an operator as normal and
        # expected. They are not.
        lambda f: 1.0 if _get(f, "gas_facilities_within_1km") < 1 else 0.0,
    ),
    EvidenceTerm(
        "builtup_cover",
        "Built-up Ground Cover",
        "{builtup_fraction:.0%} of the surrounding area is built-up",
        # From the WorldCover raster, which measures every pixel. The urban
        # class previously had only OSM residential polygons, which are
        # absent across most of the AOI.
        lambda f: clamp(_get(f, "builtup_fraction") / 0.4),
    ),
    EvidenceTerm(
        "scrub_over_trees",
        "Scrub Exceeds Woodland",
        "{scrub_grass_fraction:.0%} scrub, grass or bare ground against "
        "{forest_fraction:.0%} tree cover",
        # Comparative, not absolute. Half the AOI has more scrub than tree
        # cover, and WorldCover's "tree cover" class starts at 10% canopy, so
        # scattered trees over scrubland were reading as forest: a disc that
        # was 77% bare ground and 16% tree cover classified as Forest Fire.
        #
        # An absolute scrub penalty over-corrected, demoting genuinely wooded
        # events. Measuring the EXCESS of scrub over trees leaves those alone
        # (the term is zero whenever trees lead) and only speaks where scrub
        # actually dominates.
        lambda f: clamp(
            (_get(f, "scrub_grass_fraction") - _get(f, "forest_fraction")) / 0.5
        ),
    ),
    EvidenceTerm(
        "mine_tags",
        "Mining / Quarrying Infrastructure",
        "{mines_within_1km:.0f} mine or quarry site(s) mapped within 1 km",
        # Specific tags, like gas_tags for Gas/Oil. Without this a coal seam
        # fire inside an open-cast mine reads as a generic factory fire: the
        # quarry is industrial land, so every industrial term fires and
        # nothing distinguishes it.
        lambda f: clamp(_get(f, "mines_within_1km") / 1.5),
    ),
    EvidenceTerm(
        "forest_area",
        "Forest Land Cover",
        "{forest_area_km2:.2f} km2 forest/woodland within radius",
        # 0.4, chosen by sweeping 0.3/0.4/0.5 over every stored feature vector
        # and scoring each against WorldCover's own dominant class. 0.3 recalls
        # every wooded event but misses 8 cropland ones; 0.5 is the mirror
        # image. 0.4 is the balanced point: 28/30 and 55/58.
        #
        # The old 0.3 was far too generous for this AOI - the median location
        # has 18.5% tree cover and was collecting 62% of the full forest weight.
        lambda f: clamp(_get(f, "forest_fraction") / 0.4),
    ),
    EvidenceTerm(
        "farmland_area",
        "Cropland Land Cover",
        "{farmland_area_km2:.2f} km2 farmland within radius",
        lambda f: clamp(_get(f, "farmland_fraction") / 0.3),
    ),
    EvidenceTerm(
        "residential_area",
        "Residential Land Cover",
        "{residential_area_km2:.2f} km2 residential land within radius",
        lambda f: clamp(_get(f, "residential_fraction") / 0.3),
    ),
    EvidenceTerm(
        "building_density",
        "Built Structure Density",
        "{building_count:.0f} mapped buildings within radius",
        lambda f: clamp(_get(f, "building_count") / 30.0),
        quiet=True,
    ),
    EvidenceTerm(
        "low_vegetation",
        "Vegetation Scarcity",
        "Vegetated land cover below 10% of surrounding area",
        lambda f: 1.0
        - clamp(
            (
                _get(f, "forest_fraction")
                + _get(f, "farmland_fraction")
                + _get(f, "scrub_grass_fraction")
            )
            / 0.3
        ),
        quiet=True,
    ),
    EvidenceTerm(
        "recurrence",
        "Thermal Recurrence History",
        "{recurrence_count:.0f} prior event(s) at this location in {history_days:.0f} day(s) of system history",
        lambda f: logistic((_get(f, "recurrence_count") - 8.0) / 3.0),
    ),
    EvidenceTerm(
        "frp_stable",
        "Radiative Output Stability",
        "FRP {frp_latest_mw:.1f} MW tracks the site's own median of {site_median_frp_mw:.1f} MW",
        # Stability relative to the SITE'S OWN history, not an absolute
        # threshold. This is the flare-vs-fire discriminator, and it is exactly
        # what the old engine's `frpMw > 100` rule got wrong.
        lambda f: (
            0.0
            if _get(f, "site_median_frp_mw") <= 0
            else 1.0
            - clamp(
                abs(_get(f, "frp_latest_mw") - _get(f, "site_median_frp_mw"))
                / max(_get(f, "site_median_frp_mw"), 5.0)
            )
        ),
    ),
    EvidenceTerm(
        "frp_high",
        "Radiative Power Magnitude",
        "FRP {frp_latest_mw:.1f} MW",
        lambda f: logistic((_get(f, "frp_latest_mw") - 60.0) / 25.0),
    ),
    EvidenceTerm(
        "long_duration",
        "Event Duration",
        "Burning for {duration_hours:.1f} h across {detection_count:.0f} observation(s)",
        lambda f: clamp(_get(f, "duration_hours") / 48.0),
        quiet=True,
    ),
    EvidenceTerm(
        "night",
        "Night-time Detection",
        "Detected on a night overpass",
        lambda f: 1.0 if f.get("day_night") == "N" else 0.0,
        quiet=True,
    ),
    EvidenceTerm(
        "neighbours",
        "Simultaneous Nearby Activity",
        "{neighbour_events_10km_24h:.0f} other event(s) within 10 km in 24 h",
        # Stubble burning is gregarious: many simultaneous detections across a
        # district. Cheap and strong, and rarely used.
        lambda f: clamp(_get(f, "neighbour_events_10km_24h") / 5.0),
    ),
    EvidenceTerm(
        "dryness",
        "Environmental Dryness Anomaly",
        "Vapour pressure deficit {vpd_anomaly_kpa:+.2f} kPa above the six-day baseline",
        lambda f: clamp(_get(f, "vpd_anomaly_kpa") / 1.5),
    ),
]

EVIDENCE_BY_KEY = {term.key: term for term in EVIDENCE}


@dataclass
class Prediction:
    prediction: str
    label: str
    confidence: float  # 0-1
    confidence_pct: int  # 0-100, for the existing UI field
    probabilities: Dict[str, float]
    severity: str
    model_version: str
    model_kind: str = "rule_scorer"
    reasoning_steps: List[Dict[str, Any]] = field(default_factory=list)
    evidence: Dict[str, float] = field(default_factory=dict)
    scores: Dict[str, float] = field(default_factory=dict)
    data_quality: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "prediction": self.prediction,
            "label": self.label,
            "confidence": round(self.confidence, 4),
            "confidence_pct": self.confidence_pct,
            "probabilities": {k: round(v, 4) for k, v in self.probabilities.items()},
            "severity": self.severity,
            "model_version": self.model_version,
            "model_kind": self.model_kind,
            "reasoning_steps": self.reasoning_steps,
            "data_quality": round(self.data_quality, 3),
        }


def compute_evidence(features: Dict[str, Any]) -> Dict[str, float]:
    return {term.key: round(term.compute(features), 4) for term in EVIDENCE}


def softmax(scores: Dict[str, float], temperature: float) -> Dict[str, float]:
    largest = max(scores.values())
    exps = {k: math.exp((v - largest) / temperature) for k, v in scores.items()}
    total = sum(exps.values())
    return {k: v / total for k, v in exps.items()}


def entropy_normalised(probabilities: Dict[str, float]) -> float:
    n = len(probabilities)
    if n <= 1:
        return 1.0
    h = -sum(p * math.log(p) for p in probabilities.values() if p > 0)
    return 1.0 - h / math.log(n)


def data_quality_factor(features: Dict[str, Any], rules: Dict[str, Any]) -> Tuple[float, List[str]]:
    """Degrade confidence when inputs are thin, and say why.

    Making missing data visibly lower confidence is the honest behaviour, and
    it needs no change to any UI component.
    """
    config = rules["confidence"]
    factor = 1.0
    notes: List[str] = []

    if features.get("osm_coverage") == "sparse":
        factor -= config["penalty_sparse_osm"]
        notes.append(
            f"OSM coverage sparse - {int(_get(features, 'osm_element_count'))} elements mapped within radius"
        )
    if features.get("weather_baseline_quality") not in {"ok", None}:
        factor -= config["penalty_partial_weather"]
        notes.append(
            f"Weather baseline {features.get('weather_baseline_quality')} "
            f"({int(_get(features, 'weather_baseline_samples'))}/6 days)"
        )
    if _get(features, "detection_count") <= 1:
        factor -= config["penalty_single_detection"]
        notes.append("Single satellite observation - no temporal corroboration")

    return max(0.3, factor), notes


def derive_severity(
    predicted: str, features: Dict[str, Any], rules: Dict[str, Any], exposure_count: int = 0
) -> str:
    """Severity from class, FRP and exposure - not class alone.

    The old engine returned `isCritical ? 'HIGH' : 'HIGH'`, so it could never
    emit CRITICAL at all.
    """
    config = rules["severity"]
    frp = _get(features, "frp_latest_mw")

    if predicted in config["benign_classes"]:
        base = "MEDIUM" if frp >= config["frp_high"] else "LOW"
    elif frp >= config["frp_critical"]:
        base = "CRITICAL"
    elif frp >= config["frp_high"]:
        base = "HIGH"
    elif frp >= config["frp_medium"]:
        base = "MEDIUM"
    else:
        base = "LOW"

    # People and infrastructure downwind escalate a fire that FRP alone would
    # under-rate.
    if (
        exposure_count >= config["exposure_escalation_threshold"]
        and predicted not in config["benign_classes"]
    ):
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        base = order[min(len(order) - 1, order.index(base) + 1)]

    return base


def build_reasoning_steps(
    features: Dict[str, Any],
    evidence: Dict[str, float],
    weights: Dict[str, Dict[str, float]],
    winner: str,
    probabilities: Dict[str, float],
    severity: str,
    model_version: str,
    quality_notes: List[str],
    max_steps: int = 5,
) -> List[Dict[str, Any]]:
    """Rank evidence by its pull toward the winning class.

    Contribution is measured against the mean across classes, so a term that
    raises every class equally is correctly reported as uninformative.
    """
    contributions: List[Tuple[float, str, float]] = []
    for key, value in evidence.items():
        if value <= 0:
            continue
        per_class = weights.get(key, {})
        winner_pull = per_class.get(winner, 0.0) * value
        mean_pull = sum(per_class.get(c, 0.0) * value for c in probabilities) / len(probabilities)
        contributions.append((winner_pull - mean_pull, key, value))

    contributions.sort(key=lambda c: abs(c[0]), reverse=True)

    benign = winner in {"flare", "agriculture"}
    steps: List[Dict[str, Any]] = []
    index = 1

    for contribution, key, value in contributions:
        term = EVIDENCE_BY_KEY[key]
        if term.quiet and len(steps) >= 3:
            continue
        if len(steps) >= max_steps:
            break

        if contribution > 0.25:
            status = "passed" if benign else ("critical" if severity in {"HIGH", "CRITICAL"} else "warning")
        elif contribution < -0.25:
            status = "warning"
        else:
            status = "neutral"

        try:
            detail = term.detail_template.format(**features)
        except (KeyError, ValueError, TypeError):
            detail = term.label

        steps.append(
            {"step_index": index, "label": term.label, "detail": detail, "status": status}
        )
        index += 1

    # Degraded inputs are always stated, never quietly absorbed (spec Rule 4).
    for note in quality_notes:
        steps.append(
            {"step_index": index, "label": "Data Coverage Check", "detail": note, "status": "neutral"}
        )
        index += 1

    top = probabilities[winner]
    steps.append(
        {
            "step_index": index,
            "label": "Rule Engine Output",
            "detail": (
                f"Most probable source: {CLASS_LABEL[winner]} (p={top:.2f}, model {model_version}). "
                "Probabilistic estimate, not a determination of ignition cause."
            ),
            "status": "critical" if severity in {"HIGH", "CRITICAL"} else "passed",
        }
    )
    return steps


#: Urgency prefix comes from SEVERITY, the body from the predicted class.
#: Keying the prefix on class alone produced "CRITICAL ALERT" on a MEDIUM
#: severity event - an urgency the assessment did not support.
_SEVERITY_PREFIX = {
    "CRITICAL": "CRITICAL ALERT",
    "HIGH": "HIGH ALERT",
    "MEDIUM": "ADVISORY",
    "LOW": "MONITORING",
}

_CLASS_ACTION = {
    "flare": "Thermal signature consistent with a recurring industrial flare at this site.",
    "gas_oil": "Hydrocarbon infrastructure in range. Verify containment and notify the facility safety desk.",
    "industrial": "Industrial thermal anomaly. Verify facility telemetry and consider industrial fire response.",
    "forest": "Vegetation fire indicated. Assess spread risk against prevailing wind.",
    "agriculture": "Pattern consistent with agricultural residue burning. Log for air-quality reporting.",
    "urban": "Built-up area involved. Assess structure and population exposure.",
    "mining": "Mine or quarry site. Check for coal seam or spoil-heap combustion, which "
               "burns for months and is not extinguished like a surface fire.",
    "unknown": "Source could not be attributed with confidence. Manual review recommended.",
}


def suggested_action(predicted: str, severity: str, features: Dict[str, Any]) -> str:
    prefix = _SEVERITY_PREFIX.get(severity, "ADVISORY")
    body = _CLASS_ACTION.get(predicted, _CLASS_ACTION["unknown"])
    return f"{prefix}: {body}"


def classify(features: Dict[str, Any], exposure_count: int = 0) -> Prediction:
    """Score one fire event's feature vector into a probability distribution."""
    rules, model_version = load_rules()
    classes: List[str] = rules["classes"]
    weights: Dict[str, Dict[str, float]] = rules["weights"]

    evidence = compute_evidence(features)

    scores = {c: float(rules["bias"].get(c, 0.0)) for c in classes}
    for key, value in evidence.items():
        for cls, weight in weights.get(key, {}).items():
            scores[cls] += weight * value

    probabilities = softmax(scores, rules["temperature"])

    # No class is ever exactly zero (spec Rule 8).
    floor = rules["probability_floor"]
    probabilities = {
        c: (1.0 - floor) * p + floor / len(classes) for c, p in probabilities.items()
    }

    ranked = sorted(probabilities.items(), key=lambda kv: kv[1], reverse=True)
    winner, p_top = ranked[0]
    p_second = ranked[1][1]

    severity = derive_severity(winner, features, rules, exposure_count)
    quality, quality_notes = data_quality_factor(features, rules)

    config = rules["confidence"]
    raw_confidence = (
        config["weight_p_top"] * p_top
        + config["weight_margin"] * (p_top - p_second)
        + config["weight_entropy"] * entropy_normalised(probabilities)
    ) * quality
    confidence_pct = int(
        round(max(config["min"], min(config["max"], raw_confidence * 100)))
    )

    return Prediction(
        prediction=winner,
        label=CLASS_LABEL[winner],
        confidence=raw_confidence,
        confidence_pct=confidence_pct,
        probabilities=probabilities,
        severity=severity,
        model_version=model_version,
        reasoning_steps=build_reasoning_steps(
            features,
            evidence,
            weights,
            winner,
            probabilities,
            severity,
            model_version,
            quality_notes,
        ),
        evidence=evidence,
        scores={k: round(v, 4) for k, v in scores.items()},
        data_quality=quality,
    )
