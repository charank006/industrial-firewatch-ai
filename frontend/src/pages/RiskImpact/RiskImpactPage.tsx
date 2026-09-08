import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crosshair,
  PhoneCall,
  Send,
  Shield,
  Users,
} from 'lucide-react';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { ImpactPanel, SurroundingsPanel } from '../../components/intelligence/AnalysisPanels';
import { useIntelligence } from '../../context/IntelligenceContext';

export const RiskImpactPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedIncident, analysis, dataSource } = useIntelligence();
  const [radiusMeters, setRadiusMeters] = useState<number>(1000);

  const incident = selectedIncident || {
    id: 'FW-BETA-1042',
    classification: 'Industrial Fire',
    severity: 'HIGH',
    locationName: 'Surat Petrochemical Industrial Zone',
    lat: 21.1738,
    lng: 72.8345,
    frpMw: 184.6,
  };

  const AFFECTED_USERS = [
    { id: 'USR-001', name: 'Rajesh Patel', phone: '+91 98250 XXX23', distance: 420, optIn: true },
    { id: 'USR-002', name: 'Ananya Sharma', phone: '+91 98791 XXX56', distance: 680, optIn: true },
    { id: 'USR-003', name: 'Vikram Desai', phone: '+91 94260 XXX89', distance: 850, optIn: true },
    { id: 'USR-004', name: 'Priya Mehta', phone: '+91 98241 XXX45', distance: 940, optIn: true },
  ];

  const EMERGENCY_SERVICES = [
    { id: 'EMG-001', name: 'Surat District Fire Control (112)', category: 'fire', phone: '112 / +91 261 2244100', distance: 1200 },
    { id: 'EMG-002', name: 'Hazira GIDC Emergency Station', category: 'fire', phone: '+91 261 2860101', distance: 1800 },
    { id: 'EMG-003', name: 'Surat Civil Hospital ICU Unit', category: 'ambulance', phone: '108 / +91 261 2242000', distance: 2400 },
    { id: 'EMG-004', name: 'Surat Petrochem Safety Control', category: 'facility', phone: '+91 261 2901111', distance: 420 },
  ];

  const handleAuthorizeAlert = () => {
    navigate(`/alerts?incidentId=${incident.id}&radius=${radiusMeters}`);
  };

  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-[#F1F4F6]">
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#253340] pb-4 font-mono">
        <div>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-[#3DB7D9]" />
            <h1 className="text-xl font-semibold text-white tracking-wide">
              SPATIAL RISK & POPULATION IMPACT WORKSPACE
            </h1>
          </div>
          <p className="text-xs text-[#A7B4C1] mt-1">
            {dataSource === 'api'
              ? 'POSTGIS ST_DWITHIN SPATIAL QUERY & WIND-AWARE PLUME MODELLING'
              : 'DEMO DATA — POSTGIS SPATIAL QUERY ACTIVE IN LIVE MODE'}
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="text-[#A7B4C1]">DANGER RADIUS:</span>
          <select
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10))}
            className="bg-[#081019] border border-[#253340] text-[#3DB7D9] font-bold rounded px-3 py-1 focus:outline-none"
          >
            <option value={500}>500 Meters (Critical Zone)</option>
            <option value={1000}>1,000 Meters (1 km Radius)</option>
            <option value={2000}>2,000 Meters (2 km Radius)</option>
            <option value={5000}>5,000 Meters (5 km Sector)</option>
          </select>
        </div>
      </div>

      {/* Pipeline impact assessment. Renders only when the selected event has
          been analysed; the emergency-contact workspace below is unchanged. */}
      {(analysis?.impact || analysis?.surroundings) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ImpactPanel impact={analysis?.impact ?? null} />
          <SurroundingsPanel surroundings={analysis?.surroundings ?? null} />
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left GIS Map View (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between font-mono text-xs px-1">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <Crosshair className="w-4 h-4 text-[#3DB7D9]" />
                <span>SPATIAL DANGER BUFFER MAP ({radiusMeters}m RADIUS)</span>
              </span>
              <span className="text-[#E8A93A] font-bold">INCIDENT: {incident.id}</span>
            </div>

            <div className="h-[460px] rounded-lg overflow-hidden border border-[#253340] relative">
              <GISMapLibre height="h-full" />
            </div>
          </div>

          {/* Quick Summary Bar */}
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">OPTED-IN USERS</span>
              <span className="text-xl font-bold text-[#3DB7D9]">{AFFECTED_USERS.length}</span>
              <span className="text-[10px] text-[#39B978] block">Opted-in for Alerts</span>
            </div>
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">EMERGENCY SERVICES</span>
              <span className="text-xl font-bold text-[#F04438]">{EMERGENCY_SERVICES.length}</span>
              <span className="text-[10px] text-[#A7B4C1] block">Prioritized Units</span>
            </div>
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">TARGET ASSETS</span>
              <span className="text-xl font-bold text-[#E8A93A]">01</span>
              <span className="text-[10px] text-slate-400 block">Surat Petrochem</span>
            </div>
          </div>
        </div>

        {/* Right Impact Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4 font-mono text-xs">
          {/* Affected Users Panel */}
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#253340] pb-2">
              <span className="font-bold text-[#3DB7D9] uppercase flex items-center space-x-1.5">
                <Users className="w-4 h-4" />
                <span>OPTED-IN RESIDENTS IN DANGER ZONE</span>
              </span>
              <span className="text-[10px] text-[#39B978]">POSTGIS VERIFIED</span>
            </div>

            <div className="space-y-2">
              {AFFECTED_USERS.map((user) => (
                <div key={user.id} className="p-2.5 bg-[#0D151E] border border-[#253340] rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">{user.name}</div>
                    <div className="text-[10px] text-[#A7B4C1]">{user.phone}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[#E8A93A] font-bold block">{user.distance}m</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-[#39B978]/20 text-[#39B978] rounded">OPTED-IN</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Services Panel */}
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#253340] pb-2">
              <span className="font-bold text-[#F04438] uppercase flex items-center space-x-1.5">
                <PhoneCall className="w-4 h-4" />
                <span>PRIORITIZED EMERGENCY CONTACTS</span>
              </span>
              <span className="text-[10px] text-[#F04438] font-bold">PRIORITY 1</span>
            </div>

            <div className="space-y-2">
              {EMERGENCY_SERVICES.map((emg) => (
                <div key={emg.id} className="p-2.5 bg-[#0D151E] border border-[#253340] rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">{emg.name}</div>
                    <div className="text-[10px] text-[#A7B4C1]">{emg.phone}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[#3DB7D9] font-bold block">{emg.distance}m</span>
                    <span className="text-[9px] uppercase text-[#A7B4C1]">{emg.category}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleAuthorizeAlert}
              className="w-full py-3 px-4 bg-[#F04438] hover:bg-[#FF6B35] text-white font-bold rounded text-xs transition flex items-center justify-center space-x-2 shadow-xl"
            >
              <Send className="w-4 h-4" />
              <span>AUTHORIZE EMERGENCY ALERT DISPATCH</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
