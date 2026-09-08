export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type EventClassification =
  | 'Industrial Fire'
  | 'Routine Flare'
  | 'Forest Fire'
  | 'Agricultural Burning'
  | 'Gas/Oil'
  | 'Urban'
  | 'Unknown Anomaly';

export type FacilityType =
  | 'Refinery'
  | 'Power Plant'
  | 'Chemical Complex'
  | 'LNG Terminal'
  | 'Fertilizer Plant'
  | 'Metal Smelter';

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
  severity: SeverityLevel;
  historicalOccurrenceCount: number;
  firstSeenDate: string;
  reasoningSteps: ReasoningStep[];
  suggestedAction: string;
  locationName: string;
  isNew: boolean;
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
  eventMix: Record<EventClassification, number>;
  latestHotspot?: ThermalHotspot;
}
