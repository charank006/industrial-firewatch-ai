"""Dataset construction and leakage-controlled split utilities (Architecture Phase 10 & 11).

Supports:
- Event-aware split (GroupKFold by event_id)
- Spatial holdout (Geographic bounding box / Longitude split)
- Temporal holdout (Time cutoff split)
- Random split (for baseline comparison)
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold, train_test_split

from ml.feature_schema import (
    CANONICAL_CLASSES,
    CLASS_TO_INDEX,
    FEATURE_NAMES,
    extract_feature_vector,
)

logger = logging.getLogger(__name__)

import json
from shapely.geometry import Point, shape
from shapely.prepared import prep

# Strict India Geofencing Bounding Coordinates
INDIA_MIN_LAT = 6.5
INDIA_MAX_LAT = 37.5
INDIA_MIN_LON = 68.0
INDIA_MAX_LON = 97.5

_INDIA_STATES_PATH = Path(__file__).resolve().parents[2] / "data" / "india_states.geojson"
_PREPARED_STATES_GEOMS = None

def _get_prepared_states_geoms():
    global _PREPARED_STATES_GEOMS
    if _PREPARED_STATES_GEOMS is None:
        if _INDIA_STATES_PATH.exists():
            try:
                with open(_INDIA_STATES_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                geoms = []
                for feat in data.get("features", []):
                    g = shape(feat["geometry"])
                    geoms.append((g, prep(g)))
                _PREPARED_STATES_GEOMS = geoms
                logger.info("Loaded %d Indian state boundary polygons from %s", len(geoms), _INDIA_STATES_PATH)
            except Exception as e:
                logger.warning("Could not load India states GeoJSON: %s", e)
    return _PREPARED_STATES_GEOMS


def is_inside_india(lat: float, lon: float) -> bool:
    """Verify whether a geographic coordinate pair lies strictly within the sovereign borders of India.
    Excludes Sri Lanka, Tibet/China, Pakistan, Nepal, Bhutan, Myanmar, and non-territorial ocean waters.
    """
    if not (INDIA_MIN_LAT <= lat <= INDIA_MAX_LAT and INDIA_MIN_LON <= lon <= INDIA_MAX_LON):
        return False

    states = _get_prepared_states_geoms()
    if states:
        pt = Point(lon, lat)
        for raw_g, prep_g in states:
            if prep_g.contains(pt) or raw_g.distance(pt) < 0.001:
                return True
        return False

    return True



def filter_india_coordinates(
    df: pd.DataFrame, lat_col: str = "latitude", lon_col: str = "longitude"
) -> Tuple[pd.DataFrame, int]:
    """Filter a dataframe strictly to coordinates within sovereign India borders.
    Returns (filtered_df, dropped_count).
    """
    total_before = len(df)
    valid_mask = df.apply(
        lambda r: is_inside_india(float(r[lat_col]), float(r[lon_col])),
        axis=1,
    )
    filtered_df = df[valid_mask].copy().reset_index(drop=True)
    dropped = total_before - len(filtered_df)
    if dropped > 0:
        logger.info(
            "India Geofencing Filter: Excluded %d out-of-bounds/foreign records; retained %d valid Indian records.",
            dropped,
            len(filtered_df),
        )
    return filtered_df, dropped


@dataclass
class DatasetSplits:
    X_train: np.ndarray
    y_train: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    split_type: str
    train_indices: np.ndarray
    test_indices: np.ndarray
    metadata: Dict[str, Any]


def generate_benchmark_dataset(
    n_samples: int = 1500, random_seed: int = 42
) -> Tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Generate a calibrated, non-persistent thermal event dataset strictly inside India
    for training and evaluating the GeoFlare ML source classifier.

    Each archetype is modeled from genuine physical and spatial properties
    (FRP ranges, I4/I5 contrast, land cover fractions, infrastructure proximity).
    """
    rng = np.random.RandomState(random_seed)
    rows: List[Dict[str, Any]] = []
    labels: List[int] = []
    event_ids: List[str] = []

    # Distribution across non-persistent classes:
    # 0: forest_fire (25%), 1: agricultural_burning (30%), 2: industrial_fire (20%),
    # 3: gas_oil_flare (10%), 4: urban_other (10%), 5: unknown (5%)
    class_probs = [0.25, 0.30, 0.20, 0.10, 0.10, 0.05]
    chosen_classes = rng.choice(len(CANONICAL_CLASSES), size=n_samples, p=class_probs)

    base_time = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)

    for i in range(n_samples):
        cls_idx = chosen_classes[i]
        cls_name = CANONICAL_CLASSES[cls_idx]
        event_id = f"FE-TRAIN-{i // 3:05d}"  # 3 observations per event on average
        event_ids.append(event_id)

        # Coordinate distribution strictly across India's regional thermal archetypes
        if cls_name == "forest_fire":
            # Central India / MP / Odisha / Western Ghats forests
            if rng.rand() < 0.6:
                lat = rng.uniform(21.0, 24.5)  # Madhya Pradesh / Chhattisgarh forests
                lon = rng.uniform(77.0, 83.5)
            else:
                lat = rng.uniform(11.5, 17.0)  # Western Ghats / Karnataka / Kerala
                lon = rng.uniform(74.5, 76.5)
        elif cls_name == "agricultural_burning":
            # Northern Stubble Belt (Punjab, Haryana, UP) + Telangana Agri Plains
            if rng.rand() < 0.7:
                lat = rng.uniform(29.0, 31.8)  # Punjab / Haryana stubble
                lon = rng.uniform(74.2, 77.8)
            else:
                lat = rng.uniform(16.5, 19.5)  # Telangana / Andhra agricultural zone
                lon = rng.uniform(78.0, 81.0)
        elif cls_name == "industrial_fire":
            # Gujarat Industrial Corridor (Surat, Dahej, Hazira, Ankleshwar) & Hyderabad / Mumbai-Pune
            if rng.rand() < 0.6:
                lat = rng.uniform(21.0, 22.8)  # Gujarat Industrial Corridor
                lon = rng.uniform(72.5, 73.8)
            else:
                lat = rng.uniform(17.2, 19.5)  # Telangana & Maharashtra Industrial Hubs
                lon = rng.uniform(73.5, 79.5)
        elif cls_name == "gas_oil_flare":
            # Dahej / Hazira petrochemical terminals & KG Basin & Assam oilfields
            if rng.rand() < 0.6:
                lat = rng.uniform(21.4, 22.2)  # Dahej / Hazira Petrochem Hub
                lon = rng.uniform(72.5, 73.2)
            else:
                lat = rng.uniform(16.2, 17.5)  # Krishna-Godavari Basin Offshore/Coastal
                lon = rng.uniform(81.5, 82.8)
        elif cls_name == "urban_other":
            # Major Indian Metros (Delhi NCR, Mumbai, Hyderabad, Bengaluru, Ahmedabad)
            metros = [
                (28.61, 77.20),  # Delhi NCR
                (19.07, 72.87),  # Mumbai
                (17.38, 78.48),  # Hyderabad
                (12.97, 77.59),  # Bengaluru
                (23.02, 72.57),  # Ahmedabad
            ]
            m_lat, m_lon = metros[rng.choice(len(metros))]
            lat = m_lat + rng.uniform(-0.3, 0.3)
            lon = m_lon + rng.uniform(-0.3, 0.3)
        else:  # unknown
            lat = rng.uniform(12.0, 28.0)
            lon = rng.uniform(72.0, 85.0)

        # Enforce strict India bounding box
        lat = float(np.clip(lat, INDIA_MIN_LAT, INDIA_MAX_LAT))
        lon = float(np.clip(lon, INDIA_MIN_LON, INDIA_MAX_LON))

        day_offset = rng.uniform(0, 180)
        detected_at = base_time + datetime.timedelta(days=day_offset, hours=rng.uniform(0, 23))

        raw_feat: Dict[str, Any] = {
            "latitude": lat,
            "longitude": lon,
            "last_detected": detected_at,
            "hour_of_day": detected_at.hour,
            "month": detected_at.month,
            "day_night": "N" if rng.rand() < 0.4 else "D",
            "detection_count": rng.randint(1, 8),
            "duration_hours": rng.exponential(12.0),
        }

        # Class-specific characteristic distributions
        if cls_name == "forest_fire":
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=4.0, scale=15.0),  # mean ~60 MW
                "brightness_k": rng.uniform(320.0, 390.0),
                "bright_ti4": rng.uniform(330.0, 410.0),
                "bright_ti5": rng.uniform(285.0, 310.0),
                "forest_fraction": rng.uniform(0.40, 0.95),
                "industrial_fraction": rng.uniform(0.0, 0.08),
                "farmland_fraction": rng.uniform(0.0, 0.20),
                "residential_fraction": rng.uniform(0.0, 0.05),
                "factories_within_1km": 0,
                "gas_facilities_within_1km": 0,
                "nearest_factory_m": rng.uniform(2500.0, 15000.0),
                "inside_industrial": False,
                "temperature_c": rng.uniform(28.0, 42.0),
                "temperature_anomaly_c": rng.uniform(1.0, 6.0),
                "humidity_pct": rng.uniform(15.0, 40.0),
                "wind_speed_ms": rng.uniform(3.0, 14.0),
                "vpd_anomaly_kpa": rng.uniform(0.5, 3.5),
            })
        elif cls_name == "agricultural_burning":
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=2.0, scale=4.0),  # mean ~8 MW
                "brightness_k": rng.uniform(310.0, 350.0),
                "bright_ti4": rng.uniform(320.0, 360.0),
                "bright_ti5": rng.uniform(290.0, 315.0),
                "forest_fraction": rng.uniform(0.0, 0.15),
                "industrial_fraction": rng.uniform(0.0, 0.05),
                "farmland_fraction": rng.uniform(0.50, 0.98),
                "residential_fraction": rng.uniform(0.0, 0.15),
                "factories_within_1km": 0,
                "gas_facilities_within_1km": 0,
                "nearest_factory_m": rng.uniform(3000.0, 20000.0),
                "inside_industrial": False,
                "temperature_c": rng.uniform(24.0, 38.0),
                "temperature_anomaly_c": rng.uniform(-1.0, 3.0),
                "humidity_pct": rng.uniform(25.0, 60.0),
                "wind_speed_ms": rng.uniform(1.5, 7.0),
                "vpd_anomaly_kpa": rng.uniform(-0.5, 1.5),
            })
        elif cls_name == "industrial_fire":
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=5.0, scale=20.0),  # mean ~100 MW
                "brightness_k": rng.uniform(330.0, 420.0),
                "bright_ti4": rng.uniform(345.0, 440.0),
                "bright_ti5": rng.uniform(290.0, 320.0),
                "forest_fraction": rng.uniform(0.0, 0.05),
                "industrial_fraction": rng.uniform(0.35, 0.90),
                "farmland_fraction": rng.uniform(0.0, 0.10),
                "residential_fraction": rng.uniform(0.05, 0.30),
                "factories_within_1km": rng.randint(2, 18),
                "gas_facilities_within_1km": rng.randint(0, 3),
                "nearest_factory_m": rng.uniform(0.0, 400.0),
                "inside_industrial": rng.rand() < 0.75,
                "temperature_c": rng.uniform(26.0, 40.0),
                "temperature_anomaly_c": rng.uniform(0.0, 4.0),
                "humidity_pct": rng.uniform(30.0, 70.0),
                "wind_speed_ms": rng.uniform(2.0, 10.0),
                "vpd_anomaly_kpa": rng.uniform(0.0, 2.0),
            })
        elif cls_name == "gas_oil_flare":
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=3.5, scale=12.0),  # mean ~42 MW
                "brightness_k": rng.uniform(340.0, 430.0),
                "bright_ti4": rng.uniform(350.0, 450.0),
                "bright_ti5": rng.uniform(288.0, 315.0),
                "forest_fraction": rng.uniform(0.0, 0.05),
                "industrial_fraction": rng.uniform(0.30, 0.85),
                "farmland_fraction": rng.uniform(0.0, 0.05),
                "residential_fraction": rng.uniform(0.0, 0.15),
                "factories_within_1km": rng.randint(1, 10),
                "gas_facilities_within_1km": rng.randint(1, 8),
                "nearest_factory_m": rng.uniform(0.0, 500.0),
                "nearest_gas_facility_m": rng.uniform(0.0, 300.0),
                "inside_industrial": rng.rand() < 0.6,
                "temperature_c": rng.uniform(25.0, 38.0),
                "temperature_anomaly_c": rng.uniform(0.0, 2.5),
                "humidity_pct": rng.uniform(35.0, 75.0),
                "wind_speed_ms": rng.uniform(2.0, 9.0),
                "vpd_anomaly_kpa": rng.uniform(0.0, 1.5),
            })
        elif cls_name == "urban_other":
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=2.5, scale=8.0),  # mean ~20 MW
                "brightness_k": rng.uniform(315.0, 365.0),
                "bright_ti4": rng.uniform(325.0, 375.0),
                "bright_ti5": rng.uniform(292.0, 318.0),
                "forest_fraction": rng.uniform(0.0, 0.10),
                "industrial_fraction": rng.uniform(0.0, 0.15),
                "farmland_fraction": rng.uniform(0.0, 0.15),
                "residential_fraction": rng.uniform(0.50, 0.95),
                "building_count": rng.randint(30, 250),
                "factories_within_1km": rng.randint(0, 1),
                "gas_facilities_within_1km": 0,
                "nearest_factory_m": rng.uniform(1500.0, 8000.0),
                "inside_industrial": False,
                "temperature_c": rng.uniform(25.0, 36.0),
                "temperature_anomaly_c": rng.uniform(0.0, 3.0),
                "humidity_pct": rng.uniform(30.0, 65.0),
                "wind_speed_ms": rng.uniform(1.0, 6.0),
                "vpd_anomaly_kpa": rng.uniform(-0.2, 1.5),
            })
        else:  # unknown
            raw_feat.update({
                "frp_latest_mw": rng.gamma(shape=1.5, scale=6.0),
                "brightness_k": rng.uniform(305.0, 340.0),
                "bright_ti4": rng.uniform(310.0, 345.0),
                "bright_ti5": rng.uniform(295.0, 315.0),
                "forest_fraction": rng.uniform(0.05, 0.25),
                "industrial_fraction": rng.uniform(0.05, 0.20),
                "farmland_fraction": rng.uniform(0.05, 0.25),
                "residential_fraction": rng.uniform(0.05, 0.20),
                "factories_within_1km": rng.randint(0, 2),
                "gas_facilities_within_1km": 0,
                "nearest_factory_m": rng.uniform(1000.0, 5000.0),
                "inside_industrial": False,
                "temperature_c": rng.uniform(22.0, 35.0),
                "temperature_anomaly_c": rng.uniform(-2.0, 2.0),
                "humidity_pct": rng.uniform(40.0, 80.0),
                "wind_speed_ms": rng.uniform(1.0, 8.0),
                "vpd_anomaly_kpa": rng.uniform(-1.0, 1.0),
            })

        raw_feat["frp_max_mw"] = raw_feat["frp_latest_mw"] * rng.uniform(1.0, 1.4)
        raw_feat["frp_mean_mw"] = raw_feat["frp_latest_mw"] * rng.uniform(0.8, 1.1)
        raw_feat["detection_confidence_pct"] = rng.uniform(40.0, 99.0)

        vec = extract_feature_vector(raw_feat)
        rows.append(raw_feat)
        labels.append(cls_idx)

    X = np.array([extract_feature_vector(r) for r in rows], dtype=np.float32)
    y = np.array(labels, dtype=np.int64)
    df = pd.DataFrame(rows)
    df["event_id"] = event_ids
    df["label"] = [CANONICAL_CLASSES[i] for i in y]

    return df, X, y


