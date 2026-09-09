import React from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import type { EventClassification } from '../../types';

export const SituationRail: React.FC = () => {
  const {
    metrics,
    filteredHotspots,
    selectedIncident,
    selectIncidentById,
    filters,
    setFilters,
  } = useIntelligence();

  const EVENT_TYPES: EventClassification[] = [
    'Industrial Fire',
    'Routine Flare',
    'Forest Fire',
    'Agricultural Burning',
    'Gas/Oil',
    'Urban/Other',
    'Mining / Extraction',
    'Unknown Anomaly',
  ];

  // Order hotspots by Risk Score / Severity (Highest Risk First)
  const severityRank: Record<string, number> = {
    EXTREME: 4,
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    MODERATE: 2,
    LOW: 1,
  };

  const sortedHotspots = [...filteredHotspots].sort((a, b) => {
    const scoreA = a.riskScore ?? (severityRank[a.severity] || 1) * 20;
    const scoreB = b.riskScore ?? (severityRank[b.severity] || 1) * 20;
    return scoreB - scoreA;
  });

  return (
    <div className="w-full h-full flex flex-col font-mono text-xs text-slate-200 select-none overflow-hidden">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wider text-xs">
            Active Anomaly Queue
          </span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full">
          {sortedHotspots.length} ACTIVE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, severity: 'ALL' }))}
            className={`p-2.5 rounded-lg border text-left transition ${
              filters.severity === 'ALL'
                ? 'bg-cyan-500/20 border-cyan-400/60 text-white shadow-md'
                : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            <span className="text-[9px] text-slate-400 uppercase font-bold block">DETECTIONS</span>
            <span className="text-base font-bold text-cyan-400">{metrics.totalDetected}</span>
          </button>

          <button
            onClick={() => setFilters((prev) => ({ ...prev, severity: 'HIGH' }))}
            className={`p-2.5 rounded-lg border text-left transition ${
              filters.severity === 'HIGH'
                ? 'bg-red-500/20 border-red-500/60 text-white shadow-md'
                : 'bg-black/40 border-white/10 text-slate-400 hover:border-red-500/40'
            }`}
          >
            <span className="text-[9px] text-red-400 uppercase font-bold block">HIGH PRIORITY</span>
            <span className="text-base font-bold text-red-400">{metrics.highPriorityCount}</span>
          </button>
        </div>

        {/* Event Mix Distribution */}
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-200 font-bold uppercase tracking-wider">EVENT MIX RATIO</span>
            <span className="text-slate-500 text-[10px]">ALL INDIA</span>
          </div>

          <div className="space-y-1 text-xs">
            {EVENT_TYPES.map((type) => {
              const count = metrics.eventMix[type] || 0;
              const pct = metrics.totalDetected > 0 ? Math.round((count / metrics.totalDetected) * 100) : 0;
              const isFilterActive = filters.eventType === type;

              return (
                <div
                  key={type}
                  onClick={() => setFilters((prev) => ({ ...prev, eventType: isFilterActive ? 'ALL' : type }))}
                  className={`p-1.5 rounded-md cursor-pointer transition border ${
                    isFilterActive
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-white'
                      : 'bg-black/40 hover:bg-white/5 border-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-300 font-medium truncate">{type}</span>
                    <span className="text-cyan-400 font-bold">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        type === 'Industrial Fire'
                          ? 'bg-red-500'
                          : type === 'Routine Flare'
                          ? 'bg-purple-500'
                          : type === 'Forest Fire'
                          ? 'bg-emerald-500'
                          : type === 'Agricultural Burning'
                          ? 'bg-amber-500'
                          : type === 'Mining / Extraction'
                          ? 'bg-yellow-700'
                          : 'bg-slate-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Incident Queue List */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-200 font-bold uppercase tracking-wider">RISK RANKED QUEUE</span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE FEED
            </span>
          </div>

          <div className="space-y-2">
            {sortedHotspots.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-[11px]">
                No active anomalies match current filter.
              </div>
            ) : (
              sortedHotspots.map((hotspot) => {
                const isSelected = selectedIncident?.id === hotspot.id;
                const riskVal = hotspot.riskScore ?? (hotspot.severity === 'CRITICAL' ? 85 : hotspot.severity === 'HIGH' ? 65 : 35);
                const riskLevel = hotspot.riskLevel || (riskVal >= 75 ? 'EXTREME' : riskVal >= 50 ? 'HIGH' : riskVal >= 30 ? 'MODERATE' : 'LOW');
                
                const isHighRisk = riskVal >= 50 || hotspot.severity === 'HIGH' || hotspot.severity === 'CRITICAL';

                return (
                  <div
                    key={hotspot.id}
                    onClick={() => selectIncidentById(hotspot.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg border-l-4'
                        : isHighRisk
                        ? 'bg-red-950/20 border-red-500/30 hover:border-red-400/60 text-slate-200'
                        : 'bg-black/40 hover:bg-white/[0.04] border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-white flex items-center gap-1">
                        {isHighRisk && <ShieldAlert className="w-3 h-3 text-red-400 inline shrink-0" />}
                        {hotspot.id}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          riskLevel === 'EXTREME' || hotspot.severity === 'CRITICAL'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : riskLevel === 'HIGH' || hotspot.severity === 'HIGH'
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                            : riskLevel === 'MODERATE'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        }`}
                      >
                        {riskLevel} ({Math.round(riskVal)})
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-white truncate font-sans">
                      {hotspot.classification}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
                      <span>FRP: <strong className="text-white">{hotspot.frpMw.toFixed(1)} MW</strong></span>
                      <span className="text-slate-400">{hotspot.timeFormatted || 'Recent'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      <div className="p-3 bg-black/60 border-t border-white/10 font-mono text-[10px] text-slate-400 flex justify-between items-center shrink-0">
        <span>AOI: <strong className="text-white">ALL INDIA</strong></span>
        <span>SENSOR: <strong className="text-cyan-400">NOAA-20 / VIIRS</strong></span>
      </div>
    </div>
  );
};
