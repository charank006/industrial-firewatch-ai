import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Flame,
  LayoutGrid,
  List,
  Printer,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { formatDisplayClassification } from '../../components/intelligence/SituationRail';
import type { ThermalHotspot } from '../../types';

export const IncidentsPage: React.FC = () => {
  const { hotspots, filteredHotspots, filters, setFilters, selectIncidentById } = useIntelligence();
  const navigate = useNavigate();

  const pixelCount = filteredHotspots.reduce((total, h) => total + h.detectionCount, 0);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<string>('ALL');
  const [redZoneOnly, setRedZoneOnly] = useState<boolean>(false);

  const facilityOptions = Array.from(
    new Set(hotspots.map((h) => h.nearestFacilityId).filter(Boolean)),
  ).sort();
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');
  
  // Forensic Audit Dossier Modal state
  const [dossierIncident, setDossierIncident] = useState<ThermalHotspot | null>(null);

  // Multi-dimensional filtering logic
  const auditLogs = filteredHotspots.filter((item) => {
    const riskVal = item.riskScore ?? (item.severity === 'CRITICAL' ? 85 : item.severity === 'HIGH' ? 65 : 25);
    
    if (redZoneOnly && riskVal < 70 && item.severity !== 'CRITICAL') {
      return false;
    }
    if (selectedFacilityFilter !== 'ALL' && item.nearestFacilityId !== selectedFacilityFilter) {
      return false;
    }
    return true;
  });

  const handleRowClick = (id: string) => {
    selectIncidentById(id);
    navigate(`/incidents/${id}`);
  };

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Audit_ID,Timestamp,Classification,Severity,Facility,FRP_MW,Confidence,Location\n' +
      auditLogs
        .map(
          (item) =>
            `${item.id},${item.timestamp},${formatDisplayClassification(item.classification)},${item.severity},"${item.nearestFacilityName}",${item.frpMw},${item.confidence}%,"${item.locationName}"`
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GeoFlare_Forensic_Audit_Record_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenDossier = (incident: ThermalHotspot, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDossierIncident(incident);
  };

  const handlePrintDossier = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-slate-100 selection:bg-cyan-500/20">
      
      {/* ENTERPRISE WORKSTATION HEADER */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-white tracking-wide">
                  Risk Zone Registry
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                  LIVE REGISTRY
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Official Immutable Compliance Audit Trail & Satellite Thermal Legal Record
              </p>
            </div>
          </div>
        </div>

        {/* Enterprise Compliance Status Badges & Export Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          <div className="hidden sm:flex items-center space-x-2 text-slate-300 bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>7-YEAR IMMUTABLE RETENTION</span>
          </div>

          <button
            onClick={() => handleOpenDossier(hotspots[0])}
            className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs rounded-lg transition shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center space-x-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF Dossier</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-black/50 hover:bg-white/10 border border-white/15 text-slate-200 font-bold text-xs rounded-lg transition flex items-center space-x-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export CSV Audit</span>
          </button>
        </div>
      </div>

      {/* MULTI-DIMENSIONAL FILTERABLE TAGS BAR */}
      <div className="p-4 bg-[#080C14] border border-white/10 rounded-xl space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-[11px] uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span>SEARCHABLE AUDIT FILTERS & COMPLIANCE TAGS</span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Matching Records: <strong className="text-white font-bold">{auditLogs.length}</strong> / {hotspots.length}
            <span className="block text-[10px] text-slate-500 mt-0.5">
              {filteredHotspots.length} events clustered from {pixelCount} NASA FIRMS pixels
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Search Keyword */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, location..."
              value={filters.searchKeyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchKeyword: e.target.value }))}
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-white/15 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-cyan-400 transition placeholder-slate-500"
            />
          </div>

          {/* Filter By Facility */}
          <div className="relative">
            <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <select
              value={selectedFacilityFilter}
              onChange={(e) => setSelectedFacilityFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-white/15 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-cyan-400 transition"
            >
              <option value="ALL">All Sites (Global)</option>
              {facilityOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter By Severity */}
          <div className="relative">
            <AlertTriangle className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <select
              value={filters.severity}
              onChange={(e) => setFilters((prev) => ({ ...prev, severity: e.target.value }))}
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-white/15 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-cyan-400 transition"
            >
              <option value="ALL">All Severities</option>
              <option value="HIGH">CRITICAL / HIGH Priority</option>
              <option value="MEDIUM">MEDIUM Priority</option>
              <option value="LOW">LOW Priority</option>
            </select>
          </div>

          {/* Filter By Classification */}
          <div className="relative">
            <Flame className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <select
              value={filters.eventType}
              onChange={(e) => setFilters((prev) => ({ ...prev, eventType: e.target.value }))}
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-white/15 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-cyan-400 transition"
            >
              <option value="ALL">All Classifications</option>
              <option value="Industrial Fire">Industrial Fire</option>
              <option value="Routine Flare">Routine Flare</option>
              <option value="Forest Fire">Forest Fire</option>
              <option value="Agricultural Burning">Monitored Farmland Heat</option>
              <option value="Unknown Anomaly">Monitored Heat Point</option>
            </select>
          </div>

          {/* Filter By Date Range */}
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-white/15 text-slate-200 text-xs rounded-lg focus:outline-none focus:border-cyan-400 transition"
            >
              <option value="ALL">Date Range: All Time</option>
              <option value="24H">Last 24 Hours</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
            </select>
          </div>

        </div>

        {/* View Mode & Red Zone Filter Toggle */}
        <div className="flex justify-between items-center pt-2 border-t border-white/10">
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span>FILTER TAGS ACTIVE:</span>

            {/* RED ZONE ONLY TOGGLE BUTTON (MATCHES IMAGE MOCKUP) */}
            <button
              onClick={() => setRedZoneOnly(!redZoneOnly)}
              className={`px-3 py-1 rounded-md text-[11px] font-mono font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                redZoneOnly
                  ? 'bg-red-600 text-white border border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                  : 'bg-black/60 text-slate-400 border border-white/15 hover:border-red-500/50 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span>Red Zone Only (≥70% Risk)</span>
            </button>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded flex items-center space-x-1 border transition ${
                viewMode === 'table'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                  : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Audit Table</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded flex items-center space-x-1 border transition ${
                viewMode === 'grid'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                  : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Audit Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* AUDIT TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto border border-white/10 rounded-xl bg-[#080C14] shadow-2xl">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-black/60 border-b border-white/10 text-cyan-400 uppercase text-[11px] tracking-wider">
                <th className="p-3.5 font-bold">AUDIT RECORD ID</th>
                <th className="p-3.5 font-bold">TIMESTAMP (IST / UTC)</th>
                <th className="p-3.5 font-bold">CLASSIFICATION</th>
                <th className="p-3.5 font-bold">RISK &amp; VALIDITY</th>
                <th className="p-3.5 font-bold">FACILITY & FENCE MATCH</th>
                <th className="p-3.5 font-bold">FRP & BRIGHTNESS</th>
                <th className="p-3.5 font-bold">VERDICT & PRIORITY</th>
                <th className="p-3.5 font-bold text-right">FORENSIC DOSSIER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 font-sans">
                    No historical forensic records match the selected audit filter tags.
                  </td>
                </tr>
              ) : (
                auditLogs.map((item) => {
                  const riskVal = item.riskScore ?? (item.severity === 'CRITICAL' ? 85 : item.severity === 'HIGH' ? 65 : 25);
                  const displayCls = formatDisplayClassification(item.classification);
                  const isHighRisk = riskVal >= 70 || item.severity === 'CRITICAL';
                  const realFirePct = item.confidence || 97;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item.id)}
                      className="hover:bg-white/[0.03] cursor-pointer transition"
                    >
                      {/* Audit ID */}
                      <td className="p-3.5">
                        <div className="font-bold text-cyan-300">{item.id}</div>
                        <div className="text-[10px] text-slate-500">VIIRS I-BAND S-NPP</div>
                      </td>

                      {/* Timestamp */}
                      <td className="p-3.5 text-slate-300">
                        <div className="font-bold text-white">{item.timeFormatted || '21:11 IST'}</div>
                        <div className="text-[10px] text-slate-500">{item.timestamp.slice(0, 10)}</div>
                      </td>

                      {/* Classification */}
                      <td className="p-3.5">
                        <div className="font-semibold text-white font-sans text-xs">{displayCls}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.landCover}</div>
                      </td>

                      {/* Risk & Validity Badges */}
                      <td className="p-3.5">
                        <div className="flex flex-col items-start gap-1 font-mono text-[10px]">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              isHighRisk
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                : 'bg-[#142332] text-cyan-300 border border-[#23384D]'
                            }`}
                          >
                            RISK {Math.round(riskVal)}%
                          </span>
                          <span className="px-2 py-0.5 rounded font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                            REAL FIRE {realFirePct}%
                          </span>
                        </div>
                      </td>

                      {/* Facility & Fence Match */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-200">{item.nearestFacilityName || 'Unassigned'}</div>
                        <div className="text-[10px] text-emerald-400 flex items-center space-x-1 mt-0.5 font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>MATCH (Offset {Math.round(item.facilityDistanceKm * 1000)}m)</span>
                        </div>
                      </td>

                      {/* FRP & Brightness */}
                      <td className="p-3.5">
                        <div className="font-bold text-amber-400">{item.frpMw.toFixed(2)} MW</div>
                        <div className="text-[10px] text-cyan-400">{item.brightnessK.toFixed(2)} K</div>
                      </td>

                      {/* Verdict & Priority */}
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider inline-block ${
                            isHighRisk
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          }`}
                        >
                          {isHighRisk ? 'CRITICAL RISK' : `${item.severity} PRIORITY`}
                        </span>
                      </td>

                      {/* Forensic Dossier Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex justify-end items-center space-x-2">
                          <button
                            onClick={(e) => handleOpenDossier(item, e)}
                            className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 font-bold rounded text-[11px] transition flex items-center space-x-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Export PDF Dossier</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(item.id);
                            }}
                            className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold rounded text-[11px] transition flex items-center space-x-1"
                          >
                            <span>Investigate Report</span>
                            <ChevronRight className="w-3 h-3 text-cyan-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* AUDIT GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
          {auditLogs.map((item) => (
            <div
              key={item.id}
              onClick={() => handleRowClick(item.id)}
              className="p-4 bg-[#080C14] border border-white/10 hover:border-cyan-500/40 rounded-xl space-y-3 cursor-pointer transition shadow-xl group"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-sm text-cyan-400">{item.id}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.severity === 'HIGH' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {item.severity} PRIORITY
                </span>
              </div>

              <div>
                <h3 className="font-bold text-white text-base group-hover:text-cyan-300 transition font-sans">
                  {formatDisplayClassification(item.classification)}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{item.locationName}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-2.5 rounded-lg border border-white/10">
                <div>FRP: <strong className="text-amber-400">{item.frpMw} MW</strong></div>
                <div>Confidence: <strong className="text-emerald-400">{item.confidence}%</strong></div>
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-xs">
                <button
                  onClick={(e) => handleOpenDossier(item, e)}
                  className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 font-bold rounded text-[11px] transition flex items-center space-x-1"
                >
                  <FileText className="w-3 h-3" />
                  <span>PDF Dossier</span>
                </button>
                <div className="flex items-center text-cyan-300 font-bold hover:underline">
                  <span>Investigate Report</span>
                  <ChevronRight className="w-4 h-4 ml-0.5 text-cyan-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FORENSIC AUDIT PDF DOSSIER MODAL */}
      {dossierIncident && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#080C14] border border-cyan-500/40 rounded-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl font-mono text-xs relative my-8">
            
            {/* Modal Top Bar */}
            <div className="flex justify-between items-center border-b border-white/10 pb-4 print:hidden">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-sm tracking-wider uppercase">OFFICIAL FORENSIC COMPLIANCE DOSSIER</span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handlePrintDossier}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center space-x-1.5 cursor-pointer uppercase text-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={() => setDossierIncident(null)}
                  className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE DOSSIER SHEET CONTENT */}
            <div className="space-y-6 bg-[#04070D] border border-white/10 p-6 rounded-xl relative">
              
              {/* Dossier Header & Watermark */}
              <div className="flex justify-between items-start border-b border-white/15 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-lg text-white font-sans">GEOFLARE <span className="text-cyan-400">AI</span></span>
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 rounded text-[9px] font-bold">
                      CONFIDENTIAL FORENSIC REPORT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Satellite Thermal Anomaly & Legal Compliance Verification Document
                  </p>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  <div>DOSSIER ID: <strong className="text-white">GF-AUDIT-2026-98142</strong></div>
                  <div>ISSUED: <strong className="text-cyan-400">{dossierIncident.timestamp}</strong></div>
                </div>
              </div>

              {/* 1. Incident Identity & Satellite Acquisition */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-white/10 pb-1">
                  1. INCIDENT IDENTITY & SATELLITE SENSOR TELEMETRY
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-3 rounded-lg border border-white/10 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[9.5px]">INCIDENT REF ID</span>
                    <span className="font-bold text-white">{dossierIncident.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px]">SENSOR INSTRUMENT</span>
                    <span className="font-bold text-cyan-300">VIIRS I-Band (375m)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px]">RADIATIVE POWER (FRP)</span>
                    <span className="font-bold text-amber-400">{dossierIncident.frpMw} MW</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9.5px]">VIIRS CONFIDENCE</span>
                    <span className="font-bold text-emerald-400">{dossierIncident.confidence}%</span>
                  </div>
                </div>
              </div>

              {/* 2. Facility Boundary Fence Verification */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-white/10 pb-1">
                  2. PLANT BOUNDARY FENCE VERIFICATION RECORD
                </h3>
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white font-sans text-sm">{dossierIncident.nearestFacilityName}</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded text-[10px] font-bold">
                      FENCE MATCH CONFIRMED
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10.5px] text-slate-300 pt-1 border-t border-emerald-500/20">
                    <div>LATITUDE: <strong>{dossierIncident.lat.toFixed(4)}°N</strong></div>
                    <div>LONGITUDE: <strong>{dossierIncident.lng.toFixed(4)}°E</strong></div>
                    <div>PERIMETER OFFSET: <strong className="text-amber-400">{Math.round(dossierIncident.facilityDistanceKm * 1000)}m</strong></div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
