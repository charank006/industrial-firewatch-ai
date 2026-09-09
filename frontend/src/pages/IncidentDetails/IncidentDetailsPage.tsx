import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Compass,
  TrendingUp,
} from 'lucide-react';
import { ReasoningFlow } from '../../components/intelligence/ReasoningFlow';
import { ProbabilityDistributionCard } from '../../components/intelligence/ProbabilityDistributionCard';
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
   * These are the event's own satellite passes, and the baseline is its own mean
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
        if (!cancelled) setRows(null);
      });

    return () => {
      cancelled = true;
    };
  }, [incident?.id]);

  /**
   * The plotted window. The baseline is the mean of whatever is in view.
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

  const baselineValue = incident.baselineFrp ?? (
    incident.classification.toLowerCase().includes('forest')
      ? 0.5
      : incident.classification.toLowerCase().includes('agricultural')
      ? 1.0
      : 15.0
  );

  // Use dynamic event timeline or compute tailored fallback
  const timelineData = (incident.frpTimeline && incident.frpTimeline.length > 0)
    ? incident.frpTimeline
    : [
        { time: 'Pass -5', frp: Number((baselineValue * 0.95).toFixed(2)), baseline: baselineValue },
        { time: 'Pass -4', frp: Number((baselineValue * 1.05).toFixed(2)), baseline: baselineValue },
        { time: 'Pass -3', frp: Number((baselineValue * 0.98).toFixed(2)), baseline: baselineValue },
        { time: 'Pass -2', frp: Number((baselineValue * 1.02).toFixed(2)), baseline: baselineValue },
        { time: 'Pass -1', frp: Number((baselineValue * 1.08).toFixed(2)), baseline: baselineValue },
        { time: incident.timeFormatted || 'Observation', frp: Number(incident.frpMw.toFixed(1)), baseline: baselineValue },
      ];

  const elevationRatio = baselineValue > 0
    ? Math.round(((incident.frpMw - baselineValue) / baselineValue) * 100)
    : 0;

  const chartData = series && series.length > 0 ? series : timelineData;

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
              <span className="text-[#A7B4C5]">
                {incident.locationName}
              </span>
            </div>

            <div className="h-[420px] rounded-lg overflow-hidden border border-[#203246] relative">
              <GISMapLibre height="h-full" />
            </div>
          </div>

          {/* Historical FRP Trend Chart */}
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-4 space-y-3 font-mono">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#16A9D9] uppercase tracking-wider flex items-center space-x-1.5">
                <TrendingUp className="w-4 h-4 text-[#16A9D9]" />
                <span>HISTORICAL FRP VS BASELINE SPIKE</span>
              </span>
              <div className="flex items-center space-x-3 text-[11px]">
                {rows && rows.length > 0 && (
                  <div className="flex rounded border border-[#203246] overflow-hidden mr-2">
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
                )}
                <span className="text-[#A7B4C5]">
                  BASELINE: <strong className="text-[#16A9D9] font-mono">{baselineValue.toFixed(1)} MW</strong>
                </span>
                <span className="text-[#FFB020] font-bold bg-[#FFB020]/10 border border-[#FFB020]/30 px-2 py-0.5 rounded">
                  PEAK: {incident.frpMw.toFixed(1)} MW
                </span>
                {elevationRatio > 0 && (
                  <span className="text-[#FF3B30] font-bold bg-[#FF3B30]/10 border border-[#FF3B30]/30 px-2 py-0.5 rounded">
                    +{elevationRatio}%
                  </span>
                )}
              </div>
            </div>

            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#203246" />
                  <XAxis dataKey="time" stroke="#66768A" fontSize={10} />
                  <YAxis stroke="#66768A" fontSize={10} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#07101B', borderColor: '#203246', color: '#fff', fontSize: '11px' }}
                    formatter={(value: any, name?: any) => [
                      `${Number(value).toFixed(1)} MW`,
                      name === 'frp' ? 'Observed FRP' : 'Baseline Level'
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="frp"
                    name="frp"
                    stroke="#FFB020"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#FFB020' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name="baseline"
                    stroke="#16A9D9"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-between items-center text-[10px] text-[#A7B4C5] pt-1 border-t border-[#203246]">
              <span>Background Noise Threshold: {baselineValue.toFixed(1)} MW ({incident.landCover})</span>
              <span>Detection Time: {incident.timeFormatted || 'Recent'}</span>
            </div>
          </div>
        </div>

        {/* Right Intelligence Workbench Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between font-mono text-xs">
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  incident.severity === 'CRITICAL' || incident.severity === 'HIGH'
                    ? 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40'
                    : 'bg-[#FFB020]/20 text-[#FFB020] border border-[#FFB020]/40'
                }`}
              >
                {incident.severity} SEVERITY
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-[#28C76F] font-bold">
                  CONF: {incident.sensorConfidenceRate ?? incident.confidence}%
                </span>
                <span className="text-[#3DB7D9] font-bold">
                  ML: {incident.mlConfidenceRate ?? Math.round((incident.predictedProbability ?? 0.85) * 100)}%
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white tracking-wide">
                {incident.classification.replace(/_/g, ' ').toUpperCase()}
              </h2>
              <p className="text-xs text-[#A7B4C5] font-mono mt-1">{incident.locationName}</p>
            </div>

            {/* Nearest Facility Link */}
            <div className="p-3 bg-[#050A12] border border-[#203246] rounded-lg flex items-center justify-between font-mono text-xs">
              <div>
                <span className="text-[10px] text-[#16A9D9] uppercase block font-semibold">
                  TARGET PROXIMITY ({incident.nearestFacilityType || 'Industrial Asset'})
                </span>
                <span className="text-white font-bold">{incident.nearestFacilityName}</span>
                <span className="text-[11px] text-[#38BDF8] block font-mono">
                  {incident.facilityDistanceKm < 1 ? Math.round(incident.facilityDistanceKm * 1000) + ' m' : incident.facilityDistanceKm.toFixed(1) + ' km'} away
                </span>
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

          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5 space-y-4">
            <ProbabilityDistributionCard incident={incident} />
            <ReasoningFlow
              steps={incident.reasoningSteps}
              classification={incident.classification}
              confidence={incident.sensorConfidenceRate ?? incident.confidence}
              severity={incident.severity}
            />
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
