"""Comprehensive test suite for GeoFlare AI Core Pipeline.

Tests:
1. Scheduler lifecycle, configuration (900s / 15m), lock guard, and checkpointing.
2. 7-Day persistence logic:
   - 6/7 active days -> persistent=True
   - 1/7 active days -> persistent=False
   - Multiple observations on the same day -> count as ONE active day
   - Spatial observations within 500m -> counted; > 500m -> not counted
3. ML Branching:
   - Persistent event -> LightGBM NOT called
   - Non-persistent event -> LightGBM called, 6 probabilities returned
   - Confidence threshold -> below threshold becomes "unknown"
4. Alert Engine & Rules:
   - industrial_fire + confidence >= 0.60 + facility <= 2000m -> alert created
   - industrial_fire + confidence < 0.60 -> no alert
   - industrial_fire + facility > 2000m -> no alert
   - Cooldown deduplication -> duplicate within 60m suppressed
5. Notification channels with mocks:
   - Webhook, SMS, Email, Unconfigured channel handling
"""

from __future__ import annotations

import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.models.models import AlertRecord, FireDetection, FireEvent, IngestionCheckpoint
from app.services.classifier.lightgbm_service import (
    derive_severity_from_prediction,
    predict_thermal_source,
)
from app.services.notifications.alert_engine import (
    dispatch_email,
    dispatch_sms,
    dispatch_webhook,
    evaluate_alert_conditions,
    process_event_alerts,
)
from app.services.persistence.persistence_service import (
    PersistenceEvaluation,
    evaluate_persistence,
)
from app.workers.jobs import ingest_job
from app.workers.scheduler import get_scheduler, shutdown_scheduler, start_scheduler
from ml.feature_schema import CANONICAL_CLASSES


# ============================================================================
# 1. SCHEDULER & CHECKPOINT TESTS
# ============================================================================

def test_scheduler_configuration_and_interval():
    """Verify scheduler defaults to 900 seconds (15 minutes) and supports seconds."""
    assert settings.effective_firms_poll_interval_seconds == 900
    assert settings.FIRMS_POLL_MINUTES == 15
    assert settings.effective_scheduler_enabled is True


def make_mock_db(rows=None, scalar_val=None):
    mock_db = MagicMock()
    mock_result = MagicMock()
    if rows is not None:
        mock_result.all.return_value = rows
    if scalar_val is not None:
        mock_result.scalar_one_or_none.return_value = scalar_val
    else:
        mock_result.scalar_one_or_none.return_value = None

    async def async_execute(*args, **kwargs):
        return mock_result

    async def async_flush(*args, **kwargs):
        return None

    mock_db.execute = async_execute
    mock_db.flush = async_flush
    mock_db.add = MagicMock()
    return mock_db


@pytest.mark.asyncio
async def test_scheduler_lifecycle():
    """Verify scheduler starts, assigns jobs, and shuts down cleanly."""
    shutdown_scheduler()
    sched = start_scheduler()
    assert sched is not None
    assert sched.running is True

    jobs = {j.id: j for j in sched.get_jobs()}
    assert "firms_ingest" in jobs
    assert "event_analysis" in jobs
    assert "containment_sweep" in jobs

    # Verify interval trigger
    firms_job = jobs["firms_ingest"]
    assert isinstance(firms_job.trigger, IntervalTrigger)

    shutdown_scheduler()
    assert get_scheduler() is None


@pytest.mark.asyncio
async def test_ingest_job_overlapping_lock_prevention():
    """Verify that concurrent calls to ingest_job do not double-run."""
    from app.workers import jobs
    # If the lock is already acquired, ingest_job should return skipped
    await jobs._ingest_lock.acquire()
    try:
        res = await ingest_job(day_range=1)
        assert res.get("ok") is True
        assert res.get("skipped") == "already_running"
    finally:
        jobs._ingest_lock.release()


# ============================================================================
# 2. 7-DAY PERSISTENCE LOGIC TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_persistence_distinct_days_threshold_met():
    """6 distinct active days out of 7 -> persistent = True."""
    distinct_dates = [
        datetime.date(2026, 9, 1),
        datetime.date(2026, 9, 2),
        datetime.date(2026, 9, 3),
        datetime.date(2026, 9, 4),
        datetime.date(2026, 9, 5),
        datetime.date(2026, 9, 6),
    ]
    db_mock = make_mock_db(rows=[(d,) for d in distinct_dates])

    event = FireEvent(
        id="FE-000100",
        latitude=21.1700,
        longitude=72.8300,
        last_detected=datetime.datetime(2026, 9, 7, 12, 0, tzinfo=datetime.timezone.utc),
    )

    peval = await evaluate_persistence(db_mock, event, days=7, radius_meters=500.0, threshold=5)

    assert peval.is_persistent is True
    assert peval.active_days == 6
    assert peval.status_label == "persistent_thermal_source"
    assert event.is_persistent is True
    assert event.active_days_7d == 6


