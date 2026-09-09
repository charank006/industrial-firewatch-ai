import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MOCK_ALERTS } from '../data/mockAlerts';
import { MOCK_FACILITIES } from '../data/mockFacilities';
import { MOCK_HOTSPOTS } from '../data/mockHotspots';
import { normalizeClassification } from '../utils/classification';
import type {
  AlertItem,
  EventClassification,
  FilterState,
  FIRMSSyncOptions,
  FIRMSSyncStatus,
  GISLayerVisibility,
  IndustrialFacility,
  MapMode,
  SeverityLevel,
  SituationMetrics,
  ThermalHotspot,
} from '../types';

interface IntelligenceContextType {
  // Data
  hotspots: ThermalHotspot[];
  filteredHotspots: ThermalHotspot[];
  facilities: IndustrialFacility[];
  alerts: AlertItem[];

  // Selections
  selectedIncident: ThermalHotspot | null;
  selectedFacility: IndustrialFacility | null;
  isDrawerOpen: boolean;

  // NASA FIRMS Live Sync
  firmsStatus: FIRMSSyncStatus | null;
  isSyncingFirms: boolean;
  isFirmsModalOpen: boolean;
  setIsFirmsModalOpen: (open: boolean) => void;
  syncNASAData: (options?: FIRMSSyncOptions) => Promise<any>;
  refreshEvents: () => Promise<void>;

  // Global Filters & Map
  filters: FilterState;
  layers: GISLayerVisibility;
  mapMode: MapMode;
  timelineIndex: number;

  // Calculated Metrics
  metrics: SituationMetrics;

  // Actions
  setSelectedIncident: (incident: ThermalHotspot | null) => void;
  setSelectedFacility: (facility: IndustrialFacility | null) => void;
  selectIncidentById: (id: string) => void;
  selectFacilityById: (id: string) => void;
  setIsDrawerOpen: (open: boolean) => void;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setLayers: React.Dispatch<React.SetStateAction<GISLayerVisibility>>;
  toggleLayer: (layerKey: keyof GISLayerVisibility) => void;
  resolveAlert: (alertId: string) => void;
  setMapMode: (mode: MapMode) => void;
  setTimelineIndex: React.Dispatch<React.SetStateAction<number>>;
  resetFilters: () => void;
}

const initialLayers: GISLayerVisibility = {
  thermalVIIRS: true,
  frpIntensity: true,
  industrialFacilities: true,
  landCover: true,
  riskZones: true,
  administrativeBounds: true,
};

const initialFilters: FilterState = {
  region: 'ALL',
  eventType: 'ALL',
  severity: 'ALL',
  dateRange: '24h',
  minFRP: 0,
  landCover: 'ALL',
  searchKeyword: '',
};

