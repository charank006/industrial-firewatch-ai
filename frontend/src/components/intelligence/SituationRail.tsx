import React from 'react';
import { Activity } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

export const formatDisplayClassification = (cls: string): string => {
  const norm = (cls || '').toLowerCase();
  if (norm.includes('agri') || norm.includes('crop') || norm.includes('farm')) return 'Monitored Farmland Heat';
  if (norm.includes('unknown') || norm.includes('anomaly')) return 'Monitored Heat Point';
  if (norm.includes('industrial')) return 'Industrial Fire';
  if (norm.includes('forest')) return 'Forest Fire';
  if (norm.includes('flare') || norm.includes('gas') || norm.includes('oil')) return 'Routine Flare';
  if (norm.includes('mining')) return 'Mining / Extraction';
  return cls;
};

export const SituationRail: React.FC = () => {
  const {
    metrics,
    filteredHotspots,
    selectedIncident,
    selectIncidentById,
    filters,
    setFilters,
  } = useIntelligence();

  // Agriculture is a confident classification, not a fallback. It needs its own
  // row here or the catch-all below buries every stubble burn under the label
  // that means "we could not classify this".
  const DISPLAY_MIX_CLASSES = [
    'Industrial Fire',
    'Forest Fire',
    'Monitored Farmland Heat',
    'Monitored Heat Point',
  ];

  return (
    <div className="w-full h-full flex flex-col font-mono text-xs text-slate-200 select-none overflow-hidden bg-[#0A0E17]/95">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wider text-xs">
            ACTIVE ANOMALY QUEUE
          </span>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded-full flex items-center gap-1.5 font-mono tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          {filteredHotspots.length} QUEUED
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, severity: 'ALL' }))}
            className={`p-3 rounded-xl border text-left transition-all ${
              filters.severity === 'ALL'
                ? 'bg-cyan-950/40 border-cyan-500/50 text-white shadow-md'
                : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            <span className="text-[9px] text-slate-400 uppercase font-bold block tracking-wider">DETECTIONS</span>
            <span className="text-lg font-bold text-cyan-400">{metrics.totalDetected}</span>
          </button>

          <button
            onClick={() => setFilters((prev) => ({ ...prev, severity: 'HIGH' }))}
            className={`p-3 rounded-xl border text-left transition-all ${
              filters.severity === 'HIGH'
                ? 'bg-red-950/40 border-red-500/50 text-white shadow-md'
                : 'bg-black/40 border-white/10 text-slate-400 hover:border-red-500/40'
            }`}
          >
            <span className="text-[9px] text-red-400 uppercase font-bold block tracking-wider">HIGH PRIORITY</span>
            <span className="text-lg font-bold text-red-400">
              {filteredHotspots.filter((h) => (h.riskScore ?? 0) >= 70 || h.severity === 'CRITICAL' || h.severity === 'HIGH').length}
            </span>
          </button>
        </div>

        {/* Classification Mix Section */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-300 font-bold uppercase tracking-wider">CLASSIFICATION MIX</span>
          </div>

          <div className="space-y-2 text-xs">
            {DISPLAY_MIX_CLASSES.map((label) => {
              let count = 0;
              if (label === 'Industrial Fire') {
                count = filteredHotspots.filter((h) => {
                  const c = (h.classification || '').toLowerCase();
                  return c.includes('industrial') || c.includes('flare') || c.includes('gas') || c.includes('mining');
                }).length;
              } else if (label === 'Forest Fire') {
                count = filteredHotspots.filter((h) => (h.classification || '').toLowerCase().includes('forest')).length;
              } else if (label === 'Monitored Farmland Heat') {
                count = filteredHotspots.filter((h) => {
                  const c = (h.classification || '').toLowerCase();
                  return c.includes('agri') || c.includes('crop') || c.includes('farm');
                }).length;
              } else {
                count = filteredHotspots.filter((h) => {
                  const c = (h.classification || '').toLowerCase();
                  return (
                    !c.includes('industrial') &&
                    !c.includes('flare') &&
                    !c.includes('gas') &&
                    !c.includes('oil') &&
                    !c.includes('mining') &&
                    !c.includes('forest') &&
                    !c.includes('agri') &&
                    !c.includes('crop') &&
                    !c.includes('farm')
                  );
                }).length;
              }

              const pct = metrics.totalDetected > 0 ? Math.round((count / metrics.totalDetected) * 100) : 0;

              return (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-200 font-medium">{label}</span>
                    <span className="text-cyan-400 font-bold">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        label === 'Industrial Fire'
                          ? 'bg-red-500'
                          : label === 'Forest Fire'
                          ? 'bg-emerald-500'
                          : label === 'Monitored Farmland Heat'
                          ? 'bg-amber-500'
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

        {/* Anomalies List */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-200 font-bold uppercase tracking-wider">ANOMALIES LIST</span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>

          <div className="space-y-2">
            {filteredHotspots.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-[11px]">
                No active anomalies match current filter.
              </div>
            ) : (
              filteredHotspots.map((hotspot) => {
                const isSelected = selectedIncident?.id === hotspot.id;
                const riskVal = hotspot.riskScore ?? (hotspot.severity === 'CRITICAL' ? 85 : hotspot.severity === 'HIGH' ? 65 : 25.9);
                const displayLabel = formatDisplayClassification(hotspot.classification);
                
                const isRedZone = riskVal >= 70 || hotspot.severity === 'CRITICAL';

                return (
                  <div
                    key={hotspot.id}
                    onClick={() => selectIncidentById(hotspot.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg border-l-4'
                        : isRedZone
                        ? 'bg-red-950/30 border-red-500/40 hover:border-red-400 text-slate-200'
                        : 'bg-[#0E1520] border-white/10 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold font-mono">
                      <span className="text-white tracking-wide">{hotspot.id}</span>
                      <span
                        className={`text-[9.5px] px-2 py-0.5 rounded font-mono font-bold ${
                          isRedZone
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : 'bg-[#1E2B3A] text-cyan-300 border border-[#2B3E52]'
                        }`}
                      >
                        RISK {riskVal.toFixed(1)}%
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white truncate font-sans tracking-tight">
                      {displayLabel}
                    </div>

                    <div className="flex justify-between items-center text-[10.5px] text-slate-400 mt-0.5 font-mono">
                      <span>FRP: <strong className="text-white">{hotspot.frpMw.toFixed(2)} MW</strong></span>
                      <span className="text-slate-400">{hotspot.timeFormatted || '21:11 IST'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
