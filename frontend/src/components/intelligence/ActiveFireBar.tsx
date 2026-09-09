/**
 * "Which fire am I looking at?" — answered on every page that shows per-fire
 * data.
 *
 * Risk & Impact, Weather Baseline, Thermal History and Incident Details all
 * render numbers for `selectedIncident` without ever naming it, so a reader
 * could not tell whose fire the plume corridor or the humidity anomaly
 * belonged to. One shared strip means no section can silently show data for
 * an unidentified fire again.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flame, Maximize2 } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { ValidityBadge } from './ValidityBadge';
import { classColor } from '../../utils/classColors';

interface ActiveFireBarProps {
  /** What this page is showing for the fire, e.g. "Impact & exposure". */
  section: string;
}

export const ActiveFireBar: React.FC<ActiveFireBarProps> = ({ section }) => {
  const navigate = useNavigate();
  const { filteredHotspots, selectedIncident, selectIncidentById, isLoading } = useIntelligence();

  if (!selectedIncident) {
    return (
      <div className="bg-[#0A121E] border border-[#243244] rounded-lg px-4 py-3 font-mono text-xs text-[#A7B4C1]">
        {isLoading ? 'Loading detections…' : 'No fire selected — pick one from the Incidents Registry.'}
      </div>
    );
  }

  const index = filteredHotspots.findIndex((h) => h.id === selectedIncident.id);
  const previous = index > 0 ? filteredHotspots[index - 1] : null;
  const next =
    index >= 0 && index < filteredHotspots.length - 1 ? filteredHotspots[index + 1] : null;

  return (
    <div className="bg-[#0A121E] border border-[#243244] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <Flame className="w-4 h-4 shrink-0" style={{ color: classColor(selectedIncident.classification) }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[#6F7E8D]">
              {section} for
            </span>
            <span className="font-bold text-[#2FA8D8]">{selectedIncident.id}</span>
            <ValidityBadge
              verdict={selectedIncident.validityVerdict}
              confidencePct={selectedIncident.validityConfidencePct}
            />
          </div>
          <div className="text-[11px] text-[#A7B4C1] truncate">
            {selectedIncident.classification} · {selectedIncident.locationName} ·{' '}
            {selectedIncident.frpMw} MW
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <select
          value={selectedIncident.id}
          onChange={(event) => selectIncidentById(event.target.value)}
          className="max-w-[15rem] px-2 py-1 bg-[#050A12] border border-[#243244] rounded text-slate-200 focus:outline-none focus:border-[#3DB7D9]"
        >
          {filteredHotspots.map((hotspot) => (
            <option key={hotspot.id} value={hotspot.id}>
              {hotspot.id} — {hotspot.locationName}
            </option>
          ))}
        </select>

        <span className="text-[#6F7E8D] hidden sm:inline">
          {index >= 0 ? `${index + 1}/${filteredHotspots.length}` : '—'}
        </span>

        <button
          disabled={!previous}
          onClick={() => previous && selectIncidentById(previous.id)}
          className="p-1 border border-[#243244] rounded text-[#3DB7D9] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#111A26]"
          aria-label="Previous fire"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={!next}
          onClick={() => next && selectIncidentById(next.id)}
          className="p-1 border border-[#243244] rounded text-[#3DB7D9] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#111A26]"
          aria-label="Next fire"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => navigate(`/fire/${selectedIncident.id}`)}
          className="flex items-center gap-1 px-2 py-1 border border-[#243244] rounded text-[#3DB7D9] hover:bg-[#111A26]"
        >
          <Maximize2 className="w-3 h-3" /> Full report
        </button>
      </div>
    </div>
  );
};
