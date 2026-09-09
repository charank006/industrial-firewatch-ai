"""Comprehensive End-to-End Test Suite for GeoFlare AI Pipeline.

Tests:
1. Feature schema integrity (32 canonical features, ordering, defaults, bounds).
2. 7-Day Persistence Pre-Filter:
   - Event with >= 5 active days in 7-day window within 500m -> Persistent Thermal Source, LightGBM skipped.
   - Event with 1 active day in 7-day window within 500m -> Non-persistent, LightGBM executed.
3. LightGBM multiclass inference:
   - 6 canonical class probabilities emitted.
   - High confidence top class selection.
   - Unknown fallback threshold (< ML_CONFIDENCE_THRESHOLD).
4. REST API Endpoints:
   - POST /api/predict (persistent vs non-persistent routing).
   - GET /api/ml/metrics (model comparison benchmarks).
   - GET /api/ml/schema (32-feature canonical schema).
"""

import datetime
from unittest.mock import MagicMock, patch
import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.models.models import FireDetection, FireEvent, FirePrediction
from app.services.classifier.lightgbm_service import (
    LightGBMPrediction,
    get_model_holder,
    predict_thermal_source,
)
from app.services.persistence.persistence_service import (
    PersistenceEvaluation,
    evaluate_persistence,
)
from ml.feature_schema import (
    CANONICAL_CLASSES,
    FEATURE_NAMES,
    extract_feature_vector,
)


def test_canonical_feature_schema_count_and_order():
    """Verify feature schema contains exactly 32 features in canonical order."""
    assert len(FEATURE_NAMES) == 32
    assert FEATURE_NAMES[0] == "frp_latest_mw"
    assert FEATURE_NAMES[1] == "frp_max_mw"
    assert FEATURE_NAMES[2] == "frp_mean_mw"
    assert FEATURE_NAMES[3] == "brightness_k"
    assert FEATURE_NAMES[4] == "detection_confidence_pct"
    assert FEATURE_NAMES[10] == "detection_count"
    assert "industrial_fraction" in FEATURE_NAMES
    assert "forest_fraction" in FEATURE_NAMES
    assert "farmland_fraction" in FEATURE_NAMES
    assert "factories_within_1km" in FEATURE_NAMES


def test_feature_vector_extraction_defaults_and_bounds():
    """Verify feature extractor handles empty input gracefully with safe defaults."""
    vec = extract_feature_vector({})
    assert isinstance(vec, np.ndarray)
    assert vec.shape == (32,)
    assert vec.dtype == np.float32

    # Verify specific feature defaults
    # detection_count default is 1.0
    assert vec[FEATURE_NAMES.index("detection_count")] == 1.0
    # nearest distances default to 5000.0m
    assert vec[FEATURE_NAMES.index("nearest_factory_m")] == 5000.0
    assert vec[FEATURE_NAMES.index("nearest_gas_facility_m")] == 5000.0


def test_feature_vector_extraction_with_rich_payload():
    """Verify feature extractor correctly maps supplied dictionary values."""
    payload = {
        "frp_latest_mw": 85.5,
        "frp_max_mw": 120.0,
        "frp_mean_mw": 95.0,
        "brightness_k": 345.0,
        "detection_count": 4,
        "industrial_fraction": 0.65,
        "forest_fraction": 0.05,
        "factories_within_1km": 3,
        "temperature_c": 32.5,
        "humidity_pct": 45.0,
        "wind_speed_ms": 5.2,
    }
    vec = extract_feature_vector(payload)
    assert vec[FEATURE_NAMES.index("frp_latest_mw")] == 85.5
    assert vec[FEATURE_NAMES.index("factories_within_1km")] == 3.0
    assert vec[FEATURE_NAMES.index("industrial_fraction")] == 0.65


