import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Factory, ShieldAlert, Activity, ArrowRight } from 'lucide-react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { useIntelligence } from '../../context/IntelligenceContext';

export const FacilityWatchPage: React.FC = () => {
  const { facilities, selectedFacility, setSelectedFacility, selectFacilityById } = useIntelligence();
  const [searchParams] = useSearchParams();
  const facilityParamId = searchParams.get('facilityId');

  React.useEffect(() => {
    if (facilityParamId) {
      selectFacilityById(facilityParamId);
    }
  }, [facilityParamId, selectFacilityById]);

  const activeFac = selectedFacility || facilities[0];

  return (
    <div className="h-[calc(100vh-52px)] w-full bg-[#060910] text-slate-200 font-sans p-4 sm:p-5 flex flex-col space-y-4 overflow-hidden select-none">
      
      {/* Executive Header Banner */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 font-mono shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Factory className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">
              FACILITY MONITOR & THERMAL RADAR
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Critical Petrochemical & Energy Asset Footprint Monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-cyan-400">
            MONITORING <strong className="text-white">{facilities.length} ASSETS</strong> IN GUJARAT
          </div>
        </div>
      </div>

      {/* Main Full-Height Workstation Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        
        {/* Left Column: Asset Registry Queue (4 Cols) */}
        <div className="lg:col-span-4 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col space-y-3 min-h-0 overflow-hidden font-mono text-xs shadow-2xl">
          <div className="flex justify-between items-center border-b border-white/10 pb-2.5 shrink-0">
            <span className="font-bold text-white uppercase tracking-wider text-xs">
              Registered Assets
            </span>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
              SECTOR 01
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {facilities.map((fac) => {
              const isSelected = activeFac.id === fac.id;
              return (
                <div
                  key={fac.id}
                  onClick={() => setSelectedFacility(fac)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-lg border-l-4'
                      : 'bg-black/40 hover:bg-white/[0.04] border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-cyan-400">{fac.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        fac.status === 'ANOMALY_DETECTED'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : fac.status === 'ELEVATED'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}
                    >
                      {fac.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-sans truncate">{fac.location}</p>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-white/10 mt-1">
                    <span>Baseline: <strong className="text-white">{fac.baselineFRP} MW</strong></span>
                    <span>Current: <strong className="text-amber-400">{fac.currentFRP} MW</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Asset Profile & Full-Height Map Canvas (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-4 min-h-0 overflow-hidden">
          
          {/* Asset Telemetry Card */}
          <div className="p-4 bg-[#0A0E17]/90 backdrop-blur-md border border-white/10 rounded-xl space-y-3 font-mono text-xs shrink-0 shadow-xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
              <div>
                <span className="text-[10px] text-cyan-400 uppercase tracking-widest block font-bold">
                  {activeFac.type} &mdash; {activeFac.id}
                </span>
                <h2 className="text-lg font-bold text-white tracking-wide font-sans">{activeFac.name}</h2>
              </div>
              <span
                className={`px-3 py-1 rounded text-xs font-bold ${
                  activeFac.status === 'ANOMALY_DETECTED'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                }`}
              >
                STATUS: {activeFac.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-black/40 border border-white/10 rounded-lg">
                <span className="text-[9.5px] text-slate-400 block uppercase">BASELINE FRP</span>
                <span className="text-base font-bold text-cyan-400">{activeFac.baselineFRP} MW</span>
              </div>
              <div className="p-2.5 bg-black/40 border border-white/10 rounded-lg">
                <span className="text-[9.5px] text-slate-400 block uppercase">CURRENT FRP</span>
                <span className="text-base font-bold text-amber-400">{activeFac.currentFRP} MW</span>
              </div>
              <div className="p-2.5 bg-black/40 border border-white/10 rounded-lg">
                <span className="text-[9.5px] text-slate-400 block uppercase">RISK RADIUS</span>
                <span className="text-base font-bold text-emerald-400">{activeFac.riskBufferRadiusKm} KM</span>
              </div>
              <div className="p-2.5 bg-black/40 border border-white/10 rounded-lg">
                <span className="text-[9.5px] text-slate-400 block uppercase">EMERGENCY DISPATCH</span>
                <span className="text-xs font-bold text-slate-200 truncate block mt-0.5">{activeFac.emergencyContact}</span>
              </div>
            </div>
          </div>

          {/* Full-Height Proportional Map Viewport */}
          <div className="flex-1 rounded-xl overflow-hidden border border-white/10 relative shadow-2xl min-h-0">
            <GISMapLibre height="h-full" />
          </div>

        </div>

      </div>

    </div>
  );
};
