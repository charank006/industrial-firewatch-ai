"""Classifier calibration and discrimination.

Hand-checked cases pinning the behaviour the whole product depends on:
a textbook industrial fire should land around 0.80-0.85, a genuinely
ambiguous one should come out near-flat, and a known flare must never be
reported as an industrial fire.

Spec Rule 8: probabilities, never certainty.
Spec Rule 3: nearby industry does not prove industrial origin.
"""

import math

import pytest

from app.services.classifier.scorer import (
    CLASS_LABEL,
    classify,
    entropy_normalised,
    load_rules,
)
from app.services.impact_service import assess_impact, build_risk_zones

BASE_FEATURES = {
    "latitude": 21.1738,
    "longitude": 72.8345,
    "frp_latest_mw": 20.0,
    "frp_max_mw": 20.0,
    "detection_count": 2,
    "duration_hours": 4.0,
    "day_night": "D",
    "recurrence_count": 0,
    "site_median_frp_mw": 0.0,
    "neighbour_events_10km_24h": 0,
    "history_days": 30,
    "radius_km": 1.0,
    "industrial_fraction": 0.0,
    "industrial_area_km2": 0.0,
    "forest_fraction": 0.0,
    "forest_area_km2": 0.0,
    "farmland_fraction": 0.0,
    "farmland_area_km2": 0.0,
    "residential_fraction": 0.0,
    "residential_area_km2": 0.0,
    "scrub_grass_fraction": 0.0,
    "building_count": 0,
    "gas_facilities_within_1km": 0,
    "factories_within_1km": 0,
    "power_infra_within_1km": 0,
    "hospitals": 0,
    "schools": 0,
    "road_length_km": 0.0,
    "nearest_factory_m": None,
    "inside_industrial": False,
    "osm_coverage": "ok",
    "osm_element_count": 80,
    "weather_baseline_quality": "ok",
    "weather_baseline_samples": 6,
    "vpd_anomaly_kpa": 0.0,
    "wind_speed_ms": None,
    "wind_direction_deg": None,
}


def features(**overrides):
    return {**BASE_FEATURES, **overrides}


INDUSTRIAL_FIRE = features(
    frp_latest_mw=120.0, inside_industrial=True, industrial_fraction=0.74,
    industrial_area_km2=2.33, nearest_factory_m=0.0, factories_within_1km=7,
    gas_facilities_within_1km=0, building_count=6, detection_count=3,
)
# A flare stack burns hydrocarbon, so a routine flare has gas infrastructure
# around it by definition. The fixture used to omit that, which made it
# indistinguishable from a coal seam fire inside a mine - see
# PERSISTENT_INDUSTRIAL_NO_GAS below.
ROUTINE_FLARE = features(
    frp_latest_mw=48.0, inside_industrial=True, industrial_fraction=0.6,
    industrial_area_km2=1.9, nearest_factory_m=0.0, factories_within_1km=5,
    gas_facilities_within_1km=3, nearest_gas_facility_m=90.0,
    recurrence_count=22, site_median_frp_mw=50.0, duration_hours=96.0,
    day_night="N", detection_count=14,
)

# Real case from the Telangana data: a fire inside Manuguru II Coal Mine.
# Matches every flare signal except the one that matters - there is no gas
# installation anywhere near it.
PERSISTENT_INDUSTRIAL_NO_GAS = features(
    frp_latest_mw=2.9, inside_industrial=True, industrial_fraction=0.74,
    industrial_area_km2=2.32, nearest_factory_m=0.0, factories_within_1km=2,
    gas_facilities_within_1km=0,
    recurrence_count=12, site_median_frp_mw=2.5, duration_hours=72.0,
    day_night="N", detection_count=8,
)
FOREST_FIRE = features(
    frp_latest_mw=75.0, forest_fraction=0.62, forest_area_km2=1.95,
    nearest_factory_m=None, vpd_anomaly_kpa=1.2, detection_count=4,
)
AGRICULTURAL = features(
    frp_latest_mw=8.0, farmland_fraction=0.71, farmland_area_km2=2.2,
    neighbour_events_10km_24h=9, day_night="D", duration_hours=2.0,
)
GAS_OIL = features(
    frp_latest_mw=95.0, inside_industrial=True, industrial_fraction=0.55,
    industrial_area_km2=1.7, gas_facilities_within_1km=4, nearest_factory_m=120.0,
    factories_within_1km=3, detection_count=3,
)
URBAN = features(
    frp_latest_mw=25.0, residential_fraction=0.68, residential_area_km2=2.1,
    building_count=140, nearest_factory_m=None, detection_count=2,
)
NO_CONTEXT = features(osm_coverage="sparse", osm_element_count=3, detection_count=1)


