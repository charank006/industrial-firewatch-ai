export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type EventClassification =
  | 'Persistent Thermal Source'
  | 'Industrial Fire'
  | 'Routine Flare'
  | 'Gas/Oil Flare'
  | 'Forest Fire'
  | 'Agricultural Burning'
  | 'Gas/Oil'
  | 'Urban'
  | 'Urban/Other'
  | 'Unknown Anomaly'
  | 'industrial_fire'
  | 'gas_oil_flare'
  | 'forest_fire'
  | 'agricultural_burning'
  | 'urban_other'
  | 'unknown';


export type FacilityStatus = 'NORMAL' | 'ELEVATED' | 'ANOMALY_DETECTED';

export type LandCoverCategory =
  | 'Built-up Industrial'
  | 'Dense Forest'
  | 'Cropland'
  | 'Water Body'
  | 'Scrubland'
  // Emitted when no OSM land-use class covers >20% of the 1km disc.
  // Guessing a real category here would print a lie on the dashboard.
  | 'Unclassified';

export interface ReasoningStep {
  stepIndex: number;
  label: string;
  detail: string;
  status: 'passed' | 'warning' | 'critical' | 'neutral';
}

export interface ThermalHotspot {
  id: string;
  lat: number;
  lng: number;
  frpMw: number;
  brightnessK: number;
  /** Classification confidence 0-100 (how sure the engine is of the class). */
  confidence: number;
  /** NASA FIRMS detection confidence 0-100. Normalised from VIIRS l|n|h or MODIS 0-100. */
  detectionConfidence?: number;
  timestamp: string;
  timeFormatted: string;
  dayNight: 'D' | 'N';
  landCover: LandCoverCategory;
  facilityDistanceKm: number;
  nearestFacilityId: string;
  nearestFacilityName: string;
  classification: EventClassification;
  /**
   * Detection validity, kept deliberately apart from `classification`.
   * `classification` answers "what kind of fire"; this answers the prior
   * question "is this a fire at all". Undefined until the analysis job has
   * reached the event.
   */
  validityVerdict?: ValidityDetail['verdict'];
  validityConfidencePct?: number;
  severity: SeverityLevel;
  historicalOccurrenceCount: number;
  firstSeenDate: string;
  reasoningSteps: ReasoningStep[];
  suggestedAction: string;
  locationName: string;
  isNew: boolean;
  persistenceStatus?: 'PERSISTENT' | 'NON_PERSISTENT';
  persistenceActiveDays?: number;
  predictedProbability?: number;
  classProbabilities?: Record<string, number>;
  modelVersion?: string;
  topFeatures?: Array<{ feature: string; value: number; model_importance_gain: number }>;
  riskScore?: number;
  nearestFacilityType?: string;
  sensorConfidenceRate?: number;
  mlConfidenceRate?: number;
  observationCount?: number;
  nearbyEventsCount?: number;
  baselineFrp?: number;
  frpTimeline?: Array<{ time: string; frp: number; baseline: number }>;
}

/**
 * An industrial site as OpenStreetMap maps it, discovered within 1 km of a
 * detected fire.
 */
export interface IndustrialFacility {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  location: string;
  status: FacilityStatus;
  baselineFRP?: number;
  currentFRP: number;
  lastDetected: string;
  eventCount?: number;
  fireEventIds?: string[];
  totalEventsPast90Days?: number;
  named?: boolean;
  nearestDistanceM?: number | null;
  emergencyContact?: string;
  riskBufferRadiusKm?: number;
}

export interface AlertItem {
  id: string;
  hotspotId: string;
  incidentId?: string;
  title: string;
  message?: string;
  severity: SeverityLevel;
  facilityName: string;
  timestamp: string;
  timestampFormatted?: string;
  locationName: string;
  frpMw: number;
  isUnresolved: boolean;
}

export interface GISLayerVisibility {
  thermalVIIRS: boolean;
  frpIntensity: boolean;
  industrialFacilities: boolean;
  landCover: boolean;
  riskZones: boolean;
  administrativeBounds: boolean;
}

export type MapMode = 'satellite' | 'dark' | 'terrain' | 'street';

export interface FilterState {
  region: string;
  eventType: string;
  severity: string;
  dateRange: '24h' | '7d' | '30d' | '180d';
  minFRP: number;
  landCover: string;
  searchKeyword: string;
}

