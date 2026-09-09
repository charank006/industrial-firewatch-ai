import React from 'react';
import { Activity } from 'lucide-react';
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
    'Persistent Thermal Source',
    'Industrial Fire',
    'Routine Flare',
    'Forest Fire',
    'Agricultural Burning',
    'Urban/Other',
    'Unknown Anomaly',
  ];

  return (
    <div className="w-full h-full flex flex-col font-mono text-xs text-slate-200 select-none overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wider text-xs">
            Active Anomaly Queue
          </span>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded-full">
          {filteredHotspots.length} ACTIVE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
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
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-200 font-bold uppercase tracking-wider">EVENT MIX RATIO</span>
            <span className="text-slate-500 text-[10px]">VIIRS 375m</span>
          </div>

          <div className="space-y-1.5 text-xs">
            {EVENT_TYPES.map((type) => {
              const count = metrics.eventMix[type] || 0;
              const pct = metrics.totalDetected > 0 ? Math.round((count / metrics.totalDetected) * 100) : 0;
              const isFilterActive = filters.eventType === type;

              return (
                <div
                  key={type}
                  onClick={() => setFilters((prev) => ({ ...prev, eventType: isFilterActive ? 'ALL' : type }))}
                  className={`p-2 rounded-md cursor-pointer transition border ${
                    isFilterActive
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-white'
                      : 'bg-black/40 hover:bg-white/5 border-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-300 font-medium">{type}</span>
                    <span className="text-cyan-400 font-bold">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        type === 'Industrial Fire'
                          ? 'bg-red-500'
                          : type === 'Routine Flare'
                          ? 'bg-amber-500'
                          : type === 'Forest Fire'
                          ? 'bg-orange-500'
                          : type === 'Agricultural Burning'
                          ? 'bg-emerald-500'
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
            <span className="text-slate-200 font-bold uppercase tracking-wider">ANOMALIES LIST</span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>

          <div className="space-y-2">
            {filteredHotspots.map((hotspot) => {
              const isSelected = selectedIncident?.id === hotspot.id;
              return (
                <div
                  key={hotspot.id}
                  onClick={() => selectIncidentById(hotspot.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-lg border-l-4'
                      : 'bg-black/40 hover:bg-white/[0.04] border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-white">{hotspot.id}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        hotspot.severity === 'HIGH'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {hotspot.severity}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 truncate font-sans">
                    {hotspot.classification}
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
                    <span>FRP: <strong className="text-white">{hotspot.frpMw} MW</strong></span>
                    <span>{hotspot.timeFormatted}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event Mix Distribution */}
      <div className="space-y-2 border-t border-[#253340] pt-2.5">
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="text-slate-200 font-semibold uppercase">EVENT MIX</span>
          <span className="text-[#6F7E8D] text-[9.5px]">Ratio</span>
        </div>

        <div className="space-y-1 text-xs">
          {EVENT_TYPES.map((type) => {
            const count = metrics.eventMix[type] || 0;
            const pct = metrics.totalDetected > 0 ? Math.round((count / metrics.totalDetected) * 100) : 0;
            const isFilterActive = filters.eventType === type;

            return (
              <div
                key={type}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    eventType: isFilterActive ? 'ALL' : type,
                  }))
                }
                className={`p-1.5 rounded-md cursor-pointer transition border ${
                  isFilterActive
                    ? 'bg-[#0D151E] border-[#3DB7D9] text-white shadow-inner'
                    : 'bg-[#0D151E]/40 hover:bg-[#0D151E] border-transparent text-slate-300'
                }`}
              >
                <div className="flex justify-between text-[10px] mb-1">
                  <span className={isFilterActive ? 'text-white font-bold' : 'text-slate-300'}>{type}</span>
                  <span className="text-[#3DB7D9] font-bold">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-1 bg-[#05080D] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      type === 'Persistent Thermal Source'
                        ? 'bg-[#A855F7]'
                        : type === 'Industrial Fire'
                        ? 'bg-[#FF3B30]'
                        : type === 'Routine Flare'
                        ? 'bg-[#FF6B22]'
                        : type === 'Forest Fire'
                        ? 'bg-[#FF9500]'
                        : type === 'Agricultural Burning'
                        ? 'bg-[#FFCC00]'
                        : type === 'Urban/Other'
                        ? 'bg-[#06B6D4]'
                        : 'bg-slate-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detections Ticker List */}
      <div className="border-t border-[#253340] pt-2.5 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between text-[10.5px] pb-1.5 shrink-0">
          <span className="text-slate-200 font-semibold uppercase">
            DETECTIONS ({filteredHotspots.length})
          </span>
          <span className="text-[9.5px] text-[#39B978] flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39B978] animate-pulse" />
            <span>NRT</span>
          </span>
        </div>

        <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 custom-scrollbar">
          {filteredHotspots.length === 0 ? (
            <div className="text-center py-6 text-[#6F7E8D] text-[11px]">
              No thermal events match current filter.
            </div>
          ) : (
            filteredHotspots.map((hotspot) => {
              const isSelected = selectedIncident?.id === hotspot.id;
              const isCritical = hotspot.severity === 'CRITICAL';
              const isHigh = hotspot.severity === 'HIGH';
              const isMedium = hotspot.severity === 'MEDIUM';

              return (
                <div
                  key={hotspot.id}
                  onClick={() => selectIncidentById(hotspot.id)}
                  className={`p-2 rounded-md border cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#0D151E] border-[#3DB7D9] shadow-sm'
                      : 'bg-[#0D151E]/50 border-[#253340] hover:border-[#304150]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[#3DB7D9]">{hotspot.id}</span>
                    <span className="text-[#A7B4C1]">{hotspot.timeFormatted}</span>
                  </div>
                  <div className="text-[11px] font-medium text-white truncate mt-0.5 font-sans">
                    {hotspot.classification}
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                    <span>FRP: {hotspot.frpMw.toFixed(1)} MW</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        isCritical
                          ? 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40'
                          : isHigh
                          ? 'bg-[#F04438]/20 text-[#F04438] border border-[#F04438]/30'
                          : isMedium
                          ? 'bg-[#E8A93A]/20 text-[#E8A93A] border border-[#E8A93A]/30'
                          : 'bg-[#39B978]/20 text-[#39B978] border border-[#39B978]/30'
                      }`}
                    >
                      {hotspot.severity}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