class TestDiscrimination:
    """Each hand-built archetype must classify as itself."""

    @pytest.mark.parametrize(
        "case,expected",
        [
            (INDUSTRIAL_FIRE, "industrial"),
            (ROUTINE_FLARE, "flare"),
            (FOREST_FIRE, "forest"),
            (AGRICULTURAL, "agriculture"),
            (GAS_OIL, "gas_oil"),
            (URBAN, "urban"),
        ],
    )
    def test_archetype_classifies_as_itself(self, case, expected):
        assert classify(case).prediction == expected

    def test_a_known_flare_is_never_called_an_industrial_fire(self):
        """The distinction the whole product hinges on. The discriminator is
        stability against the SITE'S OWN history, not an absolute FRP
        threshold - which is exactly what the old engine's `frpMw > 100` rule
        got wrong."""
        result = classify(ROUTINE_FLARE)
        assert result.prediction == "flare"
        assert result.probabilities["flare"] > result.probabilities["industrial"]

    def test_a_high_frp_first_time_industrial_event_is_not_called_a_flare(self):
        result = classify(INDUSTRIAL_FIRE)
        assert result.prediction == "industrial"
        assert result.probabilities["industrial"] > result.probabilities["flare"]

    def test_gas_oil_requires_specific_tags_not_generic_industry(self):
        """Without tag specificity Gas/Oil could never outrank industrial."""
        without_gas = classify(features(**{**GAS_OIL, "gas_facilities_within_1km": 0}))
        assert without_gas.prediction != "gas_oil"
        assert classify(GAS_OIL).prediction == "gas_oil"

    def test_peri_urban_farmland_does_not_come_back_urban(self):
        """Urban carries a negative bias precisely so that every peri-urban
        agricultural fire in a dense country does not classify as Urban."""
        peri_urban = features(
            farmland_fraction=0.5, farmland_area_km2=1.6,
            residential_fraction=0.22, residential_area_km2=0.7,
            building_count=45, frp_latest_mw=9.0, neighbour_events_10km_24h=6,
        )
        assert classify(peri_urban).prediction == "agriculture"

    def test_nearby_industry_alone_does_not_prove_industrial_origin(self):
        """Spec Rule 3. A forest fire beside an industrial estate stays a
        forest fire."""
        forest_near_industry = features(
            forest_fraction=0.6, forest_area_km2=1.9, frp_latest_mw=70.0,
            nearest_factory_m=600.0, factories_within_1km=2,
        )
        assert classify(forest_near_industry).prediction == "forest"


