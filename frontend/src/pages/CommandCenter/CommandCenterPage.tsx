import React from 'react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapControls } from '../../components/map/MapControls';
import { MapLegend } from '../../components/map/MapLegend';
import { IntelligenceDrawer } from '../../components/intelligence/IntelligenceDrawer';
import { SituationRail } from '../../components/intelligence/SituationRail';

export const CommandCenterPage: React.FC = () => {
  return (
    <div className="relative h-[calc(100vh-52px)] w-full overflow-hidden bg-[#060910] text-slate-200 font-sans select-none">
      
      {/* 1. FULL-BLEED BASEMAP CANVAS */}
      <div className="absolute inset-0 w-full h-full">
        <GISMapLibre height="h-full" />
      </div>

      {/* 2. FLOATING MAP CONTROLS & LEGEND OVERLAYS */}
      <MapControls className="absolute top-3 left-[21.5rem]" />

      <div className="absolute top-3 right-[25.5rem] z-20 hidden xl:block">
        <MapLegend />
      </div>

      {/* 3. FLOATING LEFT PANEL: SITUATION RAIL & RISK-RANKED ANOMALY QUEUE */}
      <div className="absolute top-3 left-3 bottom-3 w-80 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <SituationRail />
      </div>

      {/* 4. FLOATING RIGHT PANEL: SELECTED INCIDENT INTEL & REASONING */}
      <div className="absolute top-3 right-3 bottom-3 w-96 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <IntelligenceDrawer />
      </div>

    </div>
  );
};