def load_and_prepare_dataset(
    csv_path: Union[str, Path], india_only: bool = True
) -> Tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Load a custom or real dataset from CSV, strictly enforce India geofencing,
    extract canonical 32 features, and encode multiclass target labels.
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset CSV not found at: {path}")

    logger.info("Loading dataset from %s...", path)
    df_raw = pd.read_csv(path)

    # Standardize column names (lowercase)
    col_map = {c: c.lower().strip() for c in df_raw.columns}
    df_raw = df_raw.rename(columns=col_map)

    # Check for coordinates
    lat_col = "latitude" if "latitude" in df_raw.columns else ("lat" if "lat" in df_raw.columns else None)
    lon_col = "longitude" if "longitude" in df_raw.columns else ("lon" if "lon" in df_raw.columns else ("lng" if "lng" in df_raw.columns else None))

    if not lat_col or not lon_col:
        raise ValueError(f"Dataset in {path} must contain latitude and longitude columns.")

    if lat_col != "latitude":
        df_raw["latitude"] = df_raw[lat_col]
    if lon_col != "longitude":
        df_raw["longitude"] = df_raw[lon_col]

    df_raw["latitude"] = pd.to_numeric(df_raw["latitude"], errors="coerce")
    df_raw["longitude"] = pd.to_numeric(df_raw["longitude"], errors="coerce")
    df_raw = df_raw.dropna(subset=["latitude", "longitude"]).reset_index(drop=True)

    if india_only:
        df_raw, dropped = filter_india_coordinates(df_raw, "latitude", "longitude")
        if len(df_raw) == 0:
            raise ValueError(
                f"No records remain in {path} after applying strict India geofencing "
                f"([Lat {INDIA_MIN_LAT}-{INDIA_MAX_LAT}, Lon {INDIA_MIN_LON}-{INDIA_MAX_LON}])."
            )
        logger.info(
            "India Geofencing: %d valid Indian records retained (%d out-of-bounds records excluded).",
            len(df_raw),
            dropped,
        )

    # Check or generate event_id for GroupKFold event-aware splitting
    if "event_id" not in df_raw.columns:
        # Synthesize event_id groups by row blocks
        df_raw["event_id"] = [f"FE-INGEST-{i // 3:05d}" for i in range(len(df_raw))]

    # Check or map target labels
    label_col = None
    for candidate in ["label", "target", "class", "fire_type", "type"]:
        if candidate in df_raw.columns:
            label_col = candidate
            break

    y_list: List[int] = []
    if label_col:
        for val in df_raw[label_col]:
            val_str = str(val).lower().strip()
            if val_str in CLASS_TO_INDEX:
                y_list.append(CLASS_TO_INDEX[val_str])
            elif val_str.isdigit() and int(val_str) < len(CANONICAL_CLASSES):
                y_list.append(int(val_str))
            elif "forest" in val_str or "vegetation" in val_str or "wildland" in val_str:
                y_list.append(CLASS_TO_INDEX["forest_fire"])
            elif "agri" in val_str or "crop" in val_str or "stubble" in val_str:
                y_list.append(CLASS_TO_INDEX["agricultural_burning"])
            elif "flare" in val_str or "gas" in val_str or "oil" in val_str:
                y_list.append(CLASS_TO_INDEX["gas_oil_flare"])
            elif "indus" in val_str or "factory" in val_str or "refinery" in val_str:
                y_list.append(CLASS_TO_INDEX["industrial_fire"])
            elif "urban" in val_str or "building" in val_str or "city" in val_str:
                y_list.append(CLASS_TO_INDEX["urban_other"])
            else:
                y_list.append(CLASS_TO_INDEX["unknown"])
    else:
        # If dataset has no labels (e.g. raw FIRMS), assign default unknown
        logger.warning("No label column found in %s; defaulting targets to 'unknown'.", path)
        y_list = [CLASS_TO_INDEX["unknown"]] * len(df_raw)

    y = np.array(y_list, dtype=np.int64)
    df_raw["label"] = [CANONICAL_CLASSES[i] for i in y]

    # Extract 32 canonical features
    feature_vectors = [extract_feature_vector(row.to_dict()) for _, row in df_raw.iterrows()]
    X = np.array(feature_vectors, dtype=np.float32)

    return df_raw, X, y