class TestCalibration:
    def test_textbook_industrial_case_lands_in_the_target_band(self):
        """The spec's own example sits at 0.81."""
        result = classify(INDUSTRIAL_FIRE)
        assert 0.75 <= result.probabilities["industrial"] <= 0.90

    def test_an_ambiguous_case_comes_out_near_flat(self):
        """Hand weights plus a raw softmax are badly overconfident; the
        temperature knob exists to stop that."""
        result = classify(NO_CONTEXT)
        assert result.probabilities[result.prediction] < 0.60
        assert entropy_normalised(result.probabilities) < 0.55

    def test_probabilities_sum_to_one(self):
        for case in (INDUSTRIAL_FIRE, ROUTINE_FLARE, FOREST_FIRE, NO_CONTEXT):
            assert sum(classify(case).probabilities.values()) == pytest.approx(1.0, abs=1e-6)

    def test_no_class_is_ever_zero(self):
        """Spec Rule 8 - the model expresses uncertainty, never impossibility."""
        for case in (INDUSTRIAL_FIRE, AGRICULTURAL, URBAN):
            for cls, p in classify(case).probabilities.items():
                assert p > 0.0, cls

    def test_all_seven_classes_are_always_present(self):
        assert set(classify(NO_CONTEXT).probabilities) == set(CLASS_LABEL)


class TestUnknownFallback:
    def test_no_evidence_falls_through_to_unknown(self):
        """`unknown` carries a bias and no evidence terms, so it wins by
        construction rather than via a special-case default branch."""
        assert classify(NO_CONTEXT).prediction == "unknown"

    def test_unknown_has_no_weights_of_its_own(self):
        rules, _ = load_rules()
        for key, per_class in rules["weights"].items():
            assert "unknown" not in per_class, key


class TestConfidence:
    def test_sparse_osm_lowers_confidence(self):
        rich = classify(INDUSTRIAL_FIRE)
        thin = classify(features(**{**INDUSTRIAL_FIRE, "osm_coverage": "sparse", "osm_element_count": 4}))
        assert thin.confidence_pct < rich.confidence_pct
        assert thin.data_quality < rich.data_quality

    def test_partial_weather_baseline_lowers_confidence(self):
        full = classify(INDUSTRIAL_FIRE)
        partial = classify(
            features(**{**INDUSTRIAL_FIRE, "weather_baseline_quality": "partial", "weather_baseline_samples": 4})
        )
        assert partial.confidence_pct < full.confidence_pct

    def test_single_detection_lowers_confidence(self):
        many = classify(features(**{**INDUSTRIAL_FIRE, "detection_count": 6}))
        one = classify(features(**{**INDUSTRIAL_FIRE, "detection_count": 1}))
        assert one.confidence_pct < many.confidence_pct

    def test_confidence_stays_in_the_configured_band(self):
        rules, _ = load_rules()
        for case in (INDUSTRIAL_FIRE, ROUTINE_FLARE, NO_CONTEXT, URBAN, AGRICULTURAL):
            pct = classify(case).confidence_pct
            assert rules["confidence"]["min"] <= pct <= rules["confidence"]["max"]

    def test_degraded_inputs_are_stated_in_the_reasoning(self):
        result = classify(features(**{**INDUSTRIAL_FIRE, "osm_coverage": "sparse", "osm_element_count": 3}))
        details = " ".join(step["detail"] for step in result.reasoning_steps)
        assert "sparse" in details.lower()


class TestSeverity:
    def test_severity_uses_frp_not_class_alone(self):
        low = classify(features(**{**INDUSTRIAL_FIRE, "frp_latest_mw": 20.0}))
        high = classify(features(**{**INDUSTRIAL_FIRE, "frp_latest_mw": 200.0}))
        assert high.severity == "CRITICAL"
        assert low.severity in {"MEDIUM", "LOW"}

    def test_critical_is_reachable(self):
        """The old engine's `isCritical ? 'HIGH' : 'HIGH'` meant CRITICAL was
        literally unreachable."""
        assert classify(features(**{**INDUSTRIAL_FIRE, "frp_latest_mw": 400.0})).severity == "CRITICAL"

    def test_benign_classes_are_not_escalated_by_raw_power(self):
        """A big routine flare is still routine."""
        assert classify(features(**{**ROUTINE_FLARE, "frp_latest_mw": 200.0})).severity in {"MEDIUM", "LOW"}

    def test_exposure_escalates_severity(self):
        base = classify(features(**{**INDUSTRIAL_FIRE, "frp_latest_mw": 70.0}), exposure_count=0)
        exposed = classify(features(**{**INDUSTRIAL_FIRE, "frp_latest_mw": 70.0}), exposure_count=5)
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        assert order.index(exposed.severity) > order.index(base.severity)


