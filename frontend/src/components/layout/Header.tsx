import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Globe, Search, Radar, RefreshCw } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

export const Header: React.FC = () => {
  const {
    filters,
    setFilters,
    alerts,
    metrics,
    isSyncing,
    lastSyncedAt,
    syncNotification,
    syncLiveFIRMS,
    dismissSyncNotification,
  } = useIntelligence();
  const unresolvedCount = alerts.filter((a) => a.isUnresolved).length;
  const [timeString, setTimeString] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      const utc = now.toUTCString().replace('GMT', 'UTC');

      const ist = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setTimeString(`${ist} IST | ${utc.slice(17, 25)} UTC`);
    };

    updateTime();

    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-[#060A10] border-b border-[#1E2C3B] px-5 flex items-center justify-between z-30 relative shrink-0 font-sans selection:bg-[#3DB7D9]">
      {/* Brand & Identity */}
      <div className="flex items-center space-x-3">
        <Link
          to="/"
          className="flex items-center space-x-2.5 hover:opacity-90 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0E1724] border border-[#1E2C3B] flex items-center justify-center text-[#3DB7D9] shadow-inner">
            <Radar className="w-4 h-4" />
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white uppercase font-mono">
              GEOFLARE <span className="text-[#3DB7D9]">AI</span>
            </span>

            <span className="text-[9.5px] text-[#A7B4C1] px-2 py-0.5 bg-[#0A121E] border border-[#1E2C3B] rounded font-mono font-semibold tracking-wider">
              EARTH OBSERVATION WORKSTATION
            </span>
          </div>
        </Link>
      </div>

      {/* Live Monitoring Badge & Sync Now Action */}
      <div className="hidden md:flex items-center space-x-3 font-mono text-xs">
        {/* System Status */}
        <div className="flex items-center space-x-2 px-3 py-1 bg-[#0A121E] border border-[#1E2C3B] rounded-md">
          <span className="w-2 h-2 rounded-full bg-[#39B978] shadow-[0_0_8px_#39B978]" />
          <span className="text-[#39B978] font-bold text-[10.5px] tracking-wider uppercase">
            SYSTEM OPERATIONAL
          </span>
        </div>

        {/* Sync Now Interactive Button */}
        <button
          id="sync-live-firms-button"
          onClick={syncLiveFIRMS}
          disabled={isSyncing}
          title={`Synchronize in real-time with NASA FIRMS satellite constellation for India (${metrics.totalDetected} live points)`}
          className={`flex items-center space-x-2 px-3 py-1 rounded-md border font-mono text-xs font-bold transition-all duration-200 shadow-md ${
            isSyncing
              ? 'bg-cyan-950/80 border-cyan-500/70 text-cyan-300 cursor-wait animate-pulse'
              : 'bg-[#0A121E] hover:bg-[#111F30] border-cyan-500/40 hover:border-cyan-400 text-white cursor-pointer hover:shadow-[0_0_12px_rgba(56,189,248,0.3)]'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#3DB7D9] ${isSyncing ? 'animate-spin text-cyan-300' : ''}`} />
          <span className="tracking-wider uppercase text-[10.5px] text-[#3DB7D9]">
            {isSyncing ? 'SYNCING...' : 'SYNC NOW'}
          </span>
          <span className="text-[9.5px] px-1.5 py-0.2 bg-[#0E1724] border border-[#1E2C3B] text-amber-400 font-bold rounded">
            {metrics.totalDetected} LIVE PTS
          </span>
        </button>
      </div>

      {/* Region Selector, Search & Live Clock */}
      <div className="flex items-center space-x-3 font-mono text-xs">
        {/* Region Selector */}
        <div className="relative hidden lg:block">
          <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6F7E8D]" />
          <select
            value={filters.region}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                region: e.target.value,
              }))
            }
            className="pl-8 pr-3 py-1 bg-[#0A121E] border border-[#1E2C3B] text-slate-200 text-xs rounded-md focus:outline-none focus:border-[#3DB7D9] transition"
          >
            <option value="All India (Pan-India)">
              All India Pan-India (IN)
            </option>
            <option value="Telangana Active AOI">
              Telangana Active AOI (IN)
            </option>
            <option value="Gujarat Industrial Corridor">
              Gujarat Industrial Corridor (IN)
            </option>
            <option value="Punjab / Northern Stubble Belt">
              Punjab / Northern Stubble (IN)
            </option>
            <option value="Central India Forests (MP/Odisha)">
              Central India Forests (IN)
            </option>
            <option value="Permian Petrochemical Zone">
              Permian Petrochemical Basin (US)
            </option>
            <option value="Rhine Industrial Belt">
              Rhine Industrial Belt (EU)
            </option>
            <option value="Global">
              Global (no bounding box)
            </option>
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6F7E8D]" />
          <input
            type="text"
            placeholder="Search FIRMS ID, site..."
            value={filters.searchKeyword}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                searchKeyword: e.target.value,
              }))
            }
            className="pl-8 pr-3 py-1 bg-[#0A121E] border border-[#1E2C3B] text-xs text-slate-200 placeholder-[#6F7E8D] rounded-md w-36 sm:w-44 focus:outline-none focus:border-[#3DB7D9] transition"
          />
        </div>

        {/* Live Clock */}
        <div className="hidden xl:block text-[10.5px] text-[#A7B4C1] bg-[#0A121E] px-3 py-1 border border-[#1E2C3B] rounded-md font-mono">
          {timeString}
        </div>

        {/* Notification Counter */}
        <div className="relative flex items-center justify-center w-8 h-8 rounded-md bg-[#0A121E] border border-[#1E2C3B] text-slate-300 hover:text-white cursor-pointer transition">
          <Bell className="w-4 h-4" />
          {unresolvedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F04438] text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center shadow">
              {unresolvedCount}
            </span>
          )}
        </div>
      </div>

      {/* Real-time Sync Status Notification Banner */}
      {syncNotification && (
        <div className="absolute top-14 left-0 right-0 z-50 bg-[#071322]/95 backdrop-blur border-b border-cyan-500/40 px-5 py-2 flex items-center justify-between text-xs font-mono text-cyan-200 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>{syncNotification}</span>
          </div>
          <div className="flex items-center space-x-3 text-[10.5px]">
            <span className="text-slate-400 font-mono">{lastSyncedAt}</span>
            <button
              onClick={dismissSyncNotification}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </header>
  );
};