@pytest.mark.asyncio
async def test_persistence_prefilter_mock_gte_5_days():
    """Unit TEST: Evaluate persistence with 6 distinct days -> Persistent Thermal Source."""
    mock_db = MagicMock()
    # Mock result with 6 distinct dates
    mock_result = MagicMock()
    mock_result.all.return_value = [
        ("2026-09-03",),
        ("2026-09-04",),
        ("2026-09-05",),
        ("2026-09-06",),
        ("2026-09-07",),
        ("2026-09-08",),
    ]

    async def async_execute(*args, **kwargs):
        return mock_result

    mock_db.execute = async_execute

    event = FireEvent(
        id="EVT_PERSISTENT_001",
        latitude=17.4000,
        longitude=78.5000,
        last_detected=datetime.datetime.now(datetime.timezone.utc),
        frp_latest_mw=45.0,
        detection_count=10,
    )

    eval_result = await evaluate_persistence(mock_db, event)
    assert eval_result.is_persistent is True
    assert eval_result.active_days == 6
    assert eval_result.status_label == "persistent_thermal_source"
    assert event.is_persistent is True
    assert event.active_days_7d == 6


@pytest.mark.asyncio
async def test_persistence_prefilter_mock_lt_5_days():
    """Unit TEST: Evaluate persistence with 2 distinct days -> Non-persistent source."""
    mock_db = MagicMock()
    mock_result = MagicMock()
    mock_result.all.return_value = [
        ("2026-09-07",),
        ("2026-09-08",),
    ]

    async def async_execute(*args, **kwargs):
        return mock_result

    mock_db.execute = async_execute

    event = FireEvent(
        id="EVT_EPISODIC_001",
        latitude=17.5000,
        longitude=78.6000,
        last_detected=datetime.datetime.now(datetime.timezone.utc),
        frp_latest_mw=110.0,
        detection_count=2,
    )

    eval_result = await evaluate_persistence(mock_db, event)
    assert eval_result.is_persistent is False
    assert eval_result.active_days == 2
    assert eval_result.status_label == "episodic"
    assert event.is_persistent is False
    assert event.active_days_7d == 2


@pytest.mark.asyncio
async def test_persistence_prefilter_persistent_source(db):
    """TEST 1 (Integration): Event with >= 5/7 active days -> Persistent Thermal Source (LightGBM skipped)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    event = FireEvent(
        id="EVT_PERSISTENT_001",
        latitude=17.4000,
        longitude=78.5000,
        first_detected=now - datetime.timedelta(days=6),
        last_detected=now,
        frp_latest_mw=45.0,
        frp_max_mw=60.0,
        frp_mean_mw=50.0,
        status="active",
        detection_count=10,
    )
    db.add(event)
    await db.flush()

    # Create detections across 6 distinct calendar days within 200m (radius < 500m)
    for day_offset in range(6):
        det_time = now - datetime.timedelta(days=day_offset, hours=2)
        det = FireDetection(
            fire_event_id=event.id,
            latitude=17.4005,
            longitude=78.5005,
            acquisition_time=det_time,
            frp_mw=45.0,
            brightness_k=335.0,
            satellite="N",
            instrument="VIIRS",
            source="VIIRS_SNPP_NRT",
            day_night="N",
        )
        db.add(det)
    await db.flush()

    eval_result = await evaluate_persistence(db, event)
    assert eval_result.is_persistent is True
    assert eval_result.active_days >= 5
    assert eval_result.classification == "persistent_thermal_source"
    assert event.is_persistent is True


@pytest.mark.asyncio
async def test_persistence_prefilter_non_persistent_source(db):
    """TEST 2 (Integration): Event with 1/7 active days -> Non-persistent (LightGBM required)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    event = FireEvent(
        id="EVT_EPISODIC_001",
        latitude=17.5000,
        longitude=78.6000,
        first_detected=now,
        last_detected=now,
        frp_latest_mw=110.0,
        frp_max_mw=110.0,
        frp_mean_mw=110.0,
        status="active",
        detection_count=1,
    )
    db.add(event)
    await db.flush()

    det = FireDetection(
        fire_event_id=event.id,
        latitude=17.5000,
        longitude=78.6000,
        acquisition_time=now,
        frp_mw=110.0,
        brightness_k=350.0,
        satellite="N",
        instrument="VIIRS",
        source="VIIRS_SNPP_NRT",
        day_night="D",
    )
    db.add(det)
    await db.flush()

    eval_result = await evaluate_persistence(db, event)
    assert eval_result.is_persistent is False
    assert eval_result.active_days == 1
    assert eval_result.classification == "episodic_fire"
    assert event.is_persistent is False


