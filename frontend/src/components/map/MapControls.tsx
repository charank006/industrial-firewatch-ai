import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe2, Layers, SlidersHorizontal } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

export const MapControls: React.FC = () => {
  const navigate = useNavigate();
  const { layers, toggleLayer, mapMode, setMapMode } = useIntelligence();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col items-end space-y-2 font-mono text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-[#05080E]/90 hover:bg-[#090D17] border border-white/10 rounded-lg text-slate-300 hover:text-white shadow-xl transition flex items-center space-x-1.5 cursor-pointer backdrop-blur-md"
        title="Layer & Filter Controls"
      >
        <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold text-[11px]">CONTROLS</span>
      </button>

      {/* Popout Panel */}
      {isOpen && (
        <div className="w-64 bg-[#05080E]/95 border border-white/10 rounded-lg p-3 shadow-2xl space-y-3 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 text-slate-200">
          
          {/* Map Base Mode Switcher */}
          <div className="space-y-1">
            <span className="text-[10px] text-[#A7B4C1] uppercase font-semibold block">BASEMAP & GLOBAL VIEW</span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => setMapMode('dark')}
                className={`py-1 px-2 rounded border transition text-[11px] font-medium ${
                  mapMode === 'dark'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                    : 'bg-[#0B101D] text-slate-400 border-white/5 hover:text-slate-200'
                }`}
              >
                Dark Canvas
              </button>
              <button
                onClick={() => setMapMode('satellite')}
                className={`py-1 px-2 rounded border transition text-[11px] font-medium ${
                  mapMode === 'satellite'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                    : 'bg-[#0B101D] text-slate-400 border-white/5 hover:text-slate-200'
                }`}
              >
                Satellite Imagery
              </button>
            </div>
            <button
              onClick={() => navigate('/global-earth')}
              className="w-full py-1.5 px-2 mt-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold transition text-[11px] flex items-center justify-center space-x-1.5 cursor-pointer shadow-[0_0_8px_rgba(56,189,248,0.2)]"
            >
              <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>3D Global Earth View →</span>
            </button>
          </div>

          {/* Toggleable Layers */}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <span className="text-[10px] text-[#A7B4C1] uppercase font-semibold block flex items-center justify-between">
              <span>VISIBILITY LAYERS</span>
              <Layers className="w-3 h-3 text-slate-400" />
            </span>

            <div className="space-y-1">
              {[
                { key: 'thermalAnomalies', label: 'Thermal Hotspots (FRP)' },
                { key: 'industrialFacilities', label: 'Industrial Infrastructure' },
                { key: 'riskBufferZones', label: 'Risk Radius Buffers' },
                { key: 'plumeVectors', label: 'Wind / Smoke Dispersion' },
              ].map((layer) => (
                <label
                  key={layer.key}
                  className="flex items-center justify-between p-1.5 rounded bg-[#090D17]/60 hover:bg-[#090D17] border border-white/5 text-[11px] cursor-pointer"
                >
                  <span className="text-slate-300">{layer.label}</span>
                  <input
                    type="checkbox"
                    checked={layers[layer.key as keyof typeof layers]}
                    onChange={() => toggleLayer(layer.key as keyof typeof layers)}
                    className="accent-cyan-400 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
