/**
 * Map key, generated from the shared class palette.
 *
 * The swatches used to be hardcoded and had already drifted from the map they
 * describe — Industrial Fire was #F04438 here and #FF3B30 on the map, and
 * Routine Flare and Forest Fire shared one colour in both. Reading the
 * palette means a legend entry cannot disagree with the dot it explains.
 */

import React from 'react';
import { CLASS_COLOR } from '../../utils/classColors';
import type { EventClassification } from '../../types';

const SHORT_LABEL: Partial<Record<EventClassification, string>> = {
  'Agricultural Burning': 'Ag Burning',
  'Unknown Anomaly': 'Unknown',
};

export const MapLegend: React.FC = () => {
  const entries = Object.entries(CLASS_COLOR) as [EventClassification, string][];

  return (
    <div className="absolute bottom-3 left-3 z-[1000] p-2.5 bg-[#081019]/95 border border-[#253340] rounded-lg backdrop-blur-md text-[11px] font-mono text-slate-300 shadow-xl space-y-2 max-w-xs">
      <div className="flex items-center justify-between border-b border-[#253340] pb-1">
        <span className="font-semibold text-[#3DB7D9]">GIS SYMBOLOGY</span>
        <span className="text-[9px] text-[#A7B4C1]">VIIRS 375m</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {entries.map(([label, colour]) => (
          <div key={label} className="flex items-center space-x-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: colour }}
            />
            <span>{SHORT_LABEL[label] ?? label}</span>
          </div>
        ))}
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#3DB7D9] shrink-0" />
          <span>Industrial Facility</span>
        </div>
      </div>
    </div>
  );
};