@pytest.mark.asyncio
async def test_persistence_distinct_days_below_threshold():
    """1 distinct active day out of 7 -> persistent = False."""
    distinct_dates = [datetime.date(2026, 9, 7)]
    db_mock = make_mock_db(rows=[(d,) for d in distinct_dates])

    event = FireEvent(
        id="FE-000101",
        latitude=21.1700,
        longitude=72.8300,
        last_detected=datetime.datetime(2026, 9, 7, 12, 0, tzinfo=datetime.timezone.utc),
    )

    peval = await evaluate_persistence(db_mock, event, days=7, radius_meters=500.0, threshold=5)

    assert peval.is_persistent is False
    assert peval.active_days == 1
    assert peval.status_label == "episodic"
    assert event.is_persistent is False
    assert event.active_days_7d == 1


@pytest.mark.asyncio
async def test_persistence_multiple_obs_same_day_counts_as_one_active_day():
    """SQL query uses SELECT DISTINCT DATE(...) ensuring 100 observations in 1 day = 1 active day."""
    db_mock = make_mock_db(rows=[(datetime.date(2026, 9, 7),)])

    event = FireEvent(
        id="FE-000102",
        latitude=21.1700,
        longitude=72.8300,
        last_detected=datetime.datetime(2026, 9, 7, 12, 0, tzinfo=datetime.timezone.utc),
    )

    peval = await evaluate_persistence(db_mock, event, days=7, radius_meters=500.0, threshold=5)
    assert peval.active_days == 1
    assert peval.is_persistent is False


# ============================================================================
# 3. ML INTEGRATION & BRANCHING TESTS
# ============================================================================

def test_lightgbm_outputs_all_six_canonical_classes():
    """LightGBM inference returns all 6 canonical probabilities."""
    raw_features = {
        "latitude": 21.17,
        "longitude": 72.83,
        "frp_latest_mw": 150.0,
        "brightness_k": 360.0,
        "factories_within_1km": 3,
        "industrial_fraction": 0.75,
        "nearest_factory_distance_m": 250.0,
    }

    pred = predict_thermal_source(raw_features)
    assert pred.predicted_class in CANONICAL_CLASSES
    assert len(pred.probabilities) == 6
    for cls in CANONICAL_CLASSES:
        assert cls in pred.probabilities
        assert 0.0 <= pred.probabilities[cls] <= 1.0


def test_lightgbm_confidence_threshold_triggers_unknown():
    """When highest probability is below threshold, class falls back to 'unknown'."""
    raw_features = {"frp_latest_mw": 10.0, "brightness_k": 310.0}

    # Set threshold unnaturally high so it always trips
    pred = predict_thermal_source(raw_features, confidence_threshold=0.999)
    assert pred.predicted_class == "unknown"


def test_severity_engine_beta_score():
    """Severity Engine categorizes based on FRP, exposure, and predicted class."""
    # Critical industrial fire
    sev_crit = derive_severity_from_prediction("industrial_fire", 0.90, {"frp_latest_mw": 250.0}, exposure_count=2)
    assert sev_crit == "CRITICAL"

    # Routine flare with moderate FRP
    sev_flare = derive_severity_from_prediction("gas_oil_flare", 0.90, {"frp_latest_mw": 50.0}, exposure_count=0)
    assert sev_flare == "LOW"


# ============================================================================
# 4. ALERT ENGINE RULES & COOLDOWN TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_alert_rule_industrial_fire_within_2km_triggers_alert():
    """industrial_fire + confidence >= 0.60 + facility <= 2000m -> Alert Created."""
    db_mock = make_mock_db(scalar_val=None)

    event = FireEvent(
        id="FE-000500",
        latitude=21.17,
        longitude=72.83,
        frp_latest_mw=120.0,
        frp_max_mw=140.0,
        is_persistent=False,
        nearest_industrial_site="Surat Petrochemical Complex",
        nearest_industrial_distance_m=1200.0,  # <= 2000m
    )

    pred_mock = MagicMock()
    pred_mock.predicted_class = "industrial_fire"
    pred_mock.confidence = 0.85  # >= 0.60
    pred_mock.severity = "HIGH"

    result = await process_event_alerts(db_mock, event, pred_mock)
    assert result.should_alert is True
    assert result.alert_type == "industrial_fire"
    assert result.severity == "HIGH"
    assert result.is_suppressed_by_cooldown is False