def create_leakage_controlled_splits(
    df: pd.DataFrame, X: np.ndarray, y: np.ndarray, split_method: str = "event_aware"
) -> DatasetSplits:
    """Create train/test splits with explicit leakage prevention controls.

    Supported split_method options:
    - 'random': Standard random train/test split.
    - 'event_aware': Groups by event_id so no event's observations appear in both train and test.
    - 'spatial_holdout': Splits by longitude threshold (Western training, Eastern testing).
    - 'temporal_holdout': Splits chronologically by acquisition date.
    """
    n_samples = len(df)
    indices = np.arange(n_samples)

    if split_method == "random":
        train_idx, test_idx = train_test_split(indices, test_size=0.20, random_state=42, stratify=y)
        meta = {"method": "random", "test_ratio": 0.20}

    elif split_method == "event_aware":
        # GroupKFold ensures no event_id is shared across train and test sets
        gkf = GroupKFold(n_splits=5)
        groups = df["event_id"].values
        train_idx, test_idx = next(gkf.split(X, y, groups=groups))
        meta = {
            "method": "event_aware_group_kfold",
            "unique_events_total": len(np.unique(groups)),
            "unique_events_train": len(np.unique(groups[train_idx])),
            "unique_events_test": len(np.unique(groups[test_idx])),
        }

    elif split_method == "spatial_holdout":
        # Spatial holdout: split geographically by longitude median
        median_lon = df["longitude"].median()
        train_idx = indices[df["longitude"].values < median_lon]
        test_idx = indices[df["longitude"].values >= median_lon]
        meta = {
            "method": "spatial_holdout_longitude_split",
            "longitude_threshold": float(median_lon),
            "train_spatial_bbox": f"lon < {median_lon:.3f}",
            "test_spatial_bbox": f"lon >= {median_lon:.3f}",
        }

    elif split_method == "temporal_holdout":
        # Temporal holdout: chronological 80% train, 20% test
        if "last_detected" in df.columns:
            df_sorted = df.sort_values("last_detected")
        else:
            df_sorted = df
        sorted_indices = df_sorted.index.values
        split_point = int(n_samples * 0.80)
        train_idx = sorted_indices[:split_point]
        test_idx = sorted_indices[split_point:]
        meta = {
            "method": "temporal_holdout",
            "train_count": len(train_idx),
            "test_count": len(test_idx),
        }
    else:
        raise ValueError(f"Unknown split method: {split_method}")

    return DatasetSplits(
        X_train=X[train_idx],
        y_train=y[train_idx],
        X_test=X[test_idx],
        y_test=y[test_idx],
        split_type=split_method,
        train_indices=train_idx,
        test_indices=test_idx,
        metadata=meta,
    )
