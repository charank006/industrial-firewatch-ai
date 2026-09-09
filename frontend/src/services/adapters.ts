/**
 * Wire format -> UI types.
 *
 * The adapter lives on the frontend because the backend contract is the
 * spec's contract (snake_case, `{prediction, confidence, probabilities,
 * model_version}`) and has other consumers planned - the ml/ trainer and the
 * ingest worker. Shaping it around one React app's field names would tattoo
 * this UI's history onto the API. Fields like `timeFormatted` (a rendered
 * string), `isNew` (derived) and `landCover` (a closed UI union) are
 * presentation legacy that does not belong in a response model.
 *
 * Hard rule: renaming and trivial formatting ONLY, no business logic. Anything
 * needing a join, a threshold or a model output is a backend field.
 */

import type { ApiAnalysis, ApiFacility, ApiFireEvent, ApiReasoningStep } from './api';
import type {
  EventClassification,
  FacilityStatus,
  FireAnalysis,
  FireClassId,
  ImpactDetail,
  IndustrialFacility,
  LandCoverCategory,
  PredictionDetail,
  ReasoningStep,
  SeverityLevel,
  SurroundingsDetail,
  ThermalHotspot,
  ValidityDetail,
  WeatherDetail,
} from '../types';

/**
 * Backend class id -> UI label. Mirrored on the backend; the two must agree.
 */
export const CLASS_LABEL: Record<string, EventClassification> = {
  industrial: 'Industrial Fire',
  flare: 'Routine Flare',
  forest: 'Forest Fire',
  agriculture: 'Agricultural Burning',
  gas_oil: 'Gas/Oil',
  urban: 'Urban',
  mining: 'Mining / Extraction',
  unknown: 'Unknown Anomaly',
};

const LAND_COVER_VALUES: readonly LandCoverCategory[] = [
  'Built-up Industrial',
  'Dense Forest',
  'Cropland',
  'Water Body',
  'Scrubland',
  'Unclassified',
];

const SEVERITY_VALUES: readonly SeverityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const VERDICT_VALUES: readonly ValidityDetail['verdict'][] = [
  'REAL_FIRE',
  'UNCERTAIN',
  'LIKELY_FALSE_ALARM',
];

/** An unrecognised verdict reads as "not assessed" rather than a wrong badge. */
function verdictOrUndefined(candidate: unknown): ValidityDetail['verdict'] | undefined {
  return VERDICT_VALUES.includes(candidate as ValidityDetail['verdict'])
    ? (candidate as ValidityDetail['verdict'])
    : undefined;
}

const FACILITY_STATUSES: readonly FacilityStatus[] = ['NORMAL', 'ELEVATED', 'ANOMALY_DETECTED'];

function oneOf<T extends string>(values: readonly T[], candidate: unknown, fallback: T): T {
  return values.includes(candidate as T) ? (candidate as T) : fallback;
}

export function adaptReasoningStep(step: ApiReasoningStep): ReasoningStep {
  return {
    stepIndex: step.step_index,
    label: step.label,
    detail: step.detail,
    status: step.status,
  };
}

export function adaptFireEvent(event: ApiFireEvent): ThermalHotspot {
  const timestamp = event.last_detected ?? new Date().toISOString();

  return {
    id: event.fire_event_id,
    lat: event.latitude,
    lng: event.longitude,
    frpMw: event.frp_latest_mw,
    brightnessK: event.brightness_k ?? 0,
    // `confidence` means CLASSIFICATION confidence - which is what every
    // component labels it. Until Phase 5 there is none, so it reads 0 rather
    // than borrowing NASA's detection confidence and quietly meaning
    // something else.
    confidence: event.classification_confidence_pct ?? 0,
    detectionConfidence: event.detection_confidence_pct ?? undefined,
    timestamp,
    timeFormatted: event.time_formatted ?? '',
    dayNight: event.day_night === 'N' ? 'N' : 'D',
    landCover: oneOf(LAND_COVER_VALUES, event.land_cover, 'Unclassified'),
    facilityDistanceKm: event.nearest_facility_distance_km ?? 0,
    nearestFacilityId: event.nearest_facility_id ?? '',
    nearestFacilityName: event.nearest_facility_name ?? 'Unassigned',
    classification: event.prediction
      ? (CLASS_LABEL[event.prediction] ?? 'Unknown Anomaly')
      : 'Unknown Anomaly',
    // Validity is a SEPARATE verdict from class and must never be folded into
    // it: "is this a fire at all" answered before "what kind of fire".
    validityVerdict: verdictOrUndefined(event.validity?.verdict),
    validityConfidencePct: event.validity?.confidence_pct,
    severity: oneOf(SEVERITY_VALUES, event.severity, 'MEDIUM'),
    detectionCount: event.detection_count,
    riskScore: event.risk_score ?? undefined,
    riskLevel: event.risk_level ?? undefined,
    isActionable: event.is_actionable ?? undefined,
    monitoringUntil: event.monitoring_until ?? undefined,
    historicalOccurrenceCount: event.recurrence_count,
    firstSeenDate: (event.first_detected ?? timestamp).slice(0, 10),
    reasoningSteps: event.reasoning_steps.map(adaptReasoningStep),
    suggestedAction: event.suggested_action,
    locationName: event.location_name,
    isNew: event.is_new,
  };
}

