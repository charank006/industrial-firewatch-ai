import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Globe2,
  LayoutDashboard,
  Flame,
  Factory,
  Cpu,
} from 'lucide-react';

const CORE_WORKSTATIONS = [
  { path: '/', label: 'Global Earth', icon: Globe2, badge: '3D WebGL' },
  { path: '/command-center', label: 'Operations Room', icon: LayoutDashboard, badge: 'LIVE' },
  { path: '/incidents', label: 'Incidents Registry', icon: Flame, badge: 'ACTIVE' },
  { path: '/facility-watch', label: 'Facility Monitor', icon: Factory, badge: 'ASSETS' },
  { path: '/system-status', label: 'System Status & Methodology', icon: Cpu, badge: 'READY' },
];

export const Navigation: React.FC = () => {
  return (
    <nav className="h-10 bg-[#060A10] border-b border-[#1E2C3B] px-4 flex items-center justify-between z-20 shrink-0 font-mono text-xs selection:bg-[#3DB7D9]">
      <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none py-1">
        {CORE_WORKSTATIONS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-2 px-3 py-1 rounded text-xs transition whitespace-nowrap border ${
                  isActive
                    ? 'bg-[#0E1724] text-[#3DB7D9] border-[#3DB7D9]/50 font-bold shadow-[0_0_12px_rgba(61,183,217,0.15)]'
                    : 'text-[#A7B4C1] hover:text-slate-200 hover:bg-[#0E1724]/60 border-transparent'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#05080D] text-[#6F7E8D] border border-[#1E2C3B] uppercase">
                {item.badge}
              </span>
            </NavLink>
          );
        })}
      </div>

      <div className="hidden lg:flex items-center space-x-3 text-[11px] text-[#A7B4C1]">
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#0A121E] border border-[#1E2C3B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#39B978] animate-pulse" />
          <span>GUJARAT SECTOR 01</span>
        </div>
      </div>
    </nav>
  );
};