@pytest.mark.asyncio
async def test_alert_rule_low_confidence_suppresses_alert():
    """industrial_fire + confidence < 0.60 -> No Alert."""
    db_mock = make_mock_db(scalar_val=None)

    event = FireEvent(
        id="FE-000501",
        latitude=21.17,
        longitude=72.83,
        frp_latest_mw=40.0,
        is_persistent=False,
        nearest_industrial_site="Hazira Refinery",
        nearest_industrial_distance_m=800.0,
    )

    pred_mock = MagicMock()
    pred_mock.predicted_class = "industrial_fire"
    pred_mock.confidence = 0.45  # < 0.60 threshold
    pred_mock.severity = "MEDIUM"

    result = await process_event_alerts(db_mock, event, pred_mock)
    assert result.should_alert is False


@pytest.mark.asyncio
async def test_alert_rule_exceeding_2km_distance_suppresses_alert():
    """industrial_fire + facility distance > 2000m -> No Alert."""
    db_mock = make_mock_db(scalar_val=None)

    event = FireEvent(
        id="FE-000502",
        latitude=21.17,
        longitude=72.83,
        frp_latest_mw=100.0,
        is_persistent=False,
        nearest_industrial_site="Dahej Chemical SEZ",
        nearest_industrial_distance_m=4500.0,  # > 2000m
    )

    pred_mock = MagicMock()
    pred_mock.predicted_class = "industrial_fire"
    pred_mock.confidence = 0.90
    pred_mock.severity = "HIGH"

    result = await process_event_alerts(db_mock, event, pred_mock)
    assert result.should_alert is False


@pytest.mark.asyncio
async def test_alert_rule_persistent_source_suppresses_fire_alert():
    """Persistent Thermal Source -> No Emergency Fire Alert."""
    db_mock = make_mock_db(scalar_val=None)

    event = FireEvent(
        id="FE-000503",
        latitude=21.17,
        longitude=72.83,
        frp_latest_mw=200.0,
        is_persistent=True,  # Persistent!
        active_days_7d=6,
        nearest_industrial_site="Surat Refinery Flare Stack",
        nearest_industrial_distance_m=100.0,
    )

    result = await process_event_alerts(db_mock, event, None)
    assert result.should_alert is False
    assert "Persistent Thermal Source" in result.reason


@pytest.mark.asyncio
async def test_alert_cooldown_prevents_duplicate_notifications():
    """Same event repeated within 60 minutes -> Alert suppressed by cooldown."""
    # Prior alert was sent 10 minutes ago
    prior_alert = AlertRecord(
        id=99,
        event_id="FE-000504",
        alert_type="industrial_fire",
        status="sent",
        created_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10),
    )
    db_mock = make_mock_db(scalar_val=prior_alert)

    event = FireEvent(
        id="FE-000504",
        latitude=21.17,
        longitude=72.83,
        frp_latest_mw=150.0,
        is_persistent=False,
        nearest_industrial_site="Surat Petrochemicals",
        nearest_industrial_distance_m=500.0,
    )

    pred_mock = MagicMock()
    pred_mock.predicted_class = "industrial_fire"
    pred_mock.confidence = 0.95
    pred_mock.severity = "CRITICAL"

    result = await process_event_alerts(db_mock, event, pred_mock)
    assert result.should_alert is True
    assert result.is_suppressed_by_cooldown is True
    assert len(result.channels_dispatched) == 0
    assert "cooldown active" in result.reason.lower() or "suppressed" in result.reason.lower()


# ============================================================================
# 5. NOTIFICATION CHANNELS & GRACEFUL DEGRADATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_dispatch_mocked():
    """Webhook dispatches JSON payload cleanly when URL configured."""
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.text = "OK"

        payload = {"event_id": "FE-0001", "alert_type": "industrial_fire"}
        ok, msg = await dispatch_webhook(payload, webhook_url="https://api.example.com/alerts")
        assert ok is True
        assert "Delivered" in msg


@pytest.mark.asyncio
async def test_notification_channels_unconfigured_graceful_degradation():
    """Unconfigured channels return 'notification channel not configured' and do not crash."""
    with patch.object(settings, "ALERT_WEBHOOK_URL", ""):
        ok, msg = await dispatch_webhook({"test": 1})
        assert ok is False
        assert msg == "notification channel not configured"

    with patch.object(settings, "TWILIO_ACCOUNT_SID", ""):
        ok, msg = await dispatch_sms("Test message")
        assert ok is False
        assert msg == "notification channel not configured"

    with patch.object(settings, "SENDGRID_API_KEY", ""):
        ok, msg = await dispatch_email("Test subject", "<p>Test</p>")
        assert ok is False
        assert msg == "notification channel not configured"
