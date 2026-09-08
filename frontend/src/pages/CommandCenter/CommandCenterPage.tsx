import React from 'react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapControls } from '../../components/map/MapControls';
import { MapLegend } from '../../components/map/MapLegend';
import { IntelligenceDrawer } from '../../components/intelligence/IntelligenceDrawer';
import { SituationRail } from '../../components/intelligence/SituationRail';
import { TimeScrubber } from '../../components/timeline/TimeScrubber';

export const CommandCenterPage: React.FC = () => {
  return (
    <div className="relative h-[calc(100vh-52px)] w-full overflow-hidden bg-[#060910] text-slate-200 font-sans select-none">
      
      {/* 1. FULL-BLEED BASEMAP CANVAS */}
      <div className="absolute inset-0 w-full h-full">
        <GISMapLibre height="h-full" />
      </div>

      {/* 2. FLOATING MAP CONTROLS & LEGEND OVERLAYS */}
      <div className="absolute top-4 left-90 z-20 flex items-center gap-3">
        <MapControls />
      </div>

      <div className="absolute top-4 right-104 z-20 hidden xl:block">
        <MapLegend />
      </div>

      {/* 3. FLOATING LEFT PANEL: SITUATION RAIL & INCIDENT QUEUE */}
      <div className="absolute top-4 left-4 bottom-14 w-80 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <SituationRail />
      </div>

      {/* 4. FLOATING RIGHT PANEL: SELECTED INCIDENT INTEL & REASONING */}
      <div className="absolute top-4 right-4 bottom-14 w-96 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl flex flex-col z-20 shadow-2xl overflow-hidden">
        <IntelligenceDrawer />
      </div>

      {/* 5. FLOATING BOTTOM REPLAY SCRUBBER */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 px-5 py-2 rounded-full shadow-2xl flex items-center gap-4 text-xs font-mono">
          <TimeScrubber />
        </div>
      </div>

    </div>
  );
};
