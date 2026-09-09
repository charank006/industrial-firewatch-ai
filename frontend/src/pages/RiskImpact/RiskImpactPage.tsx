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
import { ActiveFireBar } from '../../components/intelligence/ActiveFireBar';

export const RiskImpactPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedIncident, analysis, dataSource } = useIntelligence();
  const [radiusMeters, setRadiusMeters] = useState<number>(1000);

  // No fabricated fallback incident. This page shows one real fire or it
  // says it has none - a hardcoded "FW-BETA-1042, Surat, 184.6 MW" stood in
  // whenever nothing was selected, and read exactly like a live detection.
  const incident = selectedIncident;

  // Real facilities from the OSM enrichment, nearest first. The four
  // residents with invented phone numbers that used to fill this panel were
  // not data - we have no population registry, and inventing one put fake
  // people and the wrong state's emergency numbers on an operational screen.
  const emergencyFacilities = (analysis?.surroundings?.emergencyFacilities ?? []).filter(
    (facility) => facility.distanceM === null || facility.distanceM <= radiusMeters,
  );

  const handleAuthorizeAlert = () => {
    if (incident) navigate(`/alerts?incidentId=${incident.id}&radius=${radiusMeters}`);
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
      <ActiveFireBar section="Impact & exposure" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left GIS Map View (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between font-mono text-xs px-1">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <Crosshair className="w-4 h-4 text-[#3DB7D9]" />
                <span>SPATIAL DANGER BUFFER MAP ({radiusMeters}m RADIUS)</span>
              </span>
              <span className="text-[#E8A93A] font-bold">
                {incident ? `INCIDENT: ${incident.id}` : 'NO FIRE SELECTED'}
              </span>
            </div>

            <div className="h-[460px] rounded-lg overflow-hidden border border-[#253340] relative">
              <GISMapLibre height="h-full" />
            </div>
          </div>

          {/* Quick Summary Bar - every figure traceable to the pipeline */}
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">Response facilities</span>
              <span className="text-xl font-bold text-[#3DB7D9]">
                {String(emergencyFacilities.length).padStart(2, '0')}
              </span>
              <span className="text-[10px] text-[#A7B4C1] block">Mapped within {radiusMeters}m</span>
            </div>
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">Structures exposed</span>
              <span className="text-xl font-bold text-[#F04438]">
                {analysis?.impact?.exposureCount ?? '—'}
              </span>
              <span className="text-[10px] text-[#A7B4C1] block">In the plume corridor</span>
            </div>
            <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg">
              <span className="text-[10px] text-[#A7B4C1] block uppercase">Nearest facility</span>
              <span className="text-xl font-bold text-[#E8A93A]">
                {incident?.nearestFacilityId ? `${incident.facilityDistanceKm.toFixed(1)} km` : '—'}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                {incident?.nearestFacilityId ? incident.nearestFacilityName : 'None within 50 km'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Impact Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4 font-mono text-xs">
          {/* Real mapped response facilities. No invented residents. */}
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#253340] pb-2">
              <span className="font-bold text-[#3DB7D9] uppercase flex items-center space-x-1.5">
                <Users className="w-4 h-4" />
                <span>Response facilities within {radiusMeters}m</span>
              </span>
              <span className="text-[10px] text-[#39B978]">OPENSTREETMAP</span>
            </div>

            {emergencyFacilities.length === 0 ? (
              <p className="text-[11px] text-[#A7B4C1] leading-relaxed p-2.5 bg-[#0D151E] border border-[#253340] rounded-lg">
                No hospital, school or fire station is mapped within {radiusMeters}m of this fire.
                OpenStreetMap coverage here is{' '}
                <strong className="text-[#E8A93A]">
                  {analysis?.surroundings?.osmCoverage ?? 'unknown'}
                </strong>
                , so this is a lower bound, not proof that none exist.
              </p>
            ) : (
              <div className="space-y-2">
                {emergencyFacilities.map((facility) => (
                  <div
                    key={`${facility.kind}-${facility.name}-${facility.distanceM}`}
                    className="p-2.5 bg-[#0D151E] border border-[#253340] rounded-lg flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate">{facility.name}</div>
                      <div className="text-[10px] text-[#A7B4C1] uppercase">
                        {facility.amenity.replace('_', ' ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <span className="text-[#E8A93A] font-bold block">
                        {facility.distanceM === null ? '—' : `${Math.round(facility.distanceM)}m`}
                      </span>
                      <span className="text-[9px] uppercase text-[#A7B4C1]">
                        {facility.kind.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exposure and pollutants, straight from the impact model */}
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#253340] pb-2">
              <span className="font-bold text-[#F04438] uppercase flex items-center space-x-1.5">
                <PhoneCall className="w-4 h-4" />
                <span>Emergency dispatch</span>
              </span>
              <span className="text-[10px] text-[#F04438] font-bold">
                {analysis?.impact?.riskLevel ?? 'UNASSESSED'}
              </span>
            </div>

            <p className="text-[11px] text-[#A7B4C1] leading-relaxed">
              Dispatch routing needs a verified contact registry, which this system does not have.
              The facilities above are what OpenStreetMap maps near the fire — use them to identify
              who to call, not as a call list.
            </p>

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
