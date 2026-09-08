import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Factory,
  History,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { ReasoningFlow } from './ReasoningFlow';

export const IntelligenceDrawer: React.FC = () => {
  const { selectedIncident, selectFacilityById, filteredHotspots, facilities } = useIntelligence();
  const navigate = useNavigate();

  // Dispatch Operational Alert Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [selectedUnit, setSelectedUnit] = useState<string>('SURAT INDUSTRIAL FIRE SQUAD - ALPHA');
  const [dispatchStatus, setDispatchStatus] = useState<'IDLE' | 'SENDING' | 'CONFIRMED'>('IDLE');
  const [dispatchNote, setDispatchNote] = useState<string>('');

  const currentIncident = selectedIncident || filteredHotspots[0];

  if (!currentIncident) {
    return (
      <div className="w-full h-full p-5 flex flex-col justify-between font-mono text-xs text-slate-300">
        <div className="space-y-3">
          <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
            SECTOR 01 INTELLIGENCE PROFILE
          </div>
          <h3 className="text-base font-bold text-white">Gujarat Industrial Corridor</h3>
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Continuous satellite thermal monitoring active. Select an active thermal anomaly pin on the basemap to inspect observation telemetry.
          </p>
        </div>

        <div className="p-3 bg-black/40 border border-white/10 rounded-lg space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">REGISTERED ASSETS:</span>
            <span className="text-white font-bold">{facilities.length} Facilities</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ACTIVE ANOMALIES:</span>
            <span className="text-red-400 font-bold">{filteredHotspots.length} Detected</span>
          </div>
        </div>
      </div>
    );
  }

  const handleFacilityClick = () => {
    selectFacilityById(currentIncident.nearestFacilityId);
    navigate(`/facility-watch?facilityId=${currentIncident.nearestFacilityId}`);
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

  return (
    <div className="w-full h-full p-5 flex flex-col justify-between font-sans text-xs text-slate-100 select-none overflow-y-auto relative">
      
      <div className="space-y-4">
        
        {/* Header Profile */}
        <div className="border-b border-white/10 pb-3 flex justify-between items-start font-mono">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">
              OBSERVATION PROFILE
            </span>
            <h3 className="text-base font-bold text-white mt-0.5 font-sans">
              {currentIncident.classification}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{currentIncident.locationName}</p>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              currentIncident.severity === 'HIGH' || currentIncident.severity === 'CRITICAL'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}
          >
            {currentIncident.severity} PRIORITY
          </span>
        </div>

        {/* 4 Clean Metric Tiles */}
        <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">RADIATIVE POWER</div>
            <div className="text-base font-bold text-white mt-0.5">{currentIncident.frpMw} MW</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">BRIGHTNESS TEMP</div>
            <div className="text-base font-bold text-amber-400 mt-0.5">{currentIncident.brightnessK} K</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">VIIRS CONFIDENCE</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">{currentIncident.confidence}%</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">FACILITY OFFSET</div>
            <div className="text-base font-bold text-white mt-0.5">
              {Math.round(currentIncident.facilityDistanceKm * 1000)}m
            </div>
          </div>
        </div>

        {/* Nearest Facility Proximity Card */}
        <div className="p-3 bg-black/40 border border-white/10 rounded-lg space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center space-x-1">
              <Factory className="w-3.5 h-3.5" />
              <span>NEAREST FACILITY</span>
            </span>
            <button
              onClick={handleFacilityClick}
              className="text-[10px] text-cyan-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
            >
              <span>Inspect Facility</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="font-semibold text-white font-sans text-sm">{currentIncident.nearestFacilityName}</div>
          <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-white/10">
            <span>PROXIMITY DISTANCE:</span>
            <span className="text-amber-400 font-bold">
              {currentIncident.facilityDistanceKm} km ({Math.round(currentIncident.facilityDistanceKm * 1000)}m)
            </span>
          </div>
        </div>

        {/* Explainable Reasoning Flow - 3-Part Confidence Verification Breakdown */}
        <ReasoningFlow
          steps={currentIncident.reasoningSteps}
          classification={currentIncident.classification}
          confidence={currentIncident.confidence}
          onDispatchAlert={() => {
            setDispatchStatus('IDLE');
            setIsDispatchModalOpen(true);
          }}
        />

        {/* Recommended Action Card */}
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-1 text-xs font-mono">
          <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px] uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>RECOMMENDED DISPATCH ACTION</span>
          </div>
          <p className="text-slate-200 text-xs leading-relaxed font-sans">
            {currentIncident.suggestedAction}
          </p>
        </div>

      </div>

      {/* Action Buttons */}
      <div className="pt-4 border-t border-white/10 space-y-2 font-mono shrink-0">
        <button
          onClick={handleInvestigateClick}
          className="w-full py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold text-xs tracking-wider uppercase rounded transition flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.2)]"
        >
          <Search className="w-4 h-4 text-cyan-400" />
          <span>Investigate Report →</span>
        </button>

        <button
          onClick={() => {
            setDispatchStatus('IDLE');
            setIsDispatchModalOpen(true);
          }}
          className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider uppercase rounded transition-colors shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Radio className="w-4 h-4 animate-pulse" />
          <span>Dispatch Emergency Alert →</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleHistoryClick}
            className="py-2 px-2 bg-black/40 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded transition flex items-center justify-center space-x-1 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>180-Day History</span>
          </button>

          <button
            onClick={handleFacilityClick}
            className="py-2 px-2 bg-black/40 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded transition flex items-center justify-center space-x-1 cursor-pointer"
          >
            <Factory className="w-3.5 h-3.5" />
            <span>Facility Watch</span>
          </button>
        </div>
      </div>

      {/* INTERACTIVE EMERGENCY DISPATCH MODAL */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#080C14] border border-red-500/50 rounded-xl p-6 max-w-md w-full space-y-5 shadow-2xl font-mono text-xs">
            
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2 text-red-400 font-bold">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                <span className="text-sm">EMERGENCY DISPATCH AUTHORIZATION</span>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {dispatchStatus === 'CONFIRMED' ? (
              <div className="p-6 text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                <div className="text-base font-bold text-white">DISPATCH CONFIRMED & BROADCAST</div>
                <p className="text-xs text-slate-300 font-sans">
                  Emergency alert broadcasted to <strong>{selectedUnit}</strong> for incident <strong>{currentIncident.id}</strong> at {currentIncident.nearestFacilityName}.
                </p>
                <button
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase rounded cursor-pointer"
                >
                  Close & Return to Workstation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="text-slate-400 text-[10px]">INCIDENT ID & TARGET:</div>
                  <div className="text-sm font-bold text-white">{currentIncident.id} &bull; {currentIncident.classification}</div>
                  <div className="text-cyan-400 text-xs">{currentIncident.nearestFacilityName}</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px] uppercase font-bold block">
                    SELECT EMERGENCY RESPONSE TEAM:
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full p-2.5 rounded bg-black border border-white/20 text-slate-200 text-xs focus:outline-none focus:border-red-500"
                  >
                    <option value="SURAT INDUSTRIAL FIRE SQUAD - ALPHA">Surat Industrial Fire Squad - Unit Alpha</option>
                    <option value="HAZIRA COASTAL PETROCHEM RESPONSE">Hazira Coastal Petrochem Rapid Response</option>
                    <option value="GUJARAT STATE INDUSTRIAL SAFETY TEAM">Gujarat State Industrial Safety Corps</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px] uppercase font-bold block">
                    DISPATCH TACTICAL NOTES:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter tactical observations, wind direction, or asset perimeter details..."
                    value={dispatchNote}
                    onChange={(e) => setDispatchNote(e.target.value)}
                    className="w-full p-2.5 rounded bg-black border border-white/20 text-slate-200 text-xs focus:outline-none focus:border-red-500 font-sans"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => setIsDispatchModalOpen(false)}
                    className="w-1/2 py-2.5 rounded border border-white/20 text-slate-300 hover:bg-white/10 uppercase font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDispatch}
                    disabled={dispatchStatus === 'SENDING'}
                    className="w-1/2 py-2.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold uppercase shadow-[0_0_20px_rgba(239,68,68,0.5)] cursor-pointer"
                  >
                    {dispatchStatus === 'SENDING' ? 'Broadcasting...' : 'Confirm Dispatch →'}
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
