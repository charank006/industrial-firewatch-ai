import React, { useState } from 'react';
import { useIntelligence } from '../../context/IntelligenceContext';
import {
  Satellite,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Trash2,
  Layers,
  X,
  Zap,
} from 'lucide-react';

export const FirmsLiveSyncModal: React.FC = () => {
  const {
    firmsStatus,
    isSyncingFirms,
    isFirmsModalOpen,
    setIsFirmsModalOpen,
    syncNASAData,
  } = useIntelligence();

  const [selectedArea, setSelectedArea] = useState<string>('IND');
  const [selectedSensors, setSelectedSensors] = useState<string[]>([
    'VIIRS_SNPP_NRT',
    'VIIRS_NOAA20_NRT',
    'VIIRS_NOAA21_NRT',
  ]);
  const [daysLookback, setDaysLookback] = useState<number>(1);
  const [clearExisting, setClearExisting] = useState<boolean>(true);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  if (!isFirmsModalOpen) return null;

  const toggleSensor = (sensor: string) => {
    if (selectedSensors.includes(sensor)) {
      if (selectedSensors.length > 1) {
        setSelectedSensors(selectedSensors.filter((s) => s !== sensor));
      }
    } else {
      setSelectedSensors([...selectedSensors, sensor]);
    }
  };

  const handleSync = async () => {
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await syncNASAData({
        sources: selectedSensors,
        area: selectedArea,
        days: daysLookback,
        clear_existing: clearExisting,
      });
      setSyncResult(res);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
        setSyncError('Cannot connect to GeoFlare Backend server. Please ensure the backend is running on http://localhost:8000.');
      } else {
        setSyncError(msg || 'Satellite telemetry synchronization encountered an error.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#090D14] border border-[#1E2C3B] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2C3B] bg-[#05080E]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Satellite className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-wide">NASA FIRMS Satellite Telemetry</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full">
                  LIVE ORBITAL STREAM
                </span>
              </div>
              <p className="text-xs text-[#8E9CAE]">
                Direct VIIRS & MODIS satellite active thermal observation sync
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsFirmsModalOpen(false)}
            className="p-2 rounded-lg text-[#8E9CAE] hover:text-white hover:bg-[#141F2D] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status Bar */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-[#05080E] border border-[#1E2C3B] rounded-xl">
            <div>
              <span className="text-[10px] font-mono text-[#6F7E8D] uppercase tracking-wider block">Satellite Link</span>
              <div className="flex items-center space-x-1.5 mt-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-semibold text-emerald-400 font-mono">
                  Online & Connected
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-mono text-[#6F7E8D] uppercase tracking-wider block">Active Detections</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                {firmsStatus?.total_events_in_db ?? 0} Hotspots Tracked
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-[#6F7E8D] uppercase tracking-wider block">Auto Scheduler</span>
              <div className="flex items-center space-x-1 mt-1">
                <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span className="text-xs font-medium text-blue-400">Every 2m (Live Stream)</span>
              </div>
            </div>
          </div>

          {/* Sync Options Form */}
          <div className="space-y-4">
            {/* Target Geographic Area */}
            <div>
              <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                <Globe className="w-3.5 h-3.5 text-[#3DB7D9]" />
                <span>Geographic Target Territory</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'IND', label: 'India Nationwide', sub: 'Strict India Sovereignty (Excludes SL/China)' },
                  { id: 'GUJARAT', label: 'Gujarat Corridor', sub: 'Surat, Hazira, Dahej, Vapi' },
                  { id: 'WORLD', label: 'Global (World)', sub: 'Planetary observation feed' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedArea(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedArea === item.id
                        ? 'bg-orange-500/10 border-orange-500/40 text-white shadow-inner'
                        : 'bg-[#05080E] border-[#1E2C3B] text-[#8E9CAE] hover:border-[#2D4258]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">{item.label}</div>
                    <div className="text-[10px] text-[#6F7E8D] truncate mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Satellite Sensors Selection */}
            <div>
              <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Satellite Constellation Sensor Streams</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'VIIRS_SNPP_NRT', name: 'VIIRS Suomi NPP', res: '375m I-Band (High Res)' },
                  { id: 'VIIRS_NOAA20_NRT', name: 'VIIRS NOAA-20 (JPSS-1)', res: '375m I-Band (High Res)' },
                  { id: 'VIIRS_NOAA21_NRT', name: 'VIIRS NOAA-21 (JPSS-2)', res: '375m I-Band (High Res)' },
                  { id: 'MODIS_NRT', name: 'MODIS Terra & Aqua', res: '1km Radiative Pixel' },
                ].map((sensor) => {
                  const isChecked = selectedSensors.includes(sensor.id);
                  return (
                    <button
                      key={sensor.id}
                      type="button"
                      onClick={() => toggleSensor(sensor.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        isChecked
                          ? 'bg-purple-500/10 border-purple-500/30 text-white'
                          : 'bg-[#05080E] border-[#1E2C3B] text-[#6F7E8D] hover:border-[#2D4258]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium text-white">{sensor.name}</div>
                        <div className="text-[10px] text-[#6F7E8D]">{sensor.res}</div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isChecked
                            ? 'bg-purple-500 border-purple-400 text-black'
                            : 'border-[#1E2C3B] bg-[#05080E]'
                        }`}
                      >
                        {isChecked && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lookback & Clean Slate Options */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 font-mono">Lookback Window</label>
                <div className="flex space-x-1.5">
                  {[1, 2, 3, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDaysLookback(d)}
                      className={`flex-1 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                        daysLookback === d
                          ? 'bg-orange-500 text-black font-bold border-orange-400'
                          : 'bg-[#05080E] border-[#1E2C3B] text-[#8E9CAE] hover:bg-[#141F2D]'
                      }`}
                    >
                      {d} {d === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 font-mono">Stream Feed Mode</label>
                <button
                  type="button"
                  onClick={() => setClearExisting(!clearExisting)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    clearExisting
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-[#05080E] border-[#1E2C3B] text-[#8E9CAE]'
                  }`}
                >
                  <span className="flex items-center space-x-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Fresh Exclusive Sync</span>
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0A121E]">
                    {clearExisting ? 'STRICT LIVE' : 'APPEND'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Sync Feedback */}
          {syncError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold block">Satellite Telemetry Sync Notice</span>
                <span className="text-[11px] opacity-90">{syncError}</span>
              </div>
            </div>
          )}

          {syncResult && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
              <div className="flex items-center space-x-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{syncResult.message}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300 pt-1 border-t border-emerald-500/20">
                <div>
                  <span className="text-[#6F7E8D] block">Total Fetched</span>
                  <span className="font-bold text-white">{syncResult.total_fetched}</span>
                </div>
                <div>
                  <span className="text-[#6F7E8D] block">Processed (ML)</span>
                  <span className="font-bold text-white">{syncResult.processed_count}</span>
                </div>
                <div>
                  <span className="text-[#6F7E8D] block">Active in DB</span>
                  <span className="font-bold text-white">{syncResult.total_events_in_db}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E2C3B] bg-[#05080E]">
          <div className="text-[11px] text-[#6F7E8D] font-mono">
            VIIRS 375m Active Fire Satellite Constellation
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setIsFirmsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-[#8E9CAE] hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isSyncingFirms}
              onClick={handleSync}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isSyncingFirms ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synchronizing Satellite Telemetry...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Sync Satellite Telemetry Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
