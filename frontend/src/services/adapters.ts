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

import type { ApiFacility, ApiFireEvent, ApiReasoningStep } from './api';
import type {
  EventClassification,
  FacilityStatus,
  FacilityType,
  IndustrialFacility,
  LandCoverCategory,
  ReasoningStep,
  SeverityLevel,
  ThermalHotspot,
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

const FACILITY_TYPES: readonly FacilityType[] = [
  'Refinery',
  'Power Plant',
  'Chemical Complex',
  'LNG Terminal',
  'Fertilizer Plant',
  'Metal Smelter',
];

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
    severity: oneOf(SEVERITY_VALUES, event.severity, 'MEDIUM'),
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
    type: oneOf(FACILITY_TYPES, facility.type, 'Chemical Complex'),
    lat: facility.latitude,
    lng: facility.longitude,
    location: facility.location,
    status: oneOf(FACILITY_STATUSES, facility.status, 'NORMAL'),
    baselineFRP: facility.baseline_frp,
    currentFRP: facility.current_frp,
    lastDetected: facility.last_detected ?? '',
    totalEventsPast90Days: facility.total_events_past_90_days,
    emergencyContact: facility.emergency_contact ?? '',
    riskBufferRadiusKm: facility.risk_buffer_radius_km,
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
  'Gujarat Industrial Corridor': '68.0,20.0,75.0,25.0',
  'Permian Petrochemical Zone': '-104.5,29.5,-100.5,33.5',
  'Rhine Industrial Belt': '5.8,49.0,9.5,52.0',
};

export function regionToBbox(region: string): string | undefined {
  return REGION_BBOX[region];
}
