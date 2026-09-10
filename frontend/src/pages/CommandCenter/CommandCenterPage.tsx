import React from 'react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapControls } from '../../components/map/MapControls';
import { MapLegend } from '../../components/map/MapLegend';
import { IntelligenceDrawer } from '../../components/intelligence/IntelligenceDrawer';
import { SituationRail } from '../../components/intelligence/SituationRail';
import { useIntelligence } from '../../context/IntelligenceContext';
import { Factory, Trees, Wheat, Layers } from 'lucide-react';

export const CommandCenterPage: React.FC = () => {
  const { filters, setFilters, hotspots } = useIntelligence();

  const activeMode = filters.eventType;

  // Counts by category group
  const industrialCount = hotspots.filter((h) => {
    const cls = (h.classification || '').toLowerCase();
    return cls.includes('industrial') || cls.includes('flare') || cls.includes('gas') || cls.includes('mining');
  }).length;

  const forestCount = hotspots.filter((h) => (h.classification || '').toLowerCase().includes('forest')).length;
  const agCount = hotspots.filter((h) => (h.classification || '').toLowerCase().includes('agricultural')).length;

  return (
    <div className="relative h-[calc(100vh-52px)] w-full overflow-hidden bg-[#05080D] text-slate-200 font-sans select-none">
      
      {/* 1. FULL-BLEED BASEMAP CANVAS */}
      <div className="absolute inset-0 w-full h-full z-0">
        <GISMapLibre height="h-full" />
      </div>

      {/* 2. TOP MAP TOOLBAR (CENTERED HUD CATEGORY BAR) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 hidden md:flex items-center gap-2 p-1.5 bg-[#070B14]/95 border border-cyan-500/25 rounded-full backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] pointer-events-auto font-mono text-xs">
        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Industrial Fire' ? 'ALL' : 'Industrial Fire' }))}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-semibold text-[10.5px] cursor-pointer ${
            activeMode === 'Industrial Fire'
              ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
              : 'bg-black/50 hover:bg-white/10 text-slate-300 border border-white/10'
          }`}
        >
          <Factory className="w-3.5 h-3.5 text-red-400" />
          <span>INDUSTRIAL</span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-red-950/80 text-red-300 text-[9px] font-bold border border-red-500/30">
            {industrialCount}
          </span>
        </button>

        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Forest Fire' ? 'ALL' : 'Forest Fire' }))}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-semibold text-[10.5px] cursor-pointer ${
            activeMode === 'Forest Fire'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
              : 'bg-black/50 hover:bg-white/10 text-slate-300 border border-white/10'
          }`}
        >
          <Trees className="w-3.5 h-3.5 text-emerald-400" />
          <span>FOREST</span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-950/80 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
            {forestCount}
          </span>
        </button>

        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: activeMode === 'Agricultural Burning' ? 'ALL' : 'Agricultural Burning' }))}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-semibold text-[10.5px] cursor-pointer ${
            activeMode === 'Agricultural Burning'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/30'
              : 'bg-black/50 hover:bg-white/10 text-slate-300 border border-white/10'
          }`}
        >
          <Wheat className="w-3.5 h-3.5 text-amber-400" />
          <span>CROP</span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-950/80 text-amber-300 text-[9px] font-bold border border-amber-500/30">
            {agCount}
          </span>
        </button>

        <button
          onClick={() => setFilters((prev) => ({ ...prev, eventType: 'ALL' }))}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-semibold text-[10.5px] cursor-pointer ${
            activeMode === 'ALL'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40 font-bold'
              : 'bg-black/50 hover:bg-white/10 text-slate-300 border border-white/10'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>ALL</span>
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-900 text-cyan-300 text-[9px] font-bold border border-cyan-500/30">
            {hotspots.length}
          </span>
        </button>
      </div>

      {/* 2b. FLOATING MAP CONTROLS (POSITIONED NEXT TO RIGHT DRAWER) */}
      <div className="absolute top-3 right-[23rem] sm:right-[24rem] xl:right-[25rem] z-30 hidden md:block pointer-events-auto">
        <MapControls className="relative" />
      </div>

      {/* 3. LEFT PANEL: SITUATION RAIL & ACTIVE ANOMALY QUEUE */}
      <div className="absolute top-3 left-3 bottom-3 w-80 sm:w-84 xl:w-88 z-20 flex flex-col bg-[#070B14]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300 hover:border-cyan-500/30">
        <SituationRail />
      </div>

      {/* 4. RIGHT PANEL: INTELLIGENCE DRAWER & ACTIVE INCIDENT PROFILE */}
      <div className="absolute top-3 right-3 bottom-3 w-88 sm:w-92 xl:w-96 z-20 flex flex-col bg-[#070B14]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300 hover:border-cyan-500/30">
        <IntelligenceDrawer />
      </div>

      {/* 5. FLOATING MAP LEGEND AT BOTTOM LEFT OF MAP CANVAS */}
      <div className="absolute bottom-3 left-[23rem] z-20 hidden lg:block">
        <MapLegend className="relative" />
      </div>

    </div>
  );
};
