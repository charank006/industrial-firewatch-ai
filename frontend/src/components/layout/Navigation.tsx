import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Compass,
  Cpu,
  Factory,
  Flame,
  Globe2,
  History,
  Info,
  LayoutDashboard,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/command-center', label: 'Command Center', icon: LayoutDashboard },
  { path: '/incidents', label: 'Incidents', icon: Flame },
  { path: '/map-explorer', label: 'Map Explorer', icon: Compass },
  { path: '/thermal-history', label: 'Thermal History', icon: History },
  { path: '/facility-watch', label: 'Facility Watch', icon: Factory },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { path: '/system-status', label: 'System Status', icon: Cpu },
  { path: '/methodology', label: 'Methodology', icon: BookOpen },
  { path: '/mission-brief', label: 'Mission Brief', icon: Info },
  { path: '/', label: 'Global Overview', icon: Globe2 },
];

export const Navigation: React.FC = () => {
  return (
    <nav className="h-9 bg-[#081019] border-b border-[#253340] px-4 flex items-center overflow-x-auto scrollbar-none z-20 shrink-0 font-mono">
      <div className="flex items-center space-x-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1 rounded text-xs transition whitespace-nowrap ${
                  isActive
                    ? 'bg-[#0D151E] text-[#3DB7D9] border border-[#3DB7D9]/40 font-medium'
                    : 'text-[#A7B4C1] hover:text-slate-200 hover:bg-[#0D151E]/50 border border-transparent'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
