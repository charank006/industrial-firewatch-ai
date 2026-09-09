"""Tests for India-specific Geofencing, Dataset Pipeline, Model Training & Map Sync (GeoFlare AI)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ml.dataset_builder import (
    INDIA_MAX_LAT,
    INDIA_MAX_LON,
    INDIA_MIN_LAT,
    INDIA_MIN_LON,
    create_leakage_controlled_splits,
    filter_india_coordinates,
    generate_benchmark_dataset,
    is_inside_india,
    load_and_prepare_dataset,
)
from ml.feature_schema import CANONICAL_CLASSES, FEATURE_NAMES
from ml.train import run_training_pipeline
from app.services.ingestion.firms_csv_loader import parse_csv_row


def test_is_inside_india_coordinates():
    """Verify coordinate geofencing against Indian geographical envelope."""
    # Valid Indian locations
    assert is_inside_india(21.1702, 72.8311)  # Surat, Gujarat
    assert is_inside_india(17.3850, 78.4867)  # Hyderabad, Telangana
    assert is_inside_india(30.9010, 75.8573)  # Ludhiana, Punjab
    assert is_inside_india(23.2599, 77.4126)  # Bhopal, MP
    assert is_inside_india(12.9716, 77.5946)  # Bengaluru, Karnataka
    assert is_inside_india(28.6139, 77.2090)  # Delhi NCR
    assert is_inside_india(8.5241, 76.9366)   # Thiruvananthapuram, Kerala

    # Out-of-bounds international / sea coordinates
    assert not is_inside_india(51.5074, -0.1278)   # London, UK
    assert not is_inside_india(31.8457, -102.3676) # Permian Basin, Texas
    assert not is_inside_india(-33.8688, 151.2093) # Sydney, Australia
    assert not is_inside_india(0.0, 0.0)           # Null Island (Gulf of Guinea)
    assert not is_inside_india(45.0, 75.0)         # Kazakhstan (North of India)
    assert not is_inside_india(20.0, 60.0)         # Arabian Sea / Oman (West of India)
    assert not is_inside_india(20.0, 105.0)        # Vietnam (East of India)


def test_filter_india_coordinates_dataframe():
    """Verify dataframe filtering drops out-of-bounds coordinates."""
    data = {
        "latitude": [21.17, 51.50, 17.38, 31.84, 28.61],
        "longitude": [72.83, -0.12, 78.48, -102.36, 77.20],
        "label": ["industrial_fire", "forest_fire", "gas_oil_flare", "urban_other", "agricultural_burning"],
    }
    df = pd.DataFrame(data)
    filtered_df, dropped = filter_india_coordinates(df)

    assert dropped == 2
    assert len(filtered_df) == 3
    for _, row in filtered_df.iterrows():
        assert is_inside_india(row["latitude"], row["longitude"])


def test_generate_benchmark_dataset_strictly_inside_india():
    """Verify that all generated benchmark samples are strictly inside India."""
    df, X, y = generate_benchmark_dataset(n_samples=500, random_seed=42)

    assert len(df) == 500
    assert X.shape == (500, 32)
    assert len(y) == 500

    assert df["latitude"].min() >= INDIA_MIN_LAT
    assert df["latitude"].max() <= INDIA_MAX_LAT
    assert df["longitude"].min() >= INDIA_MIN_LON
    assert df["longitude"].max() <= INDIA_MAX_LON

    for _, row in df.iterrows():
        assert is_inside_india(row["latitude"], row["longitude"])


def test_load_and_prepare_custom_csv_dataset(tmp_path: Path):
    """Verify loading custom CSV file with India geofencing and feature extraction."""
    csv_path = tmp_path / "custom_india_data.csv"
    sample_df = pd.DataFrame({
        "latitude": [21.17, 17.38, 30.90, 51.50],  # 3 inside India, 1 London
        "longitude": [72.83, 78.48, 75.85, -0.12],
        "frp": [120.0, 45.0, 15.0, 80.0],
        "brightness": [380.0, 340.0, 320.0, 360.0],
        "type": ["industrial_fire", "gas_oil_flare", "agricultural_burning", "forest_fire"],
    })
    sample_df.to_csv(csv_path, index=False)

    df_loaded, X, y = load_and_prepare_dataset(csv_path, india_only=True)

    # London record should be dropped
    assert len(df_loaded) == 3
    assert X.shape == (3, 32)
    assert len(y) == 3
    assert y[0] == 2  # industrial_fire
    assert y[1] == 3  # gas_oil_flare
    assert y[2] == 1  # agricultural_burning


def test_train_pipeline_execution_and_artifact_generation(tmp_path: Path):
    """Verify end-to-end model training on Indian data and artifact serialization."""
    models_dir = tmp_path / "models"
    data_dir = tmp_path / "data"

    metadata = run_training_pipeline(
        output_dir=models_dir,
        data_output_dir=data_dir,
        n_samples=300,
        random_seed=42,
        india_only=True,
    )

    assert metadata["india_geofencing_enforced"] is True
    assert (models_dir / "geoflare_lightgbm.joblib").exists()
    assert (models_dir / "geoflare_lightgbm.txt").exists()
    assert (models_dir / "feature_schema.json").exists()
    assert (models_dir / "class_mapping.json").exists()
    assert (models_dir / "model_metadata.json").exists()
    assert (models_dir / "metrics.json").exists()


def test_firms_csv_row_parser_india_geofencing():
    """Verify parse_csv_row accurately flags out-of-bounds rows."""
    valid_indian_row = {
        "latitude": "21.1702",
        "longitude": "72.8311",
        "acq_date": "2026-03-15",
        "acq_time": "0830",
        "frp": "142.5",
        "bright_ti4": "365.4",
        "bright_ti5": "298.2",
        "confidence": "90",
        "daynight": "D",
    }
    det, is_oob = parse_csv_row(valid_indian_row, 0, india_only=True)
    assert det is not None
    assert is_oob is False
    assert det.latitude == 21.1702
    assert det.longitude == 72.8311

    out_of_bounds_row = {
        "latitude": "51.5074",
        "longitude": "-0.1278",
        "acq_date": "2026-03-15",
        "acq_time": "0830",
        "frp": "142.5",
        "confidence": "90",
    }
    det, is_oob = parse_csv_row(out_of_bounds_row, 1, india_only=True)
    assert det is None
    assert is_oob is True
