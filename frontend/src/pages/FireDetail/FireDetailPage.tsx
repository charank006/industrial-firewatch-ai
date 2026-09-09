/**
 * One fire, one page.
 *
 * The dashboard's other views compare many fires at once, which makes it hard
 * to answer the only question that matters for a single detection: is this a
 * real fire, and if so what kind?
 *
 * The page answers those in that order, and never merges them. Validity comes
 * first and on its own, because a source label attached to a probable sensor
 * artefact is worse than no label at all.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Satellite,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import {
  ImpactPanel,
  ProbabilityPanel,
  SurroundingsPanel,
  WeatherPanel,
} from '../../components/intelligence/AnalysisPanels';
import { ReasoningFlow } from '../../components/intelligence/ReasoningFlow';
import {
  concernText,
  facilityDistance,
  VERDICT_BLURB,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../../components/intelligence/formatters';
import type { ValidityDetail } from '../../types';

const VERDICT_ICON: Record<ValidityDetail['verdict'], React.ReactNode> = {
  REAL_FIRE: <CheckCircle2 className="w-5 h-5" />,
  UNCERTAIN: <HelpCircle className="w-5 h-5" />,
  LIKELY_FALSE_ALARM: <AlertOctagon className="w-5 h-5" />,
};

const Field: React.FC<{ label: string; value: React.ReactNode; accent?: string }> = ({
  label,
  value,
  accent = 'text-slate-100',
}) => (
  <div className="bg-[#0D151E] border border-[#1E2C3B] rounded p-2.5">
    <span className="block text-[9px] uppercase tracking-wider text-[#A7B4C1] font-mono">
      {label}
    </span>
    <span className={`block text-base font-mono font-semibold ${accent}`}>{value}</span>
  </div>
);

export const FireDetailPage: React.FC = () => {
  const { fireId } = useParams<{ fireId: string }>();
  const navigate = useNavigate();
  const {
    hotspots,
    filteredHotspots,
    selectedIncident,
    selectIncidentById,
    analysis,
    isAnalysisLoading,
    dataSource,
    historyDays,
  } = useIntelligence();

  // Selecting the incident is what drives the context to load its analysis
  // bundle, so a deep link to /fire/:id works the same as a click-through.
  React.useEffect(() => {
    if (fireId && selectedIncident?.id !== fireId) selectIncidentById(fireId);
  }, [fireId, selectedIncident?.id, selectIncidentById]);

  // Prev/next walk the FILTERED list, so the sequence matches the registry the
  // user arrived from. The fire itself is looked up in the unfiltered list so a
  // deep link still resolves when the active filters would exclude it.
  const fire = hotspots.find((h) => h.id === fireId) ?? null;
  const index = filteredHotspots.findIndex((h) => h.id === fireId);
  const previous = index > 0 ? filteredHotspots[index - 1] : null;
  const next =
    index >= 0 && index < filteredHotspots.length - 1 ? filteredHotspots[index + 1] : null;

  if (dataSource === 'mock') {
    return (
      <div className="p-6 text-xs font-mono text-[#E8A93A]">
        Per-fire detail runs on live pipeline data. Set VITE_DATA_SOURCE=api.
      </div>
    );
  }

  if (!fire) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-xs font-mono text-[#A7B4C1]">
          {isAnalysisLoading ? 'Loading…' : `No fire event ${fireId} in the current region or time window.`}
        </p>
        <button
          onClick={() => navigate('/incidents')}
          className="px-3 py-1.5 text-xs font-mono border border-[#253340] rounded text-[#3DB7D9] hover:bg-[#0D151E]"
        >
          Back to registry
        </button>
      </div>
    );
  }

  const validity = analysis?.validity ?? null;

  return (
    <div className="p-4 sm:p-6 space-y-4 font-sans text-slate-200 max-w-6xl">
      {/* Header + prev/next */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#253340] pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/incidents')}
            className="p-1.5 rounded border border-[#253340] text-[#A7B4C1] hover:text-white hover:bg-[#0D151E]"
            aria-label="Back to registry"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white font-mono">
              <Satellite className="w-4 h-4 text-[#3DB7D9]" />
              {fire.id}
            </h1>
            <p className="text-[11px] text-[#A7B4C1] font-mono">
              {fire.locationName} · {fire.timeFormatted}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-[#7C8B9A]">
            {index >= 0 ? `${index + 1} of ${filteredHotspots.length}` : 'outside current filters'}
          </span>
          <button
            disabled={!previous}
            onClick={() => previous && navigate(`/fire/${previous.id}`)}
            className="flex items-center gap-1 px-2 py-1 border border-[#253340] rounded text-[#3DB7D9] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0D151E]"
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>
          <button
            disabled={!next}
            onClick={() => next && navigate(`/fire/${next.id}`)}
            className="flex items-center gap-1 px-2 py-1 border border-[#253340] rounded text-[#3DB7D9] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0D151E]"
          >
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* STEP 1 — is it a fire at all? Deliberately alone and first. */}
      <section className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
          Step 1 — Is this a real fire?
        </span>
        {validity ? (
          <div className={`rounded-lg border p-4 space-y-3 ${(VERDICT_TONE as Record<string, string>)[validity.verdict]}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2 text-lg font-bold font-mono">
                {(VERDICT_ICON as Record<string, React.ReactNode>)[validity.verdict]}
                {(VERDICT_LABEL as Record<string, string>)[validity.verdict]}
              </span>
              <span className="font-mono text-sm">{validity.confidencePct}% likely genuine</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-200 font-sans">
              {(VERDICT_BLURB as Record<string, string>)[validity.verdict]}
            </p>

            {validity.concerns.length > 0 && (
              <ul className="space-y-1">
                {validity.concerns.map((c: string) => (
                  <li key={c} className="text-[10px] font-mono text-slate-300">
                    • {concernText(c)}
                  </li>
                ))}
              </ul>
            )}

            <details className="text-[10px] font-mono">
              <summary className="cursor-pointer text-slate-300 hover:text-white">
                Evidence ({validity.reasoningSteps.length} checks) · model {validity.modelVersion}
              </summary>
              <div className="mt-2 space-y-1.5">
                {validity.reasoningSteps.map((s: any) => (
                  <div key={s.stepIndex} className="text-slate-300">
                    <span className="text-[#A7B4C1]">{s.label}:</span> {s.detail}
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <div className="rounded-lg border border-[#253340] bg-[#0A121E] p-4 text-[11px] font-mono text-[#A7B4C1]">
            {isAnalysisLoading
              ? 'Assessing detection validity…'
              : 'Not yet assessed — the background analysis job has not reached this event.'}
          </div>
        )}
      </section>

      {/* STEP 2 — only now, what kind of fire. */}
      <section className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
          Step 2 — What kind of fire?
        </span>
        {validity?.verdict === 'LIKELY_FALSE_ALARM' && (
          <p className="text-[10px] font-mono text-[#F04438] leading-relaxed">
            Shown for reference only — the detection above is more likely an artefact than a fire.
          </p>
        )}
        <ProbabilityPanel prediction={analysis?.prediction ?? null} />
      </section>

      {/* Raw satellite record — the input everything else is derived from. */}
      <section className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
          NASA FIRMS record
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Radiative Power" value={`${fire.frpMw.toFixed(1)} MW`} />
          <Field label="Brightness" value={`${fire.brightnessK.toFixed(1)} K`} />
          <Field
            label="NASA Confidence"
            value={fire.detectionConfidence !== undefined ? `${fire.detectionConfidence}%` : '—'}
          />
          <Field label="Pass" value={fire.dayNight === 'N' ? 'Night' : 'Day'} />
          <Field label="Latitude" value={fire.lat.toFixed(4)} />
          <Field label="Longitude" value={fire.lng.toFixed(4)} />
          {/* recurrence_count is prior events at this pixel, not this event's
              own detection count - labelling it "observations" overstated it. */}
          <Field
            label={`Prior events (${historyDays ?? '?'}d)`}
            value={fire.historicalOccurrenceCount}
          />
          <Field
            label="Nearest Facility"
            value={facilityDistance(fire.nearestFacilityId, fire.facilityDistanceKm)}
          />
        </div>
      </section>

      {analysis?.prediction && (
        <section className="space-y-2">
          <span className="text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
            Why the source was chosen
          </span>
          <ReasoningFlow
            steps={analysis.prediction.reasoningSteps}
            classification={analysis.prediction.label}
            confidence={analysis.prediction.confidencePct}
          />
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <WeatherPanel weather={analysis?.weather ?? null} />
        <SurroundingsPanel surroundings={analysis?.surroundings ?? null} />
      </div>

      <ImpactPanel impact={analysis?.impact ?? null} />

      <button
        onClick={() => navigate(`/incidents/${fire.id}`)}
        className="px-3 py-1.5 text-xs font-mono border border-[#253340] rounded text-[#3DB7D9] hover:bg-[#0D151E]"
      >
        Detection history for this event →
      </button>

      <div className="p-3 bg-[#0A121E] border border-[#253340] rounded-lg text-[10px] leading-relaxed text-[#7C8B9A] font-mono">
        A NASA FIRMS record is a satellite-detected thermal anomaly, not a confirmed fire. Validity
        and source are both probabilistic estimates, not determinations of cause.
      </div>
    </div>
  );
};

export default FireDetailPage;