class TestReasoningSteps:
    def test_steps_match_the_shape_the_existing_ui_renders(self):
        for step in classify(INDUSTRIAL_FIRE).reasoning_steps:
            assert set(step) == {"step_index", "label", "detail", "status"}
            assert step["status"] in {"passed", "warning", "critical", "neutral"}
            assert isinstance(step["step_index"], int)

    def test_final_step_states_the_probabilistic_nature(self):
        """Spec Rule 8 - the UI must never imply a determination of cause."""
        final = classify(INDUSTRIAL_FIRE).reasoning_steps[-1]
        assert final["label"] == "Rule Engine Output"
        assert "not a determination of ignition cause" in final["detail"]
        assert "p=" in final["detail"]

    def test_step_indices_are_sequential(self):
        steps = classify(ROUTINE_FLARE).reasoning_steps
        assert [s["step_index"] for s in steps] == list(range(1, len(steps) + 1))

    def test_top_evidence_is_surfaced(self):
        labels = [s["label"] for s in classify(ROUTINE_FLARE).reasoning_steps]
        assert "Thermal Recurrence History" in labels


class TestModelVersioning:
    def test_version_is_derived_from_the_rule_file_content(self):
        _, version = load_rules()
        assert version.startswith("rules-v1.")
        assert len(version.split(".")[-1]) == 6

    def test_output_contract_matches_what_ml_will_emit(self):
        payload = classify(INDUSTRIAL_FIRE).to_dict()
        for key in ("prediction", "confidence", "probabilities", "model_version", "model_kind"):
            assert key in payload
        assert payload["model_kind"] == "rule_scorer"


class TestImpact:
    def test_pollutants_are_potential_not_measured(self):
        """Spec section 22 / Rule 7."""
        impact = assess_impact("industrial", "HIGH", INDUSTRIAL_FIRE)
        assert "potential_pollutants" in impact
        assert "not measured by satellite" in impact["pollutant_caveat"]

    def test_pollutants_differ_by_class(self):
        industrial = set(assess_impact("industrial", "HIGH", INDUSTRIAL_FIRE)["potential_pollutants"])
        agricultural = set(assess_impact("agriculture", "LOW", AGRICULTURAL)["potential_pollutants"])
        assert "NH3" in agricultural  # ammonia from residue burning
        assert "SO2" in industrial
        assert industrial != agricultural

    def test_risk_zones_are_directional_when_wind_is_known(self):
        """Spec section 21 warns against treating a plain circle as the
        damage zone."""
        zones = build_risk_zones(21.17, 72.83, 120.0, wind_speed_ms=8.0, wind_direction_deg=270.0)
        levels = [f["properties"]["level"] for f in zones["features"]]
        assert levels == ["critical", "warning", "monitoring"]
        # Wind FROM 270 (west) means the plume travels toward 90 (east).
        assert zones["features"][1]["properties"]["bearing_deg"] == pytest.approx(90.0)

    def test_plume_extends_downwind_not_upwind(self):
        zones = build_risk_zones(21.17, 72.83, 120.0, wind_speed_ms=10.0, wind_direction_deg=270.0)
        lobe = zones["features"][1]["geometry"]["coordinates"][0]
        east_extent = max(lon for lon, _ in lobe) - 72.83
        west_extent = 72.83 - min(lon for lon, _ in lobe)
        assert east_extent > west_extent

    def test_missing_wind_falls_back_to_circles_and_says_so(self):
        zones = build_risk_zones(21.17, 72.83, 120.0, None, None)
        labels = [f["properties"]["label"] for f in zones["features"]]
        assert any("omnidirectional" in label for label in labels)

    def test_stronger_wind_carries_the_plume_further(self):
        calm = build_risk_zones(21.17, 72.83, 100.0, 1.0, 180.0)
        gale = build_risk_zones(21.17, 72.83, 100.0, 15.0, 180.0)
        assert gale["features"][1]["properties"]["radius_m"] > calm["features"][1]["properties"]["radius_m"]

    def test_sparse_osm_marks_exposure_as_a_lower_bound(self):
        """Spec Rule 4 - absent OSM data is not evidence nothing is there."""
        impact = assess_impact("industrial", "HIGH", features(**{**INDUSTRIAL_FIRE, "osm_coverage": "sparse"}))
        assert any("LOWER BOUND" in note for note in impact["notes"])

    def test_risk_zones_are_valid_geojson(self):
        zones = build_risk_zones(21.17, 72.83, 100.0, 5.0, 45.0)
        assert zones["type"] == "FeatureCollection"
        for feature in zones["features"]:
            ring = feature["geometry"]["coordinates"][0]
            assert ring[0] == ring[-1]  # closed
            assert len(ring) >= 4


