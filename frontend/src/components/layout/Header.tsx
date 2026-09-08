import React, { useEffect, useState } from 'react';
import { Bell, Globe, Radar, Search } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { DATA_SOURCE } from '../../services/api';

export const Header: React.FC = () => {
  const { filters, setFilters, alerts } = useIntelligence();
  const [timeString, setTimeString] = useState<string>('');
  const unresolvedCount = alerts.filter((a) => a.isUnresolved).length;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utc = now.toISOString().slice(11, 19) + ' UTC';
      const istStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
      setTimeString(`${istStr} | ${utc}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-[#060A10] border-b border-[#1E2C3B] px-5 flex items-center justify-between z-30 relative shrink-0 font-sans selection:bg-[#3DB7D9]">
      {/* Brand & Identity */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-[#0E1724] border border-[#1E2C3B] flex items-center justify-center text-[#3DB7D9] shadow-inner">
          <Radar className="w-4 h-4" />
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-bold text-sm tracking-tight text-white uppercase font-mono">
            INDUSTRIAL FIREWATCH <span className="text-[#3DB7D9]">AI</span>
          </span>
          <span className="text-[9.5px] text-[#A7B4C1] px-2 py-0.5 bg-[#0A121E] border border-[#1E2C3B] rounded font-mono font-semibold tracking-wider">
            EARTH OBSERVATION WORKSTATION
          </span>
        </div>
      </div>

      {/* Live Monitoring Badge & Operational Tag */}
      <div className="hidden md:flex items-center space-x-3 font-mono text-xs">
        <div className="flex items-center space-x-2 px-3 py-1 bg-[#0A121E] border border-[#1E2C3B] rounded-md">
          <span className="w-2 h-2 rounded-full bg-[#39B978] shadow-[0_0_8px_#39B978]" />
          <span className="text-[#39B978] font-bold text-[10.5px] tracking-wider uppercase">
            SYSTEM OPERATIONAL
          </span>
        </div>

        <div className="flex items-center space-x-2 px-3 py-1 bg-[#0A121E] border border-[#1E2C3B] rounded-md">
          <span className="text-[10.5px] text-[#E8A93A] font-bold tracking-wider uppercase">
            {DATA_SOURCE === 'api' ? 'LIVE NASA FIRMS \u2022 VIIRS / MODIS' : 'DEMO DATA \u2022 VIIRS 375M'}
          </span>
        </div>
      </div>

      {/* Region Selector & Global Search */}
      <div className="flex items-center space-x-3 font-mono text-xs">
        <div className="relative hidden lg:block">
          <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6F7E8D]" />
          <select
            value={filters.region}
            onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
            className="pl-8 pr-3 py-1 bg-[#0A121E] border border-[#1E2C3B] text-slate-200 text-xs rounded-md focus:outline-none focus:border-[#3DB7D9] transition"
          >
            <option value="Telangana Active AOI">Telangana Active AOI (IN)</option>
            <option value="Gujarat Industrial Corridor">Gujarat Industrial Corridor (IN)</option>
            <option value="Permian Petrochemical Zone">Permian Petrochemical Basin (US)</option>
            <option value="Rhine Industrial Belt">Rhine Industrial Belt (EU)</option>
            <option value="Global">Global (no bounding box)</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6F7E8D]" />
          <input
            type="text"
            placeholder="Search FW ID, facility..."
            value={filters.searchKeyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchKeyword: e.target.value }))}
            className="pl-8 pr-3 py-1 bg-[#0A121E] border border-[#1E2C3B] text-xs text-slate-200 placeholder-[#6F7E8D] rounded-md w-36 sm:w-48 focus:outline-none focus:border-[#3DB7D9] transition"
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
    </header>
  );
};