export interface SituationMetrics {
  totalDetected: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  avgFrp: number;
  eventMix: Partial<Record<EventClassification, number>>;
  latestHotspot?: ThermalHotspot;
}

// --- Pipeline detail types (Phase 5/6) -----------------------------------
// These describe data the backend pipeline produces. They are additive: no
// existing type or component changes shape.

export type FireClassId =
  | 'industrial'
  | 'flare'
  | 'forest'
  | 'agriculture'
  | 'gas_oil'
  | 'urban'
  | 'unknown';

export interface WeatherDetail {
  localHour: string | null;
  timezone: string | null;
  currentTemperatureC: number | null;
  currentHumidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  vpdKpa: number | null;
  baselineTemperatureC: number | null;
  baselineHumidityPct: number | null;
  baselineSamples: number;
  baselineDaysRequested: number;
  /** 'ok' | 'partial' | 'insufficient' */
  baselineQuality: string;
  temperatureAnomalyC: number | null;
  temperatureAnomalyZ: number | null;
  temperatureTrendCPerDay: number | null;
  humidityAnomalyPct: number | null;
  windChangeMs: number | null;
  vpdAnomalyKpa: number | null;
  precipitation24hMm: number | null;
  precipitation72hMm: number | null;
  dryHours: number | null;
  interpretation: string;
}

export interface EmergencyFacility {
  kind: 'hospital' | 'school' | 'fire_station';
  name: string;
  amenity: string;
  distanceM: number | null;
}

export interface SurroundingsDetail {
  radiusM: number;
  industrialAreaKm2: number | null;
  forestAreaKm2: number | null;
  farmlandAreaKm2: number | null;
  residentialAreaKm2: number | null;
  waterAreaKm2: number | null;
  factoriesWithin1km: number | null;
  gasFacilitiesWithin1km: number | null;
  powerInfraWithin1km: number | null;
  buildingCount: number | null;
  hospitals: number | null;
  schools: number | null;
  fireStations: number | null;
  /** The named facilities behind those counts, nearest first. */
  emergencyFacilities: EmergencyFacility[];
  roadLengthKm: number | null;
  nearestFactoryM: number | null;
  nearestGasFacilityM: number | null;
  nearestResidentialM: number | null;
  insideIndustrial: boolean;
  landCover: string | null;
  /** 'ok' | 'sparse' | 'unavailable' */
  osmCoverage: string | null;
  osmElementCount: number | null;
  coverageCaveat: string;
}

export interface PredictionDetail {
  prediction: FireClassId;
  label: string;
  confidencePct: number;
  probabilities: Record<FireClassId, number>;
  severity: SeverityLevel;
  modelVersion: string;
  modelKind: string;
  dataQuality: number;
  reasoningSteps: ReasoningStep[];
  suggestedAction: string;
  interpretation: string;
}

export interface ImpactDetail {
  riskLevel: string;
  coreRadiusM: number | null;
  downwindLengthM: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  plumeBearingDeg: number | null;
  exposed: Record<string, number>;
  exposureCount: number;
  potentialPollutants: string[];
  pollutantCaveat: string;
  riskZones: unknown;
  notes: string[];
}

export interface FireAnalysis {
  validity: ValidityDetail | null;
  weather: WeatherDetail | null;
  surroundings: SurroundingsDetail | null;
  prediction: PredictionDetail | null;
  impact: ImpactDetail | null;
}

/**
 * Detection validity — a SEPARATE verdict from source class.
 * "Is this a fire at all?" vs "what kind of fire is it?"
 */
export interface ValidityDetail {
  verdict: 'REAL_FIRE' | 'UNCERTAIN' | 'LIKELY_FALSE_ALARM';
  pReal: number;
  confidencePct: number;
  concerns: string[];
  reasoningSteps: ReasoningStep[];
  modelVersion: string;
  interpretation: string;
}

export interface FIRMSSyncStatus {
  is_configured: boolean;
  map_key_masked: string;
  supported_sensors: string[];
  predefined_areas: string[];
  total_events_in_db: number;
  total_observations_in_db: number;
  scheduler?: {
    running: boolean;
    poll_interval_seconds: number;
    area: string;
    sources: string[];
    days_lookback: number;
    is_key_configured: boolean;
    last_sync_time: string | null;
    last_sync_count: number;
    last_error: string | null;
  };
}

export interface FIRMSSyncOptions {
  map_key?: string;
  sources?: string[];
  area?: string;
  days?: number;
  clear_existing?: boolean;
}
