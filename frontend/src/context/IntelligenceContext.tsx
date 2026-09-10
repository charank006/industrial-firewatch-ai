import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DATA_SOURCE,
  fetchFacilities,
  fetchFireAnalysis,
  fetchFires,
  fetchFirmsStatus as fetchFirmsStatusApi,
  syncFirmsData,
} from '../services/api';
import {
  adaptAnalysis,
  adaptFacility,
  adaptFireEvent,
  dateRangeToSince,
  regionToBbox,
} from '../services/adapters';
import { normalizeClassification } from '../utils/classification';
import type {
  AlertItem,
  EventClassification,
  FireAnalysis,
  FilterState,
  FIRMSSyncOptions,
  FIRMSSyncStatus,
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

  // NASA FIRMS Live Sync
  firmsStatus: FIRMSSyncStatus | null;
  isSyncingFirms: boolean;
  isFirmsModalOpen: boolean;
  setIsFirmsModalOpen: (open: boolean) => void;
  syncNASAData: (options?: FIRMSSyncOptions) => Promise<any>;
  refreshEvents: () => void | Promise<void>;

  // Global Filters & Map
  filters: FilterState;
  layers: GISLayerVisibility;
  mapMode: MapMode;
  timelineIndex: number;

  // Calculated Metrics
  metrics: SituationMetrics;

  // Data source & API state
  dataSource: 'mock' | 'api';
  isLoading: boolean;
  error: string | null;
  historyDays: number | null;
  analysis: FireAnalysis | null;
  isAnalysisLoading: boolean;
  refresh: () => void;

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
  dateRange: '7d',
  minFRP: 0,
  landCover: 'ALL',
  searchKeyword: '',
};

const IntelligenceContext = createContext<IntelligenceContextType | undefined>(undefined);



export const IntelligenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hotspots, setHotspots] = useState<ThermalHotspot[]>([]);
  const [facilities, setFacilities] = useState<IndustrialFacility[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [analysis, setAnalysis] = useState<FireAnalysis | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  const [selectedIncident, setSelectedIncident] = useState<ThermalHotspot | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<IndustrialFacility | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);

  // NASA FIRMS Live Sync States
  const [firmsStatus, setFirmsStatus] = useState<FIRMSSyncStatus | null>(null);
  const [isSyncingFirms, setIsSyncingFirms] = useState<boolean>(false);
  const [isFirmsModalOpen, setIsFirmsModalOpen] = useState<boolean>(false);

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [layers, setLayers] = useState<GISLayerVisibility>(initialLayers);
  const [mapMode, setMapMode] = useState<MapMode>('satellite');
  const [timelineIndex, setTimelineIndex] = useState<number>(0);

  const refresh = () => setReloadToken((n) => n + 1);
  const { region, dateRange } = filters;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        let firesResponse = await fetchFires({
          bbox: regionToBbox(region),
          since: dateRangeToSince(dateRange),
        });

        if (!firesResponse?.fires || firesResponse.fires.length === 0) {
          const allFiresResponse = await fetchFires({ since: dateRangeToSince(dateRange) }).catch(() => null);
          if (allFiresResponse?.fires && allFiresResponse.fires.length > 0) {
            firesResponse = allFiresResponse;
          }
        }

        const facilitiesResponse = await fetchFacilities().catch(() => ({ facilities: [] }));
        if (cancelled) return;

        const adaptedHotspots = (firesResponse?.fires || []).map(adaptFireEvent);
        const adaptedFacilities = (facilitiesResponse?.facilities || []).map(adaptFacility);

        setHotspots(adaptedHotspots);
        setFacilities(adaptedFacilities);
        setHistoryDays(firesResponse?.history_days ?? 10);
        setTimelineIndex(Math.max(0, adaptedHotspots.length - 1));

        // Dynamically derive live alerts directly from live fire events
        const criticalOrHigh = adaptedHotspots.filter(
          (h) => h.severity === 'CRITICAL' || h.severity === 'HIGH' || h.frpMw >= 10.0
        );
        const alertPool = criticalOrHigh.length > 0 ? criticalOrHigh : adaptedHotspots.slice(0, 15);
        const liveAlerts: AlertItem[] = alertPool.map((h, idx) => ({
          id: `ALERT-${h.id || idx}`,
          hotspotId: h.id,
          incidentId: h.id,
          title: `${h.severity} Alert: ${h.classification}`,
          message:
            h.suggestedAction ||
            `Thermal anomaly of ${h.frpMw} MW detected near ${h.nearestFacilityName}.`,
          severity: h.severity,
          facilityName: h.nearestFacilityName,
          timestamp: h.timestamp,
          timestampFormatted: h.timeFormatted,
          locationName: h.locationName,
          frpMw: h.frpMw,
          isUnresolved: true,
        }));
        setAlerts(liveAlerts);

        setSelectedIncident((current) => {
          if (current && adaptedHotspots.some((h) => h.id === current.id)) return current;
          return adaptedHotspots[0] || null;
        });

        setSelectedFacility((current) => {
          if (current && adaptedFacilities.some((f) => f.id === current.id)) return current;
          return adaptedFacilities[0] || null;
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setHotspots([]);
          setFacilities([]);
          setAlerts([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [region, dateRange, reloadToken]);

  const selectedIncidentId = selectedIncident?.id ?? null;

  useEffect(() => {
    if (!selectedIncidentId) {
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
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setIsAnalysisLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIncidentId]);

  const fetchFirmsStatus = async () => {
    try {
      const data = await fetchFirmsStatusApi();
      setFirmsStatus(data);
    } catch {}
  };

  const refreshEvents = async () => {
    refresh();
  };

  const syncNASAData = async (options?: FIRMSSyncOptions) => {
    setIsSyncingFirms(true);
    try {
      const syncResult = await syncFirmsData(options);
      await refreshEvents();
      await fetchFirmsStatus();
      return syncResult;
    } finally {
      setIsSyncingFirms(false);
    }
  };

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (filters.eventType !== 'ALL') {
        const targetCls = normalizeClassification(filters.eventType);
        const eventCls = normalizeClassification(h.classification);
        if (targetCls !== eventCls) return false;
      }

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

  const metrics = useMemo<SituationMetrics>(() => {
    const totalDetected = hotspots.length;
    const highPriorityCount = hotspots.filter(
      (h) => (h.riskScore ?? 0) >= 70 || h.severity === 'CRITICAL'
    ).length;
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
      'Gas/Oil': 0,
      'Urban': 0,
      'Mining / Extraction': 0,
      'Unknown Anomaly': 0,
    };

    hotspots.forEach((h) => {
      const norm = normalizeClassification(h.classification);
      const current = eventMix[norm] || 0;
      eventMix[norm] = current + 1;
    });

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
  }, [hotspots, filteredHotspots]);

  const selectIncidentById = (id: string) => {
    const found = hotspots.find((h) => h.id === id);
    if (found) {
      setSelectedIncident({ ...found });
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
        firmsStatus,
        isSyncingFirms,
        isFirmsModalOpen,
        setIsFirmsModalOpen,
        syncNASAData,
        refreshEvents: refresh,
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
