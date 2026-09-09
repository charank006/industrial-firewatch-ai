import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Factory,
  Radio,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { ReasoningFlow } from './ReasoningFlow';
import { ProbabilityDistributionCard } from './ProbabilityDistributionCard';

export const IntelligenceDrawer: React.FC = () => {
  const { selectedIncident, selectFacilityById, filteredHotspots, facilities } = useIntelligence();
  const navigate = useNavigate();

  // Dispatch Operational Alert Modal State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [selectedUnit, setSelectedUnit] = useState<string>('REGIONAL INDUSTRIAL EMERGENCY RESPONSE SQUAD');
  const [dispatchStatus, setDispatchStatus] = useState<'IDLE' | 'SENDING' | 'CONFIRMED'>('IDLE');
  const [dispatchNote, setDispatchNote] = useState<string>('');

  const currentIncident = selectedIncident || filteredHotspots[0];

  if (!currentIncident) {
    return (
      <div className="w-full h-full p-5 flex flex-col justify-between font-mono text-xs text-slate-300 select-none">
        <div className="space-y-3">
          <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
            ALL INDIA EARTH OBSERVATION SYSTEM
          </div>
          <h3 className="text-base font-bold text-white">Active Satellite Monitoring</h3>
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Continuous thermal satellite monitoring active. Select an anomaly event on the basemap or left queue to inspect classification telemetry.
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
    if (currentIncident.nearestFacilityId) {
      selectFacilityById(currentIncident.nearestFacilityId);
      navigate(`/facility-watch?facilityId=${currentIncident.nearestFacilityId}`);
    }
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

  const riskVal = currentIncident.riskScore ?? (currentIncident.severity === 'CRITICAL' ? 85 : currentIncident.severity === 'HIGH' ? 65 : 35);
  const riskLevel = currentIncident.riskLevel || (riskVal >= 75 ? 'EXTREME' : riskVal >= 50 ? 'HIGH' : riskVal >= 30 ? 'MODERATE' : 'LOW');
  
  const facilityDistanceText = currentIncident.facilityDistanceKm != null
    ? currentIncident.facilityDistanceKm < 1
      ? `${Math.round(currentIncident.facilityDistanceKm * 1000)} m`
      : `${currentIncident.facilityDistanceKm.toFixed(1)} km`
    : '500 m';

  const spatialFenceLabel = currentIncident.facilityDistanceKm != null && currentIncident.facilityDistanceKm <= 0.5
    ? 'INSIDE PLANT FENCE'
    : currentIncident.facilityDistanceKm != null && currentIncident.facilityDistanceKm <= 1.5
    ? 'INSIDE 1km INDUSTRIAL ZONE'
    : 'REGIONAL BUFFER';

  return (
    <div className="w-full h-full p-4 flex flex-col justify-between font-sans text-xs text-slate-100 select-none overflow-y-auto custom-scrollbar relative">
      
      <div className="space-y-3.5">
        
        {/* Header Profile */}
        <div className="border-b border-white/10 pb-3 flex justify-between items-start font-mono">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
              <span>INCIDENT INTEL PROFILE</span>
            </span>
            <h3 className="text-base font-bold text-white mt-0.5 font-sans tracking-wide">
              {currentIncident.classification.replace(/_/g, ' ').toUpperCase()}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{currentIncident.locationName}</p>
          </div>

          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
              riskLevel === 'EXTREME' || currentIncident.severity === 'CRITICAL'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : riskLevel === 'HIGH' || currentIncident.severity === 'HIGH'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                : riskLevel === 'MODERATE'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}
          >
            {riskLevel} RISK ({Math.round(riskVal)})
          </span>
        </div>

        {/* Assessed Risk Score Progress Bar */}
        <div className="p-3 bg-[#080E17] border border-white/10 rounded-lg space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>5-COMPONENT RISK SCORE</span>
            </span>
            <span className="font-bold text-sm text-red-400">
              {Math.round(riskVal)} / 100
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                riskVal >= 70 ? 'bg-red-500' : riskVal >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, riskVal))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
            <span>SPATIAL FENCE: <strong className="text-cyan-300 font-semibold">{spatialFenceLabel}</strong></span>
            <span>PROXIMITY: <strong className="text-amber-400 font-semibold">{facilityDistanceText}</strong></span>
          </div>
        </div>

        {/* 4 Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">FRP MW POWER</div>
            <div className="text-base font-bold text-white mt-0.5">{currentIncident.frpMw.toFixed(1)} MW</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">BRIGHTNESS TEMP</div>
            <div className="text-base font-bold text-amber-400 mt-0.5">{currentIncident.brightnessK.toFixed(1)} K</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">VIIRS SENSOR CONF</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">{currentIncident.confidence}%</div>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
            <div className="text-[9.5px] text-slate-400 uppercase">LIGHTGBM ML CONF</div>
            <div className="text-base font-bold text-cyan-400 mt-0.5">
              {currentIncident.mlConfidenceRate ?? Math.round((currentIncident.predictedProbability ?? 0.85) * 100)}%
            </div>
          </div>
        </div>

        {/* Nearest Facility Proximity Card */}
        <div className="p-3 bg-black/40 border border-white/10 rounded-lg space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center space-x-1">
              <Factory className="w-3.5 h-3.5" />
              <span>IMPACTED FACILITY</span>
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
          <div className="flex justify-between text-[10.5px] text-slate-400 pt-1 border-t border-white/10">
            <span>FACILITY TYPE: <strong className="text-white">{currentIncident.nearestFacilityType || 'Industrial Asset'}</strong></span>
            <span>DISTANCE: <strong className="text-amber-400">{facilityDistanceText}</strong></span>
          </div>
        </div>

        {/* 6-Class Probability Distribution */}
        <ProbabilityDistributionCard incident={currentIncident} />

        {/* Explainable AI Reasoning Flow */}
        <ReasoningFlow
          steps={currentIncident.reasoningSteps}
          classification={currentIncident.classification}
          confidence={currentIncident.confidence}
          onDispatchAlert={() => {
            setDispatchStatus('IDLE');
            setIsDispatchModalOpen(true);
          }}
          severity={currentIncident.severity}
        />

        {/* Recommended Action Card */}
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-1 text-xs font-mono">
          <div className="flex items-center space-x-1.5 text-red-400 font-bold text-[11px] uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>DISPATCH CHECKLIST</span>
          </div>
          <p className="text-slate-200 text-xs leading-relaxed font-sans">
            {currentIncident.suggestedAction}
          </p>
        </div>

      </div>

      {/* Action Navigation Buttons */}
      <div className="pt-3 mt-3 border-t border-white/10 space-y-2 font-mono shrink-0">
        <button
          onClick={handleInvestigateClick}
          className="w-full py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold text-xs tracking-wider uppercase rounded transition flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_12px_rgba(56,189,248,0.2)]"
        >
          <Search className="w-4 h-4 text-cyan-400" />
          <span>Investigate Audit Report →</span>
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
                  Alert dispatched to <strong className="text-white">{selectedUnit}</strong> for event <strong className="text-cyan-400">{currentIncident.id}</strong> ({currentIncident.classification}).
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
                  <div className="text-white font-bold">{currentIncident.id} — {currentIncident.classification}</div>
                  <div className="text-slate-400">{currentIncident.locationName} | Risk Score: {Math.round(riskVal)}/100</div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">SELECT RESPONSE SQUAD / UNIT</label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full p-2 bg-[#05080D] border border-white/10 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="REGIONAL INDUSTRIAL RESPONSE SQUAD">REGIONAL INDUSTRIAL RESPONSE SQUAD</option>
                    <option value="STATE FIRE & RESCUE SERVICES">STATE FIRE & RESCUE SERVICES</option>
                    <option value="HAZMAT INDUSTRIAL SAFETY TEAM">HAZMAT INDUSTRIAL SAFETY TEAM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">DISPATCH OPERATIONAL NOTES</label>
                  <textarea
                    rows={3}
                    placeholder="Enter dispatch directions or perimeter cautions..."
                    value={dispatchNote}
                    onChange={(e) => setDispatchNote(e.target.value)}
                    className="w-full p-2 bg-[#05080D] border border-white/10 rounded text-slate-200 font-sans text-xs focus:outline-none focus:border-cyan-400"
                  />
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
