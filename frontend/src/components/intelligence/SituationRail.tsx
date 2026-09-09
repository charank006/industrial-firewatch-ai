import React from 'react';
import { Activity, Flame, ShieldAlert, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
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
    resetFilters,
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

  const isAnyFilterActive = filters.severity !== 'ALL' || filters.eventType !== 'ALL' || filters.minFRP > 0;

  return (
    <div className="w-full lg:w-64 bg-[#081019] border border-[#253340] rounded-lg p-3 flex flex-col space-y-3.5 shrink-0 overflow-hidden max-h-full font-mono text-xs shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#253340] pb-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-[#3DB7D9]" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">
            LIVE SITUATION
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          {isAnyFilterActive && (
            <button
              onClick={resetFilters}
              title="Reset all filters"
              className="p-1 text-[#3DB7D9] hover:text-white bg-[#0D151E] border border-[#253340] rounded hover:border-[#3DB7D9] transition"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
          <span className="text-[9.5px] px-1.5 py-0.5 bg-[#0D151E] text-slate-300 border border-[#253340] rounded font-bold uppercase">
            {filters.region === 'ALL' ? 'ALL INDIA' : filters.region.split(' ')[0]}
          </span>
        </div>
      </div>

      {/* Dynamic KPI Severity Cards */}
      <div className="grid grid-cols-2 gap-2">
        {/* Total Detections */}
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, severity: 'ALL' }))}
          className={`p-2 rounded-lg border text-left transition relative cursor-pointer ${
            filters.severity === 'ALL'
              ? 'bg-[#0D151E] border-[#3DB7D9] shadow-sm shadow-[#3DB7D9]/20 text-white'
              : 'bg-[#0D151E]/50 border-[#253340] text-slate-400 hover:border-[#304150]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#A7B4C1] uppercase block font-semibold">ALL DETECTIONS</span>
            <Flame className="w-3 h-3 text-[#3DB7D9]" />
          </div>
          <span className="text-lg font-bold text-[#3DB7D9] block mt-0.5">{metrics.totalDetected}</span>
        </button>

        {/* High Risk (CRITICAL + HIGH) */}
        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              severity: prev.severity === 'HIGH' ? 'ALL' : 'HIGH',
            }))
          }
          className={`p-2 rounded-lg border text-left transition relative cursor-pointer ${
            filters.severity === 'HIGH'
              ? 'bg-[#F04438]/20 border-[#F04438] shadow-sm shadow-[#F04438]/30 text-white'
              : 'bg-[#0D151E]/50 border-[#253340] text-slate-400 hover:border-[#F04438]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#F04438] uppercase block font-semibold">HIGH RISK</span>
            <ShieldAlert className="w-3 h-3 text-[#F04438]" />
          </div>
          <span className="text-lg font-bold text-[#F04438] block mt-0.5">
            {metrics.highPriorityCount}
          </span>
        </button>

        {/* Medium Priority */}
        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              severity: prev.severity === 'MEDIUM' ? 'ALL' : 'MEDIUM',
            }))
          }
          className={`p-2 rounded-lg border text-left transition relative cursor-pointer ${
            filters.severity === 'MEDIUM'
              ? 'bg-[#E8A93A]/20 border-[#E8A93A] shadow-sm shadow-[#E8A93A]/30 text-white'
              : 'bg-[#0D151E]/50 border-[#253340] text-slate-400 hover:border-[#E8A93A]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#E8A93A] uppercase block font-semibold">MEDIUM</span>
            <AlertTriangle className="w-3 h-3 text-[#E8A93A]" />
          </div>
          <span className="text-base font-bold text-[#E8A93A] block mt-0.5">
            {metrics.mediumPriorityCount}
          </span>
        </button>

        {/* Low Priority */}
        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              severity: prev.severity === 'LOW' ? 'ALL' : 'LOW',
            }))
          }
          className={`p-2 rounded-lg border text-left transition relative cursor-pointer ${
            filters.severity === 'LOW'
              ? 'bg-[#39B978]/20 border-[#39B978] shadow-sm shadow-[#39B978]/30 text-white'
              : 'bg-[#0D151E]/50 border-[#253340] text-slate-400 hover:border-[#39B978]/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[#39B978] uppercase block font-semibold">LOW</span>
            <CheckCircle2 className="w-3 h-3 text-[#39B978]" />
          </div>
          <span className="text-base font-bold text-[#39B978] block mt-0.5">
            {metrics.lowPriorityCount}
          </span>
        </button>
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
