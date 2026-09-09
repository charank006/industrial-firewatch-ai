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
  const [rows, setRows] = useState<
    Array<{ time: string; frp: number; at: string }> | null
  >(null);
  const [window, setWindow] = useState<'24h' | '7d' | 'all'>('7d');

  useEffect(() => {
    if (!incident?.id) return;
    let cancelled = false;

    fetchFireDetections(incident.id)
      .then((data) => {
        if (cancelled || !data?.detections?.length) return;
        setRows(
          data.detections.map((d) => ({
            time: d.time_formatted || d.acquisition_time.slice(11, 16),
            frp: Number(d.frp_mw.toFixed(1)),
            at: d.acquisition_time,
          })),
        );
      })
      .catch(() => {
        // A missing series is an expected state; the panel says so rather
        // than falling back to invented numbers.
        if (!cancelled) setRows(null);
      });

    return () => {
      cancelled = true;
    };
  }, [incident?.id]);

  /**
   * The plotted window. The baseline is the mean of whatever is in view, not
   * of the whole history: comparing a 24-hour spike against a seven-day mean
   * would flatter every spike.
   */
  const series = React.useMemo(() => {
    if (!rows?.length) return null;
    const spans: Record<string, number> = { '24h': 24, '7d': 24 * 7, all: Infinity };
    const cutoff = Date.now() - spans[window] * 3_600_000;
    const inWindow =
      window === 'all' ? rows : rows.filter((r) => new Date(r.at).getTime() >= cutoff);
    if (!inWindow.length) return [];
    const mean = inWindow.reduce((t, r) => t + r.frp, 0) / inWindow.length;
    return inWindow.map((r) => ({ ...r, baseline: Number(mean.toFixed(1)) }));
  }, [rows, window]);

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
                FRP VS BASELINE
              </span>
              <div className="flex items-center gap-2">
                {/* The baseline is recomputed over whichever window is shown,
                    so a 24h spike is not measured against a 7-day mean. */}
                <div className="flex rounded border border-[#203246] overflow-hidden">
                  {(['24h', '7d', 'all'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setWindow(w)}
                      className={`px-2 py-0.5 text-[10px] font-mono transition ${
                        window === w
                          ? 'bg-[#16A9D9]/20 text-[#16A9D9] font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {w === 'all' ? 'All' : w}
                    </button>
                  ))}
                </div>
                <span className="text-[#FFB020] font-bold">PEAK: {incident.frpMw} MW</span>
              </div>
            </div>

            <div className="h-48 w-full pt-2">
              {series === null || series.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] font-mono text-[#66768A] text-center px-6">
                  {series === null
                    ? "No detection series for this event yet. It is plotted from the event's own satellite passes, so a single-pass detection has nothing to chart."
                    : `No satellite pass for this event in the last ${window === '24h' ? '24 hours' : '7 days'}.`}
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
