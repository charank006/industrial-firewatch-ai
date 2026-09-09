export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type EventClassification =
  | 'Persistent Thermal Source'
  | 'Industrial Fire'
  | 'Routine Flare'
  | 'Gas/Oil Flare'
  | 'Forest Fire'
  | 'Agricultural Burning'
  | 'Urban/Other'
  | 'Unknown Anomaly'
  | 'industrial_fire'
  | 'gas_oil_flare'
  | 'forest_fire'
  | 'agricultural_burning'
  | 'urban_other'
  | 'unknown';

export type FacilityType =
  | 'Refinery'
  | 'Power Plant'
  | 'Chemical Complex'
  | 'LNG Terminal'
  | 'Fertilizer Plant'
  | 'Metal Smelter';

export type FacilityStatus = 'NORMAL' | 'ELEVATED' | 'ANOMALY_DETECTED';

export type LandCoverCategory = 'Built-up Industrial' | 'Dense Forest' | 'Cropland' | 'Water Body' | 'Scrubland';

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
  confidence: number;
  timestamp: string;
  timeFormatted: string;
  dayNight: 'D' | 'N';
  landCover: LandCoverCategory;
  facilityDistanceKm: number;
  nearestFacilityId: string;
  nearestFacilityName: string;
  classification: EventClassification;
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


export interface IndustrialFacility {
  id: string;
  name: string;
  type: FacilityType;
  lat: number;
  lng: number;
  location: string;
  status: FacilityStatus;
  baselineFRP: number; // MW
  currentFRP: number;  // MW
  lastDetected: string;
  totalEventsPast90Days: number;
  emergencyContact: string;
  riskBufferRadiusKm: number;
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

