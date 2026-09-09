import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MOCK_ALERTS } from '../data/mockAlerts';
import { MOCK_FACILITIES } from '../data/mockFacilities';
import { MOCK_HOTSPOTS } from '../data/mockHotspots';
import { DATA_SOURCE, fetchFacilities, fetchFireAnalysis, fetchFires } from '../services/api';
import {
  adaptAnalysis,
  adaptFacility,
  adaptFireEvent,
  dateRangeToSince,
  regionToBbox,
} from '../services/adapters';
import type {
  AlertItem,
  EventClassification,
  FireAnalysis,
  FilterState,
  GISLayerVisibility,
  IndustrialFacility,
  MapMode,
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

  // Global Filters & Map
  filters: FilterState;
  layers: GISLayerVisibility;
  mapMode: MapMode;
  timelineIndex: number;

  // Calculated Metrics
  metrics: SituationMetrics;

  // Data source state. In `mock` mode these are always false/null, so every
  // existing page behaves exactly as it did before.
  dataSource: 'mock' | 'api';
  isLoading: boolean;
  error: string | null;
  historyDays: number | null;
  refresh: () => void;

  /** Weather, surroundings, prediction and impact for `selectedIncident`. */
  analysis: FireAnalysis | null;
  isAnalysisLoading: boolean;

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
  region: 'India',
  eventType: 'ALL',
  severity: 'ALL',
  // 24h was hiding most of the pipeline's own data. Polar-orbiting satellites
  // only pass over the AOI twice a day and FIRMS publishes ~2h later, so after
  // a quiet night a 24h window from "now" can exclude nearly everything
  // ingested — 12 of 51 events, in the case that surfaced this. 7d matches
  // what the system actually holds.
  dateRange: '7d',
  minFRP: 0,
  landCover: 'ALL',
  searchKeyword: '',
};

const IntelligenceContext = createContext<IntelligenceContextType | undefined>(undefined);

export const IntelligenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isApi = DATA_SOURCE === 'api';

  // In mock mode these seed exactly as before, so the app renders identically
  // on the first frame with no loading state anywhere.
  const [hotspots, setHotspots] = useState<ThermalHotspot[]>(isApi ? [] : MOCK_HOTSPOTS);
  const [facilities, setFacilities] = useState<IndustrialFacility[]>(isApi ? [] : MOCK_FACILITIES);
  const [alerts, setAlerts] = useState<AlertItem[]>(MOCK_ALERTS);

  const [isLoading, setIsLoading] = useState<boolean>(isApi);
  const [error, setError] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [analysis, setAnalysis] = useState<FireAnalysis | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<ThermalHotspot | null>(
    isApi ? null : MOCK_HOTSPOTS[0],
  );
  const [selectedFacility, setSelectedFacility] = useState<IndustrialFacility | null>(
    isApi ? null : MOCK_FACILITIES[0],
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [layers, setLayers] = useState<GISLayerVisibility>(initialLayers);
  // Satellite imagery by default: on a dark canvas a fire marker sits on
  // empty grey, and the whole question an operator is asking - what is
  // actually on the ground here - is answered by the imagery. The Dark
  // Canvas toggle remains for reading labels and risk-zone geometry.
  const [mapMode, setMapMode] = useState<MapMode>('satellite');
  // Math.max guards the empty first render in api mode, where
  // `hotspots.length - 1` would otherwise be -1.
  const [timelineIndex, setTimelineIndex] = useState<number>(Math.max(0, hotspots.length - 1));

  const refresh = () => setReloadToken((n) => n + 1);

  // Region and dateRange are wired into the query here. Both controls have
  // existed in the UI since the beginning and drove nothing at all.
  const { region, dateRange } = filters;

  useEffect(() => {
    if (!isApi) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [firesResponse, facilitiesResponse] = await Promise.all([
          fetchFires({ bbox: regionToBbox(region), since: dateRangeToSince(dateRange) }),
          fetchFacilities(),
        ]);
        if (cancelled) return;

        const adaptedHotspots = firesResponse.fires.map(adaptFireEvent);
        const adaptedFacilities = facilitiesResponse.facilities.map(adaptFacility);

        setHotspots(adaptedHotspots);
        setFacilities(adaptedFacilities);
        setHistoryDays(firesResponse.history_days);
        setTimelineIndex(Math.max(0, adaptedHotspots.length - 1));
        setSelectedIncident((current) => current ?? adaptedHotspots[0] ?? null);
        setSelectedFacility((current) => current ?? adaptedFacilities[0] ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isApi, region, dateRange, reloadToken]);

  // One round trip per selected incident: /api/fires/{id}/analysis returns
  // weather, surroundings, prediction and impact together.
  const selectedIncidentId = selectedIncident?.id ?? null;

  useEffect(() => {
    if (!isApi || !selectedIncidentId) {
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setIsAnalysisLoading(true);

    fetchFireAnalysis(selectedIncidentId)
      .then((payload) => {
        if (!cancelled) setAnalysis(adaptAnalysis(payload));
      })
      .catch(() => {
        // A missing analysis is an expected state (the event may not have been
        // enriched yet), so the panels simply do not render.
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setIsAnalysisLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isApi, selectedIncidentId]);

  // Dynamic Filtering Logic
  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (filters.eventType !== 'ALL' && h.classification !== filters.eventType) return false;
      if (filters.severity !== 'ALL' && h.severity !== filters.severity) return false;
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

  // Dynamically Compute Metrics from Filtered Dataset
  const metrics = useMemo<SituationMetrics>(() => {
    const totalDetected = filteredHotspots.length;
    const highPriorityCount = filteredHotspots.filter((h) => h.severity === 'HIGH' || h.severity === 'CRITICAL').length;
    const mediumPriorityCount = filteredHotspots.filter((h) => h.severity === 'MEDIUM').length;
    const lowPriorityCount = filteredHotspots.filter((h) => h.severity === 'LOW').length;
    const sumFrp = filteredHotspots.reduce((acc, h) => acc + h.frpMw, 0);
    const avgFrp = totalDetected > 0 ? Math.round((sumFrp / totalDetected) * 10) / 10 : 0;

    const eventMix: Record<EventClassification, number> = {
      'Industrial Fire': 0,
      'Routine Flare': 0,
      'Forest Fire': 0,
      'Agricultural Burning': 0,
      'Gas/Oil': 0,
      'Urban': 0,
      'Mining / Extraction': 0,
      'Unknown Anomaly': 0,
    };

    filteredHotspots.forEach((h) => {
      if (eventMix[h.classification] !== undefined) {
        eventMix[h.classification]++;
      }
    });

    // Genuinely the most recent, not simply the first array element. Position
    // happened to equal recency in the hand-ordered mocks; it does not once
    // the API returns rows in any other order.
    const latestHotspot = filteredHotspots.reduce<ThermalHotspot | undefined>(
      (latest, h) =>
        !latest || new Date(h.timestamp).getTime() > new Date(latest.timestamp).getTime() ? h : latest,
      undefined,
    );

    return {
      totalDetected,
      highPriorityCount,
      mediumPriorityCount,
      lowPriorityCount,
      avgFrp,
      eventMix,
      latestHotspot,
    };
  }, [filteredHotspots]);

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
        dataSource: DATA_SOURCE,
        isLoading,
        error,
        historyDays,
        refresh,
        analysis,
        isAnalysisLoading,
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
