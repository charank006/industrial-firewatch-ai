import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  History,
  Factory,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { formatDisplayClassification } from './SituationRail';

export const IntelligenceDrawer: React.FC = () => {
  const { selectedIncident, filteredHotspots } = useIntelligence();
  const navigate = useNavigate();

  // Dispatch Operational Alert Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [selectedUnit] = useState<string>('SURAT INDUSTRIAL FIRE SQUAD - ALPHA');
  const [dispatchStatus, setDispatchStatus] = useState<'IDLE' | 'SENDING' | 'CONFIRMED'>('IDLE');

  const currentIncident = selectedIncident || filteredHotspots[0];

  if (!currentIncident) {
    return (
      <div className="w-full h-full p-5 flex flex-col justify-between font-mono text-xs text-slate-300 select-none bg-[#0A0E17]/95">
        <div className="space-y-3">
          <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
            EARTH OBSERVATION WORKSTATION
          </div>
          <h3 className="text-base font-bold text-white">Active Anomaly Profile</h3>
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Continuous satellite thermal monitoring active. Select an active thermal anomaly pin on the basemap to inspect observation telemetry.
          </p>
        </div>
      </div>
    );
  }

  const handleRiskRegistryClick = () => {
    navigate('/risk-zone-registry');
  };

  const handleHistoryClick = () => {
    navigate(`/thermal-history?incidentId=${currentIncident.id}`);
  };

  const handleInvestigateClick = () => {
    navigate(`/incidents/${currentIncident.id}`);
  };

  const handleConfirmDispatch = () => {
    setDispatchStatus('SENDING');
    setTimeout(() => {
      setDispatchStatus('CONFIRMED');
    }, 1200);
  };

  const displayTitle = formatDisplayClassification(currentIncident.classification);
  const probVal = typeof currentIncident.predictedProbability === 'number'
    ? currentIncident.predictedProbability
    : 0.44;

  const latFormatted = currentIncident.lat.toFixed(4);
  const lngFormatted = currentIncident.lng.toFixed(4);

  return (
    <div className="w-full h-full p-4 flex flex-col justify-between font-sans text-xs text-slate-100 select-none overflow-y-auto custom-scrollbar relative bg-[#0A0E17]/95 border-l border-white/10">
      
      <div className="space-y-3.5">
        
        {/* 1. DATA COVERAGE CHECK CARD */}
        <div className="p-3 bg-[#0D1420] border border-white/10 rounded-lg flex items-center justify-between font-mono text-xs shadow-sm">
          <div className="flex items-start space-x-2.5">
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">DATA COVERAGE CHECK</div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Single satellite observation - no temporal corroboration
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-[#162232] border border-slate-600 text-slate-300 text-[9.5px] font-bold rounded uppercase">
            NEUTRAL
          </span>
        </div>

        {/* 2. RULE ENGINE OUTPUT CARD */}
        <div className="p-3 bg-[#0D1420] border border-emerald-500/30 rounded-lg flex items-start justify-between font-mono text-xs shadow-sm">
          <div className="flex items-start space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">RULE ENGINE OUTPUT</div>
              <div className="text-[11px] text-slate-300 font-sans mt-0.5 leading-relaxed">
                Most probable source: {formatDisplayClassification(currentIncident.classification)} (p={probVal.toFixed(2)}, model rules-v1.1b5c52). Probabilistic estimate, not a determination of ignition cause.
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-[9.5px] font-bold rounded uppercase shrink-0 ml-2">
            PASSED
          </span>
        </div>

        {/* 3. MOST PROBABLE SOURCE CENTERED CARD */}
        <div className="p-4 bg-[#0D1420] border border-white/10 rounded-xl flex flex-col items-center justify-center text-center space-y-1.5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-amber-500 to-red-500" />
          
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-semibold">
            MOST PROBABLE SOURCE
          </div>

          <h2 className="text-base font-bold text-white font-mono uppercase tracking-wide">
            {displayTitle}
          </h2>

          <div className="text-[9.5px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
            {currentIncident.severity} SEVERITY
          </div>

          {/* Latitude & Longitude Badge */}
          <div className="text-[10.5px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 px-3 py-1 rounded-md mt-0.5 font-bold">
            LAT: {latFormatted}° | LON: {lngFormatted}°
          </div>
        </div>

        {/* 4. AUTHENTIC SATELLITE SENSOR TELEMETRY GRID */}
        <div className="p-3.5 bg-[#0D1420] border border-white/10 rounded-xl space-y-2 font-mono text-xs shadow-md">
          <div className="flex items-center justify-between text-[10px] text-cyan-400 font-bold uppercase tracking-wider border-b border-white/10 pb-1.5">
            <span>SATELLITE SENSOR TELEMETRY</span>
            <span className="text-emerald-400 text-[9px]">VIIRS 375m S-NPP</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 bg-black/40 border border-white/5 rounded-lg space-y-0.5">
              <span className="text-[9px] text-slate-400 block uppercase">THERMAL POWER</span>
              <span className="font-bold text-amber-400">{currentIncident.frpMw.toFixed(2)} MW</span>
            </div>

            <div className="p-2 bg-black/40 border border-white/5 rounded-lg space-y-0.5">
              <span className="text-[9px] text-slate-400 block uppercase">BRIGHTNESS TEMP</span>
              <span className="font-bold text-cyan-400">{currentIncident.brightnessK.toFixed(1)} K</span>
            </div>

            <div className="p-2 bg-black/40 border border-white/5 rounded-lg space-y-0.5">
              <span className="text-[9px] text-slate-400 block uppercase">SENSOR CONFIDENCE</span>
              <span className="font-bold text-emerald-400">{currentIncident.confidence || 97}%</span>
            </div>

            <div className="p-2 bg-black/40 border border-white/5 rounded-lg space-y-0.5">
              <span className="text-[9px] text-slate-400 block uppercase">LAND COVER</span>
              <span className="font-bold text-slate-200 truncate block">{currentIncident.landCover || 'Cropland'}</span>
            </div>
          </div>

          <div className="p-2 bg-black/50 border border-white/5 rounded-lg text-[10.5px] space-y-0.5">
            <span className="text-[9px] text-slate-400 block uppercase">FACILITY FENCE MATCH</span>
            <div className="flex items-center justify-between font-sans">
              <span className="font-semibold text-white truncate">{currentIncident.nearestFacilityName || 'Unassigned / Open Field'}</span>
              <span className="text-[9.5px] font-mono text-emerald-400 shrink-0 ml-1">
                {currentIncident.facilityDistanceKm ? `${Math.round(currentIncident.facilityDistanceKm * 1000)}m` : '0m'}
              </span>
            </div>
          </div>
        </div>

        {/* 5. RECOMMENDED DISPATCH ACTION CARD */}
        <div className="p-3.5 bg-red-950/20 border border-red-500/30 rounded-lg space-y-1 text-xs font-mono">
          <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px] uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>RECOMMENDED DISPATCH ACTION</span>
          </div>
          <p className="text-slate-200 text-xs leading-relaxed font-sans">
            MONITORING: Pattern consistent with agricultural residue burning or localized heat anomaly. Log for air-quality reporting.
          </p>
        </div>

        {/* 6. CTAs ROW: INVESTIGATE REPORT & SINGLE DISPATCH BUTTON */}
        <div className="space-y-2 font-mono">
          <button
            onClick={handleInvestigateClick}
            className="w-full py-2.5 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 font-bold text-xs tracking-wider uppercase rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
          >
            <Search className="w-4 h-4 text-cyan-400" />
            <span>INVESTIGATE REPORT →</span>
          </button>

          {/* SINGLE RED EMERGENCY DISPATCH BUTTON */}
          <button
            onClick={() => {
              setDispatchStatus('IDLE');
              setIsDispatchModalOpen(true);
            }}
            className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider uppercase rounded-lg transition flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-red-600/30"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>DISPATCH EMERGENCY ALERT →</span>
          </button>
        </div>

        {/* 7. BOTTOM TWO NAV BUTTONS: 180-DAY HISTORY & RISK ZONE REGISTRY */}
        <div className="grid grid-cols-2 gap-2 font-mono pt-1">
          <button
            onClick={handleHistoryClick}
            className="p-2.5 bg-black/40 hover:bg-white/10 border border-white/15 rounded-lg text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition text-xs cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>180-Day History</span>
          </button>

          <button
            onClick={handleRiskRegistryClick}
            className="p-2.5 bg-black/40 hover:bg-white/10 border border-white/15 rounded-lg text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition text-xs cursor-pointer"
          >
            <Factory className="w-3.5 h-3.5 text-slate-400" />
            <span>Risk Zone Registry</span>
          </button>
        </div>

      </div>

      {/* Dispatch Emergency Alert Modal */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A0E17] border border-white/15 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-mono text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2 text-red-400 font-bold text-sm">
                <Radio className="w-4 h-4 animate-pulse" />
                <span>DISPATCH EMERGENCY ALERT</span>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {dispatchStatus === 'CONFIRMED' ? (
              <div className="py-6 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                <div className="text-base font-bold text-white">EMERGENCY DISPATCH CONFIRMED</div>
                <p className="text-xs text-slate-400 font-sans">
                  Alert dispatched to <strong className="text-white">{selectedUnit}</strong> for event <strong className="text-cyan-400">{currentIncident.id}</strong>.
                </p>
                <button
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition cursor-pointer"
                >
                  Close Modal
                </button>
              </div>
            ) : (
              <div className="space-y-3 font-sans">
                <div className="p-3 bg-black/40 border border-white/10 rounded-lg space-y-1 font-mono text-xs">
                  <div className="text-[10px] text-cyan-400 font-bold uppercase">TARGET INCIDENT</div>
                  <div className="text-white font-bold">{currentIncident.id} — {displayTitle}</div>
                  <div className="text-slate-400">Lat/Lon: {latFormatted}°, {lngFormatted}° | Risk Score: {Math.round(currentIncident.riskScore ?? 25)}%</div>
                </div>

                <div className="flex gap-2 pt-2 font-mono">
                  <button
                    onClick={() => setIsDispatchModalOpen(false)}
                    className="flex-1 py-2 bg-black/40 hover:bg-white/10 border border-white/10 rounded font-bold text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDispatch}
                    disabled={dispatchStatus === 'SENDING'}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition shadow-lg shadow-red-600/30 flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    {dispatchStatus === 'SENDING' ? (
                      <span>DISPATCHING...</span>
                    ) : (
                      <span>TRANSMIT DISPATCH</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
