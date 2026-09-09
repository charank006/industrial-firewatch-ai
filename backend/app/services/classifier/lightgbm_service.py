"""LightGBM Multiclass Source Classifier Service for GeoFlare AI (Architecture Phase 14 & 16).

Loads the trained LightGBM model, feature schema, and class mapping artifacts.
Executes predict_proba(), applies the unknown confidence threshold,
and outputs all 6 canonical class probabilities.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np

from app.config import settings
from ml.feature_schema import (
    CANONICAL_CLASSES,
    CLASS_DISPLAY_NAMES,
    CLASS_TO_INDEX,
    FEATURE_NAMES,
    INDEX_TO_CLASS,
    extract_feature_vector,
)

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[3] / "models"


@dataclass
class LightGBMPrediction:
    predicted_class: str
    predicted_label: str
    predicted_probability: float
    probabilities: Dict[str, float]
    confidence_pct: int
    severity: str
    model_version: str
    model_kind: str = "lightgbm_multiclass"
    reasoning_steps: List[Dict[str, Any]] = field(default_factory=list)
    suggested_action: str = ""
    feature_vector: List[float] = field(default_factory=list)
    data_quality: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "predicted_class": self.predicted_class,
            "prediction": self.predicted_class,
            "label": self.predicted_label,
            "predicted_probability": round(self.predicted_probability, 4),
            "confidence": round(self.predicted_probability, 4),
            "confidence_pct": self.confidence_pct,
            "probabilities": {k: round(v, 4) for k, v in self.probabilities.items()},
            "severity": self.severity,
            "model_version": self.model_version,
            "model_kind": self.model_kind,
            "reasoning_steps": self.reasoning_steps,
            "suggested_action": self.suggested_action,
            "data_quality": round(self.data_quality, 3),
        }


class LightGBMModelHolder:
    """Singleton holder that loads the model once at startup."""

    _instance: Optional[LightGBMModelHolder] = None

    def __init__(self):
        self.model = None
        self.model_version = "lightgbm_v1.0.0"
        self.feature_names = FEATURE_NAMES
        self.classes = CANONICAL_CLASSES
        self._load()

    def _load(self):
        model_path = MODELS_DIR / "geoflare_lightgbm.joblib"
        if not model_path.exists():
            # Try relative path
            model_path = Path(settings.ML_MODEL_PATH)

        if model_path.exists():
            try:
                self.model = joblib.load(model_path)
                logger.info("Loaded LightGBM model from %s", model_path)
            except Exception as e:
                logger.error("Failed to load LightGBM model from %s: %s", model_path, e)
                self.model = None
        else:
            logger.warning("LightGBM model artifact not found at %s", model_path)

        metadata_path = MODELS_DIR / "model_metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    self.model_version = meta.get("model_version", "lightgbm_v1.0.0")
            except Exception:
                pass


@lru_cache(maxsize=1)
def get_model_holder() -> LightGBMModelHolder:
    return LightGBMModelHolder()


def derive_severity_from_prediction(
    predicted_class: str,
    probability: float,
    features: Dict[str, Any],
    exposure_count: int = 0,
) -> str:
    """Beta Severity Engine (spec Phase 24).
    Calculates severity based on FRP, predicted class, and proximity/exposure.
    """
    frp = float(features.get("frp_latest_mw") or features.get("frp_mw") or 0.0)

    # Benign routine categories
    if predicted_class in {"agricultural_burning", "gas_oil_flare"}:
        base = "MEDIUM" if frp >= 80.0 else "LOW"
    elif frp >= 200.0:
        base = "CRITICAL"
    elif frp >= 75.0:
        base = "HIGH"
    elif frp >= 25.0:
        base = "MEDIUM"
    else:
        base = "LOW"

    # Escalation from downwind exposed facilities/people
    if exposure_count >= 3 and predicted_class not in {"agricultural_burning", "gas_oil_flare"}:
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        base = order[min(len(order) - 1, order.index(base) + 1)]

    return base


def format_suggested_action(predicted_class: str, severity: str) -> str:
    urgency = {
        "CRITICAL": "CRITICAL ALERT",
        "HIGH": "HIGH ALERT",
        "MEDIUM": "ADVISORY",
        "LOW": "MONITORING",
    }.get(severity, "ADVISORY")

    guidance = {
        "industrial_fire": "Industrial thermal anomaly detected. Verify facility perimeter telemetry and alert emergency industrial response team.",
        "gas_oil_flare": "Thermal signature consistent with gas/oil flaring installation. Verify relief flare log with facility operator.",
        "forest_fire": "Vegetation / wildfire thermal signature indicated. Monitor wind direction and local spread rate.",
        "agricultural_burning": "Pattern consistent with seasonal crop residue / stubble burning. Log for particulate and air quality tracking.",
        "urban_other": "Thermal anomaly in built-up / populated zone. Check municipal emergency dispatch records.",
        "unknown": "Source category could not be attributed with high confidence. Manual operator verification recommended.",
    }.get(predicted_class, "Source classification pending further telemetry.")

    return f"{urgency}: {guidance}"


def build_ml_reasoning_steps(
    predicted_class: str,
    probability: float,
    probabilities: Dict[str, float],
    features: Dict[str, Any],
    severity: str,
    model_version: str,
) -> List[Dict[str, Any]]:
    steps: List[Dict[str, Any]] = []
    step_idx = 1

    frp = float(features.get("frp_latest_mw") or 0.0)
    steps.append({
        "step_index": step_idx,
        "label": "Thermal Radiative Power",
        "detail": f"FRP {frp:.1f} MW detected across {int(features.get('detection_count') or 1)} satellite observation(s)",
        "status": "critical" if frp >= 100 else ("warning" if frp >= 25 else "neutral"),
    })
    step_idx += 1

    # Spatial context
    ind_frac = float(features.get("industrial_fraction") or 0.0)
    for_frac = float(features.get("forest_fraction") or 0.0)
    farm_frac = float(features.get("farmland_fraction") or 0.0)
    factories = int(features.get("factories_within_1km") or 0)

    if ind_frac > 0.2 or factories > 0:
        steps.append({
            "step_index": step_idx,
            "label": "Industrial Footprint Context",
            "detail": f"{factories} factory/industrial site(s) mapped within 1km (industrial fraction: {ind_frac*100:.0f}%)",
            "status": "critical" if ind_frac >= 0.5 else "warning",
        })
        step_idx += 1
    elif for_frac > 0.2:
        steps.append({
            "step_index": step_idx,
            "label": "Forest Vegetation Context",
            "detail": f"Forest/woodland land cover covers {for_frac*100:.0f}% of surrounding 1km radius",
            "status": "warning",
        })
        step_idx += 1
    elif farm_frac > 0.2:
        steps.append({
            "step_index": step_idx,
            "label": "Agricultural Land Context",
            "detail": f"Cropland/farmland covers {farm_frac*100:.0f}% of surrounding 1km radius",
            "status": "neutral",
        })
        step_idx += 1

    # LightGBM Classifier Output Step
    display_name = CLASS_DISPLAY_NAMES.get(predicted_class, predicted_class.replace("_", " ").title())
    steps.append({
        "step_index": step_idx,
        "label": "LightGBM Multiclass Model Output",
        "detail": (
            f"Most probable source category: {display_name} "
            f"(probability={probability:.2f}, model {model_version}). "
            "Probabilistic estimate derived from gradient-boosted decision trees."
        ),
        "status": "critical" if severity in {"HIGH", "CRITICAL"} else "passed",
    })

    return steps


def predict_thermal_source(
    raw_features: Dict[str, Any],
    exposure_count: int = 0,
    confidence_threshold: Optional[float] = None,
) -> LightGBMPrediction:
    """Primary entrypoint to classify a non-persistent thermal source using LightGBM.

    Extracts feature vector, runs predict_proba, applies unknown threshold,
    and returns a complete LightGBMPrediction.
    """
    threshold = confidence_threshold if confidence_threshold is not None else settings.ML_CONFIDENCE_THRESHOLD
    holder = get_model_holder()

    # Extract 32-feature vector strictly aligned with feature schema
    feature_vec = extract_feature_vector(raw_features)
    X = feature_vec.reshape(1, -1)

    if holder.model is not None and hasattr(holder.model, "predict_proba"):
        probs_raw = holder.model.predict_proba(X)[0]
    else:
        # Fallback if model binary is temporarily missing (e.g. before initial training run)
        # Uniform distribution with slight unknown bias
        probs_raw = np.full(len(CANONICAL_CLASSES), 1.0 / len(CANONICAL_CLASSES))

    probabilities: Dict[str, float] = {}
    for idx, cls_name in enumerate(CANONICAL_CLASSES):
        probabilities[cls_name] = float(probs_raw[idx]) if idx < len(probs_raw) else 0.0

    max_prob = max(probabilities.values())
    top_class = max(probabilities, key=probabilities.get)

    # Phase 17: Apply Unknown Confidence Threshold
    if max_prob < threshold:
        predicted_class = "unknown"
        predicted_prob = max_prob
    else:
        predicted_class = top_class
        predicted_prob = max_prob

    predicted_label = CLASS_DISPLAY_NAMES.get(
        predicted_class, predicted_class.replace("_", " ").title()
    )
    confidence_pct = int(round(predicted_prob * 100))

    severity = derive_severity_from_prediction(
        predicted_class, predicted_prob, raw_features, exposure_count
    )
    suggested_action = format_suggested_action(predicted_class, severity)
    reasoning_steps = build_ml_reasoning_steps(
        predicted_class,
        predicted_prob,
        probabilities,
        raw_features,
        severity,
        holder.model_version,
    )

    return LightGBMPrediction(
        predicted_class=predicted_class,
        predicted_label=predicted_label,
        predicted_probability=predicted_prob,
        probabilities=probabilities,
        confidence_pct=confidence_pct,
        severity=severity,
        model_version=holder.model_version,
        model_kind="lightgbm_multiclass",
        reasoning_steps=reasoning_steps,
        suggested_action=suggested_action,
        feature_vector=feature_vec.tolist(),
        data_quality=1.0,
    )