def test_lightgbm_predict_thermal_source_probabilities():
    """TEST 3: Non-persistent source classification returns 6 canonical probabilities."""
    features = {
        "frp_latest_mw": 150.0,
        "industrial_fraction": 0.85,
        "factories_within_1km": 5,
        "nearest_factory_m": 40.0,
        "inside_industrial": 1.0,
        "temperature_c": 35.0,
        "humidity_pct": 30.0,
    }

    pred = predict_thermal_source(features)
    assert isinstance(pred, LightGBMPrediction)
    assert len(pred.probabilities) == len(CANONICAL_CLASSES)
    for cls_name in CANONICAL_CLASSES:
        assert cls_name in pred.probabilities
        assert 0.0 <= pred.probabilities[cls_name] <= 1.0

    # Probabilities should sum to approximately 1.0
    prob_sum = sum(pred.probabilities.values())
    assert 0.95 <= prob_sum <= 1.05
    assert pred.predicted_class in CANONICAL_CLASSES


def test_lightgbm_unknown_confidence_threshold_fallback():
    """TEST 4: Max probability below threshold falls back to 'unknown'."""
    features = {
        "frp_latest_mw": 10.0,
        "industrial_fraction": 0.0,
        "forest_fraction": 0.0,
        "farmland_fraction": 0.0,
    }

    # High threshold (e.g. 0.999) guarantees fallback to unknown
    pred = predict_thermal_source(features, confidence_threshold=0.999)
    assert pred.predicted_class == "unknown"
    assert pred.predicted_label == "Unknown Anomaly"


@pytest.mark.asyncio
async def test_api_predict_persistent_source_skips_lightgbm():
    """TEST 5: POST /api/predict with persistent source returns persistence result without LightGBM."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "latitude": 17.1234,
            "longitude": 78.1234,
            "frp_mw": 45.0,
            "features": {
                "active_days_7d": 6,
                "is_persistent": True,
            },
        }
        res = await client.post("/api/predict", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_persistent"] is True
        assert data["lightgbm_executed"] is False
        assert data["prediction"] == "persistent_thermal_source"
        assert data["probabilities"] is None
        assert data["severity"] == "LOW"


@pytest.mark.asyncio
async def test_api_predict_non_persistent_runs_lightgbm():
    """TEST 6: POST /api/predict with non-persistent source runs LightGBM and returns 6 probabilities."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "latitude": 17.1234,
            "longitude": 78.1234,
            "frp_mw": 85.0,
            "features": {
                "active_days_7d": 1,
                "industrial_fraction": 0.7,
                "factories_within_1km": 2,
            },
        }
        res = await client.post("/api/predict", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_persistent"] is False
        assert data["lightgbm_executed"] is True
        assert "probabilities" in data
        assert len(data["probabilities"]) >= 6
        assert data["prediction"] in CANONICAL_CLASSES


@pytest.mark.asyncio
async def test_api_ml_metrics_endpoint():
    """TEST 7: GET /api/ml/metrics returns model training metrics."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/ml/metrics")
        assert res.status_code == 200
        data = res.json()
        assert "model_version" in data or "primary_model" in data or "primary_metrics" in data


@pytest.mark.asyncio
async def test_api_ml_schema_endpoint():
    """TEST 8: GET /api/ml/schema returns 32 features and 6 canonical classes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/ml/schema")
        assert res.status_code == 200
        data = res.json()
        assert data["feature_count"] == 32
        assert len(data["features"]) == 32
        assert len(data["classes"]) == 6

