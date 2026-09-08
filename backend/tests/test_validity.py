"""Detection validity - is this a real fire, or an artefact? (spec Rule 1)

Fixtures use real values observed in Telangana FIRMS data, not invented ones.
"""

import pytest

from app.services.classifier.validity import (
    VERDICT_FALSE,
    VERDICT_REAL,
    VERDICT_UNCERTAIN,
    assess_validity,
    load_validity_rules,
    thermal_contrast_k,
)

# A convincing daytime detection: strong I4/I5 separation, nominal NASA
# confidence. Taken from 16.8699,79.2891 in the live Telangana pull.
STRONG_DAY = {
    "day_night": "D", "detection_confidence_pct": 60,
    "bright_ti4": 349.2, "bright_ti5": 286.9,
    "frp_latest_mw": 9.7, "scan": 0.4,
    "detection_count": 2, "distinct_sensors": 2,
    "recurrence_count": 0, "water_area_km2": 0.0,
}

# A genuine night detection. Contrast looks "low" at 13.4K but that is normal
# after dark - this is the case a naive fixed threshold would wrongly reject.
GENUINE_NIGHT = {
    "day_night": "N", "detection_confidence_pct": 60,
    "bright_ti4": 306.4, "bright_ti5": 293.0,
    "frp_latest_mw": 4.5, "scan": 0.39,
    "detection_count": 2, "distinct_sensors": 1,
    "recurrence_count": 0, "water_area_km2": 0.0,
}

# NASA itself assigned 0/100 to a MODIS row in the live data.
NASA_REJECTED = {
    "day_night": "D", "detection_confidence_pct": 0,
    "bright_ti4": None, "bright_ti5": None,
    "frp_latest_mw": 1.2, "scan": 2.8,
    "detection_count": 1, "distinct_sensors": 1,
    "recurrence_count": 0, "water_area_km2": 0.0,
}

PERSISTENT_INFRASTRUCTURE = {
    "day_night": "N", "detection_confidence_pct": 60,
    "bright_ti4": 320.0, "bright_ti5": 300.0,
    "frp_latest_mw": 45.0, "scan": 0.4,
    "detection_count": 30, "distinct_sensors": 3,
    "recurrence_count": 26, "water_area_km2": 0.0,
}


class TestDayNightCalibration:
    """The finding that drove the design: I4-I5 contrast splits hard by time of
    day (Telangana medians 39.1K daytime, 15.8K at night). A single threshold
    would reject every legitimate night detection."""

    def test_a_genuine_night_detection_is_not_rejected_for_low_raw_contrast(self):
        result = assess_validity(GENUINE_NIGHT)
        assert thermal_contrast_k(GENUINE_NIGHT) < 15  # would look "weak" absolutely
        assert result.verdict != VERDICT_FALSE
        assert "weak_thermal_contrast" not in result.concerns

    def test_the_same_contrast_in_daylight_is_treated_as_weak(self):
        daytime_equivalent = {**GENUINE_NIGHT, "day_night": "D"}
        assert "weak_thermal_contrast" in assess_validity(daytime_equivalent).concerns

    def test_references_differ_by_time_of_day(self):
        rules, _ = load_validity_rules()
        day = rules["thermal_contrast_reference_k"]["D"]
        night = rules["thermal_contrast_reference_k"]["N"]
        assert day > night * 1.5

    def test_night_detection_is_credited_for_ruling_out_glint(self):
        night = assess_validity(GENUINE_NIGHT)
        day = assess_validity({**GENUINE_NIGHT, "day_night": "D"})
        assert night.evidence["night_detection"] == 1.0
        assert day.evidence["night_detection"] == 0.0


class TestVerdicts:
    def test_strong_daytime_detection_reads_as_real(self):
        result = assess_validity(STRONG_DAY)
        assert result.verdict == VERDICT_REAL
        assert result.p_real > 0.65

    def test_nasa_rejected_detection_is_not_reported_as_a_fire(self):
        """NASA emitting confidence 0 is the strongest available signal that a
        pixel should not be trusted."""
        result = assess_validity(NASA_REJECTED)
        assert result.verdict in {VERDICT_FALSE, VERDICT_UNCERTAIN}
        assert "low_nasa_confidence" in result.concerns

    def test_verdict_is_one_of_three(self):
        for case in (STRONG_DAY, GENUINE_NIGHT, NASA_REJECTED, PERSISTENT_INFRASTRUCTURE):
            assert assess_validity(case).verdict in {
                VERDICT_REAL, VERDICT_UNCERTAIN, VERDICT_FALSE
            }

    def test_probability_is_bounded(self):
        for case in (STRONG_DAY, NASA_REJECTED, PERSISTENT_INFRASTRUCTURE):
            assert 0.0 <= assess_validity(case).p_real <= 1.0


