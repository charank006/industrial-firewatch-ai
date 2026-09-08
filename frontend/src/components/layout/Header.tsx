import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, Globe, Globe2, LayoutDashboard, Flame, Factory, Cpu, Search, Radar } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

const WORKSTATION_NAV = [
  { path: '/global-earth', label: 'Global Earth', icon: Globe2 },
  { path: '/command-center', label: 'Operations Room', icon: LayoutDashboard },
  { path: '/incidents', label: 'Incidents Registry', icon: Flame },
  { path: '/facility-watch', label: 'Facility Monitor', icon: Factory },
  { path: '/system-status', label: 'System Status', icon: Cpu },
];

export const Header: React.FC = () => {
  const { filters, setFilters, alerts } = useIntelligence();
  const [timeString, setTimeString] = useState<string>('');
  const location = useLocation();
  const unresolvedCount = alerts.filter((a) => a.isUnresolved).length;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utc = now.toISOString().slice(11, 19) + ' UTC';
      const istStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
      setTimeString(`${istStr} // ${utc}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-13 bg-[#080C14] border-b border-white/10 px-4 flex items-center justify-between z-40 relative shrink-0 font-sans selection:bg-cyan-500/20">
      
      {/* Brand & Workstation Navigation */}
      <div className="flex items-center space-x-5">
        <Link to="/" className="flex items-center space-x-2.5 hover:opacity-90 transition cursor-pointer">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
          <span className="font-mono text-sm font-bold tracking-wider text-white uppercase">
            GEOFLARE <span className="text-cyan-400">AI</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10 hidden xl:inline-block">
            SECTOR 01: GUJARAT
          </span>
        </Link>

        {/* Consolidated Workstation Nav Pills */}
        <nav className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-white/5 font-mono text-xs">
          {WORKSTATION_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Global Telemetry, Controls & Clock */}
      <div className="flex items-center space-x-3 font-mono text-xs">
        
        {/* Orbital Link Badge */}
        <div className="hidden lg:flex items-center space-x-2 text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>VIIRS 375m ORBITAL LINK ACTIVE</span>
        </div>

        {/* Region Selector */}
        <div className="relative hidden md:block">
          <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <select
            value={filters.region}
            onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
            className="pl-8 pr-3 py-1 bg-[#05080E] border border-white/10 text-slate-200 text-xs rounded focus:outline-none focus:border-cyan-400 transition"
          >
            <option value="Gujarat Industrial Corridor">Gujarat Sector 01</option>
            <option value="Permian Petrochemical Zone">Permian Basin (US)</option>
            <option value="Rhine Industrial Belt">Rhine Belt (EU)</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search FW ID, facility..."
            value={filters.searchKeyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchKeyword: e.target.value }))}
            className="pl-8 pr-3 py-1 bg-[#05080E] border border-white/10 text-xs text-slate-200 placeholder-slate-500 rounded w-36 lg:w-44 focus:outline-none focus:border-cyan-400 transition"
          />
        </div>

        {/* Dual Clock */}
        <div className="hidden xl:block text-[11px] text-slate-300 bg-black/40 px-3 py-1 border border-white/10 rounded font-mono">
          {timeString}
        </div>

        {/* Notification Bell */}
        <div className="relative flex items-center justify-center w-8 h-8 rounded bg-[#05080E] border border-white/10 text-slate-300 hover:text-white cursor-pointer transition">
          <Bell className="w-4 h-4" />
          {unresolvedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center shadow">
              {unresolvedCount}
            </span>
          )}
        </div>

      </div>

    </header>
  );
};
