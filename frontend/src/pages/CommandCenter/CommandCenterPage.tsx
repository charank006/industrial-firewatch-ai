import React from 'react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapControls } from '../../components/map/MapControls';
import { MapLegend } from '../../components/map/MapLegend';
import { IntelligenceDrawer } from '../../components/intelligence/IntelligenceDrawer';
import { SituationRail } from '../../components/intelligence/SituationRail';
import { useIntelligence } from '../../context/IntelligenceContext';
import { Factory, Trees, Wheat, Layers } from 'lucide-react';

export const CommandCenterPage: React.FC = () => {
  const { filters, setFilters, metrics, hotspots } = useIntelligence();

  const activeMode = filters.eventType;

  // Counts by category group
  const industrialCount = hotspots.filter((h) => {
    const cls = (h.classification || '').toLowerCase();
    return cls.includes('industrial') || cls.includes('flare') || cls.includes('gas') || cls.includes('mining');
  }).length;

  const forestCount = hotspots.filter((h) => (h.classification || '').toLowerCase().includes('forest')).length;
  const agCount = hotspots.filter((h) => (h.classification || '').toLowerCase().includes('agricultural')).length;

  return (
    <div className="relative h-[calc(100vh-52px)] w-full overflow-hidden bg-[#060910] text-slate-200 font-sans select-none">
      
      {/* 1. FULL-BLEED BASEMAP CANVAS */}
      <div className="absolute inset-0 w-full h-full">
        <GISMapLibre height="h-full" />
      </div>

      {/* 2. TOP TACTICAL CATEGORY QUICK-FILTER BAR */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 bg-[#080D16]/90 border border-white/15 rounded-full backdrop-blur-xl shadow-2xl font-mono text-xs">
        
        {/* Industrial Priority Filter Button */}
        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Industrial Fire' ? 'ALL' : 'Industrial Fire' }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition font-semibold text-[11px] ${
            activeMode === 'Industrial Fire'
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
              : 'bg-black/40 hover:bg-white/10 text-slate-300 border border-white/5'
          }`}
        >
          <Factory className="w-3.5 h-3.5 text-red-400" />
          <span>INDUSTRIAL & HAZARDS</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-red-950/80 text-red-300 text-[9.5px] font-bold border border-red-500/30">
            {industrialCount}
          </span>
        </button>

        {/* Forest Fire Filter Button */}
        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Forest Fire' ? 'ALL' : 'Forest Fire' }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition font-semibold text-[11px] ${
            activeMode === 'Forest Fire'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
              : 'bg-black/40 hover:bg-white/10 text-slate-300 border border-white/5'
          }`}
        >
          <Trees className="w-3.5 h-3.5 text-emerald-400" />
          <span>FOREST FIRES</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-950/80 text-emerald-300 text-[9.5px] font-bold border border-emerald-500/30">
            {forestCount}
          </span>
        </button>

        {/* Agricultural Filter Button */}
        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Agricultural Burning' ? 'ALL' : 'Agricultural Burning' }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition font-semibold text-[11px] ${
            activeMode === 'Agricultural Burning'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/30'
              : 'bg-black/40 hover:bg-white/10 text-slate-300 border border-white/5'
          }`}
        >
          <Wheat className="w-3.5 h-3.5 text-amber-400" />
          <span>CROP BURNING</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-950/80 text-amber-300 text-[9.5px] font-bold border border-amber-500/30">
            {agCount}
          </span>
        </button>

        {/* All Detections Filter Button */}
        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: 'ALL' }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition font-semibold text-[11px] ${
            activeMode === 'ALL'
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 font-bold'
              : 'bg-black/40 hover:bg-white/10 text-slate-300 border border-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>ALL ANOMALIES</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-cyan-300 text-[9.5px] font-bold border border-cyan-500/30">
            {metrics.totalDetected}
          </span>
        </button>
      </div>

      {/* 3. FLOATING MAP CONTROLS & LEGEND OVERLAYS */}
      <MapControls className="absolute top-3 left-[21.5rem]" />

      <div className="absolute top-3 right-[25.5rem] z-20 hidden xl:block">
        <MapLegend />
      </div>

      {/* 4. FLOATING LEFT PANEL: SITUATION RAIL & RISK-RANKED ANOMALY QUEUE */}
      <div className="absolute top-3 left-3 bottom-3 w-80 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <SituationRail />
      </div>

      {/* 5. FLOATING RIGHT PANEL: SELECTED INCIDENT INTEL & REASONING */}
      <div className="absolute top-3 right-3 bottom-3 w-96 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <IntelligenceDrawer />
      </div>

    </div>
  );
};
