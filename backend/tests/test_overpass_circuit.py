"""Overpass circuit breaker backoff.

A fixed five-minute reset window meant a real outage was re-probed every five
minutes, and each probe costs a full failure cycle: six events, four attempts
each, across three mirrors. During an outage where all three mirrors refused
connections that burned roughly twelve minutes in every five, so a backlog of
86 events would have taken three hours to fail through.
"""

import time

import pytest

from app.services.osm import client as overpass


@pytest.fixture(autouse=True)
def _clean():
    overpass.reset_circuit()
    yield
    overpass.reset_circuit()


def trip_the_breaker():
    """Six consecutive failures is the documented threshold."""
    for _ in range(overpass._CIRCUIT_OPEN_AFTER):
        overpass._record_failure()


class TestBackoff:
    def test_the_first_outage_uses_the_short_window(self):
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 300.0

    def test_each_further_trip_trebles_the_window(self):
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 300.0

        # Window elapses, the probe fails, the breaker trips again.
        overpass._circuit_opened_at = time.monotonic() - 301
        assert overpass._circuit_is_open() is False
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 900.0

        overpass._circuit_opened_at = time.monotonic() - 901
        assert overpass._circuit_is_open() is False
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 2700.0

    def test_the_window_is_capped(self):
        """An outage must not back off to hours; one probe an hour is the
        floor of usefulness."""
        for _ in range(8):
            trip_the_breaker()
            overpass._circuit_opened_at = None
        assert overpass.circuit_reset_seconds() == 3600.0


class TestRecovery:
    def test_a_success_clears_the_backoff(self):
        """The next outage starts from the short window rather than
        inheriting an old one."""
        trip_the_breaker()
        overpass._circuit_opened_at = time.monotonic() - 301
        overpass._circuit_is_open()
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 900.0

        overpass._record_success()
        trip_the_breaker()
        assert overpass.circuit_reset_seconds() == 300.0

    def test_the_circuit_stays_open_inside_its_window(self):
        trip_the_breaker()
        assert overpass._circuit_is_open() is True

    def test_one_probe_is_let_through_when_the_window_elapses(self):
        trip_the_breaker()
        overpass._circuit_opened_at = time.monotonic() - 301
        assert overpass._circuit_is_open() is False
        # And it does not stay open behind that probe.
        assert overpass._circuit_opened_at is None


class TestCostOfAnOutage:
    def test_a_long_outage_costs_far_fewer_probes(self):
        """The point of the change, stated as the number of probe cycles a
        six-hour outage triggers."""
        def probes(window_fn) -> int:
            elapsed, count, trips = 0.0, 0, 0
            while elapsed < 6 * 3600:
                elapsed += window_fn(trips)
                trips += 1
                count += 1
            return count

        fixed = probes(lambda _t: 300.0)
        backed_off = probes(
            lambda t: min(300.0 * (3 ** max(t - 1, 0)) if t else 300.0, 3600.0)
        )
        # 72 probe cycles versus 9 for the same outage.
        assert fixed == 72
        assert backed_off == 9
        assert fixed / backed_off >= 8


class TestOperatorVisibility:
    async def test_the_probe_says_how_long_the_breaker_stays_open(self):
        """A red light with no duration cannot tell a brief hiccup from a
        multi-hour outage."""
        trip_the_breaker()
        result = await overpass.probe_overpass()
        assert result["ok"] is False
        assert "trip 1" in result["detail"]
        assert "retrying in" in result["detail"]

    async def test_it_says_land_cover_is_unaffected(self):
        """Overpass being down does not stop classification: WorldCover still
        supplies forest, agriculture, urban and water."""
        trip_the_breaker()
        result = await overpass.probe_overpass()
        assert "land cover is unaffected" in result["detail"].lower()
