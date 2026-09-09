export type IncidentMarkerType =
  | 'historical'
  | 'resolved'
  | 'ai_anomaly'
  | 'verified_high_risk'
  | 'confirmed_critical';

export interface HistoricalEvent {
  id: string;
  name: string;
  country: string;
  cityRegion: string;
  lat: number;
  lng: number;
  date: string;
  eventType: string;
  severityContext: string;
  shortSummary: string;
  details: string;
  impact: string;
  status: string;
  source: string;
  markerType: IncidentMarkerType;
}