export function adaptFacility(facility: ApiFacility): IndustrialFacility {
  return {
    id: facility.id,
    name: facility.name,
    // Free text from OSM tags, so no `oneOf` narrowing here - clamping it to
    // a closed union would relabel a real site as something it is not.
    type: facility.type,
    lat: facility.latitude,
    lng: facility.longitude,
    location: facility.location,
    status: oneOf(FACILITY_STATUSES, facility.status, 'NORMAL'),
    named: Boolean(facility.named),
    nearestDistanceM: num(facility.nearest_distance_m),
    currentFRP: facility.current_frp,
    lastDetected: facility.last_detected ?? '',
    eventCount: facility.event_count,
    fireEventIds: facility.fire_event_ids ?? [],
  };
}

/** Maps the UI's dateRange filter onto an ISO lower bound for `?since=`. */
export function dateRangeToSince(range: string, now: Date = new Date()): string | undefined {
  const hours: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '180d': 24 * 180 };
  const span = hours[range];
  if (!span) return undefined;
  return new Date(now.getTime() - span * 3_600_000).toISOString();
}

/**
 * Region label -> bounding box for `?bbox=`.
 *
 * `filters.region` has always existed in the Header dropdown and was never
 * applied to anything; wiring it is additive.
 */
export const REGION_BBOX: Record<string, string> = {
  // The AOI the ingest worker actually polls FIRMS for (backend
  // FIRMS_AOI_BBOX). Anything else returns an empty map until the AOI is
  // widened, so this is the default.
  //
  // Named for the rectangle, not for Telangana: no rectangle matches a state
  // border, and this one reaches into Chandrapur district in Maharashtra.
  // Roughly a fifth of ingested events (Ghugus, Ballarpur, Sakhari) are
  // across that border, and calling the region "Telangana" reported them as
  // Telangana fires.
  // The AOI the ingest worker polls. Detections are clipped to the real
  // country border before storage, so this box is only a fetch envelope.
  'India': '68.0,6.0,98.0,36.0',
  'Telangana Bounding Box': '77.2,15.8,81.4,19.95',
  'Gujarat Industrial Corridor': '68.0,20.0,75.0,25.0',
  'Permian Petrochemical Zone': '-104.5,29.5,-100.5,33.5',
  'Rhine Industrial Belt': '5.8,49.0,9.5,52.0',
};

export function regionToBbox(region: string): string | undefined {
  return REGION_BBOX[region];
}

// --- Detail adapters (Phase 5/6) -----------------------------------------
// Same hard rule: renaming and trivial formatting only.

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function adaptWeather(raw: Record<string, any> | null): WeatherDetail | null {
  if (!raw) return null;
  const { current = {}, baseline = {}, anomaly = {}, precipitation = {} } = raw;
  return {
    localHour: raw.local_hour ?? null,
    timezone: raw.timezone ?? null,
    currentTemperatureC: num(current.temperature_c),
    currentHumidityPct: num(current.humidity_pct),
    windSpeedMs: num(current.wind_speed_ms),
    windDirectionDeg: num(current.wind_direction_deg),
    vpdKpa: num(current.vpd_kpa),
    baselineTemperatureC: num(baseline.temperature_c),
    baselineHumidityPct: num(baseline.humidity_pct),
    baselineSamples: baseline.samples ?? 0,
    baselineDaysRequested: baseline.days_requested ?? 6,
    baselineQuality: baseline.quality ?? 'insufficient',
    temperatureAnomalyC: num(anomaly.temperature_c),
    temperatureAnomalyZ: num(anomaly.temperature_z),
    temperatureTrendCPerDay: num(anomaly.temperature_trend_c_per_day),
    humidityAnomalyPct: num(anomaly.humidity_pct),
    windChangeMs: num(anomaly.wind_change_ms),
    vpdAnomalyKpa: num(anomaly.vpd_kpa),
    precipitation24hMm: num(precipitation.last_24h_mm),
    precipitation72hMm: num(precipitation.last_72h_mm),
    dryHours: num(precipitation.dry_hours),
    interpretation: raw.interpretation ?? '',
  };
}

