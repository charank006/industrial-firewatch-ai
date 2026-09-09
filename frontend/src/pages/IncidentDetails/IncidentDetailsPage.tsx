import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Compass,
} from 'lucide-react';
import { ReasoningFlow } from '../../components/intelligence/ReasoningFlow';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { useIntelligence } from '../../context/IntelligenceContext';
import { fetchFireDetections } from '../../services/api';

export const IncidentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hotspots, selectFacilityById, isLoading } = useIntelligence();

  // `hotspots[0]` is undefined on the first render in api mode, and every
  // `incident.<field>` below then threw - blanking the whole app tree, not
  // just this page.
  const incident = hotspots.find((h) => h.id === id) || hotspots[0];

  /**
   * The FRP series this chart plots.
   *
   * It was a six-point invention ending "Today 21:42, 184.6 MW", printed
   * identically for every incident regardless of which one was open. These
   * are the event's own satellite passes, and the baseline is its own mean
   * FRP rather than a round number chosen to make the spike look dramatic.
   */
  const [series, setSeries] = useState<
    Array<{ time: string; frp: number; baseline: number }> | null
  >(null);

  useEffect(() => {
    if (!incident?.id) return;
    let cancelled = false;

    fetchFireDetections(incident.id)
      .then((data) => {
        if (cancelled || !data?.detections?.length) return;
        const mean =
          data.detections.reduce((total, d) => total + d.frp_mw, 0) / data.detections.length;
        setSeries(
          data.detections.map((d) => ({
            time: d.time_formatted || d.acquisition_time.slice(11, 16),
            frp: Number(d.frp_mw.toFixed(1)),
            baseline: Number(mean.toFixed(1)),
          })),
        );
      })
      .catch(() => {
        // A missing series is an expected state; the panel says so rather
        // than falling back to invented numbers.
        if (!cancelled) setSeries(null);
      });

    return () => {
      cancelled = true;
    };
  }, [incident?.id]);

  if (!incident) {
    return (
      <div className="min-h-screen bg-[#050A12] p-6 font-mono text-xs text-[#A7B4C5]">
        {isLoading ? 'Loading detections…' : `No detection ${id ?? ''} in the current view.`}
      </div>
    );
  }

  const handleFacilityClick = () => {
    selectFacilityById(incident.nearestFacilityId);
    navigate(`/facility-watch?facilityId=${incident.nearestFacilityId}`);
  };

  return (
    <div className="min-h-screen bg-[#050A12] p-4 sm:p-6 space-y-6 font-sans text-[#F5F7FA]">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between border-b border-[#203246] pb-4 font-mono text-xs">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-[#16A9D9] hover:underline transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO INCIDENTS REGISTRY</span>
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-[#A7B4C5]">INCIDENT ID:</span>
          <span className="font-bold text-white text-sm bg-[#07101B] px-2.5 py-1 rounded border border-[#203246]">
            {incident.id}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Map & Context Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-semibold text-[#16A9D9] uppercase tracking-wider flex items-center space-x-1.5">
                <Compass className="w-4 h-4" />
                <span>SPATIAL MAPLIBRE CONTEXT MAP</span>
              </span>
              <span className="text-[#A7B4C5]">500m & 2km RISK BUFFER RINGS</span>
            </div>

            <div className="h-[420px] rounded-lg overflow-hidden border border-[#203246] relative">
              <GISMapLibre height="h-full" />
            </div>
          </div>

          {/* Historical FRP Trend Chart */}
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#16A9D9] uppercase tracking-wider">
                HISTORICAL FRP VS BASELINE SPIKE
              </span>
              <span className="text-[#FFB020] font-bold">PEAK: {incident.frpMw} MW</span>
            </div>

            <div className="h-48 w-full pt-2">
              {series === null ? (
                <div className="h-full flex items-center justify-center text-[11px] font-mono text-[#66768A] text-center px-6">
                  No detection series for this event yet. It is plotted from the event's own
                  satellite passes, so a single-pass detection has nothing to chart.
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#203246" />
                  <XAxis dataKey="time" stroke="#66768A" fontSize={10} />
                  <YAxis stroke="#66768A" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#07101B', borderColor: '#203246', color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="frp" stroke="#FFB020" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="baseline" stroke="#16A9D9" strokeDasharray="5 5" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Right Intelligence Workbench Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between font-mono text-xs">
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  incident.severity === 'HIGH' ? 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40' : 'bg-[#FFB020]/20 text-[#FFB020]'
                }`}
              >
                {incident.severity} SEVERITY
              </span>
              <span className="text-[#28C76F] font-bold">
                CONFIDENCE: {incident.confidence}%
              </span>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white tracking-wide">
                {incident.classification}
              </h2>
              <p className="text-xs text-[#A7B4C5] font-mono mt-1">{incident.locationName}</p>
            </div>

            {/* Nearest Facility Link */}
            <div className="p-3 bg-[#050A12] border border-[#203246] rounded-lg flex items-center justify-between font-mono text-xs">
              <div>
                <span className="text-[10px] text-[#16A9D9] uppercase block font-semibold">TARGET PROXIMITY</span>
                <span className="text-white font-bold">{incident.nearestFacilityName}</span>
              </div>
              <button
                onClick={handleFacilityClick}
                className="px-3 py-1 bg-[#111A26] hover:bg-[#151F2C] border border-[#203246] text-[#16A9D9] text-[11px] rounded transition flex items-center space-x-1"
              >
                <span>View Facility</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5">
            <ReasoningFlow
              steps={incident.reasoningSteps}
              classification={incident.classification}
              confidence={incident.confidence}
              severity={incident.severity}/>
          </div>

          <div className="bg-[#07101B] border border-[#FF3B30]/30 rounded-xl p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center space-x-2 text-[#FF3B30] font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>DISPATCH CHECKLIST</span>
            </div>
            <p className="text-slate-200 leading-relaxed font-sans text-xs">
              {incident.suggestedAction}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