class TestPersistentSources:
    """A steel plant, kiln or flare stack is a real thermal source that is not
    a fire. It appears at the same pixel day after day."""

    def test_persistence_is_flagged(self):
        assert "persistent_hotspot" in assess_validity(PERSISTENT_INFRASTRUCTURE).concerns

    def test_persistence_lowers_the_probability_of_a_fire(self):
        episodic = {**PERSISTENT_INFRASTRUCTURE, "recurrence_count": 0, "detection_count": 2}
        assert assess_validity(PERSISTENT_INFRASTRUCTURE).p_real < assess_validity(episodic).p_real


class TestSensorGeometry:
    def test_off_nadir_pixels_are_penalised(self):
        near_nadir = assess_validity({**STRONG_DAY, "scan": 0.4})
        far_edge = assess_validity({**STRONG_DAY, "scan": 3.5})
        assert far_edge.p_real < near_nadir.p_real
        assert "off_nadir" in far_edge.concerns

    def test_corroboration_raises_confidence(self):
        single = assess_validity({**STRONG_DAY, "detection_count": 1, "distinct_sensors": 1})
        multi = assess_validity({**STRONG_DAY, "detection_count": 6, "distinct_sensors": 3})
        assert multi.p_real > single.p_real
        assert "single_observation" in single.concerns

    def test_modis_without_the_channel_pair_is_neutral_not_penalised(self):
        """MODIS provides no comparable I4/I5 pair. Absence of a signal is not
        evidence against - it must not be scored as a weak signal."""
        result = assess_validity({**STRONG_DAY, "bright_ti4": None, "bright_ti5": None})
        assert result.evidence["thermal_contrast"] == 0.5
        assert "weak_thermal_contrast" not in result.concerns


class TestGlint:
    def test_daytime_water_proximity_raises_glint_concern(self):
        glinty = {
            **GENUINE_NIGHT, "day_night": "D", "water_area_km2": 0.9,
            "bright_ti4": 310.0, "bright_ti5": 296.0,
        }
        assert "possible_water_glint" in assess_validity(glinty).concerns

    def test_night_over_water_is_not_a_glint_risk(self):
        """Specular sun glint requires sun."""
        night_water = {**GENUINE_NIGHT, "water_area_km2": 0.9}
        assert "possible_water_glint" not in assess_validity(night_water).concerns


class TestReportingHonesty:
    def test_every_step_carries_the_ui_shape(self):
        for step in assess_validity(STRONG_DAY).reasoning_steps:
            assert set(step) >= {"step_index", "label", "detail", "status"}
            assert step["status"] in {"passed", "warning", "critical", "neutral"}

    def test_step_indices_are_sequential(self):
        steps = assess_validity(NASA_REJECTED).reasoning_steps
        assert [s["step_index"] for s in steps] == list(range(1, len(steps) + 1))

    def test_final_step_states_this_is_a_thermal_anomaly_not_a_confirmed_fire(self):
        """Spec Rule 1."""
        final = assess_validity(STRONG_DAY).reasoning_steps[-1]
        assert "thermal anomaly" in final["detail"]
        assert "not a confirmed fire" in final["detail"]

    def test_a_doubtful_detection_blocks_confident_source_labelling(self):
        assert assess_validity(NASA_REJECTED).is_assessable is False or \
               assess_validity(NASA_REJECTED).verdict == VERDICT_UNCERTAIN
        assert assess_validity(STRONG_DAY).is_assessable is True

    def test_model_version_is_content_hashed(self):
        _, version = load_validity_rules()
        assert version.startswith("validity-v1.")
        assert len(version.split(".")[-1]) == 6

    def test_payload_carries_the_scientific_caveat(self):
        payload = assess_validity(STRONG_DAY).to_dict()
        assert "not a confirmed fire" in payload["interpretation"]
