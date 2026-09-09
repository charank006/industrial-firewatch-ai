"""Detection is instantaneous; incident intelligence is continuous.

An event crossing the risk threshold becomes a tracked incident with a
48-hour monitoring window, its risk recomputed against fresh conditions every
30 minutes, and closed when the window expires.
"""

import datetime

import pytest

from app.config import settings
from app.models.models import FireEvent
from app.services.analysis_service import _apply_risk
from app.services.risk_service import RiskAssessment


def risk(score):
    return RiskAssessment(score=score, level="HIGH" if score >= 60 else "LOW",
                          components={"thermal": 0.5}, contributions={"thermal": 12.0})


@pytest.fixture
def event():
    return FireEvent(id="FE-TEST", latitude=17.0, longitude=78.0)


class TestCrossingTheThreshold:
    def test_a_high_score_opens_an_incident(self, event, monkeypatch):
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        _apply_risk(event, risk(72.0))
        assert event.is_actionable is True
        assert event.monitoring_until is not None

    def test_a_low_score_records_but_does_not_open_one(self, event, monkeypatch):
        """The detection is still stored - the threshold governs the incident
        registry, not whether the observation is kept. Discarding it would
        destroy the site history and the neighbour features that the rest of
        the system depends on."""
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        _apply_risk(event, risk(31.0))
        assert event.is_actionable is False
        assert event.monitoring_until is None
        assert event.risk_score == 31.0

    def test_the_window_is_the_configured_length(self, event, monkeypatch):
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        monkeypatch.setattr(settings, "INCIDENT_MONITORING_HOURS", 48)
        before = datetime.datetime.now(datetime.timezone.utc)
        _apply_risk(event, risk(80.0))
        span = event.monitoring_until - before
        assert 47.9 < span.total_seconds() / 3600 < 48.1


class TestItDoesNotFlap:
    def test_a_single_quiet_reading_does_not_close_an_incident(self, event, monkeypatch):
        """A fire that dips for one satellite pass has not stopped being an
        incident. The window expiring is what closes it, not one low score."""
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        _apply_risk(event, risk(75.0))
        opened_until = event.monitoring_until

        _apply_risk(event, risk(28.0))
        assert event.is_actionable is True
        assert event.monitoring_until == opened_until

    def test_a_further_qualifying_reading_extends_the_window(self, event, monkeypatch):
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        _apply_risk(event, risk(75.0))
        first = event.monitoring_until
        _apply_risk(event, risk(81.0))
        assert event.monitoring_until > first


class TestRiskTrail:
    def test_each_reading_is_recorded(self, event, monkeypatch):
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        for score in (60.0, 64.0, 71.0):
            _apply_risk(event, risk(score))
        assert [h["score"] for h in event.risk_history] == [60.0, 64.0, 71.0]

    def test_the_trail_is_bounded(self, event, monkeypatch):
        """48 hours at one reading every 30 minutes is 96 entries; an
        unbounded list would grow without limit on a long-lived event."""
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        for i in range(140):
            _apply_risk(event, risk(60.0 + i % 5))
        assert len(event.risk_history) == 96

    def test_the_current_score_is_always_the_latest(self, event, monkeypatch):
        monkeypatch.setattr(settings, "RISK_INCIDENT_THRESHOLD", 50.0)
        _apply_risk(event, risk(60.0))
        _apply_risk(event, risk(88.0))
        assert event.risk_score == 88.0
        assert event.risk_history[-1]["score"] == 88.0
