"""Canonical Feature Schema for GeoFlare AI (Architecture Phase 8 & 9).

Defines the single source of truth for feature names, ordering, datatypes,
default imputation values, and schema serialization.

TRAINING FEATURE PIPELINE == INFERENCE FEATURE PIPELINE.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

# Canonical 6 Source Classes (spec Phase 7)
CANONICAL_CLASSES: List[str] = [
    "forest_fire",
    "agricultural_burning",
    "industrial_fire",
    "gas_oil_flare",
    "urban_other",
    "unknown",
]

CLASS_TO_INDEX: Dict[str, int] = {name: idx for idx, name in enumerate(CANONICAL_CLASSES)}
INDEX_TO_CLASS: Dict[int, str] = {idx: name for idx, name in enumerate(CANONICAL_CLASSES)}

CLASS_DISPLAY_NAMES: Dict[str, str] = {
    "forest_fire": "Forest Fire",
    "agricultural_burning": "Agricultural Burning",
    "industrial_fire": "Industrial Fire",
    "gas_oil_flare": "Gas/Oil Flare",
    "urban_other": "Urban / Other",
    "unknown": "Unknown Anomaly",
}


@dataclass
class FeatureSpec:
    name: str
    dtype: str  # "float", "int", "bool"
    default_value: float
    description: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None


FEATURE_SPECS: List[FeatureSpec] = [
    # --- Thermal & Satellite Sensor Geometry ----------------------------
    FeatureSpec("frp_latest_mw", "float", 0.0, "Latest Fire Radiative Power in MW", 0.0, 10000.0),
    FeatureSpec("frp_max_mw", "float", 0.0, "Maximum Fire Radiative Power in MW", 0.0, 10000.0),
    FeatureSpec("frp_mean_mw", "float", 0.0, "Mean Fire Radiative Power in MW", 0.0, 10000.0),
    FeatureSpec("brightness_k", "float", 300.0, "Channel Brightness Temperature in Kelvin", 200.0, 500.0),
    FeatureSpec("detection_confidence_pct", "float", 50.0, "NASA Sensor Detection Confidence %", 0.0, 100.0),
    FeatureSpec("bright_ti4", "float", 300.0, "VIIRS I4 (3.9um) Brightness Temperature in K", 200.0, 500.0),
    FeatureSpec("bright_ti5", "float", 290.0, "VIIRS I5 (11um) Brightness Temperature in K", 200.0, 500.0),
    FeatureSpec("thermal_contrast_k", "float", 10.0, "I4 - I5 Thermal Contrast in Kelvin", -50.0, 150.0),
    FeatureSpec("scan", "float", 0.4, "Satellite Scan Angle / Pixel Footprint Factor", 0.1, 5.0),
    FeatureSpec("track", "float", 0.4, "Satellite Track Pixel Size", 0.1, 5.0),
    FeatureSpec("detection_count", "int", 1.0, "Total Satellite Observations in Event", 1.0, 1000.0),
    FeatureSpec("duration_hours", "float", 0.0, "Event Duration in Hours", 0.0, 720.0),
    FeatureSpec("day_night_numeric", "int", 0.0, "1 if Night pass, 0 if Day pass", 0.0, 1.0),
    FeatureSpec("hour_of_day", "int", 12.0, "Hour of Day (0-23 UTC)", 0.0, 23.0),
    FeatureSpec("month", "int", 1.0, "Month of Year (1-12)", 1.0, 12.0),
    # --- Land Cover Fractions (0.0 - 1.0) --------------------------------
    FeatureSpec("industrial_fraction", "float", 0.0, "Industrial Land Area Fraction within 1km", 0.0, 1.0),
    FeatureSpec("forest_fraction", "float", 0.0, "Forest / Woodland Area Fraction within 1km", 0.0, 1.0),
    FeatureSpec("farmland_fraction", "float", 0.0, "Cropland / Farmland Area Fraction within 1km", 0.0, 1.0),
    FeatureSpec("residential_fraction", "float", 0.0, "Residential / Urban Area Fraction within 1km", 0.0, 1.0),
    FeatureSpec("water_fraction", "float", 0.0, "Water Body Area Fraction within 1km", 0.0, 1.0),
    # --- Infrastructure Proximity & Counts -------------------------------
    FeatureSpec("factories_within_1km", "int", 0.0, "Count of Mapped Industrial Plants within 1km", 0.0, 100.0),
    FeatureSpec("gas_facilities_within_1km", "int", 0.0, "Count of Gas / Petroleum Facilities within 1km", 0.0, 50.0),
    FeatureSpec("power_infra_within_1km", "int", 0.0, "Count of Power Substations / Plants within 1km", 0.0, 50.0),
    FeatureSpec("building_count", "int", 0.0, "Count of Built Structures within 1km", 0.0, 1000.0),
    FeatureSpec("nearest_factory_m", "float", 5000.0, "Distance to Nearest Industrial Site in meters", 0.0, 50000.0),
    FeatureSpec("nearest_gas_facility_m", "float", 5000.0, "Distance to Nearest Gas/Oil Site in meters", 0.0, 50000.0),
    FeatureSpec("inside_industrial", "int", 0.0, "1 if Centroid is inside Industrial Parcel, else 0", 0.0, 1.0),
    # --- Weather & Atmospheric Anomalies ---------------------------------
    FeatureSpec("temperature_c", "float", 25.0, "Ambient Air Temperature in Celsius", -40.0, 60.0),
    FeatureSpec("temperature_anomaly_c", "float", 0.0, "Temperature Deviation from 6-Day Baseline in C", -30.0, 30.0),
    FeatureSpec("humidity_pct", "float", 50.0, "Relative Humidity %", 0.0, 100.0),
    FeatureSpec("wind_speed_ms", "float", 3.0, "Surface Wind Speed in m/s", 0.0, 50.0),
    FeatureSpec("vpd_anomaly_kpa", "float", 0.0, "Vapour Pressure Deficit Anomaly in kPa", -5.0, 10.0),
]

FEATURE_NAMES: List[str] = [spec.name for spec in FEATURE_SPECS]


def extract_feature_vector(raw: Dict[str, Any]) -> np.ndarray:
    """Transform a raw feature dictionary into a 1D NumPy array strictly
    aligned with FEATURE_NAMES and canonical defaults.
    """
    row: List[float] = []

    # Precompute derived values if not directly provided
    bright_ti4 = raw.get("bright_ti4")
    bright_ti5 = raw.get("bright_ti5")
    contrast = raw.get("thermal_contrast_k")
    if contrast is None and bright_ti4 is not None and bright_ti5 is not None:
        try:
            contrast = float(bright_ti4) - float(bright_ti5)
        except (TypeError, ValueError):
            contrast = 10.0

    day_night_raw = raw.get("day_night")
    day_night_num = 1.0 if day_night_raw == "N" else 0.0

    inside_ind = raw.get("inside_industrial")
    inside_ind_num = 1.0 if bool(inside_ind) else 0.0

    nearest_fac = raw.get("nearest_factory_m")
    if nearest_fac is None and raw.get("nearest_industrial_distance_m") is not None:
        nearest_fac = raw.get("nearest_industrial_distance_m")

    for spec in FEATURE_SPECS:
        val: Optional[Any] = None
        if spec.name == "thermal_contrast_k":
            val = contrast
        elif spec.name == "day_night_numeric":
            val = day_night_num
        elif spec.name == "inside_industrial":
            val = inside_ind_num
        elif spec.name == "nearest_factory_m":
            val = nearest_fac
        elif spec.name == "hour_of_day":
            val = raw.get("hour_of_day")
            if val is None and raw.get("last_detected"):
                try:
                    dt = raw["last_detected"]
                    val = dt.hour if hasattr(dt, "hour") else int(str(dt)[11:13])
                except Exception:
                    val = 12
        elif spec.name == "month":
            val = raw.get("month")
            if val is None and raw.get("last_detected"):
                try:
                    dt = raw["last_detected"]
                    val = dt.month if hasattr(dt, "month") else int(str(dt)[5:7])
                except Exception:
                    val = 1
        else:
            val = raw.get(spec.name)

        # Impute missing values with canonical schema default
        if val is None:
            final_val = float(spec.default_value)
        else:
            try:
                final_val = float(val)
                if np.isnan(final_val) or np.isinf(final_val):
                    final_val = float(spec.default_value)
            except (TypeError, ValueError):
                final_val = float(spec.default_value)

        # Clip bounds if specified
        if spec.min_value is not None:
            final_val = max(spec.min_value, final_val)
        if spec.max_value is not None:
            final_val = min(spec.max_value, final_val)

        row.append(final_val)

    return np.array(row, dtype=np.float32)


def export_feature_schema(output_dir: Path) -> Path:
    """Export the feature schema and class mapping JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    schema_payload = {
        "version": "geoflare_schema_v1.0",
        "feature_count": len(FEATURE_SPECS),
        "features": [asdict(spec) for spec in FEATURE_SPECS],
        "feature_names": FEATURE_NAMES,
    }

    schema_file = output_dir / "feature_schema.json"
    with open(schema_file, "w", encoding="utf-8") as f:
        json.dump(schema_payload, f, indent=2)

    mapping_payload = {
        "classes": CANONICAL_CLASSES,
        "class_to_index": CLASS_TO_INDEX,
        "index_to_class": INDEX_TO_CLASS,
        "display_names": CLASS_DISPLAY_NAMES,
    }

    mapping_file = output_dir / "class_mapping.json"
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mapping_payload, f, indent=2)

    return schema_file
