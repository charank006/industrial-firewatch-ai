/**
 * Map key, generated from the shared class palette.
 *
 * Displays the consolidated 3-tier GIS symbology palette.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';

const LEGEND_ITEMS = [
  { label: 'Industrial / Flares / Mining', color: '#EF4444' },
  { label: 'Forest & Ag Burning', color: '#10B981' },
  { label: 'Urban & Baseline Heat', color: '#06B6D4' },
];

interface MapLegendProps {
  className?: string;
}

export const MapLegend: React.FC<MapLegendProps> = ({ className = 'relative' }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div className={`${className} z-30 font-mono text-[11px] text-slate-300`}>
      {isExpanded ? (
        <div className="p-2.5 bg-[#081019]/95 border border-[#253340] rounded-lg backdrop-blur-md shadow-xl space-y-2 max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div
            className="flex items-center justify-between border-b border-[#253340] pb-1 cursor-pointer select-none"
            onClick={() => setIsExpanded(false)}
          >
            <div className="flex items-center space-x-1.5">
              <Layers className="w-3 h-3 text-[#3DB7D9]" />
              <span className="font-semibold text-[#3DB7D9]">GIS SYMBOLOGY</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-[9px] text-[#A7B4C1]">VIIRS 375m</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#A7B4C1] hover:text-white transition" />
            </div>
          </div>

          <div className="space-y-1.5 text-[10px]">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center space-x-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
            ))}
            <div className="flex items-center space-x-2 border-t border-[#253340] pt-1.5 mt-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#3DB7D9] shrink-0" />
              <span className="text-slate-400">Industrial Facility (OSM)</span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#081019]/90 hover:bg-[#081019] border border-[#253340] hover:border-[#3DB7D9] rounded-md backdrop-blur-md shadow-lg text-[10.5px] text-slate-300 hover:text-white transition group"
        >
          <Layers className="w-3.5 h-3.5 text-[#3DB7D9] group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-[#3DB7D9]">GIS SYMBOLOGY</span>
          <ChevronUp className="w-3 h-3 text-[#A7B4C1]" />
        </button>
      )}
    </div>
  );
};