class TestSuggestedAction:
    """Urgency must come from severity, not from the class alone - keying it
    on class produced "CRITICAL ALERT" on a MEDIUM-severity event."""

    def test_urgency_tracks_severity(self):
        from app.services.classifier.scorer import suggested_action

        assert suggested_action("gas_oil", "MEDIUM", {}).startswith("ADVISORY")
        assert suggested_action("gas_oil", "CRITICAL", {}).startswith("CRITICAL ALERT")
        assert suggested_action("gas_oil", "LOW", {}).startswith("MONITORING")

    def test_body_tracks_class(self):
        from app.services.classifier.scorer import suggested_action

        assert "Hydrocarbon" in suggested_action("gas_oil", "HIGH", {})
        assert "flare" in suggested_action("flare", "LOW", {})

    def test_prediction_and_action_never_disagree_on_urgency(self):
        for case in (INDUSTRIAL_FIRE, ROUTINE_FLARE, GAS_OIL, NO_CONTEXT, AGRICULTURAL):
            result = classify(case)
            from app.services.classifier.scorer import suggested_action

            action = suggested_action(result.prediction, result.severity, case)
            if result.severity in {"LOW", "MEDIUM"}:
                assert not action.startswith("CRITICAL ALERT"), action


class TestFlareRequiresHydrocarbonInfrastructure:
    """A flare stack burns hydrocarbon. Persistent, stable heat inside an
    industrial parcel is the flare signature, but without gas infrastructure
    there is nothing to flare - and calling a coal seam fire a "Routine Flare"
    tells an operator it is normal and expected. It is not."""

    def test_a_genuine_flare_with_gas_infrastructure_still_reads_as_flare(self):
        assert classify(ROUTINE_FLARE).prediction == "flare"

    def test_the_same_signature_without_gas_infrastructure_is_not_a_flare(self):
        result = classify(PERSISTENT_INDUSTRIAL_NO_GAS)
        assert result.prediction != "flare"

    def test_it_reads_as_an_industrial_heat_source_instead(self):
        assert classify(PERSISTENT_INDUSTRIAL_NO_GAS).prediction == "industrial"

    def test_removing_the_gas_infrastructure_is_what_flips_it(self):
        """Isolates the cause: same fixture, gas facilities the only change."""
        with_gas = classify(features(**{**PERSISTENT_INDUSTRIAL_NO_GAS,
                                        "gas_facilities_within_1km": 3}))
        without = classify(PERSISTENT_INDUSTRIAL_NO_GAS)
        assert with_gas.probabilities["flare"] > without.probabilities["flare"]

    def test_the_reasoning_names_the_missing_infrastructure(self):
        steps = classify(PERSISTENT_INDUSTRIAL_NO_GAS).reasoning_steps
        assert any("gas" in s["detail"].lower() or "petroleum" in s["detail"].lower()
                   for s in steps)