export function adaptSurroundings(raw: Record<string, any> | null): SurroundingsDetail | null {
  if (!raw) return null;
  return {
    radiusM: raw.radius_m ?? 1000,
    industrialAreaKm2: num(raw.industrial_area_km2),
    forestAreaKm2: num(raw.forest_area_km2),
    farmlandAreaKm2: num(raw.farmland_area_km2),
    residentialAreaKm2: num(raw.residential_area_km2),
    waterAreaKm2: num(raw.water_area_km2),
    factoriesWithin1km: num(raw.factories_within_1km),
    gasFacilitiesWithin1km: num(raw.gas_facilities_within_1km),
    powerInfraWithin1km: num(raw.power_infra_within_1km),
    buildingCount: num(raw.building_count),
    hospitals: num(raw.hospitals),
    schools: num(raw.schools),
    fireStations: num(raw.fire_stations),
    emergencyFacilities: (raw.emergency_facilities ?? []).map((f: Record<string, any>) => ({
      kind: f.kind,
      name: f.name,
      amenity: f.amenity,
      distanceM: num(f.distance_m),
    })),
    roadLengthKm: num(raw.road_length_km),
    nearestFactoryM: num(raw.nearest_factory_m),
    nearestGasFacilityM: num(raw.nearest_gas_facility_m),
    nearestResidentialM: num(raw.nearest_residential_m),
    insideIndustrial: Boolean(raw.inside_industrial),
    landCover: raw.land_cover ?? null,
    osmCoverage: raw.osm_coverage ?? null,
    osmElementCount: num(raw.osm_element_count),
    coverageCaveat: raw.coverage_caveat ?? '',
  };
}

export function adaptValidity(raw: Record<string, any> | null | undefined): ValidityDetail | null {
  const verdict = verdictOrUndefined(raw?.verdict);
  if (!raw || !verdict) return null;
  return {
    verdict,
    pReal: raw.p_real ?? 0,
    confidencePct: raw.confidence_pct ?? Math.round((raw.p_real ?? 0) * 100),
    concerns: raw.concerns ?? [],
    reasoningSteps: (raw.reasoning_steps ?? []).map(adaptReasoningStep),
    modelVersion: raw.model_version ?? '',
    interpretation: raw.interpretation ?? '',
  };
}

export function adaptPrediction(raw: Record<string, any> | null): PredictionDetail | null {
  if (!raw) return null;
  return {
    prediction: (raw.prediction ?? 'unknown') as FireClassId,
    label: raw.label ?? 'Unknown Anomaly',
    confidencePct: raw.confidence_pct ?? 0,
    probabilities: (raw.probabilities ?? {}) as Record<FireClassId, number>,
    severity: raw.severity ?? 'MEDIUM',
    modelVersion: raw.model_version ?? '',
    modelKind: raw.model_kind ?? '',
    dataQuality: raw.data_quality ?? 1,
    reasoningSteps: (raw.reasoning_steps ?? []).map(adaptReasoningStep),
    suggestedAction: raw.suggested_action ?? '',
    interpretation: raw.interpretation ?? '',
  };
}

export function adaptImpact(raw: Record<string, any> | null): ImpactDetail | null {
  if (!raw) return null;
  return {
    riskLevel: raw.risk_level ?? 'MODERATE',
    coreRadiusM: num(raw.core_radius_m),
    downwindLengthM: num(raw.downwind_length_m),
    windSpeedMs: num(raw.wind_speed_ms),
    windDirectionDeg: num(raw.wind_direction_deg),
    plumeBearingDeg: num(raw.plume_bearing_deg),
    exposed: raw.exposed ?? {},
    exposureCount: raw.exposure_count ?? 0,
    potentialPollutants: raw.potential_pollutants ?? [],
    pollutantCaveat: raw.pollutant_caveat ?? '',
    riskZones: raw.risk_zones ?? null,
    notes: raw.notes ?? [],
  };
}

export function adaptAnalysis(raw: ApiAnalysis): FireAnalysis {
  return {
    validity: adaptValidity(raw.prediction?.validity),
    weather: adaptWeather(raw.weather),
    surroundings: adaptSurroundings(raw.surroundings),
    prediction: adaptPrediction(raw.prediction),
    impact: adaptImpact(raw.impact),
  };
}
