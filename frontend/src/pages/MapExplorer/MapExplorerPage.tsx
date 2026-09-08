import React, { useState } from 'react';
import { Compass, Ruler } from 'lucide-react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapControls } from '../../components/map/MapControls';
import { MapLegend } from '../../components/map/MapLegend';
import { useIntelligence } from '../../context/IntelligenceContext';

export const MapExplorerPage: React.FC = () => {
  const { selectedIncident } = useIntelligence();
  const [measurementMode, setMeasurementMode] = useState<boolean>(false);

  return (
    <div className="h-[calc(100vh-5.75rem)] w-full flex flex-col lg:flex-row bg-[#050A12] p-2 gap-2 overflow-hidden">
      {/* Floating Left GIS Toolbar */}
      <div className="w-full lg:w-64 bg-[#07101B] border border-[#203246] rounded-lg p-4 flex flex-col space-y-4 font-mono text-xs text-slate-200 shrink-0 overflow-y-auto">
        <div className="flex items-center space-x-2 border-b border-[#203246] pb-2">
          <Compass className="w-4 h-4 text-[#16A9D9]" />
          <span className="font-semibold text-xs uppercase tracking-wider text-white">
            GIS EXPLORER TOOLBAR
          </span>
        </div>

        {/* Spatial Tools */}
        <div className="space-y-2">
          <span className="text-[10px] text-[#16A9D9] font-bold uppercase block">ANALYST GIS TOOLS</span>

          <button
            onClick={() => setMeasurementMode(!measurementMode)}
            className={`w-full p-2 rounded border flex items-center justify-between transition ${
              measurementMode ? 'bg-[#0B1420] border-[#16A9D9] text-[#16A9D9]' : 'bg-[#0B1420] border-[#203246] hover:border-[#287FB1]'
            }`}
          >
            <span className="flex items-center space-x-2">
              <Ruler className="w-4 h-4 text-[#FFB020]" />
              <span>Distance Measurement</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.5 bg-[#050A12] rounded text-[#A7B4C5]">
              {measurementMode ? 'ACTIVE' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Feature Inspector */}
        <div className="space-y-2 border-t border-[#203246] pt-3">
          <span className="text-[10px] text-[#16A9D9] font-bold uppercase block">FEATURE INSPECTOR</span>
          {selectedIncident ? (
            <div className="p-3 bg-[#0B1420] border border-[#203246] rounded space-y-2 text-xs">
              <div className="flex justify-between font-bold text-[#16A9D9]">
                <span>{selectedIncident.id}</span>
                <span className="text-[#FFB020]">{selectedIncident.frpMw} MW</span>
              </div>
              <p className="text-[11px] text-slate-300">{selectedIncident.classification}</p>
              <div className="text-[10px] text-[#A7B4C5] pt-1 border-t border-[#203246]">
                LAT/LNG: {selectedIncident.lat.toFixed(4)}, {selectedIncident.lng.toFixed(4)}
              </div>
            </div>
          ) : (
            <p className="text-[#66768A] italic text-[11px]">Click any map feature to inspect spatial metadata.</p>
          )}
        </div>
      </div>

      {/* Hero MapLibre Map Container */}
      <div className="flex-1 relative rounded-lg overflow-hidden border border-[#203246] shadow-2xl">
        <GISMapLibre height="h-full" />
        <MapControls />
        <MapLegend />
      </div>
    </div>
  );
};
