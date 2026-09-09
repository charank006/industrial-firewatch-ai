"""Risk, asked separately from classification.

Risk was `RISK_LEVEL_BY_SEVERITY[severity]` — a lookup from the class — so the
two could never disagree. They must be able to: a confidently-identified crop
fire is not dangerous, and a less certain industrial fire next to housing is.
"""

import pytest

from app.services.risk_service import (
    CLASS_HAZARD,
    WEIGHTS,
    assess_risk,
    level_for,
)


def features(**overrides):
    base = {
        "frp_latest_mw": 5.0,
        "site_median_frp_mw": 0.0,
        "hospitals": 0, "schools": 0, "building_count": 0,
        "residential_area_km2": 0.0, "gas_facilities_within_1km": 0,
        "power_infra_within_1km": 0, "factories_within_1km": 0,
        "inside_industrial": False, "nearest_residential_m": None,
        "vpd_anomaly_kpa": 0.0, "wind_speed_ms": 2.0, "dry_hours": 0.0,
        "precipitation_24h_mm": 0.0,
        "osm_coverage": "ok", "weather_baseline_quality": "ok",
    }
    return {**base, **overrides}


class TestRiskIsNotConfidence:
    def test_a_confident_crop_fire_scores_low(self):
        """94% sure it is agricultural burning, in an empty field."""
        r = assess_risk("agriculture", features(frp_latest_mw=8.0))
        assert r.score < 35
        assert r.level == "LOW"

    def test_an_industrial_fire_beside_housing_scores_high(self):
        r = assess_risk("industrial", features(
            frp_latest_mw=87.0, site_median_frp_mw=21.0,
            hospitals=1, schools=2, building_count=40,
            residential_area_km2=0.4, nearest_residential_m=180,
            inside_industrial=True, gas_facilities_within_1km=1,
        ))
        assert r.score > 60
        assert r.level in {"HIGH", "EXTREME"}

    def test_the_same_fire_is_riskier_next_to_people(self):
        """Identical thermal signature; only exposure differs."""
        remote = assess_risk("industrial", features(frp_latest_mw=87.0))
        populated = assess_risk("industrial", features(
            frp_latest_mw=87.0, hospitals=1, schools=2, building_count=60,
            residential_area_km2=0.5, nearest_residential_m=150,
        ))
        assert populated.score > remote.score


class TestHistoricalAnomaly:
    """The signal that separates an industrial incident from Tuesday."""

    def test_far_above_the_site_median_raises_risk(self):
        normal = assess_risk("industrial", features(frp_latest_mw=22.0, site_median_frp_mw=21.0))
        spike = assess_risk("industrial", features(frp_latest_mw=85.0, site_median_frp_mw=21.0))
        assert spike.components["anomaly"] > normal.components["anomaly"]
        assert spike.score > normal.score

    def test_running_at_its_own_normal_contributes_nothing(self):
        r = assess_risk("flare", features(frp_latest_mw=21.0, site_median_frp_mw=21.0))
        assert r.components["anomaly"] == 0.0

    def test_no_history_is_neutral_not_zero(self):
        """A first detection is not evidence of normality."""
        r = assess_risk("industrial", features(frp_latest_mw=50.0, site_median_frp_mw=0.0))
        assert 0.3 < r.components["anomaly"] < 0.5


class TestHazardIsAboutMaterialNotCertainty:
    def test_gas_outranks_agriculture(self):
        assert CLASS_HAZARD["gas_oil"] > CLASS_HAZARD["agriculture"]

    def test_a_routine_flare_is_low_hazard_despite_being_industrial(self):
        """Designed, controlled combustion. High FRP is its normal state."""
        flare = assess_risk("flare", features(frp_latest_mw=60.0, site_median_frp_mw=58.0))
        fire = assess_risk("industrial", features(frp_latest_mw=60.0, site_median_frp_mw=58.0))
        assert flare.score < fire.score

    def test_unknown_sits_between_the_extremes(self):
        assert CLASS_HAZARD["agriculture"] < CLASS_HAZARD["unknown"] < CLASS_HAZARD["gas_oil"]


class TestValidityCanOnlyReduceRisk:
    def test_a_doubtful_detection_cannot_be_a_high_risk_fire(self):
        strong = features(frp_latest_mw=90.0, site_median_frp_mw=20.0, building_count=50)
        real = assess_risk("industrial", strong, validity_p_real=0.98)
        doubtful = assess_risk("industrial", strong, validity_p_real=0.11)
        assert doubtful.score < real.score
        assert any("doubtful" in c for c in doubtful.caveats)

    def test_full_confidence_does_not_inflate(self):
        f = features(frp_latest_mw=40.0)
        assert assess_risk("industrial", f, validity_p_real=1.0).score == assess_risk("industrial", f).score


class TestHonestyAboutInputs:
    def test_sparse_osm_is_declared_as_a_lower_bound(self):
        r = assess_risk("industrial", features(osm_coverage="sparse"))
        assert any("lower bound" in c for c in r.caveats)

    def test_every_component_is_published(self):
        r = assess_risk("industrial", features())
        assert set(r.components) == set(WEIGHTS)
        assert all(0.0 <= v <= 1.0 for v in r.components.values())

    def test_drivers_are_ranked_by_contribution(self):
        r = assess_risk("industrial", features(frp_latest_mw=90.0, building_count=80))
        points = [d["points"] for d in r.drivers]
        assert points == sorted(points, reverse=True)


class TestScale:
    def test_weights_sum_to_one_so_the_score_reads_as_a_percentage(self):
        assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9

    def test_score_is_bounded(self):
        extreme = assess_risk("gas_oil", features(
            frp_latest_mw=5000.0, site_median_frp_mw=1.0, hospitals=9, schools=9,
            building_count=900, residential_area_km2=3.0, nearest_residential_m=10,
            inside_industrial=True, gas_facilities_within_1km=9,
            power_infra_within_1km=9, factories_within_1km=9,
            vpd_anomaly_kpa=4.0, wind_speed_ms=25.0, dry_hours=200.0,
        ))
        assert 0.0 <= extreme.score <= 100.0

    def test_levels_are_ordered(self):
        assert level_for(85) == "EXTREME"
        assert level_for(65) == "HIGH"
        assert level_for(40) == "MODERATE"
        assert level_for(10) == "LOW"