const IntelligenceContext = createContext<IntelligenceContextType | undefined>(undefined);

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const generateEventTimeline = (
  id: string,
  _classification: string,
  maxFrp: number,
  baselineFrp: number,
  isPersistent: boolean,
  timestampStr?: string
): Array<{ time: string; frp: number; baseline: number }> => {
  const timeline: Array<{ time: string; frp: number; baseline: number }> = [];
  const baseDate = timestampStr ? new Date(timestampStr) : new Date();

  for (let i = 5; i >= 1; i--) {
    const d = new Date(baseDate.getTime() - i * 86400000);
    const timeLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
    let histFrp: number;
    if (isPersistent) {
      const variance = ((Math.abs(hashString(id + i)) % 25) - 12) / 100;
      histFrp = Number(Math.max(0.2, baselineFrp * (1 + variance)).toFixed(1));
    } else {
      const variance = ((Math.abs(hashString(id + i)) % 20) - 10) / 100;
      histFrp = Number(Math.max(0.1, baselineFrp * (1 + variance)).toFixed(2));
    }
    timeline.push({
      time: timeLabel,
      frp: histFrp,
      baseline: baselineFrp,
    });
  }

  const detTimeLabel = `${baseDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} ${baseDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  timeline.push({
    time: detTimeLabel,
    frp: Number(maxFrp.toFixed(1)),
    baseline: baselineFrp,
  });

  return timeline;
};

const mapBackendEventToHotspot = (ev: any): ThermalHotspot => {
  const isPers = ev.persistence_status === 'PERSISTENT' || ev.classification === 'Persistent Thermal Source';
  const cls = normalizeClassification(ev.classification);
  const rawFrp = ev.max_frp ?? ev.frp_mw ?? ev.frp ?? 25.0;
  const frpMw = typeof rawFrp === 'number' ? Number(rawFrp.toFixed(1)) : parseFloat(rawFrp);
  const prob = typeof ev.predicted_probability === 'number' ? ev.predicted_probability : 0.85;
  const facDist = typeof ev.facility_distance_km === 'number' ? ev.facility_distance_km : (isPers ? 0.4 : 2.4);
  const facName = ev.nearest_facility_name || (isPers ? 'Industrial Thermal Asset' : 'Regional Agro-Industrial Area');
  const facType = ev.nearest_facility_type || (isPers ? 'Industrial Asset' : 'Regional Buffer Area');
  const sensorConf = typeof ev.sensor_confidence === 'number' ? ev.sensor_confidence : (typeof ev.confidence === 'number' ? ev.confidence : 85);
  const mlConf = typeof ev.ml_confidence === 'number' ? ev.ml_confidence : Math.round(prob * 100);
  const brightness = typeof ev.brightness_k === 'number' ? Number(ev.brightness_k.toFixed(1)) : (typeof ev.brightness === 'number' ? Number(ev.brightness.toFixed(1)) : 332.0);
  const riskScore = typeof ev.risk_score === 'number' ? ev.risk_score : (isPers ? 28 : Math.min(100, Math.max(10, Math.round(frpMw * 1.5 + (facDist <= 2.5 ? 20 : 5)))));

  // Severity derivation
  const rawSev = (ev.severity || '').toUpperCase();
  let severity: SeverityLevel = 'LOW';
  if (rawSev === 'CRITICAL' || rawSev === 'HIGH' || rawSev === 'MEDIUM' || rawSev === 'LOW') {
    severity = rawSev as SeverityLevel;
  } else if (frpMw >= 100 || (facDist <= 1.0 && frpMw >= 50)) {
    severity = 'CRITICAL';
  } else if (frpMw >= 30) {
    severity = 'HIGH';
  } else if (frpMw >= 10) {
    severity = 'MEDIUM';
  } else {
    severity = 'LOW';
  }

  // Baseline FRP
  let baselineFrp = typeof ev.baseline_frp === 'number' ? ev.baseline_frp : 1.5;
  if (typeof ev.baseline_frp !== 'number') {
    const clsLower = cls.toLowerCase();
    if (clsLower.includes('industrial') || clsLower.includes('flare') || isPers) {
      baselineFrp = 15.0;
    } else if (clsLower.includes('forest')) {
      baselineFrp = 0.5;
    } else if (clsLower.includes('agricultural')) {
      baselineFrp = 1.0;
    } else {
      baselineFrp = 1.5;
    }
  }

  // Historical FRP Timeline
  const frpTimeline = Array.isArray(ev.frp_timeline) && ev.frp_timeline.length > 0
    ? ev.frp_timeline
    : generateEventTimeline(ev.id, cls, frpMw, baselineFrp, isPers, ev.last_seen || ev.first_seen);

  return {
    id: ev.id,
    lat: ev.lat ?? ev.latitude,
    lng: ev.lng ?? ev.longitude,
    frpMw: frpMw,
    baselineFrp: baselineFrp,
    frpTimeline: frpTimeline,
    brightnessK: brightness,
    confidence: sensorConf,
    timestamp: ev.last_seen || ev.first_seen || new Date().toISOString(),
    timeFormatted: ev.last_seen ? new Date(ev.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00',
    dayNight: 'D',
    landCover: isPers ? 'Built-up Industrial' : (cls === 'Forest Fire' ? 'Dense Forest' : (cls === 'Agricultural Burning' ? 'Cropland' : 'Built-up Industrial')),
    facilityDistanceKm: facDist,
    nearestFacilityId: 'FAC-IND-001',
    nearestFacilityName: facName,
    nearestFacilityType: facType,
    classification: cls,
    severity: severity,
    historicalOccurrenceCount: ev.active_days || 1,
    observationCount: ev.observation_count || 1,
    firstSeenDate: ev.first_seen || new Date().toISOString(),
    riskScore: riskScore,
    sensorConfidenceRate: sensorConf,
    mlConfidenceRate: mlConf,
    suggestedAction: isPers
      ? '7-Day Persistent Industrial Source: Regular emissions monitoring (ML bypassed).'
      : (severity === 'CRITICAL'
        ? `CRITICAL ALERT (${riskScore}/100): Thermal spike ${frpMw} MW near ${facName} (${facDist} km). Dispatch local emergency squad.`
        : severity === 'HIGH'
        ? `HIGH PRIORITY: Rapid expansion of ${cls} (${frpMw} MW) ${facDist} km from ${facName}. Notify regional control.`
        : `ACTIVE MONITORING: ${cls} detected (${frpMw} MW). Sensor confidence ${sensorConf}%, ML confidence ${mlConf}%.`),
    locationName: `Lat ${(ev.latitude ?? ev.lat ?? 0).toFixed(3)}, Lon ${(ev.longitude ?? ev.lng ?? 0).toFixed(3)}`,
    isNew: false,
    persistenceStatus: isPers ? 'PERSISTENT' : 'NON_PERSISTENT',
    persistenceActiveDays: ev.active_days || 0,
    predictedProbability: prob,
    classProbabilities: ev.class_probabilities,
    topFeatures: ev.top_features,
    modelVersion: ev.model_version || 'geoflare_lightgbm_v1.0',
    reasoningSteps: [
      {
        stepIndex: 1,
        label: '7-Day Spatial Persistence Pre-Filter',
        detail: isPers
          ? `Detected active ${ev.active_days || 5}/7 days within 500m -> 'Persistent Thermal Source' (ML Bypassed)`
          : `Active ${ev.active_days || 0}/7 days within 500m -> Non-persistent (Evaluated by LightGBM)`,
        status: isPers ? 'passed' : 'neutral',
      },
      {
        stepIndex: 2,
        label: 'LightGBM Multi-Class Model',
        detail: isPers
          ? 'Bypassed by design to eliminate routine industrial false alarms'
          : `Classified as '${cls}' with ${mlConf}% prediction confidence`,
        status: isPers ? 'neutral' : 'passed',
      },
      {
        stepIndex: 3,
        label: 'Facility Proximity & Risk Assessment',
        detail: `Nearest facility: ${facName} (${facDist} km). Risk Score: ${riskScore}/100 (${severity} Priority).`,
        status: severity === 'CRITICAL' || severity === 'HIGH' ? 'critical' : 'passed',
      },
    ],
  };
};

export const IntelligenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hotspots, setHotspots] = useState<ThermalHotspot[]>(MOCK_HOTSPOTS);
  const [facilities] = useState<IndustrialFacility[]>(MOCK_FACILITIES);
  const [alerts, setAlerts] = useState<AlertItem[]>(MOCK_ALERTS);

  const [selectedIncident, setSelectedIncident] = useState<ThermalHotspot | null>(MOCK_HOTSPOTS[0]);
  const [selectedFacility, setSelectedFacility] = useState<IndustrialFacility | null>(MOCK_FACILITIES[0]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);

  // NASA FIRMS Live Sync States
  const [firmsStatus, setFirmsStatus] = useState<FIRMSSyncStatus | null>(null);
  const [isSyncingFirms, setIsSyncingFirms] = useState<boolean>(false);
  const [isFirmsModalOpen, setIsFirmsModalOpen] = useState<boolean>(false);

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [layers, setLayers] = useState<GISLayerVisibility>(initialLayers);
  const [mapMode, setMapMode] = useState<MapMode>('dark');
  const [timelineIndex, setTimelineIndex] = useState<number>(MOCK_HOTSPOTS.length - 1);

  // Fetch Live Status & Events
  const fetchFirmsStatus = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/firms/status');
      if (res.ok) {
        const data = await res.json();
        setFirmsStatus(data);
      }
    } catch {}
  };

  const refreshEvents = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/events');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(mapBackendEventToHotspot);
          setHotspots(mapped);
          setSelectedIncident(mapped[0]);
        }
      }
    } catch {}
  };

  const syncNASAData = async (options?: FIRMSSyncOptions) => {
    setIsSyncingFirms(true);
    try {
      const res = await fetch('http://localhost:8000/api/firms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {
          sources: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'],
          area: 'IND',
          days: 1,
          clear_existing: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Failed to sync with NASA FIRMS' }));
        throw new Error(errData.detail || 'Failed to sync with NASA FIRMS');
      }

      const syncResult = await res.json();
      await refreshEvents();
      await fetchFirmsStatus();
      return syncResult;
    } finally {
      setIsSyncingFirms(false);
    }
  };

  // Live Backend Fetch & WebSocket Connection with Auto-Retry & Polling
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    const loadData = async () => {
      await refreshEvents();
      await fetchFirmsStatus();
    };

    loadData();

    // Auto-poll every 30 seconds for background telemetry updates
    pollInterval = setInterval(loadData, 30000);

    // WebSocket subscription for instant telemetry push
    try {
      ws = new WebSocket('ws://localhost:8000/ws/events');
      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.type === 'THERMAL_EVENT_UPDATE' && raw.data) {
            const newHotspot = mapBackendEventToHotspot(raw.data);
            setHotspots((prev) => {
              const existingIdx = prev.findIndex((h) => h.id === newHotspot.id);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = newHotspot;
                return updated;
              }
              return [newHotspot, ...prev];
            });
          } else if (raw.type === 'BATCH_SYNC_COMPLETE') {
            loadData();
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, []);

  // Dynamic Filtering Logic
  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      // Classification matching (robust against snake_case / Title Case)
      if (filters.eventType !== 'ALL') {
        const targetCls = normalizeClassification(filters.eventType);
        const eventCls = normalizeClassification(h.classification);
        if (targetCls !== eventCls) return false;
      }

      // Severity matching: HIGH includes both HIGH and CRITICAL high-risk categories
      if (filters.severity !== 'ALL') {
        if (filters.severity === 'HIGH') {
          if (h.severity !== 'HIGH' && h.severity !== 'CRITICAL') return false;
        } else if (filters.severity === 'CRITICAL') {
          if (h.severity !== 'CRITICAL') return false;
        } else if (h.severity !== filters.severity) {
          return false;
        }
      }

      if (h.frpMw < filters.minFRP) return false;
      if (filters.landCover !== 'ALL' && h.landCover !== filters.landCover) return false;

      if (filters.searchKeyword.trim() !== '') {
        const kw = filters.searchKeyword.toLowerCase();
        const matchName = h.id.toLowerCase().includes(kw) ||
                          h.locationName.toLowerCase().includes(kw) ||
                          h.nearestFacilityName.toLowerCase().includes(kw) ||
                          h.classification.toLowerCase().includes(kw);
        if (!matchName) return false;
      }
      return true;
    });
  }, [hotspots, filters]);

  // Dynamically Compute Metrics from Total Dataset
  const metrics = useMemo<SituationMetrics>(() => {
    const totalDetected = hotspots.length;
    const highPriorityCount = hotspots.filter((h) => h.severity === 'HIGH' || h.severity === 'CRITICAL').length;
    const mediumPriorityCount = hotspots.filter((h) => h.severity === 'MEDIUM').length;
    const lowPriorityCount = hotspots.filter((h) => h.severity === 'LOW').length;
    const sumFrp = hotspots.reduce((acc, h) => acc + h.frpMw, 0);
    const avgFrp = totalDetected > 0 ? Math.round((sumFrp / totalDetected) * 10) / 10 : 0;

    const eventMix: Partial<Record<EventClassification, number>> = {
      'Persistent Thermal Source': 0,
      'Industrial Fire': 0,
      'Routine Flare': 0,
      'Forest Fire': 0,
      'Agricultural Burning': 0,
      'Unknown Anomaly': 0,
    };

    hotspots.forEach((h) => {
      const norm = normalizeClassification(h.classification);
      const current = eventMix[norm] || 0;
      eventMix[norm] = current + 1;
    });

    const latestHotspot = hotspots.length > 0 ? hotspots[0] : undefined;

    return {
      totalDetected,
      highPriorityCount,
      mediumPriorityCount,
      lowPriorityCount,
      avgFrp,
      eventMix,
      latestHotspot,
    };
  }, [hotspots]);

  const selectIncidentById = (id: string) => {
    const found = hotspots.find((h) => h.id === id);
    if (found) {
      setSelectedIncident(found);
      setIsDrawerOpen(true);
      const fac = facilities.find((f) => f.id === found.nearestFacilityId);
      if (fac) setSelectedFacility(fac);
    }
  };

  const selectFacilityById = (id: string) => {
    const found = facilities.find((f) => f.id === id);
    if (found) {
      setSelectedFacility(found);
    }
  };

  const toggleLayer = (layerKey: keyof GISLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  const resolveAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, isUnresolved: false } : a))
    );
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  return (
    <IntelligenceContext.Provider
      value={{
        hotspots,
        filteredHotspots,
        facilities,
        alerts,
        selectedIncident,
        selectedFacility,
        isDrawerOpen,
        filters,
        layers,
        mapMode,
        timelineIndex,
        metrics,
        firmsStatus,
        isSyncingFirms,
        isFirmsModalOpen,
        setIsFirmsModalOpen,
        syncNASAData,
        refreshEvents,
        setSelectedIncident,
        setSelectedFacility,
        selectIncidentById,
        selectFacilityById,
        setIsDrawerOpen,
        setFilters,
        setLayers,
        toggleLayer,
        resolveAlert,
        setMapMode,
        setTimelineIndex,
        resetFilters,
      }}
    >
      {children}
    </IntelligenceContext.Provider>
  );
};

export const useIntelligence = () => {
  const context = useContext(IntelligenceContext);
  if (!context) {
    throw new Error('useIntelligence must be used within an IntelligenceProvider');
  }
  return context;
};
